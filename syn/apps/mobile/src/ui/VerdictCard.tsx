import type { VerdictCode } from '@syn/rules-engine';
import { View } from 'react-native';
import { useI18n } from '../i18n';
import { T } from './T';
import { VERDICT } from './theme';

export function VerdictBadge({ verdict }: { verdict: VerdictCode }) {
  const { t } = useI18n();
  const v = VERDICT[verdict];
  return (
    <View accessible accessibilityLabel={t.verdict[verdict].title}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: v.color, borderRadius: 14, padding: 14 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
        <T bold style={{ color: v.color, fontSize: 22, lineHeight: 26 }} importantForAccessibility="no">{v.icon}</T>
      </View>
      <View style={{ flex: 1 }}>
        <T bold style={{ color: '#FFFFFF', fontSize: 20, lineHeight: 28 }}>{t.verdict[verdict].title}</T>
        <T style={{ color: '#FFFFFF', fontSize: 14, lineHeight: 21 }}>{t.verdict[verdict].body}</T>
      </View>
    </View>
  );
}
