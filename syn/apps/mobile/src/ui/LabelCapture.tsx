import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { repo } from '../data/repo';
import { useI18n } from '../i18n';
import { pickLabelPhoto, takeLabelPhoto, type Photo } from '../scan/photo';
import { addLabel } from '../scan/session';
import { Button } from './Button';
import { T } from './T';
import { usePalette } from './theme';

/** Label photo -> server reading -> confirmation screen. `sessionId` attaches the label to an earlier barcode scan. */
export function LabelCapture({ sessionId }: { sessionId?: string }) {
  const { t } = useI18n();
  const p = usePalette();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (get: () => Promise<Photo | null>) => {
    setError(null);
    const photo = await get();
    if (!photo) return;
    setBusy(true);
    try {
      const s = await addLabel(sessionId ?? null, photo);
      router.push({ pathname: '/confirm/[id]', params: { id: s.id } });
    } catch {
      setError(t.label.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <T muted style={{ fontSize: 13 }}>{t.label.hint}</T>
      {busy ? <T bold>{t.label.reading}</T> : (
        <>
          {Platform.OS !== 'web' && <Button title={t.label.take} onPress={() => run(takeLabelPhoto)} />}
          <Button title={t.label.pick} variant="ghost" onPress={() => run(pickLabelPhoto)} />
          {repo.demo && <Button title={t.label.demo} variant="ghost" onPress={() => run(async () => ({ base64: 'VEVTVF8=', mediaType: 'image/jpeg', uri: '' }))} />}
        </>
      )}
      {error && <T style={{ color: p.danger }}>{error}</T>}
    </View>
  );
}
