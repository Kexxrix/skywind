"""Local independent lightweight single-rail sniper, never a scaled boss."""
import os
HERE=os.path.dirname(os.path.abspath(__file__))
HELPER=os.path.join(HERE,'bastion_full_v3_generator.py')
prefix=open(HELPER,encoding='utf-8').read().split('def bastion(progress,fire):')[0]
prefix=prefix.replace("ROLE='bastion'","ROLE='claw'").replace("'bastion-full-v3'","'normal-claw'")
exec(compile(prefix,HELPER+'#geometryhelpers','exec'))

M['drum']=mat('dark copper shared ammunition drum',(.33,.16,.08),.8)
M['shell']=mat('sandgray gun carriage',(.42,.43,.36),.7)
M['gate']=mat('mechanical feed gate',(.65,.44,.14),.75)
fixed=[];weapon=[]
def keep(o,group):group.append(o);return o
keep(rod('single transverse heavy supply drum',(.45,-.05,0),(.45,.42,0),.66,'drum'),fixed)
keep(rod('front visible drum cover',(.45,-.07,0),(.45,-.11,0),.55,'shell'),fixed)
keep(rod('drum rotating drive hub',(.45,-.12,0),(.45,-.17,0),.20,'steel'),fixed)
for z in [-.47,.47]:keep(prism('drum saddle '+str(z),[(.0,z-.09),(.83,z-.09),(.97,z+.04),(.18,z+.11)],-.15,.15,'steel'),fixed)
keep(prism('load carriage asymmetric lower shoe',[(-.58,-.51),(.97,-.70),(1.12,-.48),(.32,-.32),(-.40,-.31)],.04,.30,'shell'),fixed)
keep(prism('upper range sensor',[(.25,.62),(.82,.69),(.88,.52),(.25,.50)],-.13,.20,'black'),fixed)
keep(rod('rear single compact drive',(.97,.10,0),(1.34,.10,0),.23,'steel'),fixed)
keep(rod('rear dark nozzle',(1.32,.10,0),(1.37,.10,0),.15,'black'),fixed)
empty('nozzle_single',(1.38,.10,0))
for i,z in enumerate([-.24,.25]):
 weapon.append(rod('heavy short barrel '+str(i),(-1.47,-.13,z),(-.20,-.13,z),.14,'steel'))
 weapon.append(prism('barrel heat jacket '+str(i),[(-1.12,z-.18),(-.26,z-.18),(-.16,z+.19),(-1.12,z+.19)],.02,.38,'shell'))
 weapon.append(rod('dark actual bore '+str(i),(-1.50,-.13,z),(-1.54,-.13,z),.10,'black'))
 empty('barrel_'+str(i),(-1.55,-.13,z));empty('barrel_'+str(i)+'_direction',(-1.84,-.13,z))
bolt=prism('shared mechanical ammunition gate',[(-.15,-.18),(.15,-.18),(.23,.20),(-.11,.24)],-.36,.10,'gate')
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=2
scene.render.resolution_x=384;scene.render.resolution_y=384;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.world.color=(.15,.15,.15)
bpy.ops.object.camera_add(location=(0,-16,3.1));cam=bpy.context.object;cam.name='fixed orthographic source camera';cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=3.8;scene.camera=cam
for name,loc,power,size in [('key',(-3,-6,7),1100,6),('rim',(3,3,4),1300,4),('fill',(-4,-3,-4),700,5)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
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
base={o:o.location.copy() for o in weapon+[anchors[n] for n in ['barrel_0','barrel_0_direction','barrel_1','barrel_1_direction']]}
frames={};start=time.time()
for state,compression,recoil in [('idle',0,0),('charge',-.11,0),('fire',.03,.12)]:
 bolt.location.x=compression
 for o in base:o.location=base[o]+Vector((recoil,0,0))
 bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();hulls=[]
 for o in parts:
  e=o.evaluated_get(dg);mesh=e.to_mesh();hulls.append(convex([project(e.matrix_world@v.co) for v in mesh.vertices]));e.to_mesh_clear()
 pp=[p for h in hulls for p in h];filename='claw-'+state+'.png'
 frames[state]={'filename':filename,'sourceState':state,'muzzlesPixels':[project(anchors['barrel_'+str(i)].location) for i in range(2)],'muzzleDirectionsPixels':[project(anchors['barrel_'+str(i)+'_direction'].location) for i in range(2)],'nozzlesPixels':[project(anchors['nozzle_single'].location)],'corePixels':None,'coreExposed':False,'bodyHullPixels':hulls,'bodyBoundsPixels':{'minX':min(p['x'] for p in pp),'minY':min(p['y'] for p in pp),'maxX':max(p['x'] for p in pp),'maxY':max(p['y'] for p in pp)},'boltCompressionWorld':compression,'recoilWorld':recoil}
 scene.render.filepath=os.path.join(OUT,filename);bpy.ops.render.render(write_still=True);bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'source-'+state+'.blend'))
bolt.location.x=0
for o in base:o.location=base[o]
bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'actual.blend'))
entry={'key':'local-claw-drumgun-v1','roles':['claw'],'canvasWidth':384,'canvasHeight':384,'displayWidth':108,'pivotPixels':{'x':192,'y':192},'facing':'left','weakpointEnabled':False,'frames':frames,'mechanismFrames':[],'damagedPolicy':'current pose plus runtime effect','attackContract':'two actual short heavy barrels; shared drum feed, stage1 snapshot/timing owned by canonical code','status':'representative; independent review and runtime adoption pending'}
json.dump({'schemaVersion':1,'entries':[entry]},open(os.path.join(OUT,'manifest-candidate.json'),'w'),indent=2)
json.dump({'blender':bpy.app.version_string,'device':'CPU','threads':2,'samples':24,'camera':{'location':list(cam.location),'orthoScale':cam.data.ortho_scale},'elapsedSeconds':time.time()-start,'generatorSHA256':hashlib.sha256(open(__file__,'rb').read()).hexdigest(),'helperSourceSHA256':hashlib.sha256(open(HELPER,'rb').read()).hexdigest(),'files':{f:hashlib.sha256(open(os.path.join(OUT,f),'rb').read()).hexdigest() for f in os.listdir(OUT) if f.endswith(('.blend','.png'))}},open(os.path.join(OUT,'production.json'),'w'),indent=2)
