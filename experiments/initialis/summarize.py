"""Summarize captured research evidence; never manufactures missing measurements."""
import json, math, pathlib, hashlib, subprocess
root=pathlib.Path(__file__).resolve().parents[2]
art=root/'artifacts/initialis-investigation'
out=pathlib.Path(__file__).parent/'evidence';out.mkdir(exist_ok=True)
def read(p): return json.loads(p.read_text())
def stats(xs):
 s=sorted(xs)
 return dict(n=len(s),median=s[len(s)//2],p95=s[math.ceil(len(s)*.95)-1],max=s[-1]) if s else None
summary={'mutableCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'initialisCommit':'6cf93f7d3d2922efdbeb86cafa27f39758be9398','machine':{'cpu':'Apple M1','logicalCpus':8,'ramBytes':8589934592,'macOS':'15.5','viewport':[1500,990],'dpr':1,'build':'Vite development, Chrome headless, native Metal GPU'},'runs':{}}
for name in ['baseline','baseline-paired','cached','contended']:
 directory=art/name;r={'typing':read(directory/'results.json')['result']}
 if (directory/'interaction.json').exists():
  i=read(directory/'interaction.json');r['interaction']={**i,'paintSummary':stats([x['duration'] for x in i['events']]),'caretSummary':stats([x['caretMs'] for x in i['samples']])}
 if (directory/'research.json').exists():
  j=read(directory/'research.json');r['research']=j['research'];r['browser']=j['browser'];r['gpu']=j['gpu']['devices'];r['browserErrors']=j['errors'];r['accessibilityCounts']={kind:sum(n['role']==kind for n in j['accessibility']) for kind in ['textbox','StaticText','image']}
  if name=='cached':
   requests=j['assetRequests'];unique={v['path']:v for v in requests if v.get('bytes')}
   r['assetLoad']={'requests':len(requests),'responseBytes':sum(v.get('bytes',0) for v in requests),'uniquePaths':len(unique),'uniqueBytes':sum(v['bytes'] for v in unique.values())}
   manifest=[]
   for path,item in sorted(unique.items()):
    file=pathlib.Path('/tmp/mutable-initialis-investigation')/path
    manifest.append({'path':path,'bytes':item['bytes'],'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
   (out/'observed-assets.json').write_text(json.dumps(manifest,indent=2)+'\n')
 summary['runs'][name]=r
(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(out/'summary.json')
