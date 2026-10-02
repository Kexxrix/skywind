"""SkyWind controlled actual-3D mechanical family.
Loads the APPROVED representative .blend to preserve its exact camera,
lights, material data and color management. Meshes and physical state
poses are generated here; all outputs are native Cycles RGBA renders.
Run: blender --background --python family_generator.py -- --roles dragonfly orb
"""
import bpy,bmesh,math,json,os,sys,argparse,hashlib,time
from mathutils import Vector,Matrix
from bpy_extras.object_utils import world_to_camera_view
from pathlib import Path
ap=argparse.ArgumentParser()
ap.add_argument('--roles',nargs='*',default=[])
ap.add_argument('--samples',type=int,default=128)
ap.add_argument('--resolution',type=int,default=384)
ap.add_argument('--base',default=str(Path(__file__).resolve().parents[1]/'interceptor-representative/int01-wedge.blend'))
ap.add_argument('--output',default=str(Path(__file__).resolve().parent))
opt=ap.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=Path(opt.output); OUT.mkdir(parents=True,exist_ok=True)
for f in ['renders','sources','review']: (OUT/f).mkdir(exist_ok=True)
M={};cols={};root=None;PARENT=None;MOVES=[]

def relink(obj,col):
    for c in list(obj.users_collection): c.objects.unlink(obj)
    cols[col].objects.link(obj)
    return obj

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

# Shared approved modules. Geometry functions below parent whole mechanisms,
# including their anchor empties, so state-dependent muzzle positions are real.
def adopt(o):
    if PARENT is not None and PARENT != root:
        o.parent=PARENT
        o.matrix_parent_inverse=Matrix.Translation(-PARENT.location)
    return o
def plate(name,poly,y=-.35,t=.14,mat='pearl',bev=.018):
    return adopt(prism_xz(name,poly,y,t,mat,bevel=bev))
def solid(name,loc,size,mat='frame',col='01_CHASSIS',bev=.025):
    return adopt(box(name,loc,size,mat,col,bev))
def axis_ring(name,xs,rs,y,z,mat='steel',col='03_PROPULSION',cap_start=True,cap_end=True,sides=8):
    return adopt(ring_x(name,xs,rs,y,z,mat,col,sides,cap_start,cap_end))
def mark(name,loc):return adopt(anchor('ANCHOR_'+name,loc))
def group(name,pivot=(0,0,0),move=(0,0,0),rotate=(0,0,0)):
    global PARENT
    g=bpy.data.objects.new(name,None);cols['01_CHASSIS'].objects.link(g);g.parent=root;g.location=pivot
    g.empty_display_type='PLAIN_AXES';g.empty_display_size=.16
    MOVES.append((g,Vector(pivot),Vector(move),Vector(rotate)));PARENT=g
    return g
def ungroup():
    global PARENT
    PARENT=root
def chamfer(cx,cz,w,h,c=.18):
    c=min(c,w*.26,h*.26)
    return [(cx-w/2+c,cz-h/2),(cx+w/2-c,cz-h/2),(cx+w/2,cz-h/2+c),(cx+w/2,cz+h/2-c),(cx+w/2-c,cz+h/2),(cx-w/2+c,cz+h/2),(cx-w/2,cz+h/2-c),(cx-w/2,cz-h/2+c)]
def oct_ring_front(name,center,radius,thick,mat='blue',depth=.18,sides=8):
    # A genuine open ring in the XZ plane; thickness is radial, depth is Y.
    x,y,z=center;v=[]
    for yy,rad in [(y-depth/2,radius),(y+depth/2,radius),(y+depth/2,radius-thick),(y-depth/2,radius-thick)]:
        for i in range(sides):
            a=(i+.5)*2*math.pi/sides;v.append((x+math.cos(a)*rad,yy,z+math.sin(a)*rad))
    f=[]
    for ring in range(4):
        nex=(ring+1)%4
        for i in range(sides):f.append((ring*sides+i,ring*sides+(i+1)%sides,nex*sides+(i+1)%sides,nex*sides+i))
    return adopt(mesh(name,v,f,mat,'01_CHASSIS',.011))
def core(x=0,z=0,r=.09,y=-.59):
    oct_ring_front('CORE | machined hex bezel',(x,y,z),r*1.58,r*.40,'steel',.09,6)
    plate('CORE | recessed dark surround',chamfer(x,z,r*2.35,r*2.35,r*.45),y+.013,.08,'black',.007)
    plate('CORE | small cyan cell',[(x+math.cos((i+.5)*math.pi/3)*r,z+math.sin((i+.5)*math.pi/3)*r) for i in range(6)],y-.044,.055,'cyan',.005)
    mark('core',(x,y-.075,z));mark('core_radius',(x,y-.075,z+r))
