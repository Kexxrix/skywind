import { LEVEL_RULES as RULES, trialDifficulty, normalEncounter, bossProfile, bossAttack, attackPolicy, LEVEL_BOSS_KINDS, basicWeapon } from './level.js';
import { barragePlan, patternGeometry, AIM_SPEEDS, relativeMinimumDistance } from './barrage.js';
import { getMechaSpec, mechaAnchorWorld } from './mecha-art.js';
export const WORLD_WIDTH = 1280;
export const WORLD_HEIGHT = 720;
export const FLIGHT_CENTER_Y = 360;
export const FLIGHT_MIN_Y = -108;
export const FLIGHT_MAX_Y = 828;
export const VIEW_MIN_Y = 48;
export const VIEW_MAX_Y = 672;
export const WEAPON_DURATION = RULES.weaponDuration;
export const WEAPON_MAX_DURATION = RULES.weaponMaximum;
export const TENSION_DURATION = RULES.tensionDuration;
export const DRONE_DURATION = 15;
export const ENEMY_TYPES = ['beetle', 'wasp', 'claw', 'dragonfly', 'worm', 'ray', 'mantis', 'orb', 'needle'];
export const BOSS_KINDS = LEVEL_BOSS_KINDS;
export const MAX_ENEMY_BULLET_SPEED = 420;
// The old 2.6px marker's 1.5px centered stroke left a 1.85px clear nucleus.
export const PLAYER_HIT_RADIUS = 1.85;
// Keep top speed independent from response tuning. Release/reversal damping is
// faster than cruising acceleration so a small dodge ends where it is intended.
export const FLIGHT_CONTROL = Object.freeze({ horizontalSpeed: 225, verticalSpeed: 490,
  horizontalResponse: 12, verticalResponse: 24, horizontalBrake: 24, verticalBrake: 30 });
// Double the previous reach in every direction, with extra screen-left coverage
// for passed items. This remains separate from the 1.85-unit damage core.
export const PICKUP_ATTRACTION = Object.freeze({ radius: 212, rearExtension: 106, duration: 0.18, minVisibleDuration: 0.14, absorbRadius: 12 });

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const lerp = (a, b, amount) => a + (b - a) * amount;
const distanceSquared = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

export function cameraRoll(g) {
  // Title animation may keep running between attempts. Combat geometry must not
  // inherit its clock or backdrop altitude: replay uses only simulation state.
  const title = g.mode === 'title';
  const clock = title ? g.sceneTime : g.time;
  const altitude = title ? g.altitude : (g.flightAltitude ?? 0.5);
  return clamp(-0.18 + Math.sin(clock * 0.18) * 0.055 + (altitude - 0.5) * 0.025 + g.player.angle * 0.03, -0.27, -0.09);
}

export function worldToScreen(g, point) {
  const angle = cameraRoll(g), c = Math.cos(angle), s = Math.sin(angle);
  return { x: 640 + (point.x - 640) * c - (point.y - 360) * s,
    y: 360 + (point.x - 640) * s + (point.y - 360) * c - (g.cameraY || 0) };
}

export function screenToWorld(g, point) {
  const angle = cameraRoll(g), c = Math.cos(angle), s = Math.sin(angle);
  const x = point.x - 640, y = point.y + (g.cameraY || 0) - 360;
  return { x: 640 + x * c + y * s, y: 360 - x * s + y * c };
}

export function getWeaponStatus(player) {
  const remaining = Math.max(0, player.powerTime);
  return {
    mode: remaining > 0 ? player.weaponMode : 'normal', remaining,
    gauge: clamp(remaining / WEAPON_MAX_DURATION, 0, 1), level: player.basicLevel || 1, maxDuration: WEAPON_MAX_DURATION,
    drone: player.droneTime > 0 ? { remaining: player.droneTime, gauge: clamp(player.droneTime / DRONE_DURATION, 0, 1) } : null,
  };
}

export function playerHeading(player) {
  // Keep the nose within six degrees of the forward volley; bank frames still
  // use the full movement signal independently of this gentle screen pitch.
  return clamp(player.angle / 0.48, -1, 1) * Math.PI / 30;
}

export function playerMuzzle(player) {
  const angle = playerHeading(player), c = Math.cos(angle), s = Math.sin(angle);
  return { x: player.x + 30 * c + 4 * s, y: player.y + 30 * s - 4 * c };
}

// Only real victories advance the five stages, followed by bounded endless hell.
export function difficultyAt(time, bossesDefeated = 0) { return trialDifficulty(bossesDefeated); }

const ENEMY_SPECS = {
  beetle: { radius: 28, hp: 3, speed: 280, score: 100, behavior: 'formation' },
  claw: { radius: 33, hp: 5, speed: 250, score: 180, behavior: 'brake-fan' },
  worm: { radius: 35, hp: 8, speed: 215, score: 280, behavior: 'serpentine' },
  wasp: { radius: 22, hp: 2, speed: 320, score: 130, behavior: 'lock-dive' },
  mantis: { radius: 31, hp: 5, speed: 255, score: 210, behavior: 'zigzag' },
  ray: { radius: 35, hp: 7, speed: 225, score: 250, behavior: 'curtain' },
  dragonfly: { radius: 18, hp: 1, speed: 435, score: 80, behavior: 'dart' },
  orb: { radius: 29, hp: 6, speed: 200, score: 230, behavior: 'radial' },
  needle: { radius: 22, hp: 4, speed: 235, score: 200, behavior: 'sniper' },
};

function overlapsEnemy(enemy, circle, radiusScale) {
  if (!enemy.hitbox) return distanceSquared(circle, enemy) < (circle.radius + enemy.radius * radiusScale) ** 2;
  const angle = -(enemy.angle || 0);
  const dx = circle.x - enemy.x, dy = circle.y - enemy.y;
  const localX = dx * Math.cos(angle) - dy * Math.sin(angle) - enemy.hitbox.x;
  const localY = dx * Math.sin(angle) + dy * Math.cos(angle) - enemy.hitbox.y;
  const rx = enemy.hitbox.rx + circle.radius;
  const ry = enemy.hitbox.ry + circle.radius;
  return (localX / rx) ** 2 + (localY / ry) ** 2 < 1;
}

function sweptInsideCircle(from, to, radius, activeFrom = 0) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 0 ? clamp(-(from.x * dx + from.y * dy) / lengthSquared, activeFrom, 1) : 1;
  // Preserve strict overlap: a mathematical tangent is a graze, not damage.
  return (from.x + dx * t) ** 2 + (from.y + dy * t) ** 2 < radius * radius - 1e-10;
}

function sweptPlayerEnemy(player, playerStart, enemy, enemyStart, activeFrom) {
  if (!enemy.hitbox) {
    return sweptInsideCircle({ x: playerStart.x - enemyStart.x, y: playerStart.y - enemyStart.y },
      { x: player.x - enemy.x, y: player.y - enemy.y }, player.radius + enemy.radius * 0.7, activeFrom);
  }
  // Retain the existing expanded elliptical body shape; only the player core shrinks.
  const rx = enemy.hitbox.rx + player.radius, ry = enemy.hitbox.ry + player.radius;
  const local = (point, pose) => {
    const angle = -(pose.angle || 0), c = Math.cos(angle), s = Math.sin(angle);
    const dx = point.x - pose.x, dy = point.y - pose.y;
    return { x: (dx * c - dy * s - enemy.hitbox.x) / rx,
      y: (dx * s + dy * c - enemy.hitbox.y) / ry };
  };
  return sweptInsideCircle(local(playerStart, enemyStart), local(player, enemy), 1, activeFrom);
}

function random(g) {
  let n = (g.rng += 0x6d2b79f5);
  n = Math.imul(n ^ (n >>> 15), n | 1);
  n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
  return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
}

function emit(g, type, extra = {}) {
  g.events.push({ type, ...extra });
  if (g.events.length > 512) g.events.shift();
}

function nextId(g) {
  return g.nextId++;
}

