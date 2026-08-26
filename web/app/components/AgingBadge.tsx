'use client';

import { AgingInfo, agingColor } from '@/lib/statement';
import { useI18n } from './I18nProvider';

export default function AgingBadge({ aging }: { aging: AgingInfo }) {
  const { t } = useI18n();
  if (aging.bucket === 'clear') return null;

  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${agingColor(aging)}`}>
      {aging.oldestDays} {t('days')}
    </span>
  );
}
