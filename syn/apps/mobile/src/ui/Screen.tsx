import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { repo } from '../data/repo';
import { useI18n } from '../i18n';
import { T } from './T';
import { usePalette } from './theme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const p = usePalette();
  const { t } = useI18n();
  const body = (
    <View style={{ padding: 16, gap: 14, direction: t.dir }}>
      {repo.demo && (
        <View accessibilityRole="alert" style={{ backgroundColor: p.banner, borderRadius: 10, padding: 10 }}>
          <T style={{ color: p.bannerInk, fontSize: 13 }}>{t.app.demo}</T>
        </View>
      )}
      {children}
    </View>
  );
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: p.bg, direction: t.dir }}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled">{body}</ScrollView> : body}
    </SafeAreaView>
  );
}

export function Card({ children, accent }: { children: ReactNode; accent?: string }) {
  const p = usePalette();
  return (
    <View style={{ backgroundColor: p.card, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: p.line,
      borderTopWidth: accent ? 6 : 1, borderTopColor: accent ?? p.line }}>
      {children}
    </View>
  );
}