def nozzle(name,x,y,z,r=.19):
    axis_ring(name+' | inner graphite barrel',[x-.67,x-.48,x-.18],[r*.72,r*1.20,r*.98],y,z,'frame')
    axis_ring(name+' | pearl segmented cowl',[x-.48,x-.34,x-.15],[r*1.05,r*1.33,r*1.1],y,z,'pearl')
    axis_ring(name+' | hollow bell',[x-.21,x,x,x-.26],[r*.96,r*1.06,r*.73,r*.55],y,z,'steel',cap_start=False,cap_end=False)
    axis_ring(name+' | black cavity',[x-.245,x-.24],[r*.57,r*.57],y,z,'black')
    axis_ring(name+' | recessed energy rim',[x-.21,x-.20,x-.20,x-.21],[r*.63,r*.64,r*.48,r*.48],y,z,'cyan',cap_start=False,cap_end=False)
    mark('nozzle_'+name,(x+.025,y,z))
def gun(name,tip,y,z,length=.72,r=.075,armor=True):
    axis_ring(name+' | receiver',[tip+length,tip+length*.70,tip+.18],[r*1.4,r*1.2,r*.88],y,z,'steel','04_WEAPON')
    axis_ring(name+' | hollow muzzle',[tip+.14,tip,tip,tip+.095],[r*1.12,r*1.26,r*.72,r*.66],y,z,'frame','04_WEAPON',False,False)
    axis_ring(name+' | bore',[tip+.09,tip+.094],[r*.67,r*.67],y,z,'black','04_WEAPON')
    if armor:
        plate(name+' | angled barrel shroud',[(tip+.09,z+r*.95),(tip+length*.85,z+r*1.55),(tip+length,z+r*.7),(tip+length*.72,z-r*.95),(tip+.22,z-r*.90)],y-.07,.10,'pearl',.009)
    mark('muzzle_'+name,(tip-.027,y,z));mark('direction_'+name,(tip-.227,y,z))
def blade(name,poly,y=-.25,mat='blue',thick=.11):
    return plate(name,poly,y,thick,mat,.014)
def vent_bank(name,x,z,y=-.61,count=3,span=.6):
    plate(name+' | black recessed duct',chamfer(x,z,span+.13,.22,.045),y,.03,'black',.004)
    for i in range(count):
        xx=x-span/2+(i+.5)*span/count
        plate(name+f' | vane {i}',[(xx-.035,z-.083),(xx+.021,z-.083),(xx+.058,z+.073),(xx+.002,z+.073)],y-.025,.028,'steel',.003)
def light_strip(name,x,z,length=.23,y=-.62):
    plate(name,[(x-length/2,z-.016),(x+length/2,z-.016),(x+length/2+.025,z+.018),(x-length/2+.025,z+.018)],y,.022,'cyan',.002)
def structural_spoke(name,cx,cz,angle,r0,r1,width=.095,y=-.03):
    # Solid load-bearing radial beam behind the open ring, not a floating core.
    u=Vector((math.cos(angle),math.sin(angle)));v=Vector((-u.y,u.x))
    points=[]
    for r,side in [(r0,-1),(r1,-1),(r1,1),(r0,1)]:
        p=Vector((cx,cz))+u*r+v*(side*width/2);points.append(tuple(p))
    return plate(name,points,y,.20,'steel',.009)
def setup(role):
    global M,cols,root,PARENT,MOVES
    bpy.ops.wm.open_mainfile(filepath=opt.base)
    for o in list(bpy.data.objects):
        if o.type not in {'LIGHT','CAMERA'}:bpy.data.objects.remove(o,do_unlink=True)
    cols={c.name:c for c in bpy.data.collections}
    for n in ['01_CHASSIS','02_ARMOR','03_PROPULSION','04_WEAPON','05_STABILIZERS','06_ANCHORS']:
        if n not in cols:
            c=bpy.data.collections.new(n);bpy.context.scene.collection.children.link(c);cols[n]=c
    names={'pearl':'Armor | cool pearl ceramic','light':'Armor | leading bevel silver','slate':'Armor | blue grey secondary','blue':'Stabilizers | deep cobalt enamel','frame':'Frame | graphite titanium','steel':'Mechanics | machined titanium','black':'Cavities | black ceramic','cyan':'Status | restrained cyan'}
    M={k:bpy.data.materials[v] for k,v in names.items()}
    root=bpy.data.objects.new(role.upper()+'_ROOT | fixed pivot',None);cols['01_CHASSIS'].objects.link(root);PARENT=root;MOVES=[]
    s=bpy.context.scene;s.frame_set(1);s.render.resolution_x=opt.resolution;s.render.resolution_y=opt.resolution;s.cycles.samples=opt.samples;s.cycles.use_denoising=False
    s['asset_id']=role;s['production']='Native editable 3D mesh family; approved INT-01 camera/materials inherited'
    s['source_art']='Actual Blender mesh generation and Cycles rendering, no generated image source'
    return s

