'use client';

import { useEffect, useState } from 'react';
import { Customer } from '@/lib/types';

export function useDashboard() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setCustomers(data);
          setConfigured(true);
        } else if (data.customers) {
          setCustomers(data.customers);
          setConfigured(data.configured ?? true);
        }
      })
      .catch(() => setConfigured(false))
      .finally(() => setLoading(false));
  }, []);

  return { customers, configured, loading };
}
