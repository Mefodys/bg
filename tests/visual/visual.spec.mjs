import {test,expect} from 'playwright/test';
import {suite,captureScenario,finalize,initialize} from './harness.mjs';
// One worker: each test resets the shared, versioned native fixture catalogue.
test.afterAll(async({browser})=>finalize(browser));
for(const scenario of suite.scenarios){
 test.describe(scenario.id,()=>{
  test.use({viewport:scenario.viewport});
  test(scenario.caption,async({page},testInfo)=>{
   await captureScenario(page,scenario,expect,testInfo);
  });
 });
}
