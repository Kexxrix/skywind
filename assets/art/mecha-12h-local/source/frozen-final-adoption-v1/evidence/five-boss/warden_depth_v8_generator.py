"""Independent local Blender art. No Library inputs. Forward -X; up Z."""
import bpy, math, json, os, sys, time, hashlib
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
OUT=os.path.dirname(os.path.abspath(__file__))
ROLE='warden'
D=os.path.join(OUT,'warden-depth-v8');os.makedirs(D,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def material(name,c,metal=.6,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.18 if name=='steel' else .32 if name=='ivory' else .70 if name in ['frame','black'] else .38
 p.inputs['Coat Weight'].default_value=.15 if name in ['ivory','oxide'] else .02
 p.inputs['Coat Roughness'].default_value=.18
 anis=p.inputs.get('Anisotropic') or p.inputs.get('Anisotropic IOR Level')
 if anis is not None:anis.default_value=.35 if name=='steel' else 0
 p.inputs['Emission Color'].default_value=(*c,1);p.inputs['Emission Strength'].default_value=emission
 return m
M={k:material(k,c,metal,e) for k,c,metal,e in [('scarlet',(.48,.018,.035),.65,0),('ivory',(.76,.73,.63),.18,0),('oxide',(.25,.071,.024),.48,0),('steel',(.24,.29,.33),.85,0),('black',(.015,.02,.028),.5,0),('cyan',(.02,.8,.95),.3,2),('amber',(1,.25,.015),.4,1)]}
# Facing-dependent source shader gives the physical lens an inner energy face,
# a darker curved edge and an actual specular surface rather than a flat disk.
cn=M['cyan'].node_tree.nodes;cl=M['cyan'].node_tree.links
facing=cn.new('ShaderNodeLayerWeight');facing.inputs['Blend'].default_value=.35
ramp=cn.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=0;ramp.color_ramp.elements[0].color=(.32,.88,.92,1)
ramp.color_ramp.elements[1].position=.55;ramp.color_ramp.elements[1].color=(.015,.20,.29,1)
cl.new(facing.outputs['Facing'],ramp.inputs['Fac']);cl.new(ramp.outputs['Color'],cn.get('Principled BSDF').inputs['Emission Color'])
cn.get('Principled BSDF').inputs['Emission Strength'].default_value=1.35
M['frame']=material('frame',(.045,.055,.064),.28,0)
parts=[];moving=[];anchors=[];linked_actuators=[]
def box(name,loc,size,mat,move=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(M[mat]);b=o.modifiers.new('manufactured edge','BEVEL');b.width=.035;b.segments=3;b.harden_normals=True;o.modifiers.new('face normals','WEIGHTED_NORMAL');parts.append(o)
 if move:moving.append((o,Vector(loc),move))
 return o
def rod(name,a,b,r,mat):
 v=Vector(b)-Vector(a);bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=r,depth=v.length,location=(Vector(a)+Vector(b))/2);o=bpy.context.object;o.name=name;o.rotation_euler=v.to_track_quat('Z','Y').to_euler();o.data.materials.append(M[mat]);b=o.modifiers.new('machined rim bevel','BEVEL');b.width=.008;b.segments=3;o.modifiers.new('weighted cylinder normals','WEIGHTED_NORMAL');parts.append(o);return o
def anchor(name,loc):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=loc;anchors.append(o);return o
def plate(name,polygon,y,thickness,mat,move=0):
 n=len(polygon);verts=[(x,y-thickness/2,z) for x,z in polygon]+[(x,y+thickness/2,z) for x,z in polygon]
 faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.data.materials.append(M[mat]);b=o.modifiers.new('cast beveled edges','BEVEL');b.width=.035;b.segments=3;b.harden_normals=True;o.modifiers.new('weighted plate normals','WEIGHTED_NORMAL');parts.append(o)
 if move:moving.append((o,Vector((0,0,0)),move))
 return o
if ROLE=='pincer':
 box('single axial drive backbone',(.25,0,0),(2.1,.62,.66),'black')
 box('square collision ram face',(-1.25,0,0),(.48,1.0,1.35),'scarlet')
 box('ram impact reinforced face',(-1.51,-.02,0),(.08,1.05,1.05),'steel')
 for s in [-1,1]:
  box('separated impact jaw',(-.6,-.36,s*.64),(1.3,.32,.27),'scarlet',s)
  rod('exposed piston sleeve',(-.65,-.57,s*.42),(.35,-.57,s*.42),.095,'black')
  rod('exposed polished piston',(-.95,-.57,s*.42),(-.05,-.57,s*.42),.047,'steel')
  box('jaw hinge',(.28,-.38,s*.5),(.28,.28,.34),'oxide')
  box('angled rear fin',(.76,0,s*.54),(.65,.45,.18),'scarlet')
 rod('one axis turbine',(.7,0,0),(1.48,0,0),.4,'steel');rod('dark nozzle recess',(1.47,0,0),(1.53,0,0),.28,'black')
 anchor('nozzle_single',(1.55,0,0));anchor('ram_warning_not_muzzle',(-1.57,0,0))
else:
 plate('upper reactor aperture load shoulder',[(-.30,.80),(.60,.80),(1.1,.85),(.85,1.3),(-.30,.98)],.15,.8,'oxide')
 plate('lower reactor aperture load shoulder',[(-.30,-.98),(.85,-1.3),(1.1,-.85),(.60,-.80),(-.30,-.80)],.15,.8,'oxide')
 plate('rear aperture load spine',[(.62,-.56),(1.1,-.72),(1.1,.72),(.62,.56)],.15,.8,'oxide')
 plate('central ivory buttress',[(.6,-1.15),(.85,-.7),(.85,.7),(.6,1.15),(.48,.6),(.48,-.6)],-.4,.18,'ivory')
 box('upper open reactor cradle',(.05,-.60,.75),(.68,.14,.14),'black')
 box('lower open reactor cradle',(.05,-.60,-.75),(.68,.14,.14),'black')
 box('rear open reactor cradle',(.46,-.60,0),(.14,.14,1.36),'black')
 for s in [-1,1]:
  polygon=[(-.72,s*.95),(-.8,s*1.57),(-.28,s*1.85),(.22,s*2.03),(.52,s*1.8),(.68,s*.95)]
  if s<0:polygon.reverse()
  plate('separate flared load bearing turret frame '+str(s),polygon,0,.85,'frame',s)
  plate('oxide tapered crown '+str(s),[(.02,s*1.2),(.16,s*1.94),(.25,s*2.17),(.38,s*1.96),(.45,s*1.2)] if s>0 else [(x,-z) for x,z in reversed([(.02,1.2),(.16,1.94),(.25,2.17),(.38,1.96),(.45,1.2)])],-.48,.13,'oxide',s)
  for j in range(2):
   z=s*1.35+(j-.5)*.4
   rod('tower barrel',(-.72,-.37,z),(-1.34,-.37,z),.10,'steel')
   rod('tower bore',(-1.34,-.37,z),(-1.38,-.37,z),.072,'black')
   anchor(f'tower_{s}_{j}',(-1.38,-.37,z));anchor(f'tower_{s}_{j}_direction',(-1.7,-.37,z))
  poly=[(-.44,0),(.51,0),(.58,s*.36),(.29,s*.6),(-.46,s*.48)]
  if s<0:poly.reverse()
  plate('protected gray physical shutter '+str(s),poly,-.78,.19,'steel',s*2.5)
  rod('shutter guide rail',(.45,-.69,s*.2),(.45,-.69,s*1.12),.04,'steel')
  rod('shutter actuator sleeve',(.76,-.35,s*.5),(.76,-.35,s*1.0),.07,'black')
 rod('central lance shaft',(-.3,.1,0),(-1.65,.1,0),.13,'oxide');rod('lance ceramic nose',(-1.65,.1,0),(-1.95,.1,0),.085,'ivory')
 anchor('center_lance',(-1.96,.1,0));anchor('center_lance_direction',(-2.25,.1,0))
 for s in [-1,1]:
  rod('rear thruster',(.64,0,s*.93),(1.13,0,s*.93),.19,'steel');anchor('nozzle_'+str(s),(1.14,0,s*.93))

 # Layered turret armor remains outside the central projectile corridor.
 for sgn in [-1,1]:
  def mirrored(points):return points if sgn>0 else [(x,-z) for x,z in reversed(points)]
  plate('separated graphite turret underlayer '+str(sgn),mirrored([(-.68,1.06),(-.62,1.46),(-.24,1.66),(.26,1.80),(.50,1.58),(.47,1.05)]),-.46,.19,'steel',sgn)
  plate('floating ceramic turret face '+str(sgn),mirrored([(-.61,1.13),(-.56,1.43),(-.18,1.60),(.23,1.72),(.43,1.53),(.40,1.12)]),-.61,.24,'ivory',sgn)
  plate('oxide lower face inset '+str(sgn),mirrored([(-.50,1.15),(-.15,1.15),(-.11,1.30),(-.50,1.31)]),-.755,.028,'oxide',sgn)
  for j in range(3):
   plate('functional turret cooling slot '+str(sgn)+' '+str(j),mirrored([(.08+j*.10,1.32),(.135+j*.10,1.32),(.12+j*.10,1.49),(.065+j*.10,1.49)]),-.755,.035,'black',sgn)
  for j in range(2):
   z=sgn*1.35+(j-.5)*.4
   for k in range(3):
    collar=rod('tower barrel thermal collar '+str(sgn)+' '+str(j)+' '+str(k),(-.82-k*.16,-.37,z),(-.89-k*.16,-.37,z),.13,'oxide' if k==0 else 'steel')
    collar['towerSign']=sgn
  plate('layered shutter ceramic inset '+str(sgn),mirrored([(-.31,.11),(.36,.11),(.42,.29),(.25,.43),(-.30,.36)]),-.91,.035,'ivory',sgn*2.5)
  rod('rear turbine machined band '+str(sgn),(1.00,0,sgn*.93),(1.07,0,sgn*.93),.225,'oxide')


 # A gun carriage bears the central lance; it lifts on a rear guide outside
 # the open horizontal projectile corridor. It shares the lance's pose clock.
 plate('central lance load lower saddle',[(-.62,-.22),(.52,-.22),(.69,-.10),(-.55,-.06)],-.02,.50,'frame')
 plate('central lance load upper clamp',[(-.43,.18),(.48,.18),(.64,.04),(-.43,.05)],-.06,.50,'steel')
 box('central lance load visible slide',(.34,-.30,0),(.42,.14,.43),'frame')
 box('central lance load slide wear plate',(.34,-.39,0),(.34,.06,.30),'steel')
 rod('fixed rear lance vertical load guide',(.67,.08,-.05),(.67,.08,1.13),.10,'frame')
 rod('lance lift hydraulic cylinder',(.73,.05,.1),(.73,.05,.50),.12,'black')
 lift=rod('lance lift exposed polished piston',(.73,.05,.32),(.55,.05,.35),.046,'steel')
 linked_actuators.append((lift,Vector((.73,.05,.32)),Vector((.55,.05,.35)),'lance',0))
 for sg in [-1,1]:
  a=(.45,-.67,sg*.24);b=(.57,-.67,sg*.815)
  # Two track lips surround a real sliding bearing, rather than a free shutter.
  for off in [-.065,.065]:
   rod('shutter diagonal track lip '+str(sg)+' '+str(off),(a[0]+off,a[1],a[2]),(b[0]+off,b[1],b[2]),.026,'steel')
  box('shutter connected sliding bearing '+str(sg),(.45,-.72,sg*.24),(.18,.18,.20),'frame',sg*2.5)
  bearing=rod('shutter bearing hinge pin '+str(sg),(.45,-.79,sg*.24),(.45,-.96,sg*.24),.06,'steel')
  moving.append((bearing,bearing.location.copy(),sg*2.5))
  fixed=Vector((.83,-.18,sg*.58));tip=Vector((.45,-.69,sg*.24))
  sleeve=rod('shutter actuator cylinder '+str(sg),fixed,fixed+(tip-fixed)*.45,.075,'frame')
  piston=rod('shutter actual telescoping piston '+str(sg),fixed+(tip-fixed)*.3,tip,.037,'steel')
  linked_actuators.append((piston,fixed+(tip-fixed)*.3,tip,'shutter',sg))

 # Oblique reactor cradle: front mouth and aft housing have visible parallax.
 # The aft shell is behind the player-facing core approach, not a new shield.
 reactor_center=Vector((.05,-.70,0))
 aft_center=Vector((.49,-.06,.045))
 axis=(reactor_center-aft_center).normalized()
 u=axis.cross(Vector((0,0,1))).normalized();v=axis.cross(u).normalized()
 # Independent sectors preserve the true through aperture in the collision hulls.
 for segment in range(20):
  a=2*math.pi*segment/20;b=2*math.pi*(segment+1)/20
  front=reactor_center
  vertices=[]
  for center,outer,inner in [(front,.19,.145),(aft_center,.34,.235)]:
   for radius,angle in [(outer,a),(outer,b),(inner,b),(inner,a)]:
    vertices.append(center+(u*math.cos(angle)+v*math.sin(angle))*radius)
  faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
  mesh=bpy.data.meshes.new('oblique reactor cradle sector');mesh.from_pydata(vertices,[],faces);mesh.update()
  o=bpy.data.objects.new('oblique deep reactor housing sector '+str(segment),mesh);bpy.context.collection.objects.link(o)
  o.data.materials.append(M['steel']);o.data.materials.append(M['frame']);o.data.materials.append(M['black'])
  for poly in o.data.polygons:poly.material_index=2 if poly.index==4 else 1 if poly.index==2 else 0
  bevel=o.modifiers.new('housing structural cut edge','BEVEL');bevel.width=.006;bevel.segments=3;o.modifiers.new('housing normals','WEIGHTED_NORMAL');parts.append(o)
 # A short front lining exposes an inner shadow band without an opaque back disk.
 for segment in range(20):
  a=2*math.pi*segment/20;b=2*math.pi*(segment+1)/20
  vertices=[]
  for center,outer,inner in [(reactor_center,.145,.125),(reactor_center-axis*.14,.155,.135)]:
   for radius,angle in [(outer,a),(outer,b),(inner,b),(inner,a)]:vertices.append(center+(u*math.cos(angle)+v*math.sin(angle))*radius)
  mesh=bpy.data.meshes.new('oblique internal sleeve sector');mesh.from_pydata(vertices,[],faces);mesh.update()
  o=bpy.data.objects.new('dark oblique reactor sleeve '+str(segment),mesh);bpy.context.collection.objects.link(o);o.data.materials.append(M['black']);parts.append(o)
 # The lens remains smaller than v7; no emission gain or logical radius change.
bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,radius=1,location=reactor_center-axis*.11)
core=bpy.context.object;core.name='recessed reactor energy lens';core.rotation_euler=axis.to_track_quat('Z','Y').to_euler();core.scale=(.117,.117,.03);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);core.data.materials.append(M['cyan']);parts.append(core)

