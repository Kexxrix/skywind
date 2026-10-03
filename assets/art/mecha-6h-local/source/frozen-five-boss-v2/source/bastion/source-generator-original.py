"""Independent procedural Bastion/Apex. No Library or model-byte imports.
blender -b -t 2 --python generator.py -- bastion [--render] [--all]
Default builds actual.blend and geometric metadata without rendering.
"""
import bpy, math, json, os, sys, hashlib, time
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
ROLE='bastion'
OUT=os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,color,metal=.7,emit=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.32;p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emit;return m
M={k:mat(k,c,.78,e) for k,c,e in [('violet',(.18,.07,.29),0),('violet_edge',(.32,.18,.43),0),('graphite',(.075,.095,.13),0),('gold',(.64,.34,.075),0),('steel',(.38,.42,.46),0),('black',(.009,.012,.018),0),('cyan',(.02,.8,1),2),('warning',(.95,.22,.025),.6)]}
parts=[];anchors={}
def finish(o,name,material):
 o.name=name;o.data.materials.append(M[material]);parts.append(o)
 bevel=o.modifiers.new('machined edge','BEVEL');bevel.width=.028;bevel.segments=2
 return o
def prism(name,poly,y,depth,material):
 n=len(poly);v=[(x,y-depth/2,z) for x,z in poly]+[(x,y+depth/2,z) for x,z in poly]
 f=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(v,[],f);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);return finish(o,name,material)
def rod(name,a,b,r,material):
 d=Vector(b)-Vector(a);bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=r,depth=d.length,location=(Vector(a)+Vector(b))/2);o=bpy.context.object;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return finish(o,name,material)
def empty(name,p):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=p;anchors[name]=o;return o
def gun(name,p,length,r,material='steel',angle=0):
 v=Vector((-math.cos(angle),0,math.sin(angle)));tip=Vector(p)+v*length
 rod(name+' armored barrel',p,tip,r,material);rod(name+' dark bore',tip,tip+v*.045,r*.67,'black');empty(name,tip+v*.05);empty(name+'_direction',tip+v*.42)
def nozzle(name,p,r):
 rod(name+' engine',Vector(p)-Vector((.38,0,0)),p,r,'steel');rod(name+' nozzle',p,Vector(p)+Vector((.045,0,0)),r*.68,'black');empty(name,Vector(p)+Vector((.06,0,0)))
def reset_geometry():
 for o in list(parts)+list(anchors.values()):bpy.data.objects.remove(o,do_unlink=True)
 parts.clear();anchors.clear()