export function createGame(seed = 74912) {
  return {
    mode: 'title',
    seed: seed >>> 0,
    rng: seed >>> 0,
    nextId: 1,
    time: 0,
    sceneTime: 0,
    scrollTime: 0,
    score: 0,
    stage: 1,
    combo: 0,
    comboTime: 0,
    altitude: 0.65,
    targetAltitude: 0.65,
    flightAltitude: 0.5,
    cameraY: 0,
    speed: RULES.baseScroll, backgroundSpeed: 1, night: 0, daylight: 1,
    phase: 'normal', phaseTime: 0, normalTime: 0, cycle: 1, returnFromNight: 0,
    tensionTime: 0, tensionDuration: TENSION_DURATION, supply: null,
    recoverySpawned: false, droneMarked: false, patternSection: null,
    difficulty: difficultyAt(0),
    encounter: normalEncounter(0, 0),
    shake: 0,
    boss: null,
    bossesDefeated: 0,
    nextBossAt: RULES.normalDuration,
    nextWaveAt: 0.7,
    nextPickupAt: RULES.firstSupply,
    pickupIndex: 0,
    waveIndex: 0,
    aimCounter: 0,
    player: {
      x: -160, y: 360, radius: PLAYER_HIT_RADIUS,
      hp: 100, maxHp: 100,
      angle: 0, vx: 0, vy: 0, invincible: 0,
      powerTime: 0, droneTime: 0,
      weaponMode: 'spread', powerPickups: 0, basicLevel: 1,
      fireCooldown: 0, droneCooldown: 0,
      entryTime: 0,
    },
    enemies: [],
    bullets: [],
    enemyBullets: [],
    pickups: [],
    events: [],
  };
}

export function startGame(g, seed = g.seed) {
  const sceneTime = g.sceneTime;
  const scrollTime = g.scrollTime;
  const altitude = g.altitude, targetAltitude = g.targetAltitude;
  Object.assign(g, createGame(seed));
  g.sceneTime = sceneTime;
  g.scrollTime = scrollTime;
  g.altitude = altitude;
  g.targetAltitude = targetAltitude;
  g.mode = 'entering';
  g.player.invincible = 2.4;
  emit(g, 'start');
  return g;
}

export function consumeEvents(g) {
  const events = g.events;
  g.events = [];
  return events;
}

function spawnPickup(g, type, x, y) {
  g.pickups.push({
    id: nextId(g), type, x, y, baseY: y,
    radius: 22, age: 0, phase: random(g) * Math.PI * 2,
  });
}

function spawnEnemy(g, type, x, y, index = 0) {
  if (g.enemies.length >= g.difficulty.maxEnemies) return null;
  const spec = ENEMY_SPECS[type];
  const hp = spec.hp + g.difficulty.hpBonus;
  const enemy = {
    id: nextId(g), type, behavior: spec.behavior, variant: Math.floor(g.time / 60) % 3,
    x, y, baseY: y, radius: spec.radius, hp, maxHp: hp,
    ...(type === 'worm' ? { hitbox: { x: 5, y: -7, rx: 69, ry: 19 } } : {}),
    ...(type === 'needle' ? { hitbox: { x: 0, y: 0, rx: 50, ry: 22 } } : {}),
    angle: 0, age: 0, phase: index * 0.6 + random(g) * 0.4,
    speed: spec.speed * g.difficulty.enemySpeed,
    score: spec.score, fireCooldown: 0.25 + index * 0.16 + random(g) * 0.35,
    telegraph: 0, chargeTime: 0, attackAngle: Math.PI, attack: 0,
    locked: false, dashTime: 0, flash: 0, dead: false,
  };
  g.enemies.push(enemy);
  return enemy;
}

function spawnWave(g) {
  const wave = g.waveIndex++;
  const encounter = g.encounter = normalEncounter(g.normalTime, g.bossesDefeated);
  const budget = Math.min(g.difficulty.waveSize, g.difficulty.maxEnemies - g.enemies.length);
  let emitted = 0;
  for (const role of encounter.roles) {
    if (role.pattern && g.enemies.some(e => !e.dead && e.pattern === role.pattern && e.encounterBlock === encounter.blockId)) continue;
    for (let i = 0; i < role.count && emitted < budget; i++) {
      const lane = role.lane ?? 360;
      const formation = role.formation || 'stagger';
      const y = clamp(formation === 'pincer' ? (i % 2 ? 720 - lane : lane)
        : formation === 'column' ? lane + (i - (role.count - 1) / 2) * 64
          : formation === 'line' ? lane : lane + (i % 3 - 1) * 48, 96, 624);
      const position = screenToWorld(g, { x: 1320 + emitted * (formation === 'column' ? 24 : 65), y });
      const enemy = spawnEnemy(g, role.type, position.x, position.y, emitted);
      if (!enemy) break;
      enemy.encounterBlock = encounter.blockId;
      enemy.formation = formation;
      if (role.pattern) {
        enemy.pattern = role.pattern;
        enemy.holdScreenY = lane;
        enemy.holdUntil = g.time + (role.holdSeconds || 6);
        enemy.safeLanes = encounter.safeLanes;
      }
      if (g.normalTime >= 36 && !g.droneMarked && !role.pattern) {
        enemy.markedDrone = true;
        g.droneMarked = true;
      }
      emitted++;
    }
  }
  emit(g, 'wave', { enemyType: encounter.roles[0]?.type || 'beetle', count: emitted,
    tier: g.stage, pattern: encounter.pattern, blockId: encounter.blockId, theme: encounter.theme, wave });
}

function clearCombat(g) {
  // Only the visual exit survives; these objects can no longer collide or score.
  emit(g, 'combatClear', { duration: 0.2, enemies: g.enemies.map(e => ({ x: e.x, y: e.y, radius: e.radius, type: e.type, bossKind: e.bossKind, variant: e.variant, angle: e.angle })),
    bullets: g.enemyBullets.map(b => ({ x: b.x, y: b.y, radius: b.radius, vx: b.vx, vy: b.vy, type: b.type, speedTier: b.speedTier })) });
  g.enemies = [];
  g.enemyBullets = [];
}

function spawnBoss(g) {
  clearCombat(g);
  const profile = bossProfile(g.bossesDefeated), { variant, kind: bossKind } = profile;
  const hp = Math.round(g.difficulty.bossHp * profile.hpMultiplier);
  const position = screenToWorld(g, { x: 1490, y: 320 });
  const boss = {
    id: nextId(g), type: 'boss', bossKind, bossName: profile.name, variant,
    behavior: profile.mechanic, motion: profile.motion, safeLanes: profile.safeLanes, hell: profile.hell,
    ...position, baseY: position.y, radius: profile.radius, hp, maxHp: hp,
    angle: 0, age: 0, phase: 0, speed: 75, score: 3500 + g.bossesDefeated * 1500,
    fireCooldown: 0.4, flash: 0, attack: 0, telegraph: 0, chargeTime: 0,
    locked: false, attackAngle: Math.PI, attackName: '', safeLane: 360, safeAngle: Math.PI,
    armorOpen: false, corePhase: 0, attackIndex: 0,
    dashTime: 0, dead: false, spawnedAt: g.time, entryX: position.x,
  };
  g.phase = 'boss-entry'; g.phaseTime = 0;
  g.boss = boss; g.enemies.push(boss);
  emit(g, 'phaseChange', { phase: g.phase, cycle: g.cycle });
  emit(g, 'boss', { x: boss.x, y: boss.y, level: g.cycle, bossKind, bossName: boss.bossName, hell: profile.hell });
}

function playerShot(g, x, y, vy, powered = false, drone = false) {
  g.bullets.push({
    id: nextId(g), x, y, vx: drone ? 1120 : 1360,
    vy, radius: powered ? 7 : 5,
    power: (powered ? 2 : drone ? 1 : basicWeapon(g.player.basicLevel).damage) * (g.tensionTime > 0 ? RULES.tensionDamage : 1), powered, drone, age: 0,
    tension: g.tensionTime > 0, visualColor: g.tensionTime > 0 ? '#ffe36b' : null,
    impactCue: g.tensionTime > 0 ? 'tension' : drone ? 'drone' : powered ? g.player.weaponMode : 'normal',
    weaponMode: drone ? 'drone' : powered ? g.player.weaponMode : 'normal',
  });
}

