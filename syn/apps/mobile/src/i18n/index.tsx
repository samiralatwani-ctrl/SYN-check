import { getLocales } from 'expo-localization';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { ar, type Dict } from './ar';
import { en } from './en';
import { tr } from './tr';

export type Lang = 'ar' | 'en' | 'tr';
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'ar', label: 'العربية' }, { code: 'en', label: 'English' }, { code: 'tr', label: 'Türkçe' },
];
const DICTS: Record<Lang, Dict> = { ar, en, tr };

// Arabic is always the default (spec §7); the user switches language in Settings.
// The device locale is only used to suggest Turkish/English there.
export const deviceLanguage = () => getLocales()[0]?.languageCode ?? null;
const initialLang = (): Lang => 'ar';

const Ctx = createContext<{ t: Dict; lang: Lang; setLang: (l: Lang) => void }>({ t: ar, lang: 'ar', setLang: () => {} });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const value = useMemo(() => ({ t: DICTS[lang], lang, setLang }), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useI18n = () => useContext(Ctx);
