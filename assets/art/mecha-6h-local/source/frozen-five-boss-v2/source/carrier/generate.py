"""New local procedural geometry; no downloaded/Library/model inputs.
Blender --background --python generate.py -- carrier|lancer [--render] [--full]
CPU two threads. No render unless explicitly requested.
"""
import bpy, os, sys, json, math, hashlib, time
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
ROLE=ARGS[0] if ARGS else 'carrier'
assert ROLE in ('carrier','lancer')
ROOT=os.path.dirname(os.path.abspath(__file__))
OUT=ROOT;os.makedirs(OUT,exist_ok=True)
RENDER='--render' in ARGS
assert not RENDER, 'Design prep only: rendering waits for parent Bastion gate and explicit CPU slot'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def material(name,color,metal=.65,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.70 if name=='frame' else .52 if name in ('green','olive','ochre','sand','dark') else .24
 if name=='steel' and p.inputs.get('Anisotropic'):p.inputs['Anisotropic'].default_value=.38
 p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
 return m
M={k:material(k,c,met,e) for k,c,met,e in [('green',(.13,.30,.09),.6,0),('olive',(.34,.43,.17),.55,0),('ochre',(.62,.31,.045),.65,0),('sand',(.79,.62,.24),.55,0),('steel',(.30,.34,.36),.85,0),('dark',(.022,.03,.035),.6,0),('cyan',(.02,.80,.95),.3,2),('amber',(.95,.31,.018),.4,.7)]}
M['frame']=material('frame',(.055,.065,.073),.25)
M['section']=material('section',(.16,.19,.21),.72)
parts=[];anchors={};moves=[];payload=[[],[]]
def register(o,mat,group=None):
 if o.name.startswith('child'):
  original=M[mat].copy();original.name='original matching child '+mat
  principled=original.node_tree.nodes.get('Principled BSDF');principled.inputs['Roughness'].default_value=.32
  if principled.inputs.get('Anisotropic'):principled.inputs['Anisotropic'].default_value=0
  o.data.materials.append(original)
 else:o.data.materials.append(M[mat])
 parts.append(o)
 if group is not None:group.append(o)
 return o
def plate(name,poly,y,depth,mat,group=None):
 n=len(poly);v=[(x,y-depth/2,z) for x,z in poly]+[(x,y+depth/2,z) for x,z in poly]
 f=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(v,[],f);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
 register(o,mat,group);bevel=o.modifiers.new('structural rounded cast edge','BEVEL');bevel.width=.025;bevel.segments=2;o.modifiers.new('weighted normals','WEIGHTED_NORMAL')
 inset=name in ['upper flight deck sloped armor','aft command fin','aft keel','siege triangular recoil cradle','raised recoil spine','underslung counterweight','ventral engine shield']
 if inset:
  # Bake original exterior first: new section faces lie inside identical envelope.
  bpy.context.view_layer.objects.active=o
  for modifier in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=modifier.name)
  front=max((p for p in o.data.polygons if p.normal.y<-.9),key=lambda p:p.area)
  boundary=list(front.vertices);nv=[tuple(v.co) for v in o.data.vertices];nf=[tuple(p.vertices) for p in o.data.polygons if p.index!=front.index]
  center=sum((Vector(nv[i]) for i in boundary),Vector())/len(boundary);start=len(nv);count=len(boundary)
  ring=[center+(Vector(nv[i])-center)*.79 for i in boundary];nv +=[tuple(q) for q in ring]+[tuple(q+Vector((0,.075,0))) for q in ring]
  for i in range(count):
   j=(i+1)%count;nf +=[(boundary[i],boundary[j],start+j,start+i),(start+i,start+j,start+count+j,start+count+i)]
  nf.append(tuple(start+count+i for i in range(count)))
  edited=bpy.data.meshes.new(name+' machined recessed section');edited.from_pydata(nv,[],nf);edited.update();o.data=edited
  for m in [M[mat],M['frame'],M['section']]:o.data.materials.append(m)
  for face in o.data.polygons:
   face.material_index=1 if abs(face.normal.y)<.8 else 0
   if face.index>=len(nf)-2*count-1 and face.index<len(nf)-1:face.material_index=2 if (face.index-(len(nf)-2*count-1))%2 else 1
  o.modifiers.new('section face weighted normals','WEIGHTED_NORMAL')
 return o

