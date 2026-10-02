"""SkyWind representative enemy: actual editable hard-surface Blender geometry.

Run: blender --background --python generator.py -- --output DIR --samples 64
Axes: enemy forward=-X, aircraft starboard=+Y, up=+Z.
Camera is orthographic at (0,-15,4), looking at origin; screen right=+X.
All PNGs are native Cycles renders. No image generation or silhouette repainting.
"""
import bpy, bmesh, math, json, os, sys, argparse, hashlib, time
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
ap=argparse.ArgumentParser()
ap.add_argument('--output', default=os.path.dirname(os.path.abspath(__file__)))
ap.add_argument('--samples',type=int,default=64)
ap.add_argument('--resolution',type=int,default=384)
ap.add_argument('--smoke',action='store_true')
opt=ap.parse_args(args)
OUT=os.path.abspath(opt.output); os.makedirs(OUT,exist_ok=True); os.makedirs(OUT+'/renders',exist_ok=True)
started=time.time()
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections):
    if col.name!='Collection': bpy.data.collections.remove(col)
base=bpy.data.collections.get('Collection'); base.name='INT01 | Wedge interceptor'
cols={}
for name in ['01_CHASSIS','02_ARMOR','03_PROPULSION','04_WEAPON','05_STABILIZERS','06_ANCHORS','07_STAGE']:
    c=bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); cols[name]=c
def relink(obj,col):
    for c in list(obj.users_collection): c.objects.unlink(obj)
    cols[col].objects.link(obj)
    return obj
def mat(name,rgb,metal=.45,rough=.32,emit=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*rgb,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    if emit:
        p.inputs['Emission Color'].default_value=(*rgb,1); p.inputs['Emission Strength'].default_value=emit
    return m
M={
 'pearl':mat('Armor | cool pearl ceramic',(.46,.54,.64),.35,.38),
 'light':mat('Armor | leading bevel silver',(.68,.75,.82),.45,.34),
 'slate':mat('Armor | blue grey secondary',(.26,.37,.49),.50,.33),
 'blue':mat('Stabilizers | deep cobalt enamel',(.012,.040,.135),.35,.40),
 'frame':mat('Frame | graphite titanium',(.027,.045,.061),.65,.34),
 'steel':mat('Mechanics | machined titanium',(.20,.27,.31),.80,.30),
 'black':mat('Cavities | black ceramic',(.008,.014,.020),.25,.48),
 'cyan':mat('Status | restrained cyan',(.055,.68,.83),.35,.25,1.8),
}
root=bpy.data.objects.new('INT01_ROOT | fixed pivot',None); cols['01_CHASSIS'].objects.link(root)
def mesh(name,verts,faces,material,col='02_ARMOR',bevel=.015):
    me=bpy.data.meshes.new(name+' geometry'); me.from_pydata(verts,[],faces); me.update()
    bm=bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm,faces=bm.faces); bm.to_mesh(me); bm.free()
    ob=bpy.data.objects.new(name,me); cols[col].objects.link(ob); ob.data.materials.append(M[material]); ob.parent=root
    if bevel:
        b=ob.modifiers.new('Manufactured edge bevel','BEVEL'); b.width=bevel; b.segments=2; b.affect='EDGES'
        n=ob.modifiers.new('Weighted broad face normals','WEIGHTED_NORMAL'); n.keep_sharp=True
    return ob
def prism_xz(name,polygon,ycenter,thickness,material,col='02_ARMOR',bevel=.015):
    n=len(polygon); v=[(x,ycenter-thickness/2,z) for x,z in polygon]+[(x,ycenter+thickness/2,z) for x,z in polygon]
    f=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,v,f,material,col,bevel)
def prism_xy(name,polygon,zcenter,thickness,material,col='05_STABILIZERS',bevel=.014):
    n=len(polygon); v=[(x,y,zcenter-thickness/2) for x,y in polygon]+[(x,y,zcenter+thickness/2) for x,y in polygon]
    f=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,v,f,material,col,bevel)
