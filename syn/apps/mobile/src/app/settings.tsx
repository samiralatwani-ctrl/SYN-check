import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { CORRECTIONS_URL, PRIVACY_URL, SUPPORT_EMAIL } from '../config';
import { repo } from '../data/repo';
import { LANGS, useI18n } from '../i18n';
import { Button } from '../ui/Button';
import { Card, Screen } from '../ui/Screen';
import { T } from '../ui/T';
import { usePalette } from '../ui/theme';

export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const p = usePalette();
  const [armed, setArmed] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const del = async () => {
    if (!armed) { setArmed(true); return; }
    setArmed(false);
    try {
      const r = await repo.deleteMyData();
      setMsg(r ? `${t.privacy.deleted} ${r.reports} ${t.privacy.reports}, ${r.scans} ${t.privacy.scans}` : t.privacy.nothing);
    } catch { setMsg(t.privacy.deleteError); }
  };
  const link = (label: string, url: string) => (
    <T style={{ color: p.brand, textDecorationLine: 'underline' }} accessibilityRole="link" onPress={() => Linking.openURL(url)}>{label}</T>
  );

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
      <Card>
        <T bold>{t.privacy.title}</T>
        <T style={{ fontSize: 14 }}>{t.privacy.photos}</T>
        <T style={{ fontSize: 14 }}>{t.privacy.stored}</T>
        {link(t.privacy.policy, PRIVACY_URL)}
        {link(t.privacy.corrections, CORRECTIONS_URL)}
        {SUPPORT_EMAIL ? link(t.privacy.contact, `mailto:${SUPPORT_EMAIL}`) : null}
        <Button title={armed ? t.privacy.deleteConfirm : t.privacy.delete} variant="ghost" onPress={del} />
        {msg && <T bold>{msg}</T>}
      </Card>
    </Screen>
  );
}
