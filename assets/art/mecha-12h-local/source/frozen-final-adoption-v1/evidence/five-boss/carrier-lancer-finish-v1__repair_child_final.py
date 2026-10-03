import runpy,sys,os,json,shutil,hashlib
root=os.path.dirname(os.path.abspath(__file__))
for role in ['carrier']:
 sys.argv=[os.path.join(root,'generate.py'),'--',role,'--render','--representative','--child-only'];runpy.run_path(sys.argv[0],run_name='__main__')
 folder=os.path.join(root,role+'-finish-v1');m=json.load(open(os.path.join(folder,'manifest-candidate.json')))
 json.dump(m,open(os.path.join(folder,'manifest-all-source-poses.json'),'w'),indent=2)
 selected=['phase_000_payload2','phase_075_payload0','phase_100_payload0'] if role=='carrier' else ['phase_000','phase_075','phase_100_fire']
 e=m['entries'][0];allframes=e['frames'];e['frames']={n:allframes[n] for n in selected};e['mechanismFrames']=[{'progress':p,'state':n} for p,n in zip([0,.75,1],selected)]
 for alias,n in [('idle',selected[0]),('charge',selected[0]),('fire',selected[0] if role=='carrier' else selected[-1]),('open',selected[-1])]:e['frames'][alias]=dict(allframes[n],semanticAliasOf=n)
 e['status']='representative finishing candidate only; six new PNG across both bosses; full expansion awaiting gate'
 if role=='carrier':
  source=os.path.join(root,'..','carrier-lancer-core-access-v3','carrier-v4','carrier-child.png');shutil.copyfile(source,os.path.join(folder,'carrier-child.png'));e['payloadMechanismSelection']['status']='representative subset; full four-payload/five-phase source poses are in manifest-all-source-poses.json and actual.blend, remaining27 PNG not rendered'
 json.dump(m,open(os.path.join(folder,'manifest-candidate.json'),'w'),indent=2)
 p=json.load(open(os.path.join(folder,'production.json')));p['renderedRepresentativeStates']=selected;p['files']={n:hashlib.sha256(open(os.path.join(folder,n),'rb').read()).hexdigest() for n in os.listdir(folder) if n.endswith(('.blend','.png'))};json.dump(p,open(os.path.join(folder,'production.json'),'w'),indent=2)