def rod(name,a,b,r,mat,group=None,r2=None):
 v=Vector(b)-Vector(a);bpy.ops.mesh.primitive_cone_add(vertices=20,radius1=r,radius2=r if r2 is None else r2,depth=v.length,location=(Vector(a)+Vector(b))/2)
 o=bpy.context.object;o.name=name;o.rotation_euler=v.to_track_quat('Z','Y').to_euler();return register(o,mat,group)
def oval(name,p,size,mat,group=None):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,location=p);o=bpy.context.object;o.name=name;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for face in o.data.polygons:face.use_smooth=True
 return register(o,mat,group)
def empty(name,p):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=p;anchors[name]=o;return o
def move(objects,delta,kind='mechanism'):
 for o in objects:moves.append((o,o.location.copy(),Vector(delta),kind))
def gun(name,a,b,r,mat,group=None):
 rod(name+' outer tube',a,b,r,mat,group);v=(Vector(b)-Vector(a)).normalized();tip=Vector(b)+v*.035
 rod(name+' bore recess',b,tip,r*.64,'dark',group);q=empty(name,tip);qd=empty(name+'_direction',tip+v*.36)
 if group is not None:group.extend([q,qd])
 return name
ports=[];docks=[]
if ROLE=='carrier':
 # Heavy launch ship: load-bearing faceted annular shell, no wing plates.
 arch_profiles=[[(-1.62,.50),(-1.11,1.09),(-.48,.66)],[(.29,.61),(.83,1.00),(1.48,.55)]]
 def armor_band(name,x0,x1,r0,r1,a0,a1,material_name,depth=.12):
  vertices=[]
  for x,r in [(x0,r0),(x1,r1)]:
   for rr in [r,r-depth]:
    for a in [a0,a1]:vertices.append((x,math.sin(a)*rr*.83,.44+math.cos(a)*rr*.87))
  mesh=bpy.data.meshes.new(name+' geometry');mesh.from_pydata(vertices,[],[(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5),(0,2,3,1),(4,5,7,6)]);mesh.update()
  ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob);register(ob,material_name)
 # Two cargo arches are independent heavy volumes. No connecting upper roof/belt.
 for arch,profiles in enumerate(arch_profiles):
  for axial,((x0,r0),(x1,r1)) in enumerate(zip(profiles,profiles[1:])):
   for sector in range(12):
    if sector in [8,9]:continue
    a0=sector*math.tau/12+.02;a1=(sector+1)*math.tau/12-.02
    armor_band('separated cargo arch '+str(arch)+' '+str(axial)+' '+str(sector),x0,x1,r0,r1,a0,a1,'green' if sector%3 else 'olive',.20)
 # Recessed bay walls stop at each arch: middle X gap is actual open air.
 for j,(a,b) in enumerate([(-1.54,-.56),(.37,1.39)]):
  plate('separate recessed cargo bay wall '+str(j),[(a,.06),(b,.06),(b,.74),(a,.74)],.38,.10,'dark')
  rod('deep cargo loading spindle '+str(j),(a+.08,.17,.20),(b-.08,.17,.20),.19,'steel')
  rod('cargo bay lower load rail '+str(j),(a,-.10,-.08),(b,-.10,-.08),.075,'frame')
 # Only a low exposed bridge connects the massive arches. Sky is visible above it.
 rod('low exposed interarch structural bridge',(-.64,.14,-.22),(.45,.14,-.22),.13,'frame')
 rod('low polished cargo transfer piston',(-.54,-.08,-.20),(.40,-.08,-.20),.058,'steel')
 # Aft propulsion is separated from the arch by a narrow mechanical neck and shoulder step.
 rod('exposed aft engine coupling',(1.25,.08,.18),(1.74,.08,.18),.27,'frame')
 rod('main aft turbine',(1.68,.08,.18),(1.98,.08,.18),.55,'steel',r2=.44)
 rod('main deep turbine nozzle',(1.96,.08,.18),(2.10,.08,.18),.36,'dark');empty('nozzle_0',(2.12,.08,.18))
 rod('offset auxiliary turbine',(.94,.25,-.61),(1.70,.25,-.61),.34,'steel',r2=.26)
 rod('auxiliary deep nozzle',(1.66,.25,-.61),(1.79,.25,-.61),.21,'dark');empty('nozzle_-0.81',(1.81,.25,-.61))
 # Cradle load transfers into distinct armored keel beams, leaving both bay openings empty.
 rod('fore structural dock beam',(-1.24,.21,-.40),(.16,.21,-.40),.11,'frame')
 rod('aft structural dock beam',(.19,.21,-.51),(1.38,.21,-.51),.13,'frame')
 # Each cradle is made from separated left/right struts and floor, never a union bay hull.
 for j,(x,z) in enumerate([(-.76,-.83),(.63,-1.09)]):
  dock=(x,-.56,z);docks.append(dock);empty('dock_'+str(j),dock)
  rod('separate hangar suspension '+str(j),(x,.08,.18),(x,.08,z+.28),.07,'frame')
  plate('hangar left horn '+str(j),[(x-.55,z+.25),(x-.35,z+.35),(x-.29,z-.24),(x-.48,z-.37)],.15,.16,'steel')
  plate('hangar right horn '+str(j),[(x+.35,z+.35),(x+.52,z+.23),(x+.45,z-.34),(x+.27,z-.25)],.15,.16,'green')
  plate('independent cradle floor '+str(j),[(x-.55,z-.39),(x+.43,z-.39),(x+.31,z-.57),(x-.30,z-.59)],.15,.24,'olive')
  # Matching child geometry is a distinct compact pointed intercept craft.
  g=payload[j];dx,dy,dz=dock
  plate('child '+str(j)+' pointed spine',[(dx-.47,dz),(dx+.24,dz+.17),(dx+.40,dz),(dx+.24,dz-.16)],dy,.30,'olive',g)
  plate('child '+str(j)+' clipped wing',[(dx-.10,dz+.10),(dx+.20,dz+.31),(dx+.36,dz+.24),(dx+.27,dz)],dy-.08,.10,'green',g)
  plate('child '+str(j)+' lower stabilizer',[(dx-.10,dz-.08),(dx+.16,dz-.24),(dx+.31,dz-.20),(dx+.24,dz)],dy-.08,.08,'green',g)
  gun('child_'+str(j)+'_rail',(dx-.10,dy-.19,dz),(dx-.45,dy-.19,dz),.035,'steel',g)
  rod('child '+str(j)+' motor',(dx+.2,dy,dz),(dx+.48,dy,dz),.10,'steel',g)
  g.append(empty('child_'+str(j)+'_nozzle',(dx+.5,dy,dz)))
 rod('upper turret trunnion',(-.90,-.08,1.08),(-.90,-.52,1.08),.22,'frame')
 plate('upper cannon armored mounting',[(-1.25,.88),(-.75,.82),(-.72,1.10),(-1.14,1.25)],-.54,.22,'olive')
 rod('keel cannon load transfer',(.78,.12,-.65),(.78,-.47,-1.42),.11,'frame')
 upper=[];lower=[]
 ports.append(gun('defence_upper',(-.84,-.50,1.07),(-1.73,-.50,1.07),.09,'steel',upper))
 ports.append(gun('defence_keel',(.95,-.47,-1.42),(.45,-.47,-1.42),.075,'steel',lower))
 move(upper,(.14,0,0),'recoil');move(lower,(.12,0,0),'recoil')
 corepos=(.70,-.32,-.44);core=rod('carrier concealed reactor',(.70,-.29,-.44),corepos,.205,'cyan')
 hatch=[];plate('carrier armored service hatch',[(.43,-.12),(.99,-.15),(1.02,-.68),(.54,-.76)],-.42,.16,'steel',hatch);move(hatch,(.20,0,.64))
 lock=plate('carrier inner safety lock',[(.47,-.17),(.92,-.17),(.93,-.66),(.47,-.66)],-.33,.045,'dark')
 scale=5.25;display=448
