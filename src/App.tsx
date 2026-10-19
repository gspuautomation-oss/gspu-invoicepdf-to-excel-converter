/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  CloudUpload,
  FileText,
  X,
  ArrowRight,
  Loader2,
  Files,
  Trash2,
  Plus,
  FolderArchive,
} from 'lucide-react';
import type {
  InvoiceLineItemRow,
  AdditionalFieldEntry,
  FileExtractionResult,
  BatchExtractionResponse,
} from './types/invoice';
import { SpreadsheetEditor } from './components/SpreadsheetEditor';
import { PdfPreviewModal } from './components/PdfPreviewModal';
import { IconButton } from './components/IconButton';
import { GspuLogo } from './components/GspuLogo';
import { BubbleRainbowCanvas } from './components/BubbleRainbowCanvas';
import {
  LeftInvoiceIllustration,
  RightExcelIllustration,
} from './components/WorkflowIllustrations';

export const MAX_PDF_FILES = 20;

interface QueuedPdfFile {
  id: string;
  file: File;
  status: 'queued' | 'processing' | 'done' | 'error';
  errorMessage?: string;
}

export default function App() {
  const [queuedFiles, setQueuedFiles] = useState<QueuedPdfFile[]>([]);
  const [duplicateAlertCount, setDuplicateAlertCount] = useState(0);
  const [limitReachedAlert, setLimitReachedAlert] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isLoadingSamples, setIsLoadingSamples] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  // Extracted state
  const [viewMode, setViewMode] = useState<'upload' | 'editor'>('upload');
  const [extractedRows, setExtractedRows] = useState<InvoiceLineItemRow[]>([]);
  const [additionalFields, setAdditionalFields] = useState<AdditionalFieldEntry[]>([]);

  // PDF Preview Modal State
  const [previewFilename, setPreviewFilename] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFilesToQueue = useCallback((incomingFiles: FileList | File[]) => {
    const fileArray = Array.from(incomingFiles).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );

    if (fileArray.length === 0) return;

    let duplicatesFound = 0;
    let cappedByLimit = false;

    setQueuedFiles((prev) => {
      const existingKeys = new Set(
        prev.map((item) => `${item.file.name.toLowerCase()}__${item.file.size}`)
      );
      const next = [...prev];

      for (const file of fileArray) {
        if (next.length >= MAX_PDF_FILES) {
          cappedByLimit = true;
          break;
        }
        const key = `${file.name.toLowerCase()}__${file.size}`;
        if (existingKeys.has(key)) {
          duplicatesFound++;
          continue;
        }
        existingKeys.add(key);
        next.push({
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          file,
          status: 'queued',
        });
      }
      return next;
    });

    if (duplicatesFound > 0) {
      setDuplicateAlertCount(duplicatesFound);
      setTimeout(() => setDuplicateAlertCount(0), 2500);
    }

    if (cappedByLimit) {
      setLimitReachedAlert(true);
      setTimeout(() => setLimitReachedAlert(false), 3000);
    }
  }, []);

  const handleLoadSamplePdfs = useCallback(async () => {
    if (isLoadingSamples || isExtracting) return;
    setIsLoadingSamples(true);
    try {
      const res = await fetch('/api/sample-pdfs');
      if (!res.ok) throw new Error('Failed to load sample PDFs');
      const data = (await res.json()) as {
        files: Array<{ filename: string; base64: string }>;
      };

      const generatedFiles: File[] = data.files.slice(0, MAX_PDF_FILES).map((item) => {
        const binaryStr = atob(item.base64);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        return new File([bytes], item.filename, { type: 'application/pdf' });
      });

      addFilesToQueue(generatedFiles);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingSamples(false);
    }
  }, [isLoadingSamples, isExtracting, addFilesToQueue]);

  // Support ?autostart=1 to load sample PDFs automatically if requested
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1' && queuedFiles.length === 0) {
      handleLoadSamplePdfs();
    }
  }, [handleLoadSamplePdfs, queuedFiles.length]);

  const handleRemoveFile = useCallback((id: string) => {
    setQueuedFiles((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleClearQueue = useCallback(() => {
    setQueuedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const runBatchExtraction = useCallback(
    async (filesToProcess: QueuedPdfFile[]) => {
      if (filesToProcess.length === 0 || isExtracting) return;
      const cappedFiles = filesToProcess.slice(0, MAX_PDF_FILES);
      setIsExtracting(true);
      setProgress({ current: 0, total: cappedFiles.length });

      const newRows: InvoiceLineItemRow[] = [];
      const newExtraFields: AdditionalFieldEntry[] = [];
      const statusMap = new Map<string, { status: 'done' | 'error'; error?: string }>();

      // Send all files (up to 20) in a single fast parallel request so all PDFs extract simultaneously
      const formData = new FormData();
      cappedFiles.forEach((q) => formData.append('pdfs', q.file, q.file.name));

      try {
        const response = await fetch('/api/extract', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('Batch request failed');
        }

        const payload = (await response.json()) as BatchExtractionResponse;
        const resultByFilename = new Map<string, FileExtractionResult>();
        payload.results.forEach((r) => resultByFilename.set(r.filename, r));

        for (const q of cappedFiles) {
          const res = resultByFilename.get(q.file.name);
          if (res && res.status === 'success') {
            statusMap.set(q.id, { status: 'done' });
          } else {
            statusMap.set(q.id, {
              status: 'error',
              error: res?.errorMessage || 'Extraction failed',
            });
          }
        }

        newRows.push(...payload.rows);
        newExtraFields.push(...payload.additionalFields);
      } catch (err) {
        for (const q of cappedFiles) {
          statusMap.set(q.id, {
            status: 'error',
            error: err instanceof Error ? err.message : 'Failed',
          });
        }
      }

      setProgress({
        current: cappedFiles.length,
        total: cappedFiles.length,
      });

      setQueuedFiles((prev) =>
        prev.map((q) => {
          const updated = statusMap.get(q.id);
          if (!updated) return q;
          return {
            ...q,
            status: updated.status,
            errorMessage: updated.error,
          };
        })
      );

      if (newRows.length > 0) {
        setExtractedRows((prev) => {
          const existingSignatures = new Set(
            prev.map(
              (r) =>
                `${r.pdfFilename}|${r.invoiceNumber}|${r.serialNumber}|${r.description}|${r.totalLineAmount}|${r.otherInfo}`
            )
          );
          const deduped = newRows.filter((r) => {
            const sig = `${r.pdfFilename}|${r.invoiceNumber}|${r.serialNumber}|${r.description}|${r.totalLineAmount}|${r.otherInfo}`;
            if (existingSignatures.has(sig)) return false;
            existingSignatures.add(sig);
            return true;
          });
          return [...prev, ...deduped];
        });
        setAdditionalFields((prev) => [...prev, ...newExtraFields]);
        setViewMode('editor');
      }

      setIsExtracting(false);
    },
    [isExtracting]
  );

  const handleExtractClick = useCallback(() => {
    const pending = queuedFiles.filter((f) => f.status !== 'done');
    const targets = pending.length > 0 ? pending : queuedFiles;
    runBatchExtraction(targets);
  }, [queuedFiles, runBatchExtraction]);

  const handleRetryFailed = useCallback(() => {
    const failed = queuedFiles.filter((f) => f.status === 'error');
    if (failed.length > 0) {
      runBatchExtraction(failed);
    }
  }, [queuedFiles, runBatchExtraction]);

  const handlePreviewPdf = useCallback(
    (filename: string) => {
      const found = queuedFiles.find((q) => q.file.name === filename);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      if (found) {
        const objUrl = URL.createObjectURL(found.file);
        setPreviewUrl(objUrl);
      } else {
        setPreviewUrl(null);
      }
      setPreviewFilename(filename);
    },
    [queuedFiles, previewUrl]
  );

  const handleClosePreview = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setPreviewFilename(null);
  }, [previewUrl]);

  const handleResetAll = useCallback(() => {
    setQueuedFiles([]);
    setExtractedRows([]);
    setAdditionalFields([]);
    setViewMode('upload');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const failedCount = queuedFiles.filter((f) => f.status === 'error').length;

  return (
    <main className="relative min-h-screen w-full bg-[#FAFCFF] text-[#0F172A] flex flex-col justify-center overflow-hidden">
      {/* Top-Left Soft Blue Wave & Bottom-Right Soft Mint Wave matching reference design */}
      <svg
        className="fixed top-0 left-0 w-72 sm:w-96 h-72 sm:h-96 pointer-events-none select-none z-0"
        viewBox="0 0 400 400"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M0 0 H340 C275 85, 225 140, 145 190 C75 235, 35 280, 0 350 Z"
          fill="url(#topLeftBlueWave)"
        />
        <defs>
          <linearGradient id="topLeftBlueWave" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#D6E6FF" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#EBF3FF" stopOpacity="0.2" />
          </linearGradient>
        </defs>
      </svg>

      <svg
        className="fixed bottom-0 right-0 w-80 sm:w-[440px] h-72 sm:h-96 pointer-events-none select-none z-0"
        viewBox="0 0 440 380"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M440 380 H80 C150 290, 210 240, 300 190 C365 155, 410 110, 440 40 Z"
          fill="url(#bottomRightGreenWave)"
        />
        <defs>
          <linearGradient id="bottomRightGreenWave" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#BBF7D0" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#DCFCE7" stopOpacity="0.25" />
          </linearGradient>
        </defs>
      </svg>

      {/* Interactive Bubble & Rainbow Fog Burst Canvas Overlay */}
      <BubbleRainbowCanvas />

      {/* Hidden Multi-PDF Input supporting up to 20 PDFs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            addFilesToQueue(e.target.files);
            e.target.value = '';
          }
        }}
        className="sr-only"
        aria-label="Upload PDF invoices"
        data-testid="pdf-file-input"
      />

      {viewMode === 'upload' ? (
        <div className="relative z-20 w-full max-w-6xl mx-auto px-4 sm:px-8 py-8 flex flex-col items-center">
          {/* Top Company Logo with Pop-Up Effect on Cursor Touch */}
          <div className="mb-4 sm:mb-6">
            <GspuLogo />
          </div>

          {/* 1. Large, elegant heading: Hi There... + Subtitle */}
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-2.5 select-none text-center">
            <span className="text-[#0B192C]">Hi </span>
            <span className="text-[#0B6EFD]">There...</span>
          </h1>
          <p className="text-sm sm:text-base text-slate-500 font-medium mb-7 text-center select-none">
            Convert your Invoice PDFs to Excel in seconds
          </p>

          {/* Centerpiece Layout: Left PDF Stack Illustration + Central Upload Box + Right Excel Sheet Illustration */}
          <div className="w-full flex items-center justify-center gap-2 xl:gap-4">
            <LeftInvoiceIllustration />

            {/* Central Upload Column */}
            <div className="w-full max-w-xl flex flex-col items-center">
              {/* 2. PDF Upload Card matching GSPU reference design */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    addFilesToQueue(e.dataTransfer.files);
                  }
                }}
                className={`w-full rounded-3xl bg-[#F4F9FF]/95 backdrop-blur-xs border-2 border-dashed transition-all duration-200 shadow-[0_12px_36px_rgba(11,110,253,0.06)] px-6 sm:px-8 py-8 flex flex-col items-center justify-center ${
                  isDragging
                    ? 'border-[#0B6EFD] bg-blue-50/80 scale-[1.01]'
                    : 'border-[#B8D4FE] hover:border-[#0B6EFD]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={queuedFiles.length >= MAX_PDF_FILES}
                  aria-label="Select PDF invoices to upload (Max 20 PDFs)"
                  title="Select PDF invoices (Max 20 PDFs)"
                  data-testid="upload-dropzone-btn"
                  className="group flex flex-col items-center justify-center w-full py-3 cursor-pointer focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-20 h-20 rounded-full bg-[#E6F0FF] flex items-center justify-center text-[#0B6EFD] group-hover:bg-[#0B6EFD] group-hover:text-white group-hover:scale-105 transition-all duration-200 shadow-xs mb-4">
                    <CloudUpload className="w-10 h-10 stroke-[2]" />
                  </div>
                  <span className="text-lg sm:text-xl font-bold text-[#0B192C] tracking-tight">
                    Upload Invoice PDFs
                  </span>
                  <span className="text-xs sm:text-sm text-slate-500 mt-1">
                    Select or drag &amp; drop up to {MAX_PDF_FILES} PDF files
                  </span>
                </button>

                {/* Minimal Uploaded Filename List (when files are selected) */}
                {queuedFiles.length > 0 && (
                  <div
                    className="w-full mt-4 pt-4 border-t border-blue-200/60 max-h-48 overflow-y-auto space-y-1.5 pr-1"
                    data-testid="uploaded-files-list"
                  >
                    {queuedFiles.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-white/95 hover:bg-white border border-blue-100 text-xs transition-colors shadow-2xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText
                            className={`w-4 h-4 shrink-0 ${
                              item.status === 'error' ? 'text-red-500' : 'text-[#0B6EFD]'
                            }`}
                          />
                          <span className="truncate font-medium text-slate-800">
                            {item.file.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(item.id)}
                          disabled={isExtracting}
                          aria-label={`Remove ${item.file.name}`}
                          title={`Remove ${item.file.name}`}
                          className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. Small PDF File Counter (0 / 20 PDFs) & 4. Royal Blue Arrow Extract Button */}
              <div className="w-full mt-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div
                    className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white border border-slate-200/90 text-xs sm:text-sm font-semibold text-slate-700 shadow-xs font-mono-tabular"
                    data-testid="pdf-file-counter"
                    aria-live="polite"
                  >
                    <FileText className="w-4 h-4 text-[#0B192C] stroke-[2]" />
                    <span>
                      {queuedFiles.length} / {MAX_PDF_FILES} PDFs
                    </span>
                    {duplicateAlertCount > 0 && (
                      <span className="text-amber-600 font-normal text-xs">
                        · {duplicateAlertCount} dup skipped
                      </span>
                    )}
                    {limitReachedAlert && (
                      <span className="text-amber-600 font-normal text-xs">
                        · Max {MAX_PDF_FILES}
                      </span>
                    )}
                  </div>

                  {/* Add more PDFs icon button */}
                  {queuedFiles.length > 0 && queuedFiles.length < MAX_PDF_FILES && (
                    <IconButton
                      label="Add more PDFs (Max 20)"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isExtracting}
                    >
                      <Plus className="w-4 h-4" />
                    </IconButton>
                  )}

                  {/* Load 20 Sample PDFs icon button for instant batch testing */}
                  <IconButton
                    label="Load 20 Sample PDFs"
                    onClick={handleLoadSamplePdfs}
                    disabled={
                      isExtracting || isLoadingSamples || queuedFiles.length >= MAX_PDF_FILES
                    }
                    data-testid="load-15-samples-btn"
                  >
                    {isLoadingSamples ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#0B6EFD]" />
                    ) : (
                      <Files className="w-4 h-4" />
                    )}
                  </IconButton>

                  {/* Download Portable App ZIP for running on another PC */}
                  <IconButton
                    label="Download App ZIP (GSPU_Invoice_PDF_to_Excel_Converter.zip)"
                    disabled={isDownloadingZip}
                    onClick={async () => {
                      if (isDownloadingZip) return;
                      setIsDownloadingZip(true);
                      try {
                        const res = await fetch('/api/download-app-zip?format=base64');
                        if (!res.ok) throw new Error('Failed to fetch application ZIP');
                        const data = (await res.json()) as {
                          filename: string;
                          base64: string;
                        };
                        const binaryStr = atob(data.base64);
                        const len = binaryStr.length;
                        const bytes = new Uint8Array(len);
                        for (let i = 0; i < len; i++) {
                          bytes[i] = binaryStr.charCodeAt(i);
                        }
                        const blob = new Blob([bytes], { type: 'application/zip' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = data.filename || 'GSPU_Invoice_PDF_to_Excel_Converter.zip';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        setTimeout(() => URL.revokeObjectURL(url), 3000);
                      } catch (err) {
                        console.error('ZIP download failed:', err);
                      } finally {
                        setIsDownloadingZip(false);
                      }
                    }}
                    data-testid="download-app-zip-btn"
                  >
                    {isDownloadingZip ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#0B6EFD]" />
                    ) : (
                      <FolderArchive className="w-4 h-4 text-[#0B6EFD]" />
                    )}
                  </IconButton>

                  {queuedFiles.length > 0 && (
                    <IconButton
                      label="Clear all selected PDFs"
                      variant="danger"
                      onClick={handleClearQueue}
                      disabled={isExtracting}
                    >
                      <Trash2 className="w-4 h-4" />
                    </IconButton>
                  )}
                </div>

                {/* 4. Vibrant Royal-Blue Extract Button */}
                <button
                  type="button"
                  aria-label="Extract invoice data"
                  title="Extract invoice data"
                  onClick={handleExtractClick}
                  disabled={queuedFiles.length === 0 || isExtracting}
                  data-testid="extract-pdfs-btn"
                  className="w-14 h-12 rounded-2xl bg-[#0B6EFD] hover:bg-[#095ED9] text-white flex items-center justify-center shadow-[0_10px_24px_rgba(11,110,253,0.35)] hover:shadow-[0_12px_28px_rgba(11,110,253,0.45)] transition-all duration-150 cursor-pointer disabled:opacity-45 disabled:shadow-none disabled:cursor-not-allowed"
                >
                  {isExtracting ? (
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                  ) : (
                    <ArrowRight className="w-5 h-5 stroke-[2.25]" />
                  )}
                </button>
              </div>

              {/* 5. Clean and subtle progress indicator when processing begins */}
              {isExtracting && (
                <div
                  className="w-full mt-5 space-y-1.5"
                  role="status"
                  aria-label="Extracting PDF invoices"
                  data-testid="extraction-progress"
                >
                  <div className="h-1.5 w-full bg-blue-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#0B6EFD] transition-all duration-200 rounded-full"
                      style={{
                        width: `${
                          progress.total > 0
                            ? Math.max(15, Math.round((progress.current / progress.total) * 100))
                            : 25
                        }%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-end font-mono-tabular text-[11px] text-slate-500">
                    {progress.current} / {progress.total}
                  </div>
                </div>
              )}
            </div>

            <RightExcelIllustration />
          </div>
        </div>
      ) : (
        <div className="relative z-20 flex flex-col w-full h-screen py-2">
          {/* Top Compact GSPU Logo with Hover Pop-Up in Editor Mode */}
          <div className="w-full flex justify-center pt-1">
            <GspuLogo compact />
          </div>
          <div className="flex-1 min-h-0">
            <SpreadsheetEditor
              rows={extractedRows}
              additionalFields={additionalFields}
              onChangeRows={setExtractedRows}
              onPreviewPdf={handlePreviewPdf}
              onAddMorePdfs={() => setViewMode('upload')}
              onResetAll={handleResetAll}
              failedFilesCount={failedCount}
              onRetryFailed={handleRetryFailed}
            />
          </div>
        </div>
      )}

      {/* Original PDF Preview Modal */}
      <PdfPreviewModal
        isOpen={Boolean(previewFilename)}
        onClose={handleClosePreview}
        filename={previewFilename || ''}
        pdfObjectUrl={previewUrl}
        invoiceRows={extractedRows.filter((r) => r.pdfFilename === previewFilename)}
      />
    </main>
  );
}
