import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { 'react-native-url-polyfill/auto': fileURLToPath(new URL('./test/stubs/empty.ts', import.meta.url)) } },
});
