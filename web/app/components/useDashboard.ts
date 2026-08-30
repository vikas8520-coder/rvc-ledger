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

// Client-side cache: avoid re-fetching dashboard data on every page navigation.
// Keyed by FY parameter. TTL of 30 seconds — short enough for fresh data,
// long enough to avoid re-fetching when navigating between pages.
const DASHBOARD_CACHE = new Map<string, CachedData>();
const CACHE_TTL_MS = 30_000; // 30 seconds

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

    // Check cache first — show cached data immediately if fresh
    const cached = DASHBOARD_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      setCustomers(cached.customers);
      setConfigured(cached.configured);
      setFySummary(cached.fySummary);
      setFyUsed(cached.fyUsed);
      setLoading(false);
      return; // No re-fetch needed within TTL
    }

    // If we have stale cached data, show it immediately but re-fetch in background
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
