import bpy,os,json,shutil,hashlib,time
root=os.path.dirname(os.path.abspath(__file__));started=time.time()
for role in ['carrier','lancer']:
 source=os.path.join(root,role+'-finish-v1');out=os.path.join(root,'full-candidate',role+'-finish-v1');os.makedirs(out,exist_ok=True)
 m=json.load(open(os.path.join(source,'manifest-all-source-poses.json')));p=json.load(open(os.path.join(source,'production.json')))
 shutil.copyfile(os.path.join(source,'actual.blend'),os.path.join(out,'actual.blend'));bpy.ops.wm.open_mainfile(filepath=os.path.join(source,'actual.blend'))
 s=bpy.context.scene;assert s.render.threads==2 and s.cycles.device=='CPU'
 rendered=[];reused=[]
 for snap in p['snapshots']:
  state=snap['state'];f=m['entries'][0]['frames'][state];filename=f['filename'];prior=os.path.join(source,filename)
  if os.path.exists(prior):shutil.copyfile(prior,os.path.join(out,filename));reused.append(state);continue
  s.frame_set(snap['timelineFrame']);bpy.context.view_layer.update();s.render.filepath=os.path.join(out,filename);bpy.ops.render.render(write_still=True);rendered.append(state)
 if role=='carrier':shutil.copyfile(os.path.join(source,'carrier-child.png'),os.path.join(out,'carrier-child.png'));m['entries'][0]['payloadMechanismSelection'].pop('status',None)
 for e in m['entries']:e['status']='full finishing local candidate; technical QC complete only after FULL_REPORT; runtime adoption by code lead'
 json.dump(m,open(os.path.join(out,'manifest-candidate.json'),'w'),indent=2)
 p.update(renderedRemainingStates=rendered,reusedFinalRepresentativeStates=reused,sourcePolicy='copied final accepted child-corrected actual.blend byte-for-byte; no source regeneration; no pre-child fix assets',renderDriverSHA256=hashlib.sha256(open(__file__,'rb').read()).hexdigest(),elapsedSeconds=time.time()-started)
 p['files']={n:hashlib.sha256(open(os.path.join(out,n),'rb').read()).hexdigest() for n in os.listdir(out) if n.endswith(('.blend','.png'))};json.dump(p,open(os.path.join(out,'production.json'),'w'),indent=2)
 print('FULL_ROLE_COMPLETE',role,len(rendered),len(reused),flush=True)
print('CPU_SLOT_COMPLETE',time.time()-started,flush=True)
