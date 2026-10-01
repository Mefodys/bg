import { defineConfig } from 'playwright/test';
export default defineConfig({
  testDir: './tests/features', workers: 1, retries: 0, forbidOnly: true,
  timeout: 60000, outputDir: process.env.FEATURE_ARTIFACTS || 'reports/features',
  reporter: [['line'], ['html', { outputFolder: 'reports/feature-report', open: 'never' }]],
  snapshotPathTemplate: '{testDir}/../../reports/feature-snapshots/{testFilePath}/{arg}{ext}',
  expect: { toHaveScreenshot: { threshold: 0, maxDiffPixels: 0 } },
  use: { viewport: { width: 1440, height: 1000 }, locale: 'en-US', timezoneId: 'UTC',
    colorScheme: 'light', reducedMotion: 'reduce', deviceScaleFactor: 1,
    video: 'on', trace: 'retain-on-failure' }
});
