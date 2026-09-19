import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({ resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } }, test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 30000, hookTimeout: 60000, fileParallelism: false, reporters: ['default'], exclude: ['tests/browser/**', 'tests/native-concurrency.test.ts'] } });
