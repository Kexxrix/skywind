"""CPU array diagnostics of rendered alpha and authored compound hulls."""
import bpy,json,os,sys,hashlib,numpy as np
root=os.path.abspath(sys.argv[sys.argv.index('--')+1]);manifest=json.load(open(os.path.join(root,'manifest-candidate.json')))
xx,yy=np.meshgrid(np.arange(384)+.5,np.arange(384)+.5)
results={}
for entry in manifest['entries']:
 for state,f in entry['frames'].items():
  im=bpy.data.images.load(os.path.join(root,f['filename']),check_existing=False)
  pixels=np.empty(384*384*4,dtype=np.float32);im.pixels.foreach_get(pixels);rgba=pixels.reshape(384,384,4)[::-1].copy();alpha=rgba[:,:,3];mask=np.zeros((384,384),bool)
  for hull in f['bodyHullPixels']:
   inside=np.ones((384,384),bool)
   for a,b in zip(hull,hull[1:]+hull[:1]):inside &= (b['x']-a['x'])*(yy-a['y'])-(b['y']-a['y'])*(xx-a['x'])>=-1e-6
   mask|=inside
  empty=mask&(alpha<.05);opaque=alpha>.05;ys,xs=np.where(opaque)
  results[entry['key']+'/'+state]={'decodedRGBASha256':hashlib.sha256(np.rint(rgba*255).astype(np.uint8).tobytes()).hexdigest(),'hullPixels':int(mask.sum()),'hullTransparentPixels':int(empty.sum()),'hullTransparentFraction':float(empty.sum()/mask.sum()),'alphaBounds':[int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())],'borderAlphaMax':float(max(alpha[0].max(),alpha[-1].max(),alpha[:,0].max(),alpha[:,-1].max())),'coreExposed':f['coreExposed'],'muzzles':len(f['muzzlesPixels'])}
  # Diagnostic only: red false area, green authored boundary.
  padded=np.pad(mask,1);edge=mask&~(padded[:-2,1:-1]&padded[2:,1:-1]&padded[1:-1,:-2]&padded[1:-1,2:])
  rgba[empty]=(1,.05,.05,1);rgba[edge]=(.05,1,.05,1)
  debug=bpy.data.images.new('hull diagnostic',width=384,height=384,alpha=True);debug.pixels.foreach_set(rgba[::-1].copy().ravel());debug.filepath_raw=os.path.join(root,'hull-diagnostic-'+state+'.png');debug.file_format='PNG';debug.save();bpy.data.images.remove(debug);bpy.data.images.remove(im)
json.dump(results,open(os.path.join(root,'hull-inspection.json'),'w'),indent=2)
print(json.dumps(results))
