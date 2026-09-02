'use client';

import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from './I18nProvider';
import { formatCustomerName, getUiLang } from '@/lib/i18n';

export interface CustomerOption {
  id: string;
  name: string;
  englishName?: string | null;
  teluguName?: string | null;
  hindiName?: string | null;
  phone?: string | null;
}

interface Props {
  customers: CustomerOption[];
  value: string | null;
  onChange: (customerId: string | null, customerName: string) => void;
  onAddNew?: () => void;
  placeholder?: string;
  className?: string;
}

export default function CustomerPicker({ customers, value, onChange, onAddNew, placeholder, className }: Props) {
  const { t, lang } = useI18n();
  const uiLang = getUiLang(lang);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => customers.find((c) => c.id === value) || null, [customers, value]);

  const filtered = useMemo(() => {
    if (!query.trim()) return customers;
    const q = query.toLowerCase().trim();
    return customers.filter((c) => {
      const displayName = formatCustomerName(c, uiLang).toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      return displayName.includes(q) || c.name.toLowerCase().includes(q) || phone.includes(q);
    });
  }, [customers, query, uiLang]);

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    // Use visualViewport when available (accounts for mobile keyboard)
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const vh = vv ? vv.height : window.innerHeight;
    const vw = vv ? vv.width : window.innerWidth;
    const vvTop = vv ? vv.offsetTop : 0;
    const vvBottom = vvTop + vh;
    const spaceBelow = vvBottom - r.bottom - gap - 8;
    const spaceAbove = r.top - vvTop - gap - 8;
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    const maxH = Math.max(140, Math.min(280, openUp ? spaceAbove : spaceBelow));
    const top = openUp ? r.top - gap - maxH : r.bottom + gap;
    const minW = vw < 640 ? Math.max(240, Math.min(vw - 16, r.width * 1.5)) : Math.max(r.width, 220);
    const width = Math.min(minW, vw - 16);
    setPos({
      top: Math.max(vvTop + 8, Math.min(top, vvBottom - maxH - 8)),
      left: Math.max(8, Math.min(r.left, vw - width - 8)),
      width,
      maxH,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onWin = () => place();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', onWin);
      vv.addEventListener('scroll', onWin);
    }
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
      if (vv) {
        vv.removeEventListener('resize', onWin);
        vv.removeEventListener('scroll', onWin);
      }
    };
  }, [open, filtered.length, query]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    function handlePointerDown(e: PointerEvent) {
      const n = e.target as Node;
      if (wrapRef.current?.contains(n) || listRef.current?.contains(n)) return;
      setOpen(false);
      setQuery('');
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  const displayLabel = selected ? formatCustomerName(selected, uiLang) : '';

  const list =
    open && pos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={listRef}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxH,
              zIndex: 80,
            }}
            className="flex flex-col overflow-hidden rounded-lg border border-[var(--border-input)] bg-[var(--bg-card)] text-[var(--text-primary)] shadow-lg"
          >
            <div className="border-b border-[var(--border-input)] p-2">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchCustomers')}
                className="min-h-11 w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-2 text-base sm:text-sm"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {filtered.length === 0 && (
                <p className="p-3 text-sm text-[var(--text-muted)]">—</p>
              )}
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(c.id, formatCustomerName(c, uiLang));
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--bg-base)] ${
                    c.id === value ? 'bg-[var(--bg-base)]' : ''
                  }`}
                >
                  <span className="truncate">
                    {formatCustomerName(c, uiLang)}
                    {c.phone && (
                      <span className="ml-2 text-xs text-[var(--text-muted)]">— {c.phone}</span>
                    )}
                  </span>
                  {c.id === value && <span className="text-[var(--bg-success)]">✓</span>}
                </button>
              ))}
            </div>
            {onAddNew && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false);
                  setQuery('');
                  onAddNew();
                }}
                className="min-h-11 border-t border-[var(--border-input)] px-3 py-2 text-left text-sm font-medium text-[var(--bg-primary)]"
              >
                + {t('addCustomer')}
              </button>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={wrapRef} className={`relative ${className || ''}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] px-2 py-2 text-left text-base text-[var(--text-primary)] sm:text-sm"
      >
        {selected ? (
          <span className="flex w-full items-center justify-between gap-2">
            <span className="truncate">
              {displayLabel}
              {selected.phone && (
                <span className="ml-2 text-xs text-[var(--text-muted)]">— {selected.phone}</span>
              )}
            </span>
            <span className="text-xs text-[var(--text-muted)]">▼</span>
          </span>
        ) : (
          <span className="text-[var(--text-muted)]">{placeholder || t('selectCustomer')}</span>
        )}
      </button>
      {list}
    </div>
  );
}
