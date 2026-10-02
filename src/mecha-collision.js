import { getMechaSpec, mechaTransform } from './mecha-art.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const mix = (a, b, t) => a + (b - a) * t;
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const geometryCache = new WeakMap();
const CURVE_TOLERANCE = 1e-7;

// Frozen manifest hull arrays keep this index valid. Only broad phase uses an
// aggregate box: narrow phase still visits each authored convex piece.
function geometryIndex(hulls) {
  let cached = geometryCache.get(hulls);
  if (cached) return cached;
  const pieces = hulls.map(hull => {
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    let radiusSquared = 0;
    for (const point of hull) {
      bounds.minX = Math.min(bounds.minX, point.x); bounds.maxX = Math.max(bounds.maxX, point.x);
      bounds.minY = Math.min(bounds.minY, point.y); bounds.maxY = Math.max(bounds.maxY, point.y);
      radiusSquared = Math.max(radiusSquared, point.x ** 2 + point.y ** 2);
    }
    return { hull, bounds, radiusSquared };
  });
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  let radiusSquared = 0;
  for (const piece of pieces) {
    bounds.minX = Math.min(bounds.minX, piece.bounds.minX); bounds.maxX = Math.max(bounds.maxX, piece.bounds.maxX);
    bounds.minY = Math.min(bounds.minY, piece.bounds.minY); bounds.maxY = Math.max(bounds.maxY, piece.bounds.maxY);
    radiusSquared = Math.max(radiusSquared, piece.radiusSquared);
  }
  cached = { pieces, bounds, radius: Math.sqrt(radiusSquared) };
  geometryCache.set(hulls, cached);
  return cached;
}
function missesBounds(from, to, radius, bounds) {
  return Math.max(from.x, to.x) + radius <= bounds.minX || Math.min(from.x, to.x) - radius >= bounds.maxX
    || Math.max(from.y, to.y) + radius <= bounds.minY || Math.min(from.y, to.y) - radius >= bounds.maxY;
}
function localPoint(point, pose, spec) {
  const { angle, flipX, flipY } = mechaTransform(pose, spec), c = Math.cos(angle), s = Math.sin(angle);
  const x = point.x - pose.x, y = point.y - pose.y;
  return { x: (x * c + y * s) * flipX, y: (-x * s + y * c) * flipY };
}
function pointSegmentDistanceSquared(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / length, 0, 1) : 0;
  return (point.x - a.x - dx * t) ** 2 + (point.y - a.y - dy * t) ** 2;
}
function segmentDistanceSquared(a, b, c, d) {
  if (cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0) return 0;
  return Math.min(pointSegmentDistanceSquared(a,c,d),pointSegmentDistanceSquared(b,c,d),
    pointSegmentDistanceSquared(c,a,b),pointSegmentDistanceSquared(d,a,b));
}
function insideConvex(point, hull) {
  let positive = false, negative = false;
  for (let index=0;index<hull.length;index++) {
    const turn=cross(hull[index],hull[(index+1)%hull.length],point);
    positive ||= turn>1e-10; negative ||= turn< -1e-10;
    if(positive&&negative)return false;
  }
  return true;
}
/** Only authored pieces award contact; hollow centers remain empty. */
export function sweptCircleAgainstHulls(from,to,radius,hulls,bounds=null) {
  if (!hulls?.length) return false;
  const geometry = geometryIndex(hulls);
  // Derive the box from actual vertices. A narrower optional metadata box must
  // never discard a real piece; no extra area becomes contact through this box.
  if (missesBounds(from, to, radius, geometry.bounds)) return false;
  for(const { hull, bounds: pieceBounds } of geometry.pieces) {
    if (missesBounds(from, to, radius, pieceBounds)) continue;
    if(insideConvex(from,hull)||insideConvex(to,hull))return true;
    for(let index=0;index<hull.length;index++)
      if(segmentDistanceSquared(from,to,hull[index],hull[(index+1)%hull.length])<radius**2-1e-10)return true;
  }
  return false;
}

function hasBody(spec) { return Boolean(spec?.runtimeBodyHulls?.length); }
function hasExplicitFrame(pose, spec) {
  return typeof pose.artFrame === 'string' && pose.artFrame === spec?.state;
}

// Semantic/artFrame/flip changes happen at the end of a simulation substep.
// Authored progress is continuous within it: each floor-selection boundary gets
// its exact fractional time. A discrete new artFrame takes effect only at t=1.
function geometryTimeline(before, after, startSpec, endSpec, activeFrom) {
  const startProgress = before.mechanismProgress, endProgress = after.mechanismProgress;
  const continuousProgress = Number.isFinite(startProgress) && Number.isFinite(endProgress)
    && startSpec?.mechanismFrames === endSpec?.mechanismFrames && startSpec?.mechanismFrames?.length
    && !hasExplicitFrame(before, startSpec);
  const boundaryProgress = new Map();
  const progressAt = t => boundaryProgress.has(t) ? boundaryProgress.get(t) : clamp(mix(startProgress, endProgress, t), 0, 1);
  const specAt = t => t === 1 ? endSpec : continuousProgress
    ? getMechaSpec({ ...before, mechanismProgress: progressAt(t) }) : startSpec;
  const boundaries = [activeFrom];
  if (continuousProgress) {
    const delta = endProgress - startProgress;
    if (delta) for (const frame of startSpec.mechanismFrames) {
      const time = (frame.progress - startProgress) / delta;
      if (time >= activeFrom && time < 1) boundaryProgress.set(time, frame.progress);
      if (time > activeFrom && time < 1) boundaries.push(time);
    }
  }
  if (activeFrom < 1) boundaries.push(1);
  boundaries.sort((a, b) => a - b);
  return { boundaries, specAt };
}

