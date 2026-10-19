import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { extractInvoiceFromPdfBuffer } from './src/utils/pdfExtractor.ts';
import { buildInvoiceExcelWorkbook } from './src/utils/excelBuilder.ts';
import { buildProjectZipArchive } from './src/utils/zipBuilder.ts';
import {
  SAMPLE_INVOICE_BLUEPRINTS,
  generateInvoicePdfBytes,
} from './src/utils/samplePdfGenerator.ts';
import type {
  InvoiceLineItemRow,
  AdditionalFieldEntry,
  FileExtractionResult,
} from './src/types/invoice.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const MAX_PDF_UPLOAD_LIMIT = 20;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per PDF
    files: MAX_PDF_UPLOAD_LIMIT, // Max 20 PDFs per batch
  },
});

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || '0.0.0.0';

  app.use(express.json({ limit: '50mb' }));

  // API: Health Check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', maxPdfLimit: MAX_PDF_UPLOAD_LIMIT });
  });

  // API: Download complete portable Application ZIP for running on another PC
  app.get('/api/download-app-zip', (req, res) => {
    try {
      const zipBuffer = buildProjectZipArchive(__dirname);
      if (req.query.format === 'base64') {
        res.json({
          filename: 'GSPU_Invoice_PDF_to_Excel_Converter.zip',
          base64: zipBuffer.toString('base64'),
          size: zipBuffer.length,
        });
        return;
      }
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Length', String(zipBuffer.length));
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="GSPU_Invoice_PDF_to_Excel_Converter.zip"'
      );
      res.end(zipBuffer);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to build application ZIP',
      });
    }
  });

  // API: Generate 20 real sample PDF invoices for instant batch testing
  app.get('/api/sample-pdfs', async (_req, res) => {
    try {
      const blueprints = SAMPLE_INVOICE_BLUEPRINTS.slice(0, MAX_PDF_UPLOAD_LIMIT);
      const files = await Promise.all(
        blueprints.map(async (bp) => {
          const bytes = await generateInvoicePdfBytes(bp);
          return {
            filename: bp.filename,
            base64: Buffer.from(bytes).toString('base64'),
          };
        })
      );
      res.json({ files });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to generate sample PDFs',
      });
    }
  });

  // API: Extract all invoice details from uploaded PDFs concurrently (Max 20 PDFs)
  app.post('/api/extract', upload.array('pdfs', MAX_PDF_UPLOAD_LIMIT), async (req, res) => {
    try {
      const files = ((req.files as Express.Multer.File[]) || []).slice(0, MAX_PDF_UPLOAD_LIMIT);
      if (files.length === 0) {
        res.status(400).json({ error: 'No PDF files provided.' });
        return;
      }

      // Extract all uploaded PDFs in parallel for maximum speed
      const results: FileExtractionResult[] = await Promise.all(
        files.map((file) => extractInvoiceFromPdfBuffer(file.buffer, file.originalname))
      );

      const allRows: InvoiceLineItemRow[] = [];
      const allAdditionalFields: AdditionalFieldEntry[] = [];
      const seenRowSignatures = new Set<string>();

      for (const result of results) {
        if (result.status === 'success') {
          for (const row of result.rows) {
            const signature = `${row.pdfFilename}|${row.invoiceNumber}|${row.serialNumber}|${row.description}|${row.totalLineAmount}|${row.otherInfo}`;
            if (!seenRowSignatures.has(signature)) {
              seenRowSignatures.add(signature);
              allRows.push(row);
            }
          }
          allAdditionalFields.push(...result.additionalFields);
        }
      }

      res.json({
        results,
        rows: allRows,
        additionalFields: allAdditionalFields,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Batch extraction failed.',
      });
    }
  });

  // API: Generate consolidated Excel workbook (NO SUMMARY SHEET)
  app.post('/api/export-excel', async (req, res) => {
    try {
      const { rows, additionalFields } = req.body as {
        rows: InvoiceLineItemRow[];
        additionalFields?: AdditionalFieldEntry[];
      };

      if (!Array.isArray(rows)) {
        res.status(400).json({ error: 'Invalid rows payload.' });
        return;
      }

      const workbook = await buildInvoiceExcelWorkbook(rows, additionalFields || []);
      const buffer = await workbook.xlsx.writeBuffer();

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="Invoice_Extracted_Data.xlsx"'
      );
      res.send(Buffer.from(buffer));
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Excel generation failed.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(
      `Invoice to Excel Converter running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`
    );
  });
}

startServer();