# FAMILY A: compact angular frames and radial nodes.
def build_drone(variant):
    if variant=='dragonfly':
        solid('DRONE | horizontal core suspension',(0,.02,0),(1.72,.27,.14),'steel')
        solid('DRONE | vertical core suspension',(0,.02,0),(.14,.27,1.72),'steel')
        oct_ring_front('DRONE | diamond outer chassis',(0,0,0),1.23,.20,'frame',.44,4)
        oct_ring_front('DRONE | cobalt inner rim',(0,-.275,0),.94,.105,'blue',.12,4)
        # Four corner cartridges with open quadrants, not a solid box.
        for i,(x,z) in enumerate([(-.77,0),(0,.77),(.77,0),(0,-.77)]):
            angle=i*math.pi/2
            poly=[(-.48,-.19),(.24,-.29),(.41,-.06),(.21,.22),(-.45,.19)]
            pp=[(x+px*math.cos(angle)-pz*math.sin(angle),z+px*math.sin(angle)+pz*math.cos(angle)) for px,pz in poly]
            plate(f'DRONE | cartridge armor {i}',pp,-.30,.27,'pearl')
        solid('DRONE | central frame',(0,0,0),(.55,.58,.55),'frame')
        core(0,0,.09,-.38);gun('primary',-1.52,-.05,0,.70,.071,False)
        nozzle('aft',1.43,.05,0,.14)
        light_strip('DRONE | upper status',.01,.68,.15,-.48)
    else:
        for i in range(3):structural_spoke(f'NODE | core support {i}',0,0,math.pi/6+i*2*math.pi/3,.10,1.14,.11,.03)
        oct_ring_front('NODE | articulated octagonal cage',(0,0,0),1.35,.22,'frame',.56,8)
        oct_ring_front('NODE | recessed cobalt rim',(0,-.32,0),1.06,.17,'blue',.12,8)
        for i in range(8):
            a=(i+.5)*math.pi/4;x=math.cos(a)*1.12;z=math.sin(a)*1.12
            group(f'NODE | radial armor {i}',move=(math.cos(a)*.20,0,math.sin(a)*.20))
            p=[(-.24,-.15),(.22,-.19),(.29,.06),(.05,.26),(-.23,.13)]
            pp=[(x+px*math.cos(a)-pz*math.sin(a),z+px*math.sin(a)+pz*math.cos(a)) for px,pz in p]
            plate(f'NODE | octagonal segment {i}',pp,-.36,.29,'pearl');ungroup()
        for i,z in enumerate([-.63,0,.63]):gun(f'left_{i}',-1.37 if i!=1 else -1.59,-.12,z,.56,.065,False)
        core(0,0,.11,-.38);nozzle('upper',1.23,.12,.50,.13);nozzle('lower',1.23,.12,-.50,.13)

# FAMILY B: narrow spears and split-arm skimmers, with no copied player geometry.
def build_skimmer(variant):
    if variant=='wasp':
        plate('WASP | long dark spear spine',[(-2.10,.015),(-.77,.30),(.70,.27),(1.33,0),(.57,-.25),(-.93,-.15)],0,.55,'frame')
        for s in [-1,1]:
            blade(f'WASP | swept attack foil {s}',[(-1.40,s*.04),(-.43,s*.53),(1.43,s*.72),(.69,s*.10)],-.23,'blue',.16)
            plate(f'WASP | foil armored edge {s}',[(-1.29,s*.04),(-.37,s*.41),(1.15,s*.57),(.58,s*.25)],-.34,.12,'pearl')
        plate('WASP | needle nose cap',[(-2.14,.00),(-.59,.27),(-.05,.06),(-.96,-.10)],-.34,.18,'pearl')
        vent_bank('WASP | cooling',.26,.015,-.48,4,.68)
        core(.30,-.06,.067,-.55)
        gun('primary',-2.16,-.03,-.075,.78,.056,False)
        nozzle('upper',1.55,.03,.36,.17);nozzle('lower',1.55,.03,-.36,.17)
        group('WASP | translating rear splitter',move=(.14,0,.12))
        blade('WASP | upper rear blade',[(.33,.39),(1.13,.89),(1.55,.76),(.88,.25)],.14,'blue',.11);ungroup()
    else:
        plate('MANTIS | compact central mechanical spine',[(-.97,.14),(-.22,.36),(1.00,.29),(1.52,0),(.80,-.32),(-.72,-.23)],0,.65,'frame')
        for s in [-1,1]:
            group(f'MANTIS | articulated blade arm {s}',move=(-.08,0,s*.19))
            blade(f'MANTIS | cobalt hooked arm {s}',[(-1.90,s*.72),(-.84,s*.94),(.42,s*.45),(.38,s*.23),(-.95,s*.52)],-.26,'blue',.24)
            plate(f'MANTIS | silver scythe leading edge {s}',[(-1.91,s*.72),(-.83,s*.87),(.24,s*.45),(-.21,s*.45),(-1.02,s*.63)],-.42,.07,'pearl')
            gun(f'arm_{s}',-1.95,-.21,s*.68,.58,.057,False);ungroup()
        plate('MANTIS | shoulder armor',[(-.45,.32),(.61,.47),(1.19,.19),(.69,-.06),(-.15,.00)],-.35,.24,'pearl')
        vent_bank('MANTIS | flank vent',.37,.13,-.49,4,.6);core(.05,-.16,.085,-.42)
        nozzle('center',1.63,.06,0,.27)
        blade('MANTIS | tail underside',[(.58,-.29),(1.3,-.73),(1.59,-.55),(1.07,-.17)],.2,'blue',.12)