else:
 # Siege lance on exposed spherical joints. Hook armor is split into convex sectors.
 oval('rounded segmented engine bearing',(.96,.10,.03),(.58,.42,.66),'ochre')
 oval('front spherical recoil joint',(-.16,.10,.05),(.39,.33,.39),'steel')
 rod('exposed siege backbone',(-.40,.09,.08),(1.27,.09,.08),.12,'frame')
 plate('upper hook armor root',[(.04,.50),(.55,.32),(.90,.68),(.77,1.08),(.30,1.34)],.16,.42,'ochre')
 plate('upper hook armor sweep',[(-.80,1.16),(-.35,1.50),(.30,1.34),(.13,1.08),(-.50,.98)],.16,.36,'sand')
 plate('upper hook armored talon',[(-.80,1.16),(-.50,.98),(-1.05,.59)],.16,.33,'ochre')
 plate('lower hook armor root',[(.15,-.38),(.73,-.38),(1.03,-.68),(.75,-1.18),(.16,-.93)],.15,.42,'ochre')
 plate('lower hook swept jaw',[(-.73,-.83),(-.34,-1.22),(.18,-.93),(.17,-.70),(-.43,-.62)],.15,.32,'sand')
 plate('lower hooked talon',[(-.73,-.83),(-.43,-.62),(-.91,-.37)],.15,.29,'ochre')
 barrel=[]
 rod('massive siege barrel',(-.22,-.06,.13),(-2.02,-.06,.13),.18,'steel',barrel)
 rod('tapered armored forward shroud',(-.57,-.06,.13),(-1.50,-.06,.13),.29,'ochre',barrel,r2=.20)
 rod('segmented muzzle brake',(-1.97,-.06,.13),(-2.35,-.06,.13),.24,'sand',barrel)
 ports.append(gun('siege_lance',(-2.28,-.06,.13),(-2.44,-.06,.13),.13,'steel',barrel))
 for z in [-.20,.49]:
  rod('fixed recoil guide',(-1.18,-.39,z),(.82,-.39,z),.05,'steel')
  rod('hydraulic recoil sleeve',(.12,-.45,z),(.91,-.45,z),.09,'dark')
  rod('sliding polished recoil piston',(-.84,-.45,z),(.28,-.45,z),.048,'steel',barrel)
 move(barrel,(.52,0,0),'recoil')
 rod('large aft axial engine',(.96,.15,-.10),(2.02,.15,-.10),.52,'steel',r2=.43)
 rod('aft engine dark recess',(1.98,.15,-.10),(2.10,.15,-.10),.34,'dark');empty('nozzle_main',(2.12,.15,-.10))
 ports.append(gun('offset_suppressor',(.16,-.59,-.64),(-.38,-.59,-.64),.07,'steel'))
 corepos=(.72,-.41,.12);core=rod('lancer concealed reactor',(.72,-.38,.12),corepos,.205,'cyan')
 hatch=[];plate('siege oblique breach armor',[(.35,-.17),(1.09,-.13),(1.09,.46),(.54,.60)],-.53,.15,'sand',hatch);move(hatch,(.28,0,.73))
 lock=plate('siege inner safety lock',[(.37,-.15),(1.02,-.15),(1.04,.47),(.37,.47)],-.43,.045,'dark')
 scale=5.35;display=400
