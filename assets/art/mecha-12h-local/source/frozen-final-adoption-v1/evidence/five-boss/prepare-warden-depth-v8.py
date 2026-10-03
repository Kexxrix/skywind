from pathlib import Path
import difflib
p=Path(__file__).parent
old=(p/'warden_structure_v7_generator.py').read_text()
s=old.replace('warden-structure-v7','warden-depth-v8').replace('local-v7-warden-structure','local-v8-warden-depth')
a=s.index(' # The core is an actual recessed lens')
b=s.index('\ncore.hide_render=True',a)
structure=''' # Oblique reactor cradle: front mouth and aft housing have visible parallax.
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
'''
s=s[:a]+structure+s[b:]
compile(s,'warden_depth_v8_generator.py','exec')
(p/'warden_depth_v8_generator.py').write_text(s)
(p/'WARDEN_DEPTH_V8.diff').write_text(''.join(difflib.unified_diff(old.splitlines(True),s.splitlines(True),fromfile='warden_structure_v7_generator.py',tofile='warden_depth_v8_generator.py')))

