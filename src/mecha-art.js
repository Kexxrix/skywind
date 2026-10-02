// Shared model-projected anchors only. This module has no browser, clock,
// random-number or game-state side effects. Registration happens during loading.
export const MECHA_MANIFEST_PATH = './assets/art/mecha-12h-local.json';
const roleRegistry = new Map(),entryRegistry = new Map();
const finite = (value, label) => {
  if (!Number.isFinite(value)) throw new Error(`Invalid mecha ${label}`);
  return value;
};
const point = (value, pivot, scale) => Object.freeze({
  x: (finite(value.x, 'anchor x') - pivot.x) * scale,
  y: (finite(value.y, 'anchor y') - pivot.y) * scale,
});
const hullPoint = value => Array.isArray(value) ? {x:value[0],y:value[1]} : value;
function bodyHulls(value,pivot,scale) {
  if(value==null)return Object.freeze([]);
  if(!Array.isArray(value)||!value.length)throw new Error('Invalid mecha body hull');
  const first=value[0],single=first&&((!Array.isArray(first)&&'x' in first)||(Array.isArray(first)&&typeof first[0]==='number'));
  const hulls=single?[value]:value;
  return Object.freeze(hulls.map(hull=>{
    if(!Array.isArray(hull)||hull.length<3)throw new Error('Invalid mecha body hull');
    const points=hull.map(raw=>point(hullPoint(raw),pivot,scale));
    let direction=0,area=0;
    for(let i=0;i<points.length;i++) {
      const a=points[i],b=points[(i+1)%points.length],c=points[(i+2)%points.length];
      if(a.x===b.x&&a.y===b.y)throw new Error('Invalid mecha body hull duplicate point');
      const cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
      if(Math.abs(cross)>1e-10) {
        const sign=Math.sign(cross);
        if(direction&&sign!==direction)throw new Error('Invalid mecha body hull: convex pieces required');
        direction=sign;
      }
      area+=a.x*b.y-b.x*a.y;
    }
    if(!direction||Math.abs(area)<1e-10)throw new Error('Invalid mecha body hull area');
    // Consistent turns alone do not reject a self-crossing regular star.
    // A convex piece must contain every vertex on the same side of each edge.
    for(let i=0;i<points.length;i++) {
      const a=points[i],b=points[(i+1)%points.length];
      for(const c of points)if(((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))*direction < -1e-10)
        throw new Error('Invalid mecha body hull: convex pieces required');
    }
    return Object.freeze(points);
  }));
}
function bodyBounds(value,pivot,scale) {
  if(value==null)return null;
  const minX=finite(value.minX??value.x,'body bounds min x'),minY=finite(value.minY??value.y,'body bounds min y');
  const maxX=finite(value.maxX??(minX+value.width),'body bounds max x'),maxY=finite(value.maxY??(minY+value.height),'body bounds max y');
  if(maxX<=minX||maxY<=minY)throw new Error('Invalid mecha body bounds');
  return Object.freeze({minX:(minX-pivot.x)*scale,minY:(minY-pivot.y)*scale,maxX:(maxX-pivot.x)*scale,maxY:(maxY-pivot.y)*scale});
}
function mechanismFrames(entry,states) {
  const raw=entry.mechanismFrames??Object.entries(entry.frames)
    .filter(([,frame])=>frame.mechanismProgress!=null).map(([state,frame])=>({state,progress:frame.mechanismProgress}));
  if(!Array.isArray(raw))throw new Error('Invalid mecha mechanism frames');
  const frames=raw.map(frame=>{
    const progress=finite(frame.progress,'mechanism progress');
    if(progress<0||progress>1||typeof frame.state!=='string'||!Object.hasOwn(states,frame.state))throw new Error('Invalid mecha mechanism frame');
    return Object.freeze({progress,state:frame.state});
  }).sort((a,b)=>a.progress-b.progress);
  if(frames.length&&frames[0].progress!==0)throw new Error('Invalid mecha mechanism start');
  for(let i=1;i<frames.length;i++)if(frames[i].progress===frames[i-1].progress)throw new Error('Invalid duplicated mecha mechanism progress');
  return Object.freeze(frames);
}
const safeFilename = filename => {
  if (typeof filename !== 'string' || !/^[\w./-]+$/.test(filename) || filename.startsWith('/') || filename.split('/').includes('..')) {
    throw new Error('Invalid mecha frame filename');
  }
  return filename;
};