function firePlayer(g) {
  const p = g.player;
  const muzzle = playerMuzzle(p);
  const powered = p.powerTime > 0;
  if (powered && p.weaponMode === 'lance') {
    for (const offset of [-9, 0, 9]) {
      playerShot(g, muzzle.x + 2, muzzle.y + offset, 0, true);
      Object.assign(g.bullets.at(-1), { power: 3 * (g.tensionTime > 0 ? RULES.tensionDamage : 1), pierce: 2, hits: [] });
    }
  } else if (powered && p.weaponMode === 'helix') {
    for (const phase of [0, Math.PI, Math.PI / 2, Math.PI * 1.5]) {
      playerShot(g, muzzle.x + 2, muzzle.y, Math.sin(phase) * 150, true);
      Object.assign(g.bullets.at(-1), { phase, baseY: muzzle.y });
    }
  } else if (powered) {
    for (const vy of [-520, -250, 0, 250, 520]) {
      playerShot(g, muzzle.x + 2, muzzle.y + vy * 0.037, vy, true);
    }
  } else {
    for (const offset of basicWeapon(p.basicLevel).offsets) playerShot(g, muzzle.x + 2, muzzle.y + offset, 0);
  }
  p.fireCooldown = powered ? 0.085 : 0.095;
  emit(g, 'shot', { x: muzzle.x, y: muzzle.y, powered, weaponMode: powered ? p.weaponMode : 'normal', tension: g.tensionTime > 0, basicLevel: p.basicLevel });
}

export function enemyMuzzles(e) {
  const art = getMechaSpec(e);
  if (art?.runtimeMuzzles.length) return art.runtimeMuzzles.map(anchor => mechaAnchorWorld(e, anchor));
  const angle = e.angle || 0, c = Math.cos(angle), s = Math.sin(angle);
  const offsets = e.type === 'boss' ? [[-e.radius * 0.7, -e.radius * 0.48], [-e.radius * 0.7, e.radius * 0.48]]
    : e.pattern === 'B02' || e.pattern === 'B04' || e.pattern === 'B05' ? [[-e.radius * 0.7, -e.radius * 0.4], [-e.radius * 0.7, e.radius * 0.4]]
      : [[-e.radius * 0.7, 0]];
  return offsets.map(([x, y]) => ({ x: e.x + x * c - y * s, y: e.y + x * s + y * c }));
}

function enemyBullet(g, e, origin, angle, speed, options = {}) {
  const velocity = Math.min(MAX_ENEMY_BULLET_SPEED, g.difficulty.maxBulletSpeed, speed);
  g.enemyBullets.push({ id: nextId(g), sourceId: e.id, ...origin,
    vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
    radius: e.type === 'boss' ? 7 : 5.5, power: e.type === 'boss' ? 17 : 12,
    type: e.type === 'boss' ? 'plasma' : 'orb', color: e.type === 'boss' ? '#ff663b' : '#ffbd70', age: 0,
    pattern: e.attackName, ...options });
}

export function sequenceToWorld(plan, point) {
  return { x: 640 + (point.x - 640) * plan.cos + (point.y + plan.cameraY - 360) * plan.sin,
    y: 360 - (point.x - 640) * plan.sin + (point.y + plan.cameraY - 360) * plan.cos };
}

function spawnEscorts(g, boss) {
  const occupied = new Set(g.enemies.filter(other => !other.dead && other.escort && other.sourceBossId === boss.id).map(other => other.escortSlot));
  for (let i = 0; i < 2; i++) {
    if (occupied.has(i)) continue;
    const position = screenToWorld(g, { x: 820, y: i ? 500 : 220 });
    const escort = spawnEnemy(g, 'beetle', position.x, position.y, i);
    if (escort) Object.assign(escort, { escort: true, sourceBossId: boss.id, escortSlot: i, score: 0, fireCooldown: 0.65 + i * 0.35 });
  }
}

function releaseBundle(g, e, bundle) {
  const origin = e.muzzles[bundle.port % e.muzzles.length], plan = e.sequence;
  const before = g.enemyBullets.length, pattern = bundle.pattern || plan.pattern;
  const referenceX = 360;
  if (pattern === 'escort') {
    spawnEscorts(g, e);
  } else if (pattern === 'aim') {
    // Rotate actual released shots across sources: short-lived waves cannot all
    // restart at slow, and boss pattern indices cannot permanently omit fast.
    const speed = g.difficulty.pace ? AIM_SPEEDS[g.aimCounter % AIM_SPEEDS.length] : AIM_SPEEDS[0];
    const target = e.aimTarget = { x: g.player.x, y: g.player.y };
    const distance = Math.hypot(target.x - origin.x, target.y - origin.y) - PLAYER_HIT_RADIUS - (e.type === 'boss' ? 7 : 5.5);
    if (distance / speed < g.difficulty.minimumFlightTime) {
      // A denied single aimed shot must not suspend its source indefinitely.
      // Structured rings/curtains keep their whole pre-reserved geometry.
      emit(g, 'attackSkipped', { enemyId: e.id, bossKind: e.bossKind, pattern, reason: 'minimum-flight-time' });
      return true;
    }
    e.attackAngle = Math.atan2(target.y - origin.y, target.x - origin.x);
    enemyBullet(g, e, origin, e.attackAngle, speed, { speedTier: ['slow', 'medium', 'fast'][AIM_SPEEDS.indexOf(speed)],
      type: speed === 340 ? 'needle' : e.type === 'boss' ? 'plasma' : 'orb', aimedAt: { x: target.x, y: target.y } });
    if (g.difficulty.pace) g.aimCounter++;
  } else {
    const safeTarget = sequenceToWorld(plan, { x: referenceX, y: e.safeLane });
    const points = patternGeometry(bundle, { pattern, roll: plan.roll, safeLane: e.safeLane,
      safeDirection: e.safeDirection, corridorWidth: g.difficulty.corridorWidth,
      playerRadius: PLAYER_HIT_RADIUS, bulletRadius: e.type === 'boss' ? 7 : 5.5,
      origin, safeTarget, referenceX, portCount: e.muzzles.length });
    for (const point of points) {
      const port = e.muzzles[point.port % e.muzzles.length];
      const target = Number.isFinite(point.targetY) ? sequenceToWorld(plan, { x: point.targetX ?? referenceX, y: point.targetY }) : null;
      const angle = target ? Math.atan2(target.y - port.y, target.x - port.x) : point.angle;
      enemyBullet(g, e, port, angle, point.speed ?? bundle.speed,
        Number.isFinite(point.windowY) ? { windowY: point.windowY, referenceX, corridorWidth: point.corridorWidth } : {});
    }
  }
  const bulletCount = g.enemyBullets.length - before;
  const launchMuzzles = [...new Map(g.enemyBullets.slice(before).map(bullet => [`${bullet.x}:${bullet.y}`, { x: bullet.x, y: bullet.y }])).values()];
  if (bulletCount) e.fireFlash = 0.12;
  emit(g, pattern === 'escort' ? 'escortDeployed' : 'enemyShot', { ...origin, enemyId: e.id, bulletCount, launchMuzzles, boss: e.type === 'boss', bossKind: e.bossKind,
    enemyType: e.type, attackName: pattern, pattern, attackIndex: e.attackIndex ?? e.attack,
    armorOpen: Boolean(e.armorOpen), corePhase: e.corePhase || 0,
    speedTier: pattern === 'aim' ? g.enemyBullets.at(-1)?.speedTier : 'pattern' });
  return true;
}

