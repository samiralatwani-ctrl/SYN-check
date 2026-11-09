import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { repo } from '../data/repo';
import type { SearchHit } from '@syn/scan-signals';
import { useI18n } from '../i18n';
import { startBarcode, toSymbology } from '../scan/session';
import { LabelCapture } from '../ui/LabelCapture';
import { Button } from '../ui/Button';
import { Card, Screen } from '../ui/Screen';
import { T } from '../ui/T';
import { usePalette } from '../ui/theme';

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr', 'datamatrix'] as const;

export default function ScanScreen() {
  const { t } = useI18n();
  const p = usePalette();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [mode, setMode] = useState<'barcode' | 'label'>('barcode');
  const lock = useRef(false);

  const check = useCallback(async (type: string, data: string) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const rec = await startBarcode(toSymbology(type), data);
      router.push({ pathname: '/result/[id]', params: { id: rec.id } });
    } catch {
      setError(t.scan.error);
    } finally {
      setBusy(false);
      setTimeout(() => { lock.current = false; }, 1500);
    }
  }, [t]);

  const onScanned = (r: BarcodeScanningResult) => check(r.type, r.data);
  const search = async () => {
    try { setHits(await repo.searchProducts(query)); setError(null); } catch { setError(t.scan.error); }
  };
  const inputStyle = { backgroundColor: p.card, color: p.ink, borderColor: p.line, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, textAlign: (t.dir === 'rtl' ? 'right' : 'left') as 'right' | 'left' };
  const cameraAvailable = Platform.OS !== 'web';

  return (
    <Screen>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['barcode', 'label', 'package'] as const).map((m) => {
          const enabled = m !== 'package';
          const active = m === mode;
          return (
            <Pressable key={m} disabled={!enabled} onPress={() => enabled && setMode(m as 'barcode' | 'label')} accessibilityRole="tab"
              accessibilityState={{ disabled: !enabled, selected: active }}
              style={{ flex: 1, borderRadius: 999, paddingVertical: 8, alignItems: 'center',
                backgroundColor: active ? p.brand : p.card, borderWidth: 1, borderColor: active ? p.brand : p.line }}>
              <T bold={active} style={{ fontSize: 13, color: active ? p.brandInk : enabled ? p.ink : p.muted }}>
                {t.scan.modes[m]}{enabled ? '' : ` · ${t.scan.soon}`}
              </T>
            </Pressable>
          );
        })}
      </View>

      {mode === 'label' && <Card><LabelCapture /></Card>}

      {mode === 'barcode' && <Card>
        {cameraAvailable && permission?.granted ? (
          <View style={{ height: 260, borderRadius: 12, overflow: 'hidden' }}>
            <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
              onBarcodeScanned={busy ? undefined : onScanned} />
            <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8, backgroundColor: 'rgba(0,0,0,0.55)' }}>
              <T style={{ color: '#fff', textAlign: 'center' }}>{busy ? t.scan.checking : t.scan.aim}</T>
            </View>
          </View>
        ) : cameraAvailable ? (
          <View style={{ gap: 8 }}>
            <T bold>{t.scan.permissionTitle}</T>
            <T muted>{t.scan.permissionBody}</T>
            <Button title={t.scan.grant} onPress={requestPermission} />
          </View>
        ) : (
          <T muted>{t.scan.noCamera}</T>
        )}
        <T bold style={{ marginTop: 6 }}>{t.scan.manual}</T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput value={manual} onChangeText={setManual} keyboardType="number-pad" placeholder={t.scan.manualPlaceholder}
            placeholderTextColor={p.muted} accessibilityLabel={t.scan.manual} style={[inputStyle, { flex: 1, minWidth: 0 }]}
            onSubmitEditing={() => check('ean13', manual)} />
          <Button title={busy ? t.scan.checking : t.scan.check} disabled={busy || manual.trim().length < 8}
            onPress={() => check(manual.trim().length === 8 ? 'ean8' : 'ean13', manual.trim())} />
        </View>
        {error && <T style={{ color: p.danger }}>{error}</T>}
      </Card>}

      <Card>
        <TextInput value={query} onChangeText={setQuery} placeholder={t.scan.search} placeholderTextColor={p.muted}
          accessibilityLabel={t.scan.search} returnKeyType="search" onSubmitEditing={search} style={inputStyle} />
        <T muted style={{ fontSize: 13 }}>{t.scan.searchHint}</T>
        {hits?.length === 0 && <T muted>{t.scan.noResults}</T>}
        {hits?.map((h) => (
          <View key={h.external_ref} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: p.line }}>
            <T bold>{h.official_name ?? h.external_ref}</T>
            <T muted style={{ fontSize: 13 }}>{[h.brand, t.status[h.verification_status]].filter(Boolean).join(' · ')}</T>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
