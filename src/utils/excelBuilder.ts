import ExcelJS from 'exceljs';
import type { InvoiceLineItemRow, AdditionalFieldEntry } from '../types/invoice.ts';
import { parseNumericAmount } from './invoiceParser.ts';

export interface ExcelColumnSpec {
  header: string;
  key: string;
  isCustom?: boolean;
  type: 'text' | 'number' | 'currency' | 'date';
  minWidth: number;
}

export const INVOICE_EXCEL_COLUMNS: ExcelColumnSpec[] = [
  // PDF Source
  { header: 'PDF', key: 'pdfFilename', type: 'text', minWidth: 20 },
  // 1. Invoice Information
  { header: 'Invoice No.', key: 'invoiceNumber', type: 'text', minWidth: 16 },
  { header: 'Invoice Date', key: 'invoiceDate', type: 'date', minWidth: 16 },
  { header: 'Due Date', key: 'dueDate', type: 'date', minWidth: 16 },
  { header: 'PO Number', key: 'poNumber', type: 'text', minWidth: 15 },
  { header: 'Reference No.', key: 'referenceNumber', type: 'text', minWidth: 15 },
  { header: 'Currency', key: 'currency', type: 'text', minWidth: 10 },
  // 2. Supplier Information
  { header: 'Supplier Name', key: 'supplierName', type: 'text', minWidth: 24 },
  { header: 'Supplier Address', key: 'supplierAddress', type: 'text', minWidth: 28 },
  { header: 'Supplier GSTIN / VAT / TRN', key: 'supplierTaxId', type: 'text', minWidth: 22 },
  { header: 'Supplier Contact', key: 'supplierContact', type: 'text', minWidth: 20 },
  // 3. Customer Information
  { header: 'Customer Name', key: 'customerName', type: 'text', minWidth: 24 },
  { header: 'Customer Address', key: 'customerAddress', type: 'text', minWidth: 28 },
  { header: 'Customer GSTIN / VAT / TRN', key: 'customerTaxId', type: 'text', minWidth: 22 },
  { header: 'Shipping Details', key: 'shippingDetails', type: 'text', minWidth: 24 },
  // 4. Detailed Invoice Line Items
  { header: 'Serial No.', key: 'serialNumber', type: 'text', minWidth: 11 },
  { header: 'Product / Service Description', key: 'description', type: 'text', minWidth: 30 },
  { header: 'HSN / SAC Code', key: 'hsnSac', type: 'text', minWidth: 15 },
  { header: 'Quantity', key: 'quantity', type: 'number', minWidth: 12 },
  { header: 'UOM', key: 'unit', type: 'text', minWidth: 10 },
  { header: 'Rate', key: 'rate', type: 'currency', minWidth: 14 },
  { header: 'Discount', key: 'discount', type: 'currency', minWidth: 13 },
  { header: 'Taxable Amount', key: 'taxableAmount', type: 'currency', minWidth: 16 },
  { header: 'Tax %', key: 'taxPercentage', type: 'number', minWidth: 10 },
  { header: 'CGST Amount', key: 'cgstAmount', type: 'currency', minWidth: 14 },
  { header: 'SGST Amount', key: 'sgstAmount', type: 'currency', minWidth: 14 },
  { header: 'IGST Amount', key: 'igstAmount', type: 'currency', minWidth: 14 },
  { header: 'VAT Amount', key: 'vatAmount', type: 'currency', minWidth: 14 },
  { header: 'Total Line Amount', key: 'totalLineAmount', type: 'currency', minWidth: 18 },
  // 5. Invoice Totals
  { header: 'Subtotal', key: 'subtotal', type: 'currency', minWidth: 15 },
  { header: 'Taxable Value', key: 'taxableValue', type: 'currency', minWidth: 15 },
  { header: 'Total Discounts', key: 'totalDiscounts', type: 'currency', minWidth: 15 },
  { header: 'Total Taxes', key: 'totalTaxes', type: 'currency', minWidth: 15 },
  { header: 'Additional Charges', key: 'additionalCharges', type: 'currency', minWidth: 17 },
  { header: 'Round-Off', key: 'roundOff', type: 'currency', minWidth: 13 },
  { header: 'Grand Total', key: 'grandTotal', type: 'currency', minWidth: 16 },
  { header: 'Amount Paid', key: 'amountPaid', type: 'currency', minWidth: 15 },
  { header: 'Balance Due', key: 'balanceDue', type: 'currency', minWidth: 15 },
  // 6. Additional Information
  { header: 'Bank Details', key: 'bankDetails', type: 'text', minWidth: 28 },
  { header: 'Payment Terms', key: 'paymentTerms', type: 'text', minWidth: 20 },
  { header: 'Notes', key: 'notes', type: 'text', minWidth: 24 },
  { header: 'Remarks', key: 'remarks', type: 'text', minWidth: 24 },
  { header: 'Other Information', key: 'otherInfo', type: 'text', minWidth: 28 },
];

