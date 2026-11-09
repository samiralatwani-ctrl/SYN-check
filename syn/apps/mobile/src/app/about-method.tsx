import { View } from 'react-native';
import { useI18n } from '../i18n';
import { Card, Screen } from '../ui/Screen';
import { T } from '../ui/T';
import { usePalette } from '../ui/theme';

export default function AboutMethod() {
  const { t } = useI18n();
  const p = usePalette();
  return (
    <Screen>
      <Card><T>{t.about.intro}</T></Card>
      <Card>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <T bold style={{ flex: 1, color: '#1E7A4C' }}>✓ {t.about.can}</T>
          <T bold style={{ flex: 1, color: '#B42318' }}>✕ {t.about.cannot}</T>
        </View>
        {t.about.rows.map(([can, cannot]) => (
          <View key={can} style={{ flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: p.line, paddingTop: 8 }}>
            <T style={{ flex: 1, fontSize: 14 }}>{can}</T>
            <T style={{ flex: 1, fontSize: 14 }}>{cannot}</T>
          </View>
        ))}
      </Card>
      <Card>
        <T>{t.result.otherCountry}</T>
        <T>{t.about.gs1}</T>
        <T>{t.about.neutrality}</T>
      </Card>
    </Screen>
  );
}
