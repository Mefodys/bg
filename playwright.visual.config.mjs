import {defineConfig} from 'playwright/test';
import path from 'node:path';
const results=path.resolve(process.env.VISUAL_RESULTS||'reports/visual/test-results');
export default defineConfig({
 globalSetup:'./tests/visual/setup.mjs',testDir:'./tests/visual',testMatch:'visual.spec.mjs',
 workers:1,fullyParallel:false,retries:0,forbidOnly:true,timeout:30000,
 outputDir:results,snapshotPathTemplate:path.resolve(process.env.VISUAL_SNAPSHOTS||'reports/visual/snapshots')+'/{arg}{ext}',
 reporter:[['line'],['json',{outputFile:path.join(results,'results.json')}]],
 expect:{timeout:10000,toHaveScreenshot:{threshold:0,maxDiffPixels:0}},
 use:{locale:'en-US',timezoneId:'UTC',colorScheme:'light',deviceScaleFactor:1,
 reducedMotion:'reduce',bypassCSP:true,trace:'retain-on-failure',
 launchOptions:{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,args:['--disable-partial-raster','--force-color-profile=srgb']}},
});
