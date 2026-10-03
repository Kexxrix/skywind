"""Apex six-hour representative preparation: open vertical wing load skeleton.
Local v1 geometry helpers only; new model meshes independently generated.
Run Blender -b -t 2 --python generator.py -- apex --render [--all].
"""
import os
HERE=os.path.dirname(os.path.abspath(__file__))
V1=os.path.join(HERE,'dependency_v1.py')
source=open(V1,encoding='utf-8').read()
prefix=source.split('def bastion(progress,fire):')[0]
prefix=prefix.replace("OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),ROLE+'-v1')","OUT=os.path.dirname(os.path.abspath(__file__))")
prefix=prefix.replace("ROLE=ARGS[0] if ARGS else 'bastion'","ROLE='apex'")
exec(compile(prefix,V1+'#helpers','exec'))
M['graphite']=mat('bright graphite alloy',(.115,.145,.19),.68)
M['facet']=mat('exposed graphite facets',(.20,.25,.30),.65)
M['slate']=mat('secondary blue grey facets',(.12,.19,.25),.7)
M['gold']=mat('load bearing muted gold',(.55,.30,.07),.72)
M['bone']=mat('matte graphite structural cast',(.055,.080,.10),.50)
M['blade']=mat('brushed vertical wing facet',(.20,.26,.31),.70)
for k in ['graphite','bone','slate']:M[k].node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.56
M['gold'].node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.34
def link_plate(name,a,b,wa,wb,y,depth,material):
 d=b-a;d.y=0;d.normalize();n=Vector((-d.z,0,d.x))
 poly=[(p.x,p.z) for p in [a+n*wa,b+n*wb,b-n*wb,a-n*wa]]
 return prism(name,poly,y,depth,material)
def emitter(name,p,angle=0):
 # A faceted resonator cage with an open barrel, distinct from the heavy rail.
 v=Vector((-math.cos(angle),0,math.sin(angle)));tip=Vector(p)+v*.62
 link_plate(name+' tapered optical housing',Vector(p),tip,.19,.13,p.y,.34,'facet')
 rod(name+' exposed resonator',Vector(p)+v*.18+Vector((0,-.20,0)),tip+Vector((0,-.20,0)),.045,'gold')
 rod(name+' barrel socket',tip-v*.07,tip+v*.04,.10,'black')
 empty(name,tip+v*.05);empty(name+'_direction',tip+v*.42)
