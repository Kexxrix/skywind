export const WORLD_WIDTH = 1280;
export const WORLD_HEIGHT = 720;
export const FLIGHT_CENTER_Y = 360;
export const FLIGHT_MIN_Y = -108;
export const FLIGHT_MAX_Y = 828;
export const VIEW_MIN_Y = 48;
export const VIEW_MAX_Y = 672;
export const WEAPON_DURATION = 14;
export const DRONE_DURATION = 15;
export const ENEMY_TYPES = ['beetle', 'wasp', 'claw', 'dragonfly', 'worm', 'ray', 'mantis', 'orb', 'needle'];
export const BOSS_KINDS = ['warden', 'carrier', 'leviathan', 'hive'];
export const MAX_ENEMY_BULLET_SPEED = 420;
// The old 2.6px marker's 1.5px centered stroke left a 1.85px clear nucleus.
export const PLAYER_HIT_RADIUS = 1.85;
const PLAYER_PICKUP_REACH = 17 + 14;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const lerp = (a, b, amount) => a + (b - a) * amount;
const distanceSquared = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

export function cameraRoll(g) {
  return clamp(-0.18 + Math.sin(g.sceneTime * 0.18) * 0.055 + (g.altitude - 0.5) * 0.025 + g.player.angle * 0.03, -0.27, -0.09);
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
    gauge: clamp(remaining / WEAPON_DURATION, 0, 1),
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

// Combat pressure is independent of the retained scenery speed and stage counter.
const DIFFICULTY_PHASES = [
  { at: 0, waveInterval: 2.5, waveSize: 2, maxEnemies: 6, maxAttackers: 1, bulletSpeed: 200, maxBulletSpeed: 220, maxPatternBullets: 3, maxEnemyBullets: 40, fireInterval: 1.9, bossFireInterval: 1.9 },
  { at: 60, waveInterval: 2.3, waveSize: 3, maxEnemies: 8, maxAttackers: 2, bulletSpeed: 210, maxBulletSpeed: 250, maxPatternBullets: 5, maxEnemyBullets: 60, fireInterval: 1.8, bossFireInterval: 1.8 },
  { at: 180, waveInterval: 2, waveSize: 4, maxEnemies: 10, maxAttackers: 3, bulletSpeed: 240, maxBulletSpeed: 280, maxPatternBullets: 9, maxEnemyBullets: 85, fireInterval: 1.7, bossFireInterval: 1.6 },
  { at: 300, waveInterval: 1.8, waveSize: 5, maxEnemies: 12, maxAttackers: 4, bulletSpeed: 265, maxBulletSpeed: 310, maxPatternBullets: 12, maxEnemyBullets: 110, fireInterval: 1.6, bossFireInterval: 1.5 },
  { at: 420, waveInterval: 1.65, waveSize: 6, maxEnemies: 14, maxAttackers: 5, bulletSpeed: 285, maxBulletSpeed: 330, maxPatternBullets: 16, maxEnemyBullets: 135, fireInterval: 1.5, bossFireInterval: 1.4 },
];
const COMBAT_SECONDS = 24, RECOVERY_SECONDS = 6;

export function difficultyAt(time, bossesDefeated = 0) {
  const t = Math.max(0, time);
  const pace = DIFFICULTY_PHASES.findLastIndex(phase => t >= phase.at);
  const phase = DIFFICULTY_PHASES[pace], next = DIFFICULTY_PHASES[pace + 1] || phase;
  const progress = phase === next ? 0 : (t - phase.at) / (next.at - phase.at);
  return {
    ...phase, pace,
    tier: 1 + Math.floor(t / 18) + bossesDefeated,
    waveInterval: lerp(phase.waveInterval, next.waveInterval, progress),
    enemySpeed: 1 + Math.min(0.5, t / 600),
    bulletSpeed: lerp(phase.bulletSpeed, next.bulletSpeed, progress),
    hpBonus: Math.min(2, Math.floor(t / 180)),
    recovery: t >= 60 && (t - 60) % (COMBAT_SECONDS + RECOVERY_SECONDS) >= COMBAT_SECONDS,
    scrollSpeed: 1.3 + Math.min(1.3, t / 95),
  };
}

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
    cameraY: 0,
    speed: 1.3,
    difficulty: difficultyAt(0),
    shake: 0,
    boss: null,
    bossesDefeated: 0,
    nextBossAt: 120,
    nextWaveAt: 0.7,
    nextPickupAt: 3,
    pickupIndex: 0,
    waveIndex: 0,
    player: {
      x: -160, y: 360, radius: PLAYER_HIT_RADIUS,
      hp: 100, maxHp: 100,
      angle: 0, vx: 0, vy: 0, invincible: 0,
      powerTime: 0, droneTime: 0,
      weaponMode: 'spread', powerPickups: 0,
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

export function startGame(g) {
  const sceneTime = g.sceneTime;
  const scrollTime = g.scrollTime;
  const altitude = g.altitude, targetAltitude = g.targetAltitude;
  Object.assign(g, createGame(g.seed));
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
  const type = ENEMY_TYPES[wave % ENEMY_TYPES.length];
  const heavy = ['worm', 'ray', 'orb', 'needle'].includes(type);
  const desired = heavy ? Math.max(2, g.difficulty.waveSize - 2) : g.difficulty.waveSize;
  const count = Math.max(0, Math.min(desired, g.difficulty.maxEnemies - g.enemies.length));
  const baseY = screenToWorld(g, { x: 1100, y: 120 + random(g) * 400 }).y;
  const direction = wave % 2 ? -1 : 1;
  for (let i = 0; i < count; i += 1) {
    const offset = wave % 3 === 0 ? (i - (count - 1) / 2) * 70 * direction
      : wave % 3 === 1 ? Math.sin(i * 1.1) * 145 : (i % 2 ? -110 : 110);
    const screen = worldToScreen(g, { x: 1100, y: baseY + offset });
    const y = screenToWorld(g, { x: screen.x, y: clamp(screen.y, 100, 590) }).y;
    spawnEnemy(g, type, WORLD_WIDTH + 30 + i * (type === 'worm' ? 170 : 65), y, i);
  }
  emit(g, 'wave', { enemyType: type, count, tier: g.stage });
}

function spawnBoss(g) {
  if (g.enemies.length >= g.difficulty.maxEnemies) return;
  const variant = g.bossesDefeated % BOSS_KINDS.length;
  const bossKind = BOSS_KINDS[variant];
  const hp = [320, 390, 410, 430][variant] + g.bossesDefeated * 70 + Math.floor(g.time * 0.35);
  const x = WORLD_WIDTH + 210, roll = cameraRoll(g);
  const y = 360 + (315 + g.cameraY - 360 - (x - 640) * Math.sin(roll)) / Math.cos(roll);
  const boss = {
    id: nextId(g), type: 'boss',
    bossKind, bossName: ['WARDEN', 'IRON CARRIER', 'LEVIATHAN', 'QUEEN HIVE'][variant], variant,
    behavior: bossKind, x, y, baseY: y,
    radius: [92, 95, 78, 90][variant], hp, maxHp: hp,
    angle: 0, age: 0, phase: 0,
    speed: 75, score: 3500 + g.bossesDefeated * 1500,
    fireCooldown: 0.4, flash: 0, attack: 0, telegraph: 0,
    chargeTime: 0, locked: false, attackAngle: Math.PI, attackName: '',
    safeLane: 330, safeAngle: Math.PI, dashTime: 0, dead: false,
    spawnedAt: g.time, nextEscortAt: g.time + 20,
  };
  g.boss = boss;
  g.enemies.push(boss);
  emit(g, 'boss', { x: boss.x, y: boss.y, level: g.bossesDefeated + 1, bossKind, bossName: boss.bossName });
}

function playerShot(g, x, y, vy, powered = false, drone = false) {
  g.bullets.push({
    id: nextId(g), x, y, vx: drone ? 1120 : 1360,
    vy, radius: powered ? 7 : 5,
    power: powered ? 2 : 1, powered, drone, age: 0,
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
      Object.assign(g.bullets.at(-1), { power: 3, pierce: 2, hits: [] });
    }
  } else if (powered && p.weaponMode === 'helix') {
    for (const phase of [0, Math.PI, Math.PI / 2, Math.PI * 1.5]) {
      playerShot(g, muzzle.x + 2, muzzle.y, Math.sin(phase) * 150, true);
      Object.assign(g.bullets.at(-1), { phase, baseY: muzzle.y });
    }
  } else if (powered) {
    for (const vy of [-225, -105, 0, 105, 225]) {
      playerShot(g, muzzle.x + 2, muzzle.y + vy * 0.037, vy, true);
    }
  } else {
    playerShot(g, muzzle.x + 2, muzzle.y - 8, 0);
    playerShot(g, muzzle.x + 2, muzzle.y + 8, 0);
  }
  p.fireCooldown = powered ? 0.085 : 0.095;
  emit(g, 'shot', { x: muzzle.x, y: muzzle.y, powered, weaponMode: powered ? p.weaponMode : 'normal' });
}

function enemyBullet(g, e, angle, speed, options = {}) {
  if (g.enemyBullets.length >= g.difficulty.maxEnemyBullets || e.attackBullets >= g.difficulty.maxPatternBullets) return;
  const velocity = Math.min(MAX_ENEMY_BULLET_SPEED, g.difficulty.maxBulletSpeed, speed);
  e.attackBullets = (e.attackBullets || 0) + 1;
  g.enemyBullets.push({
    id: nextId(g), sourceId: e.id, x: e.x - e.radius * 0.7, y: e.y,
    vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
    radius: e.type === 'boss' ? 7 : 5.5,
    power: e.type === 'boss' ? 17 : 12,
    type: e.type === 'boss' ? 'plasma' : 'orb',
    color: e.type === 'boss' ? '#ff663b' : '#ffbd70', age: 0,
    ...options,
  });
}

function fan(g, e, count, spread, speed, angle = e.attackAngle, options = {}) {
  const limited = Math.min(count, g.difficulty.maxPatternBullets - (e.attackBullets || 0));
  for (let i = 0; i < limited; i += 1) enemyBullet(g, e, angle + (i - (limited - 1) / 2) * spread, speed, options);
}

function angularDistance(a, b) { return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))); }