def box(name,loc,scale,material,col='01_CHASSIS',bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.name=name; o.dimensions=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); relink(o,col); o.data.materials.append(M[material]); o.parent=root
    if bevel:
        b=o.modifiers.new('Machined bevel','BEVEL'); b.width=bevel; b.segments=2
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o
def ring_x(name,xs,rs,y,z,material,col='03_PROPULSION',sides=8,cap_start=True,cap_end=True):
    verts=[(x,y+r*math.cos(2*math.pi*i/sides+math.pi/8),z+r*math.sin(2*math.pi*i/sides+math.pi/8)) for x,r in zip(xs,rs) for i in range(sides)]
    faces=[]
    for j in range(len(xs)-1):
        for i in range(sides): faces.append((j*sides+i,j*sides+(i+1)%sides,(j+1)*sides+(i+1)%sides,(j+1)*sides+i))
    if cap_start: faces.append(tuple(range(sides-1,-1,-1)))
    if cap_end: faces.append(tuple((len(xs)-1)*sides+i for i in range(sides)))
    return mesh(name,verts,faces,material,col,.008)
def anchor(name,loc):
    o=bpy.data.objects.new(name,None); cols['06_ANCHORS'].objects.link(o); o.location=loc; o.parent=root; o.empty_display_type='SPHERE'; o.empty_display_size=.055
    return o

# 1. Faceted continuous inner hull. No paper-thin silhouette impostor.
rings=[(-2.18,.055,.055,.015),(-1.1,.28,.23,.01),(-.22,.47,.30,0),(.70,.44,.26,0),(1.40,.28,.19,0)]
verts=[]
for x,ry,rz,zc in rings:
    for i in range(8):
        a=2*math.pi*i/8+math.pi/8; verts.append((x,ry*math.cos(a),zc+rz*math.sin(a)))
faces=[tuple(range(7,-1,-1))]
for j in range(len(rings)-1):
    for i in range(8): faces.append((j*8+i,j*8+(i+1)%8,(j+1)*8+(i+1)%8,(j+1)*8+i))
faces.append(tuple(32+i for i in range(8)))
mesh('FRAME | continuous tapered spine',verts,faces,'frame','01_CHASSIS',.022)

# 2. Twin visible armor layers, with real gaps exposing dark mechanical frame.
for side in [-1,1]:
    s='PORT' if side<0 else 'STARBOARD'
    prism_xz(f'{s} | spear leading armor',[(-2.38,.025),(-1.12,.32),(-.68,.28),(-.86,.045),(-1.95,-.065)],side*.28,.19,'pearl',bevel=.013)
    prism_xz(f'{s} | upper segmented cheek',[(-1.01,.37),(-.30,.49),(.48,.35),(.73,.10),(.04,.12),(-.74,.18)],side*.36,.22,'pearl',bevel=.024)
    prism_xz(f'{s} | lower angular jaw',[(-1.68,-.13),(-.82,-.37),(.20,-.33),(.60,-.12),(-.13,-.18)],side*.39,.16,'slate',bevel=.016)
    prism_xz(f'{s} | lower jaw edge inlay',[(-1.47,-.155),(-.78,-.31),(-.10,-.28),(.13,-.235),(-.69,-.23)],side*.483,.026,'light',bevel=.005)
    prism_xz(f'{s} | shoulder shield',[(.21,.33),(.78,.38),(1.22,.13),(.98,-.07),(.66,.02)],side*.53,.20,'pearl',bevel=.025)
    # Single dark recessed service channel. Vent teeth are structural, not painted noise.
    prism_xz(f'{s} | flank recessed duct',[(-.62,.075),(.43,.035),(.61,-.04),(-.57,-.07)],side*.497,.025,'black',bevel=.004)
    for k in range(4):
        x=-.38+k*.18
        prism_xz(f'{s} | vent baffle {k+1}',[(x,.04),(x+.065,.032),(x+.038,-.051),(x-.027,-.049)],side*.52,.030,'steel',bevel=.003)
    prism_xz(f'{s} | tiny cyan status strip',[(-.83,.108),(-.50,.095),(-.51,.067),(-.86,.077)],side*.511,.02,'cyan',bevel=.002)

