export interface AdditionalFieldEntry {
  id: string;
  pdfFilename: string;
  invoiceNumber: string;
  fieldName: string;
  fieldValue: string;
}

export interface InvoiceLineItemRow {
  _id: string;
  pdfFilename: string;

  // 1. Invoice Information
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  poNumber: string;
  referenceNumber: string;
  currency: string;

  // 2. Supplier Information
  supplierName: string;
  supplierAddress: string;
  supplierTaxId: string; // GSTIN / VAT / TRN
  supplierContact: string;

  // 3. Customer Information
  customerName: string;
  customerAddress: string;
  customerTaxId: string; // GSTIN / VAT / TRN
  shippingDetails: string;

  // 4. Detailed Invoice Line Items
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

  // 5. Invoice Totals
  subtotal: string;
  taxableValue: string;
  totalDiscounts: string;
  totalTaxes: string;
  additionalCharges: string;
  roundOff: string;
  grandTotal: string;
  amountPaid: string;
  balanceDue: string;

  // 6. Additional Information
  bankDetails: string;
  paymentTerms: string;
  notes: string;
  remarks: string;
  otherInfo: string;

  // 7. Dynamic / Custom Extracted Columns (Field Name -> Corresponding Row Value)
  customFields: Record<string, string>;

  // Validation & Review metadata (not exported as data columns, used for UI highlighting)
  _uncertainFields: string[];
  _arithmeticWarning: string;
  _extractionMethod: 'digital-text' | 'ocr' | 'manual';
}

export interface FileExtractionResult {
  filename: string;
  status: 'success' | 'error';
  errorMessage?: string;
  rows: InvoiceLineItemRow[];
  additionalFields: AdditionalFieldEntry[];
  pageCount: number;
  method: 'digital-text' | 'ocr';
}

export interface BatchExtractionResponse {
  results: FileExtractionResult[];
  rows: InvoiceLineItemRow[];
  additionalFields: AdditionalFieldEntry[];
}
