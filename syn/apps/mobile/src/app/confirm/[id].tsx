import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, TextInput, View } from 'react-native';
import type { ConfirmableField } from '@syn/scan-signals';
import { MIN_CONFIDENCE } from '@syn/label-extraction';
import { useI18n } from '../../i18n';
import { confirmLabel, getSession } from '../../scan/session';
import { Button } from '../../ui/Button';
import { Card, Screen } from '../../ui/Screen';
import { T } from '../../ui/T';
import { usePalette } from '../../ui/theme';

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;

export default function ConfirmLabel() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const p = usePalette();
  const s = getSession(id);
  const f = s?.label?.extraction.fields;
  const initial = (k: ConfirmableField): string => {
    if (!f) return '';
    if (k === 'product_name') return f.product_name.value ?? '';
    if (k === 'batch') return f.batch.value ?? '';
    const d = k === 'manufacture_date' ? f.manufacture_date : f.expiry_date;
    return d.value?.iso ?? '';
  };
  const keys: ConfirmableField[] = ['product_name', 'batch', 'manufacture_date', 'expiry_date'];
  const [values, setValues] = useState<Record<ConfirmableField, string>>(
    () => Object.fromEntries(keys.map((k) => [k, initial(k)])) as Record<ConfirmableField, string>);
  const [busy, setBusy] = useState(false);
  if (!s || !f) return <Screen><T>—</T></Screen>;

  const meta: Record<ConfirmableField, { label: string; conf: number; ambiguous?: { index: number; candidates: string[] }[] }> = {
    product_name: { label: t.label.productName, conf: f.product_name.confidence },
    batch: { label: t.label.batch, conf: f.batch.confidence, ambiguous: f.batch.ambiguous_characters },
    manufacture_date: { label: t.label.mfg, conf: f.manufacture_date.confidence },
    expiry_date: { label: t.label.exp, conf: f.expiry_date.confidence },
  };
  const datesValid = (['manufacture_date', 'expiry_date'] as const).every((k) => !values[k] || DATE_RE.test(values[k]));
  const issues = s.label!.extraction.image_quality.issues;

  const submit = async () => {
    setBusy(true);
    const confirmed = Object.fromEntries(keys.filter((k) => values[k].trim()).map((k) => [k, { value: values[k].trim() }]));
    await confirmLabel(s.id, confirmed);
    router.replace({ pathname: '/result/[id]', params: { id: s.id } });
  };

  return (
    <Screen>
      <Card>
        <T bold style={{ fontSize: 17 }}>{t.label.confirmTitle}</T>
        <T muted style={{ fontSize: 13 }}>{t.label.confirmBody}</T>
        {s.label?.photoUri ? <Image source={{ uri: s.label.photoUri }} style={{ height: 180, borderRadius: 12 }} resizeMode="contain" accessibilityIgnoresInvertColors /> : null}
        {issues.map((i) => (
          <View key={i} style={{ backgroundColor: p.banner, borderRadius: 8, padding: 8 }}>
            <T style={{ color: p.bannerInk, fontSize: 13 }}>{t.label.issues[i] ?? i}</T>
          </View>
        ))}
      </Card>
      <Card>
        {keys.map((k) => {
          const m = meta[k];
          const read = initial(k);
          const uncertain = !!read && m.conf < MIN_CONFIDENCE;
          return (
            <View key={k} style={{ gap: 4 }}>
              <T bold>{m.label}</T>
              <TextInput value={values[k]} onChangeText={(v) => setValues({ ...values, [k]: v })} placeholder={t.label.notRead}
                placeholderTextColor={p.muted} autoCapitalize={k === 'batch' ? 'characters' : 'none'} accessibilityLabel={m.label}
                style={{ backgroundColor: p.bg, color: p.ink, borderColor: uncertain ? '#B54708' : p.line, borderWidth: uncertain ? 2 : 1,
                  borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, writingDirection: 'ltr', textAlign: 'left' }} />
              {uncertain && <T style={{ color: '#B54708', fontSize: 13 }}>{t.label.lowConfidence}</T>}
              {m.ambiguous?.map((a) => (
                <T key={a.index} style={{ color: '#B54708', fontSize: 13 }}>{t.label.ambiguous}{a.index + 1} — {'\u2066'}{a.candidates.join(' | ')}{'\u2069'}</T>
              ))}
              {(k === 'manufacture_date' || k === 'expiry_date') && values[k] && !DATE_RE.test(values[k]) &&
                <T style={{ color: p.danger, fontSize: 13 }}>{t.label.datesFormat}</T>}
            </View>
          );
        })}
      </Card>
      <Button title={t.label.confirm} disabled={busy || !datesValid} onPress={submit} />
      <Button title={t.label.retake} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
