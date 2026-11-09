import { useLocalSearchParams } from 'expo-router';
import * as MailComposer from 'expo-mail-composer';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, Share, TextInput, View } from 'react-native';
import { repo } from '../../data/repo';
import type { ReportContacts } from '../../data/types';
import { useI18n } from '../../i18n';
import { buildReportMessage } from '../../report/message';
import { getSession } from '../../scan/session';
import { Button } from '../../ui/Button';
import { Card, Screen } from '../../ui/Screen';
import { T } from '../../ui/T';
import { usePalette } from '../../ui/theme';

export default function Report() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const p = usePalette();
  const s = getSession(id);
  const [contacts, setContacts] = useState<ReportContacts | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState('');
  const [seller, setSeller] = useState('');
  const [attach, setAttach] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => { repo.reportContacts(s?.build?.variant?.external_ref ?? null).then(setContacts).catch(() => setContacts({ brand: null, authorities: [] })); }, [s]);

  const message = useMemo(() => {
    if (!s?.verdict || !s.build) return null;
    const reasons = s.verdict.reasons.filter((r) => !r.ignored && r.signal.outcome !== 'match')
      .map((r) => t.signal[r.signal.type]?.[r.signal.outcome]).filter((x): x is string => !!x);
    const photo = s.label?.photoUri;
    return buildReportMessage({
      lang, productName: s.build.variant?.official_name ?? s.build.used.productName ?? null, brand: s.build.variant?.brand ?? null,
      gtin14: s.barcode?.gtin14 ?? null, used: s.build.used, verdict: s.verdict, reasonTexts: reasons,
      purchaseChannel: s.purchaseChannel ? t.channel.options[s.purchaseChannel] : null, country: t.report.country,
      photoUris: attach && photo ? [photo] : [], createdAt: s.createdAt, appName: 'SYN',
    }, t.verdict[s.verdict.verdict].title);
  }, [s, lang, t, attach]);
  if (!s?.verdict || !message) return <Screen><T>—</T></Screen>;

  const emails = [...chosen].filter((x) => x.includes('@'));
  const recipients = [...emails, ...(custom.includes('@') ? [custom.trim()] : [])];
  const toggle = (k: string) => { const n = new Set(chosen); n.has(k) ? n.delete(k) : n.add(k); setChosen(n); };

  const save = async (channel: 'email' | 'whatsapp') => {
    try {
      const saved = await repo.saveReport({
        scan: { verdict: s.verdict!.verdict, methodVersion: s.verdict!.methodVersion, methodSha256: s.verdict!.methodSha256,
          variantId: s.build?.variant?.variant_id ?? null, productId: s.build?.variant?.product_id ?? null,
          extraction: s.label?.extraction ?? null, purchaseChannel: s.purchaseChannel,
          signals: s.verdict!.reasons.map((r) => ({ type: r.signal.type, outcome: r.ignored ? 'unavailable' : r.signal.outcome, severity: r.severity,
            weight: r.weight, confidence: r.signal.confidence ?? null, evidence: r.signal.evidence ?? null })) },
        report: { recipients, channel, messageText: message.body, attachmentsCount: message.attachments.length,
          sellerInfoPrivate: seller.trim() || null, purchaseChannel: s.purchaseChannel },
      });
      s.reportId = saved.reportId;
      setStatus(`${t.report.saved} ${saved.reportId.slice(0, 8)}`);
    } catch { setStatus(t.report.saveError); }
  };

  const sendEmail = async () => {
    if (!recipients.length) { setStatus(t.report.needRecipient); return; }
    await save('email');
    if (Platform.OS !== 'web' && (await MailComposer.isAvailableAsync())) {
      await MailComposer.composeAsync({ recipients, subject: message.subject, body: message.body, attachments: message.attachments });
    } else {
      await Linking.openURL(`mailto:${recipients.join(',')}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`);
    }
  };
  const shareWhatsapp = async () => {
    await save('whatsapp');
    const url = `whatsapp://send?text=${encodeURIComponent(`${message.subject}\n\n${message.body}`)}`;
    if (Platform.OS !== 'web' && (await Linking.canOpenURL(url))) await Linking.openURL(url);
    else await Share.share({ message: `${message.subject}\n\n${message.body}` });
  };

  const box = (on: boolean) => ({ width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: p.brand, backgroundColor: on ? p.brand : 'transparent' });
  const input = { backgroundColor: p.bg, color: p.ink, borderColor: p.line, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 };
  const iraq = contacts?.authorities.some((a) => a.country === 'IQ');

  return (
    <Screen>
      <Card><T>{t.report.intro}</T></Card>
      <Card>
        <T bold style={{ fontSize: 17 }}>{t.report.to}</T>
        <T bold>{t.report.brandEmails}{contacts?.brand ? ` — ${contacts.brand.name}` : ''}</T>
        {contacts?.brand?.emails.length ? contacts.brand.emails.map((e) => (
          <Pressable key={e} onPress={() => toggle(e)} accessibilityRole="checkbox" accessibilityState={{ checked: chosen.has(e) }}
            style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 6 }}>
            <View style={box(chosen.has(e))} />
            <View style={{ flex: 1 }}><T style={{ writingDirection: 'ltr' }}>{e}</T></View>
          </Pressable>
        )) : <T muted>{t.report.noBrandContact}</T>}
        {contacts?.brand?.contact_text && <T muted style={{ fontSize: 12 }}>{t.report.purposeFromSource}: {contacts.brand.contact_text}</T>}

        <T bold style={{ marginTop: 8 }}>{t.report.authorities}</T>
        {!iraq && <T muted style={{ fontSize: 13 }}>{t.report.noIraqAuthority}</T>}
        {contacts?.authorities.map((a) => (
          <View key={a.value} style={{ paddingVertical: 4 }}>
            <T>{a.authority} ({a.country}) · {a.value}</T>
            {a.purpose && <T muted style={{ fontSize: 12 }}>{a.purpose}</T>}
            {a.kind === 'web' && <T style={{ color: p.brand }} onPress={() => Linking.openURL(a.value)}>{t.report.web}</T>}
            {a.kind === 'phone' && <T style={{ color: p.brand }} onPress={() => Linking.openURL(`tel:${a.value.replace(/[^\d+]/g, '')}`)}>{t.report.call}</T>}
          </View>
        ))}
        <TextInput value={custom} onChangeText={setCustom} placeholder={t.report.customEmail} placeholderTextColor={p.muted}
          keyboardType="email-address" autoCapitalize="none" accessibilityLabel={t.report.customEmail} style={input} />
      </Card>

      <Card>
        {s.label?.photoUri ? (
          <Pressable onPress={() => setAttach(!attach)} accessibilityRole="checkbox" accessibilityState={{ checked: attach }}
            style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <View style={box(attach)} /><T>{t.report.attachPhoto}</T>
          </Pressable>
        ) : null}
        <T bold>{t.report.seller}</T>
        <TextInput value={seller} onChangeText={setSeller} accessibilityLabel={t.report.seller} style={input} />
        <T muted style={{ fontSize: 12 }}>{t.report.sellerHint}</T>
      </Card>

      <Card>
        <T bold>{t.report.preview}</T>
        <T bold style={{ fontSize: 14 }}>{message.subject}</T>
        <T style={{ fontSize: 13 }}>{message.body}</T>
      </Card>

      <Button title={t.report.sendEmail} onPress={sendEmail} />
      <Button title={t.report.shareWhatsapp} variant="ghost" onPress={shareWhatsapp} />
      <T muted style={{ fontSize: 12 }}>{t.report.whatsappNote}</T>
      {status && <T bold>{status}</T>}
    </Screen>
  );
}