# Dorsal keel and non-piloted forward sensor: an enemy interceptor, not a player clone.
prism_xz('DORSAL | raised central armored keel',[(-1.37,.24),(-.65,.58),(.14,.47),(.51,.30),(-.34,.30)],0,.33,'blue',bevel=.025)
prism_xz('DORSAL | pearl leading brow',[(-1.34,.252),(-.69,.536),(-.47,.509),(-.87,.298)],-.184,.024,'light',bevel=.005)
prism_xz('SENSOR | black inset brow',[(-1.37,.267),(-1.13,.383),(-.94,.352),(-1.07,.268)],-.206,.042,'black',bevel=.006)
prism_xz('SENSOR | cyan optical slit',[(-1.337,.277),(-1.144,.366),(-1.097,.346),(-1.269,.273)],-.231,.018,'cyan',bevel=.002)

# 3. Twin propulsion modules with editable faceted outer shell, recessed cavities and rings.
for side in [-1,1]:
    s='PORT' if side<0 else 'STARBOARD'; y=side*.63; z=-.07
    ring_x(f'{s} ENGINE | graphite barrel',[.40,.73,1.50,1.71],[.15,.27,.235,.205],y,z,'frame')
    ring_x(f'{s} ENGINE | segmented pearl cowl',[.59,.79,1.30,1.50],[.205,.29,.268,.224],y,z,'pearl')
    # Genuine hollow bell: outer ring forward -> rear lip -> inner lip -> recessed dark wall.
    ring_x(f'{s} ENGINE | hollow exhaust bell',[1.40,1.77,1.77,1.48],[.196,.222,.164,.125],y,z,'steel',cap_start=False,cap_end=False)
    ring_x(f'{s} ENGINE | deep black exhaust cavity',[1.47,1.49],[.129,.129],y,z,'black')
    ring_x(f'{s} ENGINE | subtle recessed cyan ring',[1.53,1.55,1.55,1.53],[.133,.135,.107,.107],y,z,'cyan',cap_start=False,cap_end=False)
    # Vented armored engine shoulder and crisp trailing silver lip.
    prism_xz(f'{s} ENGINE | outer blue flash',[(.76,.17),(1.23,.145),(1.47,.055),(1.34,-.09),(.78,-.04)],y+side*.252,.045,'blue',bevel=.011)
    box(f'{s} ENGINE | mount strut',(.49,side*.46,-.045),(.61,.31,.17),'steel',bevel=.025)
    anchor(f'ANCHOR_nozzle_{s.lower()}',(1.79,y,z))

# 4. Cobalt swept planes with pearl leading panels and folded dagger stabilizers.
for side in [-1,1]:
    s='PORT' if side<0 else 'STARBOARD'
    wing=[(-.34,side*.34),(.41,side*1.03),(1.60,side*1.23),(1.05,side*.38)]
    prism_xy(f'{s} | swept cobalt outerplane',wing,.10,.082,'blue',bevel=.011)
    inset=[(-.12,side*.40),(.48,side*.90),(1.21,side*1.05),(.91,side*.55)]
    prism_xy(f'{s} | inset pearl leading panel',inset,.152,.033,'pearl',bevel=.007)
    # True canted 3D fin, offset in y with height. Same geometry on both sides.
    v=[(.54,side*.59,.24),(1.15,side*.82,.91),(1.45,side*.89,.87),(1.34,side*.69,.18)]
    vv=v+[(x,y+side*.062,z) for x,y,z in v]
    mesh(f'{s} | canted dagger stabilizer',vv,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],'blue','05_STABILIZERS',.012)
    v2=[(.68,side*.648,.35),(1.155,side*.826,.847),(1.325,side*.866,.831),(1.12,side*.736,.38)]
    vv2=v2+[(x,y+side*.007,z) for x,y,z in v2]
    mesh(f'{s} | stabilizer silver insert',vv2,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],'pearl','05_STABILIZERS',.004)