# FAMILY C: broad armor, mechanically separated firing lanes.
def build_pressure(variant):
    tall=variant=='ray'; zz=.87 if tall else .54
    plate('PRESSURE | stepped central chassis',chamfer(.15,0,2.32,1.13,.27),0,.78,'frame')
    for s in [-1,1]:
        group(f'PRESSURE | opening cannon shoulder {s}',move=(0,0,s*(.22 if tall else .18)))
        poly=[(-1.32,s*(zz-.05)),(-.81,s*(zz+.35)),(.82,s*(zz+.33)),(1.32,s*(zz+.03)),(.86,s*(zz-.24)),(-.75,s*(zz-.23))]
        plate(f'PRESSURE | main shoulder armor {s}',poly,-.30,.44,'pearl')
        blade(f'PRESSURE | cobalt outer skirt {s}',[(-.80,s*(zz+.31)),(.85,s*(zz+.30)),(1.27,s*(zz+.06)),(.99,s*(zz+.48)),(-.10,s*(zz+.52))],.03,'blue',.18)
        vent_bank(f'PRESSURE | shoulder vents {s}',.21,s*zz,-.553,4,.79)
        gun(f'lane_{s}',-1.74,-.08,s*zz,.79,.105 if tall else .14)
        nozzle(f'lane_{s}',1.58,.10,s*zz,.18);ungroup()
    plate('PRESSURE | central breastplate',chamfer(.06,0,1.41,.63,.18),-.49,.18,'slate')
    core(-.20,0,.105,-.63)
    if not tall:
        blade('PRESSURE | dorsal command fin',[(.05,.76),(.67,1.19),(1.20,1.05),(.92,.55)],.2,'blue',.16)
    light_strip('PRESSURE | lower status',.40,-.14,.29,-.61)

# FAMILY D: segmented rail structures and long artillery.
def build_spine(variant):
    if variant=='worm':
        solid('SPINE | continuous articulated backbone',(.04,.05,0),(3.91,.33,.22),'steel')
        for i,x in enumerate([-1.39,-.50,.39,1.28]):
            z=(.08 if i%2 else -.06)
            group(f'SPINE | jointed armor segment {i}',move=(0,0,(1 if i%2 else -1)*.08))
            plate(f'SPINE | segment {i} dark carrier',chamfer(x,z,.86,.71,.15),0,.67,'frame')
            plate(f'SPINE | segment {i} pearl upper',[(x-.44,z+.19),(x-.15,z+.45),(x+.36,z+.34),(x+.43,z+.05),(x-.23,z+.08)],-.31,.24,'pearl')
            blade(f'SPINE | segment {i} cobalt keel',[(x-.28,z-.24),(x+.34,z-.21),(x+.23,z-.52),(x-.33,z-.38)],-.13,'blue',.29)
            vent_bank(f'SPINE | vent {i}',x+.06,z+.17,-.46,3,.39)
            if i<3:gun(f'segment_{i}',x-.50,-.41,z-.16,.48,.065,False)
            ungroup()
        core(-.46,.08,.080,-.57);nozzle('aft',1.95,.02,0,.22)
    else:
        plate('NEEDLE | power receiver',chamfer(.82,.015,1.83,1.03,.24),0,.69,'frame')
        plate('NEEDLE | pearl energy block',[(.10,.37),(.61,.59),(1.49,.36),(1.53,-.12),(.89,-.28),(.25,-.04)],-.39,.28,'pearl')
        blade('NEEDLE | cobalt aft heat wing',[(.84,.47),(1.57,.96),(1.76,.85),(1.46,.11)],.11,'blue',.12)
        blade('NEEDLE | lower reactor stabilizer',[(.21,-.39),(1.44,-.57),(1.66,-.22),(.90,-.18)],-.03,'blue',.19)
        vent_bank('NEEDLE | power block vents',.95,.15,-.57,5,.77)
        group('NEEDLE | recoil rail carriage',move=(.18,0,0))
        gun('rail',-2.20,-.01,-.07,2.00,.084)
        for z in [-.24,.14]:
            plate('NEEDLE | long rail cover '+str(z),[(-2.00,z),(-.29,z+.04),(.06,z+.12),(-.32,z+.21),(-1.62,z+.12)],-.11,.15,'slate',.010)
        ungroup()
        core(.22,.055,.09,-.59);nozzle('reactor',1.96,.04,-.04,.24)
        light_strip('NEEDLE | charge strip',-.33,.20,.32,-.25)

