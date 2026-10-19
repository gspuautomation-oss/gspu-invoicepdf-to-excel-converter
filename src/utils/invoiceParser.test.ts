import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseInvoiceText,
  validateInvoiceRow,
  createEmptyInvoiceRow,
} from './invoiceParser.ts';
import {
  SAMPLE_INVOICE_BLUEPRINTS,
  generateInvoicePdfBytes,
} from './samplePdfGenerator.ts';
import { extractInvoiceFromPdfBuffer } from './pdfExtractor.ts';
import {
  buildInvoiceExcelWorkbook,
  INVOICE_EXCEL_COLUMNS,
  resolveActiveColumns,
} from './excelBuilder.ts';
import type { InvoiceLineItemRow, AdditionalFieldEntry } from '../types/invoice.ts';

test('Batch extraction of 20 PDF invoices simultaneously extracts all headers, line items, and totals into same Excel', async () => {
  assert.equal(
    SAMPLE_INVOICE_BLUEPRINTS.length,
    20,
    'Must test 20 invoices simultaneously (Max 20 PDFs)'
  );

  const pdfBuffers = await Promise.all(
    SAMPLE_INVOICE_BLUEPRINTS.map(async (bp) => ({
      filename: bp.filename,
      bytes: await generateInvoicePdfBytes(bp),
      blueprint: bp,
    }))
  );

  const results = await Promise.all(
    pdfBuffers.map((item) => extractInvoiceFromPdfBuffer(item.bytes, item.filename))
  );

  assert.equal(results.length, 20);

  const allRows: InvoiceLineItemRow[] = [];
  const allExtra: AdditionalFieldEntry[] = [];

  results.forEach((res, idx) => {
    const bp = SAMPLE_INVOICE_BLUEPRINTS[idx];
    assert.equal(res.status, 'success', `Extraction failed for ${bp.filename}: ${res.errorMessage}`);
    assert.equal(res.rows.length, bp.items.length, `Line item count mismatch for ${bp.filename}`);

    res.rows.forEach((row, itemIdx) => {
      assert.equal(row.pdfFilename, bp.filename);
      assert.equal(row.invoiceNumber, bp.invoiceNumber);
      assert.equal(row.invoiceDate, bp.invoiceDate);
      assert.equal(row.dueDate, bp.dueDate);
      assert.equal(row.poNumber, bp.poNumber);
      assert.equal(row.currency, bp.currency);
      assert.equal(row.supplierName, bp.supplierName);
      assert.equal(row.supplierTaxId, bp.supplierTaxId);
      assert.equal(row.customerName, bp.customerName);
      assert.equal(row.grandTotal, bp.grandTotal);
      assert.equal(row.description, bp.items[itemIdx].description);
      assert.equal(row.quantity, bp.items[itemIdx].quantity);
      assert.equal(row.rate, bp.items[itemIdx].rate);
      assert.equal(row.totalLineAmount, bp.items[itemIdx].totalLineAmount);
      assert.equal(row._arithmeticWarning, '');
    });

    allRows.push(...res.rows);
    allExtra.push(...res.additionalFields);
  });

  assert.ok(allRows.length >= 25, `Expected >= 25 consolidated line-item rows from 20 PDFs, got ${allRows.length}`);

  const workbook = await buildInvoiceExcelWorkbook(allRows, allExtra);
  const sheetNames = workbook.worksheets.map((ws) => ws.name);
  assert.deepEqual(sheetNames, ['Invoice Details'], 'Must contain ONLY Invoice Details worksheet');

  const mainSheet = workbook.getWorksheet('Invoice Details')!;
  const activeCols = resolveActiveColumns(allRows, allExtra);
  assert.equal(mainSheet.columnCount, activeCols.length);
  assert.ok(mainSheet.columnCount > INVOICE_EXCEL_COLUMNS.length);
  assert.equal(mainSheet.rowCount, allRows.length + 1);
});

