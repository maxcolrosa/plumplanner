import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**'],
    env: {
      STRIPE_SECRET_KEY: 'sk_test_placeholder',
      STRIPE_PRICE_ID_STARTER: 'price_starter_test',
      STRIPE_PRICE_ID_TEAM: 'price_team_test',
      STRIPE_PRICE_ID_AGENCY: 'price_agency_test',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
