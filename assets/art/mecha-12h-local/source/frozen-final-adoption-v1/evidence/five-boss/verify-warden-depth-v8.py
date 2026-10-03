import bpy, json, os, math, hashlib
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
root=os.path.dirname(os.path.abspath(__file__))
d=os.path.join(root,'warden-depth-v8')
entry=json.load(open(os.path.join(d,'manifest-candidate.json')))['entries'][0]
rows=[]
def project(o):
 p=world_to_camera_view(bpy.context.scene,bpy.context.scene.camera,o.matrix_world.translation)
 return {'x':p.x*384,'y':(1-p.y)*384}
for state,frame in entry['frames'].items():
 bpy.ops.wm.open_mainfile(filepath=os.path.join(d,'source-'+state+'.blend'))
 names=['tower_-1_0','tower_-1_1','tower_1_0','tower_1_1','center_lance']
 checks=[]
 for n,target in zip(names,frame['muzzlesPixels']):
  p=project(bpy.data.objects[n]);checks.append(math.hypot(p['x']-target['x'],p['y']-target['y']))
 for n,target in zip(names,frame['muzzleDirectionsPixels']):
  p=project(bpy.data.objects[n+'_direction']);checks.append(math.hypot(p['x']-target['x'],p['y']-target['y']))
 p=project(bpy.data.objects['core_center']);target=frame['corePixels'];checks.append(math.hypot(p['x']-target['x'],p['y']-target['y']))
 lens=bpy.data.objects['recessed reactor energy lens']
 rows.append({'state':state,'maxAnchorErrorPixels':max(checks),'coreVisibilityMatches':(not lens.hide_render)==frame['coreExposed'],'cameraOrthographic':bpy.context.scene.camera.data.type=='ORTHO'})
bpy.ops.wm.open_mainfile(filepath=os.path.join(d,'actual.blend'))
animation=[]
for state in ['phase_0','phase_25','phase_50','phase_75','phase_100']:
 frame=entry['frames'][state];bpy.context.scene.frame_set(frame['authoringFrame']);bpy.context.view_layer.update()
 bpy.ops.wm.save_as_mainfile(filepath=os.path.join(d,'pose-validation-temp.blend')) if False else None
 names=['shutter actual telescoping piston -1','shutter actual telescoping piston 1','lance actual polished lifting piston']
 # Compare every mesh's world transform with its saved authoring pose.
 actual={o.name:list(v for row in o.matrix_world for v in row) for o in bpy.data.objects if o.type=='MESH'}
 bpy.ops.wm.open_mainfile(filepath=os.path.join(d,'source-'+state+'.blend'))
 error=max(abs(v-w) for o in bpy.data.objects if o.type=='MESH' for v,w in zip(actual[o.name],(v for row in o.matrix_world for v in row)))
 animation.append({'state':state,'maxMeshWorldMatrixError':error})
 bpy.ops.wm.open_mainfile(filepath=os.path.join(d,'actual.blend'))
result={'sourcePoseChecks':rows,'actualAnimationChecks':animation,'pass':all(r['maxAnchorErrorPixels']<.001 and r['coreVisibilityMatches'] and r['cameraOrthographic'] for r in rows) and all(r['maxMeshWorldMatrixError']<.001 for r in animation)}
json.dump(result,open(os.path.join(d,'source-pose-verification.json'),'w'),indent=2)
print(json.dumps(result))