def apex(progress,fire):
 # Open load skeleton: no continuous wide citadel plate behind the arm.
 # Rear load spar and gold conductor stay narrow; all spaces are actual air.
 prism('narrow tilted vertebral load spar',[(.80,-1.48),(1.09,-1.22),(1.18,.32),(.96,1.25),(.77,.74),(.96,-.88)],.10,.43,'bone')
 prism('exposed continuous gold structural tendon',[(.87,-1.34),(1.02,-1.13),(1.08,.22),(.90,1.15),(.84,.77),(.98,-.94)],-.24,.085,'gold')
 # Tall upper blade and shorter split ventral blade have different sweep/load.
 prism('upper swept vertical execution wing',[(.88,.56),(.44,2.28),(.69,2.03),(1.32,.72),(1.10,.32)],.05,.22,'graphite')
 prism('upper blade metallic load facet',[(.87,.79),(.53,2.09),(.72,1.76),(1.12,.76)],-.09,.06,'blade')
 prism('upper blade gold leading tendon',[(.88,.60),(.44,2.28),(.51,2.17),(.96,.66)],-.115,.035,'gold')
 prism('ventral reverse sweep execution wing',[(.99,-.83),(.61,-2.09),(.79,-1.94),(1.26,-1.04),(1.13,-.63)],.07,.20,'graphite')
 prism('ventral wing tapered metallic load facet',[(1.00,-1.01),(.71,-1.91),(.92,-1.58),(1.14,-1.03)],-.08,.05,'blade')
 # Independent two-sided struts leave a triangular hole between the spar/hub.
 link_plate('upper diagonal reactor to wing load strut',Vector((.35,.11,.39)),Vector((.94,.11,1.04)),.12,.075,.03,.32,'bone')
 link_plate('lower diagonal reactor to keel load strut',Vector((.39,.08,-.58)),Vector((.96,.08,-1.21)),.13,.08,.04,.31,'bone')
 link_plate('rear engine transverse support upper',Vector((.93,.10,.26)),Vector((1.53,.10,.13)),.12,.085,.08,.35,'graphite')
 link_plate('rear engine transverse support lower',Vector((.91,.10,-.71)),Vector((1.52,.10,-.55)),.13,.075,.08,.35,'graphite')
 # Shoulder saddle is a focused torque structure, not a second boxy torso.
 # Broad shoulder torque seat extends from hub, not a thin rod on its corner.
 shoulder=Vector((-.13,-.11,.96))
 prism('triangular shoulder torque saddle',[(-.47,.62),(-.40,1.21),(.02,1.30),(.34,1.02),(.19,.73)],-.20,.50,'graphite')
 rod('shoulder large load bearing housing',shoulder+Vector((0,-.52,0)),shoulder+Vector((0,.37,0)),.34,'steel')
 rod('shoulder recessed hub cap',shoulder+Vector((0,-.54,0)),shoulder+Vector((0,-.60,0)),.25,'graphite')
 rod('shoulder torque axle visible',shoulder+Vector((0,-.61,0)),shoulder+Vector((0,-.64,0)),.10,'gold')
 angles=[math.radians(139-14*progress),math.radians(214+20*progress),math.radians(148-22*progress)]
 if fire:angles[2]+=math.radians(13)
 points=[shoulder]
 for a,l in zip(angles,[.82,.76,.40]):points.append(points[-1]+Vector((math.cos(a)*l,0,math.sin(a)*l)))
 # Upper arm bears the highest torque: thick wedge armor over double cylinder.
 a,b,c,d=points
 link_plate('upper arm heavy taper torque casing',a,b,.24,.19,-.11,.55,'graphite')
 link_plate('upper arm machined broad facet',a+Vector((0,0,.045)),b+Vector((0,0,.045)),.15,.10,-.43,.09,'facet')
 direction=(b-a).normalized();normal=Vector((-direction.z,0,direction.x))
 for s in [-1,1]:
  rod('upper arm paired hydraulic sleeve '+str(s),a+normal*s*.17+Vector((0,-.47,0)),a+(b-a)*.57+normal*s*.17+Vector((0,-.47,0)),.063,'black')
  rod('upper arm paired hydraulic rod '+str(s),a+(b-a)*.40+normal*s*.17+Vector((0,-.47,0)),b+normal*s*.17+Vector((0,-.47,0)),.037,'steel')
 # Forearm is lighter and longitudinally braced; wrist has small precision load.
 link_plate('forearm tapered compression beam',b,c,.17,.11,-.10,.38,'slate')
 link_plate('forearm raised metallic facet',b,c,.09,.055,-.34,.08,'facet')
 rod('forearm gold exposed tension member',b+Vector((0,-.39,0)),c+Vector((0,-.39,0)),.048,'gold')
 link_plate('wrist short asymmetric socket',c,d,.13,.10,-.10,.30,'graphite')
 for i,r in [(1,.255),(2,.18),(3,.145)]:
  p=points[i];rod('joint%d differentiated housing'%i,p+Vector((0,-.40,0)),p+Vector((0,.24,0)),r,'steel')
  rod('joint%d recessed bearing'%i,p+Vector((0,-.42,0)),p+Vector((0,-.45,0)),r*.68,'graphite')
 for i,p in enumerate(points):empty('arm_joint_'+str(i),p)
 emitter('wrist_precision_beam',d,.025)
 # A lower heavy siege rail uses a wide asymmetric recoil sled and forked rails.
 recoil=.23 if fire else 0
 link_plate('siege tapered structural load cantilever',Vector((-.36,.10,-1.14)),Vector((.96,.10,-1.16)),.10,.14,.10,.30,'bone')
 prism('siege weapon recoil root',[(-.63,-1.38),(-.92,-1.19),(-.57,-.91),(-.23,-1.09)],-.08,.46,'graphite')
 gunroot=Vector((-.74+recoil,-.12,-1.17));tip=gunroot+Vector((-.97,0,0))
 link_plate('siege central rectangular breech',gunroot,tip,.17,.145,-.12,.54,'slate')
 for s in [-1,1]:
  rod('siege visible paired recoil piston '+str(s),(-.28,-.47,-1.17+s*.14),(-.85+recoil,-.47,-1.17+s*.14),.038,'steel')
  link_plate('siege split rail '+str(s),gunroot+Vector((-.28,0,s*.18)),tip+Vector((-.12,0,s*.18)),.045,.045,-.12,.37,'steel')
 rod('siege recessed bore',tip,tip+Vector((-.10,0,0)),.092,'black')
 empty('lower_siege_rail',tip+Vector((-.11,0,0)));empty('lower_siege_rail_direction',tip+Vector((-.49,0,0)))
 # Small tracking turret has a round turret seat and slender elevated muzzle.
 rod('tracking swivel turret housing',(.73,-.39,1.07),(.73,-.68,1.07),.20,'graphite')
 gun('upper_tracking',(.67,-.64,1.16),.49,.064,'steel',.30)
 # Large stepped rear propulsion, no flame baked into the image.
 rod('main engine broad collar',(1.20,.12,-.28),(1.62,.12,-.28),.40,'graphite')
 nozzle('nozzle_main',(1.92,.12,-.28),.32)
 nozzle('nozzle_trim',(1.26,.06,1.07),.17)
 # Layered central reactor hub with separate outer shutters and moving inner lock.
 center=Vector((.27,-.12,-.14))
 rod('reactor wide multi layer hub',(center.x,-.60,center.z),(center.x,-.76,center.z),.49,'graphite')
 rod('reactor steel stepped rim',(center.x,-.77,center.z),(center.x,-.84,center.z),.37,'steel')
 rod('reactor dark socket',(center.x,-.85,center.z),(center.x,-.88,center.z),.285,'black')
 core=rod('cyan locked heart',(center.x,-.89,center.z),(center.x,-.92,center.z),.235,'cyan');core.hide_render=progress<1
 empty('core_center',(center.x,-.93,center.z));empty('core_radius',(center.x+.235,-.93,center.z))
 for s in [-1,1]:
  shift=(.23*progress if progress<1 else .58)*s
  poly=[(-.15,-.14+shift),(.68,-.14+shift),(.62,-.14+s*.36+shift),(.02,-.14+s*.43+shift)]
  prism('reactor reinforced load petal '+str(s),poly,-1.00,.17,'facet')
  rod('reactor physical guide '+str(s),(.72,-.70,s*.16-.14),(.72,-.70,s*.85-.14),.045,'steel')
 lock_slide=max(0,(progress-.75)/.25)*.87
 prism('inner protected gray iris',[(-.04,-.46+lock_slide),(.59,-.46+lock_slide),(.59,.18+lock_slide),(-.04,.18+lock_slide)],-.97,.11,'steel')
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
CONVEX_PRISM_CELLS={'narrow tilted vertebral load spar': [[(0.96, -0.88), (0.8, -1.48), (1.09, -1.22)], [(0.77, 0.74), (0.96, -0.88), (1.09, -1.22), (1.18, 0.32), (0.96, 1.25)]], 'exposed continuous gold structural tendon': [[(0.98, -0.94), (0.87, -1.34), (1.02, -1.13)], [(0.84, 0.77), (0.98, -0.94), (1.02, -1.13), (1.08, 0.22), (0.9, 1.15)]], 'upper swept vertical execution wing': [[(0.44, 2.28), (0.88, 0.56), (1.1, 0.32), (1.32, 0.72), (0.69, 2.03)]], 'upper blade metallic load facet': [[(0.53, 2.09), (0.87, 0.79), (1.12, 0.76), (0.72, 1.76)]], 'upper blade gold leading tendon': [[(0.44, 2.28), (0.88, 0.6), (0.96, 0.66), (0.51, 2.17)]], 'ventral reverse sweep execution wing': [[(0.61, -2.09), (0.79, -1.94), (1.26, -1.04), (1.13, -0.63), (0.99, -0.83)]], 'ventral wing tapered metallic load facet': [[(0.71, -1.91), (0.92, -1.58), (1.14, -1.03), (1.0, -1.01)]]}
def evaluated_cell_hulls(o,mesh):
 original=mesh.copy();original.transform(o.matrix_world);result=[]
 base=next((n for n in CONVEX_PRISM_CELLS if o.name.startswith(n)),None)
 if base is None:return None
 for i,cell in enumerate(CONVEX_PRISM_CELLS[base]):
  planes=[]
  for a,b in zip(cell,cell[1:]+cell[:1]):
   dx,dz=b[0]-a[0],b[1]-a[1];planes.append((Vector((a[0],0,a[1])),Vector((-dz,0,dx))))
  clipped=clip_mesh(original,planes)
  if clipped is not None:
   h=convex([project(v.co) for v in clipped.vertices])
   if len(h)>2:result.append((h,o.name+' exact convex cell '+str(i)))
   bpy.data.meshes.remove(clipped)
 bpy.data.meshes.remove(original);return result