empty('core_center',corepos);empty('core_radius',Vector(corepos)+Vector((.21,0,0)))
# Physical deployed service pod; protected hatch and source core travel together.
deploy=Vector((-2.98,0,0) if ROLE=='carrier' else (-2.27,0,1.13))
move([core,anchors['core_center'],anchors['core_radius']],deploy)
# Outer armor combines rail travel with its existing opening hinge/slide.
for i,(o,base,delta,kind) in enumerate(moves):
 if o in hatch:moves[i]=(o,base,delta+deploy,kind)
coupler=[]
rod('service pod rear neck',Vector(corepos)+Vector((.10,0,0)),Vector(corepos)+Vector((.31,0,0)),.034,'steel',coupler)
rod('service pod guide carriage',Vector(corepos)+Vector((.31,0,0)),Vector(corepos)+Vector((.31,0,-.51 if ROLE=='carrier' else .41)),.038,'steel',coupler)
move(coupler,deploy)
if ROLE=='carrier':
 rod('lower fixed deployment rail',(-1.97,-.32,-.95),(1.03,-.32,-.95),.035,'steel')
else:
 rod('diagonal fixed deployment rail',Vector(corepos)+Vector((.31,0,.41)),Vector(corepos)+deploy+Vector((.31,0,.41)),.035,'steel')
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED';scene.render.threads=2;scene.render.resolution_x=384;scene.render.resolution_y=384;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.world.color=(.15,.15,.15)
bpy.ops.object.camera_add(location=(0,-16,3.1));cam=bpy.context.object;cam.name='fixed orthographic source camera';cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=scale;scene.camera=cam
for name,pos,power,size in [('key',(-3,-6,7),1100,6),('rim',(3,3,4),1300,4),('fill',(-4,-3,-4),700,5)]:
 bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
