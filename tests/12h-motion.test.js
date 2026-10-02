import test from 'node:test';
import assert from 'node:assert/strict';
import { projectilePositionAt, advanceHostileProjectile } from '../src/projectile-motion.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const origin = { x: 900, y: 300, vx: -120, vy: 0 };

test('curved shot leaves its finite bend on the final tangent without retargeting', () => {
  const motion = { kind: 'curve', turnRate: Math.PI / 2, turnSeconds: 1 };
  const bend = projectilePositionAt(origin, 1, motion), tail = projectilePositionAt(origin, 2, motion);
  close(bend.x, 900 - 240 / Math.PI); close(bend.y, 300 - 240 / Math.PI);
  close(tail.x, bend.x); close(tail.y, bend.y - 120); close(tail.vx, 0); close(tail.vy, -120);
});

test('accelerating shot integrates the speed cap crossing instead of overshooting it', () => {
  const result = projectilePositionAt(origin, 2, { kind: 'accelerate', acceleration: 100, maxSpeed: 220 });
  close(result.x, 900 - 390); close(result.y, 300); close(result.vx, -220);
});

test('motion is independent of frame partition and has no player or camera input', () => {
  for (const motion of [{ kind: 'curve', turnRate: -.35, turnSeconds: .8 },
    { kind: 'accelerate', acceleration: 150, maxSpeed: 430 },
    { kind: 'wave', amplitude: 24, frequency: 5, maxSpeed: 160 }]) {
    const one = { ...origin, age: 0, motion }, many = structuredClone(one);
    advanceHostileProjectile(one, 2);
    for (let index = 0; index < 240; index++) advanceHostileProjectile(many, 1 / 120);
    for (const key of ['x', 'y', 'vx', 'vy']) close(one[key], many[key]);
  }
});

test('wave speed includes its lateral derivative inside the declared cap', () => {
  const motion = { kind: 'wave', amplitude: 100, frequency: 9, maxSpeed: 160 };
  for (let t = 0; t < 3; t += .007) assert.ok(Math.hypot(...Object.values(projectilePositionAt(origin, t, motion)).slice(2)) <= 160 + 1e-9);
});
