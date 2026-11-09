import { Pressable, type PressableProps } from 'react-native';
import { T } from './T';
import { usePalette } from './theme';

export function Button({ title, variant = 'primary', disabled, ...rest }: PressableProps & { title: string; variant?: 'primary' | 'ghost' }) {
  const p = usePalette();
  const primary = variant === 'primary';
  return (
    <Pressable accessibilityRole="button" disabled={disabled} {...rest}
      style={({ pressed }) => ({ backgroundColor: primary ? p.brand : 'transparent', borderWidth: primary ? 0 : 1, borderColor: p.brand,
        flexShrink: 0, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', opacity: disabled ? 0.5 : pressed ? 0.85 : 1 })}>
      <T bold style={{ color: primary ? p.brandInk : p.brand }}>{title}</T>
    </Pressable>
  );
}
