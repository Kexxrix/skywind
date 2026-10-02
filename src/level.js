// Combat difficulty rises only after a real boss defeat. The sixth row is bounded hell.
export const LEVEL_RULES = Object.freeze({ normalDuration: 45, quietAt: 42, bossEntry: 1.2,
  baseScroll: 1.7, normalEndSpeed: 2.2, bossSpeed: 4.6, nightTransition: 0.8, dayTransition: 1,
  firstSupply: 6, supplyInterval: 15, supplyWarning: 3, supplyLifetime: 2.1,
  supplyApproachX: 1380, supplyX: 360, supplySpeed: 150, supplyTop: -60, supplyBottom: 780,
  weaponDuration: 18, extension: 15, weaponMaximum: 45, droneDuration: 15,
  tensionDuration: 2, grazeMargin: 12, tensionDamage: 1.5,
});

const TIERS = [
  { maxEnemies: 10, maxAttackers: 2, maxEnemyBullets: 120, maxPatternBullets: 24, maxSequenceBullets: 72,
    bulletSpeed: 120, maxBulletSpeed: 160, fireInterval: 1.9, bossFireInterval: 1.65,
    minTelegraph: 0.75, minimumFlightTime: 0.9, corridorWidth: 80, enemySpeed: 1, bossHp: 420, waveInterval: 1.8, waveSize: 4 },
  { maxEnemies: 12, maxAttackers: 3, maxEnemyBullets: 180, maxPatternBullets: 32, maxSequenceBullets: 112,
    bulletSpeed: 145, maxBulletSpeed: 340, fireInterval: 1.65, bossFireInterval: 1.45,
    minTelegraph: 0.65, minimumFlightTime: 0.7, corridorWidth: 48, enemySpeed: 1.07, bossHp: 540, waveInterval: 1.65, waveSize: 5 },
  { maxEnemies: 14, maxAttackers: 4, maxEnemyBullets: 240, maxPatternBullets: 36, maxSequenceBullets: 144,
    bulletSpeed: 155, maxBulletSpeed: 340, fireInterval: 1.4, bossFireInterval: 1.25,
    minTelegraph: 0.58, minimumFlightTime: 0.65, corridorWidth: 44, enemySpeed: 1.14, bossHp: 660, waveInterval: 1.5, waveSize: 5 },
  { maxEnemies: 16, maxAttackers: 5, maxEnemyBullets: 300, maxPatternBullets: 40, maxSequenceBullets: 176,
    bulletSpeed: 170, maxBulletSpeed: 340, fireInterval: 1.15, bossFireInterval: 1.1,
    minTelegraph: 0.5, minimumFlightTime: 0.6, corridorWidth: 40, enemySpeed: 1.22, bossHp: 800, waveInterval: 1.35, waveSize: 6 },
  { maxEnemies: 18, maxAttackers: 6, maxEnemyBullets: 360, maxPatternBullets: 44, maxSequenceBullets: 208,
    bulletSpeed: 185, maxBulletSpeed: 340, fireInterval: 0.95, bossFireInterval: 0.95,
    minTelegraph: 0.45, minimumFlightTime: 0.55, corridorWidth: 36, enemySpeed: 1.3, bossHp: 960, waveInterval: 1.2, waveSize: 6 },
  { maxEnemies: 20, maxAttackers: 7, maxEnemyBullets: 420, maxPatternBullets: 48, maxSequenceBullets: 240,
    bulletSpeed: 200, maxBulletSpeed: 340, fireInterval: 0.78, bossFireInterval: 0.85,
    minTelegraph: 0.4, minimumFlightTime: 0.5, corridorWidth: 32, enemySpeed: 1.38, bossHp: 1120, waveInterval: 1.05, waveSize: 7 },
];

