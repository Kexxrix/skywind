import bpy,json,math,sys,hashlib
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
root=Path(__file__).parent
folders={'warden':'design-revision-v2/warden-full','bastion':'bastion-full-v3','apex':'apex-full-v3','carrier':'design-revision-v3/carrier','lancer':'design-revision-v2/lancer-full'}
results=[]
for role,rel in folders.items():
 folder=root/rel;manifest=json.loads((folder/'manifest-candidate.json').read_text());entry=next(e for e in manifest['entries'] if role in e.get('roles',[]));seen=set()
 for state,f in entry['frames'].items():
  if f['filename'] in seen:continue
  seen.add(f['filename']);source=folder/('source-'+f['sourceState']+'.blend')
  bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene;cam=scene.camera;bpy.context.view_layer.update()
  def project(p):
   q=world_to_camera_view(scene,cam,p);return {'x':q.x*384,'y':(1-q.y)*384}
  err=[]
  for name,p,d in zip(f['muzzleNames'],f['muzzlesPixels'],f['muzzleDirectionsPixels']):
   for n,wanted in [(name,p),(name+'_direction',d)]:
    got=project(bpy.data.objects[n].matrix_world.translation);err.append(math.hypot(got['x']-wanted['x'],got['y']-wanted['y']))
  cp=project(bpy.data.objects['core_center'].matrix_world.translation);rp=project(bpy.data.objects['core_radius'].matrix_world.translation);err.append(math.hypot(cp['x']-f['corePixels']['x'],cp['y']-f['corePixels']['y']));err.append(abs(math.hypot(cp['x']-rp['x'],cp['y']-rp['y'])-f['corePixels']['radius']))
  nozzles=[project(o.matrix_world.translation) for o in bpy.data.objects if o.type=='EMPTY' and 'nozzle' in o.name]
  for p in f['nozzlesPixels']:err.append(min(math.hypot(q['x']-p['x'],q['y']-p['y']) for q in nozzles))
  mx=max(err);assert mx<.001,(role,state,mx)
  assert scene.render.resolution_x==384 and scene.render.resolution_y==384 and cam.data.type=='ORTHO'
  results.append({'role':role,'state':state,'source':str(source.relative_to(root)),'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'maxProjectedErrorPixels':mx,'cameraOrtho':cam.data.ortho_scale})
# Independent matching child source inspection, whole relative mesh and all3anchors.
folder=root/folders['carrier'];bpy.ops.wm.open_mainfile(filepath=str(folder/'actual.blend'));scene=bpy.context.scene;scene.frame_set(100);bpy.context.view_layer.update();dock=bpy.data.objects['dock_0'].matrix_world.translation.copy();parentCamera=(list(scene.camera.matrix_world),scene.camera.data.ortho_scale)
parent={o.name:[list(o.matrix_world@v.co-dock) for v in o.data.vertices] for o in bpy.data.objects if o.type=='MESH' and (o.name.startswith('child 0 ') or o.name.startswith('child_0_'))}
anchors={n:list(bpy.data.objects[n].matrix_world.translation-dock) for n in ['child_0_rail','child_0_rail_direction','child_0_nozzle']}
bpy.ops.wm.open_mainfile(filepath=str(folder/'source-child.blend'));scene=bpy.context.scene;bpy.context.view_layer.update();errors=[]
for n,vv in parent.items():
 o=bpy.data.objects[n];assert not o.hide_render;assert len(vv)==len(o.data.vertices)
 errors += [(Vector(v)-o.matrix_world@w.co).length for v,w in zip(vv,o.data.vertices)]
for n,v in anchors.items():errors.append((Vector(v)-bpy.data.objects[n].matrix_world.translation).length)
assert max(errors)<1e-5,max(errors);assert scene.camera.data.ortho_scale==parentCamera[1]
child={'parentAssembly':'design-revision-v3/carrier/actual.blend','standalone':'design-revision-v3/carrier/source-child.blend','relativeMeshCount':len(parent),'relativeVertexAndAnchorErrorMax':max(errors),'cameraScaleUnchanged':True,'anchors':anchors,'pass':True}
json.dump({'sourceStates':len(results),'maxProjectedErrorPixels':max(r['maxProjectedErrorPixels'] for r in results),'rows':results,'carrierMatchingChild':child,'sourceWrites':0,'renders':0,'pass':True},open(root/'SOURCE_REOPEN_AUDIT_V2.json','w'),indent=2)
print('SOURCE REOPEN PASS',len(results),'child relative error',max(errors))
