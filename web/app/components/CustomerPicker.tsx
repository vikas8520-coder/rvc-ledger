'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
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
  value: string | null; // customerId
  onChange: (customerId: string | null, customerName: string) => void;
  onAddNew?: () => void; // opens the Add Customer modal in the parent
  placeholder?: string;
  className?: string;
}

export default function CustomerPicker({ customers, value, onChange, onAddNew, placeholder, className }: Props) {
  const { t, lang } = useI18n();
  const uiLang = getUiLang(lang);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const displayLabel = selected ? formatCustomerName(selected, uiLang) : '';

  return (
    <div ref={ref} className={`relative ${className || ''}`}>
      {/* Selected customer chip or trigger */}
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-left text-sm"
      >
        {selected ? (
          <span className="flex items-center justify-between gap-2">
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

      {/* Dropdown */}
      {open && (
        <div className="absolute z-[100] mt-1 w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-card)] shadow-lg max-h-64 overflow-hidden flex flex-col">
          {/* Search input */}
          <div className="border-b border-[var(--border-input)] p-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchCustomers')}
              className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] p-1.5 text-sm"
            />
          </div>

          {/* Customer list */}
          <div className="overflow-y-auto flex-1 overscroll-contain">
            {filtered.length === 0 && (
              <p className="p-3 text-sm text-[var(--text-muted)]">—</p>
            )}
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange(c.id, formatCustomerName(c, uiLang));
                  setOpen(false);
                  setQuery('');
                }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--bg-base)] active:bg-[var(--bg-base)] ${
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

          {/* Add new customer button */}
          {onAddNew && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setQuery('');
                onAddNew();
              }}
              className="border-t border-[var(--border-input)] px-3 py-2 text-left text-sm font-medium text-[var(--bg-primary)] hover:bg-[var(--bg-base)]"
            >
              + {t('addCustomer')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
