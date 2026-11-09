import { Text, type TextProps } from 'react-native';
import { useI18n } from '../i18n';
import { font, usePalette } from './theme';

export function T({ style, bold, muted, ...rest }: TextProps & { bold?: boolean; muted?: boolean }) {
  const p = usePalette();
  const { t } = useI18n();
  return (
    <Text
      {...rest}
      style={[{ fontFamily: bold ? font.bold : font.regular, color: muted ? p.muted : p.ink, fontSize: 15, lineHeight: 23,
        writingDirection: t.dir, textAlign: 'auto' }, style]}
    />
  );
}
