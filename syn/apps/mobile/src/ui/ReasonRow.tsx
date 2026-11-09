import type { Reason } from '@syn/rules-engine';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useI18n } from '../i18n';
import { T } from './T';
import { SEVERITY_DOT, usePalette } from './theme';

export function ReasonRow({ reason }: { reason: Reason }) {
  const { t } = useI18n();
  const p = usePalette();
  const [open, setOpen] = useState(false);
  const s = reason.signal;
  const text = t.signal[s.type]?.[s.outcome] || s.type;
  const experimental = s.type === 'packaging_similarity' || s.type === 'print_quality';
  const dotKey = reason.ignored ? 'ignored' : s.outcome === 'mismatch' ? reason.severity ?? 'minor' : s.outcome;
  const ev = s.evidence;
  const hasDetail = !!(ev && (ev.found || ev.reference || ev.sourceUrl)) || !!reason.ignored;
  return (
    <Pressable onPress={() => hasDetail && setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }}
      style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: p.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: SEVERITY_DOT[dotKey] }} />
        <T style={{ flex: 1 }}>{text}</T>
        {experimental && <View style={{ borderRadius: 999, borderWidth: 1, borderColor: p.muted, paddingHorizontal: 8 }}>
          <T muted style={{ fontSize: 11 }}>{t.result.experimental}</T></View>}
        {hasDetail && <T muted>{open ? '−' : '+'}</T>}
      </View>
      {open && (
        <View style={{ paddingStart: 22, paddingTop: 6, gap: 4 }}>
          {reason.ignored && <T muted style={{ fontSize: 13 }}>{t.result.ignored[reason.ignored]}</T>}
          {ev?.found && <T style={{ fontSize: 13 }}><T bold style={{ fontSize: 13 }}>{t.result.found}: </T>{ev.found}</T>}
          {ev?.reference && <T style={{ fontSize: 13 }}><T bold style={{ fontSize: 13 }}>{t.result.reference}: </T>{ev.reference}</T>}
          {ev?.sourceUrl && (
            <T style={{ fontSize: 13, color: p.brand, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(ev.sourceUrl!)}>
              {t.result.source}: {ev.sourceTitle ?? ev.sourceUrl}
            </T>
          )}
          {ev?.lastVerified && <T muted style={{ fontSize: 13 }}>{t.result.lastVerified}: {ev.lastVerified}</T>}
        </View>
      )}
    </Pressable>
  );
}
