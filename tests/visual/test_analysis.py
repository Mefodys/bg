import unittest
from analyze import classify
class ClassificationTests(unittest.TestCase):
 def rule(self):return {'baseSHA':'base','changes':[{'scenario':'desktop/a','reason':'Change search background','afterPixelSHA256':'hash','regions':[{'x':10,'y':20,'width':10,'height':10}]}]}
 def test_unchanged(self):self.assertEqual(classify('a',[],'x','base',{}),'UNCHANGED')
 def test_undeclared_difference_is_regression(self):self.assertEqual(classify('a',[(1,2)],'x','base',{}),'REGRESSION')
 def test_explicit_exact_feature_change(self):self.assertEqual(classify('desktop/a',[(10,20),(19,29)],'hash','base',self.rule()),'EXPECTED FEATURE CHANGE')
 def test_outside_feature_region_is_regression(self):self.assertEqual(classify('desktop/a',[(20,20)],'hash','base',self.rule()),'REGRESSION')
 def test_stale_baseline_declaration_is_regression(self):self.assertEqual(classify('desktop/a',[(10,20)],'hash','other',self.rule()),'REGRESSION')
 def test_wrong_reviewed_image_is_regression(self):self.assertEqual(classify('desktop/a',[(10,20)],'other','base',self.rule()),'REGRESSION')
 def test_changed_behavior_not_hidden_by_visual_declaration(self):self.assertEqual(classify('desktop/a',[(10,20)],'hash','base',self.rule(),False,{'count':'0'}),'REGRESSION')
 def test_invalid_region_is_regression(self):
  rule=self.rule();rule['changes'][0]['regions'][0]['width']=0
  self.assertEqual(classify('desktop/a',[(10,20)],'hash','base',rule),'REGRESSION')
class PixelIntegrationTests(unittest.TestCase):
 def test_reports_actual_pixels_and_rejects_undeclared_change(self):
  import tempfile,json,hashlib
  from pathlib import Path
  from analyze import analyze
  from compare import png
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);before=root/'old';after=root/'new';before.mkdir();after.mkdir()
   common={'environment':{},'suiteHash':'suite','fixtureHash':'fixtures','scriptHash':'script'}
   for folder,color,sha in [(before,b'\xff\xff\xff\xff','base'),(after,b'\xff\x00\x00\xff','head')]:
    png(folder/'frame.png',1,1,color)
    (folder/'manifest.json').write_text(json.dumps({**common,'servingSHA':sha,'scenarios':[{'id':'frame','file':'frame.png','observed':{}}]}))
   self.assertEqual(analyze(before,after,root/'unexpected',{}),1)
   self.assertTrue((root/'unexpected/comparison.md').read_text().startswith('# REGRESSION'))
   rules={'baseSHA':'base','changes':[{'scenario':'frame','reason':'Reviewed feature color','afterPixelSHA256':hashlib.sha256(b'\xff\x00\x00\xff').hexdigest(),'regions':[{'x':0,'y':0,'width':1,'height':1}]}]}
   self.assertEqual(analyze(before,after,root/'expected',rules),0)
   self.assertIn('EXPECTED FEATURE CHANGE',(root/'expected/comparison.md').read_text())
 def test_incompatible_fonts_are_not_declared_regression(self):
  import tempfile,json
  from pathlib import Path
  from analyze import analyze
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp)
   for name,font in [('before','a'),('after','b')]:
    d=root/name;d.mkdir();(d/'manifest.json').write_text(json.dumps({'environment':{'font':font},'suiteHash':'s','fixtureHash':'f','scriptHash':'s'}))
   with self.assertRaisesRegex(ValueError,'INCOMPATIBLE'):analyze(root/'before',root/'after',root/'out',{})
class FailureClassificationTests(unittest.TestCase):
 def report(self,error=None,top_errors=None):
  return {'errors':top_errors or [],'suites':[{'specs':[{'tests':[{'results':[{'errors':[{'message':error}] if error else []}]}]}]}]}
 def check(self,report):
  import tempfile,json
  from pathlib import Path
  from failure import failure_heading
  with tempfile.TemporaryDirectory() as temp:
   p=Path(temp)/'results.json';p.write_text(json.dumps(report))
   return failure_heading(['node','playwright'],p)
 def test_git_startup_failure_is_incomplete(self):
  self.assertIn('INCOMPLETE',self.check(self.report(top_errors=[{'message':'git rev-parse failed'}])))
 def test_same_revision_snapshot_failure_is_nondeterminism(self):
  self.assertIn('NONDETERMINISTIC',self.check(self.report('expect(page).toHaveScreenshot: Screenshot comparison failed')))
 def test_behavior_assertion_failure_is_regression(self):
  self.assertIn('REGRESSION',self.check(self.report('Expected 1 of 8; received 0 of 8')))
 def test_missing_result_file_is_incomplete(self):
  from failure import failure_heading
  self.assertIn('INCOMPLETE',failure_heading(['node','playwright']))
if __name__=='__main__':unittest.main()
