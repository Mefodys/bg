import { defineConfig } from 'playwright/test';
import path from 'node:path';
const output=path.resolve(process.env.TAG_VISUAL_OUTPUT||'reports/tags-visual');
export default defineConfig({testDir:'./tests/visual',testMatch:'tags.spec.mjs',workers:1,fullyParallel:false,retries:0,forbidOnly:true,timeout:45000,
  outputDir:output+'/test-results',snapshotPathTemplate:path.resolve(process.env.TAG_VISUAL_SNAPSHOTS||'reports/tags-visual-snapshots')+'/{arg}{ext}',
  reporter:[['line'],['json',{outputFile:output+'/results.json'}]],expect:{timeout:10000,toHaveScreenshot:{threshold:0,maxDiffPixels:0}},
  use:{locale:'en-US',timezoneId:'UTC',colorScheme:'light',deviceScaleFactor:1,reducedMotion:'reduce',bypassCSP:true,trace:'retain-on-failure',
  launchOptions:{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,args:['--disable-partial-raster','--force-color-profile=srgb']}}});
