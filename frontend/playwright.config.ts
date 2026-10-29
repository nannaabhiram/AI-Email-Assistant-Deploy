import { defineConfig } from '@playwright/test'

/**
 * End-to-end tests against the real local stack (Supabase + API + worker + Vite).
 * Start them first (see docs/RUNNING.md); uses the system Chrome, no browser download.
 * Requires the synthetic demo user from supabase/seed.sql.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: 0,
  // Every test signs in as the same seeded demo user; running them serially avoids races on shared rows
  // (drafts, overrides) and the per-user API rate limit.
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1366, height: 860 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
})
