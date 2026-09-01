'use client';

import Link from 'next/link';
import { useI18n } from '../components/I18nProvider';
import {
  TruckIcon,
  StoreIcon,
  CameraIcon,
  PackageIcon,
  BoxIcon,
  ChartIcon,
  SettingsIcon,
  CalendarIcon,
} from '../components/Icons';

export default function MiscPage() {
  const { t } = useI18n();
  const items = [
    { href: '/receive', icon: TruckIcon, title: t('receiveStock'), note: 'Stock in only — daily work is Data Entry' },
    { href: '/sell', icon: StoreIcon, title: t('sell'), note: 'Day grid + extra sale tools' },
    { href: '/upload', icon: CameraIcon, title: t('uploadBill'), note: 'Photo of a bill' },
    { href: '/stock', icon: PackageIcon, title: 'Stock' },
    { href: '/purchases', icon: BoxIcon, title: t('navPurchases') },
    { href: '/expenses', icon: ChartIcon, title: 'Expenses' },
    { href: '/wastage', icon: BoxIcon, title: 'Wastage' },
    { href: '/daily', icon: CalendarIcon, title: 'Daily sheet' },
    { href: '/settings', icon: SettingsIcon, title: t('settings') },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">{t('navMisc')}</h1>
        <p className="text-xs text-[var(--text-muted)]">{t('miscHelp')}</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-start gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 hover:bg-[var(--bg-card-hover)]"
            >
              <Icon size={20} className="mt-0.5 shrink-0" />
              <span>
                <span className="block text-sm font-semibold">{item.title}</span>
                {item.note && <span className="text-xs text-[var(--text-muted)]">{item.note}</span>}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
