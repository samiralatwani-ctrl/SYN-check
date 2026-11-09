import { Pressable, View } from 'react-native';
import { LANGS, useI18n } from '../i18n';
import { Card, Screen } from '../ui/Screen';
import { T } from '../ui/T';
import { usePalette } from '../ui/theme';

export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const p = usePalette();
  return (
    <Screen>
      <Card>
        <T bold>{t.settings.language}</T>
        {LANGS.map((l) => (
          <Pressable key={l.code} onPress={() => setLang(l.code)} accessibilityRole="radio" accessibilityState={{ checked: lang === l.code }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
            <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: p.brand,
              backgroundColor: lang === l.code ? p.brand : 'transparent' }} />
            <T>{l.label}</T>
          </Pressable>
        ))}
        <T muted style={{ fontSize: 13 }}>{t.settings.comingSoon}</T>
      </Card>
    </Screen>
  );
}
