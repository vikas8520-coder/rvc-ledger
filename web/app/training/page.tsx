'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useI18n } from '../components/I18nProvider';
import { Card, SectionHeader, Button, EmptyState, PageHeader, Badge } from '../components/ui';
import { CameraIcon, CheckIcon, PlusIcon, GraduationIcon } from '../components/Icons';
import { recognizeBill, OcrProgress } from '@/lib/ocr';
import { parseBillText } from '@/lib/parser';
import { classifyScript, setRuntimeAliases, extractEnglish } from '@/lib/catalog';

interface TrainingItem {
  raw: string;
  confirmed: string;
  amount: number;
  qty: string;
  rate: string;
  aliasSaved: boolean;
}

interface ImageBatch {
  file: File;
  ocrText: string;
  items: TrainingItem[];
  unparsed: string[];
  processed: boolean;
}

export default function TrainingPage() {
  const { t, ocrLangs } = useI18n();
  const [batches, setBatches] = useState<ImageBatch[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [processing, setProcessing] = useState(false);
  const [aliasCount, setAliasCount] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [manualRaw, setManualRaw] = useState('');
  const [manualConfirmed, setManualConfirmed] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load existing alias count
    fetch('/api/catalog/aliases')
      .then((r) => r.json())
      .then((d) => {
        if (d.aliases) {
          setAliasCount(Object.keys(d.aliases).length);
          setRuntimeAliases(d.aliases);
        }
      })
      .catch(() => {});
  }, []);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newBatches: ImageBatch[] = files.map((file) => ({
      file,
      ocrText: '',
      items: [],
      unparsed: [],
      processed: false,
    }));

    setBatches((prev) => [...prev, ...newBatches]);
    setProcessing(true);

    // Process each new image
    for (let i = 0; i < newBatches.length; i++) {
      const batchIdx = batches.length + i;
      setCurrentIdx(batchIdx);
      setOcrProgress(null);

      try {
        const text = await recognizeBill(newBatches[i].file, ocrLangs, setOcrProgress);
        const parsed = parseBillText(text);

        const items: TrainingItem[] = parsed.items.map((it) => ({
          raw: it.raw_text,
          confirmed: it.confirmed_name,
          amount: it.amount,
          qty: it.qty || '',
          rate: it.rate || '',
          aliasSaved: false,
        }));

        setBatches((prev) => {
          const next = [...prev];
          next[batchIdx] = {
            ...next[batchIdx],
            ocrText: text,
            items,
            unparsed: parsed.unparsedLines,
            processed: true,
          };
          return next;
        });
      } catch (err) {
        setBatches((prev) => {
          const next = [...prev];
          next[batchIdx] = {
            ...next[batchIdx],
            ocrText: `Error: ${(err as Error).message}`,
            items: [],
            unparsed: [],
            processed: true,
          };
          return next;
        });
      }
    }

    setProcessing(false);
    setProcessedCount((c) => c + files.length);
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateItem = (idx: number, field: 'raw' | 'confirmed', value: string) => {
    setBatches((prev) => {
      const next = [...prev];
      if (!next[currentIdx]) return prev;
      next[currentIdx].items[idx] = {
        ...next[currentIdx].items[idx],
        [field]: value,
        aliasSaved: false,
      };
      // Auto-suggest from catalog when raw changes
      if (field === 'raw') {
        const { guess } = classifyScript(value);
        if (guess) {
          next[currentIdx].items[idx].confirmed = guess;
        }
      }
      return next;
    });
  };

  const saveAlias = async (idx: number) => {
    const batch = batches[currentIdx];
    if (!batch) return;
    const item = batch.items[idx];
    if (!item || !item.raw.trim() || !item.confirmed.trim()) return;

    const meaning = extractEnglish(item.confirmed);
    try {
      const res = await fetch('/api/catalog/aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: item.raw.trim(), itemName: meaning }),
      });
      if (res.ok) {
        setBatches((prev) => {
          const next = [...prev];
          next[currentIdx].items[idx].aliasSaved = true;
          return next;
        });
        setAliasCount((c) => c + 1);
        // Update runtime aliases
        fetch('/api/catalog/aliases')
          .then((r) => r.json())
          .then((d) => {
            if (d.aliases) setRuntimeAliases(d.aliases);
          })
          .catch(() => {});
      }
    } catch {}
  };

  const saveAllAliases = async () => {
    const batch = batches[currentIdx];
    if (!batch) return;
    for (let i = 0; i < batch.items.length; i++) {
      const item = batch.items[i];
      if (item.raw.trim() && item.confirmed.trim() && !item.aliasSaved) {
        const meaning = extractEnglish(item.confirmed);
        try {
          await fetch('/api/catalog/aliases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alias: item.raw.trim(), itemName: meaning }),
          });
          setBatches((prev) => {
            const next = [...prev];
            next[currentIdx].items[i].aliasSaved = true;
            return next;
          });
        } catch {}
      }
    }
    setAliasCount((c) => c + batch.items.filter((it) => it.raw.trim() && it.confirmed.trim() && !it.aliasSaved).length);
    fetch('/api/catalog/aliases')
      .then((r) => r.json())
      .then((d) => {
        if (d.aliases) setRuntimeAliases(d.aliases);
      })
      .catch(() => {});
    nextImage();
  };

  const addManualItem = () => {
    if (!manualRaw.trim()) return;
    const { guess } = classifyScript(manualRaw);
    const confirmed = manualConfirmed.trim() || guess || manualRaw;
    setBatches((prev) => {
      const next = [...prev];
      if (!next[currentIdx]) return prev;
      next[currentIdx].items.push({
        raw: manualRaw.trim(),
        confirmed,
        amount: 0,
        qty: '',
        rate: '',
        aliasSaved: false,
      });
      return next;
    });
    setManualRaw('');
    setManualConfirmed('');
  };

  const removeItem = (idx: number) => {
    setBatches((prev) => {
      const next = [...prev];
      if (!next[currentIdx]) return prev;
      next[currentIdx].items.splice(idx, 1);
      return next;
    });
  };

  const nextImage = useCallback(() => {
    setCurrentIdx((i) => Math.min(i + 1, batches.length - 1));
  }, [batches.length]);

  const skipImage = () => {
    nextImage();
  };

  const current = batches[currentIdx];
  const allProcessed = batches.length > 0 && batches.every((b) => b.processed);

  return (
    <div className="space-y-4">
      <PageHeader title={t('trainingTitle')} subtitle={t('trainingHelp')} />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card padding="p-3">
          <div className="flex items-center gap-2">
            <GraduationIcon size={20} className="text-[var(--bg-primary)]" />
            <div>
              <p className="text-2xl font-bold">{aliasCount}</p>
              <p className="text-xs text-[var(--text-muted)]">{t('trainingAliases')}</p>
            </div>
          </div>
        </Card>
        <Card padding="p-3">
          <div className="flex items-center gap-2">
            <CameraIcon size={20} className="text-[var(--bg-primary)]" />
            <div>
              <p className="text-2xl font-bold">{processedCount}</p>
              <p className="text-xs text-[var(--text-muted)]">{t('trainingProcessed')}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Upload */}
      <Card>
        <SectionHeader title={t('trainingUploadBatch')} icon={<CameraIcon size={16} />} />
        <p className="mb-3 text-sm text-[var(--text-muted)]">{t('trainingUploadHelp')}</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          onChange={handleFiles}
          className="hidden"
        />
        <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={processing}>
          <span className="flex items-center gap-2">
            <CameraIcon size={16} /> {t('trainingUploadBatch')}
          </span>
        </Button>
      </Card>

      {/* Processing progress */}
      {processing && ocrProgress && (
        <Card>
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {t('trainingProcessing')} {currentIdx + 1} {t('trainingOf')} {batches.length}
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-card-hover)]">
              <div
                className="h-full bg-[var(--bg-primary)] transition-all"
                style={{ width: `${(ocrProgress.progress || 0) * 100}%` }}
              />
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              {ocrProgress.status || t('scanning')}... {Math.round((ocrProgress.progress || 0) * 100)}%
            </p>
          </div>
        </Card>
      )}

      {/* Current image review */}
      {current && current.processed && (
        <Card>
          <SectionHeader
            title={`${t('trainingProcessing')} ${currentIdx + 1} ${t('trainingOf')} ${batches.length}`}
            action={
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={skipImage}>
                  {t('trainingSkip')}
                </Button>
                <Button size="sm" variant="primary" onClick={saveAllAliases}>
                  {t('trainingConfirmAll')}
                </Button>
              </div>
            }
          />

          {/* Raw OCR text */}
          <div className="mb-4">
            <p className="mb-1 text-sm font-medium text-[var(--text-muted)]">{t('trainingRawOcr')}</p>
            <pre className="max-h-40 overflow-auto rounded-lg bg-[var(--bg-base)] p-3 text-xs whitespace-pre-wrap">
              {current.ocrText || '(empty)'}
            </pre>
          </div>

          {/* Items found */}
          <div className="mb-4">
            <p className="mb-2 text-sm font-medium">{t('trainingReviewItems')}</p>
            {current.items.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">{t('trainingNoItems')}</p>
            ) : (
              <div className="space-y-2">
                {current.items.map((item, idx) => (
                  <div key={idx} className="grid gap-2 rounded-xl bg-[var(--bg-base)] p-3 sm:grid-cols-12">
                    <input
                      value={item.raw}
                      onChange={(e) => updateItem(idx, 'raw', e.target.value)}
                      className="col-span-5 rounded border border-[var(--border-light)] bg-[var(--bg-input)] p-2 text-sm"
                      placeholder={t('trainingRawText')}
                    />
                    <div className="col-span-5 flex gap-1">
                      <input
                        value={item.confirmed}
                        onChange={(e) => updateItem(idx, 'confirmed', e.target.value)}
                        className="flex-1 rounded border border-[var(--border-light)] bg-[var(--bg-input)] p-2 text-sm"
                        placeholder={t('trainingCorrectName')}
                      />
                      {item.aliasSaved ? (
                        <span className="shrink-0 self-center text-[var(--bg-success)]" title={t('trainingAliasSaved')}>
                          <CheckIcon size={18} />
                        </span>
                      ) : (
                        <button
                          onClick={() => saveAlias(idx)}
                          className="shrink-0 rounded bg-[var(--bg-secondary)] px-2 py-1 text-xs font-medium text-[var(--text-on-primary)] hover:opacity-80"
                          title={t('trainingSaveAlias')}
                        >
                          ⟳
                        </button>
                      )}
                    </div>
                    <div className="col-span-1 flex items-center justify-center text-sm text-[var(--text-muted)]">
                      ₹{item.amount}
                    </div>
                    <button
                      onClick={() => removeItem(idx)}
                      className="col-span-1 rounded bg-[var(--bg-primary)] text-sm text-[var(--text-on-primary)]"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Unparsed lines */}
          {current.unparsed.length > 0 && (
            <div className="mb-4">
              <p className="mb-1 text-sm font-medium text-[var(--text-muted)]">
                Unparsed lines ({current.unparsed.length}):
              </p>
              <ul className="space-y-1">
                {current.unparsed.map((line, i) => (
                  <li key={i} className="rounded bg-[var(--bg-base)] px-3 py-1.5 text-xs text-[var(--text-muted)]">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Manual item entry */}
          <div className="rounded-xl bg-[var(--bg-base)] p-3">
            <p className="mb-2 text-sm font-medium">{t('trainingAddItem')}</p>
            <div className="grid gap-2 sm:grid-cols-12">
              <input
                value={manualRaw}
                onChange={(e) => setManualRaw(e.target.value)}
                className="col-span-5 rounded border border-[var(--border-light)] bg-[var(--bg-input)] p-2 text-sm"
                placeholder={t('trainingRawText')}
              />
              <input
                value={manualConfirmed}
                onChange={(e) => setManualConfirmed(e.target.value)}
                className="col-span-5 rounded border border-[var(--border-light)] bg-[var(--bg-input)] p-2 text-sm"
                placeholder={t('trainingCorrectName')}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={addManualItem}
                className="col-span-2"
                disabled={!manualRaw.trim()}
              >
                <PlusIcon size={14} /> {t('addItem')}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Image thumbnails */}
      {batches.length > 0 && (
        <Card>
          <SectionHeader title={`${batches.length} images`} />
          <div className="flex gap-2 overflow-x-auto pb-2">
            {batches.map((batch, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIdx(idx)}
                className={`relative shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                  idx === currentIdx
                    ? 'border-[var(--bg-primary)]'
                    : 'border-transparent hover:border-[var(--border-light)]'
                }`}
              >
                <img
                  src={URL.createObjectURL(batch.file)}
                  alt={`Image ${idx + 1}`}
                  className="h-20 w-20 object-cover"
                />
                {batch.processed && (
                  <div className="absolute bottom-0 right-0 rounded-tl bg-[var(--bg-success)] p-0.5">
                    <CheckIcon size={10} className="text-[var(--text-on-primary)]" />
                  </div>
                )}
                <span className="absolute left-0 top-0 rounded-br bg-black/60 px-1 text-xs text-white">
                  {idx + 1}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Done state */}
      {allProcessed && currentIdx >= batches.length - 1 && !processing && batches.length > 0 && (
        <Card>
          <EmptyState
            icon={<CheckIcon size={32} />}
            title={t('trainingDone')}
            description={`${aliasCount} ${t('trainingAliases').toLowerCase()} · ${processedCount} ${t('trainingProcessed').toLowerCase()}`}
            action={{
              label: t('trainingAddMore'),
              onClick: () => fileInputRef.current?.click(),
            }}
          />
        </Card>
      )}
    </div>
  );
}