# Boss mechanisms reuse the same armor/nozzle/rail vocabulary with different
# visible structure and firing layouts. The cyan core stays a small target.
def build_warden():
    plate('WARDEN | assault center chassis',chamfer(.13,0,2.25,1.70,.37),0,.95,'frame')
    oct_ring_front('WARDEN | mechanical core cradle',(-.13,-.53,0),.55,.15,'steel',.19,8)
    core(-.13,0,.18,-.67)
    for s in [-1,1]:
        group(f'WARDEN | sliding armored jaw {s}',move=(.10,0,s*.35))
        plate(f'WARDEN | inner core shield {s}',[(-.71,s*-.024),(-.83,s*.36),(-.30,s*.72),(.69,s*.55),(.86,s*.10),(.34,s*-.024)],-.76,.23,'pearl')
        blade(f'WARDEN | cobalt shield inset {s}',[(-.30,s*.64),(.65,s*.51),(.78,s*.25),(.14,s*.31)],-.90,'blue',.06)
        ungroup()
        plate(f'WARDEN | armored assault shoulder {s}',[(-1.43,s*.61),(-.92,s*1.22),(.75,s*1.28),(1.32,s*.91),(.87,s*.60),(-.25,s*.48)],-.17,.64,'pearl')
        blade(f'WARDEN | heavy rear shoulder skirt {s}',[(.35,s*1.10),(1.28,s*1.02),(1.77,s*.48),(.89,s*.60)],.12,'blue',.35)
        vent_bank(f'WARDEN | shoulder cooling {s}',.13,s*.85,-.52,5,1.01)
        gun(f'assault_{s}',-1.98,-.08,s*.75,1.15,.13)
        nozzle(f'assault_{s}',1.87,.16,s*.67,.26)
        light_strip(f'WARDEN | status {s}',.63,s*.59,.25,-.64)

def build_carrier():
    solid('CARRIER | load-bearing central keel',(.25,.16,0),(3.39,.54,.35),'steel')
    plate('CARRIER | rear command bridge',[(.45,.50),(1.24,.42),(1.57,0),(1.18,-.42),(.40,-.47),(.67,-.11)],-.22,.77,'frame')
    core(.95,0,.14,-.67)
    for s in [-1,1]:
        z=s*.77
        plate(f'CARRIER | long hangar hull {s}',[(-1.79,z-s*.22),(-1.51,z+s*.43),(1.18,z+s*.34),(1.61,z),(1.30,z-s*.29),(-1.43,z-s*.23)],0,.90,'frame')
        plate(f'CARRIER | pearlescent upper belt {s}',[(-1.71,z+s*.24),(-1.42,z+s*.44),(1.20,z+s*.36),(1.51,z+s*.14),(.70,z+s*.18),(-.95,z+s*.23)],-.45,.19,'pearl')
        blade(f'CARRIER | cobalt outer spine {s}',[(-1.14,z+s*.42),(.36,z+s*.47),(1.47,z+s*.20),(1.24,z+s*.64),(-.49,z+s*.63)],.15,'blue',.23)
        plate(f'CARRIER | dark recessed bay {s}',chamfer(-.30,z,2.1,.43,.11),-.485,.035,'black',.006)
        # Three physically modeled docked microframes visible when door slides.
        for j,x in enumerate([-.93,-.32,.29]):
            plate(f'CARRIER | docked microframe {s} {j}',[(x-.20,z),(x,z+.13),(x+.19,z),(x,z-.13)],-.51,.11,'steel',.008)
            plate(f'CARRIER | drone pearl plate {s} {j}',[(x-.17,z+.01),(x-.025,z+.115),(x+.16,z+.018),(x+.012,z+.045)],-.59,.035,'pearl',.004)
            light_strip(f'CARRIER | bay latch {s} {j}',x,z-.08,.09,-.59)
        group(f'CARRIER | translating hangar door {s}',move=(.07,0,s*.44))
        plate(f'CARRIER | split hangar hatch {s}',[(-1.48,z-.24),(.82,z-.22),(1.09,z),(.77,z+.22),(-1.48,z+.24)],-.66,.13,'pearl')
        blade(f'CARRIER | door cobalt band {s}',[(-1.24,z-.15),(.58,z-.13),(.84,z-.02),(.41,z+.04),(-1.23,z-.02)],-.744,'blue',.022)
        ungroup()
        gun(f'defense_{s}',-2.07,.10,s*1.10,.69,.095)
        nozzle(f'bay_{s}',2.02,.07,z,.25)
    # The small central weakpoint cover retracts with the hangar mechanism.
    group('CARRIER | bridge core cover',move=(.30,0,.34))
    plate('CARRIER | small bridge shutter',chamfer(.95,0,.54,.49,.10),-.81,.14,'slate');ungroup()