# 5. A slim independent under-slung rail weapon. Black muzzle opens toward -X.
box('WEAPON | receiver',(-.78,-.34,-.33),(.92,.21,.20),'frame','04_WEAPON',.016)
ring_x('WEAPON | titanium barrel',[-1.0,-1.88,-2.14],[.09,.077,.084],-.34,-.29,'steel','04_WEAPON',8)
ring_x('WEAPON | open muzzle collar',[-2.09,-2.19,-2.19,-2.105],[.109,.105,.065,.063],-.34,-.29,'frame','04_WEAPON',8,False,False)
ring_x('WEAPON | recessed muzzle bore',[-2.104,-2.11],[.062,.062],-.34,-.29,'black','04_WEAPON',8)
prism_xz('WEAPON | pearl barrel shroud',[(-1.87,-.207),(-.98,-.201),(-.69,-.285),(-1.37,-.321),(-1.79,-.29)],-.45,.063,'pearl','04_WEAPON',.009)
anchor('ANCHOR_muzzle_primary',(-2.215,-.34,-.29))

# Small hexagonal energy cell in the side frame, model-derived core marker.
bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=.104,depth=.045,location=(-.11,-.552,.005),rotation=(math.pi/2,0,0))
o=bpy.context.object; o.name='CORE | dark hex bezel'; relink(o,'01_CHASSIS'); o.parent=root; o.data.materials.append(M['steel'])
bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=.065,depth=.048,location=(-.11,-.58,.005),rotation=(math.pi/2,0,0))
o=bpy.context.object; o.name='CORE | neutral cyan cell'; relink(o,'01_CHASSIS'); o.parent=root; o.data.materials.append(M['cyan'])
anchor('ANCHOR_core',(-.11,-.606,.005)); anchor('ANCHOR_core_radius',(-.11,-.606,.07)); anchor('ANCHOR_pivot',(0,0,0))

# Fixed camera and stage. Numeric match to missing SV-01 source camera is not claimed.
scene=bpy.context.scene
bpy.ops.object.camera_add(location=(0,-15,4)); cam=bpy.context.object; cam.name='CAM | fixed orthographic side 14.93deg'; relink(cam,'07_STAGE')
cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler(); cam.data.type='ORTHO'; cam.data.ortho_scale=5.15; scene.camera=cam
def light(name,loc,power,size,color):
    bpy.ops.object.light_add(type='AREA',location=loc); l=bpy.context.object; l.name=name; relink(l,'07_STAGE'); l.data.energy=power; l.data.shape='DISK'; l.data.size=size; l.data.color=color
    l.rotation_euler=(-l.location).to_track_quat('-Z','Y').to_euler()
light('KEY | large cool daylight',(-3.5,-4.8,7),850,4.0,(.88,.94,1))
light('FILL | broad neutral',(3,-4,2.4),230,4.0,(.76,.88,1))
light('RIM | upper aft',(1.5,4,5.2),1000,3.0,(.77,.87,1))
scene.world.use_nodes=True; scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.22,.28,.36,1); scene.world.node_tree.nodes['Background'].inputs[1].default_value=.24
scene.render.engine='CYCLES'; scene.cycles.device='CPU'; scene.cycles.samples=opt.samples; scene.cycles.use_denoising=False
scene.cycles.max_bounces=6; scene.cycles.diffuse_bounces=3; scene.cycles.glossy_bounces=3; scene.cycles.transparent_max_bounces=6
scene.render.threads_mode='FIXED'; scene.render.threads=8
scene.render.resolution_x=opt.resolution; scene.render.resolution_y=opt.resolution; scene.render.resolution_percentage=100
scene.render.film_transparent=True; scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'; scene.render.image_settings.color_depth='8'; scene.render.image_settings.compression=20
scene.view_settings.view_transform='AgX'; scene.view_settings.look='AgX - Medium High Contrast'; scene.view_settings.exposure=-.25
scene.render.fps=30; scene.frame_set(1)
scene['asset_id']='int01-wedge'; scene['production']='Actual editable 3D meshes; representative neutral approval gate only'
scene['axis_convention']='Forward -X; starboard +Y; up +Z; rendered image pixel origin top-left'
scene['reference_commit']='8f9277cee5051d05cacdc39ddc5f05d4aafc3170'
scene['reference_camera']='Estimated from approved SV-01 renders; original camera unavailable; not exact numeric match'
for o in bpy.context.selected_objects: o.select_set(False)
root.select_set(True); bpy.context.view_layer.objects.active=root
bpy.context.view_layer.update()
def project(obj):
    q=world_to_camera_view(scene,cam,obj.matrix_world.translation); return [round(q.x*opt.resolution,4),round((1-q.y)*opt.resolution,4)]
