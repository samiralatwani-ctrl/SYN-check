import { useColorScheme } from 'react-native';
import type { VerdictCode } from '@syn/rules-engine';

// SYN identity: deep teal + sand. Every verdict has colour + icon + text (never colour alone).
const light = {
  bg: '#EEF2F0', card: '#FFFFFF', ink: '#13201B', muted: '#566760', line: '#DCE3E0', brand: '#0F6B52', brandInk: '#FFFFFF',
  banner: '#FFF4D6', bannerInk: '#6B4A00', danger: '#B42318',
};
const dark: typeof light = {
  bg: '#0E1513', card: '#18221F', ink: '#E7EFEB', muted: '#9AABA4', line: '#2A3632', brand: '#5FD0A8', brandInk: '#08201A',
  banner: '#3A2F10', bannerInk: '#F3CF73', danger: '#FF8A80',
};
export type Palette = typeof light;
export const usePalette = (): Palette => (useColorScheme() === 'dark' ? dark : light);

/** Verdict colours: contrast-checked for white text (light) / dark text (dark mode uses tinted surfaces). */
export const VERDICT: Record<VerdictCode, { color: string; icon: string }> = {
  match: { color: '#1E7A4C', icon: '✓' },
  minor: { color: '#8A6100', icon: '≈' },
  suspect: { color: '#B54708', icon: '!' },
  mismatch: { color: '#B42318', icon: '✕' },
  insufficient: { color: '#4B5563', icon: '?' },
};
export const SEVERITY_DOT: Record<string, string> = {
  critical: '#B42318', major: '#B54708', minor: '#8A6100', match: '#1E7A4C', unavailable: '#6B7280', ignored: '#9CA3AF',
};
export const font = { regular: 'IBMPlexSansArabic_400Regular', bold: 'IBMPlexSansArabic_600SemiBold' };