// With linear world positions and angle, the local trajectory has second
// derivative bounded by w²|max(relative)| + 2|w||relativeVelocity|. This bounds
// arc-to-chord error by dt²/8. Most distant paths reject in one broad-phase pass;
// only ambiguous near-contact arcs split. Expanded radii only reject/refine,
// never award contact. The inner-radius pass proves real overlap.
function curvedIntervalContact(at, relativeAt, relativeSpeed, angularRate, fromTime, toTime, radius, spec) {
  const hulls = spec.runtimeBodyHulls, geometry = geometryIndex(hulls);
  const relativeFrom = relativeAt(fromTime), relativeTo = relativeAt(toTime);
  if (pointSegmentDistanceSquared({ x: 0, y: 0 }, relativeFrom, relativeTo) >= (geometry.radius + radius) ** 2) return false;
  const visit = (a, b, from, to, depth) => {
    if (!angularRate) return sweptCircleAgainstHulls(from, to, radius, hulls);
    const ra = relativeAt(a), rb = relativeAt(b);
    const maximumRelative = Math.max(Math.hypot(ra.x, ra.y), Math.hypot(rb.x, rb.y));
    const error = (angularRate ** 2 * maximumRelative + 2 * Math.abs(angularRate) * relativeSpeed) * (b - a) ** 2 / 8;
    if (!sweptCircleAgainstHulls(from, to, radius + error, hulls)) return false;
    if (sweptCircleAgainstHulls(from, from, radius, hulls) || sweptCircleAgainstHulls(to, to, radius, hulls)) return true;
    if (radius > error && sweptCircleAgainstHulls(from, to, radius - error, hulls)) return true;
    if (error <= CURVE_TOLERANCE || depth >= 24) return sweptCircleAgainstHulls(from, to, radius, hulls);
    const middle = (a + b) / 2, point = at(middle);
    return visit(a, middle, from, point, depth + 1) || visit(middle, b, point, to, depth + 1);
  };
  return visit(fromTime, toTime, at(fromTime), at(toTime), 0);
}

/**
 * null requests the historical proxy only when the active timeline has no
 * authored body. Each interval uses one frame's compound pieces, never their
 * geometric union. Callers must snapshot all frame selectors before updating.
 */
export function mechaBodyContact(enemy,circle,circleStart=circle,enemyStart=enemy,activeFrom=0) {
  if (circleStart === circle && enemyStart === enemy) {
    const spec = getMechaSpec(enemy);
    if (!hasBody(spec)) return null;
    const point = localPoint(circle, enemy, spec);
    return sweptCircleAgainstHulls(point, point, circle.radius, spec.runtimeBodyHulls);
  }
  const active = clamp(Number.isFinite(activeFrom) ? activeFrom : 0, 0, 1);
  const before = { ...enemy, ...enemyStart };
  const startSpec = getMechaSpec(before), endSpec = getMechaSpec(enemy);
  const { boundaries, specAt } = geometryTimeline(before, enemy, startSpec, endSpec, active);
  const startAngle = mechaTransform(before, startSpec).angle, endAngle = mechaTransform(enemy, endSpec).angle;
  const angularRate = endAngle - startAngle;
  const relativeAt = t => ({ x: mix(circleStart.x - before.x, circle.x - enemy.x, t),
    y: mix(circleStart.y - before.y, circle.y - enemy.y, t) });
  const relativeSpeed = Math.hypot(circle.x - circleStart.x - enemy.x + before.x,
    circle.y - circleStart.y - enemy.y + before.y);
  const at = (t, spec, final = false) => localPoint(
    { x: mix(circleStart.x, circle.x, t), y: mix(circleStart.y, circle.y, t) },
    { ...(final ? enemy : before), x: mix(before.x, enemy.x, t), y: mix(before.y, enemy.y, t),
      artAngle: mix(startAngle, endAngle, t) }, spec);
  let authored = false;
  // This also handles decreasing-progress floor boundaries and activeFrom=1:
  // the exact boundary's selected geometry may differ from the right interval.
  for (const time of boundaries) {
    const spec = specAt(time);
    if (!hasBody(spec)) continue;
    authored = true;
    const point = at(time, spec, time === 1);
    if (sweptCircleAgainstHulls(point, point, circle.radius, spec.runtimeBodyHulls)) return true;
  }
  for (let index = 1; index < boundaries.length; index++) {
    const a = boundaries[index - 1], b = boundaries[index];
    if (b <= a) continue;
    const spec = specAt((a + b) / 2);
    if (!hasBody(spec)) continue;
    authored = true;
    if (curvedIntervalContact(t => at(t, spec), relativeAt, relativeSpeed, angularRate, a, b, circle.radius, spec)) return true;
  }
  return authored ? false : null;
}
