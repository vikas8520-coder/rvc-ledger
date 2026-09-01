'use client';

import { useState, useRef, useEffect, useMemo } from 'react';

interface Props {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  allowFreeText?: boolean;
}

/**
 * Reusable autocomplete input that works on both mobile and desktop.
 * Shows a dropdown of filtered options when the input is focused.
 * Allows free text entry (for new values not in the list).
 */
export default function Autocomplete({
  options,
  value,
  onChange,
  placeholder,
  className,
  allowFreeText = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!value.trim()) return options.slice(0, 50);
    const q = value.toLowerCase().trim();
    return options.filter((o) => o.toLowerCase().includes(q)).slice(0, 50);
  }, [options, value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setHighlightedIdx(-1);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const selectOption = (opt: string) => {
    onChange(opt);
    setOpen(false);
    setHighlightedIdx(-1);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true);
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
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlightedIdx(-1);
    }
  };

  return (
    <div ref={ref} className={`relative ${className || ''}`}>
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
        className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm"
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-[100] mt-1 w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-card)] shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((opt, i) => (
            <button
              key={opt}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                selectOption(opt);
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                selectOption(opt);
              }}
              className={`flex w-full items-center px-3 py-2 text-left text-sm ${
                i === highlightedIdx
                  ? 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]'
                  : 'hover:bg-[var(--bg-base)]'
              } ${opt === value ? 'font-semibold' : ''}`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