function fireBoss(g, e) {
  e.attackBullets = 0;
  const speed = g.difficulty.bulletSpeed;
  const budget = g.difficulty.maxPatternBullets;
  const pattern = e.attack % 3;
  if (e.bossKind === 'carrier') {
    if (pattern === 0) {
      // The tell and wall share viewport coordinates, including the current camera.
      const count = Math.min(14, budget);
      const screenX = worldToScreen(g, { x: e.x - 120, y: e.y }).x;
      for (let i = 0; i < count; i += 1) {
        const y = 30 + i * 640 / (count - 1);
        if (Math.abs(y - e.safeLane) >= 90) {
          const origin = screenToWorld(g, { x: screenX, y });
          enemyBullet(g, e, Math.PI - cameraRoll(g), speed * 0.88, { ...origin, type: 'needle' });
        }
      }
    } else if (pattern === 1) {
      for (const dy of [-95, 95]) fan(g, e, Math.min(4, Math.floor(budget / 2)), 0.22, speed, e.attackAngle, { y: e.y + dy });
    } else {
      const count = Math.min(3, g.difficulty.waveSize - 1);
      if (!g.difficulty.recovery) for (let i = 0; i < count; i += 1) spawnEnemy(g, i % 2 ? 'dragonfly' : 'wasp', e.x + i * 48, 95 + i * 140, i);
      fan(g, e, 3, 0.3, speed * 0.9);
    }
  } else if (e.bossKind === 'leviathan') {
    if (pattern === 0) {
      for (const direction of [-1, 1]) fan(g, e, Math.min(5, Math.floor(budget / 2)), 0.18, speed, e.attackAngle + direction * 0.24, { y: e.y + direction * 70 });
    } else if (pattern === 1) {
      // Two crescents leave the locked target line open; move into that seam.
      for (const direction of [-1, 1]) fan(g, e, Math.min(4, Math.floor(budget / 2)), 0.13, speed + 18, e.attackAngle + direction * 0.56);
    } else {
      e.dashTime = 1.15;
      fan(g, e, 7, 0.24, speed * 0.82);
    }
  } else if (e.bossKind === 'hive') {
    if (pattern === 1) {
      const count = Math.min(5, budget);
      for (let i = 0; i < count; i += 1) enemyBullet(g, e, Math.PI, 115, { x: e.x - 130 - i * 38, y: 70 + i * 135, type: 'mine', radius: 12, arming: 0.8, power: 19 });
    } else {
      const count = Math.min(e.phase ? 22 : 18, budget - (pattern === 2 ? 3 : 0));
      for (let i = 0; i < count; i += 1) {
        const angle = i * Math.PI * 2 / count + e.attack * 0.11;
        if (angularDistance(angle, e.safeAngle) > 0.3) enemyBullet(g, e, angle, speed * 0.83);
      }
      if (pattern === 2) fan(g, e, 3, 0.26, speed + 30);
    }
  } else if (pattern === 0) fan(g, e, e.phase ? 9 : 7, 0.18, speed);
  else if (pattern === 1) {
    const count = Math.min(12, budget);
    for (let i = 0; i < count; i += 1) {
      const angle = Math.PI / 2 + 0.1 + i * (Math.PI - 0.2) / (count - 1);
      if (angularDistance(angle, e.safeAngle) > 0.24) enemyBullet(g, e, angle, speed * 0.86);
    }
  } else fan(g, e, 3, 0.32, speed + 55, e.attackAngle, { type: 'needle' });
  e.attack += 1;
  e.fireCooldown = g.difficulty.bossFireInterval - (e.phase ? 0.15 : 0);
  emit(g, 'enemyShot', { x: e.x - 80, y: e.y, enemyId: e.id, bulletCount: e.attackBullets, boss: true, bossKind: e.bossKind, attackName: e.attackName });
}

