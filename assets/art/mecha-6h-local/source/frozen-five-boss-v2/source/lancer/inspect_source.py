import bpy,json,pathlib,math
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
r=pathlib.Path(__file__).parent;e=json.loads((r/'manifest-candidate.json').read_text())['entries'][0]
code=(r/'generate.py').read_text();exec(code[code.index('def project(v):'):code.index('lock_base=lock.location.copy()')])
rows=[]
for state,f in e['frames'].items():
 bpy.ops.wm.open_mainfile(filepath=str(r/('source-'+state+'.blend')));scene=bpy.context.scene;cam=scene.camera;anchors={n:bpy.data.objects[n] for n in f['sourceAnchors']};bpy.context.view_layer.update();a=metadata(list(bpy.data.objects),f['muzzleNames'],f['coreExposed'])
 same=sorted(json.dumps(h,sort_keys=True) for h in a['bodyHullPixels'])==sorted(json.dumps(h,sort_keys=True) for h in f['bodyHullPixels'])
 assert same and all(a[k]==f[k] for k in ['muzzlesPixels','muzzleDirectionsPixels','nozzlesPixels','corePixels','bodyBoundsPixels']),state
 assert bpy.data.objects['deployable cyan service core'].hide_render==(f['mechanismProgress']<1)
 rows.append({'state':state,'sourceExact':True,'coreHidden':f['mechanismProgress']<1})
(r/'source-geometry-qc.json').write_text(json.dumps(rows,indent=2));print('SOURCE_EXACT',len(rows))
