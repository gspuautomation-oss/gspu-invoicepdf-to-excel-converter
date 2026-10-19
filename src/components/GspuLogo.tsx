import React, { useState } from 'react';

interface GspuLogoProps {
  compact?: boolean;
}

export const GspuLogo: React.FC<GspuLogoProps> = ({ compact = false }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      tabIndex={0}
      role="img"
      aria-label="GSPU Management Consulting"
      data-testid="gspu-company-logo"
      className={`relative inline-flex flex-col items-center justify-center select-none cursor-pointer transition-all duration-300 ease-out outline-none ${
        compact ? 'py-1 px-3' : 'py-2.5 px-6'
      } ${
        isHovered
          ? 'scale-110 -translate-y-1.5 z-30'
          : 'scale-100 translate-y-0 z-20'
      }`}
    >
      {/* Pop-up Glass Card Halo when cursor touches logo */}
      <div
        className={`absolute inset-0 rounded-2xl transition-all duration-300 pointer-events-none ${
          isHovered
            ? 'bg-white/95 shadow-[0_20px_50px_rgba(11,110,253,0.22),0_0_25px_rgba(93,174,73,0.18)] border border-blue-200/80 scale-105 opacity-100'
            : 'bg-transparent opacity-0 scale-95'
        }`}
      />

      <div className="relative flex items-center gap-3.5">
        {/* Ascending 3-Bar Chart Icon with White Up-Right Arrow */}
        <svg
          viewBox="0 0 100 92"
          className={`${
            compact ? 'w-9 h-9' : 'w-14 h-14 sm:w-16 sm:h-16'
          } transition-transform duration-300 ${isHovered ? 'rotate-[-2deg] scale-105' : ''}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="gspuBar1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6BB64A" />
              <stop offset="100%" stopColor="#549F3E" />
            </linearGradient>
            <linearGradient id="gspuBar2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B9778" />
              <stop offset="100%" stopColor="#2E856E" />
            </linearGradient>
            <linearGradient id="gspuBar3" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0575C6" />
              <stop offset="100%" stopColor="#0060AD" />
            </linearGradient>
          </defs>

          {/* Left Green Bar (slanted top) */}
          <polygon points="8,54 23,44 23,86 8,86" fill="url(#gspuBar1)" />

          {/* Middle Teal-Green Bar (slanted top) */}
          <polygon points="27,41 47,28 47,86 27,86" fill="url(#gspuBar2)" />

          {/* Right Wide Blue Polygon Bar (slanted top to peak) */}
          <polygon points="51,25 95,2 95,86 51,86" fill="url(#gspuBar3)" />

          {/* White Diagonal Growth Arrow inside the Blue Bar */}
          <path
            d="M49 86 L77 56 L70 51 L86 45 L83 62 L77 57 L54 86 Z"
            fill="#FFFFFF"
          />
        </svg>

        {/* GSPU MANAGEMENT CONSULTING Typography */}
        <div className="flex flex-col items-start leading-none">
          <span
            className={`${
              compact ? 'text-2xl' : 'text-4xl sm:text-5xl'
            } font-semibold tracking-[0.04em] bg-gradient-to-r from-[#5DAE49] via-[#1C82AD] to-[#0066B3] bg-clip-text text-transparent`}
            style={{ fontFamily: "'Crimson Text', Georgia, serif" }}
          >
            GSPU
          </span>
          <span
            className={`${
              compact ? 'text-[7.5px] mt-0.5' : 'text-[10px] sm:text-[11px] mt-1'
            } font-semibold tracking-[0.14em] uppercase bg-gradient-to-r from-[#0B72B9] via-[#2E8B6E] to-[#63B347] bg-clip-text text-transparent whitespace-nowrap`}
          >
            MANAGEMENT CONSULTING
          </span>
        </div>
      </div>

      {/* Interactive Pop-up Badge shown when cursor touches the logo */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-out flex items-center gap-1.5 ${
          isHovered
            ? 'max-h-8 opacity-100 mt-1.5 translate-y-0'
            : 'max-h-0 opacity-0 mt-0 -translate-y-1'
        }`}
      >
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-gradient-to-r from-[#5DAE49] to-[#0066B3] animate-pulse" />
        <span className="text-[10px] font-medium tracking-wider uppercase text-slate-500">
          GSPU Invoice Automation Suite
        </span>
      </div>
    </div>
  );
};