function fireEnemy(g, e) {
  e.attackBullets = 0;
  const speed = g.difficulty.bulletSpeed;
  if (g.difficulty.pace === 0 && e.type !== 'wasp') {
    fan(g, e, 1, 0, speed);
  } else switch (e.type) {
    case 'wasp':
      // Keep the locked trajectory through the exit; reverting to the formation
      // sine path mid-screen would teleport the body after its first dive.
      e.dashTime = 4;
      break;
    case 'claw':
      fan(g, e, g.difficulty.pace >= 2 ? 5 : 3, 0.24, speed);
      break;
    case 'worm':
      fan(g, e, 2, 0.38, speed * 0.85);
      break;
    case 'mantis':
      for (const offset of [-0.27, 0.27]) enemyBullet(g, e, e.attackAngle + offset, speed + 10);
      break;
    case 'ray':
      for (const offset of [-120, -60, 60, 120]) enemyBullet(g, e, Math.PI, speed * 0.86, { y: e.y + offset });
      break;
    case 'orb':
      for (let i = 0, count = Math.min(9, g.difficulty.maxPatternBullets); i < count; i += 1) {
        const angle = Math.PI / 2 + i * Math.PI / (count - 1);
        if (angularDistance(angle, e.attackAngle) > 0.3) enemyBullet(g, e, angle, speed * 0.8);
      }
      break;
    case 'needle':
      fan(g, e, g.difficulty.pace >= 2 ? 3 : 1, 0.12, speed + 70, e.attackAngle, { type: 'needle' });
      break;
    default:
      fan(g, e, e.type === 'beetle' && g.difficulty.pace >= 2 ? 2 : 1, 0.23, speed);
  }
  e.attack += 1;
  e.fireCooldown = g.difficulty.fireInterval + random(g) * 0.2;
  emit(g, 'enemyShot', { x: e.x - e.radius, y: e.y, enemyId: e.id, bulletCount: e.attackBullets, boss: false, enemyType: e.type });
}

