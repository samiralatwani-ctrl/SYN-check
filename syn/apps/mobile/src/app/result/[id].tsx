import { router, useLocalSearchParams } from 'expo-router';
import { Linking, View } from 'react-native';
import { useI18n } from '../../i18n';
import { getScan } from '../../scan/runScan';
import { Button } from '../../ui/Button';
import { ReasonRow } from '../../ui/ReasonRow';
import { Card, Screen } from '../../ui/Screen';
import { T } from '../../ui/T';
import { VerdictBadge } from '../../ui/VerdictCard';
import { usePalette } from '../../ui/theme';

export default function Result() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const p = usePalette();
  const rec = getScan(id);
  if (!rec) return <Screen><T>—</T></Screen>;
  const v = rec.verdict;
  const banners = v.annotations.filter((a) => a !== 'match_is_not_authenticity' || v.verdict === 'match');

  return (
    <Screen>
      <Card>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[{ label: t.result.refImage, body: t.result.noRefImage }, { label: t.result.yourScan, body: t.result.barcodeOnly }].map((b) => (
            <View key={b.label} style={{ flex: 1, aspectRatio: 1, borderRadius: 12, borderWidth: 1, borderColor: p.line, borderStyle: 'dashed',
              alignItems: 'center', justifyContent: 'center', padding: 8 }}>
              <T muted style={{ fontSize: 12 }}>{b.label}</T>
              <T style={{ fontSize: 13, textAlign: 'center' }}>{b.body}</T>
            </View>
          ))}
        </View>
        <T bold style={{ fontSize: 18 }}>{rec.variant?.official_name ?? t.result.unknownProduct}</T>
        <T muted style={{ fontSize: 13 }}>
          {[rec.variant?.brand, rec.variant && t.status[rec.variant.verification_status], rec.gtin14 ?? rec.raw].filter(Boolean).join(' · ')}
        </T>
        <VerdictBadge verdict={v.verdict} />
        {banners.map((a) => (
          <View key={a} accessibilityRole="alert" style={{ backgroundColor: p.banner, borderRadius: 10, padding: 10 }}>
            <T style={{ color: p.bannerInk, fontSize: 14 }}>{t.annotation[a]}</T>
          </View>
        ))}
      </Card>

      <Card>
        <T bold style={{ fontSize: 17 }}>{t.result.reasons}</T>
        {v.reasons.map((r, i) => <ReasonRow key={`${r.signal.type}-${i}`} reason={r} />)}
        {v.missing.length > 0 && (
          <View style={{ gap: 4, marginTop: 6 }}>
            <T bold>{t.result.missingTitle}</T>
            {v.missing.map((m) => <T key={m}>• {(t.missing as Record<string, string>)[m] ?? m}</T>)}
            <T muted style={{ fontSize: 13 }}>{t.missing.labelSoon}</T>
          </View>
        )}
      </Card>

      {rec.batchAlertsToCheck.length > 0 && (
        <Card accent="#B54708">
          <T bold>{t.result.batchAlerts}</T>
          {rec.batchAlertsToCheck.map((a, i) => (
            <T key={i} style={{ fontSize: 14 }} onPress={() => Linking.openURL(a.source_url)}>
              • {a.lot_text} — {a.authority} {a.decision_date ?? ''}
            </T>
          ))}
        </Card>
      )}

      <Button title={t.result.whatNow} onPress={() => router.push({ pathname: '/next-steps/[id]', params: { id: rec.id } })} />
      <T muted style={{ fontSize: 12, textAlign: 'center' }}>{t.result.method}: {v.methodVersion} · {v.methodSha256.slice(0, 8)} · {v.step}</T>
    </Screen>
  );
}