def build_lancer():
    plate('LANCER | long strike backbone',[(-1.14,.20),(.12,.48),(1.33,.29),(1.68,0),(1.18,-.36),(-.92,-.21)],0,.82,'frame')
    plate('LANCER | rear reactor housing',[(.05,.45),(.47,.65),(1.30,.40),(1.51,.09),(.77,.12)],-.44,.29,'pearl')
    plate('LANCER | lower reactor housing',[(.01,-.27),(.81,-.47),(1.46,-.20),(1.34,.00),(.68,-.02)],-.43,.25,'slate')
    vent_bank('LANCER | reactor cooling',.64,.30,-.625,5,.86)
    core(.10,0,.16,-.60)
    for s in [-1,1]:
        group(f'LANCER | split lance shroud {s}',move=(-.17,0,s*.25))
        blade(f'LANCER | long cobalt strike rail {s}',[(-2.04,s*.20),(-1.50,s*.45),(.08,s*.31),(.41,s*.12),(-.53,s*.08)],-.03,'blue',.31)
        plate(f'LANCER | spear-edge armor {s}',[(-2.08,s*.19),(-1.48,s*.37),(-.05,s*.25),(.24,s*.11),(-.71,s*.10)],-.27,.11,'pearl',.011)
        plate(f'LANCER | reactor sliding shutter {s}',[(-.28,s*-.024),(-.27,s*.29),(.36,s*.33),(.60,s*-.024)],-.77,.16,'pearl')
        ungroup()
        blade(f'LANCER | aft thrust vane {s}',[(.52,s*.52),(1.52,s*.96),(1.77,s*.74),(1.00,s*.34)],.19,'blue',.21)
        nozzle(f'outer_{s}',1.94,.12,s*.53,.21)
    group('LANCER | extending central lance',move=(-.13,0,0))
    gun('lance',-2.18,-.04,0,2.36,.09);ungroup()
    nozzle('reactor',1.97,-.12,0,.18)

def build_bastion():
    plate('BASTION | heavy central citadel',chamfer(.15,0,2.42,2.33,.45),.12,.90,'frame')
    plate('BASTION | rear armored spine',[(.58,-1.29),(1.42,-.89),(1.72,-.06),(1.33,.89),(.60,1.27),(.89,.21)],.15,.72,'blue')
    oct_ring_front('BASTION | central armored core socket',(.01,-.45,0),.47,.13,'steel',.22)
    core(.01,0,.17,-.63)
    for s in [-1,1]:
        group(f'BASTION | separating central shutter {s}',move=(.12,0,s*.36))
        plate(f'BASTION | command shield {s}',[(-.76,s*-.024),(-.86,s*.49),(-.11,s*.68),(.81,s*.40),(.72,s*-.024)],-.81,.20,'pearl')
        blade(f'BASTION | cobalt shield stripe {s}',[(-.48,s*.40),(.34,s*.39),(.66,s*.22),(.42,s*.14),(-.28,s*.23)],-.92,'blue',.03)
        ungroup()
        group(f'BASTION | deploying artillery shoulder {s}',move=(-.20,0,s*.13))
        plate(f'BASTION | massive shoulder shell {s}',[(-1.11,s*.73),(-.81,s*1.42),(.56,s*1.49),(1.16,s*1.03),(.78,s*.66),(-.50,s*.60)],-.30,.69,'pearl')
        vent_bank(f'BASTION | shoulder vent bank {s}',.09,s*1.05,-.69,5,.87)
        for j,y in enumerate([-.15,.24]):gun(f'battery_{s}_{j}',-1.79,y,s*1.13+(j-.5)*.11,.84,.105)
        ungroup()
        nozzle(f'fortress_{s}',1.81,.27,s*.87,.29)
        light_strip(f'BASTION | lower shoulder indicator {s}',.50,s*.63,.30,-.70)

def build_apex():
    # A radial mechanical cage with separated pointed petals and one small core.
    oct_ring_front('APEX | radial structural halo',(.18,.08,0),1.46,.25,'frame',.64,8)
    oct_ring_front('APEX | inner cobalt retaining ring',(.18,-.29,0),1.00,.16,'blue',.12,8)
    oct_ring_front('APEX | small exposed core socket',(.18,-.37,0),.36,.10,'steel',.21,8)
    core(.18,0,.15,-.52)
    for i in range(6):structural_spoke(f'APEX | radial load beam {i}',.18,0,math.pi/6+i*math.pi/3,.28,1.37,.105,.01)
    for i in range(6):
        a=math.pi/6+i*math.pi/3;cx=.18+math.cos(a)*.83;cz=math.sin(a)*.83
        group(f'APEX | radial petal carriage {i}',move=(math.cos(a)*.30,0,math.sin(a)*.30))
        poly=[(-.12,-.40),(.59,-.26),(.80,.03),(.29,.41),(-.15,.32),(-.33,.02)]
        pp=[(cx+px*math.cos(a)-pz*math.sin(a),cz+px*math.sin(a)+pz*math.cos(a)) for px,pz in poly]
        plate(f'APEX | angled radial petal {i}',pp,-.40,.40,'pearl')
        inner=[(.08,-.22),(.55,-.13),(.62,.025),(.19,.28),(.07,.13)]
        qq=[(cx+px*math.cos(a)-pz*math.sin(a),cz+px*math.sin(a)+pz*math.cos(a)) for px,pz in inner]
        blade(f'APEX | petal cobalt inlay {i}',qq,-.637,'blue',.034)
        ungroup()
    for s in [-1,1]:
        group(f'APEX | retracting core cage {s}',move=(s*.46,0,0))
        plate(f'APEX | central core shutter {s}',[(.18+s*-.024,-.34),(.18+s*.36,-.23),(.18+s*.45,.05),(.18+s*.26,.34),(.18+s*-.024,.32)],-.74,.17,'slate')
        ungroup()
        gun(f'front_{s}',-1.91,-.02,s*.70,.62,.097)
        nozzle(f'halo_{s}',1.90,.20,s*.56,.19)
    gun('axis',-1.94,.11,0,.52,.11,False)

