// Authored hostile trajectories use only their launch state and simulation age.
// A released shot never reads the player, camera, presentation clock, or RNG.
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

export function projectilePositionAt(origin, age, motion = {}) {
  const t = Math.max(0, finite(age, 0));
  const speed = Math.hypot(origin.vx, origin.vy);
  if (!speed) return { x: origin.x, y: origin.y, vx: 0, vy: 0 };
  const ux = origin.vx / speed, uy = origin.vy / speed;
  if (motion.kind === 'curve') {
    const rate = finite(motion.turnRate, 0);
    const turn = Math.min(t, Math.max(0, finite(motion.turnSeconds, Infinity)));
    const angle = rate * turn, c = Math.cos(angle), s = Math.sin(angle);
    const vx = origin.vx * c - origin.vy * s, vy = origin.vx * s + origin.vy * c;
    const dx = Math.abs(rate) < 1e-12 ? origin.vx * turn
      : (origin.vx * s + origin.vy * (c - 1)) / rate;
    const dy = Math.abs(rate) < 1e-12 ? origin.vy * turn
      : (origin.vx * (1 - c) + origin.vy * s) / rate;
    return { x: origin.x + dx + vx * (t - turn), y: origin.y + dy + vy * (t - turn), vx, vy };
  }
  if (motion.kind === 'accelerate') {
    const acceleration = finite(motion.acceleration, 0);
    const limit = Math.max(0, finite(motion.maxSpeed, speed));
    const initial = Math.min(speed, limit);
    const boundary = acceleration > 0 ? limit : 0;
    const until = acceleration ? Math.max(0, (boundary - initial) / acceleration) : Infinity;
    const accelerating = Math.min(t, until);
    const current = Math.max(0, Math.min(limit, initial + acceleration * accelerating));
    const travel = initial * accelerating + acceleration * accelerating ** 2 / 2 + current * (t - accelerating);
    return { x: origin.x + ux * travel, y: origin.y + uy * travel, vx: ux * current, vy: uy * current };
  }
  if (motion.kind === 'wave') {
    // frequency is radians/second. Reserve speed for lateral movement as well:
    // the decorative curve cannot silently exceed the declared velocity cap.
    const frequency = finite(motion.frequency, 4);
    const limit = Math.max(0, finite(motion.maxSpeed, speed));
    const amplitude = Math.min(Math.abs(finite(motion.amplitude, 16)),
      Math.abs(frequency) > 1e-12 ? limit * 0.6 / Math.abs(frequency) : Infinity);
    const phase = finite(motion.phase, 0);
    const lateralSpeed = amplitude * frequency;
    const forward = Math.min(speed, Math.sqrt(Math.max(0, limit ** 2 - lateralSpeed ** 2)));
    const offset = amplitude * (Math.sin(t * frequency + phase) - Math.sin(phase));
    const derivative = lateralSpeed * Math.cos(t * frequency + phase);
    return { x: origin.x + ux * forward * t - uy * offset,
      y: origin.y + uy * forward * t + ux * offset,
      vx: ux * forward - uy * derivative, vy: uy * forward + ux * derivative };
  }
  return { x: origin.x + origin.vx * t, y: origin.y + origin.vy * t, vx: origin.vx, vy: origin.vy };
}

export function advanceHostileProjectile(bullet, dt) {
  if (!Number.isFinite(dt) || dt <= 0) return bullet;
  if (!bullet.motion || bullet.motion.kind === 'linear') {
    bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt;
    bullet.age = (bullet.age || 0) + dt;
    return bullet;
  }
  bullet.motionOrigin ??= { x: bullet.x, y: bullet.y, vx: bullet.vx, vy: bullet.vy, age: bullet.age || 0 };
  bullet.age = (bullet.age || 0) + dt;
  Object.assign(bullet, projectilePositionAt(bullet.motionOrigin, bullet.age - bullet.motionOrigin.age, bullet.motion));
  return bullet;
}
