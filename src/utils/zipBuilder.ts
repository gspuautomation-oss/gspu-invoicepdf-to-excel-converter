import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

interface ZipEntryInput {
  relativePath: string;
  content: Buffer;
}

function computeCrc32(buf: Buffer): number {
  if (typeof zlib.crc32 === 'function') {
    return zlib.crc32(buf) >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Builds a standards-compliant PKZIP archive Buffer compatible with WinRAR, 7-Zip, and Windows Explorer.
 */
export function createZipBuffer(entries: ZipEntryInput[]): Buffer {
  const localFileChunks: Buffer[] = [];
  const centralDirChunks: Buffer[] = [];
  let offset = 0;

  // Valid MS-DOS date/time (e.g., 2026-10-18 12:00:00)
  const dosTime = (12 << 11) | (0 << 5) | 0;
  const dosDate = ((2026 - 1980) << 9) | (10 << 5) | 18;
  // Bit 11 (0x0800) indicates UTF-8 filename encoding per PKWARE specification
  const utf8Flag = 0x0800;

  for (const entry of entries) {
    const normalizedPath = entry.relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const fileNameBuf = Buffer.from(normalizedPath, 'utf8');
    const uncompressedData = entry.content;
    const compressedData = zlib.deflateRawSync(uncompressedData, {
      level: zlib.constants.Z_DEFAULT_COMPRESSION,
    });
    const crc = computeCrc32(uncompressedData);

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30 + fileNameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature (PK\x03\x04)
    localHeader.writeUInt16LE(20, 4); // Version needed to extract (2.0)
    localHeader.writeUInt16LE(utf8Flag, 6); // General purpose bit flag (UTF-8)
    localHeader.writeUInt16LE(8, 8); // Compression method: 8 (Deflate)
    localHeader.writeUInt16LE(dosTime, 10); // Last mod file time
    localHeader.writeUInt16LE(dosDate, 12); // Last mod file date
    localHeader.writeUInt32LE(crc, 14); // CRC-32
    localHeader.writeUInt32LE(compressedData.length, 18); // Compressed size
    localHeader.writeUInt32LE(uncompressedData.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(fileNameBuf.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28); // Extra field length
    fileNameBuf.copy(localHeader, 30);

    localFileChunks.push(localHeader, compressedData);

    // Central directory file header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46 + fileNameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central file header signature (PK\x01\x02)
    centralHeader.writeUInt16LE(20, 4); // Version made by (MS-DOS / FAT compatible 2.0)
    centralHeader.writeUInt16LE(20, 6); // Version needed to extract (2.0)
    centralHeader.writeUInt16LE(utf8Flag, 8); // General purpose bit flag (UTF-8)
    centralHeader.writeUInt16LE(8, 10); // Compression method: 8 (Deflate)
    centralHeader.writeUInt16LE(dosTime, 12); // Last mod file time
    centralHeader.writeUInt16LE(dosDate, 14); // Last mod file date
    centralHeader.writeUInt32LE(crc, 16); // CRC-32
    centralHeader.writeUInt32LE(compressedData.length, 20); // Compressed size
    centralHeader.writeUInt32LE(uncompressedData.length, 24); // Uncompressed size
    centralHeader.writeUInt16LE(fileNameBuf.length, 28); // File name length
    centralHeader.writeUInt16LE(0, 30); // Extra field length
    centralHeader.writeUInt16LE(0, 32); // File comment length
    centralHeader.writeUInt16LE(0, 34); // Disk number start
    centralHeader.writeUInt16LE(0, 36); // Internal file attributes
    centralHeader.writeUInt32LE(0x20, 38); // External file attributes (Archive bit 0x20 for Windows/WinRAR)
    centralHeader.writeUInt32LE(offset, 42); // Relative offset of local header
    fileNameBuf.copy(centralHeader, 46);

    centralDirChunks.push(centralHeader);
    offset += localHeader.length + compressedData.length;
  }

  const centralDirBuffer = Buffer.concat(centralDirChunks);
  const endOfCentralDir = Buffer.alloc(22);
  endOfCentralDir.writeUInt32LE(0x06054b50, 0); // End of central dir signature (PK\x05\x06)
  endOfCentralDir.writeUInt16LE(0, 4); // Number of this disk
  endOfCentralDir.writeUInt16LE(0, 6); // Disk where central directory starts
  endOfCentralDir.writeUInt16LE(entries.length, 8); // Number of central directory records on this disk
  endOfCentralDir.writeUInt16LE(entries.length, 10); // Total number of central directory records
  endOfCentralDir.writeUInt32LE(centralDirBuffer.length, 12); // Size of central directory
  endOfCentralDir.writeUInt32LE(offset, 16); // Offset of start of central directory
  endOfCentralDir.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([...localFileChunks, centralDirBuffer, endOfCentralDir]);
}

function collectDirectoryFiles(dirPath: string, rootDir: string, out: ZipEntryInput[]) {
  if (!fs.existsSync(dirPath)) return;
  const items = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);
    if (item.isDirectory()) {
      collectDirectoryFiles(fullPath, rootDir, out);
    } else if (item.isFile()) {
      const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/');
      out.push({
        relativePath: `GSPU_Invoice_PDF_to_Excel_Converter/${rel}`,
        content: fs.readFileSync(fullPath),
      });
    }
  }
}

/**
 * Packages the entire application source code, startup scripts, and documentation
 * into a ready-to-run ZIP buffer for use on any other computer.
 */
export function buildProjectZipArchive(rootDir: string): Buffer {
  const topLevelFiles = [
    'package.json',
    '.npmrc',
    'tsconfig.json',
    'vite.config.ts',
    'index.html',
    'metadata.json',
    '.env.example',
    '.gitignore',
    'server.ts',
    'START_APP.bat',
    'README.md',
  ];

  const entries: ZipEntryInput[] = [];

  for (const filename of topLevelFiles) {
    const fullPath = path.join(rootDir, filename);
    if (fs.existsSync(fullPath)) {
      let content = fs.readFileSync(fullPath);
      // Ensure Windows batch script always has CRLF line endings for cmd.exe
      if (filename.endsWith('.bat')) {
        const text = content.toString('utf8').replace(/\r?\n/g, '\r\n');
        content = Buffer.from(text, 'utf8');
      }
      entries.push({
        relativePath: `GSPU_Invoice_PDF_to_Excel_Converter/${filename}`,
        content,
      });
    }
  }

  collectDirectoryFiles(path.join(rootDir, 'src'), rootDir, entries);

  return createZipBuffer(entries);
}