/**
 * Synonym groups so related fields across mixed batches (e.g. EPFO Challans + ESIC Challans + ESIC D&I)
 * align cleanly in the same consolidated Excel columns while also keeping any distinct fields.
 */
const FIELD_SYNONYM_GROUPS: string[][] = [
  ['establishment id', "employer's code no.", "employer's code no", 'employer code no.', 'employer code no', 'employer code', 'sub code'],
  ['establishment name', "employer's name", 'employer name', 'name of establishment', 'name of employer'],
  ['wage month', 'challan period', 'contribution period', 'return period', 'dues for the month'],
  ['trrn', 'challan number', 'challan no.', 'challan no'],
  ['challan generated on', 'challan submitted date', 'challan created date'],
  ['generated on', 'printed on', 'created on'],
  ['challan status', 'transaction status', 'payment status', 'status'],
  ['total amount (rs)', 'total amount (rs.)', 'amount paid', 'total amount', 'total contribution', 'total remittance'],
  ['crn', 'transaction number', 'transaction id'],
  ['payment type', 'payment mode'],
];

/**
 * Infers the appropriate column formatting type for a dynamic/custom field name.
 * Checks date/time/ID keywords FIRST using whole-word boundaries so words like "Generated"
 * never match "rate" as currency.
 */
function inferCustomColumnType(fieldName: string): 'text' | 'number' | 'currency' | 'date' {
  const lower = fieldName.toLowerCase();

  // 1. Check Date / Timestamp columns first
  if (
    /\b(date|generated|created|submitted|printed|realization|confirmation|time)\b/i.test(lower) ||
    /\bon$/i.test(lower)
  ) {
    return 'date';
  }

  // 2. Check IDs, Codes, TRRN, CRN, Months, Names, Statuses as text
  if (
    /\b(trrn|crn|id|no\.?|number|code|gstin|vat|trn|ifsc|iban|phone|mobile|status|type|mode|month|period|name|bank|branch)\b/i.test(
      lower
    ) &&
    !/\b(amount|rs)\b/i.test(lower)
  ) {
    return 'text';
  }

  // 3. Check Currency / Amount columns using strict word boundaries
  if (
    /\b(amount|rs\.?|price|rate|total|fee|charge|balance|paid|contribution|damages|interest|dues)\b/i.test(
      lower
    )
  ) {
    return 'currency';
  }

  return 'text';
}

/**
 * Checks whether a string is strictly a numeric/currency amount (no date slashes, no time colons, no letters).
 */
export function isPureNumericAmountString(val: string): boolean {
  const trimmed = val.trim().replace(/^[₹$€£¥]|^(INR|USD|EUR|GBP|AED|CAD|AUD|Rs\.?)\s*/i, '').trim();
  if (!trimmed) return false;
  return /^[+\-]?\(?[\d,]+(?:\.\d+)?\)?$/.test(trimmed);
}

/**
 * Resolves the cell value for either a standard column or a dynamic custom column on a row,
 * supporting case-insensitive matching and cross-challan (EPFO/ESIC) field synonym lookup.
 */
