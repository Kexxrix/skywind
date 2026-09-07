"""Render original near-camera palm geometry with Blender, preserving interactive scenes.
Run: blender --background --factory-startup --python tools/render_foliage.py
"""
import bpy, math, random
from mathutils import Vector
from pathlib import Path

random.seed(739)
ROOT = Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, roughness=.48):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    return m

leaves = [material('Emerald '+str(i), c) for i,c in enumerate([
    (.15,.27,.025),(.24,.36,.038),(.085,.19,.018),(.32,.42,.065),(.07,.14,.025)])]
bark = material('Palm bark',(.18,.12,.055),.85)
verts, faces, materials = [], [], []

def blade(a, b, width, mat):
    """Folded tapered leaflet, with a lit ridge and a shadowed underside."""
    a,b=Vector(a),Vector(b)
    d=b-a
    n=Vector((-d.y,d.x,0)).normalized()*width
    mid=a+d*.48
    k=len(verts)
    verts.extend([a,mid+n,mid+Vector((0,0,width*.25)),mid-n,b])
    faces.extend([(k,k+1,k+2),(k+1,k+4,k+2),(k,k+2,k+3),(k+2,k+4,k+3)])
    materials.extend([mat]*4)

for tree in range(21):
    x=-15+(tree%7)*5+random.uniform(-1.1,1.1)
    y=(tree//7)*3+random.uniform(-.8,.8)
    h=random.uniform(3.5,7.8)
    root=Vector((x,y,-1.5))
    crown=Vector((x+random.uniform(-.4,.4),y,h))
    axis=crown-root
    bpy.ops.mesh.primitive_cone_add(vertices=9, radius1=.15, radius2=.055, depth=axis.length, location=(root+crown)/2)
    trunk=bpy.context.object
    trunk.rotation_euler=axis.to_track_quat('Z','Y').to_euler()
    trunk.data.materials.append(bark)
    for frond in range(15):
        angle=frond*math.tau/15+random.uniform(-.15,.15)
        length=random.uniform(2.6,4.8)
        along=Vector((math.cos(angle),math.sin(angle),0))
        side=Vector((-math.sin(angle),math.cos(angle),0))
        lift=random.uniform(.35,1.4)
        def point(t):
            return crown+along*(t*length)+Vector((0,0,math.sin(t*math.pi)*lift-t*t*1.4))
        for j in range(28):
            t=.07+j*.031
            base=point(t)
            spread=math.sin(t*math.pi)**.7*length*.24
            for sign in [-1,1]:
                end=base+side*spread*sign+along*length*.17+Vector((0,0,-spread*.35))
                blade(base,end,.048+spread*.036,random.randrange(len(leaves)))
        for j in range(14):
            blade(point(j/14),point((j+1)/14),.022,1)

mesh=bpy.data.meshes.new('Folded palm leaflets')
mesh.from_pydata(verts,[],faces)
mesh.update()
obj=bpy.data.objects.new('Twenty one original layered palms',mesh)
bpy.context.collection.objects.link(obj)
for m in leaves: mesh.materials.append(m)
for p,m in zip(mesh.polygons,materials): p.material_index=m

world=bpy.data.worlds.new('Blue skylight')
bpy.context.scene.world=world
world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.25,.40,.65,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.55
bpy.ops.object.light_add(type='SUN', location=(5,-10,15))
sun=bpy.context.object
sun.rotation_euler=(math.radians(25),math.radians(-30),math.radians(-25))
sun.data.energy=3.0
sun.data.angle=.12
bpy.ops.object.camera_add(location=(0,-27,14))
camera=bpy.context.object
camera.rotation_euler=(Vector((0,2,3.4))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'
camera.data.ortho_scale=31
scene=bpy.context.scene
scene.camera=camera
scene.render.engine='CYCLES'
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x=2048
scene.render.resolution_y=1024
scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='AgX'
scene.render.filepath=str(ROOT/'assets/art/palms-blender-v2.png')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/art/palms-v2.blend'))
bpy.ops.render.render(write_still=True)