export function trialDifficulty(bossesDefeated = 0) {
  const victories = Math.max(0, Math.floor(Number.isFinite(bossesDefeated) ? bossesDefeated : 0));
  const pace = Math.min(5, victories);
  return { ...TIERS[pace], pace, tier: victories + 1, hell: pace === 5,
    hpBonus: [0, 0, 1, 1, 2, 2][pace], recovery: false, scrollSpeed: LEVEL_RULES.baseScroll };
}

const role = (type, count, lane, pattern, formation = 'stagger', holdSeconds = 6) =>
  ({ type, count, lane, ...(pattern ? { pattern, holdSeconds } : {}), formation });
const block = (until, id, pattern, roles, extra = {}) => ({ until, id, pattern, roles, ...extra });
// Explicit block scripts make altitude, target priority and forbidden overlap part of the runtime contract.
const ENCOUNTERS = [
  [block(6, 'opening', null, [role('beetle', 3, 240), role('dragonfly', 2, 480)]),
    block(14, 'ring-introduction', 'B01', [role('orb', 1, 360, 'B01'), role('beetle', 3, 240)], { safeLanes: [240, 360, 480] }),
    block(22, 'zigzag-introduction', 'B02', [role('claw', 1, 360, 'B02'), role('dragonfly', 3, 112)], { aimLimit: 0 }),
    block(31, 'fan-introduction', 'B03', [role('worm', 1, 480, 'B03'), role('beetle', 3, 240)], { safeLanes: [240, 360] }),
    block(39, 'window-introduction', 'B04', [role('ray', 1, 360, 'B04'), role('dragonfly', 2, 112)], { movementWindow: true, aimLimit: 0, safeLanes: [240, 360, 480] })],
  [block(8, 'aim-training', null, [role('beetle', 3, 240), role('needle', 1, 480)]),
    block(20, 'aim-and-ring', 'B01', [role('orb', 1, 360, 'B01'), role('beetle', 3, 112)], { safeLanes: [240, 480] }),
    block(33, 'aim-and-fan', 'B03', [role('worm', 1, 480, 'B03'), role('needle', 1, 240), role('dragonfly', 2, 112)], { safeLanes: [240, 360] }),
    block(40, 'window-recap', 'B04', [role('ray', 1, 360, 'B04'), role('beetle', 2, 112)], { movementWindow: true, aimLimit: 0, safeLanes: [360, 480] })],
  [block(8, 'altitude-introduction', null, [role('mantis', 2, 240), role('dragonfly', 3, 480)], { aimLimit: 1 }),
    block(20, 'upper-guns', 'B02', [role('claw', 1, 180, 'B02', 'column'), role('beetle', 3, 608)], { aimLimit: 1 }),
    block(33, 'central-route', 'B04', [role('ray', 1, 480, 'B04', 'column'), role('dragonfly', 3, 112)], { movementWindow: true, aimLimit: 0, safeLanes: [300, 360, 420] }),
    block(40, 'altitude-recombination', 'B03', [role('worm', 1, 240, 'B03'), role('mantis', 2, 480), role('beetle', 1, 112)], { safeLanes: [240, 480] })],
  [block(8, 'position-training', null, [role('beetle', 3, 360), role('needle', 1, 240)], { aimLimit: 1 }),
    block(20, 'stepped-route', 'B05', [role('ray', 1, 360, 'B05', 'column', 7), role('dragonfly', 3, 112)], { movementWindow: true, aimLimit: 0, safeLanes: [240, 360, 480] }),
    block(33, 'moving-route', 'B04', [role('ray', 1, 480, 'B04', 'column', 7), role('beetle', 2, 112)], { movementWindow: true, aimLimit: 0, safeLanes: [240, 360] }),
    block(40, 'zigzag-release', 'B02', [role('claw', 1, 240, 'B02'), role('mantis', 2, 480)], { aimLimit: 1 })],
  [block(8, 'ring-recall', 'B01', [role('orb', 1, 360, 'B01'), role('dragonfly', 3, 112)], { safeLanes: [240, 480] }),
    block(20, 'fan-and-aim', 'B03', [role('worm', 1, 480, 'B03'), role('needle', 1, 240), role('beetle', 2, 112)], { safeLanes: [240, 360] }),
    block(33, 'lane-climax', 'B05', [role('ray', 1, 360, 'B05', 'column', 7), role('mantis', 2, 608)], { movementWindow: true, aimLimit: 0, safeLanes: [240, 360, 480] }),
    block(40, 'window-climax', 'B04', [role('ray', 1, 240, 'B04', 'column', 7), role('dragonfly', 3, 608)], { movementWindow: true, aimLimit: 0, safeLanes: [360, 480] })],
  [block(8, 'hell-fan', 'B03', [role('worm', 1, 480, 'B03'), role('needle', 1, 240), role('dragonfly', 3, 112)], { safeLanes: [240, 360] }),
    block(20, 'hell-ring', 'B01', [role('orb', 1, 360, 'B01'), role('mantis', 2, 480), role('needle', 1, 240)], { safeLanes: [240, 480] }),
    block(33, 'hell-lanes', 'B05', [role('ray', 1, 360, 'B05', 'column', 8), role('dragonfly', 4, 112)], { movementWindow: true, aimLimit: 0, safeLanes: [240, 360, 480] }),
    block(40, 'hell-window', 'B04', [role('ray', 1, 480, 'B04', 'column', 8), role('beetle', 3, 112)], { movementWindow: true, aimLimit: 0, safeLanes: [300, 360, 420] })],
];
const THEMES = ['CONTROL / BREAK', 'AIM / RHYTHM', 'ALTITUDE / CHOICE', 'POSITION / ROUTE', 'RECOMBINE / CLIMAX', 'HELL / ENDURE'];

