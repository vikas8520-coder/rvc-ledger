'use client';

import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  className?: string;
  allowFreeText?: boolean;
  autoFocus?: boolean;
}

/**
 * Autocomplete that portals the list to document.body so it is never clipped
 * by overflow:hidden parents or buried under later rows.
 */
export default function Autocomplete({
  options,
  value,
  onChange,
  onSubmit,
  placeholder,
  className,
  allowFreeText = true,
  autoFocus,
}: Props) {
  const [open, setOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!value.trim()) return options.slice(0, 50);
    const q = value.toLowerCase().trim();
    return options.filter((o) => o.toLowerCase().includes(q)).slice(0, 50);
  }, [options, value]);

  const place = () => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - r.bottom - gap - 8;
    const spaceAbove = r.top - gap - 8;
    const openUp = spaceBelow < 140 && spaceAbove > spaceBelow;
    const maxH = Math.max(96, Math.min(240, openUp ? spaceAbove : spaceBelow));
    const top = openUp ? r.top - gap - maxH : r.bottom + gap;
    setPos({
      top: Math.max(8, top),
      left: Math.min(r.left, window.innerWidth - Math.max(r.width, 180) - 8),
      width: Math.max(r.width, 180),
      maxH,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onWin = () => place();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
    };
  }, [open, filtered.length, value]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
      setHighlightedIdx(-1);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const selectOption = (opt: string) => {
    onChange(opt);
    setOpen(false);
    setHighlightedIdx(-1);
    onSubmit?.(opt);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true);
      if (e.key === 'Enter' && allowFreeText && value.trim()) {
        e.preventDefault();
        onSubmit?.(value);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIdx >= 0 && highlightedIdx < filtered.length) {
        selectOption(filtered[highlightedIdx]);
      } else if (allowFreeText) {
        setOpen(false);
        if (value.trim()) onSubmit?.(value);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlightedIdx(-1);
    }
  };

  const list =
    open && filtered.length > 0 && pos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={listRef}
            role="listbox"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxH,
              zIndex: 80,
            }}
            className="overflow-y-auto overscroll-contain rounded-lg border border-[var(--border-input)] bg-[var(--bg-card)] text-[var(--text-primary)] shadow-lg"
          >
            {filtered.map((opt, i) => (
              <button
                key={`${opt}-${i}`}
                type="button"
                role="option"
                aria-selected={opt === value}
                onPointerDown={(e) => {
                  e.preventDefault();
                  selectOption(opt);
                }}
                className={`flex min-h-11 w-full items-center px-3 py-2 text-left text-sm ${
                  i === highlightedIdx
                    ? 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]'
                    : 'hover:bg-[var(--bg-base)]'
                } ${opt === value ? 'font-semibold' : ''}`}
              >
                {opt}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={wrapRef} className={`relative ${className || ''}`}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlightedIdx(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="min-h-11 w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] px-2 py-2 text-base text-[var(--text-primary)] sm:text-sm"
        autoComplete="off"
      />
      {list}
    </div>
  );
}
