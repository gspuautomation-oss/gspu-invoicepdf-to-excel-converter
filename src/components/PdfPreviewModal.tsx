import React from 'react';
import { X, FileText, ExternalLink } from 'lucide-react';
import type { InvoiceLineItemRow } from '../types/invoice';

interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  filename: string;
  pdfObjectUrl: string | null;
  invoiceRows: InvoiceLineItemRow[];
}

export const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({
  isOpen,
  onClose,
  filename,
  pdfObjectUrl,
  invoiceRows,
}) => {
  if (!isOpen) return null;

  const firstRow = invoiceRows[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${filename}`}
    >
      <div className="relative flex flex-col w-full max-w-5xl h-[85vh] bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        {/* Minimal Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-4 h-4 text-[#0D9488] shrink-0" />
            <span className="text-sm font-semibold text-slate-900 truncate">
              {filename}
            </span>
            {firstRow?.invoiceNumber && (
              <>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="font-mono-tabular text-xs text-slate-600">
                  {firstRow.invoiceNumber}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {pdfObjectUrl && (
              <a
                href={pdfObjectUrl}
                download={filename}
                aria-label={`Download original ${filename}`}
                title="Download original PDF"
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-[#0D9488] hover:bg-slate-200/60 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close PDF preview"
              title="Close"
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body: Document Sheet Preview + Structured Breakdown */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0">
          {/* Left: High-Contrast Document Sheet Representation of Source PDF */}
          <div className="lg:col-span-8 h-full bg-slate-100/90 border-r border-slate-200 overflow-y-auto p-6">
            {firstRow ? (
              <div className="max-w-2xl mx-auto bg-white rounded-xl border border-slate-200/90 shadow-xs p-7 space-y-5 text-xs text-slate-800">
                <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
                  <div>
                    <div className="text-base font-bold text-[#0F172A]">
                      {firstRow.supplierName || 'Supplier'}
                    </div>
                    <div className="text-slate-500 mt-0.5">
                      {firstRow.supplierAddress}
                    </div>
                    {firstRow.supplierTaxId && (
                      <div className="font-mono-tabular text-[11px] text-slate-600 mt-1">
                        Tax ID: {firstRow.supplierTaxId}
                      </div>
                    )}
                    {firstRow.supplierContact && (
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {firstRow.supplierContact}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono-tabular text-sm font-bold text-[#0F172A]">
                      {firstRow.invoiceNumber || '—'}
                    </div>
                    <div className="font-mono-tabular text-[11px] text-slate-500 mt-1">
                      Date: {firstRow.invoiceDate || '—'}
                    </div>
                    {firstRow.dueDate && (
                      <div className="font-mono-tabular text-[11px] text-slate-500">
                        Due: {firstRow.dueDate}
                      </div>
                    )}
                    {firstRow.poNumber && (
                      <div className="font-mono-tabular text-[11px] text-slate-500">
                        PO: {firstRow.poNumber}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-400">
                      Billed To
                    </div>
                    <div className="font-semibold text-slate-900 mt-0.5">
                      {firstRow.customerName || '—'}
                    </div>
                    <div className="text-slate-500 mt-0.5">
                      {firstRow.customerAddress}
                    </div>
                    {firstRow.customerTaxId && (
                      <div className="font-mono-tabular text-[11px] text-slate-600 mt-0.5">
                        Tax ID: {firstRow.customerTaxId}
                      </div>
                    )}
                  </div>
                  {firstRow.shippingDetails && (
                    <div>
                      <div className="text-[11px] font-semibold text-slate-400">
                        Shipping Details
                      </div>
                      <div className="text-slate-700 mt-0.5">
                        {firstRow.shippingDetails}
                      </div>
                    </div>
                  )}
                </div>

                {/* Line Items Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] text-slate-500">
                        <th className="py-2 pr-2">#</th>
                        <th className="py-2 pr-2">Description</th>
                        <th className="py-2 pr-2">HSN/SAC</th>
                        <th className="py-2 pr-2 text-right">Qty</th>
                        <th className="py-2 pr-2 text-right">Rate</th>
                        <th className="py-2 pr-2 text-right">Taxable</th>
                        <th className="py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono-tabular text-[11px]">
                      {invoiceRows.map((item, idx) => (
                        <tr key={item._id || idx}>
                          <td className="py-2 pr-2 text-slate-500">
                            {item.serialNumber || idx + 1}
                          </td>
                          <td className="py-2 pr-2 font-sans font-medium text-slate-900">
                            {item.description || '—'}
                          </td>
                          <td className="py-2 pr-2 text-slate-600">
                            {item.hsnSac || '—'}
                          </td>
                          <td className="py-2 pr-2 text-right">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="py-2 pr-2 text-right">{item.rate}</td>
                          <td className="py-2 pr-2 text-right">
                            {item.taxableAmount}
                          </td>
                          <td className="py-2 text-right font-semibold text-slate-900">
                            {item.totalLineAmount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Footer Totals & Bank Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-200">
                  <div className="space-y-1 text-[11px] text-slate-600">
                    {firstRow.bankDetails && (
                      <div>
                        <span className="font-semibold text-slate-700">Bank: </span>
                        {firstRow.bankDetails}
                      </div>
                    )}
                    {firstRow.paymentTerms && (
                      <div>
                        <span className="font-semibold text-slate-700">Terms: </span>
                        {firstRow.paymentTerms}
                      </div>
                    )}
                    {firstRow.notes && (
                      <div>
                        <span className="font-semibold text-slate-700">Notes: </span>
                        {firstRow.notes}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 font-mono-tabular text-right text-xs">
                    <div className="flex justify-between text-slate-500">
                      <span>Taxable Value</span>
                      <span>{firstRow.taxableValue || firstRow.subtotal || '—'}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Total Taxes</span>
                      <span>{firstRow.totalTaxes || '0.00'}</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-100">
                      <span>Grand Total ({firstRow.currency})</span>
                      <span className="text-[#0D9488]">{firstRow.grandTotal || '—'}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Right: Quick Metadata Summary */}
          <div className="lg:col-span-4 h-full overflow-y-auto p-5 space-y-4 bg-white">
            {firstRow && (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2.5 pb-3 border-b border-slate-100">
                  <div>
                    <div className="text-slate-400">Invoice No.</div>
                    <div className="font-mono-tabular font-semibold text-slate-900 mt-0.5">
                      {firstRow.invoiceNumber || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Invoice Date</div>
                    <div className="font-mono-tabular text-slate-800 mt-0.5">
                      {firstRow.invoiceDate || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Currency</div>
                    <div className="font-mono-tabular font-semibold text-slate-800 mt-0.5">
                      {firstRow.currency || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Balance Due</div>
                    <div className="font-mono-tabular font-semibold text-slate-800 mt-0.5">
                      {firstRow.balanceDue || '0.00'}
                    </div>
                  </div>
                </div>

                {firstRow.otherInfo && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                    <div className="text-slate-400 font-medium">Additional Fields</div>
                    <div className="text-slate-700 font-mono-tabular text-[11px]">
                      {firstRow.otherInfo}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="text-slate-400 font-medium">
                    Extracted Line Items ({invoiceRows.length})
                  </div>
                  {invoiceRows.map((r, i) => (
                    <div
                      key={r._id || i}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 truncate">
                          {r.description || '—'}
                        </div>
                        <div className="font-mono-tabular text-[11px] text-slate-500">
                          {r.quantity} {r.unit} × {r.rate}
                        </div>
                      </div>
                      <div className="font-mono-tabular font-semibold text-slate-900 shrink-0">
                        {r.totalLineAmount}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