scene.view_settings.view_transform='AgX'
def project(v):
 q=world_to_camera_view(scene,cam,Vector(v));return {'x':round(q.x*384,4),'y':round((1-q.y)*384,4)}
def convex(points):
 p=sorted(set((x['x'],x['y']) for x in points));lo=[];hi=[]
 def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
 for v in p:
  while len(lo)>1 and cross(lo[-2],lo[-1],v)<=0:lo.pop()
  lo.append(v)
 for v in reversed(p):
  while len(hi)>1 and cross(hi[-2],hi[-1],v)<=0:hi.pop()
  hi.append(v)
 return [{'x':x,'y':y} for x,y in lo[:-1]+hi[:-1]]
def metadata(objects,portnames,exposed):
 dg=bpy.context.evaluated_depsgraph_get();h=[]
 for o in objects:
  if o.type!='MESH' or o.hide_render:continue
  ev=o.evaluated_get(dg);mesh=ev.to_mesh();h.append(convex([project(ev.matrix_world@v.co) for v in mesh.vertices]));ev.to_mesh_clear()
 allp=[p for x in h for p in x];cp=project(anchors['core_center'].location);rp=project(anchors['core_radius'].location)
 return {'muzzlesPixels':[project(anchors[n].location) for n in portnames],'muzzleDirectionsPixels':[project(anchors[n+'_direction'].location) for n in portnames],'nozzlesPixels':[project(o.location) for n,o in anchors.items() if n.startswith('nozzle_')], 'corePixels':dict(cp,radius=math.hypot(cp['x']-rp['x'],cp['y']-rp['y'])),'coreExposed':exposed,'bodyHullPixels':h,'bodyBoundsPixels':{'minX':min(p['x'] for p in allp),'minY':min(p['y'] for p in allp),'maxX':max(p['x'] for p in allp),'maxY':max(p['y'] for p in allp)}}

# Full revision keeps accepted geometry and camera, but independent mechanism,
# payload and recoil snapshots. The secondary lock parks rather than vanishes.
lock_base=lock.location.copy()
lock_park=Vector((.22,0,.78 if ROLE=='carrier' else .84))
levels=[0,.25,.5,.75,1]
payload_variants={'payload2':[True,True],'payload1near':[True,False],'payload1far':[False,True],'payload0':[False,False]}
states=[]
for progress in levels:
 stem='phase_'+str(round(progress*100)).zfill(3)
 if ROLE=='carrier':
  for variant,visible in payload_variants.items():
   states.extend([(stem+'_'+variant,progress,0,visible,variant),(stem+'_'+variant+'_fire',progress,1,visible,variant)])
 else:
  states.extend([(stem,progress,0,[False,False],None),(stem+'_fire',progress,1,[False,False],None)])
