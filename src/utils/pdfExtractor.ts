import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import zlib from 'zlib';
import { parseInvoiceText } from './invoiceParser.ts';
import type { FileExtractionResult } from '../types/invoice.ts';

let sharedOcrWorkerPromise: Promise<Tesseract.Worker> | null = null;

async function getOcrWorker(): Promise<Tesseract.Worker> {
  if (!sharedOcrWorkerPromise) {
    sharedOcrWorkerPromise = Tesseract.createWorker('eng');
  }
  return sharedOcrWorkerPromise;
}

/**
 * Extracts text from a PDF buffer using pdfjs-dist across all pages,
 * sorting text items by vertical (Y) and horizontal (X) coordinates to preserve line & table structure.
 * Inserts tab ('\t') delimiters between distinct horizontal table columns so keyless 2-column and
 * multi-column tables (such as ESIC Challans, D&I statements, and tabular invoices) parse accurately.
 * Falls back to Sharp + Tesseract.js OCR if the PDF contains scanned image streams with no selectable text.
 */
export async function extractInvoiceFromPdfBuffer(
  buffer: Buffer | Uint8Array,
  filename: string
): Promise<FileExtractionResult> {
  try {
    const uint8 = buffer instanceof Uint8Array ? new Uint8Array(buffer) : new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({
      data: uint8,
      useSystemFonts: true,
      disableFontFace: true,
      verbosity: 0,
    });

    const pdfDocument = await loadingTask.promise;
    const numPages = pdfDocument.numPages;
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();

      interface PositionedItem {
        str: string;
        x: number;
        y: number;
        width: number;
      }

      const items: PositionedItem[] = [];
      for (const rawItem of textContent.items) {
        if ('str' in rawItem && rawItem.str.trim().length > 0) {
          const transform = rawItem.transform;
          const x = transform ? transform[4] : 0;
          const y = transform ? transform[5] : 0;
          const width =
            'width' in rawItem && typeof rawItem.width === 'number' && rawItem.width > 0
              ? rawItem.width
              : rawItem.str.length * 4.5;
          items.push({ str: rawItem.str.trim(), x, y, width });
        }
      }

      // Group items by approximate Y coordinate (within 4pt tolerance) from top to bottom
      items.sort((a, b) => {
        if (Math.abs(b.y - a.y) > 4) {
          return b.y - a.y;
        }
        return a.x - b.x;
      });

      const lines: string[] = [];
      let currentLineItems: PositionedItem[] = [];
      let currentY: number | null = null;

      const flushLine = (lineItems: PositionedItem[]) => {
        if (lineItems.length === 0) return;
        lineItems.sort((a, b) => a.x - b.x);
        let built = lineItems[0].str;
        let prevRight = lineItems[0].x + lineItems[0].width;

        for (let i = 1; i < lineItems.length; i++) {
          const curr = lineItems[i];
          const gap = curr.x - prevRight;
          // Separate distinct table columns by tab (\t) when horizontal gap > 12pt
          if (gap > 12) {
            built += `\t${curr.str}`;
          } else {
            built += ` ${curr.str}`;
          }
          prevRight = Math.max(prevRight, curr.x + curr.width);
        }
        lines.push(built);
      };

      for (const item of items) {
        if (currentY === null || Math.abs(item.y - currentY) <= 4) {
          currentLineItems.push(item);
          if (currentY === null) currentY = item.y;
        } else {
          flushLine(currentLineItems);
          currentLineItems = [item];
          currentY = item.y;
        }
      }
      flushLine(currentLineItems);

      pageTexts.push(lines.join('\n'));
    }

    let combinedText = pageTexts.join('\n').trim();
    let method: 'digital-text' | 'ocr' = 'digital-text';

    // If digital text is missing or very sparse (scanned/image-based PDF), run OCR pipeline via Sharp + Tesseract.js
    if (combinedText.length < 20) {
      method = 'ocr';
      const ocrText = await attemptOcrOnPdfOrImage(uint8);
      if (ocrText.trim().length > 0) {
        combinedText = ocrText;
      }
    }

    const parsed = parseInvoiceText(combinedText, filename, method);

    return {
      filename,
      status: 'success',
      rows: parsed.rows,
      additionalFields: parsed.additionalFields,
      pageCount: numPages,
      method,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Failed to parse PDF document';
    return {
      filename,
      status: 'error',
      errorMessage: errMsg,
      rows: [],
      additionalFields: [],
      pageCount: 0,
      method: 'digital-text',
    };
  }
}

async function attemptOcrOnPdfOrImage(data: Uint8Array): Promise<string> {
  try {
    const buf = Buffer.from(data);
    let imageBuffer: Buffer | null = null;

    // 1. Check for embedded JPEG stream
    const jpegStart = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
    const jpegEnd = buf.lastIndexOf(Buffer.from([0xff, 0xd9]));
    if (jpegStart !== -1 && jpegEnd !== -1 && jpegEnd > jpegStart) {
      imageBuffer = buf.subarray(jpegStart, jpegEnd + 2);
    }

    // 2. Check for embedded PNG stream
    if (!imageBuffer) {
      const pngStart = buf.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      const pngEnd = buf.indexOf(Buffer.from('IEND'));
      if (pngStart !== -1 && pngEnd !== -1 && pngEnd > pngStart) {
        imageBuffer = buf.subarray(pngStart, pngEnd + 8);
      }
    }

    // 3. Check for FlateDecode raw raster image stream in scanned PDFs
    if (!imageBuffer) {
      imageBuffer = await extractFlateDecodeImageFromPdf(buf);
    }

    if (!imageBuffer) {
      return '';
    }

    const preprocessed = await sharp(imageBuffer)
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();

    const worker = await getOcrWorker();
    const result = await worker.recognize(preprocessed);
    return result.data.text || '';
  } catch {
    return '';
  }
}

async function extractFlateDecodeImageFromPdf(buf: Buffer): Promise<Buffer | null> {
  try {
    const ascii = buf.toString('latin1');
    const imgMatch = ascii.match(
      /\/Subtype\s*\/Image[\s\S]{1,400}?\/Width\s+(\d+)[\s\S]{1,200}?\/Height\s+(\d+)/
    );
    if (!imgMatch) return null;

    const width = parseInt(imgMatch[1], 10);
    const height = parseInt(imgMatch[2], 10);
    if (!width || !height || width < 50 || height < 50) return null;

    const matchIdx = imgMatch.index || 0;
    const streamKeywordIdx = ascii.indexOf('stream', matchIdx);
    const endstreamKeywordIdx = ascii.indexOf('endstream', streamKeywordIdx);
    if (streamKeywordIdx === -1 || endstreamKeywordIdx === -1) return null;

    let dataStart = streamKeywordIdx + 6;
    if (buf[dataStart] === 0x0d && buf[dataStart + 1] === 0x0a) dataStart += 2;
    else if (buf[dataStart] === 0x0a || buf[dataStart] === 0x0d) dataStart += 1;

    let dataEnd = endstreamKeywordIdx;
    while (dataEnd > dataStart && (buf[dataEnd - 1] === 0x0a || buf[dataEnd - 1] === 0x0d)) {
      dataEnd--;
    }

    const compressed = buf.subarray(dataStart, dataEnd);
    const inflated = zlib.inflateSync(compressed);

    const pixelCount = width * height;
    let channels: 1 | 3 | 4 = 3;
    if (inflated.length === pixelCount) channels = 1;
    else if (inflated.length === pixelCount * 3) channels = 3;
    else if (inflated.length === pixelCount * 4) channels = 4;
    else return null;

    return await sharp(inflated, {
      raw: { width, height, channels },
    })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}
