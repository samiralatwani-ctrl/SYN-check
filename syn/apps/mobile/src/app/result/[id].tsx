import { router, useLocalSearchParams } from 'expo-router';
import { Image, Linking, View } from 'react-native';
import { useI18n } from '../../i18n';
import { getSession, setPurchaseChannel, type PurchaseChannel } from '../../scan/session';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { LabelCapture } from '../../ui/LabelCapture';
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
  const rec = getSession(id);
  const [, refresh] = useState(0);
  if (!rec?.verdict || !rec.build) return <Screen><T>—</T></Screen>;
  const v = rec.verdict;
  const variant = rec.build.variant;
  const used = rec.build.used;
  // Not in our reference, but named by a regulator's alert: show the name exactly as the authority published it.
  const alertName = rec.reference?.alerts.find((a) => a.lot_scope === 'all_batches')?.product_text;
  const yourScan = rec.label?.photoUri ? null : rec.label ? t.label.readTitle : t.result.barcodeOnly;
  const banners = v.annotations.filter((a) => a !== 'match_is_not_authenticity' || v.verdict === 'match');

  return (
    <Screen>
      <Card>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, aspectRatio: 1, borderRadius: 12, borderWidth: 1, borderColor: p.line, borderStyle: 'dashed',
            alignItems: 'center', justifyContent: 'center', padding: 8 }}>
            <T muted style={{ fontSize: 12 }}>{t.result.refImage}</T>
            <T style={{ fontSize: 13, textAlign: 'center' }}>{t.result.noRefImage}</T>
          </View>
          <View style={{ flex: 1, aspectRatio: 1, borderRadius: 12, borderWidth: 1, borderColor: p.line, overflow: 'hidden',
            alignItems: 'center', justifyContent: 'center', padding: rec.label?.photoUri ? 0 : 8 }}>
            {rec.label?.photoUri
              ? <Image source={{ uri: rec.label.photoUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityLabel={t.result.yourScan} />
              : <><T muted style={{ fontSize: 12 }}>{t.result.yourScan}</T><T style={{ fontSize: 13, textAlign: 'center' }}>{yourScan}</T></>}
          </View>
        </View>
        <T bold style={{ fontSize: 18 }}>{variant?.official_name ?? used.productName ?? alertName ?? t.result.unknownProduct}</T>
        <T muted style={{ fontSize: 13 }}>
          {[variant?.brand, variant && t.status[variant.verification_status], rec.barcode?.gtin14 ?? rec.barcode?.raw].filter(Boolean).join(' · ')}
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
          </View>
        )}
      </Card>

      {rec.label && (used.batch || used.manufacture || used.expiry) && (
        <Card>
          <T bold>{t.label.readTitle}</T>
          {used.productName && <T>{t.label.productName}: {used.productName}</T>}
          {used.batch && <T>{t.label.batch}: <T bold>{used.batch}</T></T>}
          {used.manufacture && <T>{t.label.mfg}: {used.manufacture}</T>}
          {used.expiry && <T>{t.label.exp}: {used.expiry}</T>}
          {rec.identifiedBy !== 'barcode' && rec.nameMatches === 0 && <T muted style={{ fontSize: 13 }}>{t.label.noNameMatch}</T>}
          {rec.nameMatches > 1 && <T muted style={{ fontSize: 13 }}>{t.label.manyNameMatches}</T>}
        </Card>
      )}

      {!rec.label && v.verdict !== 'mismatch' && (
        <Card>
          <T bold>{t.label.complete}</T>
          <LabelCapture sessionId={rec.id} />
        </Card>
      )}

      {rec.build.batchAlertsToCheck.length > 0 && (
        <Card accent="#B54708">
          <T bold>{t.result.batchAlerts}</T>
          {rec.build.batchAlertsToCheck.map((a, i) => (
            <T key={i} style={{ fontSize: 14 }} onPress={() => Linking.openURL(a.source_url)}>
              • {a.lot_text} — {a.authority} {a.decision_date ?? ''}
            </T>
          ))}
        </Card>
      )}

      <Card>
        <T bold>{t.channel.question}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(['authorized_agent', 'pharmacy', 'online_store', 'social_media', 'other'] as PurchaseChannel[]).map((c) => {
            const on = rec.purchaseChannel === c;
            return (
              <Pressable key={c} accessibilityRole="radio" accessibilityState={{ checked: on }}
                onPress={() => { setPurchaseChannel(rec.id, on ? null : c); refresh((n) => n + 1); }}
                style={{ borderRadius: 999, borderWidth: 1, borderColor: on ? p.brand : p.line, backgroundColor: on ? p.brand : p.card, paddingHorizontal: 12, paddingVertical: 6 }}>
                <T style={{ fontSize: 13, color: on ? p.brandInk : p.ink }}>{t.channel.options[c]}</T>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Button title={t.result.whatNow} onPress={() => router.push({ pathname: '/next-steps/[id]', params: { id: rec.id } })} />
      {(v.verdict === 'mismatch' || v.verdict === 'suspect' || v.verdict === 'minor') &&
        <Button title={t.report.button} variant="ghost" onPress={() => router.push({ pathname: '/report/[id]', params: { id: rec.id } })} />}
      <T muted style={{ fontSize: 12, textAlign: 'center' }}>{t.result.method}: {v.methodVersion} · {v.methodSha256.slice(0, 8)} · {v.step}</T>
    </Screen>
  );
}