def metadata(state,progress):
 bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();hulls=[];names=[]
 for o in parts:
  if o.hide_render:continue
  e=o.evaluated_get(deps);mesh=e.to_mesh();cells=evaluated_cell_hulls(o,mesh)
  if cells is None:
   h=convex([project(e.matrix_world@v.co) for v in mesh.vertices])
   if len(h)>2:hulls.append(h);names.append(o.name)
  else:
   for h,name in cells:hulls.append(h);names.append(name)
  e.to_mesh_clear()
 pp=[p for h in hulls for p in h];cp=project(anchors['core_center'].location);rp=project(anchors['core_radius'].location)
 ports=['upper_beam','lower_fan_a','lower_fan_b'] if ROLE=='bastion' else ['wrist_precision_beam','lower_siege_rail','upper_tracking']
 return {'filename':ROLE+'-'+state+'.png','sourceState':state,'mechanismProgress':progress,'muzzlesPixels':[project(anchors[n].location) for n in ports],'muzzleDirectionsPixels':[project(anchors[n+'_direction'].location) for n in ports],'muzzleNames':ports,'nozzlesPixels':[project(o.location) for n,o in anchors.items() if n.startswith('nozzle')],'corePixels':dict(cp,radius=math.hypot(cp['x']-rp['x'],cp['y']-rp['y'])),'coreExposed':progress==1,'bodyHullPixels':hulls,'bodyHullComponentNames':names,'bodyBoundsPixels':{'minX':min(p['x'] for p in pp),'maxX':max(p['x'] for p in pp),'minY':min(p['y'] for p in pp),'maxY':max(p['y'] for p in pp)},'sourceAnchorsPixels':{n:project(o.location) for n,o in anchors.items()}}
