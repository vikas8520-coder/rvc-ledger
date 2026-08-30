'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '../components/I18nProvider';
import { useAutoTranslate } from '@/lib/i18n';

export default function AutoTranslateName({ name }: { name: string }) {
  const [translated, setTranslated] = useState(name);
  const translate = useAutoTranslate();

  useEffect(() => {
    translate(name).then(setTranslated);
  }, [name, translate]);

  return <>{translated}</>;
}
