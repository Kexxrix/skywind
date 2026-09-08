// FIRST_IMPLEMENTATION I01-I03: two approved trial tiers, repeated by boss kills.
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
];

export function trialDifficulty(bossesDefeated = 0) {
  const pace = Math.min(1, Math.max(0, Math.floor(bossesDefeated)));
  return { ...TIERS[pace], pace, tier: Math.max(0, bossesDefeated) + 1, hpBonus: 0, recovery: false, scrollSpeed: LEVEL_RULES.baseScroll };
}

export function normalPattern(time) {
  if (time < 6 || time >= 39) return null;
  return time < 14 ? 'B01' : time < 22 ? 'B02' : time < 31 ? 'B03' : 'B04';
}

export function basicWeapon(level = 1) {
  return [
    { offsets: [-8, 8], damage: 1 }, { offsets: [-8, 8], damage: 1.4 },
    { offsets: [-12, 0, 12], damage: 1.4 }, { offsets: [-12, 0, 12], damage: 1.8 },
    { offsets: [-18, -6, 6, 18], damage: 1.8 },
  ][Math.max(0, Math.min(4, Math.floor(level) - 1))];
}