build=apex
states=[('idle',0,False),('mechanism_25',.25,False),('mechanism_50',.5,False),('mechanism_75',.75,False),('open',1,False),('fire',0,True),('mechanism_25_fire',.25,True),('mechanism_50_fire',.5,True),('mechanism_75_fire',.75,True),('open_fire',1,True)]
frames={};start=time.time()
for state,p,f in states:
 reset_geometry();build(p,f);apply_front_aperture();frames[state]=metadata(state,p)
 scene['authoring_state']=state;scene['authoring_progress']=p;scene['authoring_recoil']=f
 bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'source-'+state+'.blend'))
 if '--render' in ARGS:scene.render.filepath=os.path.join(OUT,ROLE+'-'+state+'.png');bpy.ops.render.render(write_still=True)
reset_geometry();build(0,False);apply_front_aperture();bpy.context.view_layer.update()
scene['mechanism_contract']='See generator: geometry at progress 0/.25/.5/.75/1; cyan only 1; attack authority remains runtime.'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'actual.blend'))
entry={'key':'local-apex-six-hour-full-v3','roles':[ROLE],'canvasWidth':384,'canvasHeight':384,'displayWidth':432 if ROLE=='bastion' else 448,'pivotPixels':{'x':192,'y':192},'facing':'left','weakpointEnabled':True,'frames':frames,'mechanismFrames':[{'progress':0,'state':'idle'},{'progress':.25,'state':'mechanism_25'},{'progress':.5,'state':'mechanism_50'},{'progress':.75,'state':'mechanism_75'},{'progress':1,'state':'open'}],'status':'new vertical wing skeleton full candidate; awaiting actual pixels and independent review'}
json.dump({'schemaVersion':1,'entries':[entry]},open(os.path.join(OUT,'manifest-candidate.json'),'w'),indent=2)
json.dump({'blender':bpy.app.version_string,'device':'CPU','threads':2,'samples':24,'camera':{'location':list(cam.location),'rotation':list(cam.rotation_euler),'orthoScale':cam.data.ortho_scale},'elapsedSeconds':time.time()-start,'hullMethod':'evaluated exact mesh vertices; convex component hulls; no union across C/arm gaps','rendered':'--render' in ARGS,'generatorSHA256':hashlib.sha256(open(__file__,'rb').read()).hexdigest(),'files':{f:hashlib.sha256(open(os.path.join(OUT,f),'rb').read()).hexdigest() for f in os.listdir(OUT) if f.endswith(('.blend','.png'))}},open(os.path.join(OUT,'production.json'),'w'),indent=2)

