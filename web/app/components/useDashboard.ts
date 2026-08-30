'use client';

import { useEffect, useState } from 'react';
import { Customer } from '@/lib/types';

interface FYSummary {
  totalSales: number;
  totalPayments: number;
  totalOutstanding: number;
  customerCount: number;
}

export function useDashboard(fy?: number | null) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [fySummary, setFySummary] = useState<FYSummary | null>(null);
  const [fyUsed, setFyUsed] = useState<number | null>(null);

  useEffect(() => {
    const url = fy !== undefined && fy !== null
      ? `/api/dashboard?fy=${fy}`
      : '/api/dashboard';
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setCustomers(data);
          setConfigured(true);
        } else if (data.customers) {
          setCustomers(data.customers);
          setConfigured(data.configured ?? true);
          setFySummary(data.fySummary ?? null);
          setFyUsed(data.fy ?? null);
        }
      })
      .catch(() => setConfigured(false))
      .finally(() => setLoading(false));
  }, [fy]);

  return { customers, configured, loading, fySummary, fyUsed };
}
