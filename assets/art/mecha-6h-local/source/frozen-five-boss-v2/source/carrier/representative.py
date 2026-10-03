import bpy,sys,runpy,json,pathlib,hashlib,shutil,time,datetime
r=pathlib.Path(__file__).parent;old=r.parents[1]/'carrier-full-v2'/'carrier-full-v2';start=time.time();beg=datetime.datetime.now(datetime.timezone.utc).isoformat()
sys.argv=['blender','--','carrier'];runpy.run_path(str(r/'generate.py'),run_name='__main__')
m=json.loads((r/'manifest-candidate.json').read_text());p=json.loads((r/'production.json').read_text());e=m['entries'][0];bpy.ops.wm.open_mainfile(filepath=str(r/'actual.blend'));s=bpy.context.scene
chosen=['phase_000_payload2','phase_100_payload0']
for state in chosen:
 snap=next(x for x in p['snapshots'] if x['state']==state);s.frame_set(snap['timelineFrame']);bpy.context.view_layer.update();s.render.filepath=str(r/e['frames'][state]['filename']);bpy.ops.render.render(write_still=True);bpy.ops.wm.save_as_mainfile(filepath=str(r/('source-'+state+'.blend')))
for n in ['carrier-child.png','source-child.blend']:shutil.copy2(old/n,r/n)
(r/'manifest-source-all40-unrendered.json').write_text(json.dumps(m,indent=2))
frames={k:e['frames'][k] for k in chosen};frames['idle']=dict(frames[chosen[0]]);frames['open']=dict(frames[chosen[1]])
e['frames']=frames;e['mechanismFrames']=[{'progress':0,'state':chosen[0]},{'progress':1,'state':chosen[1]}];e.pop('semanticAliases',None);e['status']='REPRESENTATIVE ONLY: 2 rendered endpoints; full40 remains unrendered source proposal'
for en in m['entries']:
 for f in en['frames'].values():f['sha256']=hashlib.sha256((r/f['filename']).read_bytes()).hexdigest()
(r/'manifest-candidate.json').write_text(json.dumps(m,indent=2));p.update(renderExecuted=True,representativeOnly=True,renderedStates=chosen,startedUTC=beg,endedUTC=datetime.datetime.now(datetime.timezone.utc).isoformat(),renderElapsedSeconds=time.time()-start,files={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in r.iterdir() if f.suffix in ['.png','.blend']});(r/'production.json').write_text(json.dumps(p,indent=2));print('REPRESENTATIVE_SLOT_RETURN',time.time()-start,flush=True)