test('Mixed batch: EPFO (August 25 2.pdf) + ESIC (ESIC apr25.pdf) + ESIC D&I (ESIC d & I.pdf) extracts all 3 PDFs into the same Excel sheet', async () => {
  // 1st PDF: EPFO Challan (colon-separated)
  const epfoText = `
    COMBINED CHALLAN OF A/C NO. 01, 02, 10, 21 & 22
    Generated On 19/09/2025 17:42:10
    TRRN : 2510270000529
    Challan Status : Payment Confirmed
    Challan Generated On : 12/02/2025 17:32:20
    Establishment ID : KRTVM0026751000
    Establishment Name : PATTOM ROYAL HOTEL
    Challan Type : Monthly Contribution
    Wage Month : AUG-2025
    Total Amount (Rs) : 2,877.00
    Account-1 Amount (Rs) : 2,350.00
    CRN : 250818492019482
    Payment type : Online
  `;

  // 2nd PDF: ESIC Challan (2-column table with tabs and apostrophes, NO colons!)
  const esicAprText = `
    EMPLOYEES' STATE INSURANCE CORPORATION
    Employer's Code No.\t47000267510001001
    Employer's Name\tPATTOM ROYAL HOTEL
    Challan Period\tApr-2025
    Challan Number\t0472511998877
    Challan Created Date\t10/05/2025 11:15:22
    Challan Submitted Date\t10/05/2025 11:18:40
    Amount Paid\t4,520.00
    Transaction Status\tPayment Confirmed
    Transaction Number\tCPAI987654321
  `;

  // 3rd PDF: ESIC D & I (space-separated / tabular without colons)
  const esicDiText = `
    EMPLOYEES' STATE INSURANCE CORPORATION
    Employer's Code No. 47000267510001001
    Employer's Name PATTOM ROYAL HOTEL
    Challan Period May-2025
    Challan Number 0472512004455
    Challan Submitted Date 14/06/2025 15:40:10
    Damages Amount 350.00
    Interest Amount 150.00
    Amount Paid 500.00
    Transaction Status Realized
  `;

  const parsed1 = parseInvoiceText(epfoText, 'August 25 2.pdf');
  const parsed2 = parseInvoiceText(esicAprText, 'ESIC apr25.pdf');
  const parsed3 = parseInvoiceText(esicDiText, 'ESIC d & I.pdf');

  const combinedRows = [...parsed1.rows, ...parsed2.rows, ...parsed3.rows];
  const combinedExtra = [
    ...parsed1.additionalFields,
    ...parsed2.additionalFields,
    ...parsed3.additionalFields,
  ];

  // Verify 2nd and 3rd PDFs extracted their custom fields
  assert.ok(Object.keys(parsed2.rows[0].customFields).length >= 6, '2nd PDF (ESIC apr25.pdf) must extract fields');
  assert.ok(Object.keys(parsed3.rows[0].customFields).length >= 6, '3rd PDF (ESIC d & I.pdf) must extract fields');

  const workbook = await buildInvoiceExcelWorkbook(combinedRows, combinedExtra);
  const sheet = workbook.getWorksheet('Invoice Details')!;
  const headerValues = (sheet.getRow(1).values as string[]).filter(Boolean);

  const challanGenColIdx = headerValues.indexOf('Challan Generated On') + 1;
  const estIdColIdx = headerValues.indexOf('Establishment ID') + 1;
  const estNameColIdx = headerValues.indexOf('Establishment Name') + 1;
  const wageMonthColIdx = headerValues.indexOf('Wage Month') + 1;
  const totalAmtColIdx = headerValues.indexOf('Total Amount (Rs)') + 1;

  // Verify Row 2 (August 25 2.pdf): Challan Generated On is preserved as text date, NOT 12,02,51,73,220.00!
  assert.equal(sheet.getRow(2).getCell(challanGenColIdx).value, '12/02/2025 17:32:20');
  assert.equal(sheet.getRow(2).getCell(estIdColIdx).value, 'KRTVM0026751000');
  assert.equal(sheet.getRow(2).getCell(totalAmtColIdx).value, 2877);

  // Verify Row 3 (ESIC apr25.pdf) has its extracted data aligned in the same sheet!
  assert.equal(sheet.getRow(3).getCell(estIdColIdx).value, '47000267510001001');
  assert.equal(sheet.getRow(3).getCell(estNameColIdx).value, 'PATTOM ROYAL HOTEL');
  assert.equal(sheet.getRow(3).getCell(wageMonthColIdx).value, 'Apr-2025');
  assert.equal(sheet.getRow(3).getCell(totalAmtColIdx).value, 4520);

  // Verify Row 4 (ESIC d & I.pdf) has its extracted data aligned in the same sheet!
  assert.equal(sheet.getRow(4).getCell(estIdColIdx).value, '47000267510001001');
  assert.equal(sheet.getRow(4).getCell(estNameColIdx).value, 'PATTOM ROYAL HOTEL');
  assert.equal(sheet.getRow(4).getCell(wageMonthColIdx).value, 'May-2025');
  assert.equal(sheet.getRow(4).getCell(totalAmtColIdx).value, 500);
});

test('Invoice without line items retains header information in a dedicated row with blank item columns', () => {
  const rawText = `
    TAX INVOICE
    Invoice No: INV-HEADER-ONLY-99
    Invoice Date: 17-10-2026
    Supplier Name: Minimalist Consulting Corp
    Supplier GSTIN: 29AAACM1111A1Z1
    Customer Name: Global Retail Ltd
    Grand Total: 5000.00
    Notes: Flat fee advisory invoice without itemized table.
  `;

  const { rows } = parseInvoiceText(rawText, 'header_only.pdf');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].invoiceNumber, 'INV-HEADER-ONLY-99');
  assert.equal(rows[0].supplierName, 'Minimalist Consulting Corp');
  assert.equal(rows[0].grandTotal, '5000.00');
  assert.equal(rows[0].description, '');
  assert.equal(rows[0].quantity, '');
  assert.equal(rows[0].rate, '');
});

test('Arithmetic validation flags line-item math discrepancies without modifying extracted values', () => {
  const row = createEmptyInvoiceRow('discrepancy.pdf', 1);
  row.invoiceNumber = 'INV-ERR-01';
  row.invoiceDate = '17-10-2026';
  row.supplierName = 'Test Supplier';
  row.quantity = '3';
  row.rate = '100.00';
  row.discount = '0.00';
  row.taxableAmount = '250.00'; // Should be 300.00!
  row.cgstAmount = '22.50';
  row.sgstAmount = '22.50';
  row.totalLineAmount = '295.00';
  row.grandTotal = '295.00';

  const validated = validateInvoiceRow(row);
  assert.equal(validated.taxableAmount, '250.00');
  assert.ok(validated._uncertainFields.includes('taxableAmount'));
  assert.ok(validated._arithmeticWarning.includes('300.00'));
});