core.hide_render=True
core_anchor=anchor('core_center',(.05,-.70,0));core_radius_anchor=anchor('core_radius',(.28,-.70,0))
lock=rod('physical final interlock gray armor disk',(.05,-.77,0),(.05,-.83,0),.27,'steel')
lock_base=lock.location.copy()
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=2
scene.render.resolution_x=384;scene.render.resolution_y=384;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.world.color=(.15,.15,.15)
bpy.ops.object.camera_add(location=(0,-16,4));cam=bpy.context.object;cam.name='fixed orthographic source camera';cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=5.5;scene.camera=cam
for name,loc,power,size in [('key',(-3,-6,7),1400,4),('rim',(3,3,4),1600,2.5),('fill',(-4,-3,-4),450,4)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
scene.view_settings.view_transform='AgX'
def project(v):
 q=world_to_camera_view(scene,cam,Vector(v));return {'x':round(q.x*384,4),'y':round((1-q.y)*384,4)}
def convex(points):
 pts=sorted(set((p['x'],p['y']) for p in points))
 def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
 low=[];high=[]
 for p in pts:
  while len(low)>1 and cross(low[-2],low[-1],p)<=0:low.pop()
  low.append(p)
 for p in reversed(pts):
  while len(high)>1 and cross(high[-2],high[-1],p)<=0:high.pop()
  high.append(p)
 return [{'x':x,'y':y} for x,y in low[:-1]+high[:-1]]
frames={};start=time.time()
for state,progress in [('idle',0),('charge',0),('fire',0),('open',1),('phase_0',0),('phase_25',.25),('phase_50',.5),('phase_75',.75),('phase_100',1)]:
 authoring_frame=100+int(progress*100) if state.startswith('phase') else {'idle':1,'charge':10,'fire':20,'open':200}[state]
 scene.frame_set(authoring_frame)
 for o,base,m in moving:o.location=base+Vector((.12*progress,0,m*.23*progress))
 core.hide_render=not(ROLE!='pincer' and progress==1)
 lock.location=lock_base+Vector((0,0,1.05 if progress==1 else 0))
 # Turret muzzle empties follow the exact turret translation.
 for a in anchors:
  if a.name.startswith('tower_'):
   if 'base' not in a:a['base']=list(a.location)
   s=int(a.name.split('_')[1]);a.location=Vector(a['base'])+Vector((.12*progress,0,s*.23*progress))
   if state=='fire':a.location.x+=.16
 # Barrel movement follows the same tower mechanism.
 for o in parts:
  if 'turretSign' in o:
   if 'base' not in o:o['base']=list(o.location)
   o.location=Vector(o['base'])+Vector((.12*progress,0,int(o['turretSign'])*.23*progress))
  if o.name.startswith(('tower barrel','tower bore')):
   if 'base' not in o:o['base']=list(o.location)
   base=Vector(o['base']);o.location=base+Vector((.12*progress,0,(1 if base.z>0 else -1)*.23*progress))
   if state=='fire':o.location.x+=.16
 for o in parts+anchors:
  if o.name.startswith(('central lance shaft','lance ceramic nose','center_lance','central lance load')):
   if 'base' not in o:o['base']=list(o.location)
   o.location=Vector(o['base'])+Vector((.16 if state=='fire' else 0,0,.80*progress))

 for o,a,b,kind,sg in linked_actuators:
  end=b+Vector((.16 if state=='fire' and kind=='lance' else .12*progress if kind=='shutter' else 0,0,.80*progress if kind=='lance' else sg*.575*progress))
  delta=end-a
  if 'originalLength' not in o:o['originalLength']=o.dimensions.z
  # Cylinder primitive's local Z length is recorded from the original endpoints.
  if 'rodLength' not in o:o['rodLength']=(b-a).length
  o.location=(a+end)*.5;o.rotation_euler=delta.to_track_quat('Z','Y').to_euler();o.scale.z=delta.length/o['rodLength']

 bpy.context.view_layer.update()
 for o in parts+anchors:
  o.keyframe_insert('location',frame=authoring_frame);o.keyframe_insert('rotation_euler',frame=authoring_frame);o.keyframe_insert('scale',frame=authoring_frame)
 core.keyframe_insert('hide_render',frame=authoring_frame)
 dg=bpy.context.evaluated_depsgraph_get();hulls=[]
 for o in parts:
  if o.hide_render:continue
  e=o.evaluated_get(dg);mesh=e.to_mesh();hulls.append(convex([project(e.matrix_world@v.co) for v in mesh.vertices]));e.to_mesh_clear()
 pp=[p for h in hulls for p in h];bounds={'minX':min(p['x'] for p in pp),'minY':min(p['y'] for p in pp),'maxX':max(p['x'] for p in pp),'maxY':max(p['y'] for p in pp)}
 order=['tower_-1_0','tower_-1_1','tower_1_0','tower_1_1','center_lance'] if ROLE!='pincer' else []
 filename=f'{ROLE}-{state}.png';scene.render.filepath=os.path.join(D,filename);bpy.ops.render.render(write_still=True)
 bpy.ops.wm.save_as_mainfile(filepath=os.path.join(D,'source-'+state+'.blend'))
 cp=project(core_anchor.location);rp=project(core_radius_anchor.location)
 frames[state]={'filename':filename,'sourceState':state,'muzzlesPixels':[project(bpy.data.objects[n].location) for n in order],'muzzleDirectionsPixels':[project(bpy.data.objects[n+'_direction'].location) for n in order],'nozzlesPixels':[project(a.location) for a in anchors if a.name.startswith('nozzle')],'corePixels':dict(cp,radius=math.hypot(cp['x']-rp['x'],cp['y']-rp['y'])),'coreExposed':progress==1,'bodyHullPixels':hulls,'bodyBoundsPixels':bounds,'mechanismProgress':progress if state.startswith('phase') else None,'physicalInterlockClosed':progress<1,'authoringFrame':authoring_frame}
core.hide_render=True
lock.location=lock_base
scene.frame_start=1;scene.frame_end=200;scene.frame_set(100)
for o,base,m in moving:o.location=base
for o in parts+anchors:
 if 'base' in o:o.location=Vector(o['base'])
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(D,'actual.blend'))
entry={'key':'local-v8-warden-depth','roles':[ROLE],'canvasWidth':384,'canvasHeight':384,'displayWidth':380,'pivotPixels':{'x':192,'y':192},'facing':'left','weakpointEnabled':True,'frames':frames,'mechanismFrames':[{'state':s,'progress':p} for s,p in [('phase_0',0),('phase_25',.25),('phase_50',.5),('phase_75',.75),('phase_100',1)]],'damagedPolicy':'retain current mechanism pose plus runtime effects','chargePolicy':'neutral body plus authorized actual muzzle telegraph','status':'physical open core access patch; independent runtime regression pending'}
json.dump({'schemaVersion':1,'entries':[entry]},open(os.path.join(D,'manifest-candidate.json'),'w'),indent=2)
json.dump({'blender':bpy.app.version_string,'device':'CPU','threads':2,'samples':24,'camera':{'location':list(cam.location),'rotation':list(cam.rotation_euler),'orthoScale':cam.data.ortho_scale},'elapsedSeconds':time.time()-start,'generatorSHA256':hashlib.sha256(open(__file__,'rb').read()).hexdigest(),'hullMethod':'separate convex projected actual mesh vertices; bevel excluded','status':'mechanism and hull revision awaiting independent review','files':{f:hashlib.sha256(open(os.path.join(D,f),'rb').read()).hexdigest() for f in os.listdir(D) if f.endswith(('.blend','.png'))}},open(os.path.join(D,'production.json'),'w'),indent=2)
