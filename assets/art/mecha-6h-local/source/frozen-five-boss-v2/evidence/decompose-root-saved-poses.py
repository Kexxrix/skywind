"""Exact local-source prism decomposition; no model save, render, or image edits."""
import bpy,bmesh,json,os,sys,hashlib,shutil,math
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
base=Path(sys.argv[sys.argv.index('--')+1]);out=Path(sys.argv[sys.argv.index('--')+2]);out.mkdir(exist_ok=True)
manifest=json.loads((base/'manifest-candidate.json').read_text());entry=manifest['entries'][0]
entry['key']=entry['key'].replace('full-v2','full-v3') if entry['roles'][0]=='bastion' else entry['key'].replace('full-v1','full-v2')
ledger={}
for p in base.iterdir():
 if p.suffix=='.blend' or p.name in {f['filename'] for f in entry['frames'].values()}:
  shutil.copy2(p,out/p.name);ledger[p.name]=hashlib.sha256(p.read_bytes()).hexdigest()
shutil.copy2(base/'generator.py',out/'source-generator-original.py');shutil.copy2(base/'production.json',out/'production-original.json')
def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
def area(p):return sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(p,p[1:]+p[:1]))*.5
def convex(p):return all(cross(p[i-1],p[i],p[(i+1)%len(p)])>=-1e-7 for i in range(len(p)))
def hull(points):
 pts=sorted(set(tuple(p) for p in points));lo=[];hi=[]
 for p in pts:
  while len(lo)>1 and cross(lo[-2],lo[-1],p)<=0:lo.pop()
  lo.append(p)
 for p in reversed(pts):
  while len(hi)>1 and cross(hi[-2],hi[-1],p)<=0:hi.pop()
  hi.append(p)
 return lo[:-1]+hi[:-1]
def cells(poly):
 if area(poly)<0:poly=list(reversed(poly))
 if convex(poly):return [poly]
 work=poly[:];tri=[]
 while len(work)>3:
  found=False
  for i in range(len(work)):
   a,b,c=work[i-1],work[i],work[(i+1)%len(work)]
   if cross(a,b,c)<=1e-9:continue
   others=[p for p in work if p not in [a,b,c]]
   if any(cross(a,b,p)>=-1e-8 and cross(b,c,p)>=-1e-8 and cross(c,a,p)>=-1e-8 for p in others):continue
   tri.append([a,b,c]);work.pop(i);found=True;break
  if not found:raise RuntimeError('earclip failed '+str(poly))
 tri.append(work)
 changed=True
 while changed:
  changed=False
  for i in range(len(tri)):
   for j in range(i+1,len(tri)):
    if len(set(tri[i])&set(tri[j]))<2:continue
    h=hull(tri[i]+tri[j])
    if abs(area(h)-area(tri[i])-area(tri[j]))<1e-6:
     tri[i]=h;tri.pop(j);changed=True;break
   if changed:break
 return tri

def clip(mesh,cell):
 bm=bmesh.new();bm.from_mesh(mesh)
 for a,b in zip(cell,cell[1:]+cell[:1]):
  dx,dz=b[0]-a[0],b[1]-a[1]
  ret=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=Vector((a[0],0,a[1])),plane_no=Vector((-dz,0,dx)),clear_inner=True,clear_outer=False)
 if not len(bm.faces):bm.free();return []
 pts=[v.co.copy() for v in bm.verts];bm.free();return pts
checks=[];poses={}
for state,old in entry['frames'].items():
 sourceState=old['sourceState'];pose=poses.get(sourceState)
 if pose is None:
  bpy.ops.wm.open_mainfile(filepath=str(out/('source-'+sourceState+'.blend')))
  scene=bpy.context.scene;cam=scene.camera;bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
  def project(v):
   q=world_to_camera_view(scene,cam,v);return (round(q.x*384,4),round((1-q.y)*384,4))
  hulls=[];names=[];split=[]
  for o in bpy.data.objects:
   if o.type!='MESH' or o.hide_render:continue
   ev=o.evaluated_get(deps);mesh=ev.to_mesh();cap=None
   candidates=[]
   for f in o.data.polygons:
    if len(f.vertices)>3 and abs(f.normal.y)>.999:
     poly=[(o.data.vertices[i].co.x,o.data.vertices[i].co.z) for i in f.vertices]
     candidates.append(poly)
   if candidates:
    poly=max(candidates,key=lambda v:abs(area(v)))
    xz=[(v.co.x,v.co.z) for v in o.data.vertices]
    if all(min(t[0] for t in poly)-1e-5<=x<=max(t[0] for t in poly)+1e-5 and min(t[1] for t in poly)-1e-5<=z<=max(t[1] for t in poly)+1e-5 for x,z in xz):
     cap=cells(poly)
   if cap is not None and len(cap)>1:
    split.append({'name':o.name,'cells':len(cap)})
    for i,c in enumerate(cap):
     pp=[project(o.matrix_world@v) for v in clip(mesh,c)];h=hull(pp)
     if len(h)>2:hulls.append([{'x':x,'y':y} for x,y in h]);names.append(o.name+' exact convex cell '+str(i))
   else:
    h=hull([project(o.matrix_world@v.co) for v in mesh.vertices])
    if len(h)>2:hulls.append([{'x':x,'y':y} for x,y in h]);names.append(o.name)
   ev.to_mesh_clear()
  pose={'bodyHullPixels':hulls,'bodyHullComponentNames':names};poses[sourceState]=pose;checks.append({'sourceState':sourceState,'componentCount':len(hulls),'splitMeshes':split})
 old.update(pose)
json.dump(manifest,open(out/'manifest-candidate.json','w'),indent=2)
assert all(hashlib.sha256((out/n).read_bytes()).hexdigest()==h for n,h in ledger.items())
json.dump({'method':'earclip original local prism XZ cap, merge adjacent cells iff union convex, clip exact evaluated geometry in local cells and project source camera','sourcePNGByteMismatch':0,'sourceResaved':False,'rendered':False,'sourceByteLedger':ledger,'poses':checks},open(out/'CONVEX_DECOMPOSITION_RECEIPT.json','w'),indent=2)
print('DONE',entry['key'],[c['componentCount'] for c in checks])