frames={};snapshots=[];pose_records=[];start=time.time()
for index,(state,progress,recoil,visible,variant) in enumerate(states):
 for o,base,delta,kind in moves:o.location=base+delta*(progress if kind=='mechanism' else recoil)
 core.hide_render=progress<1;lock.hide_render=False;lock.location=lock_base+deploy*progress+(lock_park if progress==1 else Vector((0,0,0)))
 for j,g in enumerate(payload):
  for o in g:o.hide_render=not visible[j]
 bpy.context.view_layer.update();f=metadata(parts,ports,progress==1);filename=ROLE+'-'+state+'.png'
 f.update(filename=filename,sourceState=state,mechanismProgress=progress,recoilProgress=recoil,lockParked=progress==1)
 if ROLE=='carrier':f.update(payloadCount=sum(visible),payloadVariant=variant,payloadVisible=visible,dockCentersPixels=[project(d) for d in docks])
 frames[state]=f;scene.render.filepath=os.path.join(OUT,filename)
 if RENDER and ('--child-only' not in ARGS or state=='phase_000_payload2') and ('--representative' not in ARGS or state in (['phase_000_payload2','phase_075_payload0','phase_100_payload0'] if ROLE=='carrier' else ['phase_000','phase_075','phase_100_fire'])):bpy.ops.render.render(write_still=True)
 # Each generated pose gets one exact timeline snapshot. Animation is constant
 # interpolation so inspecting a snapshot cannot interpolate core permission.
 timeline=300+index*10
 pose_records.append((timeline,[(o,o.location.copy()) for o,base,delta,kind in moves],lock.location.copy(),core.hide_render,[(o,o.hide_render) for g in payload for o in g]))
 snapshots.append({'state':state,'timelineFrame':timeline,'mechanismProgress':progress,'recoilProgress':recoil,'payloadVariant':variant})
baseline=lambda p:'phase_'+str(round(p*100)).zfill(3)+('_payload2' if ROLE=='carrier' else '')
for alias,src in [('idle',baseline(0)),('charge',baseline(0)),('open',baseline(1)),('fire',baseline(0)+'_fire')]:
 frames[alias]=dict(frames[src],sourceState=src,semanticAliasOf=src)
# Insert animations only after all renders. Otherwise Blender render evaluation
# could restore an earlier animation value at the current frame.
for timeline,locations,lockpos,hidden,payload_hidden in pose_records:
 for o,loc in locations:o.location=loc;o.keyframe_insert(data_path='location',frame=timeline)
 lock.location=lockpos;lock.keyframe_insert(data_path='location',frame=timeline)
 core.hide_render=hidden;core.keyframe_insert(data_path='hide_render',frame=timeline)
 for o,hidden in payload_hidden:o.hide_render=hidden;o.keyframe_insert(data_path='hide_render',frame=timeline)
# Explicit five mechanism timeline frames use payload2 and unrecoiled lance.
for progress,timeline in zip(levels,[100,125,150,175,200]):
 for o,base,delta,kind in moves:
  o.location=base+delta*(progress if kind=='mechanism' else 0);o.keyframe_insert(data_path='location',frame=timeline)
 lock.location=lock_base+deploy*progress+(lock_park if progress==1 else Vector((0,0,0)));lock.keyframe_insert(data_path='location',frame=timeline)
 core.hide_render=progress<1;core.keyframe_insert(data_path='hide_render',frame=timeline)
 for g in payload:
  for o in g:o.hide_render=False;o.keyframe_insert(data_path='hide_render',frame=timeline)
for action in bpy.data.actions:
 curves=[]
 if hasattr(action,'fcurves'):curves.extend(action.fcurves)
 for layer in getattr(action,'layers',[]):
  for strip in layer.strips:
   for slot in action.slots:
    bag=strip.channelbag(slot)
    if bag:curves.extend(bag.fcurves)
 for fc in curves:
  for k in fc.keyframe_points:k.interpolation='CONSTANT'
