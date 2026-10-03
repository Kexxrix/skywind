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

ports=[];docks=[];ROLE='lancer'
def mass(name,x1,x2,cy,cz,ry1,rz1,ry2,rz2,mat,group=None):
 n=8;vertices=[]
 for x,ry,rz in [(x1,ry1,rz1),(x2,ry2,rz2)]:
  for i in range(n):
   a=2*math.pi*i/n+math.pi/8;vertices.append((x,cy+ry*math.cos(a),cz+rz*math.sin(a)))
 faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);register(o,mat,group);return o
# Structural receiver is a sequence of solid convex cast sections, never a plate or ball.
mass('receiver front tapered casting',-.51,.13,.10,.12,.26,.30,.39,.44,'ochre')
mass('receiver aft tapered casting',.13,.96,.10,.12,.39,.44,.28,.30,'ochre')
mass('receiver metallic load collar',-.22,-.04,.10,.12,.34,.38,.34,.38,'steel')
barrel=[]
mass('long load bearing octagonal barrel',-.22,-1.98,-.06,.13,.23,.23,.20,.20,'steel',barrel)
mass('forged tapered recoil shroud',-.40,-1.53,-.06,.13,.34,.34,.25,.25,'ochre',barrel)
mass('front recoil sleeve rim',-1.45,-1.61,-.06,.13,.27,.27,.27,.27,'steel',barrel)
mass('heavy angular muzzle brake',-1.97,-2.35,-.06,.13,.26,.26,.22,.22,'sand',barrel)
ports.append(gun('siege_lance',(-2.28,-.06,.13),(-2.44,-.06,.13),.13,'steel',barrel))
for z in [-.20,.49]:
 rod('fixed recoil guide '+str(z),(-1.18,-.39,z),(.82,-.39,z),.060,'steel')
 rod('hydraulic sleeve '+str(z),(.12,-.45,z),(.91,-.45,z),.095,'dark')
 rod('sliding piston '+str(z),(-.84,-.45,z),(.28,-.45,z),.048,'steel',barrel)
# Four separate deep braces form open load triangles around recoil rails.
for z in [-.43,.69]:
 rod('aft guide angular brace '+str(z),(.80,.00,.12),(.48,-.37,z),.10,'frame')
 rod('forward guide angular brace '+str(z),(-.30,.00,.12),(-.85,-.37,z),.08,'ochre')
 rod('long exposed truss chord '+str(z),(-.85,-.37,z),(.48,-.37,z),.07,'frame')
move(barrel,(.52,0,0),'recoil')
mass('engine load housing',.86,1.23,.15,-.10,.38,.42,.52,.52,'frame')
mass('aft axial turbine casing',1.23,2.02,.15,-.10,.52,.52,.43,.43,'steel')
rod('aft turbine recess',(1.98,.15,-.10),(2.10,.15,-.10),.34,'dark');empty('nozzle_main',(2.12,.15,-.10))
rod('offset gun actual mounting strut',(.26,.05,-.15),(.16,-.59,-.64),.095,'frame')
ports.append(gun('offset_suppressor',(.16,-.59,-.64),(-.38,-.59,-.64),.07,'steel'))
corepos=(.72,-.41,.12);core=rod('deployable cyan service core',(.72,-.38,.12),corepos,.205,'cyan')
hatch=[];plate('functional oblique service cap',[(.35,-.17),(1.09,-.13),(1.09,.46),(.54,.60)],-.53,.15,'sand',hatch);move(hatch,(.28,0,.73))
lock=plate('inner physical safety lock',[(.37,-.15),(1.02,-.15),(1.04,.47),(.37,.47)],-.43,.045,'dark')
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
 return {'muzzlesPixels':[project(anchors[n].location) for n in portnames],'muzzleDirectionsPixels':[project(anchors[n+'_direction'].location) for n in portnames],'nozzlesPixels':[project(o.location) for n,o in anchors.items() if n.startswith('nozzle_')], 'corePixels':dict(cp,radius=math.hypot(cp['x']-rp['x'],cp['y']-rp['y'])),'coreExposed':exposed,'bodyHullPixels':h,'bodyHullComponentNames':[o.name for o in objects if o.type=='MESH' and not o.hide_render],'muzzleNames':portnames,'sourceAnchors':{n:list(o.location) for n,o in anchors.items()},'bodyBoundsPixels':{'minX':min(p['x'] for p in allp),'minY':min(p['y'] for p in allp),'maxX':max(p['x'] for p in allp),'maxY':max(p['y'] for p in allp)}}


lock_base=lock.location.copy();frames={};start=time.time()
for progress in [0,.25,.5,.75,1]:
 for recoil in [0,1]:
  state='phase_'+str(round(progress*100)).zfill(3)+('_fire' if recoil else '')
  for o,base,delta,kind in moves:o.location=base+delta*(progress if kind=='mechanism' else recoil)
  core.hide_render=progress<1;lock.location=lock_base+deploy*progress+(Vector((.22,0,.84)) if progress==1 else Vector())
  bpy.context.view_layer.update();f=metadata(parts,ports,progress==1);filename='lancer-'+state+'.png';f.update(filename=filename,sourceState=state,mechanismProgress=progress,recoilProgress=recoil)
  bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'source-'+state+'.blend'))
  scene.render.filepath=os.path.join(OUT,filename)
  if RENDER:bpy.ops.render.render(write_still=True);f['sha256']=hashlib.sha256(open(scene.render.filepath,'rb').read()).hexdigest()
  frames[state]=f
for o,base,delta,kind in moves:o.location=base
core.hide_render=True;lock.location=lock_base;bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'actual.blend'))
entry={'key':'lancer','roles':['lancer'],'canvasWidth':384,'canvasHeight':384,'displayWidth':400,'pivotPixels':{'x':192,'y':192},'facing':'left','weakpointEnabled':True,'frames':frames,'mechanismFrames':[{'progress':p,'state':'phase_'+str(round(p*100)).zfill(3)} for p in [0,.25,.5,.75,1]],'status':'full source candidate; runtime integration pending','recoilDelta':[.52,0,0]}
for alias,src in [('idle','phase_000'),('charge','phase_000'),('fire','phase_000_fire'),('open','phase_100'),('damaged','phase_000')]:frames[alias]=dict(frames[src],semanticAliasOf=src)
entry['semanticAliases']={'neutralByProgress':{str(p):'phase_'+str(round(p*100)).zfill(3) for p in [0,.25,.5,.75,1]},'fireByProgress':{str(p):'phase_'+str(round(p*100)).zfill(3)+'_fire' for p in [0,.25,.5,.75,1]}}
entry['chargePolicy']='current neutral geometry with runtime VFX';entry['damagedPolicy']='current pose with runtime effect'
json.dump({'schemaVersion':1,'entries':[entry]},open(os.path.join(OUT,'manifest-candidate.json'),'w'),indent=2)
json.dump({'blender':bpy.app.version_string,'device':'CPU','threads':2,'samples':24,'cameraScale':scale,'sourceSHA256':hashlib.sha256(open(__file__,'rb').read()).hexdigest(),'files':{n:hashlib.sha256(open(os.path.join(OUT,n),'rb').read()).hexdigest() for n in os.listdir(OUT) if n.endswith(('.blend','.png'))}},open(os.path.join(OUT,'production.json'),'w'),indent=2)
