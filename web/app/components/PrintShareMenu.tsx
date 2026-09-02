'use client';

import { useState, useRef, useEffect } from 'react';
import { PrinterIcon } from './Icons';

export interface PrintOption {
  key: string;
  label: string;
  onPrint: () => void;
  onShare?: () => void;
}

interface Props {
  options: PrintOption[];
  disabled?: boolean;
  label?: string;
}

export default function PrintShareMenu({ options, disabled, label = 'Print / Share' }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'generating' | 'sharing'>('idle');
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const btnLabel = status === 'generating' ? 'Generating…' : status === 'sharing' ? 'Sharing…' : label;

  return (
    <span className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || status !== 'idle'}
        className="flex min-h-11 items-center gap-1.5 rounded-lg bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-on-primary)] hover:bg-[var(--bg-primary-hover)] disabled:opacity-40"
      >
        <PrinterIcon size={14} /> {btnLabel} ▾
      </button>
      {open && (
        <span className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-[var(--border-input)] bg-[var(--bg-card)] p-1 text-[var(--text-primary)] shadow-lg">
          {options.map((opt, i) => (
            <div key={opt.key} className={i > 0 ? 'border-t border-[var(--border-light)] px-2 py-1.5' : 'px-2 py-1.5'}>
              <p className="text-xs font-semibold text-[var(--text-secondary)]">{opt.label}</p>
              <div className="mt-1 flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    opt.onPrint();
                  }}
                  className="flex-1 rounded-md bg-[var(--bg-base)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]"
                >
                  🖨 Print
                </button>
                {opt.onShare && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      opt.onShare!();
                    }}
                    className="flex-1 rounded-md bg-[var(--bg-base)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]"
                  >
                    📤 Share
                  </button>
                )}
              </div>
            </div>
          ))}
        </span>
      )}
    </span>
  );
}
