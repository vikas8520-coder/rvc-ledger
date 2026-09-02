'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useI18n } from '../../components/I18nProvider';
import { Card, SectionHeader, StatCard, EmptyState, ListSkeleton, PageHeader, Button } from '../../components/ui';
import { StoreIcon, PrinterIcon, TrendingIcon, DollarIcon, PackageIcon, CalendarIcon } from '../../components/Icons';
import { fmt } from '@/lib/format';
import { printFarmerPatti, type FarmerPattiData, type ShopProfile } from '@/lib/billPrint';

interface PattiHistoryEntry {
  date: string;
  gross: number;
  bags: number;
  kgs: number;
  hamali: number;
  lineCount: number;
  customers: string[];
}

interface FarmerSummary {
  farmer: string;
  totalSales: number;
  totalBags: number;
  totalKgs: number;
  totalHamali: number;
  commission: number;
  netPayable: number;
  lineCount: number;
}

export default function FarmerDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ name: string }>();
  const farmerName = decodeURIComponent(params.name);

  const [summary, setSummary] = useState<FarmerSummary | null>(null);
  const [history, setHistory] = useState<PattiHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState<ShopProfile>({});
  const [commissionPct, setCommissionPct] = useState<number | null>(null);
  const [printLoading, setPrintLoading] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      setLoading(true);
      // Get FY summary — find this farmer in the full list
      fetch('/api/farmers')
        .then((r) => r.json())
        .then((d) => {
          const found = (d.farmers || []).find((f: FarmerSummary) => f.farmer === farmerName);
          setSummary(found || null);
        })
        .catch(() => setSummary(null));

      // Get patti history (all dates)
      fetch(`/api/farmers?history=1&farmer=${encodeURIComponent(farmerName)}`)
        .then((r) => r.json())
        .then((d) => setHistory(d.history || []))
        .catch(() => setHistory([]))
        .finally(() => setLoading(false));

      fetch('/api/settings')
        .then((r) => r.json())
        .then((d) => {
          const s = d.settings || {};
          setShop({ shopName: s.shopName, shopAddress: s.shopAddress, shopPhone: s.shopPhone });
          const pct = s.commissionPct;
          if (pct) setCommissionPct(Number(pct));
        })
        .catch(() => {});
    };
    load();
  }, [farmerName]);

  const printDate = async (date: string) => {
    setPrintLoading(date);
    try {
      const res = await fetch(`/api/farmers?date=${date}&farmer=${encodeURIComponent(farmerName)}`);
      if (!res.ok) throw new Error('No patti for this date');
      const data = await res.json();
      const patti: FarmerPattiData = data.patti;
      // Fill in charges from summary if available
      printFarmerPatti({
        ...patti,
        bardan: 0,
        freight: 0,
        advance: 0,
        packing: 0,
        other: 0,
      }, shop);
    } catch {
      // ignore
    } finally {
      setPrintLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title={farmerName} />
        <ListSkeleton rows={5} />
      </div>
    );
  }

  const totalGross = history.reduce((s, h) => s + h.gross, 0);
  const totalBags = history.reduce((s, h) => s + h.bags, 0);
  const totalKgs = history.reduce((s, h) => s + h.kgs, 0);
  const totalHamali = history.reduce((s, h) => s + h.hamali, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/farmers" className="text-[var(--bg-primary)] hover:underline">← {t('navFarmers')}</Link>
      </div>
      <PageHeader title={farmerName} subtitle={t('farmerDetail')} />

      {/* FY Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard label={t('fySales')} value={fmt(summary.totalSales)} icon={<TrendingIcon size={14} />} />
          <StatCard label={t('netPayable')} value={fmt(summary.netPayable)} accent="success" icon={<DollarIcon size={14} />} />
          <StatCard label={t('totalBags')} value={String(summary.totalBags)} icon={<PackageIcon size={14} />} />
          <StatCard label={t('totalKgs')} value={String(summary.totalKgs)} icon={<PackageIcon size={14} />} />
        </div>
      )}

      {commissionPct != null && summary && (
        <Card>
          <SectionHeader title={t('farmerSummary')} icon={<TrendingIcon size={16} />} />
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <span className="text-[var(--text-muted)]">{t('fySales')}</span>
            <span className="text-right tabular-nums">{fmt(summary.totalSales)}</span>
            <span className="text-[var(--text-muted)]">{t('commissionEarned')} ({commissionPct}%)</span>
            <span className="text-right tabular-nums text-[var(--bg-primary)]">{fmt(summary.commission)}</span>
            <span className="text-[var(--text-muted)]">{t('hamali')}</span>
            <span className="text-right tabular-nums">{fmt(summary.totalHamali)}</span>
            <span className="font-semibold">{t('netPayable')}</span>
            <span className="text-right font-semibold tabular-nums text-[var(--bg-success)]">{fmt(summary.netPayable)}</span>
          </div>
        </Card>
      )}

      {/* Patti history — table of all dates */}
      <Card padding="p-0">
        <div className="px-4 pt-4">
          <SectionHeader title={t('pattiHistory')} icon={<CalendarIcon size={16} />} />
        </div>
        {history.length === 0 ? (
          <div className="px-4 py-6">
            <EmptyState
              icon={<StoreIcon size={48} />}
              title={t('noPattiHistory')}
              description={t('noPattiHistoryHint')}
              action={{ label: t('navDataEntry'), href: '/entry' }}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-light)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-4 py-2">{t('date')}</th>
                  <th className="px-2 py-2 text-right">{t('lines')}</th>
                  <th className="px-2 py-2 text-right">{t('bags')}</th>
                  <th className="px-2 py-2 text-right">{t('kgs')}</th>
                  <th className="px-2 py-2 text-right">{t('hamali')}</th>
                  <th className="px-2 py-2 text-right">{t('amount')}</th>
                  <th className="px-2 py-2">{t('buyers')}</th>
                  <th className="px-4 py-2 text-center">{t('printPatti')}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.date} className="border-b border-[var(--border-light)]">
                    <td className="px-4 py-2 font-medium">{h.date}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">{h.lineCount}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{h.bags > 0 ? h.bags : '—'}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{h.kgs > 0 ? h.kgs : '—'}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">{h.hamali > 0 ? fmt(h.hamali) : '—'}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium">{fmt(h.gross)}</td>
                    <td className="px-2 py-2 text-xs text-[var(--text-muted)]">
                      {h.customers.slice(0, 3).join(', ')}
                      {h.customers.length > 3 ? ` +${h.customers.length - 3}` : ''}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => printDate(h.date)}
                        disabled={printLoading === h.date}
                        className="rounded px-2 py-0.5 text-xs text-[var(--bg-primary)] hover:bg-[var(--bg-base)] disabled:opacity-30"
                        title={t('printPatti')}
                      >
                        {printLoading === h.date ? '…' : <PrinterIcon size={14} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--bg-primary)] font-bold">
                  <td className="px-4 py-2">{t('total')}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{history.reduce((s, h) => s + h.lineCount, 0)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{totalBags}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{totalKgs}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmt(totalHamali)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmt(totalGross)}</td>
                  <td className="px-2 py-2" colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Link href="/entry" className="flex-1">
          <Button variant="outline" className="w-full">
            {t('newEntry')}
          </Button>
        </Link>
        <Link href="/print" className="flex-1">
          <Button variant="outline" className="w-full">
            {t('navPrint')}
          </Button>
        </Link>
      </div>
    </div>
  );
}
