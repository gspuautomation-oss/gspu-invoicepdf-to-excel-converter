import type { InvoiceLineItemRow, AdditionalFieldEntry } from '../types/invoice.ts';

/**
 * Parses a numeric string (handling commas, currency symbols, parentheses) into a number,
 * or returns NaN if not a valid number.
 */
export function parseNumericAmount(val: string | undefined | null): number {
  if (!val) return NaN;
  const trimmed = String(val).trim();
  if (!trimmed) return NaN;
  const isNegative =
    (trimmed.startsWith('(') && trimmed.endsWith(')')) || trimmed.startsWith('-');
  const cleaned = trimmed.replace(/[^0-9.]/g, '');
  if (!cleaned) return NaN;
  const num = parseFloat(cleaned);
  if (Number.isNaN(num)) return NaN;
  return isNegative ? -Math.abs(num) : num;
}

/**
 * Validates arithmetic and required fields on a single InvoiceLineItemRow.
 * Never modifies the extracted financial amounts; only populates `_uncertainFields` and `_arithmeticWarning`.
 */
export function validateInvoiceRow(row: InvoiceLineItemRow): InvoiceLineItemRow {
  const uncertain = new Set<string>();
  const warnings: string[] = [];

  const hasStandardInvoiceData = Boolean(
    row.invoiceNumber.trim() ||
      row.supplierName.trim() ||
      row.description.trim() ||
      row.grandTotal.trim()
  );
  const hasCustomFields =
    row.customFields && Object.keys(row.customFields).length > 0;

  if (hasStandardInvoiceData || !hasCustomFields) {
    if (!row.invoiceNumber.trim()) uncertain.add('invoiceNumber');
    if (!row.invoiceDate.trim()) uncertain.add('invoiceDate');
    if (!row.supplierName.trim()) uncertain.add('supplierName');
    if (!row.grandTotal.trim() && !row.totalLineAmount.trim()) {
      uncertain.add('grandTotal');
    }
  }

  const qty = parseNumericAmount(row.quantity);
  const rate = parseNumericAmount(row.rate);
  const discount = parseNumericAmount(row.discount) || 0;
  const taxable = parseNumericAmount(row.taxableAmount);
  const cgst = parseNumericAmount(row.cgstAmount) || 0;
  const sgst = parseNumericAmount(row.sgstAmount) || 0;
  const igst = parseNumericAmount(row.igstAmount) || 0;
  const vat = parseNumericAmount(row.vatAmount) || 0;
  const taxPct = parseNumericAmount(row.taxPercentage);
  const totalLine = parseNumericAmount(row.totalLineAmount);

  // Check Qty * Rate - Discount ≈ Taxable Amount
  if (!Number.isNaN(qty) && !Number.isNaN(rate) && !Number.isNaN(taxable)) {
    const expectedTaxable = qty * rate - discount;
    if (Math.abs(expectedTaxable - taxable) > 0.06) {
      uncertain.add('taxableAmount');
      warnings.push(
        `Qty (${qty}) × Rate (${rate})${discount ? ` - Discount (${discount})` : ''} = ${expectedTaxable.toFixed(2)}, but Taxable is ${taxable.toFixed(2)}`
      );
    }
  }

  // Check Taxable + Taxes ≈ Total Line Amount
  if (!Number.isNaN(taxable) && !Number.isNaN(totalLine)) {
    const explicitTaxes = cgst + sgst + igst + vat;
    let expectedTotal = taxable + explicitTaxes;
    if (explicitTaxes === 0 && !Number.isNaN(taxPct) && taxPct > 0) {
      expectedTotal = taxable + (taxable * taxPct) / 100;
    }
    if (Math.abs(expectedTotal - totalLine) > 0.08) {
      uncertain.add('totalLineAmount');
      warnings.push(
        `Taxable (${taxable.toFixed(2)}) + Tax = ${expectedTotal.toFixed(2)}, but Line Total is ${totalLine.toFixed(2)}`
      );
    }
  }

  return {
    ...row,
    customFields: row.customFields || {},
    _uncertainFields: Array.from(uncertain),
    _arithmeticWarning: warnings.join('; '),
  };
}