scene['snapshotIndex']=json.dumps(snapshots)
scene['corePermission']='only mechanismProgress==1; partial locked'
scene.frame_set(100);bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'actual.blend'))
entry={'key':'local-'+ROLE+'-design-revision-v3','roles':[ROLE],'canvasWidth':384,'canvasHeight':384,'displayWidth':display,'pivotPixels':{'x':192,'y':192},'facing':'left','weakpointEnabled':True,'frames':frames,'mechanismFrames':[{'progress':p,'state':baseline(p)} for p in levels],'status':'full local candidate; independent verification and runtime integration pending','chargePolicy':'same neutral geometry; telegraph timing/VFX/attack authority owned by code lead','damagedPolicy':'preserve current pose with code effect; no forced geometry reset'}
entry['semanticAliases']={'neutralByProgress':{str(p):baseline(p) for p in levels},'fireByProgress':{str(p):baseline(p)+'_fire' for p in levels}}
for f in frames.values():f['muzzleNames']=ports
entries=[entry]
if ROLE=='carrier':
 # Clear animation to isolate exact accepted child geometry without snapshot
 # hide_render keys interfering. Source model already saved before this step.
 for o in parts+list(anchors.values()):o.animation_data_clear()
 for o in parts:o.hide_render=True
 for o in payload[0]:o.hide_render=False;o.location-=Vector(docks[0])
 bpy.context.view_layer.update();childmeta=metadata(payload[0],['child_0_rail'],False);childmeta['corePixels']=None;childmeta['nozzlesPixels']=[project(anchors['child_0_nozzle'].location)]
 childmeta.update(filename='carrier-child.png',sourceState='idle',parentDockIndex=0)
 scene.render.filepath=os.path.join(OUT,'carrier-child.png')
 # Matching child original is copied by driver; no child re-render.
 entries.append({'key':'local-carrier-child-largeform-v1','roles':[],'canvasWidth':384,'canvasHeight':384,'displayWidth':448,'pivotPixels':{'x':192,'y':192},'facing':'left','weakpointEnabled':False,'frames':{'idle':childmeta},'mechanismFrames':[],'status':'same accepted geometry and scale; gameplay role assigned by code lead'})
 entry['matchingChild']={'entryKey':'local-carrier-child-largeform-v1','dockCentersPixels':[project(d) for d in docks],'sameCameraScale':True,'dockNames':['near=forward exit dock0','far=aft dock1'],'spawnPivotRule':'parent pivot + (dockPixel-parentPivot)*448/384; child display448 preserves world scale'}
 entry['payloadMechanismSelection']={'frameTemplate':'phase_{000|025|050|075|100}_{payload2|payload1near|payload1far|payload0}','progressRule':'floor to authored phase; .999 uses075; final100 only progress>=1','selectionPriority':'explicit artFrame, same snapshot for pixels/ports/core/hulls','nearDockIndex':0,'farDockIndex':1,'fireFrameTemplate':'phase_{000|025|050|075|100}_{payload2|payload1near|payload1far|payload0}_fire','spawnRule':'remove matching payload mesh/hull and add child entry hull in same simulation step'}
json.dump({'schemaVersion':1,'entries':entries},open(os.path.join(OUT,'manifest-candidate.json'),'w'),indent=2)
json.dump({'blender':bpy.app.version_string,'renderExecuted':RENDER,'device':'CPU','threads':2,'samples':24,'camera':{'location':list(cam.location),'rotation':list(cam.rotation_euler),'orthoScale':scale},'elapsedSeconds':time.time()-start,'hullMethod':'convex hull per evaluated actual mesh component; preserves component gaps','snapshots':snapshots,'mechanismTimeline':[100,125,150,175,200],'lockParkDelta':list(lock_park),'sourceScriptSHA256':hashlib.sha256(open(__file__,'rb').read()).hexdigest(),'files':{n:hashlib.sha256(open(os.path.join(OUT,n),'rb').read()).hexdigest() for n in os.listdir(OUT) if n.endswith(('.blend','.png'))}},open(os.path.join(OUT,'production.json'),'w'),indent=2)