export function registerMechaManifest(manifest) {
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.entries)) throw new Error('Invalid mecha manifest schema');
  const nextRoles = new Map(),nextEntries = new Map();
  for (const entry of manifest.entries) {
    if(typeof entry.key!=='string'||!entry.key||nextEntries.has(entry.key))throw new Error('Invalid or duplicated mecha key');
    const width = finite(entry.canvasWidth, 'canvas width'), height = finite(entry.canvasHeight, 'canvas height');
    const displayWidth = finite(entry.displayWidth, 'display width');
    if (width <= 0 || height <= 0 || displayWidth <= 0 || !entry.frames?.idle) throw new Error('Invalid mecha dimensions or idle frame');
    const pivot = Object.freeze({x:finite(entry.pivotPixels?.x, 'pivot x'),y:finite(entry.pivotPixels?.y, 'pivot y')});
    const scale = displayWidth / width, states = {};
    for (const [name, frame] of Object.entries(entry.frames)) {
      const muzzles = (frame.muzzlesPixels || []).map(anchor => point(anchor, pivot, scale));
      const directions = (frame.muzzleDirectionsPixels || []).map((direction,index)=>{
        const muzzle=frame.muzzlesPixels[index];
        if(!muzzle)throw new Error('Mecha direction has no matching muzzle');
        const dx=finite(direction.x,'direction x')-muzzle.x,dy=finite(direction.y,'direction y')-muzzle.y,length=Math.hypot(dx,dy);
        if(length<=0)throw new Error('Invalid mecha muzzle direction');
        return Object.freeze({x:dx/length,y:dy/length});
      });
      const nozzles = (frame.nozzlesPixels || []).map(anchor => point(anchor, pivot, scale));
      const core = frame.corePixels ? Object.freeze({...point(frame.corePixels,pivot,scale),radius:finite(frame.corePixels.radius,'core radius')*scale}) : null;
      if (core && core.radius <= 0) throw new Error('Invalid mecha core radius');
      states[name] = Object.freeze({filename:safeFilename(frame.filename),runtimeMuzzles:Object.freeze(muzzles),runtimeMuzzleDirections:Object.freeze(directions),runtimeNozzles:Object.freeze(nozzles),runtimeCore:core,
        runtimeBodyHulls:bodyHulls(frame.bodyHullPixels??entry.bodyHullPixels,pivot,scale),runtimeBodyBounds:bodyBounds(frame.bodyBoundsPixels??entry.bodyBoundsPixels,pivot,scale),
        coreExposed:frame.coreExposed===true,sourceState:frame.sourceState||name});
    }
    const mechanism=mechanismFrames(entry,states);
    const common = {key:entry.key,canvasWidth:width,canvasHeight:height,displayWidth,displayHeight:height*scale,mechanismFrames:mechanism,
      weakpointEnabled:entry.weakpointEnabled===true&&Object.values(states).some(frame=>frame.coreExposed===true&&frame.runtimeCore),facing:entry.facing||'left',
      pivot:Object.freeze({x:pivot.x*scale,y:pivot.y*scale})};
    const views = Object.freeze(Object.fromEntries(Object.entries(states).map(([state,frame])=>[state,Object.freeze({...common,...frame,state})])));
    const spec = Object.freeze({...common,states:Object.freeze(states),views,mechanismFrames:mechanism});
    nextEntries.set(entry.key,spec);
    for (const role of entry.roles || [entry.key]) {
      if (typeof role !== 'string' || nextRoles.has(role)) throw new Error('Invalid or duplicated mecha role');
      nextRoles.set(role,spec);
    }
  }
  roleRegistry.clear();entryRegistry.clear();
  for (const [role, spec] of nextRoles) roleRegistry.set(role,spec);
  for (const [key, spec] of nextEntries) entryRegistry.set(key,spec);
  // Art-only entries (roles:[]) still participate in image loading and native
  // canvas validation; selecting their appearance never registers a new role.
  return Object.freeze([...nextEntries.values()]);
}

export function getMechaSpec(enemy) {
  const spec = (typeof enemy.appearanceKey==='string'&&entryRegistry.get(enemy.appearanceKey))
    ||roleRegistry.get(enemy.type==='boss' ? enemy.bossKind : enemy.type);
  if (!spec) return null;
  if(typeof enemy.artFrame==='string'&&Object.hasOwn(spec.views,enemy.artFrame))return spec.views[enemy.artFrame];
  if(Number.isFinite(enemy.mechanismProgress)&&spec.mechanismFrames.length) {
    const progress=Math.max(0,Math.min(1,enemy.mechanismProgress));
    // Floor the authored progression: a .999 opening can never display the
    // exposed final frame at 1. No animation clock or HP phase participates.
    for(let i=spec.mechanismFrames.length-1;i>=0;i--) {
      const frame=spec.mechanismFrames[i];
      if(frame.progress<=progress)return spec.views[frame.state];
    }
  }
  if(typeof enemy.artState==='string'&&Object.hasOwn(spec.views,enemy.artState))return spec.views[enemy.artState];
  const state = enemy.fireFlash > 0 && spec.views.fire ? 'fire' : enemy.armorOpen ? 'open' : enemy.telegraph > 0 ? 'charge' : 'idle';
  return spec.views[state] || spec.views.idle;
}

export function mechaAnchorWorld(enemy, anchor) {
  const {angle,flipX,flipY}=mechaTransform(enemy),cos=Math.cos(angle),sin=Math.sin(angle),x=anchor.x*flipX,y=anchor.y*flipY;
  return {x:enemy.x+x*cos-y*sin,y:enemy.y+x*sin+y*cos};
}

export function mechaTransform(enemy, spec=getMechaSpec(enemy)) {
  return {angle:enemy.artAngle||0,flipX:(enemy.artFlipX===-1?-1:1)*(spec?.facing==='right'?-1:1),flipY:enemy.artFlipY===-1?-1:1};
}

export function mechaDirectionWorld(enemy,direction) {
  const {angle,flipX,flipY}=mechaTransform(enemy),cos=Math.cos(angle),sin=Math.sin(angle),x=direction.x*flipX,y=direction.y*flipY;
  return {x:x*cos-y*sin,y:x*sin+y*cos};
}