export function createEmptyInvoiceRow(
  pdfFilename = 'Manual_Entry.pdf',
  index = 1
): InvoiceLineItemRow {
  return {
    _id: `${pdfFilename}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    pdfFilename,
    invoiceNumber: '',
    invoiceDate: '',
    dueDate: '',
    poNumber: '',
    referenceNumber: '',
    currency: '',
    supplierName: '',
    supplierAddress: '',
    supplierTaxId: '',
    supplierContact: '',
    customerName: '',
    customerAddress: '',
    customerTaxId: '',
    shippingDetails: '',
    serialNumber: String(index),
    description: '',
    hsnSac: '',
    quantity: '',
    unit: '',
    rate: '',
    discount: '',
    taxableAmount: '',
    taxPercentage: '',
    cgstAmount: '',
    sgstAmount: '',
    igstAmount: '',
    vatAmount: '',
    totalLineAmount: '',
    subtotal: '',
    taxableValue: '',
    totalDiscounts: '',
    totalTaxes: '',
    additionalCharges: '',
    roundOff: '',
    grandTotal: '',
    amountPaid: '',
    balanceDue: '',
    bankDetails: '',
    paymentTerms: '',
    notes: '',
    remarks: '',
    otherInfo: '',
    customFields: {},
    _uncertainFields: [],
    _arithmeticWarning: '',
    _extractionMethod: 'manual',
  };
}

function matchFirst(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m && m[1]) {
      return m[1].replace(/\t+/g, ' ').trim();
    }
  }
  return '';
}

function cleanAmountString(val: string): string {
  if (!val) return '';
  const trimmed = val
    .replace(/\t+/g, ' ')
    .trim()
    .replace(/^[₹$€£¥]|^(INR|USD|EUR|GBP|AED|CAD|AUD)\s*/i, '')
    .trim();
  return trimmed;
}

function isLikelyFieldLabel(str: string): boolean {
  const s = str.replace(/[:\-]+$/, '').trim();
  if (s.length < 2 || s.length > 52) return false;
  if (!/^[A-Za-z]/.test(s)) return false;
  // Ignore pure sentence disclaimers or page headers
  if (
    /^(page\s+\d+|employees'\s+state\s+insurance|employee's\s+provident\s+fund|combined\s+challan|electronic\s+challan|this\s+is\s+a\s+computer|note\s+that|disclaimer|terms\s+and\s+conditions)/i.test(
      s
    )
  ) {
    return false;
  }
  return true;
}

/**
 * Extracts structured invoice header, supplier, customer, line items, totals, and custom field columns
 * (including EPFO Challans, ESIC Challans, ESIC D&I statements, tabular receipts, and multi-format invoices)
 * from raw PDF text.
 */
export function parseInvoiceText(
  rawText: string,
  pdfFilename: string,
  method: 'digital-text' | 'ocr' = 'digital-text'
): {
  rows: InvoiceLineItemRow[];
  additionalFields: AdditionalFieldEntry[];
} {
  // Normalize standalone tab-bordered colons ("\t:\t" or " \t:") into ": "
  const normalizedText = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/\t+\s*:\s*\t+/g, ': ')
    .replace(/\t+\s*:/g, ':');

  const textForStandardRegex = normalizedText.replace(/\t+/g, ' ');

  const rawLines = normalizedText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Merge lines where a label ends with ':' on one line and the value is on the immediately next line
  const lines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const curr = rawLines[i];
    if (
      /^[A-Za-z][A-Za-z0-9\s'’&\/().,_#-]{1,45}\s*:$/.test(curr) &&
      i + 1 < rawLines.length &&
      !rawLines[i + 1].includes(':')
    ) {
      lines.push(`${curr} ${rawLines[i + 1]}`);
      i++;
    } else {
      lines.push(curr);
    }
  }

  // 1. Invoice Information
  const invoiceNumber = matchFirst(textForStandardRegex, [
    /(?:Invoice\s*(?:No\.?|Number|#)|Credit\s*Note\s*(?:No\.?|#)|Debit\s*Note\s*(?:No\.?|#)|Inv\s*No\.?)\s*[:\-]?\s*([A-Z0-9\/_-]{2,35})/i,
    /\b((?:INV|CN|DN|TAX|BILL)[-\/][A-Z0-9-\/]{2,25})\b/i,
  ]);

  const invoiceDate = matchFirst(textForStandardRegex, [
    /(?:Invoice\s*Date|Date\s*of\s*Issue|Issue\s*Date|Billing\s*Date|Credit\s*Note\s*Date|Debit\s*Note\s*Date|^Date)\s*[:\-]?\s*(\d{1,4}[-\/.]\d{1,2}[-\/.]\d{1,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/im,
  ]);

  const dueDate = matchFirst(textForStandardRegex, [
    /(?:Due\s*Date|Payment\s*Due(?:\s*Date)?|Pay\s*By)\s*[:\-]?\s*(\d{1,4}[-\/.]\d{1,2}[-\/.]\d{1,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i,
  ]);

  const poNumber = matchFirst(textForStandardRegex, [
    /(?:P\.?O\.?\s*(?:No\.?|Number|#)|Purchase\s*Order(?:\s*(?:No\.?|Number|#))?)\s*[:\-]?\s*([A-Z0-9\/_-]{2,30})/i,
  ]);

  const referenceNumber = matchFirst(textForStandardRegex, [
    /(?:Ref(?:erence)?\s*(?:No\.?|Number|#)|Order\s*Ref)\s*[:\-]?\s*([A-Z0-9\/_-]{2,30})/i,
  ]);

  let currency = matchFirst(textForStandardRegex, [
    /(?:Currency)\s*[:\-]?\s*\b(INR|USD|EUR|GBP|AED|SGD|AUD|CAD|JPY|CHF)\b/i,
    /\b(INR|USD|EUR|GBP|AED|SGD|AUD|CAD)\b/,
  ]);
  if (!currency) {
    if (textForStandardRegex.includes('₹') || /\(Rs\.?\)/i.test(textForStandardRegex))
      currency = 'INR';
    else if (textForStandardRegex.includes('€')) currency = 'EUR';
    else if (textForStandardRegex.includes('£')) currency = 'GBP';
    else if (textForStandardRegex.includes('$')) currency = 'USD';
  }

  // 2. Supplier Information
  const supplierName = matchFirst(textForStandardRegex, [
    /(?:Supplier(?:\s*Name)?|Vendor(?:\s*Name)?|Seller(?:\s*Name)?|^From|Billed\s*By|Issued\s*By)\s*[:\-]\s*([^\n|]{2,80})/im,
  ]);

  const supplierAddress = matchFirst(textForStandardRegex, [
    /(?:Supplier\s*Address|Vendor\s*Address|Seller\s*Address|From\s*Address|Registered\s*Office)\s*[:\-]\s*([^\n]{5,140})/i,
  ]);

  const supplierTaxId = matchFirst(textForStandardRegex, [
    /(?:Supplier\s*(?:GSTIN|VAT|TRN|Tax\s*ID)|Seller\s*(?:GSTIN|VAT|TRN)|Vendor\s*(?:GSTIN|VAT|TRN))\s*[:\-]?\s*([A-Z0-9-]{6,25})/i,
    /(?:GSTIN|VAT\s*(?:No\.?|Reg\.?|Number)|^TRN)\s*[:\-]?\s*([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}|[A-Z]{2}[0-9A-Z]{8,14}|[0-9]{15})/im,
  ]);

  const supplierContact = matchFirst(textForStandardRegex, [
    /(?:Supplier\s*Contact|Vendor\s*Contact|^Contact|^Phone|^Email|^Tel)\s*[:\-]\s*([^\n]{4,90})/im,
  ]);

  // 3. Customer Information
  const customerName = matchFirst(textForStandardRegex, [
    /(?:Customer(?:\s*Name)?|Client(?:\s*Name)?|Bill(?:ed)?\s*To|Buyer(?:\s*Name)?|Sold\s*To)\s*[:\-]\s*([^\n|]{2,80})/i,
  ]);

  const customerAddress = matchFirst(textForStandardRegex, [
    /(?:Customer\s*Address|Billing\s*Address|Bill\s*To\s*Address|Buyer\s*Address)\s*[:\-]\s*([^\n]{5,140})/i,
  ]);

  let customerTaxId = matchFirst(textForStandardRegex, [
    /(?:Customer\s*(?:GSTIN|VAT|TRN|Tax\s*ID)|Buyer\s*(?:GSTIN|VAT|TRN)|Bill\s*To\s*(?:GSTIN|VAT|TRN)|Client\s*(?:GSTIN|VAT|TRN))\s*[:\-]?\s*([A-Z0-9-]{6,25})/i,
  ]);
  if (!customerTaxId) {
    const allTaxMatches = Array.from(
      textForStandardRegex.matchAll(
        /(?:GSTIN|VAT(?:\s*No\.?)?|^TRN)\s*[:\-]?\s*([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}|[A-Z]{2}[0-9A-Z]{8,14}|[0-9]{15})/gim
      )
    );
    if (allTaxMatches.length > 1 && allTaxMatches[1][1] !== supplierTaxId) {
      customerTaxId = allTaxMatches[1][1].trim();
    }
  }

  const shippingDetails = matchFirst(textForStandardRegex, [
    /(?:Ship(?:ping)?\s*(?:Address|Details|To)|Deliver(?:y)?\s*(?:Address|To)|Consignee)\s*[:\-]\s*([^\n]{4,140})/i,
  ]);

  // 5. Invoice Totals
  const subtotal = cleanAmountString(
    matchFirst(textForStandardRegex, [
      /(?:Sub\s*[-]?total|Total\s*Before\s*Tax|Gross\s*Amount)\s*[:\-]?\s*([₹$€£]?\s*[\d,]+\.\d{2}|[\d,]+)/i,
    ])
  );

  const taxableValue = cleanAmountString(
    matchFirst(textForStandardRegex, [
      /(?:Total\s*Taxable\s*(?:Value|Amount)|Taxable\s*(?:Value|Subtotal))\s*[:\-]?\s*([₹$€£]?\s*[\d,]+\.\d{2}|[\d,]+)/i,
    ])
  );

  const totalDiscounts = cleanAmountString(
    matchFirst(textForStandardRegex, [
      /(?:Total\s*Discount(?:s)?|Discount\s*Total)\s*[:\-]?\s*([₹$€£]?\s*[\d,]+\.\d{2}|[\d,]+)/i,
    ])
  );

  const totalTaxes = cleanAmountString(
    matchFirst(textForStandardRegex, [
      /(?:Total\s*(?:Tax(?:es)?|GST|VAT)|Tax\s*Total)\s*[:\-]?\s*([₹$€£]?\s*[\d,]+\.\d{2}|[\d,]+)/i,
    ])
  );

  const additionalCharges = cleanAmountString(
    matchFirst(textForStandardRegex, [
      /(?:Additional\s*Charges|Freight|Shipping\s*Charges|Handling\s*Charges|Packing\s*Charges)\s*[:\-]?\s*([₹$€£]?\s*[\d,]+\.\d{2}|[\d,]+)/i,
    ])
  );

  const roundOff = cleanAmountString(
    matchFirst(textForStandardRegex, [
      /(?:Round\s*[-]?Off|Rounding)\s*[:\-]?\s*([+\-]?[₹$€£]?\s*[\d,]+\.\d{2})/i,
    ])
  );

  const grandTotal = cleanAmountString(
    matchFirst(textForStandardRegex, [
      /(?:Grand\s*Total|Invoice\s*Total|Total\s*Amount\s*Due|Total\s*Payable|Net\s*Payable)\s*[:\-]?\s*([₹$€£]?\s*[\d,]+\.\d{2}|[\d,]+)/i,
    ])
  );

  const amountPaid = cleanAmountString(
    matchFirst(textForStandardRegex, [
      /(?:Amount\s*Paid|Paid\s*Amount|Advance\s*Received)\s*[:\-]?\s*([₹$€£]?\s*[\d,]+\.\d{2}|[\d,]+)/i,
    ])
  );

  const balanceDue = cleanAmountString(
    matchFirst(textForStandardRegex, [
      /(?:Balance\s*Due|Amount\s*Due|Remaining\s*Balance)\s*[:\-]?\s*([₹$€£]?\s*[\d,]+\.\d{2}|[\d,]+)/i,
    ])
  );

  // 6. Additional Information
  const bankDetails = matchFirst(textForStandardRegex, [
    /(?:Bank\s*Details|Bank\s*Account|Beneficiary\s*Bank|Remittance\s*Details)\s*[:\-]\s*([^\n]{5,180})/i,
  ]);

  const paymentTerms = matchFirst(textForStandardRegex, [
    /(?:Payment\s*Terms|Terms\s*of\s*Payment)\s*[:\-]\s*([^\n]{2,120})/i,
  ]);

  const notes = matchFirst(textForStandardRegex, [
    /(?:^Notes|Customer\s*Notes|Invoice\s*Notes)\s*[:\-]\s*([^\n]{2,160})/im,
  ]);

  const remarks = matchFirst(textForStandardRegex, [
    /(?:^Remarks|Declaration|Special\s*Instructions)\s*[:\-]\s*([^\n]{2,160})/im,
  ]);

  // 4. Detailed Invoice Line Items Extraction
  interface ParsedLineItem {
    serialNumber: string;
    description: string;
    hsnSac: string;
    quantity: string;
    unit: string;
    rate: string;
    discount: string;
    taxableAmount: string;
    taxPercentage: string;
    cgstAmount: string;
    sgstAmount: string;
    igstAmount: string;
    vatAmount: string;
    totalLineAmount: string;
  }

  const parsedItems: ParsedLineItem[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t+/g, ' ');
    if (/^ITEM_ROW\s*\|/i.test(line)) {
      const parts = line.split('|').map((p) => p.trim());
      parsedItems.push({
        serialNumber: parts[1] || String(parsedItems.length + 1),
        description: parts[2] || '',
        hsnSac: parts[3] || '',
        quantity: parts[4] || '',
        unit: parts[5] || '',
        rate: parts[6] || '',
        discount: parts[7] || '',
        taxableAmount: parts[8] || '',
        taxPercentage: parts[9] || '',
        cgstAmount: parts[10] || '',
        sgstAmount: parts[11] || '',
        igstAmount: parts[12] || '',
        vatAmount: parts[13] || '',
        totalLineAmount: parts[14] || '',
      });
      continue;
    }

    if (/^\d+\s*\|/.test(line)) {
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length >= 6) {
        if (parts.length >= 14) {
          parsedItems.push({
            serialNumber: parts[0],
            description: parts[1],
            hsnSac: parts[2],
            quantity: parts[3],
            unit: parts[4],
            rate: parts[5],
            discount: parts[6],
            taxableAmount: parts[7],
            taxPercentage: parts[8],
            cgstAmount: parts[9],
            sgstAmount: parts[10],
            igstAmount: parts[11],
            vatAmount: parts[12],
            totalLineAmount: parts[13],
          });
        } else {
          parsedItems.push({
            serialNumber: parts[0] || String(parsedItems.length + 1),
            description: parts[1] || '',
            hsnSac: parts.length >= 8 ? parts[2] : '',
            quantity: parts.length >= 8 ? parts[3] : parts[2] || '',
            unit: 'Nos',
            rate: parts.length >= 8 ? parts[4] : parts[3] || '',
            discount: '0.00',
            taxableAmount: parts.length >= 8 ? parts[5] : parts[4] || '',
            taxPercentage: '',
            cgstAmount: '',
            sgstAmount: '',
            igstAmount: parts.length >= 8 ? parts[6] : '',
            vatAmount: '',
            totalLineAmount: parts[parts.length - 1] || '',
          });
        }
        continue;
      }
    }

    const wsFullMatch = line.match(
      /^(\d{1,3})\s+([A-Za-z0-9][A-Za-z0-9\s,&()\/.-]{2,60}?)\s+([0-9]{4,8}|N\/A|-)\s+(\d+(?:\.\d+)?)\s+([A-Za-z]{1,8})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+(\d+(?:\.\d+)?%?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/
    );
    if (wsFullMatch) {
      parsedItems.push({
        serialNumber: wsFullMatch[1],
        description: wsFullMatch[2].trim(),
        hsnSac: wsFullMatch[3] === '-' || wsFullMatch[3] === 'N/A' ? '' : wsFullMatch[3],
        quantity: wsFullMatch[4],
        unit: wsFullMatch[5],
        rate: cleanAmountString(wsFullMatch[6]),
        discount: cleanAmountString(wsFullMatch[7]),
        taxableAmount: cleanAmountString(wsFullMatch[8]),
        taxPercentage: wsFullMatch[9].replace('%', ''),
        cgstAmount: cleanAmountString(wsFullMatch[10]),
        sgstAmount: cleanAmountString(wsFullMatch[11]),
        igstAmount: cleanAmountString(wsFullMatch[12]),
        vatAmount: cleanAmountString(wsFullMatch[13]),
        totalLineAmount: cleanAmountString(wsFullMatch[14]),
      });
      continue;
    }

    const wsCompactMatch = line.match(
      /^(\d{1,3})\s+([A-Za-z][A-Za-z0-9\s,&()\/.-]{2,55}?)\s+(\d+(?:\.\d+)?)\s+([\d,]+(?:\.\d{2})?)\s+([\d,]+(?:\.\d{2})?)\s+([\d,]+(?:\.\d{2})?)\s+([\d,]+(?:\.\d{2})?)$/
    );
    if (wsCompactMatch) {
      parsedItems.push({
        serialNumber: wsCompactMatch[1],
        description: wsCompactMatch[2].trim(),
        hsnSac: '',
        quantity: wsCompactMatch[3],
        unit: '',
        rate: cleanAmountString(wsCompactMatch[4]),
        discount: '',
        taxableAmount: cleanAmountString(wsCompactMatch[5]),
        taxPercentage: '',
        cgstAmount: '',
        sgstAmount: '',
        igstAmount: cleanAmountString(wsCompactMatch[6]),
        vatAmount: '',
        totalLineAmount: cleanAmountString(wsCompactMatch[7]),
      });
      continue;
    }
  }

  // Exact standard keys that are already mapped to standard invoice columns when invoiceNumber is present
  const exactStandardKeyRegex =
    /^(Invoice\s*(?:No\.?|Number|#)|Credit\s*Note\s*(?:No\.?|#)|Debit\s*Note\s*(?:No\.?|#)|Inv\s*No\.?|Invoice\s*Date|Date\s*of\s*Issue|Issue\s*Date|Billing\s*Date|Credit\s*Note\s*Date|Debit\s*Note\s*Date|Due\s*Date|Payment\s*Due(?:\s*Date)?|Pay\s*By|P\.?O\.?\s*(?:No\.?|Number|#)|Purchase\s*Order(?:\s*(?:No\.?|Number|#))?|Order\s*Ref|Currency|Supplier(?:\s*Name)?|Vendor(?:\s*Name)?|Seller(?:\s*Name)?|From|Billed\s*By|Issued\s*By|Supplier\s*Address|Vendor\s*Address|Seller\s*Address|From\s*Address|Registered\s*Office|Supplier\s*(?:GSTIN|VAT|TRN|Tax\s*ID)|Seller\s*(?:GSTIN|VAT|TRN)|Vendor\s*(?:GSTIN|VAT|TRN)|GSTIN|VAT\s*(?:No\.?|Reg\.?|Number)|TRN|Supplier\s*Contact|Vendor\s*Contact|Customer(?:\s*Name)?|Client(?:\s*Name)?|Bill(?:ed)?\s*To|Buyer(?:\s*Name)?|Sold\s*To|Customer\s*Address|Billing\s*Address|Bill\s*To\s*Address|Buyer\s*Address|Customer\s*(?:GSTIN|VAT|TRN|Tax\s*ID)|Buyer\s*(?:GSTIN|VAT|TRN)|Bill\s*To\s*(?:GSTIN|VAT|TRN)|Client\s*(?:GSTIN|VAT|TRN)|Ship(?:ping)?\s*(?:Address|Details|To)|Deliver(?:y)?\s*(?:Address|To)|Consignee|Sub\s*[-]?total|Total\s*Before\s*Tax|Gross\s*Amount|Total\s*Taxable\s*(?:Value|Amount)|Taxable\s*(?:Value|Subtotal)|Total\s*Discount(?:s)?|Discount\s*Total|Total\s*(?:Tax(?:es)?|GST|VAT)|Tax\s*Total|Additional\s*Charges|Freight|Shipping\s*Charges|Handling\s*Charges|Packing\s*Charges|Round\s*[-]?Off|Rounding|Grand\s*Total|Invoice\s*Total|Total\s*Amount\s*Due|Total\s*Payable|Net\s*Payable|Advance\s*Received|Balance\s*Due|Amount\s*Due|Remaining\s*Balance|Bank\s*Details|Bank\s*Account|Beneficiary\s*Bank|Remittance\s*Details|Payment\s*Terms|Terms\s*of\s*Payment|Notes|Customer\s*Notes|Invoice\s*Notes|Remarks|Declaration|Special\s*Instructions|ITEM_ROW|S\.?\s*No\.?|Sr\.?\s*No\.?)$/i;

  const additionalFields: AdditionalFieldEntry[] = [];
  const customFields: Record<string, string> = {};
  const otherInfoParts: string[] = [];

  const isStandardInvoiceDoc = Boolean(invoiceNumber || parsedItems.length > 0);

  const recordCustomField = (rawKey: string, rawVal: string) => {
    const key = rawKey
      .replace(/^[:\-\s]+|[:\-\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const val = rawVal
      .replace(/^[:\-\s]+|[:\-\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!key || !val || val.length >= 180) return;
    if (!isLikelyFieldLabel(key)) return;
    // Only skip exact standard keys if this document is a standard invoice
    if (isStandardInvoiceDoc && exactStandardKeyRegex.test(key)) return;
    if (!(key in customFields)) {
      customFields[key] = val;
      additionalFields.push({
        id: `${pdfFilename}-extra-${additionalFields.length + 1}`,
        pdfFilename,
        invoiceNumber: invoiceNumber || '',
        fieldName: key,
        fieldValue: val,
      });
      otherInfoParts.push(`${key}: ${val}`);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (rawLine.includes('|') || /^\d+\s+[A-Za-z].*\d+\.\d{2}$/.test(rawLine)) continue;

    const cleanLine = rawLine.replace(/\t+/g, ' ').trim();

    // 1. Check for timestamp lines without a colon after the label, e.g.:
    // "Generated On 19/09/2026 17:42:10" or "Challan Created Date 12-05-2025 11:20:30"
    const generatedTimestampMatch = cleanLine.match(
      /^((?:Challan\s+)?(?:Generated\s+On|Created\s+Date|Submitted\s+Date|Printed\s+On|Created\s+On|Report\s+Date|Realization\s+Date|Confirmation\s+Date|Date\s+of\s+Credit))\s*[:\-]?\s*(\d{1,4}[-\/.]\d{1,2}[-\/.]\d{1,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)?)$/i
    );
    if (generatedTimestampMatch) {
      recordCustomField(generatedTimestampMatch[1], generatedTimestampMatch[2]);
      continue;
    }

    // 2. Check for known ESIC / EPFO / Challan / Tax / Payroll labels even when separated only by spaces (no colon or tab)
    const knownChallanMatch = cleanLine.match(
      /^(Employer['’]?s?\s*Code(?:\s*No\.?)?|Employer['’]?s?\s*Name|Establishment\s*ID|Establishment\s*Name|Name\s*of\s*Establishment|Challan\s*Period|Challan\s*Number|Challan\s*No\.?|Challan\s*Status|Challan\s*Type|Challan\s*Created\s*Date|Challan\s*Submitted\s*Date|Challan\s*Generated\s*On|Wage\s*Month|Return\s*Period|Contribution\s*Period|TRRN|CRN|Transaction\s*Number|Transaction\s*ID|Transaction\s*Status|Amount\s*Paid|Total\s*Amount(?:\s*\(Rs\.?\))?|Account-\d+\s*Amount(?:\s*\(Rs\.?\))?|Employee['’]?s?\s*Contribution|Employer['’]?s?\s*Contribution|Total\s*Contribution|Damages(?:\s*Amount)?|Interest(?:\s*Amount)?|Payment\s*Type|Payment\s*Mode|Bank\s*Name|Branch\s*Name|Dues\s*for\s*the\s*Month)\s*[:\-]?\s+(.+)$/i
    );
    if (knownChallanMatch) {
      recordCustomField(knownChallanMatch[1], knownChallanMatch[2]);
      continue;
    }

    // 3. Check for tab-separated table cells from pdfExtractor (e.g. ESIC 2-column or 4-column tables without colons)
    if (rawLine.includes('\t')) {
      const tabCells = rawLine
        .split('\t')
        .map((c) => c.trim())
        .filter((c) => c.length > 0);

      // 3a. Each tab cell might itself be "Key : Value"
      let hadColonInTabCells = false;
      for (const cell of tabCells) {
        const cellKv = cell.match(/^([A-Za-z][A-Za-z0-9\s'’&\/().,_#-]{1,45}?)\s*:\s*(.+)$/);
        if (cellKv) {
          recordCustomField(cellKv[1], cellKv[2]);
          hadColonInTabCells = true;
        }
      }
      if (hadColonInTabCells) continue;

      // 3b. 2-column table row without colon: [Label, Value]
      if (tabCells.length === 2 && isLikelyFieldLabel(tabCells[0])) {
        recordCustomField(tabCells[0], tabCells[1]);
        continue;
      }

      // 3c. 4-column or 6-column side-by-side table row: [Label1, Val1, Label2, Val2]
      if (
        (tabCells.length === 4 || tabCells.length === 6) &&
        isLikelyFieldLabel(tabCells[0]) &&
        isLikelyFieldLabel(tabCells[2])
      ) {
        for (let k = 0; k < tabCells.length; k += 2) {
          if (isLikelyFieldLabel(tabCells[k]) && tabCells[k + 1]) {
            recordCustomField(tabCells[k], tabCells[k + 1]);
          }
        }
        continue;
      }

      // 3d. Horizontal multi-column header row followed by a value row on line i + 1
      if (
        tabCells.length >= 3 &&
        tabCells.every((c) => isLikelyFieldLabel(c)) &&
        i + 1 < lines.length &&
        lines[i + 1].includes('\t')
      ) {
        const nextCells = lines[i + 1]
          .split('\t')
          .map((c) => c.trim())
          .filter((c) => c.length > 0);
        if (nextCells.length === tabCells.length) {
          for (let k = 0; k < tabCells.length; k++) {
            recordCustomField(tabCells[k], nextCells[k]);
          }
          i++;
          continue;
        }
      }
    }

    // 4. Standard Key : Value line (supporting apostrophes, &, #, parens, etc.)
    const kvMatch = cleanLine.match(
      /^([A-Za-z][A-Za-z0-9\s'’&\/().,_#-]{1,45}?)\s*:\s*(.+)$/
    );
    if (kvMatch) {
      const candidateKey = kvMatch[1].trim();
      const candidateVal = kvMatch[2].trim();

      // Guard against embedded date+hour before colon (e.g. "Generated On 19/09/2026 17" : "42:10")
      const embeddedDateMatch = candidateKey.match(
        /^([A-Za-z][A-Za-z\s'’&_-]+?)\s+(\d{1,4}[-\/.]\d{1,2}[-\/.]\d{1,4}\s+\d{1,2})$/
      );
      if (embeddedDateMatch) {
        recordCustomField(embeddedDateMatch[1], `${embeddedDateMatch[2]}:${candidateVal}`);
      } else {
        recordCustomField(candidateKey, candidateVal);
      }
    }
  }

  // Fallback: if a PDF had raw text lines but zero standard fields and zero custom fields matched,
  // extract non-empty descriptive lines as custom fields so no uploaded PDF is ever completely blank
  if (
    !invoiceNumber &&
    !supplierName &&
    parsedItems.length === 0 &&
    Object.keys(customFields).length === 0 &&
    lines.length > 0
  ) {
    lines.slice(0, 12).forEach((l, idx) => {
      const cleaned = l.replace(/\t+/g, ' ').trim();
      if (cleaned) {
        recordCustomField(`Field ${idx + 1}`, cleaned);
      }
    });
  }

  const otherInfo = otherInfoParts.join(' | ');

  const baseHeader = {
    pdfFilename,
    invoiceNumber,
    invoiceDate,
    dueDate,
    poNumber,
    referenceNumber,
    currency,
    supplierName,
    supplierAddress,
    supplierTaxId,
    supplierContact,
    customerName,
    customerAddress,
    customerTaxId,
    shippingDetails,
    subtotal,
    taxableValue,
    totalDiscounts,
    totalTaxes,
    additionalCharges,
    roundOff,
    grandTotal,
    amountPaid,
    balanceDue,
    bankDetails,
    paymentTerms,
    notes,
    remarks,
    otherInfo,
    customFields,
    _extractionMethod: method,
  };

  if (parsedItems.length === 0) {
    const singleRow: InvoiceLineItemRow = validateInvoiceRow({
      _id: `${pdfFilename}-row-1`,
      ...baseHeader,
      serialNumber: '',
      description: '',
      hsnSac: '',
      quantity: '',
      unit: '',
      rate: '',
      discount: '',
      taxableAmount: '',
      taxPercentage: '',
      cgstAmount: '',
      sgstAmount: '',
      igstAmount: '',
      vatAmount: '',
      totalLineAmount: '',
      _uncertainFields: [],
      _arithmeticWarning: '',
    });
    return { rows: [singleRow], additionalFields };
  }

  const rows: InvoiceLineItemRow[] = parsedItems.map((item, idx) =>
    validateInvoiceRow({
      _id: `${pdfFilename}-row-${idx + 1}`,
      ...baseHeader,
      ...item,
      customFields: { ...customFields },
      _uncertainFields: [],
      _arithmeticWarning: '',
    })
  );

  return { rows, additionalFields };
}
