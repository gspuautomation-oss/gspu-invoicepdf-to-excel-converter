import React, { useState, useMemo, useRef, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type CellValueChangedEvent,
  type ICellRendererParams,
} from 'ag-grid-community';
import {
  Download,
  Plus,
  Trash2,
  Undo2,
  Redo2,
  Search,
  Eye,
  AlertTriangle,
  Upload,
  RotateCcw,
  X,
  Check,
} from 'lucide-react';
import type { InvoiceLineItemRow, AdditionalFieldEntry } from '../types/invoice';
import { resolveActiveColumns, getRowCellValue } from '../utils/excelBuilder';
import { validateInvoiceRow, createEmptyInvoiceRow } from '../utils/invoiceParser';
import { IconButton } from './IconButton';

ModuleRegistry.registerModules([AllCommunityModule]);

const gridTheme = themeQuartz.withParams({
  backgroundColor: '#FFFFFF',
  headerBackgroundColor: '#0F172A',
  headerTextColor: '#F8FAFC',
  borderColor: '#E2E8F0',
  rowHoverColor: '#F0FDFA',
  selectedRowBackgroundColor: '#CCFBF1',
  fontFamily: "'Crimson Text', Georgia, serif",
  fontSize: 15,
  headerFontSize: 14,
  headerFontWeight: 700,
  cellHorizontalPaddingScale: 0.85,
  rowVerticalPaddingScale: 0.85,
  accentColor: '#0D9488',
});

interface SpreadsheetEditorProps {
  rows: InvoiceLineItemRow[];
  additionalFields: AdditionalFieldEntry[];
  onChangeRows: (nextRows: InvoiceLineItemRow[]) => void;
  onPreviewPdf: (filename: string) => void;
  onAddMorePdfs: () => void;
  onResetAll: () => void;
  failedFilesCount: number;
  onRetryFailed?: () => void;
}

