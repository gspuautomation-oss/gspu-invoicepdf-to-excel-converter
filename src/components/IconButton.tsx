import React from 'react';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: 'default' | 'primary' | 'teal' | 'danger' | 'ghost';
  badge?: string | number;
  children: React.ReactNode;
}

export const IconButton: React.FC<IconButtonProps> = ({
  label,
  variant = 'default',
  badge,
  className = '',
  disabled,
  children,
  ...props
}) => {
  const baseStyles =
    'group relative inline-flex items-center justify-center rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488] focus-visible:ring-offset-2 disabled:opacity-40 disabled:pointer-events-none cursor-pointer shrink-0';

  const variantStyles: Record<string, string> = {
    default:
      'h-10 w-10 bg-white text-[#0F172A] border border-slate-200 shadow-xs hover:border-[#0D9488] hover:text-[#0D9488] active:scale-95',
    primary:
      'h-11 px-4 bg-[#0F172A] text-white shadow-sm hover:bg-[#1E293B] active:scale-95',
    teal:
      'h-11 px-4 bg-[#0D9488] text-white shadow-sm hover:bg-[#0F766E] active:scale-95',
    danger:
      'h-10 w-10 bg-white text-slate-600 border border-slate-200 hover:border-red-300 hover:bg-red-50 hover:text-red-600 active:scale-95',
    ghost:
      'h-8 w-8 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg active:scale-95',
  };

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
      {badge !== undefined && badge !== '' && (
        <span className="ml-1.5 font-mono-tabular text-xs font-semibold">
          {badge}
        </span>
      )}
    </button>
  );
};