def bastion(progress,fire):
 # New articulated predator jaws. No imported meshes, textures or Library bytes.
 # Camera-plane aperture is retained in the evaluated physical geometry.
 for i in range(7):
  a=math.radians(-105+i*210/7);b=math.radians(-105+(i+1)*210/7)
  ri=1.02;ro=1.17
  prism('rear curved vertebra %02d'%i,[(ri*math.cos(a),ri*math.sin(a)),(ro*math.cos(a),ro*math.sin(a)),(ro*math.cos(b),ro*math.sin(b)),(ri*math.cos(b),ri*math.sin(b))],.14,.43,'graphite')
 # Hinged tapering shields visibly move away from the vulnerable heart.
 for s in [-1,1]:
  sweep=.12*progress
  z=lambda value:s*(value+sweep)
  prism('jaw load blade '+str(s),[(-1.94,z(.87)),(-1.62,z(1.26)),(-.61,z(1.46)),(.47,z(1.15)),(.38,z(.91)),(-.58,z(1.04))],-.04,.48,'graphite')
  prism('violet predator jaw shell '+str(s),[(-1.93,z(.89)),(-1.69,z(1.21)),(-.83,z(1.38)),(.31,z(1.12)),(-.04,z(.97)),(-1.15,z(1.04))],-.33,.23,'violet')
  prism('brushed sharpened leading edge '+str(s),[(-1.94,z(.87)),(-1.72,z(.95)),(-1.14,z(1.11)),(-.54,z(1.17)),(-.72,z(1.23)),(-1.60,z(1.06))],-.49,.055,'steel')
  prism('jaw layered ridge '+str(s),[(-1.29,z(1.25)),(-.77,z(1.43)),(-.06,z(1.21)),(-.52,z(1.16))],-.49,.065,'violet_edge')
  # Teeth are distinct load plates; the deep inner mouth remains open.
  for i in range(3):
   x=-1.48+i*.40
   prism('defense serration '+str(s)+' '+str(i),[(x,z(1.02)),(x+.19,z(1.07)),(x+.13,z(.76)),(x+.02,z(.91))],-.13,.25,'graphite')
  pivot=(.53,-.13,s*1.06)
  rod('visible jaw hinge '+str(s),(pivot[0],-.43,pivot[2]),(pivot[0],.24,pivot[2]),.20,'steel')
  rod('black hinge hub '+str(s),(pivot[0],-.47,pivot[2]),(pivot[0],-.5,pivot[2]),.125,'black')
  rod('exposed jaw piston casing '+str(s),(.72,-.43,s*.64),(-.02,-.43,z(1.12)),.08,'graphite')
  rod('polished jaw piston rod '+str(s),(.33,-.45,s*.89),(-.17,-.45,z(1.16)),.043,'steel')
 # Long hooked rear fins replace the old solid rectangular firewall.
 prism('rear narrow reactor keel',[(.92,-.98),(1.42,-.67),(1.58,.43),(1.24,1.0),(1.03,.53)],.1,.62,'violet')
 prism('upper swept scythe fin',[(1.15,.70),(1.72,1.83),(1.67,.76),(1.34,.26)],.19,.21,'violet_edge')
 prism('lower hooked armored fin',[(1.16,-.62),(1.67,-1.68),(1.62,-.67),(1.43,-.28)],.2,.21,'violet')
 prism('rear fin steel leading bevel',[(1.69,1.74),(1.75,1.88),(1.76,.90),(1.66,.56)],.02,.06,'steel')
 rod('outer reactor supply conduit',(1.5,-.26,-.58),(1.5,-.26,.51),.063,'steel')
 recoil=.18 if fire else 0
 rod('upper beam separate bright gun jacket',(-1.15+recoil,-.62,1.23+.12*progress),(-1.51+recoil,-.62,1.194+.12*progress),.153,'steel')
 gun('upper_beam',(-1.13+recoil,-.62,1.23+.12*progress),.57,.125,'steel',-.10)
 gun('lower_fan_a',(-1.12+recoil,-.29,-1.23-.12*progress),.46,.095,'steel',.12)
 gun('lower_fan_b',(-1.04+recoil,.04,-1.42-.12*progress),.40,.085,'steel',-.18)
 for z0 in [-.43,.43]:nozzle('nozzle_'+str(z0),(1.75,.1,z0),.16)
 rod('reactor socket',(1.19,-.41,0),(1.19,-.52,0),.27,'black')
 core=rod('reactor visible only final open',(1.19,-.53,0),(1.19,-.57,0),.23,'cyan');core.hide_render=progress<1
 empty('core_center',(1.19,-.58,0));empty('core_radius',(1.42,-.58,0))
 shift=.19*progress if progress<1 else .58
 for s in [-1,1]:
  z=s*shift
  prism('protected sliding vault '+str(s),[(.92,s*.01+z),(1.45,s*.01+z),(1.42,s*.28+z),(1.0,s*.31+z)],-.64,.13,'steel')
 lock_slide=max(0,(progress-.75)/.25)*.8
 prism('inner physical core lock',[(.93,-.27+lock_slide),(1.45,-.27+lock_slide),(1.45,.27+lock_slide),(.93,.27+lock_slide)],-.61,.09,'steel')

