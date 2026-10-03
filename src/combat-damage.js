// Resolve authored projectile semantics once at birth. Visual color, speed and
// straight movement never classify damage; ordinary aimed beads also fly straight.
export const HOSTILE_DAMAGE = Object.freeze({ 'normal-pink': 25, pattern: 33, direct: 10 });

const FIELD_FAMILIES = new Set(['fan', 'radial', 'curve', 'loom', 'weave', 'gate']);
const FIELD_PATTERNS = new Set(['B01', 'B02', 'B03', 'B04', 'B05', 'halo', 'petal',
  'trident', 'seed', 'zipper', 'loom', 'cathedral', 'jaws']);
const NON_PROJECTILE_FAMILIES = new Set(['body', 'deploy']);

export function hostileDamageSpec({ pattern, family } = {}) {
  if (NON_PROJECTILE_FAMILIES.has(family) || ['lunge', 'deploy', 'escort'].includes(pattern)) return null;
  const damageClass = pattern === 'aim' ? 'normal-pink'
    : pattern === 'rail' || pattern === 'snapshot' || family === 'aim' ? 'direct'
      : FIELD_FAMILIES.has(family) || FIELD_PATTERNS.has(pattern) ? 'pattern' : null;
  // Unknown/manual legacy projectiles keep their explicit power or the existing
  // collision fallback. This function must not silently turn them into 25 damage.
  return damageClass ? { damageClass, power: HOSTILE_DAMAGE[damageClass] } : null;
}

export function grazeOuterRadius(hitRadius, legacyMargin = 12) {
  if (!Number.isFinite(hitRadius) || hitRadius < 0 || !Number.isFinite(legacyMargin) || legacyMargin < 0)
    throw new RangeError('Graze radii must be finite and nonnegative');
  // Double the complete former outer radius, rather than only its added margin.
  // The hit radius remains the unchanged player core + physical projectile radius.
  return 2 * (hitRadius + legacyMargin);
}
