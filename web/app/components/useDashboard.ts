'use client';

import { useEffect, useState, useRef } from 'react';
import { Customer } from '@/lib/types';

interface FYSummary {
  totalSales: number;
  totalPayments: number;
  totalOutstanding: number;
  customerCount: number;
}

interface CachedData {
  customers: Customer[];
  configured: boolean;
  fySummary: FYSummary | null;
  fyUsed: number | null;
  timestamp: number;
}

// Client-side cache: show cached data immediately for smooth UX, but
// ALWAYS re-fetch in the background to ensure fresh data after saves.
// Keyed by FY parameter.
const DASHBOARD_CACHE = new Map<string, CachedData>();

export function useDashboard(fy?: number | null) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [fySummary, setFySummary] = useState<FYSummary | null>(null);
  const [fyUsed, setFyUsed] = useState<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const cacheKey = String(fy ?? 'current');
    const url = fy !== undefined && fy !== null
      ? `/api/dashboard?fy=${fy}`
      : '/api/dashboard';

    // Show cached data immediately if available (smooth UX), but
    // ALWAYS re-fetch in the background to catch recent saves.
    const cached = DASHBOARD_CACHE.get(cacheKey);
    if (cached) {
      setCustomers(cached.customers);
      setConfigured(cached.configured);
      setFySummary(cached.fySummary);
      setFyUsed(cached.fyUsed);
      setLoading(false);
    }

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (!mountedRef.current) return;
        if (Array.isArray(data)) {
          setCustomers(data);
          setConfigured(true);
          DASHBOARD_CACHE.set(cacheKey, {
            customers: data, configured: true, fySummary: null, fyUsed: null,
            timestamp: Date.now(),
          });
        } else if (data.customers) {
          setCustomers(data.customers);
          setConfigured(data.configured ?? true);
          setFySummary(data.fySummary ?? null);
          setFyUsed(data.fy ?? null);
          DASHBOARD_CACHE.set(cacheKey, {
            customers: data.customers,
            configured: data.configured ?? true,
            fySummary: data.fySummary ?? null,
            fyUsed: data.fy ?? null,
            timestamp: Date.now(),
          });
        }
      })
      .catch(() => { if (mountedRef.current) setConfigured(false); })
      .finally(() => { if (mountedRef.current) setLoading(false); });

    return () => { mountedRef.current = false; };
  }, [fy]);

  return { customers, configured, loading, fySummary, fyUsed };
}