export function getRowCellValue(row: InvoiceLineItemRow, col: ExcelColumnSpec): string {
  if (col.isCustom) {
    const cf = row.customFields || {};
    if (cf[col.header] !== undefined && cf[col.header] !== '') {
      return String(cf[col.header]).trim();
    }

    const targetLower = col.header.toLowerCase().trim();
    for (const [k, v] of Object.entries(cf)) {
      if (k.toLowerCase().trim() === targetLower && v !== '') {
        return String(v).trim();
      }
    }

    // Check synonym groups (e.g. aligning ESIC 'Employer's Code No.' with EPFO 'Establishment ID' when needed)
    for (const group of FIELD_SYNONYM_GROUPS) {
      if (group.includes(targetLower)) {
        for (const [k, v] of Object.entries(cf)) {
          if (group.includes(k.toLowerCase().trim()) && v !== '') {
            return String(v).trim();
          }
        }
      }
    }

    return '';
  }

  const val = (row as unknown as Record<string, unknown>)[col.key];
  return val !== undefined && val !== null ? String(val).trim() : '';
}

/**
 * Builds the active horizontal column list for both the AG Grid Editor and Excel Export.
 * Every extracted field across all uploaded PDFs (up to 20 PDFs) becomes a horizontal column header
 * with its corresponding data in the rows.
 */
export function resolveActiveColumns(
  rows: InvoiceLineItemRow[],
  additionalFields: AdditionalFieldEntry[] = []
): ExcelColumnSpec[] {
  // Backfill row.customFields from additionalFields if any were passed separately
  if (additionalFields.length > 0) {
    const mapByPdf = new Map<string, Record<string, string>>();
    for (const ef of additionalFields) {
      if (!mapByPdf.has(ef.pdfFilename)) {
        mapByPdf.set(ef.pdfFilename, {});
      }
      mapByPdf.get(ef.pdfFilename)![ef.fieldName] = ef.fieldValue;
    }
    for (const row of rows) {
      if (!row.customFields) row.customFields = {};
      const extraForPdf = mapByPdf.get(row.pdfFilename);
      if (extraForPdf) {
        for (const [k, v] of Object.entries(extraForPdf)) {
          if (!(k in row.customFields)) {
            row.customFields[k] = v;
          }
        }
      }
    }
  }

  // Collect all unique custom field names across all rows (merging case-insensitive duplicates)
  const customFieldNames: string[] = [];
  const seenCustomLower = new Set<string>();
  for (const row of rows) {
    if (row.customFields) {
      for (const key of Object.keys(row.customFields)) {
        const lowerKey = key.toLowerCase().trim();
        if (!seenCustomLower.has(lowerKey)) {
          seenCustomLower.add(lowerKey);
          customFieldNames.push(key);
        }
      }
    }
  }

  const customColumnSpecs: ExcelColumnSpec[] = customFieldNames.map((fieldName) => {
    const colType = inferCustomColumnType(fieldName);
    return {
      header: fieldName,
      key: `custom__${fieldName}`,
      isCustom: true,
      type: colType,
      minWidth: colType === 'date' ? Math.max(fieldName.length + 6, 22) : Math.max(fieldName.length + 5, 16),
    };
  });

  // Determine if the batch contains standard invoice line-item data
  const hasStandardInvoiceData = rows.some(
    (r) =>
      Boolean(r.invoiceNumber?.trim()) ||
      Boolean(r.supplierName?.trim()) ||
      Boolean(r.description?.trim()) ||
      Boolean(r.totalLineAmount?.trim())
  );

  // If the batch is a custom/challan batch (e.g. EPFO / ESIC Challans) with custom fields and no standard invoice items,
  // place PDF + all custom field columns + any populated standard columns so there are zero empty clutter columns
  if (!hasStandardInvoiceData && customColumnSpecs.length > 0) {
    const pdfCol = INVOICE_EXCEL_COLUMNS[0];
    const populatedStandardCols = INVOICE_EXCEL_COLUMNS.slice(1).filter((col) => {
      if (col.key === 'otherInfo' || col.key === 'serialNumber') return false;
      return rows.some((r) => Boolean(getRowCellValue(r, col)));
    });
    return [pdfCol, ...customColumnSpecs, ...populatedStandardCols];
  }

  return [...INVOICE_EXCEL_COLUMNS, ...customColumnSpecs];
}

