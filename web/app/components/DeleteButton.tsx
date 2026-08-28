'use client';

import { useI18n } from './I18nProvider';

export default function DeleteButton({ id }: { id: string }) {
  const { t } = useI18n();
  const handleDelete = async () => {
    if (!confirm(t('confirmDelete'))) return;
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      window.location.reload();
    } catch (err: any) {
      alert(err.message || 'Delete failed');
    }
  };

  return (
    <button
      onClick={handleDelete}
      className="text-xs text-[var(--bg-primary)] hover:underline"
    >
      {t('delete')}
    </button>
  );
}
