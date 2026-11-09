import { IBMPlexSansArabic_400Regular, IBMPlexSansArabic_600SemiBold, useFonts } from '@expo-google-fonts/ibm-plex-sans-arabic';
import { Link, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { I18nProvider, useI18n } from '../i18n';
import { T } from '../ui/T';
import { font, usePalette } from '../ui/theme';

function Nav() {
  const { t } = useI18n();
  const p = usePalette();
  const headerLinks = () => (
    <View style={{ flexDirection: 'row', gap: 14, paddingHorizontal: 8 }}>
      <Link href="/about-method"><T style={{ color: p.brand }}>{t.tabs.about}</T></Link>
      <Link href="/settings"><T style={{ color: p.brand }}>{t.tabs.settings}</T></Link>
    </View>
  );
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: p.card }, headerTintColor: p.ink,
        headerTitleStyle: { fontFamily: font.bold }, contentStyle: { backgroundColor: p.bg } }}>
        <Stack.Screen name="index" options={{ title: t.app.name, headerRight: headerLinks }} />
        <Stack.Screen name="result/[id]" options={{ title: t.result.reasons }} />
        <Stack.Screen name="next-steps/[id]" options={{ title: t.result.whatNow }} />
        <Stack.Screen name="about-method" options={{ title: t.about.title }} />
        <Stack.Screen name="settings" options={{ title: t.tabs.settings }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({ IBMPlexSansArabic_400Regular, IBMPlexSansArabic_600SemiBold });
  if (!loaded) return null;
  return <I18nProvider><Nav /></I18nProvider>;
}