def apex(progress,fire):
 # Offset pear-shaped graphite armored citadel: lower docking keel, upper crown.
 prism('asymmetric central graphite citadel',[(-.35,-.9),(.65,-1.16),(1.22,-.55),(1.03,.64),(.45,.93),(-.20,.55)],0,.83,'graphite')
 prism('gold structural diagonal spine',[(.61,-.92),(.91,-.53),(.76,.52),(.44,.79),(.32,.63),(.55,-.42)],-.5,.16,'gold')
 prism('lower asymmetric armored keel',[(-.27,-.73),(-.82,-1.36),(.03,-1.52),(.74,-1.03)],.04,.55,'graphite')
 nozzle('nozzle_main',(1.47,0,-.30),.36);nozzle('nozzle_trim',(1.10,.03,.70),.14)
 # Three articulated load-bearing segments: shoulder -> elbow -> wrist -> weapon.
 # The visible gaps between links stay empty; all rods are individual hulls.
 p0=Vector((.18,-.10,.61))
 angles=[math.radians(146-16*progress),math.radians(207+23*progress),math.radians(143-33*progress)]
 if fire:angles[2]+=math.radians(13)
 lengths=[.94,.87,.66];points=[p0]
 for a,l in zip(angles,lengths):points.append(points[-1]+Vector((math.cos(a)*l,0,math.sin(a)*l)))
 for i in range(3):
  a,b=points[i],points[i+1]
  rod('arm link %d load bearing'%i,a,b,.115 if i<2 else .10,'graphite')
  rod('arm link %d golden piston'%i,a+Vector((0,-.19,0)),b+Vector((0,-.19,0)),.045,'gold')
  rod('arm pivot %d'%i,a+Vector((0,-.26,0)),a+Vector((0,.24,0)),.19 if i==0 else .15,'steel')
  empty('arm_joint_'+str(i),a)
 wrist=points[3];empty('arm_joint_3',wrist)
 gun('wrist_precision_beam',wrist,.62,.12,'gold',.03)
 # Fixed heavy lower rail and small opposite tracking cannon have distinct roles.
 gun('lower_siege_rail',(-.44+(.18 if fire else 0),-.12,-1.14),.88,.18,'graphite',-.03)
 gun('upper_tracking',(.49,-.37,.62),.48,.073,'steel',.28)
 # Front-facing circular core with physically locked petals.
 rod('reactor armored socket',(.42,-.47,-.12),(.42,-.58,-.12),.30,'black')
 core=rod('cyan locked heart',(.42,-.59,-.12),(.42,-.63,-.12),.21,'cyan');core.hide_render=progress<1
 empty('core_center',(.42,-.64,-.12));empty('core_radius',(.63,-.64,-.12))
 for s in [-1,1]:
  shift=(.20*progress if progress<1 else .48)*s
  prism('gold reactor armored petal '+str(s),[(.12,-.12+shift),(.73,-.12+shift),(.68,-.12+s*.31+shift),(.20,-.12+s*.31+shift)],-.69,.13,'gold')
 lock_slide=max(0,(progress-.75)/.25)*.81
 prism('inner protected gray iris',[(.16,-.39+lock_slide),(.68,-.39+lock_slide),(.68,.15+lock_slide),(.16,.15+lock_slide)],-.66,.10,'steel')