# Baseline contract check runs only when an authorized Blender slot executes this script.
baseline=json.load(open(os.path.join(OUT,'BASELINE_CONTRACT.json'),encoding='utf-8'))['entry']
issues=[]
for state,frame in frames.items():
 old=baseline['frames'][state]
 for field in ['muzzlesPixels','muzzleDirectionsPixels','nozzlesPixels','corePixels','coreExposed']:
  if frame.get(field)!=old.get(field):issues.append({'state':state,'field':field,'new':frame.get(field),'old':old.get(field)})
json.dump({'anchorContractMismatchCount':len(issues),'issues':issues,'geometryHullPolicy':'new real evaluated mesh compound hulls; no reuse of obsolete wide torso hull','status':'postbuild check, not pre-render approval'},open(os.path.join(OUT,'ANCHOR_CONTRACT_CHECK.json'),'w'),indent=2)
assert not issues,issues

manifest_path=os.path.join(OUT,'manifest-candidate.json');manifest=json.load(open(manifest_path));entry=manifest['entries'][0]
entry['semanticAliases']={'charge':'neutral at current mechanism progress + runtime VFX','damaged':'current pose + runtime effect','neutralByProgress':{'0':'idle','.25':'mechanism_25','.5':'mechanism_50','.75':'mechanism_75','1':'open'},'fireByProgress':{'0':'fire','.25':'mechanism_25_fire','.5':'mechanism_50_fire','.75':'mechanism_75_fire','1':'open_fire'}}
for state,frame in entry['frames'].items():frame['authoringState']={'progress':frame['mechanismProgress'],'recoil':state=='fire' or state.endswith('_fire'),'physicalInnerIrisLocked':frame['mechanismProgress']<1,'coreVisibleOnlyFinal':frame['mechanismProgress']==1,'poseSource':'source-'+state+'.blend'}
json.dump(manifest,open(manifest_path,'w'),indent=2)
production=json.load(open(os.path.join(OUT,'production.json')));production['dependencyPath']='dependency_v1.py';production['dependencySHA256']=hashlib.sha256(open(V1,'rb').read()).hexdigest();production['exactFrames']=10;production['design']='asymmetric vertical execution wings; narrow gold vertebral tendon; actual open load skeleton; original three joint weapon coordinates';production['attackAuthority']='runtime code; art cannot change core vulnerability or attack timing';json.dump(production,open(os.path.join(OUT,'production.json'),'w'),indent=2)
