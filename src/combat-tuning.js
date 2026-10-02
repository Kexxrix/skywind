// D52 candidate: preserve control/collision constants; give committed threats a
// first attack opportunity against ordinary fire, while specials can stop them.
// Projectile speed/count authority remains in level.js and barrage.js.
const HP_SCALE = [1, 1.25, 1.55, 1.8, 2, 2.15];
const TELL_FLOOR = [0.75, 0.65, 0.58, 0.5, 0.45, 0.4];
const NORMAL_HEAL = [24, 18, 14, 12, 10, 10];
const BOSS_HEAL = [22, 18, 16, 14, 12, 10];

const freezeTree = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
};
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const paceIndex = pace => clamp(Math.floor(finite(pace, 0)), 0, 5);

export const ENEMY_COMBAT_PROFILES = freezeTree({
  beetle: { radius: 28, hp: 3, speed: 280, score: 100, behavior: 'formation',
    attackMode: 'aim', firstAttackDelay: 0.12, role: 'fodder' },
  claw: { radius: 33, hp: 26, speed: 250, score: 180, behavior: 'brake-fan',
    attackMode: 'barrage', firstAttackDelay: 0.1, role: 'field-emitter' },
  worm: { radius: 35, hp: 32, speed: 215, score: 280, behavior: 'serpentine',
    attackMode: 'barrage', firstAttackDelay: 0.1, role: 'field-emitter' },
  wasp: { radius: 22, hp: 30, speed: 320, score: 130, behavior: 'lock-dive',
    attackMode: 'body-dash', firstAttackDelay: 0.1, role: 'committed-rusher',
    bodyAttack: { baitSeconds: 0, braceSeconds: 0.75, dashSeconds: 0.9,
      dashSpeed: 660, recoverySeconds: 1.1, lockAt: 'brace', projectiles: false,
      retargetDuringDash: false } },
  mantis: { radius: 31, hp: 5, speed: 255, score: 210, behavior: 'zigzag',
    attackMode: 'aim', firstAttackDelay: 0.15, role: 'mobile-fodder' },
  ray: { radius: 35, hp: 32, speed: 225, score: 250, behavior: 'curtain',
    attackMode: 'barrage', firstAttackDelay: 0.1, role: 'route-emitter', tellExtra: 0.1 },
  dragonfly: { radius: 18, hp: 1, speed: 435, score: 80, behavior: 'dart',
    attackMode: 'aim', firstAttackDelay: 0.25, role: 'fast-fodder' },
  orb: { radius: 29, hp: 24, speed: 200, score: 230, behavior: 'radial',
    attackMode: 'barrage', firstAttackDelay: 0.1, role: 'field-emitter' },
  needle: { radius: 22, hp: 28, speed: 235, score: 200, behavior: 'sniper',
    attackMode: 'aim', firstAttackDelay: 0.1, role: 'aimed-pressure', minimumTell: 0.65 },
  dart: { radius: 22, hp: 36, speed: 235, score: 240, behavior: 'rail-lock',
    attackMode: 'rail-burst', firstAttackDelay: 0.1, role: 'locked-sniper', displayWidth: 96,
    rail: { chargeSeconds: 0.7, lockSeconds: 0.25, shotCount: 3,
      shotInterval: 0.12, lockAt: 'charge-end', retargetDuringBurst: false,
      recoveryByPace: [1.4, 1.3, 1.2, 1.1, 1, 1] } },
  scarab: { radius: 35, hp: 40, speed: 210, score: 340, behavior: 'brood-bay',
    attackMode: 'deploy', firstAttackDelay: 0.15, role: 'limited-deployer', displayWidth: 144,
    minimumTell: 0.8,
    brood: { deployCount: 2, maxChildren: 4, deployInterval: 2.8,
      childType: 'dragonfly', childFirstAttackDelay: 0.6, childScore: 0,
      childDropHealth: false, childBossRewardEligible: false,
      childCanDeploy: false, backlog: false } },
  pincer: { radius: 22, hp: 38, speed: 270, score: 260, behavior: 'scarlet-rammer',
    attackMode: 'body-dash', firstAttackDelay: 0.1, role: 'committed-rusher',
    displayWidth: 96, coreExposed: false,
    bodyAttack: { baitSeconds: 0.65, braceSeconds: 0.35, dashSeconds: 0.84,
      dashSpeed: 720, recoverySeconds: 1.1, lockAt: 'brace', projectiles: false,
      retargetDuringDash: false } },
});

// hp already includes the bounded pace scale. Do not add level.hpBonus again.
// radius for a new role is a provisional small-body fallback, not an art hull.
export function combatProfile(type, pace = 0) {
  const source = ENEMY_COMBAT_PROFILES[type];
  if (!source) throw new RangeError(`Unknown enemy combat profile: ${type}`);
  const index = paceIndex(pace);
  const profile = structuredClone(source);
  profile.type = type;
  profile.pace = index;
  profile.baseHp = source.hp;
  profile.hp = Math.ceil(source.hp * HP_SCALE[index]);
  profile.firstTell = Math.max(TELL_FLOOR[index] + (source.tellExtra || 0), source.minimumTell || 0);
  profile.bodyDamage = 22;
  profile.projectileDamage = 12;
  if (profile.bodyAttack) {
    profile.firstTell = profile.bodyAttack.baitSeconds + profile.bodyAttack.braceSeconds;
    profile.recoverySeconds = profile.bodyAttack.recoverySeconds;
  }
  if (profile.rail) {
    profile.rail.recoverySeconds = profile.rail.recoveryByPace[index];
    delete profile.rail.recoveryByPace;
    profile.firstTell = profile.rail.chargeSeconds + profile.rail.lockSeconds;
    profile.recoverySeconds = profile.rail.recoverySeconds;
  }
  if (profile.brood) profile.recoverySeconds = profile.brood.deployInterval;
  return profile;
}

// stage is the one-based stage being played/defeated, not the next stage.
// Amounts stay fixed at spawn; hpRatio only reports a 100-HP ledger estimate.
// Keeping the normal 24s opportunity and attraction preserves recovery choice.
export function recoveryPolicy(stage = 1, normalTime = 0, hpRatio = 1) {
  const currentStage = Math.max(1, Math.floor(finite(stage, 1)));
  const index = Math.min(5, currentStage - 1);
  const missingHp = (1 - clamp(finite(hpRatio, 1), 0, 1)) * 100;
  return { stage: currentStage, normalAt: 24,
    normalDue: finite(normalTime, 0) >= 24,
    normalHeal: NORMAL_HEAL[index], bossHeal: BOSS_HEAL[index],
    normalEffectiveCeiling: Math.min(NORMAL_HEAL[index], missingHp),
    bossEffectiveCeiling: Math.min(BOSS_HEAL[index], missingHp) };
}
