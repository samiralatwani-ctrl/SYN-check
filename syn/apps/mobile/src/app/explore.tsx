import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { repo } from '../data/repo';
import type { ExploreData } from '../data/types';
import { useI18n } from '../i18n';
import { Button } from '../ui/Button';
import { Card, Screen } from '../ui/Screen';
import { T } from '../ui/T';
import { usePalette } from '../ui/theme';

export default function Explore() {
  const { t } = useI18n();
  const p = usePalette();
  const [data, setData] = useState<ExploreData | null>(null);
  const [error, setError] = useState(false);
  const [shown, setShown] = useState(15);
  useEffect(() => { repo.explore().then(setData).catch(() => setError(true)); }, []);
  if (error) return <Screen><T>{t.scan.error}</T></Screen>;
  if (!data) return <Screen><T muted>…</T></Screen>;

  return (
    <Screen>
      <Card>
        <T bold style={{ fontSize: 17 }}>{t.explore.verified} ({data.verified.length})</T>
        {data.verified.map((v) => (
          <View key={v.external_ref} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: p.line }}>
            <T bold>{v.official_name}</T>
            <T muted style={{ fontSize: 13 }}>{[v.brand, v.category].filter(Boolean).join(' · ')}</T>
          </View>
        ))}
      </Card>

      <Card>
        <T bold style={{ fontSize: 17 }}>{t.explore.agents}</T>
        {data.agents.map((a, i) => (
          <View key={i} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: p.line }}>
            <T bold>{a.brand} — {a.country_name ?? a.region}</T>
            <T style={{ fontSize: 14 }}>{a.availability === 'listed' ? a.text : t.explore.notOfficial}</T>
            {(a.sources ?? []).map((u) => <T key={u} style={{ color: p.brand, fontSize: 12 }} onPress={() => Linking.openURL(u)}>{t.explore.source}</T>)}
          </View>
        ))}
      </Card>

      <Card>
        <T bold style={{ fontSize: 17 }}>{t.explore.alerts} ({data.alerts.length})</T>
        {data.alerts.slice(0, shown).map((a, i) => (
          <View key={i} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: p.line }}>
            <T bold style={{ fontSize: 14 }}>{a.product_text}</T>
            <T muted style={{ fontSize: 13 }}>
              {a.authority}{a.country ? ` (${a.country})` : ''} · {a.decision_date ?? ''} · {a.lot_scope === 'all_batches' ? t.explore.allBatches : `${t.explore.batch} ${a.lot_text}`}
            </T>
            <T style={{ color: p.brand, fontSize: 12 }} onPress={() => Linking.openURL(a.source_url)}>{t.explore.source}</T>
          </View>
        ))}
        {shown < data.alerts.length && <Button title={t.explore.more} variant="ghost" onPress={() => setShown(shown + 30)} />}
      </Card>
    </Screen>
  );
}
