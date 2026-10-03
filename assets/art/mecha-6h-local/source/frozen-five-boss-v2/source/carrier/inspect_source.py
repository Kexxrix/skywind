import bpy,json,pathlib,math
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
r=pathlib.Path(__file__).parent;p=json.loads((r/'production.json').read_text());m=json.loads((r/'manifest-source-all40-unrendered.json').read_text());e=m['entries'][0]
code=(r/'generate.py').read_text();exec(code[code.index('def project(v):'):code.index('# Full revision')])
bpy.ops.wm.open_mainfile(filepath=str(r/'actual.blend'));scene=bpy.context.scene;cam=scene.camera
anchors={n:bpy.data.objects[n] for n in ['defence_upper','defence_upper_direction','defence_keel','defence_keel_direction','nozzle_0','nozzle_-0.81','core_center','core_radius']}
rows=[]
for snap in p['snapshots']:
 scene.frame_set(snap['timelineFrame']);bpy.context.view_layer.update();f=e['frames'][snap['state']];actual=metadata(list(bpy.data.objects),['defence_upper','defence_keel'],snap['mechanismProgress']==1)
 hullsame=sorted(json.dumps(h,sort_keys=True) for h in actual['bodyHullPixels'])==sorted(json.dumps(h,sort_keys=True) for h in f['bodyHullPixels'])
 ok=all(actual[k]==f[k] for k in ['muzzlesPixels','muzzleDirectionsPixels','nozzlesPixels','corePixels','bodyBoundsPixels']) and hullsame
 assert ok,snap['state'];rows.append({'state':snap['state'],'projectedSourceExact':ok,'cyanHidden':bpy.data.objects['carrier concealed reactor'].hide_render})
child={o.name: {'vertices':[list(v.co) for v in o.data.vertices],'relativeLocation':list(o.location-bpy.data.objects['dock_0' if o.name.startswith(('child 0 ','child_0_')) else 'dock_1'].location),'shader':list(o.data.materials[0].diffuse_color)} for o in bpy.data.objects if o.type=='MESH' and o.name.startswith(('child 0 ','child_0_','child 1 ','child_1_'))}
result={'pass':True,'sourceSnapshots':rows,'camera':{'location':list(cam.location),'orthoScale':cam.data.ortho_scale},'childGeometry':child,'sourcePosePNGCount':2,'unrenderedSourceSnapshotCount':38}
before=r.parents[1]/'carrier-full-v2'/'carrier-full-v2'/'actual.blend';bpy.ops.wm.open_mainfile(filepath=str(before));bpy.context.scene.frame_set(100);bpy.context.view_layer.update()
oldchild={o.name: {'vertices':[list(v.co) for v in o.data.vertices],'relativeLocation':list(o.location-bpy.data.objects['dock_0' if o.name.startswith(('child 0 ','child_0_')) else 'dock_1'].location),'shader':list(o.data.materials[0].diffuse_color)} for o in bpy.data.objects if o.type=='MESH' and o.name.startswith(('child 0 ','child_0_','child 1 ','child_1_'))}
result['matchingChildMeshExactVsV1']=child==oldchild;assert child==oldchild
(r/'source-geometry-qc.json').write_text(json.dumps(result,indent=2));print('SOURCE_EXACT',len(rows))