export const SpreadsheetEditor: React.FC<SpreadsheetEditorProps> = ({
  rows,
  additionalFields,
  onChangeRows,
  onPreviewPdf,
  onAddMorePdfs,
  onResetAll,
  failedFilesCount,
  onRetryFailed,
}) => {
  const gridRef = useRef<AgGridReact<InvoiceLineItemRow>>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterUncertainOnly, setFilterUncertainOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Undo / Redo state stack for row edits, additions, and deletions
  const [past, setPast] = useState<InvoiceLineItemRow[][]>([]);
  const [future, setFuture] = useState<InvoiceLineItemRow[][]>([]);

  const commitRows = useCallback(
    (nextRows: InvoiceLineItemRow[]) => {
      setPast((prev) => [...prev.slice(-29), rows]);
      setFuture([]);
      onChangeRows(nextRows);
    },
    [rows, onChangeRows]
  );

  const handleUndo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast((prev) => prev.slice(0, -1));
    setFuture((prev) => [rows, ...prev]);
    onChangeRows(previous);
  }, [past, rows, onChangeRows]);

  const handleRedo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((prev) => prev.slice(1));
    setPast((prev) => [...prev, rows]);
    onChangeRows(next);
  }, [future, rows, onChangeRows]);

  const handleAddRow = useCallback(() => {
    const newRow = validateInvoiceRow(
      createEmptyInvoiceRow(
        rows[rows.length - 1]?.pdfFilename || 'Manual_Entry.pdf',
        rows.length + 1
      )
    );
    commitRows([...rows, newRow]);
  }, [rows, commitRows]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const idSet = new Set(selectedIds);
    const remaining = rows.filter((r) => !idSet.has(r._id));
    setSelectedIds([]);
    commitRows(remaining);
  }, [rows, selectedIds, commitRows]);

  const handleDeleteSingleRow = useCallback(
    (rowId: string) => {
      const remaining = rows.filter((r) => r._id !== rowId);
      commitRows(remaining);
    },
    [rows, commitRows]
  );

  const handleCellValueChanged = useCallback(
    (event: CellValueChangedEvent<InvoiceLineItemRow>) => {
      if (!event.data) return;
      const updatedRow = validateInvoiceRow({
        ...event.data,
        customFields: { ...(event.data.customFields || {}) },
      });
      const nextRows = rows.map((r) => (r._id === updatedRow._id ? updatedRow : r));
      commitRows(nextRows);
    },
    [rows, commitRows]
  );

  const uncertainRowCount = useMemo(
    () =>
      rows.filter(
        (r) =>
          (r._uncertainFields && r._uncertainFields.length > 0) ||
          Boolean(r._arithmeticWarning)
      ).length,
    [rows]
  );

  const displayedRows = useMemo(() => {
    if (!filterUncertainOnly) return rows;
    return rows.filter(
      (r) =>
        (r._uncertainFields && r._uncertainFields.length > 0) ||
        Boolean(r._arithmeticWarning)
    );
  }, [rows, filterUncertainOnly]);

  const uniquePdfCount = useMemo(() => {
    return new Set(rows.map((r) => r.pdfFilename)).size;
  }, [rows]);

  const handleDownloadExcel = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportSuccess(false);
    try {
      const response = await fetch('/api/export-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, additionalFields }),
      });
      if (!response.ok) {
        throw new Error('Failed to generate Excel file');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Invoice_Extracted_Data.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 2500);
    } catch (err) {
      console.error('Excel export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const activeColumns = useMemo(
    () => resolveActiveColumns(rows, additionalFields),
    [rows, additionalFields]
  );

  const columnDefs = useMemo<ColDef<InvoiceLineItemRow>[]>(() => {
    const actionCol: ColDef<InvoiceLineItemRow> = {
      headerName: '',
      field: '_id',
      width: 76,
      minWidth: 76,
      maxWidth: 80,
      sortable: false,
      filter: false,
      editable: false,
      resizable: false,
      cellRenderer: (params: ICellRendererParams<InvoiceLineItemRow>) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div className="flex items-center justify-center gap-1 h-full">
            <button
              type="button"
              onClick={() => onPreviewPdf(row.pdfFilename)}
              aria-label={`Preview PDF ${row.pdfFilename} item ${row.serialNumber || '1'}`}
              title={`Preview ${row.pdfFilename}`}
              className="p-1.5 rounded-md text-slate-500 hover:text-[#0D9488] hover:bg-teal-50 transition-colors cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleDeleteSingleRow(row._id)}
              aria-label={`Delete row ${row.serialNumber || ''} of ${row.invoiceNumber || row.pdfFilename}`}
              title="Delete row"
              className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      },
    };

    const dataCols: ColDef<InvoiceLineItemRow>[] = activeColumns.map((col) => {
      const isNumeric = col.type === 'currency' || col.type === 'number';

      if (col.isCustom) {
        return {
          headerName: col.header,
          colId: col.key,
          width: Math.max(col.minWidth * 7.5, 130),
          minWidth: 115,
          editable: true,
          sortable: true,
          filter: true,
          resizable: true,
          valueGetter: (params) => (params.data ? getRowCellValue(params.data, col) : ''),
          valueSetter: (params) => {
            if (!params.data) return false;
            params.data.customFields = {
              ...(params.data.customFields || {}),
              [col.header]: String(params.newValue ?? ''),
            };
            return true;
          },
          cellClass: () => {
            const classes: string[] = [];
            if (isNumeric || col.type === 'date' || /\b(trrn|crn|id)\b/i.test(col.header)) {
              classes.push('font-mono-tabular');
            }
            if (isNumeric) {
              classes.push('text-right');
            }
            return classes.join(' ');
          },
        };
      }

      return {
        headerName: col.header,
        field: col.key as keyof InvoiceLineItemRow,
        width: Math.max(col.minWidth * 7.5, 115),
        minWidth: 105,
        editable: true,
        sortable: true,
        filter: true,
        resizable: true,
        cellClass: (params) => {
          const classes: string[] = [];
          if (
            isNumeric ||
            col.key === 'invoiceNumber' ||
            col.key === 'invoiceDate' ||
            col.key === 'dueDate' ||
            col.key === 'hsnSac'
          ) {
            classes.push('font-mono-tabular');
          }
          if (isNumeric) {
            classes.push('text-right');
          }
          if (params.data?._uncertainFields?.includes(col.key)) {
            classes.push('ag-cell-uncertain');
          }
          return classes.join(' ');
        },
        tooltipValueGetter: (params) => {
          if (params.data?._uncertainFields?.includes(col.key)) {
            return params.data._arithmeticWarning || 'Uncertain or missing value — click to edit';
          }
          return params.value ? String(params.value) : '';
        },
      };
    });

    return [actionCol, ...dataCols];
  }, [activeColumns, onPreviewPdf, handleDeleteSingleRow]);

  return (
    <div className="flex flex-col w-full h-full max-w-[1600px] mx-auto px-4 sm:px-6 pb-3">
      {/* Ultra-minimal Icon Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-3">
        {/* Left: Compact File/Row Counter + Search + Uncertain Filter */}
        <div className="flex items-center gap-2.5">
          <div
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-700 shadow-2xs"
            aria-label="Extracted batch summary"
          >
            <span className="font-mono-tabular font-semibold text-[#0F172A]">
              {uniquePdfCount} {uniquePdfCount === 1 ? 'PDF' : 'PDFs'}
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className="font-mono-tabular text-slate-600">
              {rows.length} {rows.length === 1 ? 'Row' : 'Rows'}
            </span>
          </div>

          {/* Search input with icon */}
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter..."
              aria-label="Search extracted invoice rows"
              className="h-10 pl-9 pr-8 w-44 sm:w-56 text-xs bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488] transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                title="Clear search"
                className="absolute right-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {uncertainRowCount > 0 && (
            <IconButton
              label={
                filterUncertainOnly
                  ? 'Show all rows'
                  : `Highlight uncertain values (${uncertainRowCount})`
              }
              onClick={() => setFilterUncertainOnly((prev) => !prev)}
              badge={uncertainRowCount}
              className={
                filterUncertainOnly
                  ? 'px-3 !w-auto !bg-amber-50 !border-amber-400 !text-amber-800'
                  : 'px-3 !w-auto !text-amber-700 !border-amber-200 hover:!border-amber-400'
              }
            >
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </IconButton>
          )}

          {failedFilesCount > 0 && onRetryFailed && (
            <IconButton
              label={`Retry ${failedFilesCount} failed PDF(s)`}
              onClick={onRetryFailed}
              badge={failedFilesCount}
              className="px-3 !w-auto !text-red-600 !border-red-200"
            >
              <RotateCcw className="w-4 h-4" />
            </IconButton>
          )}
        </div>

        {/* Right: Icon-Only Spreadsheet Edit Controls & Excel Download Icon */}
        <div className="flex items-center gap-2">
          <IconButton
            label="Add row"
            onClick={handleAddRow}
          >
            <Plus className="w-4 h-4" />
          </IconButton>

          <IconButton
            label="Delete selected rows"
            variant="danger"
            disabled={selectedIds.length === 0}
            onClick={handleDeleteSelected}
          >
            <Trash2 className="w-4 h-4" />
          </IconButton>

          <IconButton
            label="Undo"
            disabled={past.length === 0}
            onClick={handleUndo}
          >
            <Undo2 className="w-4 h-4" />
          </IconButton>

          <IconButton
            label="Redo"
            disabled={future.length === 0}
            onClick={handleRedo}
          >
            <Redo2 className="w-4 h-4" />
          </IconButton>

          <div className="h-5 w-px bg-slate-200 mx-0.5" aria-hidden="true" />

          <IconButton
            label="Upload more PDFs"
            onClick={onAddMorePdfs}
          >
            <Upload className="w-4 h-4" />
          </IconButton>

          <IconButton
            label="Start new batch"
            onClick={onResetAll}
          >
            <RotateCcw className="w-4 h-4" />
          </IconButton>

          {/* Prominent Excel Download Icon Button */}
          <IconButton
            label="Download Invoice_Extracted_Data.xlsx"
            variant="teal"
            onClick={handleDownloadExcel}
            disabled={isExporting || rows.length === 0}
            data-testid="download-excel-btn"
          >
            {exportSuccess ? (
              <Check className="w-5 h-5" />
            ) : (
              <Download className="w-5 h-5" />
            )}
          </IconButton>
        </div>
      </div>

      {/* Editable AG Grid Container */}
      <div
        className="flex-1 w-full bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
        data-testid="invoice-ag-grid"
      >
        <AgGridReact<InvoiceLineItemRow>
          ref={gridRef}
          theme={gridTheme}
          rowData={displayedRows}
          columnDefs={columnDefs}
          getRowId={(params) => params.data._id}
          quickFilterText={searchQuery}
          rowSelection={{
            mode: 'multiRow',
            checkboxes: true,
            headerCheckbox: true,
            enableClickSelection: false,
          }}
          onSelectionChanged={(event) => {
            const selected = event.api.getSelectedRows().map((r) => r._id);
            setSelectedIds(selected);
          }}
          onCellValueChanged={handleCellValueChanged}
          undoRedoCellEditing={true}
          undoRedoCellEditingLimit={30}
          enableCellTextSelection={true}
          animateRows={false}
          tooltipShowDelay={200}
        />
      </div>
    </div>
  );
};
