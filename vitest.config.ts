import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/_mocks/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/schemas/openapi.ts', 'src/config/env.ts'],
    },
    clearMocks: true,
    restoreMocks: true,
  },
});
