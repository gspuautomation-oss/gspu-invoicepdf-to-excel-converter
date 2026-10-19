import React from 'react';

export const LeftInvoiceIllustration: React.FC = () => {
  return (
    <div
      className="hidden lg:flex items-center justify-end select-none pointer-events-none shrink-0"
      aria-hidden="true"
    >
      {/* Stacked PDF Invoice Cards */}
      <div className="relative w-56 h-64">
        {/* Back Card 1 (top-left tilted) */}
        <div className="absolute top-2 left-6 w-36 h-44 rounded-xl bg-white/90 border border-slate-200/80 shadow-[0_10px_28px_rgba(15,23,42,0.06)] -rotate-6 p-3">
          <div className="inline-flex flex-col items-center justify-center px-2 py-1 rounded-md bg-[#EF4444] text-white font-bold text-[9px] leading-tight shadow-xs">
            <span className="text-[7px] opacity-80">📄</span>
            <span>PDF</span>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="h-2 w-16 rounded-full bg-slate-200/80" />
            <div className="h-1.5 w-24 rounded-full bg-slate-100" />
          </div>
        </div>

        {/* Back Card 2 (far-left tilted) */}
        <div className="absolute top-12 left-0 w-36 h-48 rounded-xl bg-white/95 border border-slate-200/80 shadow-[0_12px_30px_rgba(15,23,42,0.07)] -rotate-12 p-3">
          <div className="inline-flex flex-col items-center justify-center px-2 py-1 rounded-md bg-[#EF4444] text-white font-bold text-[9px] leading-tight shadow-xs">
            <span>PDF</span>
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-2 w-14 rounded-full bg-slate-200" />
            <div className="h-2 w-20 rounded-full bg-slate-100" />
            <div className="h-2 w-16 rounded-full bg-slate-100" />
          </div>
        </div>

        {/* Front Main INVOICE Card */}
        <div className="absolute top-8 left-11 w-44 h-52 rounded-2xl bg-white border border-slate-200/90 shadow-[0_18px_40px_rgba(15,23,42,0.10)] -rotate-3 p-4 flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-extrabold tracking-wider text-[#0F172A] uppercase">
              INVOICE
            </div>
            <div className="mt-3 flex gap-2">
              <div className="h-2 w-14 rounded-full bg-slate-200" />
              <div className="h-2 w-10 rounded-full bg-slate-200/70" />
              <div className="h-2 w-8 rounded-full bg-slate-100" />
            </div>
            <div className="mt-2.5 space-y-2">
              <div className="flex justify-between gap-2">
                <div className="h-2 w-20 rounded-full bg-slate-200/80" />
                <div className="h-2 w-10 rounded-full bg-slate-200" />
              </div>
              <div className="flex justify-between gap-2">
                <div className="h-2 w-24 rounded-full bg-slate-100" />
                <div className="h-2 w-8 rounded-full bg-slate-200/70" />
              </div>
              <div className="flex justify-between gap-2">
                <div className="h-2 w-16 rounded-full bg-slate-100" />
                <div className="h-2 w-12 rounded-full bg-slate-200/90" />
              </div>
              <div className="flex justify-between gap-2 pt-1">
                <div className="h-2.5 w-20 rounded-full bg-slate-200/80" />
                <div className="h-2.5 w-10 rounded-full bg-slate-300/80" />
              </div>
            </div>
          </div>

          {/* Red PDF Ribbon Badge on Bottom-Left */}
          <div className="relative -ml-6 -mb-2 w-11 h-12 rounded-xl bg-gradient-to-br from-[#F87171] via-[#EF4444] to-[#DC2626] shadow-[0_8px_18px_rgba(239,68,68,0.35)] flex items-center justify-center">
            <svg viewBox="0 0 32 32" className="w-6 h-6 text-white" fill="none">
              <path
                d="M16 6C14.5 11 11 18 8 22C11.5 20.5 18 17.5 24 18C20.5 15 17.5 10.5 16 6Z"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Curved Blue Arrow pointing into Upload Card */}
      <svg
        viewBox="0 0 76 60"
        className="w-16 h-14 -ml-1 mr-2 text-[#1D7AFC] drop-shadow-xs"
        fill="none"
      >
        <defs>
          <linearGradient id="leftArrowGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#93C5FD" stopOpacity="0.4" />
            <stop offset="60%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#1D4ED8" />
          </linearGradient>
        </defs>
        <path
          d="M6 26 C 26 18, 48 24, 62 42"
          stroke="url(#leftArrowGrad)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M64 30 L66 46 L50 43"
          fill="#1D7AFC"
          stroke="#1D7AFC"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

export const RightExcelIllustration: React.FC = () => {
  return (
    <div
      className="hidden lg:flex items-center justify-start select-none pointer-events-none shrink-0"
      aria-hidden="true"
    >
      {/* Curved Green Arrow pointing from Upload Card to Excel Sheet */}
      <svg
        viewBox="0 0 76 60"
        className="w-16 h-14 ml-2 -mr-1 text-[#16A34A] drop-shadow-xs"
        fill="none"
      >
        <defs>
          <linearGradient id="rightArrowGrad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#86EFAC" stopOpacity="0.4" />
            <stop offset="60%" stopColor="#22C55E" />
            <stop offset="100%" stopColor="#15803D" />
          </linearGradient>
        </defs>
        <path
          d="M8 44 C 22 22, 44 18, 64 25"
          stroke="url(#rightArrowGrad)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M58 14 L70 26 L55 32"
          fill="#16A34A"
          stroke="#16A34A"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>

      {/* Tilted White Excel Spreadsheet Card */}
      <div className="relative w-56 h-64 flex items-center justify-center">
        <div className="relative w-44 h-52 rounded-2xl bg-white border border-slate-200/90 shadow-[0_18px_40px_rgba(15,23,42,0.10)] rotate-6 p-3.5 flex flex-col">
          {/* Floating Green Excel 'X' Tile on Top-Left */}
          <div className="absolute -top-3 -left-5 flex items-center">
            <div className="w-14 h-16 rounded-xl bg-gradient-to-b from-[#34D399] via-[#10B981] to-[#047857] shadow-[0_10px_24px_rgba(16,185,129,0.35)] flex items-center justify-end pr-1.5">
              <div className="w-6 h-full bg-[#059669]/40 rounded-r-xl" />
            </div>
            <div className="absolute -left-2.5 w-10 h-10 rounded-lg bg-[#047857] shadow-md flex items-center justify-center text-white font-extrabold text-xl">
              X
            </div>
          </div>

          {/* Green Table Header Bar */}
          <div className="mt-7 h-3.5 w-full rounded-t-md bg-gradient-to-r from-[#10B981] to-[#34D399]" />

          {/* Spreadsheet Grid Rows & Columns */}
          <div className="flex-1 border-x border-b border-slate-200 rounded-b-md grid grid-cols-3 divide-x divide-slate-200 overflow-hidden bg-slate-50/30">
            <div className="divide-y divide-slate-200 flex flex-col">
              {Array.from({ length: 7 }).map((_, idx) => (
                <div key={idx} className="flex-1 px-1.5 flex items-center">
                  <div className="h-1.5 w-full rounded-full bg-slate-200/70" />
                </div>
              ))}
            </div>
            <div className="divide-y divide-slate-200 flex flex-col">
              {Array.from({ length: 7 }).map((_, idx) => (
                <div key={idx} className="flex-1 px-1.5 flex items-center">
                  <div className="h-1.5 w-4/5 rounded-full bg-slate-200/60" />
                </div>
              ))}
            </div>
            <div className="divide-y divide-slate-200 flex flex-col">
              {Array.from({ length: 7 }).map((_, idx) => (
                <div key={idx} className="flex-1 px-1.5 flex items-center justify-end">
                  <div className="h-1.5 w-3/4 rounded-full bg-emerald-200/70" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
