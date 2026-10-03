"""Convex decomposition of authored prism XZ sections; no geometry edits."""
def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
def area(poly):return abs(sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(poly,poly[1:]+poly[:1])))/2
def hull(poly):
 pts=sorted(set(map(tuple,poly)));lo=[];hi=[]
 for p in pts:
  while len(lo)>1 and cross(lo[-2],lo[-1],p)<=1e-9:lo.pop()
  lo.append(p)
 for p in reversed(pts):
  while len(hi)>1 and cross(hi[-2],hi[-1],p)<=1e-9:hi.pop()
  hi.append(p)
 return lo[:-1]+hi[:-1]
def contains(p,a,b,c):return cross(a,b,p)>=-1e-9 and cross(b,c,p)>=-1e-9 and cross(c,a,p)>=-1e-9
def split_section(poly):
 poly=list(map(tuple,poly));signed=sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(poly,poly[1:]+poly[:1]));poly=poly if signed>0 else poly[::-1];remaining=poly[:];cells=[]
 while len(remaining)>3:
  for i,b in enumerate(remaining):
   a=remaining[i-1];c=remaining[(i+1)%len(remaining)]
   if cross(a,b,c)<=1e-9:continue
   if any(contains(p,a,b,c) for p in remaining if p not in (a,b,c)):continue
   cells.append([a,b,c]);remaining.pop(i);break
  else:raise ValueError('Invalid/degenerate authored section')
 cells.append(remaining)
 while True:
  merged=False
  for i in range(len(cells)):
   for j in range(i+1,len(cells)):
    if len(set(cells[i])&set(cells[j]))<2:continue
    h=hull(cells[i]+cells[j])
    if abs(area(h)-area(cells[i])-area(cells[j]))<1e-8:cells[i]=h;cells.pop(j);merged=True;break
   if merged:break
  if not merged:break
 assert abs(sum(area(c) for c in cells)-area(poly))<1e-8
 return cells

def evaluated_convex_cells(o,mesh,cells,clip_mesh,project,convex,bpy,Vector):
 """cells is the actual authored WORLD XZ section of this mesh, before bevel.
 Caller freezes/imports helpers and uses original saved-pose scene camera.
 Works for XZ-prism sections, not arbitrary curved/different-axis meshes.
 """
 original=mesh.copy();original.transform(o.matrix_world);result=[]
 for i,cell in enumerate(cells):
  planes=[]
  for a,b in zip(cell,cell[1:]+cell[:1]):
   dx,dz=b[0]-a[0],b[1]-a[1];planes.append((Vector((a[0],0,a[1])),Vector((-dz,0,dx))))
  clipped=clip_mesh(original,planes)
  if clipped is not None:
   h=convex([project(v.co) for v in clipped.vertices])
   if len(h)>2:result.append((h,o.name+' exact convex cell '+str(i)))
   bpy.data.meshes.remove(clipped)
 bpy.data.meshes.remove(original);return result
