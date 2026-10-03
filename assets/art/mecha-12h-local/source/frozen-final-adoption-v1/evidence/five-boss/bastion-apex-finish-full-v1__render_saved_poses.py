import bpy,json,os,time
from pathlib import Path
D=Path(__file__).resolve().parent
start=time.time();rendered=[]
for role in ['bastion','apex']:
 d=D/role;e=json.loads((d/'manifest-candidate.json').read_text())['entries'][0]
 seen=set()
 for state,f in e['frames'].items():
  name=f['filename']
  if name in seen:continue
  seen.add(name)
  if (d/name).exists():continue
  pose=d/('source-'+f['sourceState']+'.blend')
  assert pose.exists(),pose
  bpy.ops.wm.open_mainfile(filepath=str(pose));s=bpy.context.scene
  s.render.threads_mode='FIXED';s.render.threads=2;s.cycles.device='CPU'
  s.render.filepath=str(d/name);bpy.ops.render.render(write_still=True)
  rendered.append({'role':role,'state':state,'sourcePose':pose.name,'filename':name})
(D/'SAVED_POSE_RENDER.json').write_text(json.dumps({'device':'CPU','threads':2,'elapsedSeconds':time.time()-start,'newFrames':rendered,'sourceSavePerformed':False},indent=2))
print('SAVED POSE RENDER COMPLETE',len(rendered))