"""Physical camera-plane front aperture, not a collision-only exclusion.
Evaluate original manufactured mesh, split it into three capped physical pieces.
The projected convex pieces cannot cross the open entrance by construction.
"""
import bmesh
def clip_mesh(original,planes):
 bm=bmesh.new();bm.from_mesh(original)
 for point,normal in planes:
  result=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,plane_co=point,plane_no=normal,clear_inner=True,clear_outer=False)
  edges=[e for e in result['geom_cut'] if isinstance(e,bmesh.types.BMEdge) and e.is_valid and e.is_boundary]
  if edges:
   try:bmesh.ops.holes_fill(bm,edges=edges,sides=0)
   except RuntimeError:pass
 if not len(bm.faces):bm.free();return None
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));mesh=bpy.data.meshes.new('physical aperture capped piece');bm.to_mesh(mesh);bm.free();return mesh
def apply_front_aperture():
 bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
 up=cam.matrix_world.to_quaternion()@Vector((0,1,0));right=Vector((1,0,0))
 core=anchors['core_center'].location;v=up.dot(core);x=core.x+.065
 half=.38 if ROLE=='bastion' else .45
 upper=up*(v+half);lower=up*(v-half)
 zones=[('upper',[(upper,up)]),('lower',[(lower,-up)]),('rear',[(Vector((x,0,0)),right),(lower,up),(upper,-up)])]
 for o in list(parts):
  # Core and existing mechanism shields are physically retained through partial.
  if any(word in o.name for word in ['cyan locked heart','reactor visible only final open','inner physical core lock','inner protected gray iris','protected sliding vault','reactor reinforced load petal']):continue
  e=o.evaluated_get(deps);mesh=e.to_mesh();original=mesh.copy();e.to_mesh_clear();original.transform(o.matrix_world)
  if not original.vertices:bpy.data.meshes.remove(original);continue
  minx=min(t.co.x for t in original.vertices);vs=[up.dot(t.co) for t in original.vertices]
  if minx>=x or max(vs)<=v-half or min(vs)>=v+half:bpy.data.meshes.remove(original);continue
  materials=list(o.data.materials);name=o.name;hidden=o.hide_render
  parts.remove(o);bpy.data.objects.remove(o,do_unlink=True)
  for label,planes in zones:
   m=clip_mesh(original,planes)
   if m is None:continue
   n=bpy.data.objects.new(name+' physical aperture '+label,m);bpy.context.collection.objects.link(n)
   for mat in materials:m.materials.append(mat)
   n.hide_render=hidden;parts.append(n)
  bpy.data.meshes.remove(original)
 bpy.context.view_layer.update()

scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=2
scene.render.resolution_x=384;scene.render.resolution_y=384;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.world.color=(.15,.15,.15)
bpy.ops.object.camera_add(location=(0,-18,3.0));cam=bpy.context.object;cam.name='fixed orthographic source';cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=4.9 if ROLE=='bastion' else 5.7;scene.camera=cam
for name,loc,power,size in [('key',(-3,-6,7),1100,6),('rim',(3,3,4),1300,4),('fill',(-4,-3,-4),700,5)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
scene.view_settings.view_transform='AgX'
def project(v):
 q=world_to_camera_view(scene,cam,Vector(v));return {'x':round(q.x*384,4),'y':round((1-q.y)*384,4)}
def convex(points):
 pts=sorted(set((p['x'],p['y']) for p in points))
 def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
 lo=[];hi=[]
 for p in pts:
  while len(lo)>1 and cross(lo[-2],lo[-1],p)<=0:lo.pop()
  lo.append(p)
 for p in reversed(pts):
  while len(hi)>1 and cross(hi[-2],hi[-1],p)<=0:hi.pop()
  hi.append(p)
 return [{'x':x,'y':y} for x,y in lo[:-1]+hi[:-1]]
def metadata(state,progress):
 bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();hulls=[];names=[]
 for o in parts:
  if o.hide_render:continue
  e=o.evaluated_get(deps);mesh=e.to_mesh();h=convex([project(e.matrix_world@v.co) for v in mesh.vertices]);e.to_mesh_clear()
  if len(h)>2:hulls.append(h);names.append(o.name)
 pp=[p for h in hulls for p in h];cp=project(anchors['core_center'].location);rp=project(anchors['core_radius'].location)
 ports=['upper_beam','lower_fan_a','lower_fan_b'] if ROLE=='bastion' else ['wrist_precision_beam','lower_siege_rail','upper_tracking']
 return {'filename':ROLE+'-'+state+'.png','sourceState':state,'mechanismProgress':progress,'muzzlesPixels':[project(anchors[n].location) for n in ports],'muzzleDirectionsPixels':[project(anchors[n+'_direction'].location) for n in ports],'muzzleNames':ports,'nozzlesPixels':[project(o.location) for n,o in anchors.items() if n.startswith('nozzle')],'corePixels':dict(cp,radius=math.hypot(cp['x']-rp['x'],cp['y']-rp['y'])),'coreExposed':progress==1,'bodyHullPixels':hulls,'bodyHullComponentNames':names,'bodyBoundsPixels':{'minX':min(p['x'] for p in pp),'maxX':max(p['x'] for p in pp),'minY':min(p['y'] for p in pp),'maxY':max(p['y'] for p in pp)},'sourceAnchorsPixels':{n:project(o.location) for n,o in anchors.items()}}
build=bastion if ROLE=='bastion' else apex
states=[('phase_%03d'%int(p*100)+('_fire' if f else ''),p,f) for p in [0,.25,.5,.75,1] for f in [False,True]]
frames={};start=time.time()
for state,p,f in states:
 reset_geometry();build(p,f);apply_front_aperture();frames[state]=metadata(state,p)
 bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'source-'+state+'.blend'))
 if '--render' in ARGS:scene.render.filepath=os.path.join(OUT,ROLE+'-'+state+'.png');bpy.ops.render.render(write_still=True)
