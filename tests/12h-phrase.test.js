import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, updateGame, consumeEvents, worldToScreen } from '../src/game.js';
import { combatProfile } from '../src/combat-tuning.js';
import { registerMechaManifest } from '../src/mecha-art.js';

const DT = 1 / 120;

// These fixtures deliberately use the historical fallback muzzle registry.
// Authored pincer art and its compound hulls are covered by separate tests.
function fixture() {
  registerMechaManifest({ schemaVersion: 1, entries: [] });
  const g = createGame(310203);
  g.mode = 'playing'; g.bossesDefeated = 2;
  g.nextWaveAt = 0; g.nextBossAt = g.nextPickupAt = Infinity;
  return { g, events: [], members: [] };
}

function advance(f, input = {}) {
  updateGame(f.g, DT, input);
  const current = consumeEvents(f.g); f.events.push(...current);
  if (!f.members.length) f.members = f.g.enemies.filter(e => e.phrase);
  if (current.some(e => e.type === 'wave')) f.g.nextWaveAt = Infinity;
  return current;
}

function until(f, predicate, seconds = 8, input = () => ({})) {
  for (let i = 0; i < Math.ceil(seconds / DT) && !predicate(); i++) advance(f, input());
  assert.ok(predicate(), 'fixture reached its requested state');
}

function reserved(g) { return g.enemies.reduce((sum, e) => sum + (e.reservedBullets || 0), 0); }

function assertBudgets(g) {
  assert.ok(g.enemyBullets.length + reserved(g) <= g.difficulty.maxEnemyBullets);
  const active = g.enemies.filter(e => !e.dead && (e.pendingAttackPlan || e.sequence || e.locked
    || e.dashTime > 0 || ['bait', 'brace'].includes(e.bodyState) || e.attackActiveUntil > g.time));
  assert.ok(active.length <= g.difficulty.maxAttackers);
  assert.ok(active.filter(e => (e.sequence || e.pendingAttackPlan?.plan)?.families.includes('aim')).length <= g.encounter.aimLimit);
  const families = new Set(g.enemyBullets.filter(b => !b.dead && worldToScreen(g, b).x > 40
    && worldToScreen(g, b).x < 1360).map(b => b.family));
  for (const e of active) for (const family of (e.sequence || e.pendingAttackPlan?.plan)?.families
    || (e.combat?.bodyAttack ? ['body'] : ['aim'])) families.add(family);
  assert.ok([...families].filter(f => !['aim', 'body', 'deploy'].includes(f)).length <= g.encounter.maxPatternFamilies);
  assert.ok(families.size <= g.encounter.maxAttackFamilies);
  for (const e of g.enemies) assert.ok((e.reservedBullets || 0) >= 0);
}

function admit(f) {
  until(f, () => f.events.some(e => e.type === 'phraseAdmitted'), 3);
  assert.equal(f.members.length, 2);
  return { field: f.members.find(e => e.prefillMode === 'field-only'), sniper: f.members.find(e => e.pattern === 'rail') };
}

function killThroughCollision(f, enemy) {
  // Controlled lethal friendly projectile; the real collision/damage/death path
  // performs cancellation. No enemy HP, dead flag, cap, or global damage is changed.
  f.g.bullets.push({ id: 900000 + enemy.id, x: enemy.x, y: enemy.y, vx: 0, vy: 0,
    radius: 5, power: enemy.hp + 1, age: 0 });
  advance(f);
  assert.ok(f.events.some(e => e.type === 'explosion' && e.enemyId === enemy.id));
}

test('actual wave admits field and independent rail atomically without charging the delayed member', () => {
  const f = fixture(), { field, sniper } = admit(f);
  const admitted = f.events.find(e => e.type === 'phraseAdmitted');
  assert.deepEqual(new Set(admitted.memberIds), new Set([field.id, sniper.id]));
  assert.equal(admitted.reservedBullets, 67); // halo field64 + independent rail3
  assert.deepEqual((field.sequence || field.pendingAttackPlan.plan).families, ['radial']);
  assert.deepEqual(sniper.pendingAttackPlan.plan.families, ['aim']);
  assert.equal(sniper.reservedBullets, 3);
  assert.equal(sniper.locked, false); assert.equal(sniper.telegraph, 0);
  assert.equal(f.events.filter(e => e.type === 'charge' && e.enemyId === sniper.id).length, 0);
  assertBudgets(f.g);
});

test('bullet saturation rejects the whole phrase before cues and expires without late catch-up', () => {
  const f = fixture();
  f.g.enemyBullets = Array.from({ length: 238 }, (_, id) => ({ id: 10000 + id, sourceId: -1,
    x: 600, y: 100, vx: 0, vy: 0, radius: 1, power: 12, family: 'aim', age: 0 }));
  until(f, () => f.g.time >= 10, 10.1);
  assert.equal(f.members.length, 2);
  assert.ok(f.events.some(e => e.type === 'attackSkipped' && e.reason === 'bullet-reservation-cap'));
  assert.ok(f.events.some(e => e.type === 'phraseSkipped' && e.reason === 'phrase-deadline'));
  assert.equal(f.g.enemyBullets.filter(b => b.sourceId === -1).length, 0, 'finite saturating bullets eventually expire');
  assert.equal(f.events.filter(e => e.type === 'phraseAdmitted').length, 0);
  assert.equal(f.events.filter(e => ['charge', 'enemyShot'].includes(e.type) && f.members.some(m => m.id === e.enemyId)).length, 0);
  assert.ok(f.members.every(e => e.phraseExpired && !e.pendingAttackPlan && !e.sequence && !e.reservedBullets));
});