ROLE_SPECS={
 'dragonfly':{'width':88,'family':'angular-frame','builder':lambda:build_drone('dragonfly'),'states':['neutral'],'mechanism':'Runtime root rotation; all anchors rotate through the sprite transform. Physical square frame.'},
 'orb':{'width':82,'family':'angular-frame','builder':lambda:build_drone('orb'),'states':['neutral','open'],'mechanism':'Eight radial armor segments translate outwards; three visible left-facing ports.'},
 'wasp':{'width':76,'family':'split-skimmer','builder':lambda:build_skimmer('wasp'),'states':['neutral'],'mechanism':'Fast spear/skimmer with narrow swept foils and twin propulsion.'},
 'mantis':{'width':96,'family':'split-skimmer','builder':lambda:build_skimmer('mantis'),'states':['neutral','open'],'mechanism':'Twin hooked arms physically translate outward, carrying their gun anchors.'},
 'claw':{'width':108,'family':'pressurecraft','builder':lambda:build_pressure('claw'),'states':['neutral','open'],'mechanism':'Two armored cannon shoulders separate vertically.'},
 'ray':{'width':118,'family':'pressurecraft','builder':lambda:build_pressure('ray'),'states':['neutral','open'],'mechanism':'Separated upper/lower pressure lanes with a readable center gap.'},
 'worm':{'width':170,'family':'artillery-spine','builder':lambda:build_spine('worm'),'states':['neutral'],'mechanism':'Four modeled armor segments and three independent visible ports.'},
 'needle':{'width':112,'family':'artillery-spine','builder':lambda:build_spine('needle'),'states':['neutral','open'],'mechanism':'Physical rail recoil; open is mechanically recoiled/recovery pose, not core availability.'},
 'warden':{'width':340,'family':'pressurecraft-boss','builder':build_warden,'states':['neutral','open'],'mechanism':'Two central armored jaws separate to expose a small core; heavy paired assault cannons.'},
 'carrier':{'width':300,'family':'pressurecraft-boss','builder':build_carrier,'states':['neutral','open'],'mechanism':'Two long hangar doors slide away to expose modeled docked drone frames; bridge shutter opens.'},
 'lancer':{'width':360,'family':'artillery-spine-boss','builder':build_lancer,'states':['neutral','open'],'mechanism':'Long lance extends while split strike rails separate and core shutters uncover the reactor cell.'},
 'bastion':{'width':300,'family':'pressurecraft-boss','builder':build_bastion,'states':['neutral','open'],'mechanism':'Four cannon battery barrels extend with two shoulder units; command shutters open.'},
 'apex':{'width':340,'family':'angular-frame-boss','builder':build_apex,'states':['neutral','open'],'mechanism':'Six mechanical petal carriages translate radially; center cage slides apart around a small core.'},
}

def state_pose(opened):
    frame=21 if opened else 1
    for g,p,delta,rot in MOVES:
        g.location=p+delta*opened;g.rotation_euler=rot*opened
        g.keyframe_insert(data_path='location',frame=frame);g.keyframe_insert(data_path='rotation_euler',frame=frame)
    bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
def project_world(v):
    s=bpy.context.scene;q=world_to_camera_view(s,s.camera,Vector(v))
    return [round(q.x*opt.resolution,4),round((1-q.y)*opt.resolution,4)]
