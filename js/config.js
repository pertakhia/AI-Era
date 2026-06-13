// ============================================================
// AI ERA — game configuration
// All tunable numbers live here.
// ============================================================
const CONFIG = {
  // --- Visual palette (sci-fi neon on dark) ---
  palette: {
    bg:         0x05070d,
    fog:        0x05070d,
    ground:     0x0a0f1c,
    grid:       0x123047,
    gridHot:    0x1f6f8b,
    baseMetal:  0x2a3550,
    baseCore:   0x35e0ff,
    cyan:       0x35e0ff,
    amber:      0xffae3b,
    magenta:    0xff3b8b,
    green:      0x49f5a0,
    red:        0xff4d4d,
    robot:      0x8b97b5,
    robotDark:  0x434c66,
    robotEye:   0xff3b5c,
  },

  arenaRadius: 42,     // robots spawn around this ring
  groundSize: 130,

  base: {
    maxHealth: 1000,
    radius: 5,
    // the base's own click-fired cannon
    cannon: { damage: 26, cooldown: 0.28, projectileSpeed: 70, color: 0x35e0ff, dmgType: 'kinetic' },
    // the base's active round energy shield (Aegis)
    shield: { max: 380, regen: 32, idleDrain: 9, rechargeAt: 0.25, radius: 9.2 },
  },

  startResources: 220,

  // --- Buildable weapons ---
  // unlock = first level the weapon becomes available
  weapons: {
    turret: {
      name: 'TURRET', cost: 60, unlock: 1, color: 0x35e0ff, dmgType: 'kinetic',
      range: 17, damage: 9, fireRate: 4.5, projectileSpeed: 60, splash: 0,
      desc: 'Rapid kinetic rounds. Cheap, reliable.', maxHealth: 120,
    },
    cannon: {
      name: 'CANNON', cost: 130, unlock: 2, color: 0xffae3b, dmgType: 'kinetic',
      range: 21, damage: 46, fireRate: 0.85, projectileSpeed: 48, splash: 4.5,
      desc: 'Slow heavy shells with splash damage.', maxHealth: 160,
    },
    laser: {
      name: 'LASER', cost: 190, unlock: 3, color: 0xff3b8b, dmgType: 'energy',
      range: 26, damage: 70, fireRate: 1, projectileSpeed: 0, splash: 0, beam: true,
      desc: 'Continuous beam. Melts armor over time.', maxHealth: 140,
    },
    shield: {
      name: 'SHIELD', cost: 160, unlock: 3, color: 0x49f5a0,
      range: 0, damage: 0, fireRate: 0, regen: 22, auraRadius: 14,
      desc: 'Projects a field that heals the base.', maxHealth: 220,
    },
    tesla: {
      name: 'TESLA', cost: 150, unlock: 2, color: 0x9b6bff, dmgType: 'energy',
      range: 16, damage: 23, fireRate: 1.5, chain: 4, chainRange: 7.5,
      desc: 'Arc lightning that leaps between foes.', maxHealth: 130,
    },
  },

  // --- player active abilities (cooldown-based) ---
  abilities: {
    orbital:   { name: 'ORBITAL', key: 'Q', cd: 20, dmg: 440, radius: 11, delay: 0.9, color: 0xffae3b, desc: 'Target a delayed high-damage strike.' },
    overdrive: { name: 'OVERDRIVE', key: 'E', cd: 26, dur: 6, color: 0x35e0ff, desc: 'All weapons fire 2× for 6s.' },
    emp:       { name: 'EMP', key: 'R', cd: 30, dur: 3, dmg: 28, color: 0x9b6bff, desc: 'Freeze every robot for 3s.' },
  },

  // --- adaptive AI: the collective hardens against your most-used damage type ---
  adapt: { interval: 7, step: 0.16, max: 0.6, decay: 0.05, minDamage: 130 },

  // --- Robot archetypes ---
  robots: {
    basic:   { name: 'Drone',    health: 42,   speed: 3.0, damage: 7,  reward: 13, radius: 1.1, color: 0x8b97b5, scale: 1.0 },
    fast:    { name: 'Skitter',  health: 30,   speed: 6.2, damage: 5,  reward: 15, radius: 0.95, color: 0x6fe0ff, scale: 0.9 },
    ranged:  { name: 'Sniper',   health: 38,   speed: 2.4, damage: 12, reward: 20, radius: 1.1, color: 0xff8b5c, scale: 1.0, ranged: true, fireRange: 22, fireRate: 0.6, projDamage: 14, projSpeed: 34 },
    armored: { name: 'Juggernaut', health: 170, speed: 2.2, damage: 18, reward: 34, radius: 1.6, color: 0xb56fff, scale: 1.5 },
    boss:    { name: 'OVERMIND', health: 2600, speed: 1.6, damage: 70, reward: 600, radius: 3.4, color: 0xff3b5c, scale: 3.2, boss: true, ranged: true, fireRange: 30, fireRate: 1.4, projDamage: 26, projSpeed: 40 },
    wraith:  { name: 'Wraith', health: 32, speed: 9.5, damage: 48, reward: 24, radius: 1.0, color: 0xff5ce0, scale: 1.0, flying: true, kamikaze: true },
    splitter: { name: 'Splitter', health: 96, speed: 2.6, damage: 12, reward: 26, radius: 1.35, color: 0x49f5a0, scale: 1.25, splits: 'shard', splitCount: 2 },
    shard:    { name: 'Shard', health: 18, speed: 6.8, damage: 5, reward: 6, radius: 0.7, color: 0x8ef5c4, scale: 0.6 },
    disruptor: { name: 'Disruptor', health: 74, speed: 4.4, damage: 10, reward: 30, radius: 1.1, color: 0xffd24d, scale: 1.0, disruptor: true, disableTime: 5 },
  },

  // --- Level / wave structure ---
  // each wave: array of { type, count, interval(s), delay(s before wave) }
  levels: [
    {
      id: 1,
      name: 'FIRST CONTACT',
      blurb: 'Scattered scout drones probe your perimeter. Build a turret line and learn the rhythm of the swarm.',
      reward: 180,
      waves: [
        [ { type: 'basic', count: 6,  interval: 1.6 } ],
        [ { type: 'basic', count: 10, interval: 1.2 } ],
        [ { type: 'basic', count: 8,  interval: 1.0 }, { type: 'fast', count: 4, interval: 1.4, delay: 4 } ],
      ],
    },
    {
      id: 2,
      name: 'THE SWARM LEARNS',
      blurb: 'The collective adapts. Faster skitters flank while snipers open fire from range. Cannons are now online.',
      reward: 320,
      waves: [
        [ { type: 'fast', count: 8, interval: 0.9 }, { type: 'basic', count: 6, interval: 1.1 } ],
        [ { type: 'ranged', count: 5, interval: 1.6 }, { type: 'fast', count: 8, interval: 0.8, delay: 3 }, { type: 'splitter', count: 3, interval: 2.2, delay: 4 } ],
        [ { type: 'basic', count: 10, interval: 0.7 }, { type: 'ranged', count: 6, interval: 1.4, delay: 2 }, { type: 'fast', count: 10, interval: 0.6, delay: 6 }, { type: 'wraith', count: 3, interval: 1.4, delay: 5 }, { type: 'disruptor', count: 2, interval: 2, delay: 7 } ],
      ],
    },
    {
      id: 3,
      name: 'OVERMIND ASCENDANT',
      blurb: 'Armored juggernauts spearhead the assault. Lasers and shields unlock — you will need everything. The OVERMIND comes last.',
      reward: 0,
      waves: [
        [ { type: 'armored', count: 4, interval: 2.2 }, { type: 'fast', count: 10, interval: 0.7 }, { type: 'splitter', count: 4, interval: 1.8, delay: 3 } ],
        [ { type: 'armored', count: 6, interval: 1.8 }, { type: 'ranged', count: 8, interval: 1.2, delay: 3 }, { type: 'fast', count: 12, interval: 0.5, delay: 5 }, { type: 'wraith', count: 4, interval: 1.2, delay: 4 }, { type: 'disruptor', count: 3, interval: 1.8, delay: 6 } ],
        [ { type: 'boss', count: 1, interval: 1 }, { type: 'armored', count: 6, interval: 2.4, delay: 6 }, { type: 'ranged', count: 8, interval: 1.5, delay: 10 }, { type: 'wraith', count: 5, interval: 1.6, delay: 8 }, { type: 'splitter', count: 4, interval: 2.2, delay: 5 }, { type: 'disruptor', count: 3, interval: 2.4, delay: 12 } ],
      ],
    },
  ],
};