function setArmorOpen(g, e, open) {
  const changed = e.armorOpen !== Boolean(open);
  e.armorOpen = Boolean(open);
  const core = getMechaSpec(e)?.runtimeCore;
  e.coreVulnerable = Boolean(open && core);
  if (changed && e.coreVulnerable) emit(g, 'coreOpen', { ...mechaAnchorWorld(e, core),
    enemyId: e.id, boss: e.type === 'boss', bossKind: e.bossKind,
    attackName: e.attackName, attackIndex: e.attackIndex, armorOpen: true, corePhase: e.corePhase });
}

function updateAttack(g, e, dt) {
  e.muzzles = enemyMuzzles(e);
  if (g.phase === 'boss-entry') return;
  const screen = worldToScreen(g, e), boss = e.type === 'boss';
  const visible = screen.x - e.radius > 0 && screen.x + e.radius < WORLD_WIDTH
    && screen.y - e.radius >= 50 && screen.y + e.radius <= 670;
  if (!visible || screen.x < WORLD_WIDTH * 0.33 + 120) {
    e.locked = false; e.telegraph = 0; e.sequence = null; e.reservedBullets = 0;
    if (boss) setArmorOpen(g, e, false);
    return;
  }
  if (e.sequence && !e.locked) {
    const sequence = e.sequence;
    if (boss) setArmorOpen(g, e, e.attackSpec?.armorOpen && !e.escortShield);
    e.muzzles = enemyMuzzles(e);
    sequence.elapsed += dt;
    while (sequence.index < sequence.bundles.length && sequence.bundles[sequence.index].at <= sequence.elapsed + 1e-9) {
      const bundle = sequence.bundles[sequence.index];
      if (!releaseBundle(g, e, bundle)) { sequence.elapsed = bundle.at; return; }
      e.reservedBullets = Math.max(0, e.reservedBullets - bundle.count);
      sequence.index++;
    }
    if (sequence.index === sequence.bundles.length) {
      e.sequence = null; e.reservedBullets = 0; e.attack++;
      e.attackActiveUntil = g.time + 0.15;
      const recovery = boss ? (e.attackSpec?.pauseAfter || 0) : 0;
      e.coreOpenUntil = g.time + recovery;
      e.fireCooldown = (boss ? g.difficulty.bossFireInterval * (e.phase ? 0.85 : 1) : g.difficulty.fireInterval) + recovery;
    }
    return;
  }
  if (!e.locked) {
    if (g.phase === 'normal' && g.normalTime >= RULES.quietAt) return;
    if (!boss && e.pattern && (e.holdUntil <= g.time || (e.encounterBlock && e.encounterBlock !== g.encounter.blockId))) return;
    if (boss && g.time >= (e.coreOpenUntil || 0)) setArmorOpen(g, e, false);
    e.fireCooldown -= dt;
    if (e.fireCooldown > 0 || e.attackActiveUntil > g.time) return;
    const attackers = g.enemies.filter(other => !other.dead && other !== e && (other.locked || other.sequence || other.attackActiveUntil > g.time));
    if (attackers.length >= g.difficulty.maxAttackers) return;
    const attack = boss ? bossAttack(g.bossesDefeated, e.attack) : null;
    const pattern = attack?.pattern || e.pattern || 'aim';
    const policy = attackPolicy(pattern, g.difficulty.pace);
    const encounter = g.phase === 'normal' ? g.encounter : null;
    const aimLimit = Math.min(policy.aimLimit, encounter?.aimLimit ?? attack?.aimLimit ?? policy.aimLimit);
    const pressure = new Set(g.enemyBullets.filter(bullet => {
      if (bullet.dead) return false;
      const position = worldToScreen(g, bullet);
      return position.x > 40 && position.x < WORLD_WIDTH + 80 && position.y > 20 && position.y < WORLD_HEIGHT - 20;
    }).map(bullet => bullet.pattern));
    // Required travel windows remain exclusive until their tail has passed the
    // player's flight corridor, not merely until the emitter's last release.
    const routePressure = pressure.has('B04') || pressure.has('B05');
    if (pattern === 'aim' && (aimLimit === 0 || routePressure || attackers.some(other => other.sequence?.movementWindow))) return;
    if (policy.movementWindow && (pressure.size || attackers.length)) return;
    if (pattern.startsWith('B') && (attackers.some(other => other.attackName?.startsWith('B'))
      || [...pressure].some(active => active?.startsWith('B') && active !== pattern))) return;
    if (pattern === 'aim' && attackers.filter(other => other.attackName === 'aim').length >= aimLimit) return;
    if (pattern === 'aim' && !g.difficulty.pace && attackers.some(other => other.attackName === 'B02'
      || (other.attackName?.startsWith('B') && (other.sequence?.index || 0) === 0))) return;
    // Sequence reservations include all future ports and rings, including other sources.
    // A waiting source must not consume combat randomness on every frame.
    const attackSeed = (Math.imul(g.seed ^ e.id, 0x45d9f3b) ^ Math.imul(e.attack, 0x119de1f3)) >>> 0;
    const plan = barragePlan(pattern, g.difficulty.pace, attackSeed / 4294967296);
    const reserved = g.enemies.reduce((n, other) => n + (other.reservedBullets || 0), 0);
    if (plan.total > g.difficulty.maxSequenceBullets || plan.bundles.some(bundle => bundle.count > g.difficulty.maxPatternBullets)
      || g.enemyBullets.length + reserved + plan.total > g.difficulty.maxEnemyBullets) return;
    const roll = cameraRoll(g), cameraY = g.cameraY, c = Math.cos(roll), s = Math.sin(roll);
    plan.cameraY = cameraY; plan.cos = c; plan.sin = s;
    plan.roll = roll; plan.index = 0; plan.elapsed = 0;
    e.sequence = plan; e.reservedBullets = plan.total;
    e.attackName = pattern; e.locked = true;
    e.attackIndex = e.attack; e.attackSpec = attack;
    if (boss && e.bossKind === 'apex') e.attackSpec.armorOpen = pattern === 'B03' || pattern === 'B05';
    const safeLanes = e.safeLanes || encounter?.safeLanes || [240, 360, 480];
    e.safeLane = attack?.safeLane ?? safeLanes[Math.floor(e.attack / 3) % safeLanes.length];
    e.safeDirection = e.safeLane >= 400 ? -1 : 1;
    e.safeWidth = g.difficulty.corridorWidth + 2 * (PLAYER_HIT_RADIUS + (boss ? 7 : 5.5));
    e.routeLanes = plan.movementWindow ? plan.bundles.map(bundle => clamp(e.safeLane + (bundle.safeOffset || 0) * e.safeDirection, 155, 565)) : [];
    e.chargeDuration = Math.max(g.difficulty.minTelegraph, attack?.telegraph || (e.type === 'needle' ? 0.75 : 0));
    e.chargeTime = e.chargeDuration;
    e.aimTarget = { x: g.player.x, y: g.player.y };
    if (boss) { e.corePhase = attack.corePhase; setArmorOpen(g, e, false); }
    const activeMuzzles = e.muzzles.filter((_, index) => plan.movementWindow || plan.bundles.some(bundle => bundle.port % e.muzzles.length === index));
    emit(g, 'charge', { ...e.muzzles[0], muzzles: activeMuzzles, enemyId: e.id, enemyType: e.type, boss, bossKind: e.bossKind,
      attackName: pattern, attackIndex: e.attackIndex, armorOpen: false, corePhase: e.corePhase || 0,
      routeLanes: [...e.routeLanes], duration: e.chargeDuration });
  }
  const origin = e.muzzles[0];
  e.aimTarget = { x: g.player.x, y: g.player.y };
  e.attackAngle = Math.atan2(e.aimTarget.y - origin.y, e.aimTarget.x - origin.x);
  e.chargeTime = Math.max(0, e.chargeTime - dt);
  e.telegraph = Math.max(0.03, 1 - e.chargeTime / e.chargeDuration);
  if (e.chargeTime <= 1e-9) { e.locked = false; e.telegraph = 0; }
}