/**
 * Generates an ExcelJS Workbook containing ONLY the consolidated 'Invoice Details' worksheet.
 * All data from all uploaded PDFs (up to 20 PDFs) appears in the same worksheet with fields as columns
 * and corresponding PDF data in rows.
 */
export async function buildInvoiceExcelWorkbook(
  rows: InvoiceLineItemRow[],
  additionalFields: AdditionalFieldEntry[] = []
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Invoice to Excel Converter';
  workbook.created = new Date();

  const activeColumns = resolveActiveColumns(rows, additionalFields);

  // Main Consolidated Worksheet: Invoice Details (NO SUMMARY SHEET)
  const sheet = workbook.addWorksheet('Invoice Details', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = activeColumns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.minWidth,
  }));

  // Style Header Row (Navy-Blue #0F172A with crisp white typography)
  const headerRow = sheet.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = {
      name: 'Crimson Text',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'left',
      wrapText: false,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF334155' } },
      bottom: { style: 'medium', color: { argb: 'FF0D9488' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      right: { style: 'thin', color: { argb: 'FF334155' } },
    };
  });

  // Populate Data Rows
  rows.forEach((row) => {
    const rowValues: Record<string, string | number> = {};
    for (const col of activeColumns) {
      const rawVal = getRowCellValue(row, col);
      if (!rawVal) {
        rowValues[col.key] = '';
        continue;
      }

      if (
        col.key === 'invoiceNumber' ||
        col.key === 'poNumber' ||
        col.key === 'referenceNumber' ||
        col.key === 'hsnSac' ||
        col.key === 'serialNumber' ||
        col.type === 'text' ||
        col.type === 'date'
      ) {
        rowValues[col.key] = rawVal;
      } else if ((col.type === 'currency' || col.type === 'number') && isPureNumericAmountString(rawVal)) {
        const parsed = parseNumericAmount(rawVal);
        if (!Number.isNaN(parsed)) {
          rowValues[col.key] = parsed;
        } else {
          rowValues[col.key] = rawVal;
        }
      } else {
        rowValues[col.key] = rawVal;
      }
    }

    const addedRow = sheet.addRow(rowValues);
    addedRow.height = 20;

    activeColumns.forEach((col, colIdx) => {
      const cell = addedRow.getCell(colIdx + 1);
      cell.font = { name: 'Crimson Text', size: 11, color: { argb: 'FF0F172A' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      if (
        col.key === 'invoiceNumber' ||
        col.key === 'poNumber' ||
        col.key === 'referenceNumber' ||
        col.type === 'text' ||
        col.type === 'date'
      ) {
        cell.numFmt = '@';
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else if (col.type === 'currency' && typeof cell.value === 'number') {
        cell.numFmt = '#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else if (col.type === 'number' && typeof cell.value === 'number') {
        cell.numFmt = Number.isInteger(cell.value) ? '#,##0' : '#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else {
        cell.numFmt = '@';
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }

      if (row._uncertainFields?.includes(col.key)) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEF3C7' },
        };
      }
    });
  });

  // Enable AutoFilter across all columns in Invoice Details
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rows.length + 1), column: activeColumns.length },
  };

  // Auto-adjust column widths generously so Excel never displays '##############'
  activeColumns.forEach((col, index) => {
    const column = sheet.getColumn(index + 1);
    let maxLen = col.header.length;
    column.eachCell({ includeEmpty: false }, (cell, rowNumber) => {
      if (rowNumber === 1) return;
      const text = cell.value !== null && cell.value !== undefined ? String(cell.value) : '';
      if (text.length > maxLen) {
        maxLen = text.length;
      }
    });
    column.width = Math.min(Math.max(col.minWidth, maxLen + 6), 55);
  });

  return workbook;
}
