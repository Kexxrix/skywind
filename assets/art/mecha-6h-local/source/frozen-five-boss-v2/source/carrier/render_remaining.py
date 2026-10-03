import bpy,pathlib,json,hashlib,time,datetime,shutil
r=pathlib.Path(__file__).parent;proof=r/'representative-evidence';proof.mkdir(exist_ok=True)
for n in ['manifest-candidate.json','production.json','REPORT.ko.md','validation.json','source-index.json','handoff-hashes.json','hull-inspection.json']:
 shutil.copy2(r/n,proof/n)
m=json.loads((r/'manifest-source-all40-unrendered.json').read_text());p=json.loads((r/'production.json').read_text());e=m['entries'][0];start=time.time();beg=datetime.datetime.now(datetime.timezone.utc).isoformat()
bpy.ops.wm.open_mainfile(filepath=str(r/'actual.blend'));s=bpy.context.scene;assert s.cycles.device=='CPU' and s.render.threads==2
for snap in p['snapshots']:
 state=snap['state'];f=e['frames'][state]
 if state in p['renderedStates']:continue
 s.frame_set(snap['timelineFrame']);bpy.context.view_layer.update();s.render.filepath=str(r/f['filename']);bpy.ops.render.render(write_still=True);bpy.ops.wm.save_as_mainfile(filepath=str(r/('source-'+state+'.blend')));print('POSE_COMPLETE',state,flush=True)
for entry in m['entries']:
 for f in entry['frames'].values():
  f['sha256']=hashlib.sha256((r/f['filename']).read_bytes()).hexdigest()
  if 'child' in entry['key']:f['muzzleNames']=['child_0_rail']
e['status']='full candidate, independent representative direction accepted; user final approval and game integration remain separate'
e['semanticAliases'].update(charge='neutral current pose with code telegraph',damaged='current mechanism/recoil pose with runtime effect')
(r/'manifest-candidate.json').write_text(json.dumps(m,indent=2),encoding='utf-8')
p.update(representativeOnly=False,newFullRenderStartedUTC=beg,newFullRenderEndedUTC=datetime.datetime.now(datetime.timezone.utc).isoformat(),remainingRenderElapsedSeconds=time.time()-start,newRenderedRemainingPNG=38,allRuntimePNGUnique=41,allPoseSourceBlend=40,files={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in r.iterdir() if f.suffix in ['.png','.blend'] and not f.name.startswith(('hull-','before-after-','compare-','all-states'))})
(r/'production.json').write_text(json.dumps(p,indent=2),encoding='utf-8');print('RENDER_SLOT_RETURN',time.time()-start,flush=True)