function updateAttack(g, e, dt) {
  const boss = e.type === 'boss';
  // Do not lock or fire from offscreen, or when an enemy has passed the fight corridor.
  const screen = worldToScreen(g, e);
  if (e.x < 470 || screen.x - e.radius < 0 || screen.x + e.radius > WORLD_WIDTH
    || screen.y - e.radius < 50 || screen.y + e.radius > 670) { e.locked = false; e.telegraph = 0; return; }
  if (e.x > (boss ? 1150 : 1230) || e.dashTime > 0) return;
  if (!e.locked) {
    e.fireCooldown -= dt;
    if (e.fireCooldown > 0) return;
    if (g.difficulty.recovery) return;
    // Keep a source reserved briefly after release so later enemies in this same
    // update cannot replace it and turn one allowed source into a volley pileup.
    const attackers = g.enemies.filter(other => !other.dead && other !== e
      && (other.locked || other.dashTime > 0 || other.attackActiveUntil > g.time)).length;
    if (attackers >= g.difficulty.maxAttackers) return;
    e.locked = true;
    e.attackAngle = Math.atan2(g.player.y - e.y, g.player.x - e.x);
    e.safeAngle = e.attackAngle;
    e.safeLane = [160, 350, 540][Math.floor(e.attack / 3) % 3];
    e.chargeDuration = boss ? (e.bossKind === 'carrier' ? 1 : 0.8) : e.type === 'needle' ? 0.75 : e.type === 'wasp' ? 0.6 : 0.34;
    e.chargeTime = e.chargeDuration;
    e.attackName = boss ? {
      warden: ['fan', 'arc-gap', 'needle-burst'],
      carrier: ['lane-wall', 'crossfire', 'escort-launch'],
      leviathan: ['double-crescent', 'split-seam', 'surge'],
      hive: ['petal-gap', 'minefield', 'spiral'],
    }[e.bossKind || 'warden'][e.attack % 3] : e.behavior;
  }
  e.chargeTime = Math.max(0, e.chargeTime - dt);
  e.telegraph = Math.max(0.03, 1 - e.chargeTime / e.chargeDuration);
  if (e.chargeTime === 0) {
    if (boss) fireBoss(g, e); else fireEnemy(g, e);
    e.attackActiveUntil = g.time + 0.9;
    e.locked = false;
    e.telegraph = 0;
  }
}

