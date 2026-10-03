import bpy,json,os,hashlib,math
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector
root=os.path.dirname(os.path.abspath(__file__));art=os.path.dirname(root);result={'policy':'read-only source model introspection; source scene frame0 evaluates earliest authored idle; no source rewrite or render','entries':[]}
def sha(p):return hashlib.sha256(open(p,'rb').read()).hexdigest()
roles=[('carrier','carrier-lancer-finish-v1/full-candidate/carrier-finish-v1',['defence_upper','defence_keel'],['nozzle_0','nozzle_-0.81']),('lancer','carrier-lancer-finish-v1/full-candidate/lancer-finish-v1',['siege_lance','offset_suppressor'],['nozzle_main']),('orb','normal-orb/orb-representative-v3',['trident_2','trident_1','trident_0'],['nozzle_main'])]
for role,relative,names,nozzles in roles:
 folder=os.path.join(art,relative);source=os.path.join(folder,'actual.blend');bpy.ops.wm.open_mainfile(filepath=source);s=bpy.context.scene;s.frame_set(0);bpy.context.view_layer.update();entry=json.load(open(os.path.join(folder,'manifest-candidate.json')))['entries'][0];f=entry['frames']['idle']
 def record(name):
  o=bpy.data.objects[name];assert o.type=='EMPTY';p=o.matrix_world.translation;q=world_to_camera_view(s,s.camera,p);return {'name':name,'world':list(p),'projected384':{'x':q.x*384,'y':(1-q.y)*384}}
 ports=[]
 for i,name in enumerate(names):
  mouth=record(name);forward=record(name+'_direction');t=f['muzzlesPixels'][i];u=f['muzzleDirectionsPixels'][i];error=max(math.hypot(mouth['projected384']['x']-t['x'],mouth['projected384']['y']-t['y']),math.hypot(forward['projected384']['x']-u['x'],forward['projected384']['y']-u['y']));ports.append({'index':i,'muzzleEmpty':name,'forwardEmpty':name+'_direction','sourceFrame0Muzzle':mouth,'sourceFrame0Forward':forward,'metadataErrorPixels':error})
 row={'role':role,'entryKey':entry['key'],'actualSource':source,'sourceSHA256':sha(source),'sourceFrame':0,'idleAlias':f['sourceState'],'displayWidth':entry['displayWidth'],'pivotPixels':entry['pivotPixels'],'camera':{'name':s.camera.name,'location':list(s.camera.location),'rotation':list(s.camera.rotation_euler),'orthoScale':s.camera.data.ortho_scale},'ports':ports,'nozzleEmpties':[record(n) for n in nozzles],'coreEmpties':[record('core_center'),record('core_radius')] if role!='orb' else [],'coreFalse':role=='orb'}
 if role=='carrier':
  row['docks']=[record('dock_0'),record('dock_1')];row['childSourceMeshes']={str(j):[o.name for o in bpy.data.objects if o.type=='MESH' and (o.name.startswith('child '+str(j)+' ') or o.name.startswith('child_'+str(j)+'_'))] for j in range(2)};row['childSourceEmpties']={str(j):[record(n) for n in ['child_'+str(j)+'_rail','child_'+str(j)+'_rail_direction','child_'+str(j)+'_nozzle']] for j in range(2)}
 result['entries'].append(row)
json.dump(result,open(os.path.join(root,'SOURCE_FRAME0_INSPECTION.json'),'w'),indent=2)
print(json.dumps({r['role']:{'ports':len(r['ports']),'maxError':max(p['metadataErrorPixels'] for p in r['ports'])} for r in result['entries']}))