reset_geometry();build(0,False);apply_front_aperture();bpy.context.view_layer.update()
scene['mechanism_contract']='See generator: geometry at progress 0/.25/.5/.75/1; cyan only 1; attack authority remains runtime.'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'actual.blend'))
for alias,key in [('idle','phase_000'),('charge','phase_000'),('fire','phase_000_fire'),('open','phase_100'),('damaged','phase_000')]:frames[alias]={**frames[key],'sourceState':key}
entry={'key':'sixh-bastion-predator-full-v2','roles':[ROLE],'canvasWidth':384,'canvasHeight':384,'displayWidth':432,'pivotPixels':{'x':192,'y':192},'facing':'left','weakpointEnabled':True,'frames':frames,'mechanismFrames':[{'progress':p,'state':'phase_%03d'%int(p*100)} for p in [0,.25,.5,.75,1]],'damagedPolicy':'retain current mechanism/recoil pose plus runtime effect','chargePolicy':'neutral alias plus authorized actual muzzle telegraph','status':'full geometry candidate; independent runtime validation pending'}
entry['semanticAliases']={'charge':'neutral current mechanism plus actual authored muzzle telegraph','damaged':'retain current mechanism/recoil pose plus runtime effect','neutralByProgress':{str(p):'phase_%03d'%int(p*100) for p in [0,.25,.5,.75,1]},'fireByProgress':{str(p):'phase_%03d_fire'%int(p*100) for p in [0,.25,.5,.75,1]}}
json.dump({'schemaVersion':1,'entries':[entry]},open(os.path.join(OUT,'manifest-candidate.json'),'w'),indent=2)
json.dump({'blender':bpy.app.version_string,'device':'CPU','threads':2,'samples':24,'camera':{'location':list(cam.location),'rotation':list(cam.rotation_euler),'orthoScale':cam.data.ortho_scale},'elapsedSeconds':time.time()-start,'hullMethod':'evaluated exact mesh vertices; convex component hulls; no union across C/arm gaps','rendered':'--render' in ARGS,'generatorSHA256':hashlib.sha256(open(__file__,'rb').read()).hexdigest(),'files':{f:hashlib.sha256(open(os.path.join(OUT,f),'rb').read()).hexdigest() for f in os.listdir(OUT) if f.endswith(('.blend','.png'))}},open(os.path.join(OUT,'production.json'),'w'),indent=2)

path=os.path.join(OUT,'production.json');record=json.load(open(path));record['physicalFrontAperture']='camera-aligned capped actual structural mesh pieces; locked shields retained; no core radius or collision rule change';json.dump(record,open(path,'w'),indent=2)