function destroyEnemy(g, enemy) {
  if (enemy.dead) return;
  enemy.dead = true;
  g.combo += 1;
  g.comboTime = 3.5;
  const multiplier = Math.min(5, 1 + Math.floor(g.combo / 8));
  const points = (enemy.score || 100) * multiplier;
  g.score += points;
  g.shake = enemy.type === 'boss' ? 20 : 3;
  emit(g, 'explosion', {
    x: enemy.x, y: enemy.y, radius: enemy.radius,
    enemyType: enemy.type, boss: enemy.type === 'boss', score: points,
  });
  if (enemy.type === 'boss') {
    g.boss = null;
    g.bossesDefeated += 1;
    g.nextBossAt = g.time + Math.max(28, 38 - g.bossesDefeated * 2);
    g.nextWaveAt = g.time + 2.1;
    g.enemyBullets.length = 0;
    spawnPickup(g, 'health', enemy.x - 70, enemy.y - 70);
    spawnPickup(g, 'power', enemy.x - 100, enemy.y + 75);
    emit(g, 'bossDefeated', { x: enemy.x, y: enemy.y, bossKind: enemy.bossKind });
  } else if (random(g) < 0.08) {
    const type = g.player.hp < 65 && random(g) < 0.7 ? 'health' : random(g) < 0.65 ? 'power' : 'drone';
    spawnPickup(g, type, enemy.x, enemy.y);
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
    p[timer] = Math.max(0, previous - dt);
    if (previous > 3 && p[timer] <= 3) emit(g, 'weaponWarning', { slot, weaponMode });
    if (previous > 0 && p[timer] === 0) emit(g, 'weaponExpired', { slot, weaponMode });
  }
  p.fireCooldown -= dt;
  p.droneCooldown -= dt;
  const oldY = p.y;
  if (g.mode === 'entering') {
    p.entryTime = Math.min(1.2, p.entryTime + dt);
    const progress = p.entryTime / 1.2;
    p.x = -160 + 380 * (1 - (1 - progress) ** 3);
    if (p.entryTime >= 1.2) g.mode = 'playing';
  } else {
    const dx = clamp(Number(input.x) || 0, -1, 1);
    const dy = clamp(Number(input.y) || 0, -1, 1);
    let targetVX = dx * 225;
    let targetVY = dy * 490;
    if (input.pointer && Number.isFinite(input.pointer.x) && Number.isFinite(input.pointer.y)) {
      targetVX = clamp((input.pointer.x - p.x) * 7, -225, 225);
      targetVY = clamp((input.pointer.y - p.y) * 11, -490, 490);
    }
    p.vx = lerp(p.vx || 0, targetVX, 1 - Math.exp(-dt * 7));
    p.vy = lerp(p.vy || 0, targetVY, 1 - Math.exp(-dt * 16));
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  p.angle = lerp(p.angle, clamp((p.y - oldY) / Math.max(dt, 0.001) / 900, -0.48, 0.48), 1 - Math.exp(-10 * dt));
  if (g.mode === 'playing') constrainPlayer(g, dt);
  if (input.shoot && g.mode === 'playing' && p.fireCooldown <= 0) firePlayer(g);
  if (input.shoot && g.mode === 'playing' && p.droneTime > 0 && p.droneCooldown <= 0) {
    playerShot(g, p.x + 5, p.y - 47, -18, false, true);
    playerShot(g, p.x + 5, p.y + 47, 18, false, true);
    emit(g, 'shot', { x: p.x + 5, y: p.y, weaponMode: 'drone', drone: true, powered: false });
    p.droneCooldown = 0.17;
  }
}

function updateEnemies(g, dt, starts) {
  for (const e of g.enemies) {
    if (e.dead) continue;
    starts.set(e, { x: e.x, y: e.y, angle: e.angle || 0 });
    e.age = (e.age || 0) + dt;
    e.flash = Math.max(0, (e.flash || 0) - dt);
    e.fireCooldown ??= 0.5;
    if (e.type === 'boss') {
      e.phase = e.hp / e.maxHp < 0.5 ? 1 : 0;
      if (e.bossKind === 'leviathan') {
        const destination = e.dashTime > 0 ? 610 : 1040;
        e.x = lerp(e.x, destination, 1 - Math.exp(-dt * (e.dashTime > 0 ? 5 : 2)));
        e.y = 315 + Math.sin(e.age * 1.05) * 165;
        e.angle = Math.cos(e.age * 1.05) * 0.17;
      } else if (e.bossKind === 'carrier') {
        e.x = Math.max(1035, e.x - 240 * dt);
        e.y = 320 + Math.sin(e.age * 0.42) * 65;
        e.angle = Math.cos(e.age * 0.42) * 0.03;
      } else if (e.bossKind === 'hive') {
        e.x = Math.max(1015, e.x - 260 * dt);
        e.y = 320 + Math.sin(e.age * 0.7) * 125;
        e.angle = Math.sin(e.age * 0.9) * 0.1;
      } else {
        e.x = Math.max(1030, e.x - 265 * dt);
        e.y = 320 + Math.sin(e.age * 0.82) * 155;
        e.angle = Math.cos(e.age * 0.82) * 0.075;
      }
      // Retain each boss's vertical path in the visible flight corridor as the
      // player's wider altitude travel moves the camera. Its world X is unchanged.
      const roll = cameraRoll(g), screenY = e.y;
      e.y = 360 + (screenY + g.cameraY - 360 - (e.x - 640) * Math.sin(roll)) / Math.cos(roll);
      e.dashTime = Math.max(0, (e.dashTime || 0) - dt);
    } else {
      const speed = e.speed || 0, phase = e.phase || 0, baseY = e.baseY ?? e.y;
      if (e.type === 'wasp' && e.dashTime > 0) {
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
      if (enemy.dead || enemy.x > WORLD_WIDTH + enemy.radius || bullet.hits?.includes(enemy.id)) continue;
      if (overlapsEnemy(enemy, bullet, 0.82)) {
        if (bullet.pierce > 0) { bullet.pierce -= 1; bullet.hits.push(enemy.id); }
        else bullet.dead = true;
        enemy.hp -= bullet.power;
        enemy.flash = 0.07;
        emit(g, 'hit', { x: bullet.x, y: bullet.y, player: false, enemyType: enemy.type, weaponMode: bullet.weaponMode || 'normal', drone: Boolean(bullet.drone) });
        if (enemy.hp <= 0) destroyEnemy(g, enemy);
        break;
      }
    }
  }
  if (g.mode === 'playing') {
    const damageFrom = playerStart.invincible > 0 && g.player.invincible === 0 ? Math.min(1, playerStart.invincible / dt) : 0;
    for (const bullet of g.enemyBullets) {
      if (bullet.dead || bullet.arming > 0) continue;
      const start = hostileStarts.get(bullet);
      const activeFrom = Math.max(damageFrom, Math.min(1, start.arming / dt));
      if (sweptInsideCircle({ x: start.x - playerStart.x, y: start.y - playerStart.y },
        { x: bullet.x - g.player.x, y: bullet.y - g.player.y }, bullet.radius + g.player.radius, activeFrom)) {
        bullet.dead = true;
        damagePlayer(g, bullet.power || 13, bullet.x, bullet.y);
        if (g.mode === 'gameover') break;
      }
    }
    if (g.mode === 'playing') {
      for (const enemy of g.enemies) {
        if (!enemy.dead && sweptPlayerEnemy(g.player, playerStart, enemy, enemyStarts.get(enemy), damageFrom)) {
          damagePlayer(g, enemy.type === 'boss' ? 30 : 22, enemy.x, enemy.y);
          if (g.mode === 'gameover') break;
        }
      }
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

function updatePickups(g, dt) {
  for (const item of g.pickups) {
    item.age = (item.age || 0) + dt;
    item.x -= 240 * dt;
    item.y = (item.baseY ?? item.y) + Math.sin(item.age * 2.2 + (item.phase || 0)) * 9;
    if (g.mode === 'playing' && distanceSquared(item, g.player) < (item.radius + PLAYER_PICKUP_REACH) ** 2) {
      item.dead = true;
      if (item.type === 'health') g.player.hp = Math.min(g.player.maxHp, g.player.hp + 30);
      if (item.type === 'power') {
        g.player.powerTime = WEAPON_DURATION;
        g.player.weaponMode = ['spread', 'lance', 'helix'][g.player.powerPickups++ % 3];
      }
      if (item.type === 'drone') g.player.droneTime = DRONE_DURATION;
      g.score += 50;
      emit(g, 'pickup', { x: item.x, y: item.y, pickupType: item.type, itemType: item.type, weaponMode: g.player.weaponMode });
    }
  }
  g.pickups = g.pickups.filter(item => !item.dead && worldToScreen(g, item).x > -60);
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
  g.time += dt;
  g.difficulty = difficultyAt(g.time, g.bossesDefeated);
  g.stage = g.difficulty.tier;
  g.speed = g.difficulty.scrollSpeed;
  g.comboTime = Math.max(0, g.comboTime - dt);
  if (g.comboTime === 0) g.combo = 0;
  const playerStart = { x: g.player.x, y: g.player.y, invincible: g.player.invincible };
  updatePlayer(g, dt, input);
  const flightY = worldToScreen(g, g.player).y + g.cameraY;
  const flightAltitude = clamp((FLIGHT_MAX_Y - flightY) / (FLIGHT_MAX_Y - FLIGHT_MIN_Y), 0, 1);
  // The route only nudges the middle; either screen edge always selects the full altitude limit.
  const routeOffset = Math.cos(g.time * 0.12) * 0.15 * 4 * flightAltitude * (1 - flightAltitude);
  g.targetAltitude = clamp(flightAltitude + routeOffset, 0, 1);
  g.altitude = lerp(g.altitude, g.targetAltitude, 1 - Math.exp(-dt * 1.1));
  if (g.mode === 'playing') constrainPlayer(g);
  if (g.mode === 'playing') {
    if (!g.boss && !g.difficulty.recovery && g.time >= g.nextBossAt) spawnBoss(g);
    if (g.boss && !g.difficulty.recovery && g.time >= g.boss.nextEscortAt) {
      const count = Math.min(3, g.difficulty.waveSize - 1);
      for (let i = 0; i < count; i += 1) {
        spawnEnemy(g, i % 2 ? 'wasp' : 'beetle', WORLD_WIDTH + 35 + i * 70, 95 + i * 140, i);
      }
      g.boss.nextEscortAt = g.time + Math.max(12, 20 - g.difficulty.pace * 2);
    }
    if (!g.boss && !g.difficulty.recovery && g.time >= g.nextWaveAt) {
      spawnWave(g);
      g.nextWaveAt = g.time + g.difficulty.waveInterval;
    }
    if (g.time >= g.nextPickupAt) {
      const types = ['power', 'health', 'drone', 'health'];
      const type = g.player.hp <= 35 ? 'health' : types[g.pickupIndex++ % types.length];
      spawnPickup(g, type, WORLD_WIDTH + 35, clamp(g.player.y + (random(g) - 0.5) * 150, FLIGHT_MIN_Y + 75, FLIGHT_MAX_Y - 75));
      g.nextPickupAt = g.time + 10;
    }
  }
  const enemyStarts = new Map();
  updateEnemies(g, dt, enemyStarts);
  updateProjectiles(g, dt, playerStart, enemyStarts);
  if (g.mode !== 'gameover') updatePickups(g, dt);
}

/** Advance at a fixed maximum substep so fast shots cannot skip small targets. */
export function updateGame(g, dt, input = {}) {
  if (g.mode === 'gameover' || !Number.isFinite(dt) || dt <= 0) return g;
  let remaining = Math.min(dt, 0.12);
  while (remaining > 0.000001 && g.mode !== 'gameover') {
    const amount = Math.min(remaining, 1 / 120);
    step(g, amount, input);
    remaining -= amount;
  }
  return g;
}