function destroyEnemy(g, enemy, projectile = {}) {
  if (enemy.dead) return;
  enemy.dead = true;
  if (!enemy.escort) { g.combo += 1; g.comboTime = 3.5; }
  const multiplier = Math.min(5, 1 + Math.floor(g.combo / 8));
  const points = enemy.escort ? 0 : (enemy.score ?? 100) * multiplier;
  g.score += points;
  g.shake = enemy.type === 'boss' ? 20 : 3;
  emit(g, 'explosion', {
    x: enemy.x, y: enemy.y, radius: enemy.radius,
    enemyType: enemy.type, boss: enemy.type === 'boss', score: points,
    bossKind: enemy.bossKind, attackName: enemy.attackName, armorOpen: enemy.armorOpen, corePhase: enemy.corePhase,
    tension: Boolean(projectile.tension), weaponMode: projectile.weaponMode || 'normal', drone: Boolean(projectile.drone), chain: g.combo,
  });
  if (enemy.type === 'boss') {
    g.boss = null;
    g.bossesDefeated += 1;
    g.cycle = g.bossesDefeated + 1;
    g.stage = g.cycle;
    g.difficulty = difficultyAt(g.time, g.bossesDefeated);
    g.encounter = normalEncounter(0, g.bossesDefeated);
    g.phase = 'normal'; g.phaseTime = 0; g.normalTime = 0;
    g.returnFromNight = g.night; g.returnSpeed = g.backgroundSpeed;
    g.recoverySpawned = false; g.droneMarked = false; g.patternSection = null;
    g.nextBossAt = g.time + RULES.normalDuration;
    g.nextWaveAt = g.time + 0.7;
    clearCombat(g);
    spawnPickup(g, 'health', enemy.x - 70, enemy.y);
    emit(g, 'bossDefeated', { x: enemy.x, y: enemy.y, bossKind: enemy.bossKind, bossName: enemy.bossName,
      attackName: enemy.attackName, attackIndex: enemy.attackIndex, armorOpen: enemy.armorOpen,
      corePhase: enemy.corePhase, cycle: g.cycle, hell: g.difficulty.hell });
    emit(g, 'phaseChange', { phase: g.phase, cycle: g.cycle });
  } else if (enemy.markedDrone && !enemy.escort) {
    spawnPickup(g, 'drone', enemy.x, enemy.y);
  }
}

function damagePlayer(g, damage, x, y) {
  const p = g.player;
  if (p.invincible > 0 || g.mode !== 'playing') return;
  p.hp = Math.max(0, p.hp - damage);
  p.invincible = 0.85;
  g.shake = 11;
  g.combo = 0;
  g.comboTime = 0;
  if (g.tensionTime > 0) emit(g, 'tensionEnd', { reason: 'hit' });
  g.tensionTime = 0;
  emit(g, 'hit', { x: p.x, y: p.y, damage, player: true, sourceX: x, sourceY: y });
  if (p.hp === 0) {
    g.mode = 'gameover';
    emit(g, 'explosion', { x: p.x, y: p.y, radius: 48, player: true });
    emit(g, 'gameover', { score: g.score, time: g.time, stage: g.stage });
  }
}

function constrainPlayer(g, dt = 0) {
  const p = g.player, roll = cameraRoll(g), c = Math.cos(roll), s = Math.sin(roll);
  let screenX = WORLD_WIDTH / 2 + (p.x - WORLD_WIDTH / 2) * c - (p.y - WORLD_HEIGHT / 2) * s;
  let flightY = clamp(WORLD_HEIGHT / 2 + (p.x - WORLD_WIDTH / 2) * s + (p.y - WORLD_HEIGHT / 2) * c, FLIGHT_MIN_Y, FLIGHT_MAX_Y);
  // Small dodges use a stable camera; only broad altitude changes scroll the view.
  const delta = flightY - FLIGHT_CENTER_Y;
  const cameraTarget = Math.sign(delta) * clamp((Math.abs(delta) - 140) * 156 / 328, 0, 156);
  g.cameraY = lerp(g.cameraY || 0, cameraTarget, 1 - Math.exp(-dt * 6));
  const screenY = clamp(flightY - g.cameraY, VIEW_MIN_Y, VIEW_MAX_Y);
  flightY = screenY + g.cameraY;
  // The projected nose stays inside the left third even at the strongest bank.
  const minScreenX = WORLD_WIDTH / 2 + (70 - WORLD_WIDTH / 2 - (flightY - WORLD_HEIGHT / 2) * s) / c;
  const maxScreenX = WORLD_WIDTH / 2 + (380 - WORLD_WIDTH / 2 - (flightY - WORLD_HEIGHT / 2) * s) / c;
  screenX = clamp(screenX, Math.max(58, minScreenX), Math.min(WORLD_WIDTH * 0.33 - 44, maxScreenX));
  p.x = WORLD_WIDTH / 2 + (screenX - WORLD_WIDTH / 2) * c + (flightY - WORLD_HEIGHT / 2) * s;
  p.y = WORLD_HEIGHT / 2 - (screenX - WORLD_WIDTH / 2) * s + (flightY - WORLD_HEIGHT / 2) * c;
}