export function normalEncounter(time, bossesDefeated = 0) {
  const d = trialDifficulty(bossesDefeated), t = Math.max(0, Number.isFinite(time) ? time : 0);
  const source = t >= LEVEL_RULES.quietAt ? block(45, 'boss-warning', null, [], { aimLimit: 0 })
    : ENCOUNTERS[d.pace].find(entry => t < entry.until)
      || block(42, 'reorganize', null, [role('beetle', 2, 240), role('dragonfly', 2, 480)], { aimLimit: 1 });
  return { blockId: `${d.pace + 1}:${source.id}`, theme: THEMES[d.pace], pattern: source.pattern,
    roles: source.roles.map(entry => ({ ...entry })), until: source.until,
    aimLimit: source.aimLimit ?? (d.pace === 0 ? 1 : d.pace < 3 ? 2 : 3),
    // A pattern and aimed pressure are two families. Two unrelated curtain families never stack.
    maxPatternFamilies: 1, maxAttackFamilies: 2, movementWindow: source.movementWindow || false,
    safeLanes: [...(source.safeLanes || [240, 360, 480])], overlapGroup: source.movementWindow ? 'route-only' : 'pattern-and-aim' };
}

export function normalPattern(time, bossesDefeated = 0) {
  return normalEncounter(time, bossesDefeated).pattern;
}