def anchor_state():
    anchors={o.name.replace('ANCHOR_',''):{'world':[round(float(v),6) for v in o.matrix_world.translation],'pixels':project_world(o.matrix_world.translation)} for o in cols['06_ANCHORS'].objects}
    mu=[(k,a) for k,a in anchors.items() if k.startswith('muzzle_')];no=[(k,a) for k,a in anchors.items() if k.startswith('nozzle_')]
    s=bpy.context.scene
    toward_camera=s.camera.matrix_world.to_quaternion()@Vector((0,0,1))
    corepoint=Vector(anchors['core']['world'])
    hit,location,normal,index,obj,matrix=s.ray_cast(bpy.context.evaluated_depsgraph_get(),corepoint+toward_camera*50,-toward_camera,distance=100)
    return {'muzzlesPixels':[a['pixels'] for k,a in mu],'muzzleIds':[k.replace('muzzle_','') for k,a in mu],'nozzlesPixels':[a['pixels'] for k,a in no],'nozzleIds':[k.replace('nozzle_','') for k,a in no],'corePixels':anchors['core']['pixels'],'coreRadiusPixels':round(math.dist(anchors['core']['pixels'],anchors['core_radius']['pixels']),4),'coreVisibleFromCamera':bool(hit and obj.name.startswith('CORE | small cyan cell')),'coreCameraRayFirstMesh':obj.name if hit else None,'projectedAnchors':anchors}
def render_role(role):
    start=time.time();spec=ROLE_SPECS[role];s=setup(role);spec['builder']();ungroup();mark('pivot',(0,0,0))
    state_pose(0);state_pose(1);state_pose(0)
    for obj in bpy.context.selected_objects:obj.select_set(False)
    root.select_set(True);bpy.context.view_layer.objects.active=root
    s.frame_start=1;s.frame_end=21;s.render.filepath=str(OUT/'renders'/f'{role}-neutral.png')
    source=OUT/'sources'/f'{role}.blend';bpy.ops.wm.save_as_mainfile(filepath=str(source))
    boss=role in ['warden','carrier','lancer','bastion','apex']
    manifest={'id':role,'version':1,'approvalStatus':'family-review-pending','provenance':'Actual 3D Blender meshes rendered in Cycles; no image-generated body assets','family':spec['family'],'width':opt.resolution,'height':opt.resolution,'format':'PNG','colorMode':'RGBA','imagePixelOrigin':'top-left','pivotPixels':[opt.resolution/2,opt.resolution/2],'displayWidth':spec['width'],'facing':'left','axes':{'forward':'-X','starboard':'+Y','up':'+Z'},'source':f'sources/{role}.blend','generator':'family_generator.py','mechanism':spec['mechanism'],'flameBaked':False,'camera':{'type':s.camera.data.type,'location':list(s.camera.location),'rotationEuler':list(s.camera.rotation_euler),'orthoScale':s.camera.data.ortho_scale,'inheritedFrom':'approved INT-01 representative','referenceMatch':'Visually reviewed; unavailable SV-01 numeric camera is not claimed'},'render':{'engine':'Cycles','device':'CPU','samples':opt.samples,'filmTransparent':True,'colorTransform':s.view_settings.view_transform,'look':s.view_settings.look,'exposure':s.view_settings.exposure,'denoising':False},'collisionSemantics':{'hull':'Existing runtime body collider remains authoritative; sprite alpha is not a new collision rule','core':'Small model-derived attachment marker; bonus damage only when runtime combat state explicitly enables it','coreExposedInArt':['open'] if boss else ['neutral','open'],'coreBonusPermission':'No new damage or multiplier rule authorized by this art manifest'},'states':{}}
    for state in spec['states']:
        opened=1 if state=='open' else 0;state_pose(opened);sm=anchor_state();fn=f'{role}-{state}.png';s.render.filepath=str(OUT/'renders'/fn)
        sm.update({'file':'renders/'+fn,'frame':21 if opened else 1,'stateProgress':opened,'coreExposed':bool(opened),'neutralBonusDamage':False,'weakpointActivation':'Never enable from artwork alone; authoritative runtime combat state controls bonus damage. Neutral always has no bonus.'})
        bpy.ops.render.render(write_still=True);sm['sha256']=hashlib.sha256((OUT/'renders'/fn).read_bytes()).hexdigest();manifest['states'][state]=sm
    manifest['geometry']={'meshObjects':len([o for o in bpy.data.objects if o.type=='MESH']),'vertices':sum(len(o.data.vertices) for o in bpy.data.objects if o.type=='MESH'),'mechanismGroups':len(MOVES)}
    manifest['sha256']={'blend':hashlib.sha256(source.read_bytes()).hexdigest(),'generator':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'approvedBaseBlend':hashlib.sha256(Path(opt.base).read_bytes()).hexdigest()}
    manifest['render']['elapsedSeconds']=round(time.time()-start,3)
    (OUT/(role+'-manifest.json')).write_text(json.dumps(manifest,indent=2))
    print('FAMILY_ROLE_COMPLETE',role,json.dumps({'seconds':manifest['render']['elapsedSeconds'],'states':len(spec['states']),'meshObjects':manifest['geometry']['meshObjects']}),flush=True)
    return manifest

if __name__=='__main__':
    for role in (opt.roles or list(ROLE_SPECS)):
        if role not in ROLE_SPECS:raise ValueError('Unknown role '+role)
        render_role(role)
    print('SKYWIND_FAMILY_BATCH_COMPLETE',flush=True)
