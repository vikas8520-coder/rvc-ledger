'use client';

import { useI18n } from '../components/I18nProvider';

export default function SettingsPage() {
  const { t } = useI18n();

  const downloadBackup = () => {
    window.location.href = '/api/backup';
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{t('settings')}</h1>

      <section className="rounded-lg bg-[#e8e0d2] p-4">
        <h2 className="text-sm font-semibold">{t('downloadBackup')}</h2>
        <p className="mt-1 text-xs text-[#8a7a6a]">{t('backupHelp')}</p>
        <button
          onClick={downloadBackup}
          className="mt-3 rounded-md bg-[#2d6b4f] px-4 py-2 text-sm font-semibold text-white"
        >
          {t('downloadBackup')}
        </button>
      </section>
    </div>
  );
}