const BOSS_PROFILES = [
  { kind: 'warden', name: 'WARDEN', radius: 92, hpMultiplier: 1,
    motion: { x: 1030, centerY: 320, amplitude: 155, frequency: 0.82, bank: 0.075 },
    attackOrder: ['B01', 'aim', 'B04'], safeLanes: [240, 360, 480], mechanic: 'ring-to-window' },
  { kind: 'carrier', name: 'IRON CARRIER', radius: 95, hpMultiplier: 1.05,
    motion: { x: 1035, centerY: 320, amplitude: 65, frequency: 0.42, bank: 0.03 },
    attackOrder: ['B04', 'B03', 'escort', 'aim'], safeLanes: [360, 480, 240], mechanic: 'escort-target-priority' },
  { kind: 'lancer', name: 'SKY LANCER', radius: 87, hpMultiplier: 1.04,
    motion: { x: 1045, centerY: 340, amplitude: 110, frequency: 0.63, bank: 0.11 },
    attackOrder: ['B02', 'aim', 'B04', 'B03'], safeLanes: [300, 420, 360], mechanic: 'altitude-crossfire' },
  { kind: 'bastion', name: 'GATE BASTION', radius: 101, hpMultiplier: 1.05,
    motion: { x: 1030, centerY: 350, amplitude: 38, frequency: 0.34, bank: 0.02 },
    attackOrder: ['B05', 'B04', 'aim', 'B05'], safeLanes: [240, 360, 480], mechanic: 'prepositioned-gates' },
  { kind: 'apex', name: 'APEX SERAPH', radius: 96, hpMultiplier: 1.08,
    motion: { x: 1040, centerY: 330, amplitude: 130, frequency: 0.56, bank: 0.095 },
    attackOrder: ['B01', 'aim', 'B03', 'B05', 'B04'], safeLanes: [360, 240, 480], mechanic: 'learned-pattern-chain' },
];
export const LEVEL_BOSS_KINDS = Object.freeze(BOSS_PROFILES.map(profile => profile.kind));

export function bossProfile(bossesDefeated = 0) {
  const victories = trialDifficulty(bossesDefeated).tier - 1;
  const source = BOSS_PROFILES[victories % BOSS_PROFILES.length];
  return { ...source, motion: { ...source.motion }, attackOrder: [...source.attackOrder], safeLanes: [...source.safeLanes],
    hell: victories >= 5, variant: victories % BOSS_PROFILES.length };
}

export function bossAttack(bossesDefeated = 0, attackIndex = 0) {
  const profile = bossProfile(bossesDefeated), d = trialDifficulty(bossesDefeated);
  const index = Math.max(0, Math.floor(Number.isFinite(attackIndex) ? attackIndex : 0));
  const pattern = profile.attackOrder[index % profile.attackOrder.length];
  const movementWindow = pattern === 'B04' || pattern === 'B05';
  return { pattern, safeLane: profile.safeLanes[Math.floor(index / profile.attackOrder.length) % profile.safeLanes.length],
    telegraph: Math.max(d.minTelegraph, pattern === 'B05' ? 1.05 : pattern === 'B04' ? 0.95 : 0.8),
    pauseAfter: movementWindow ? (d.hell ? 1.1 : 1.25) : pattern === 'escort' ? 0.8 : 0.35,
    armorOpen: pattern !== 'escort', corePhase: index % profile.attackOrder.length,
    movementWindow, aimLimit: movementWindow ? 0 : d.pace ? 2 : 1, aimLock: 'release' };
}

export function attackPolicy(pattern = 'aim', pace = 0) {
  const d = trialDifficulty(pace), route = pattern === 'B04' || pattern === 'B05';
  return { family: pattern === 'aim' ? 'aim' : pattern === 'escort' ? 'escort' : 'pattern',
    maxPatternFamilies: 1, maxAttackFamilies: 2, aimLimit: route ? 0 : d.pace === 0 ? 1 : d.pace < 3 ? 2 : 3,
    movementWindow: route, forbidden: route ? ['aim', 'B01', 'B02', 'B03', 'B04', 'B05'] : ['B04', 'B05'],
    minFlightTime: d.minimumFlightTime, minTelegraph: d.minTelegraph };
}

export function basicWeapon(level = 1) {
  return [
    { offsets: [-8, 8], damage: 1 }, { offsets: [-8, 8], damage: 1.4 },
    { offsets: [-12, 0, 12], damage: 1.4 }, { offsets: [-12, 0, 12], damage: 1.8 },
    { offsets: [-18, -6, 6, 18], damage: 1.8 },
  ][Math.max(0, Math.min(4, Math.floor(level) - 1))];
}
