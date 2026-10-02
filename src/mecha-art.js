// Shared model-projected anchors only. This module has no browser, clock,
// random-number or game-state side effects. Registration happens during loading.
export const MECHA_MANIFEST_PATH = './assets/art/mecha-8h/manifest.json';
const registry = new Map();
const finite = (value, label) => {
  if (!Number.isFinite(value)) throw new Error(`Invalid mecha ${label}`);
  return value;
};
const point = (value, pivot, scale) => Object.freeze({
  x: (finite(value.x, 'anchor x') - pivot.x) * scale,
  y: (finite(value.y, 'anchor y') - pivot.y) * scale,
});
const safeFilename = filename => {
  if (typeof filename !== 'string' || !/^[\w./-]+$/.test(filename) || filename.startsWith('/') || filename.split('/').includes('..')) {
    throw new Error('Invalid mecha frame filename');
  }
  return filename;
};

export function registerMechaManifest(manifest) {
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.entries)) throw new Error('Invalid mecha manifest schema');
  const next = new Map();
  for (const entry of manifest.entries) {
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
        coreExposed:frame.coreExposed===true,sourceState:frame.sourceState||name});
    }
    const common = {key:entry.key,canvasWidth:width,canvasHeight:height,displayWidth,displayHeight:height*scale,
      weakpointEnabled:entry.weakpointEnabled===true&&Boolean(entry.frames.open?.corePixels),facing:entry.facing||'left',
      pivot:Object.freeze({x:pivot.x*scale,y:pivot.y*scale})};
    const views = Object.freeze(Object.fromEntries(Object.entries(states).map(([state,frame])=>[state,Object.freeze({...common,...frame,state})])));
    const spec = Object.freeze({...common,states:Object.freeze(states),views});
    for (const role of entry.roles || [entry.key]) {
      if (typeof role !== 'string' || next.has(role)) throw new Error('Invalid or duplicated mecha role');
      next.set(role,spec);
    }
  }
  registry.clear();
  for (const [role, spec] of next) registry.set(role,spec);
  return Object.freeze([...new Set(next.values())]);
}

export function getMechaSpec(enemy) {
  const spec = registry.get(enemy.type==='boss' ? enemy.bossKind : enemy.type);
  if (!spec) return null;
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