function updatePlayer(g, dt, input) {
  const p = g.player;
  p.invincible = Math.max(0, p.invincible - dt);
  for (const [timer, slot, weaponMode] of [['powerTime', 'weapon', p.weaponMode], ['droneTime', 'drone', 'drone']]) {
    const previous = p[timer];
    p[timer] = previous - dt <= 1e-9 ? 0 : previous - dt;
    if (previous > 3 + 1e-9 && p[timer] <= 3 + 1e-9) emit(g, 'weaponWarning', { slot, weaponMode });
    if (previous > 0 && p[timer] === 0) emit(g, 'weaponExpired', { slot, weaponMode });
  }
  p.fireCooldown -= dt;
  p.droneCooldown -= dt;
  const oldY = p.y;
  if (g.mode === 'entering') {
    p.entryTime = Math.min(1.2, p.entryTime + dt);
    const progress = p.entryTime / 1.2;
    p.x = -160 + 380 * (1 - (1 - progress) ** 3);
    if (p.entryTime >= 1.2 - 1e-9) { g.mode = 'playing'; p.entryTime = 1.2; }
  } else {
    const dx = clamp(Number(input.x) || 0, -1, 1);
    const dy = clamp(Number(input.y) || 0, -1, 1);
    let targetVX = dx * FLIGHT_CONTROL.horizontalSpeed;
    let targetVY = dy * FLIGHT_CONTROL.verticalSpeed;
    if (input.pointer && Number.isFinite(input.pointer.x) && Number.isFinite(input.pointer.y)) {
      targetVX = clamp((input.pointer.x - p.x) * 10, -FLIGHT_CONTROL.horizontalSpeed, FLIGHT_CONTROL.horizontalSpeed);
      targetVY = clamp((input.pointer.y - p.y) * 14, -FLIGHT_CONTROL.verticalSpeed, FLIGHT_CONTROL.verticalSpeed);
    }
    const responseX = !targetVX || targetVX * p.vx < 0 ? FLIGHT_CONTROL.horizontalBrake : FLIGHT_CONTROL.horizontalResponse;
    const responseY = !targetVY || targetVY * p.vy < 0 ? FLIGHT_CONTROL.verticalBrake : FLIGHT_CONTROL.verticalResponse;
    p.vx = lerp(p.vx || 0, targetVX, 1 - Math.exp(-dt * responseX));
    p.vy = lerp(p.vy || 0, targetVY, 1 - Math.exp(-dt * responseY));
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  p.angle = lerp(p.angle, clamp((p.y - oldY) / Math.max(dt, 0.001) / 900, -0.48, 0.48), 1 - Math.exp(-10 * dt));
  if (g.mode === 'playing') constrainPlayer(g, dt);
  if (input.shoot && g.mode === 'playing' && p.fireCooldown <= 0) firePlayer(g);
  if (input.shoot && g.mode === 'playing' && p.droneTime > 0 && p.droneCooldown <= 0) {
    playerShot(g, p.x + 5, p.y - 47, -18, false, true);
    playerShot(g, p.x + 5, p.y + 47, 18, false, true);
    emit(g, 'shot', { x: p.x + 5, y: p.y, weaponMode: 'drone', drone: true, powered: false, tension: g.tensionTime > 0 });
    p.droneCooldown = 0.17;
  }
}

function updateEnemies(g, dt, starts) {
  for (const e of g.enemies) {
    if (e.dead) continue;
    starts.set(e, { x: e.x, y: e.y, angle: e.angle || 0 });
    e.age = (e.age || 0) + dt;
    e.flash = Math.max(0, (e.flash || 0) - dt);
    e.fireFlash = Math.max(0, (e.fireFlash || 0) - dt);
    e.fireCooldown ??= 0.5;
    if (e.type === 'boss') {
      e.phase = e.hp / e.maxHp < 0.5 ? 1 : 0;
      const motion = e.motion || bossProfile(Math.max(0, BOSS_KINDS.indexOf(e.bossKind))).motion;
      if (g.phase === 'boss-entry') {
        const progress = clamp(g.phaseTime / RULES.bossEntry, 0, 1);
        Object.assign(e, screenToWorld(g, { x: lerp(1490, motion.x, 1 - (1 - progress) ** 3), y: motion.centerY }));
      } else {
        let centerY = motion.centerY;
        if (e.bossKind === 'lancer') {
          const targetY = clamp(720 - worldToScreen(g, g.player).y, 260, 440);
          if (!e.locked && !e.sequence) e.altitudeCenter = lerp(e.altitudeCenter ?? motion.centerY, targetY, 1 - Math.exp(-dt * 1.8));
          centerY = e.altitudeCenter ?? motion.centerY;
        }
        Object.assign(e, screenToWorld(g, { x: motion.x, y: centerY + Math.sin(g.phaseTime * motion.frequency) * motion.amplitude }));
        e.angle = Math.cos(g.phaseTime * motion.frequency) * motion.bank;
      }
      e.artAngle = e.angle;
      e.escortShield = e.bossKind === 'carrier' && g.enemies.some(other => !other.dead && other.escort && other.sourceBossId === e.id);
      e.dashTime = Math.max(0, (e.dashTime || 0) - dt);
    } else {
      const speed = e.speed || 0, phase = e.phase || 0, baseY = e.baseY ?? e.y;
      if (e.escort && g.boss?.id === e.sourceBossId) {
        const bossScreen = worldToScreen(g, g.boss);
        const y = clamp(bossScreen.y + (e.escortSlot ? 125 : -125), 110, 610);
        Object.assign(e, screenToWorld(g, { x: 820 + Math.sin(e.age * 1.8 + e.escortSlot * Math.PI) * 32, y }));
        e.angle = Math.sin(e.age * 1.8) * 0.12;
      } else if (e.pattern && (e.holdUntil > g.time || e.sequence || e.locked)) {
        e.x = Math.max(960, e.x - speed * dt);
        const roll = cameraRoll(g);
        const sy = clamp(e.holdScreenY || 360, e.radius + 60, 660 - e.radius);
        e.y = 360 + (sy + g.cameraY - 360 - (e.x - 640) * Math.sin(roll)) / Math.cos(roll);
        e.angle = Math.sin(e.age) * 0.04;
      } else if (e.type === 'wasp' && e.dashTime > 0) {
        e.x += Math.cos(e.attackAngle) * 660 * dt;
        e.y += Math.sin(e.attackAngle) * 660 * dt;
        e.angle = e.attackAngle - Math.PI;
        e.dashTime = Math.max(0, e.dashTime - dt);
      } else if (e.type === 'claw') {
        e.x -= speed * (e.x < 1030 && e.age < 3 ? 0.23 : 1) * dt;
        e.y = baseY + Math.sin(e.age * 2 + phase) * 60;
        e.angle = Math.cos(e.age * 2 + phase) * 0.18;
      } else if (e.type === 'mantis') {
        e.x -= speed * dt;
        e.y = baseY + Math.asin(Math.sin(e.age * 2.7 + phase)) * 74;
        e.angle = Math.cos(e.age * 2.7 + phase) > 0 ? 0.27 : -0.27;
      } else if (e.type === 'ray') {
        e.x -= speed * dt;
        e.y = baseY + Math.sin(e.age * 1.25 + phase) * 125;
        e.angle = Math.cos(e.age * 1.25 + phase) * 0.2;
      } else if (e.type === 'orb') {
        e.x -= speed * (e.x < 990 && e.age < 3.8 ? 0.28 : 1) * dt;
        e.y = baseY + Math.sin(e.age * 2.3 + phase) * 60;
        e.angle = e.age * 1.5;
      } else if (e.type === 'needle') {
        e.x -= speed * (e.locked ? 0.2 : 0.65) * dt;
        if (!e.locked) e.y = baseY + Math.sin(e.age * 0.8 + phase) * 55;
        e.angle = e.locked ? e.attackAngle - Math.PI : Math.cos(e.age * 0.8 + phase) * 0.05;
      } else {
        e.x -= speed * (e.type === 'wasp' && e.locked ? 0.14 : 1) * dt;
        const amplitude = e.type === 'worm' ? 75 : e.type === 'dragonfly' ? 60 : 34;
        const frequency = e.type === 'worm' ? 1.9 : e.type === 'dragonfly' ? 3.4 : 2.1;
        e.y = baseY + Math.sin(e.age * frequency + phase) * amplitude;
        e.angle = Math.cos(e.age * frequency + phase) * 0.18;
      }
    }
    updateAttack(g, e, dt);
  }
  g.enemies = g.enemies.filter(e => !e.dead && e.x > -200 && e.y > FLIGHT_MIN_Y - 260 && e.y < FLIGHT_MAX_Y + 260);
}

function updateProjectiles(g, dt, playerStart, enemyStarts) {
  const hostileStarts = new Map(g.enemyBullets.map(b => [b, { x: b.x, y: b.y, arming: b.arming || 0 }]));
  for (const bullet of [...g.bullets, ...g.enemyBullets]) {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.age = (bullet.age || 0) + dt;
    if (bullet.weaponMode === 'helix') bullet.y = bullet.baseY + Math.sin(bullet.age * 15 + bullet.phase) * Math.min(62, bullet.age * 175);
    if (bullet.arming) bullet.arming = Math.max(0, bullet.arming - dt);
  }
  for (const bullet of g.bullets) {
    if (bullet.dead) continue;
    for (const enemy of g.enemies) {
      if (enemy.dead || (enemy.type === 'boss' && g.phase === 'boss-entry') || enemy.x > WORLD_WIDTH + enemy.radius || bullet.hits?.includes(enemy.id)) continue;
      if (overlapsEnemy(enemy, bullet, 0.82)) {
        if (bullet.pierce > 0) { bullet.pierce -= 1; bullet.hits.push(enemy.id); }
        else bullet.dead = true;
        const art = getMechaSpec(enemy), core = enemy.coreVulnerable && art?.runtimeCore;
        const coreHit = Boolean(core && distanceSquared(bullet, mechaAnchorWorld(enemy, core)) < (bullet.radius + core.radius) ** 2);
        const escortShield = enemy.bossKind === 'carrier' && g.enemies.some(other => !other.dead && other.escort && other.sourceBossId === enemy.id);
        enemy.hp -= bullet.power * (coreHit ? 1.2 : 1) * (escortShield ? 0.7 : 1);
        enemy.flash = 0.07;
        emit(g, 'hit', { x: bullet.x, y: bullet.y, player: false, enemyType: enemy.type,
          boss: enemy.type === 'boss', bossKind: enemy.bossKind, attackName: enemy.attackName,
          attackIndex: enemy.attackIndex, armorOpen: Boolean(enemy.armorOpen), corePhase: enemy.corePhase || 0, coreHit,
          weaponMode: bullet.weaponMode || 'normal', drone: Boolean(bullet.drone), tension: Boolean(bullet.tension), impactCue: bullet.impactCue });
        if (enemy.hp <= 0) destroyEnemy(g, enemy, bullet);
        break;
      }
    }
  }
  if (g.mode === 'playing' && g.phase !== 'boss-entry') {
    const damageFrom = playerStart.invincible > 0 && g.player.invincible === 0 ? Math.min(1, playerStart.invincible / dt) : 0;
    const grazes = [];
    for (const bullet of g.enemyBullets) {
      if (bullet.dead || bullet.arming > 0) continue;
      const start = hostileStarts.get(bullet);
      if (!start) continue;
      const activeFrom = Math.max(damageFrom, Math.min(1, start.arming / dt));
      const from = { x: start.x - playerStart.x, y: start.y - playerStart.y };
      const to = { x: bullet.x - g.player.x, y: bullet.y - g.player.y };
      const radius = bullet.radius + g.player.radius;
      if (sweptInsideCircle(from, to, radius, activeFrom)) {
        bullet.dead = true;
        damagePlayer(g, bullet.power || 13, bullet.x, bullet.y);
        if (g.mode === 'gameover') break;
      } else if (!bullet.grazed && playerStart.invincible <= 0
        && relativeMinimumDistance(from, to, activeFrom) <= radius + RULES.grazeMargin + 1e-9) grazes.push(bullet);
    }
    if (g.mode === 'playing') {
      for (const enemy of g.enemies) {
        const start = enemyStarts.get(enemy);
        if (!enemy.dead && start && sweptPlayerEnemy(g.player, playerStart, enemy, start, damageFrom)) {
          damagePlayer(g, enemy.type === 'boss' ? 30 : 22, enemy.x, enemy.y);
          if (g.mode === 'gameover') break;
        }
      }
    }
    // Damage wins across the whole step, regardless of projectile/body array order.
    if (g.mode === 'playing' && g.player.invincible <= 0 && grazes.length) {
      const refresh = g.tensionTime > 0;
      for (const bullet of grazes) bullet.grazed = true;
      g.tensionTime = TENSION_DURATION;
      emit(g, 'tension', { x: g.player.x, y: g.player.y, refresh, remaining: TENSION_DURATION, count: grazes.length });
    }
  }
  const visible = b => {
    const { x: screenX, y: screenY } = worldToScreen(g, b);
    return !b.dead && screenX > -80 && screenX < WORLD_WIDTH + 120 && screenY > -100 && screenY < WORLD_HEIGHT + 100 && b.age < 9;
  };
  g.bullets = g.bullets.filter(visible);
  g.enemyBullets = g.enemyBullets.filter(visible);
  g.enemies = g.enemies.filter(e => !e.dead);
}

function applyPickup(g, item) {
  const p = g.player;
  let effect = item.type;
  if (item.type === 'health') p.hp = Math.min(p.maxHp, p.hp + 30);
  if (item.type === 'change' || item.type === 'power') {
    // Legacy test/manual power pickups stay valid, but no legacy scheduler creates them.
    p.weaponMode = item.weaponMode || ['spread', 'lance', 'helix'][p.powerPickups++ % 3];
    p.powerTime = WEAPON_DURATION;
    effect = 'change';
  }
  if (item.type === 'maintain') {
    if (p.powerTime > 0) { p.powerTime = Math.min(WEAPON_MAX_DURATION, p.powerTime + RULES.extension); effect = 'extend'; }
    else if (p.basicLevel < 5) { p.basicLevel++; effect = 'levelUp'; }
    else { p.droneTime = DRONE_DURATION; effect = 'drone'; }
  }
  if (item.type === 'drone') p.droneTime = DRONE_DURATION;
  if (item.type === 'health' || item.type === 'drone' || item.type === 'power') g.score += 50;
  emit(g, 'pickup', { x: item.x, y: item.y, pickupType: item.type, itemType: item.type,
    effect, weaponMode: p.weaponMode, basicLevel: p.basicLevel, side: item.side });
}

function updatePickups(g, dt, playerStart) {
  for (const item of g.pickups) {
    const start = { x: item.x, y: item.y }, oldAge = item.age || 0;
    item.age = Number.isFinite(item.arrivalAt) ? g.time - item.arrivalAt : oldAge + dt;
    if (Math.abs(item.age) < 1e-9) item.age = 0;
    if (!item.attracting && Number.isFinite(item.arrivalAt)) {
      // Approach and collection share one flight-space path. Reprojecting it
      // keeps both altitude lanes stable as the camera rolls and follows the ship.
      const remaining = Math.max(0, -item.age);
      const slowdown = (RULES.supplyApproachX - RULES.supplyX - RULES.supplySpeed * RULES.supplyWarning) / RULES.supplyWarning ** 2;
      const x = RULES.supplyX - RULES.supplySpeed * item.age + slowdown * remaining ** 2;
      Object.assign(item, screenToWorld(g, { x, y: item.flightY - g.cameraY }));
      item.approach = item.age < 0;
    } else if (!item.attracting) {
      item.x -= (item.side ? RULES.supplySpeed : 240) * dt;
      if (!item.side) item.y = (item.baseY ?? item.y) + Math.sin(item.age * 2.2 + (item.phase || 0)) * 9;
    }
    // The approaching supply is already a real, visible item. Catch it just
    // like health instead of rejecting nearby flybys until the preview ends.
    const activeFrom = 0;
    const activeTo = item.side ? clamp((RULES.supplyLifetime - oldAge) / dt, 0, 1) : 1;
    const from = { x: start.x - playerStart.x, y: start.y - playerStart.y };
    const to = { x: item.x - g.player.x, y: item.y - g.player.y };
    const rear = PICKUP_ATTRACTION.rearExtension, roll = cameraRoll(g);
    // A second overlapping circle extends only the rear. Sweep both centers
    // with the camera roll so fast relative movement cannot skip the catch.
    const rearFrom = { x: from.x + Math.cos(playerStart.roll) * rear, y: from.y - Math.sin(playerStart.roll) * rear };
    const rearTo = { x: to.x + Math.cos(roll) * rear, y: to.y - Math.sin(roll) * rear };
    if (!item.attracting && g.mode === 'playing' && activeTo > activeFrom && Math.min(
      relativeMinimumDistance(from, to, activeFrom, activeTo),
      relativeMinimumDistance(rearFrom, rearTo, activeFrom, activeTo)) < PICKUP_ATTRACTION.radius) {
      item.attracting = true;
      item.approach = false;
      item.attractTime = 0;
      item.attractFrom = { x: item.x, y: item.y };
      item.attractDistance = Math.hypot(item.x - g.player.x, item.y - g.player.y);
      emit(g, 'pickupAttract', { x: g.player.x, y: g.player.y, pickupType: item.type, itemType: item.type, side: item.side });
    }
    if (item.attracting && g.mode === 'playing') {
      item.attractTime = Math.min(PICKUP_ATTRACTION.duration, item.attractTime + dt);
      const progress = item.attractTime / PICKUP_ATTRACTION.duration;
      // Constant-speed travel keeps the full path readable; no slow start or
      // steep ease-out that collapses a nearby supply in one rendered frame.
      item.x = lerp(item.attractFrom.x, g.player.x, progress);
      item.y = lerp(item.attractFrom.y, g.player.y, progress);
    }
    const visibleTravel = item.attractTime >= PICKUP_ATTRACTION.minVisibleDuration || item.attractDistance <= PICKUP_ATTRACTION.absorbRadius;
    if (item.attracting && visibleTravel && distanceSquared(item, g.player) <= PICKUP_ATTRACTION.absorbRadius ** 2) {
      item.dead = true;
      applyPickup(g, item);
      const status = g.supply?.items.find(entry => entry.id === item.supplyItemId);
      if (status) { status.status = 'collected'; status.remaining = 0; }
    }
    if (item.side && !item.attracting && item.age >= RULES.supplyLifetime) {
      item.dead = true;
      const status = g.supply?.items.find(entry => entry.id === item.supplyItemId);
      if (status?.status === 'active') { status.status = 'expired'; status.remaining = 0; }
    }
  }
  g.pickups = g.pickups.filter(item => !item.dead && (item.attracting || worldToScreen(g, item).x > -60));
}

function updateSupply(g) {
  if (g.time >= g.nextPickupAt - RULES.supplyWarning - 1e-9 && (!g.supply || g.supply.arrivalAt !== g.nextPickupAt)) {
    const candidates = ['spread', 'lance', 'helix'].filter(mode => !(g.player.powerTime > 0 && mode === g.player.weaponMode));
    const weaponMode = candidates[Math.floor(random(g) * candidates.length)];
    const changeTop = random(g) < 0.5;
    g.supply = { id: nextId(g), arrivalAt: g.nextPickupAt,
      items: ['top', 'bottom'].map((side, index) => ({ id: nextId(g), side,
        type: (index === 0) === changeTop ? 'change' : 'maintain', weaponMode,
        status: 'preview', remaining: Math.max(0, g.nextPickupAt - g.time) })) };
    for (const entry of g.supply.items) {
      const flightY = entry.side === 'top' ? RULES.supplyTop : RULES.supplyBottom;
      const position = screenToWorld(g, { x: RULES.supplyApproachX, y: flightY - g.cameraY });
      g.pickups.push({ id: nextId(g), ...position, radius: 22, age: -RULES.supplyWarning,
        arrivalAt: g.supply.arrivalAt, flightY, approach: true, phase: 0,
        side: entry.side, type: entry.type, weaponMode: entry.weaponMode, supplyItemId: entry.id });
    }
    emit(g, 'supplyWarning', { arrivalAt: g.nextPickupAt });
  }
  if (!g.supply) return;
  for (const entry of g.supply.items) {
    if (entry.status === 'preview' && g.time >= g.supply.arrivalAt - 1e-9) {
      entry.status = 'active';
    }
    if (entry.status === 'preview') entry.remaining = Math.max(0, g.supply.arrivalAt - g.time);
    else if (entry.status === 'active') entry.remaining = Math.max(0, RULES.supplyLifetime - (g.time - g.supply.arrivalAt));
  }
  if (g.time >= g.nextPickupAt - 1e-9) {
    g.nextPickupAt += RULES.supplyInterval;
    emit(g, 'supplyArrived');
  }
}

function updatePhase(g, dt) {
  g.phaseTime += dt;
  if (g.phase === 'normal') {
    const previousNormalTime = g.normalTime;
    g.normalTime += dt;
    if (previousNormalTime < RULES.quietAt - 1e-9 && g.normalTime >= RULES.quietAt - 1e-9) {
      const profile = bossProfile(g.bossesDefeated);
      emit(g, 'bossWarning', { bossKind: profile.kind, bossName: profile.name, remaining: 3, hell: profile.hell });
    }
    if (g.time >= g.nextBossAt - 1e-9) spawnBoss(g);
  } else if (g.phase === 'boss-entry' && g.phaseTime >= RULES.bossEntry - 1e-9) {
    g.phase = 'boss'; g.phaseTime = 0;
    if (g.boss?.bossKind === 'carrier') spawnEscorts(g, g.boss);
    emit(g, 'phaseChange', { phase: g.phase, cycle: g.cycle });
  }
  const smooth = t => { const n = clamp(t, 0, 1); return n * n * (3 - 2 * n); };
  if (g.phase === 'normal') {
    const keys = [[0, 1], [15, 1.35], [30, 1.8], [42, RULES.normalEndSpeed], [45, RULES.normalEndSpeed]];
    let desired = RULES.normalEndSpeed;
    for (let i = 1; i < keys.length; i++) if (g.normalTime <= keys[i][0]) {
      desired = lerp(keys[i - 1][1], keys[i][1], smooth((g.normalTime - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]))); break;
    }
    const returning = smooth(g.normalTime / RULES.dayTransition);
    g.night = g.returnFromNight * (1 - returning);
    g.backgroundSpeed = lerp(g.returnSpeed || 1, desired, returning);
  } else {
    const progress = g.phase === 'boss' ? 1 : smooth(g.phaseTime / RULES.nightTransition);
    g.night = progress;
    g.backgroundSpeed = lerp(RULES.normalEndSpeed, RULES.bossSpeed, progress);
  }
  g.daylight = 1 - g.night;
  g.speed = RULES.baseScroll * g.backgroundSpeed;
}