test('one remaining enemy slot rejects both phrase actors instead of spawning a half phrase', () => {
  const f = fixture(), combat = combatProfile('beetle', 2);
  f.g.enemies = Array.from({ length: 13 }, (_, index) => ({ id: 20000 + index, type: 'beetle',
    x: 1100, y: 100, baseY: 100, speed: 0, radius: combat.radius, hp: combat.hp, maxHp: combat.hp,
    combat, age: 0, phase: 0, angle: 0, attack: 0, fireCooldown: 10 }));
  advance(f);
  assert.ok(f.events.some(e => e.type === 'phraseSkipped' && e.reason === 'enemy-cap'
    && e.requestedActors === 2 && e.availableActors === 1));
  assert.equal(f.g.enemies.filter(e => e.phrase).length, 0);
  assert.ok(f.g.enemies.length <= f.g.difficulty.maxEnemies);
});

test('field death preserves launched slow shots and independently locked rail releases from its own source', () => {
  const f = fixture(), { field, sniper } = admit(f);
  until(f, () => f.events.some(e => e.type === 'enemyShot' && e.enemyId === field.id), 2);
  const slowIds = f.g.enemyBullets.filter(b => b.sourceId === field.id).map(b => b.id);
  assert.ok(slowIds.length > 0);
  killThroughCollision(f, field);
  const killedAt = f.events.find(e => e.type === 'explosion' && e.enemyId === field.id).simulationAt;
  assert.equal(field.reservedBullets, 0); assert.equal(field.sequence, null);
  assert.ok(f.g.enemyBullets.some(b => slowIds.includes(b.id)));
  let lock;
  until(f, () => f.events.filter(e => e.type === 'enemyShot' && e.enemyId === sniper.id).length === 3, 7,
    () => { lock ||= f.events.find(e => e.type === 'aimLock' && e.enemyId === sniper.id); return lock ? { y: -1 } : {}; });
  const shots = f.events.filter(e => e.type === 'enemyShot' && e.enemyId === sniper.id).flatMap(e => e.shots);
  assert.equal(shots.length, 3); assert.ok(lock);
  for (const shot of shots) {
    assert.deepEqual(shot.lockedTarget, lock.lockedTarget); assert.equal(shot.lockAt, lock.lockAt);
    const live = f.g.enemyBullets.find(b => b.id === shot.id);
    assert.ok(live); assert.equal(live.sourceId, sniper.id); assert.ok(Math.hypot(live.vx, live.vy) > 0);
  }
  assert.equal(f.events.filter(e => e.type === 'enemyShot' && e.enemyId === field.id && e.simulationAt > killedAt).length, 0);
});

test('killing a pending sniper immediately releases its cached reservation through real damage', () => {
  const f = fixture(), { field, sniper } = admit(f);
  const before = reserved(f.g);
  assert.ok(sniper.pendingAttackPlan); assert.equal(sniper.reservedBullets, 3);
  killThroughCollision(f, sniper);
  assert.equal(sniper.pendingAttackPlan, null); assert.equal(sniper.sequence, null);
  assert.equal(sniper.reservedBullets, 0); assert.equal(reserved(f.g), before - 3);
  assert.ok(f.g.enemies.includes(field));
  assert.ok(f.events.some(e => e.type === 'attackCancelled' && e.enemyId === sniper.id
    && e.reason === 'emitter-killed' && e.unusedReservation === 3));
  assertBudgets(f.g);
});

test('each admitted member completes one sequence while every observed family, aim and bullet budget stays legal', () => {
  const f = fixture(), { field, sniper } = admit(f);
  for (let i = 0; i < 900 && f.g.time < 7.8; i++) { advance(f); assertBudgets(f.g); }
  for (const e of [field, sniper]) {
    assert.equal(e.attack, 1);
    assert.equal(f.events.filter(x => x.type === 'charge' && x.enemyId === e.id).length, 1);
    assert.equal(f.events.filter(x => x.type === 'attackCompleted' && x.enemyId === e.id).length, 1);
    assert.equal(e.reservedBullets, 0); assert.equal(e.pendingAttackPlan, null);
  }
});

test('boss entry clears active and pending phrase claims plus inflight without subsequent old-source emissions', () => {
  const f = fixture(), { field, sniper } = admit(f);
  until(f, () => f.events.some(e => e.type === 'enemyShot' && e.enemyId === field.id), 2);
  assert.ok(sniper.pendingAttackPlan); assert.ok(f.g.enemyBullets.length);
  f.g.nextBossAt = f.g.time + DT;
  advance(f);
  const clearAt = f.events.find(e => e.type === 'combatClear').simulationAt;
  assert.equal(f.g.phase, 'boss-entry'); assert.equal(reserved(f.g), 0);
  assert.equal(f.g.enemyBullets.length, 0); assert.equal(f.g.enemies.filter(e => e.phrase).length, 0);
  // Continue past the cancelled sniper's original first-release time, including
  // the boss-entry -> boss transition, rather than checking only the clear tick.
  for (let i = 0; i < 600; i++) advance(f);
  assert.equal(f.events.filter(e => e.type === 'enemyShot' && [field.id, sniper.id].includes(e.enemyId)
    && e.simulationAt >= clearAt).length, 0);
});
