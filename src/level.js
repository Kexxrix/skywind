import { SNAPSHOT_SPEEDS } from './barrage.js';

// Combat difficulty rises only after a real boss defeat. The sixth row is bounded hell.
export const LEVEL_RULES = Object.freeze({ normalDuration: 45, quietAt: 42, bossEntry: 1.2,
  baseScroll: 1.7, normalEndSpeed: 2.2, bossSpeed: 4.6, nightTransition: 0.8, dayTransition: 1,
  firstSupply: 6, supplyInterval: 15, supplyWarning: 3, supplyLifetime: 2.1,
  supplyApproachX: 1380, supplyX: 360, supplySpeed: 150, supplyTop: -60, supplyBottom: 780,
  weaponDuration: 18, extension: 15, weaponMaximum: 45, droneDuration: 15,
  tensionDuration: 2, grazeMargin: 12, tensionDamage: 1.5,
});

const TIERS = [
  { maxEnemies: 12, maxAttackers: 3, maxEnemyBullets: 180, maxPatternBullets: 24, maxSequenceBullets: 72,
    bulletSpeed: 150, maxBulletSpeed: SNAPSHOT_SPEEDS[0], fireInterval: 1.9, bossFireInterval: 1.65,
    minTelegraph: 0.75, minimumFlightTime: 0.9, corridorWidth: 80, enemySpeed: 1, bossHp: 420, waveInterval: 1.55, waveSize: 5 },
  { maxEnemies: 12, maxAttackers: 3, maxEnemyBullets: 180, maxPatternBullets: 32, maxSequenceBullets: 112,
    bulletSpeed: 170, maxBulletSpeed: SNAPSHOT_SPEEDS[1], fireInterval: 1.65, bossFireInterval: 1.45,
    minTelegraph: 0.65, minimumFlightTime: 0.7, corridorWidth: 48, enemySpeed: 1.07, bossHp: 540, waveInterval: 1.65, waveSize: 5 },
  { maxEnemies: 14, maxAttackers: 4, maxEnemyBullets: 240, maxPatternBullets: 36, maxSequenceBullets: 144,
    bulletSpeed: 185, maxBulletSpeed: SNAPSHOT_SPEEDS[2], fireInterval: 1.4, bossFireInterval: 1.25,
    minTelegraph: 0.58, minimumFlightTime: 0.65, corridorWidth: 44, enemySpeed: 1.14, bossHp: 660, waveInterval: 1.5, waveSize: 5 },
  { maxEnemies: 16, maxAttackers: 5, maxEnemyBullets: 300, maxPatternBullets: 40, maxSequenceBullets: 176,
    bulletSpeed: 195, maxBulletSpeed: SNAPSHOT_SPEEDS[3], fireInterval: 1.15, bossFireInterval: 1.1,
    minTelegraph: 0.5, minimumFlightTime: 0.6, corridorWidth: 40, enemySpeed: 1.22, bossHp: 800, waveInterval: 1.35, waveSize: 6 },
  { maxEnemies: 18, maxAttackers: 6, maxEnemyBullets: 360, maxPatternBullets: 44, maxSequenceBullets: 208,
    bulletSpeed: 210, maxBulletSpeed: SNAPSHOT_SPEEDS[4], fireInterval: 0.95, bossFireInterval: 0.95,
    minTelegraph: 0.45, minimumFlightTime: 0.55, corridorWidth: 36, enemySpeed: 1.3, bossHp: 960, waveInterval: 1.2, waveSize: 6 },
  { maxEnemies: 20, maxAttackers: 7, maxEnemyBullets: 420, maxPatternBullets: 48, maxSequenceBullets: 240,
    bulletSpeed: 220, maxBulletSpeed: SNAPSHOT_SPEEDS[5], fireInterval: 0.78, bossFireInterval: 0.85,
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
  [block(8, 'opening', 'trident', [role('orb', 1, 540, 'trident'), role('worm', 1, 180, 'loom'), role('dart', 1, 520, 'rail'), role('beetle', 2, 360)]),
    block(16, 'ring-introduction', 'trident', [role('orb', 1, 540, 'trident'), role('ray', 1, 180, 'seed'), role('dart', 1, 520, 'rail'), role('beetle', 1, 240), role('wasp', 1, 480)]),
    block(24, 'zigzag-introduction', 'zipper', [role('claw', 1, 180, 'zipper'), role('worm', 1, 540, 'loom'), role('dart', 1, 520, 'rail'), role('dragonfly', 2, 112)]),
    block(32, 'fan-introduction', 'petal', [role('worm', 1, 540, 'petal'), role('ray', 1, 180, 'seed'), role('dart', 1, 520, 'rail'), role('beetle', 2, 112)]),
    block(39, 'window-introduction', 'B04', [role('ray', 1, 180, 'B04'), role('claw', 1, 540, 'zipper'), role('dart', 1, 520, 'rail'), role('dragonfly', 2, 112)], { safeLanes: [240, 440] }),
    block(42, 'departure', null, [role('scarab', 1, 480, 'deploy'), role('beetle', 2, 240), role('pincer', 1, 360, 'lunge')])],
  [block(8, 'prefill-training', 'halo', [role('worm', 1, 360, 'halo', 'column', 8), role('dart', 1, 240, 'rail'), role('wasp', 1, 480), role('beetle', 2, 112)]),
    block(18, 'petal-and-snapshot', 'petal', [role('worm', 1, 480, 'petal', 'column', 8), role('needle', 1, 240, 'loom'), role('dragonfly', 3, 112)]),
    block(28, 'loom-and-weave', 'loom', [role('ray', 1, 360, 'seed', 'column', 8), role('mantis', 1, 180, 'zipper'), role('dart', 1, 480, 'rail'), role('beetle', 2, 608)]),
    block(36, 'jaws-and-body', 'jaws', [role('ray', 1, 360, 'seed'), role('pincer', 1, 240, 'lunge'), role('wasp', 1, 480), role('mantis', 2, 112)]),
    block(40, 'window-recap', 'B04', [role('ray', 1, 480, 'seed'), role('dart', 1, 240, 'rail'), role('dragonfly', 3, 112)], { safeLanes: [280, 440] }),
    block(42, 'departure', null, [role('scarab', 1, 360, 'deploy'), role('beetle', 2, 240), role('wasp', 1, 480)])],
  [block(8, 'slow-prefill', 'halo', [role('worm', 1, 360, 'halo', 'column', 8), role('dart', 1, 480, 'rail'), role('wasp', 1, 240), role('beetle', 2, 112)]),
    block(17, 'curve-crossfire', 'petal', [role('worm', 1, 480, 'petal', 'column', 8), role('mantis', 1, 180, 'zipper'), role('dart', 1, 360, 'rail'), role('dragonfly', 2, 112)]),
    block(27, 'woven-contact', 'loom', [role('worm', 1, 480, 'loom', 'column', 8), role('mantis', 1, 240, 'zipper'), role('needle', 1, 360, 'loom'), role('beetle', 2, 112)]),
    block(35, 'closing-pressure', 'jaws', [role('ray', 1, 360, 'seed'), role('pincer', 1, 240, 'lunge'), role('wasp', 1, 480), role('mantis', 2, 608)]),
    block(40, 'altitude-recombination', 'B04', [role('ray', 1, 240, 'seed'), role('dart', 1, 480, 'rail'), role('scarab', 1, 360, 'deploy'), role('dragonfly', 2, 112)], { safeLanes: [220, 460] }),
    block(42, 'departure', null, [role('beetle', 2, 240), role('wasp', 1, 480), role('pincer', 1, 360, 'lunge')])],
  [block(8, 'stepped-route', 'B05', [role('ray', 1, 360, 'seed', 'column', 8), role('dart', 1, 240, 'rail'), role('wasp', 1, 480), role('beetle', 3, 112)], { safeLanes: [220, 440] }),
    block(18, 'counterflow', 'zipper', [role('mantis', 1, 240, 'zipper', 'column', 8), role('worm', 1, 480, 'petal'), role('needle', 1, 360, 'loom'), role('dragonfly', 3, 112)]),
    block(28, 'filled-loom', 'loom', [role('ray', 1, 480, 'seed', 'column', 8), role('worm', 1, 240, 'halo'), role('dart', 1, 360, 'rail'), role('beetle', 3, 608)]),
    block(36, 'closing-pincer', 'jaws', [role('ray', 1, 360, 'seed'), role('pincer', 2, 240, 'lunge', 'pincer'), role('wasp', 1, 480), role('mantis', 2, 112)]),
    block(40, 'bay-interception', 'petal', [role('scarab', 1, 360, 'deploy'), role('worm', 1, 480, 'petal'), role('dart', 1, 240, 'rail'), role('dragonfly', 3, 112)]),
    block(42, 'departure', null, [role('wasp', 1, 480), role('beetle', 3, 240), role('pincer', 1, 360, 'lunge')])],
  [block(8, 'ring-recall', 'halo', [role('worm', 1, 360, 'halo', 'column', 8), role('mantis', 1, 240, 'zipper'), role('dart', 1, 480, 'rail'), role('dragonfly', 3, 112)]),
    block(18, 'curved-loom', 'petal', [role('worm', 1, 480, 'petal', 'column', 8), role('ray', 1, 240, 'seed'), role('needle', 1, 360, 'loom'), role('beetle', 3, 112)]),
    block(28, 'gate-counterflow', 'B05', [role('ray', 1, 360, 'seed', 'column', 8), role('mantis', 1, 180, 'zipper'), role('dart', 1, 480, 'rail'), role('mantis', 3, 608)], { safeLanes: [210, 430] }),
    block(36, 'jaws-release', 'jaws', [role('ray', 1, 360, 'seed'), role('pincer', 2, 240, 'lunge', 'pincer'), role('wasp', 1, 480), role('beetle', 2, 112)]),
    block(40, 'bay-climax', 'loom', [role('scarab', 1, 360, 'deploy'), role('ray', 1, 480, 'seed'), role('dart', 1, 240, 'rail'), role('dragonfly', 3, 608)]),
    block(42, 'departure', null, [role('wasp', 1, 240), role('beetle', 3, 480), role('pincer', 1, 360, 'lunge')])],
  [block(8, 'hell-petal', 'petal', [role('worm', 1, 480, 'petal', 'column', 8), role('mantis', 1, 240, 'zipper'), role('dart', 1, 360, 'rail'), role('dragonfly', 4, 112)]),
    block(18, 'hell-halo', 'halo', [role('worm', 1, 360, 'halo', 'column', 8), role('ray', 1, 480, 'seed'), role('needle', 1, 240, 'loom'), role('mantis', 3, 608)]),
    block(28, 'hell-gates', 'B05', [role('ray', 1, 360, 'seed', 'column', 8), role('mantis', 1, 180, 'zipper'), role('dart', 1, 480, 'rail'), role('dragonfly', 4, 112)], { safeLanes: [200, 420] }),
    block(36, 'hell-jaws', 'jaws', [role('ray', 1, 360, 'seed'), role('pincer', 2, 240, 'lunge', 'pincer'), role('wasp', 1, 480), role('beetle', 3, 112)]),
    block(40, 'hell-bay', 'loom', [role('scarab', 1, 360, 'deploy'), role('ray', 1, 480, 'seed'), role('dart', 1, 240, 'rail'), role('dragonfly', 4, 608)]),
    block(42, 'departure', null, [role('wasp', 1, 240), role('pincer', 2, 480, 'lunge', 'pincer'), role('beetle', 3, 112)])],
];
const THEMES = ['CONTROL / BREAK', 'PREFILL / SNAPSHOT', 'CONTACT / CHOICE', 'COUNTERFLOW / ROUTE', 'RECOMBINE / CLIMAX', 'HELL / ENDURE'];

// Field emitters hold outside the default firing line; their visible first release precedes the delayed lock burst.
function scheduledRole(entry, pace) {
  const result = { ...entry };
  if (result.type === 'wasp') { result.pattern = 'lunge'; result.holdSeconds = 6; }
  if (!result.pattern || ['lunge', 'deploy'].includes(result.pattern)) return result;
  // The heavy coil releases its own charged snapshots; field plans never own its late shots.
  if (result.type === 'needle' && result.pattern === 'loom') result.pattern = 'snapshot';
  const fast = ['rail', 'snapshot'].includes(result.pattern);
  result.holdSeconds = Math.max(result.holdSeconds || 6, 10);
  result.roleKey = `${fast ? 'sniper' : 'field'}-${result.type}-${result.pattern}`;
  if (!fast) result.prefillMode = 'field-only';
  result.holdScreenX = fast ? 900 : 1100;
  if (fast) {
    result.lane = pace ? (result.lane >= 400 ? 560 : 160) : result.lane;
    // Compensate the rail's longer .95s tell with .30s extra delay for the .65s coil tell.
    result.initialAttackDelay = pace ? (result.type === 'needle' ? 4.3 : 4) : 0;
  } else {
    if (pace) result.lane = result.type === 'needle' ? (result.lane >= 400 ? 550 : 170)
      : result.type === 'mantis' ? (result.lane >= 400 ? 570 : 150)
      : result.type === 'ray' ? (result.lane >= 400 ? 520 : 200) : result.lane >= 400 ? 500 : 220;
    result.initialAttackDelay = 0;
  }
  return result;
}
const rolePriority = entry => entry.pattern === 'lunge' ? 4 : entry.pattern === 'deploy' ? 3
  : ['rail', 'snapshot'].includes(entry.pattern) ? 1 : entry.pattern ? 0 : 2;

// Stage1 enters from the same edge as its station, rather than crossing the
// ordinary firing line before its first tell. Later formations keep their large
// opposite entries. Gameplay checks each body's actual visible ports and hull.
function deployFormation(roles, pace, blockIndex, blockName) {
  let sourceIndex = 0;
  for (const entry of roles) {
    if (!entry.roleKey || ['lunge', 'deploy'].includes(entry.pattern)) continue;
    const index = sourceIndex++, firstSide = blockIndex % 2 === 0 ? -1 : 1;
    const side = index % 2 ? -firstSide : firstSide;
    const fast = ['rail', 'snapshot'].includes(entry.pattern);
    const holdY = pace ? entry.lane : side < 0 ? 560 : 140;
    const spawnY = pace ? holdY >= 360 ? 120 : 600 : holdY >= 360 ? 600 : 120;
    const holdX = pace ? entry.holdScreenX : fast ? 1000 : 1100;
    const attackOffset = index * (pace ? .45 : .15);
    const approachSeconds = pace ? 1.35 + index * .25 : .9 + index * .1;
    entry.lane = holdY; entry.holdScreenX = holdX;
    entry.deployment = { spawnY, spawnOffsetX: index * 35,
      approachSeconds, holdY, holdX, attackOffset, bankSign: Math.sign(holdY - spawnY) };
    // Deployment's source offsets replace the old fixed four-second sniper wait.
    // Gameplay applies this once; contact-plane fitting adds it only to a freshly
    // computed fast delay, rather than adding it to this value a second time.
    entry.initialAttackDelay = attackOffset;
    if (pace === 0 && ['trident', 'seed', 'petal'].includes(entry.pattern))
      entry.fieldShape = { kind: 'forward-cross', x: 240,
        fromY: holdY < 360 ? 240 : 80, toY: holdY < 360 ? 640 : 480 };
  }
  return roles;
}

export function normalEncounter(time, bossesDefeated = 0) {
  const d = trialDifficulty(bossesDefeated), t = Math.max(0, Number.isFinite(time) ? time : 0);
  const script = ENCOUNTERS[d.pace], blockIndex = script.findIndex(entry => t < entry.until);
  const source = t >= LEVEL_RULES.quietAt ? block(45, 'boss-warning', null, [], { aimLimit: 0 })
    : script[blockIndex];
  const start = t >= LEVEL_RULES.quietAt ? LEVEL_RULES.quietAt : blockIndex > 0 ? script[blockIndex - 1].until : 0;
  const maxPatternFamilies = 2, maxAttackFamilies = 3;
  const roles = source.roles.map(entry => scheduledRole(entry, d.pace)).sort((a, b) => rolePriority(a) - rolePriority(b));
  // One later Stage3 phrase bends the two fixed forward arcs in opposite
  // directions. Its independent rail and existing weave keep their own tells.
  if(d.pace===2&&source.id==='curve-crossfire')for(const entry of roles)if(entry.type==='worm'&&entry.prefillMode==='field-only') {
    entry.pattern='halo';entry.roleKey='field-worm-halo';entry.fieldShape='curve-arc';
  }
  const contactPair = d.pace === 2 && source.id === 'slow-prefill';
  if (contactPair) for (const entry of roles) {
    if (entry.prefillMode === 'field-only') entry.holdScreenX = 900;
    else if (entry.roleKey) { entry.holdScreenX = 1100; entry.initialAttackDelay = 0; }
  }
  deployFormation(roles, d.pace, blockIndex, source.id);
  const blockId = `${d.pace + 1}:${source.id}`, members = roles.filter(entry => entry.roleKey);
  // Faster advancing fields need their first locked burst fitted to the same
  // existing contact plane; a fixed four-second wait would arrive after the train.
  const contactField = d.pace > 0 && members.find(entry => entry.prefillMode === 'field-only'
    && (entry.pattern === 'loom' || (d.pace >= 2 && entry.pattern === 'halo')));
  const phrase = members.length ? { key: blockId + '-crossfire', start, deadline: source.until,
    memberRoleKeys: members.map(entry => entry.roleKey), maxCycles: 2,
    independentRepeats: true,
    ...(d.pace === 0 ? { independentEntry: true } : {}),
    ...(contactField ? { contactPlane: { x: 240, y: 360, fieldRoleKey: contactField.roleKey } } : {}) } : null;
  return { blockId, phrase, theme: THEMES[d.pace], pattern: roles.find(entry => entry.pattern)?.pattern || source.pattern,
    roles, until: source.until,
    aimLimit: source.aimLimit ?? (d.pace === 0 ? 1 : d.pace < 3 ? 2 : 3),
    maxPatternFamilies, maxAttackFamilies, movementWindow: false,
    safeLanes: [...(source.safeLanes || [220, 440])], overlapGroup: d.pace ? 'prefill-crossfire' : 'introduction',
    // The final two seconds prepare the warning; they never catch up postponed dense fire.
    departure: t >= 40 && t < LEVEL_RULES.quietAt };
}

export function normalPattern(time, bossesDefeated = 0) {
  return normalEncounter(time, bossesDefeated).pattern;
}

const BOSS_PROFILES = [
  { kind: 'warden', name: 'WARDEN', radius: 92, hpMultiplier: 1,
    motion: { x: 1010, centerY: 335, amplitude: 118, frequency: 0.52, bank: 0.055 },
    movement: { kind: 'anchor-shift', horizontalAmplitude: 34, travelSpeed: 125, dwellSeconds: 2.8 },
    responseSpace: { kind: 'alternating-flanks', preferredX: [180, 440], bands: [190, 360, 530] },
    transitionPolicy: { kind: 'tower-collapse', trigger: 'health-bands', thresholds: [.7, .4] },
    attackOrder: ['cathedral', 'B01', 'halo', 'B04', 'snapshot'], safeLanes: [220, 440, 340], mechanic: 'cathedral-alternating-towers' },
  { kind: 'carrier', name: 'GREEN CARRIER', radius: 95, hpMultiplier: 1.05,
    motion: { x: 1000, centerY: 340, amplitude: 54, frequency: 0.34, bank: 0.025 },
    movement: { kind: 'bay-drift', horizontalAmplitude: 88, travelSpeed: 95, dwellSeconds: 3.2 },
    responseSpace: { kind: 'bay-clearance', preferredX: [220, 520], bands: [180, 540] },
    transitionPolicy: { kind: 'bay-cycle', trigger: 'health-bands', thresholds: [.65, .32] },
    attackOrder: ['deploy', 'B04', 'petal', 'loom', 'snapshot'], safeLanes: [260, 460, 360], mechanic: 'launch-bay-screen' },
  { kind: 'lancer', name: 'SIEGE LANCER', radius: 87, hpMultiplier: 1.04,
    motion: { x: 1030, centerY: 340, amplitude: 138, frequency: 0.44, bank: 0.1 },
    movement: { kind: 'rail-sweep', horizontalAmplitude: 100, travelSpeed: 230, dwellSeconds: 1.4 },
    responseSpace: { kind: 'rail-sidestep', preferredX: [170, 400], bands: [200, 360, 520] },
    transitionPolicy: { kind: 'siege-advance', trigger: 'health-bands', thresholds: [.72, .38] },
    attackOrder: ['rail', 'B02', 'jaws', 'lunge', 'zipper'], safeLanes: [240, 480, 360], mechanic: 'siege-rail-and-lunge' },
  { kind: 'bastion', name: 'CRESCENT BASTION', radius: 101, hpMultiplier: 1.05,
    motion: { x: 995, centerY: 350, amplitude: 92, frequency: 0.48, bank: 0.065 },
    movement: { kind: 'crescent-orbit', horizontalAmplitude: 130, travelSpeed: 145, dwellSeconds: 2.2 },
    responseSpace: { kind: 'crescent-pocket', preferredX: [280, 560], bands: [240, 480] },
    transitionPolicy: { kind: 'crescent-inversion', trigger: 'health-bands', thresholds: [.68, .35] },
    attackOrder: ['jaws', 'B05', 'petal', 'loom', 'snapshot'], safeLanes: [200, 440, 320], mechanic: 'crescent-pockets-and-gates' },
  { kind: 'apex', name: 'APEX ORRERY', radius: 96, hpMultiplier: 1.08,
    motion: { x: 1005, centerY: 335, amplitude: 142, frequency: 0.61, bank: 0.095 },
    movement: { kind: 'orrery', horizontalAmplitude: 118, travelSpeed: 175, dwellSeconds: 1.8 },
    responseSpace: { kind: 'rotating-gaps', preferredX: [160, 480], bands: [170, 350, 550] },
    transitionPolicy: { kind: 'orbit-precession', trigger: 'health-bands', thresholds: [.75, .45] },
    attackOrder: ['loom', 'rail', 'petal'], safeLanes: [210, 430, 330], mechanic: 'orrery-precession' },
];
export const LEVEL_BOSS_KINDS = Object.freeze(BOSS_PROFILES.map(profile => profile.kind));

export function bossProfile(bossesDefeated = 0) {
  const victories = trialDifficulty(bossesDefeated).tier - 1;
  const source = BOSS_PROFILES[victories % BOSS_PROFILES.length];
  return { ...source, motion: { ...source.motion }, movement: { ...source.movement },
    responseSpace: { ...source.responseSpace, preferredX: [...source.responseSpace.preferredX], bands: [...source.responseSpace.bands] },
    transitionPolicy: { ...source.transitionPolicy, thresholds: [...source.transitionPolicy.thresholds] },
    attackOrder: [...source.attackOrder], safeLanes: [...source.safeLanes],
    hell: victories >= 5, variant: victories % BOSS_PROFILES.length };
}

const FAMILY = Object.freeze({ B01: 'radial', halo: 'radial', B02: 'weave', zipper: 'weave',
  B03: 'fan', petal: 'fan', trident: 'fan', seed: 'loom', B04: 'loom', loom: 'loom', cathedral: 'loom', B05: 'gate', jaws: 'gate',
  aim: 'aim', snapshot: 'aim', rail: 'aim', escort: 'deploy', deploy: 'deploy', lunge: 'body' });

export function bossAttack(bossesDefeated = 0, attackIndex = 0, healthRatio = 1) {
  const profile = bossProfile(bossesDefeated), d = trialDifficulty(bossesDefeated);
  const index = Math.max(0, Math.floor(Number.isFinite(attackIndex) ? attackIndex : 0));
  const corePhase = index % profile.attackOrder.length, pattern = profile.attackOrder[corePhase];
  const ratio = Math.max(0, Math.min(1, Number.isFinite(healthRatio) ? healthRatio : 1));
  const phase = profile.transitionPolicy.thresholds.filter(threshold => ratio <= threshold).length;
  const route = pattern === 'B04' || pattern === 'B05', deploying = FAMILY[pattern] === 'deploy', body = pattern === 'lunge';
  const telegraph = Math.max(d.minTelegraph, body ? .95 : pattern === 'rail' ? .8 : route ? .9 : deploying ? 1 : .75);
  const targetBand = profile.responseSpace.bands[(index + phase) % profile.responseSpace.bands.length];
  const action = { kind: body ? 'lunge' : deploying ? 'deploy' : profile.movement.kind === 'rail-sweep' ? 'shift'
    : ['crescent-orbit', 'orrery'].includes(profile.movement.kind) ? 'orbit' : 'hold',
    at: 0, duration: body ? .8 : deploying ? 1.2 : 1.8, targetBand,
    ...(body ? { speed: 620 + phase * 50 } : { speed: profile.movement.travelSpeed }),
    ...(deploying ? { childType: 'beetle', count: 2, childLimit: 4 } : {}) };
  // Physical opening costs .6 seconds. Role-specific holds include ordinary
  // reaction, alignment and projectile travel instead of a .2s reactive target.
  // Body hits remain available during charge, opening and recovery.
  const openDurations={warden:1.8,carrier:2,lancer:1.9,bastion:2.1,apex:2.2};
  const openWindow = { delay: body ? .85 : deploying ? 1.1 : .15, duration: openDurations[profile.kind],
    enabled: !deploying && !(profile.kind === 'apex' && FAMILY[pattern] === 'radial') };
  return { pattern, index, phase, corePhase, action, openWindow,
    safeLane: profile.safeLanes[(Math.floor(index / profile.attackOrder.length) + phase) % profile.safeLanes.length],
    telegraph, tell: { kind: FAMILY[pattern] === 'aim' ? 'rail' : body ? 'body' : deploying ? 'bay' : FAMILY[pattern], duration: telegraph, lockLead: .35 },
    pauseAfter: route ? (d.hell ? .65 : .9) : body ? 1 : deploying ? .7 : .25,
    armorOpen: openWindow.enabled, movementWindow: false, aimLimit: d.pace ? 2 : 1,
    aimLock: FAMILY[pattern] === 'aim' ? 'snapshot' : 'release', lockLead: .35 };
}

export function attackPolicy(pattern = 'aim', pace = 0) {
  const d = trialDifficulty(pace), family = FAMILY[pattern] || 'fan';
  return { family, patternFamily: !['aim', 'body', 'deploy'].includes(family),
    maxPatternFamilies: 2, maxAttackFamilies: 3,
    aimLimit: d.pace === 0 ? 1 : d.pace < 3 ? 2 : 3, movementWindow: false, forbidden: [],
    minFlightTime: d.minimumFlightTime, minTelegraph: d.minTelegraph,
    aimLock: pattern === 'snapshot' || pattern === 'rail' ? 'snapshot' : 'release',
    lockLead: pattern === 'rail' ? .3 : .35,
    radius: pattern === 'rail' ? 4.5 : undefined };
}

export function basicWeapon(level = 1) {
  return [
    { offsets: [-8, 8], damage: 1 }, { offsets: [-8, 8], damage: 1.4 },
    { offsets: [-12, 0, 12], damage: 1.4 }, { offsets: [-12, 0, 12], damage: 1.8 },
    { offsets: [-18, -6, 6, 18], damage: 1.8 },
  ][Math.max(0, Math.min(4, Math.floor(level) - 1))];
}