anchors={o.name.replace('ANCHOR_',''): {'world':list(o.matrix_world.translation),'pixels':project(o)} for o in cols['06_ANCHORS'].objects}
manifest={
 'id':'beetle','assetId':'int01-wedge','version':1,'approvalStatus':'representative-review-only',
 'format':'PNG','colorMode':'RGBA','width':opt.resolution,'height':opt.resolution,
 'imagePixelOrigin':'top-left','pivotPixels':anchors['pivot']['pixels'],'displayWidth':87,
 'facing':'left','axes':{'forward':'-X','starboard':'+Y','up':'+Z'},
 'camera':{'type':'ORTHO','location':list(cam.location),'rotationEuler':list(cam.rotation_euler),'orthoScale':cam.data.ortho_scale,'referenceMatch':'visual estimate; SV-01 numeric source camera unavailable'},
 'render':{'engine':'Cycles','device':'CPU','samples':opt.samples,'resolution':opt.resolution,'filmTransparent':True,'colorTransform':'AgX','look':scene.view_settings.look,'exposure':scene.view_settings.exposure,'frame':1},
 'source':'int01-wedge.blend','generator':'generator.py','flameBaked':False,
 'states':{'neutral':{'file':'renders/int01-neutral.png','frame':1,'muzzlesPixels':[anchors['muzzle_primary']['pixels']], 'nozzlesPixels':[anchors['nozzle_port']['pixels'],anchors['nozzle_starboard']['pixels']], 'corePixels':anchors['core']['pixels']}},
 'projectedAnchors':anchors,'coreRadiusPixels':math.dist(anchors['core']['pixels'],anchors['core_radius']['pixels']),
 'geometry':{'meshObjects':len([o for o in bpy.data.objects if o.type=='MESH']),'vertices':sum(len(o.data.vertices) for o in bpy.data.objects if o.type=='MESH'),'reusableModules':['faceted armor panel','tapered inner spine','hollow octagonal nozzle','rail weapon','swept outerplane','canted stabilizer']},
 'notes':['One neutral state only. No body animation validation claimed.','Camera, canvas and pivot remain fixed; no auto-fit or post-render recenter.','Projected anchors are Blender empties evaluated through the scene camera.','Runtime role beetle and displayWidth 87 supplied by local implementation lead.','Core is an attachment marker, not approval for neutral weakpoint damage.']
}
scene.render.filepath=OUT+'/renders/int01-neutral.png'
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/int01-wedge.blend')
with open(OUT+'/manifest.json','w') as f: json.dump(manifest,f,indent=2)
bpy.ops.render.render(write_still=True)
manifest['render']['elapsedSeconds']=round(time.time()-started,3)
for label,path in [('blend',OUT+'/int01-wedge.blend'),('png',OUT+'/renders/int01-neutral.png'),('generator',os.path.abspath(__file__))]:
    manifest.setdefault('sha256',{})[label]=hashlib.sha256(open(path,'rb').read()).hexdigest()
with open(OUT+'/manifest.json','w') as f: json.dump(manifest,f,indent=2)
print('SKYWIND_REPRESENTATIVE_RENDER_COMPLETE',json.dumps({'seconds':manifest['render']['elapsedSeconds'],'geometry':manifest['geometry'],'anchors':anchors}))
