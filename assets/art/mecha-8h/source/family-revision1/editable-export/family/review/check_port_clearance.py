"""Verify real 3D port visibility and projectile/nozzle axis clearance."""
import bpy,json,sys
from pathlib import Path
from mathutils import Vector
root=Path('/workspace/shared/skywind-3d-20261002/family')
results=[]
for role in ['orb','worm']:
    bpy.ops.wm.open_mainfile(filepath=str(root/'sources'/f'{role}.blend'))
    s=bpy.context.scene
    for state,frame in [('neutral',1),('open',21)]:
        if role=='worm' and state!='neutral':continue
        s.frame_set(frame);bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get()
        toward=s.camera.matrix_world.to_quaternion()@Vector((0,0,1))
        for o in bpy.data.objects:
            if not o.name.startswith(('ANCHOR_muzzle_','ANCHOR_nozzle_')):continue
            p=o.matrix_world.translation.copy();origin=p+toward*50
            hit,loc,n,idx,obj,mat=s.ray_cast(dg,origin,-toward,distance=50.0-.004)
            kind='muzzle' if 'muzzle' in o.name else 'nozzle';direction=Vector((-1,0,0)) if kind=='muzzle' else Vector((1,0,0))
            h2,l2,n2,i2,ob2,ma2=s.ray_cast(dg,p+direction*.008,direction,distance=10)
            results.append({'role':role,'state':state,'anchor':o.name,'world':[round(float(x),6) for x in p],'worldDirection':list(direction),'cameraObstruction':obj.name if hit else None,'axisObstruction':ob2.name if h2 else None,'cameraClear':not hit,'axisClear':not h2})
out={'checks':results,'allClear':all(x['cameraClear'] and x['axisClear'] for x in results)}
(root/'revision1-port-clearance.json').write_text(json.dumps(out,indent=2));print('PORT_CLEARANCE_RESULT',json.dumps(out))