function step(g, dt, input) {
  g.sceneTime += dt;
  g.scrollTime += dt * g.speed;
  g.shake = Math.max(0, g.shake - dt * 32);
  if (g.mode === 'title') {
    g.targetAltitude = 0.42 + Math.sin(g.sceneTime * 0.085) * 0.32;
    g.altitude = lerp(g.altitude, g.targetAltitude, 1 - Math.exp(-dt * 0.32));
    return;
  }
  const wasPlaying = g.mode === 'playing';
  if (wasPlaying) {
    g.time += dt;
    g.difficulty = difficultyAt(g.time, g.bossesDefeated);
    g.cycle = g.bossesDefeated + 1; g.stage = g.cycle;
    updatePhase(g, dt);
    const oldTension = g.tensionTime;
    g.tensionTime = Math.max(0, g.tensionTime - dt);
    if (oldTension > 0 && g.tensionTime === 0) emit(g, 'tensionEnd', { reason: 'expired' });
  }
  g.comboTime = Math.max(0, g.comboTime - dt);
  if (g.comboTime === 0) g.combo = 0;
  const playerStart = { x: g.player.x, y: g.player.y, invincible: g.player.invincible, roll: cameraRoll(g) };
  updatePlayer(g, dt, input);
  const flightY = worldToScreen(g, g.player).y + g.cameraY;
  const flightAltitude = clamp((FLIGHT_MAX_Y - flightY) / (FLIGHT_MAX_Y - FLIGHT_MIN_Y), 0, 1);
  g.flightAltitude = flightAltitude;
  const routeOffset = Math.cos(g.time * 0.12) * 0.15 * 4 * flightAltitude * (1 - flightAltitude);
  g.targetAltitude = clamp(flightAltitude + routeOffset, 0, 1);
  g.altitude = lerp(g.altitude, g.targetAltitude, 1 - Math.exp(-dt * 1.1));
  if (g.mode === 'playing') constrainPlayer(g);
  if (wasPlaying) {
    updateSupply(g);
    if (g.phase === 'normal') {
      g.encounter = normalEncounter(g.normalTime, g.bossesDefeated);
      const section = g.encounter.blockId;
      if (section !== g.patternSection) { g.patternSection = section; if (Number.isFinite(g.nextWaveAt)) g.nextWaveAt = Math.min(g.nextWaveAt, g.time); }
      if (g.normalTime < RULES.quietAt && g.time >= g.nextWaveAt) {
        spawnWave(g); g.nextWaveAt = g.time + g.difficulty.waveInterval;
      }
      if (g.normalTime >= 24 && !g.recoverySpawned) {
        const position = screenToWorld(g, { x: 650, y: 360 });
        spawnPickup(g, 'health', position.x, position.y); g.recoverySpawned = true;
      }
    }
  }
  const enemyStarts = new Map();
  updateEnemies(g, dt, enemyStarts);
  updateProjectiles(g, dt, playerStart, enemyStarts);
  if (g.mode !== 'gameover') updatePickups(g, dt, playerStart);
}

/** Advance at a fixed maximum substep so fast shots cannot skip small targets. */
export function updateGame(g, dt, input = {}) {
  if (g.mode === 'gameover' || g.mode === 'paused' || !Number.isFinite(dt) || dt <= 0) return g;
  let remaining = Math.min(dt, 0.12);
  while (remaining > 0.000001 && g.mode !== 'gameover') {
    const amount = Math.min(remaining, 1 / 120);
    step(g, amount, input);
    remaining -= amount;
  }
  return g;
}
