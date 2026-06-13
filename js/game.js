// ============================================================
// AI ERA — game engine
// Loaded after THREE + config.js + entities.js
// ============================================================
const el = (id) => document.getElementById(id);

class Game {
  constructor() {
    this.state = 'menu';
    this.levelIdx = 0;
    this.waveIdx = 0;
    this.resources = CONFIG.startResources;
    this.threat = 0;
    this.selectedBuild = null;

    this.robots = [];
    this.projectiles = [];
    this.turrets = [];
    this.fx = [];

    this.spawnQueue = [];
    this.spawnPtr = 0;
    this.waveTimer = 0;
    this.waveActive = false;
    this.interWave = 0;

    this.aim = new THREE.Vector3();
    this.shake = 0;
    this.airRaidT = 18;
    this.hitStop = 0;
    this.sfx = new AudioFX();
    this._prevShieldE = 0;
    // adaptive AI + abilities
    this.aiResist = { kinetic: 0, energy: 0 };
    this.dmgWindow = { kinetic: 0, energy: 0 };
    this.adaptT = CONFIG.adapt.interval;
    this.overdriveT = 0;
    this.cooldowns = { orbital: 0, overdrive: 0, emp: 0 };
    this.aimingAbility = null;
    this.orbitalQueue = [];

    this._initThree();
    this._initInput();
    this._buildDock();
    this._bindScreens();
    this._loop = this._loop.bind(this);
    this.clock = new THREE.Clock();
    requestAnimationFrame(this._loop);
  }

  // ---------------------------------------------------------
  _initThree() {
    const P = CONFIG.palette;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(P.bg);
    this.scene.fog = new THREE.Fog(P.fog, 70, 165);

    this.camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 500);
    this.camBase = new THREE.Vector3(0, 66, 60);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(0, 2, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.id = 'scene-canvas';
    el('game-container').prepend(this.renderer.domElement);

    // lights
    this.scene.add(new THREE.AmbientLight(0x35507a, 0.55));
    const hemi = new THREE.HemisphereLight(0x3a6fae, 0x0a0f1c, 0.5);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0x8fd6ff, 0.8);
    dir.position.set(30, 60, 20);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.near = 10; dir.shadow.camera.far = 160;
    dir.shadow.camera.left = -70; dir.shadow.camera.right = 70;
    dir.shadow.camera.top = 70; dir.shadow.camera.bottom = -70;
    this.scene.add(dir);
    const rim = new THREE.DirectionalLight(P.magenta, 0.25);
    rim.position.set(-40, 20, -30);
    this.scene.add(rim);

    this._buildArena();

    this.base = new Base(this.scene);
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.ndc = new THREE.Vector2();

    // ghost turret for build mode
    this.ghost = null;

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  _buildArena() {
    const P = CONFIG.palette;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CONFIG.groundSize, CONFIG.groundSize),
      new THREE.MeshStandardMaterial({ color: P.ground, metalness: 0.5, roughness: 0.9 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(CONFIG.groundSize, 52, P.gridHot, P.grid);
    grid.position.y = 0.02;
    grid.material.opacity = 0.5; grid.material.transparent = true;
    this.scene.add(grid);

    // glowing arena boundary
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(CONFIG.arenaRadius - 0.6, CONFIG.arenaRadius, 96),
      new THREE.MeshBasicMaterial({ color: P.magenta, transparent: true, opacity: 0.55, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
    this.scene.add(ring);
    this.boundaryRing = ring;

    // inner accent ring near base
    const inner = new THREE.Mesh(
      new THREE.RingGeometry(CONFIG.base.radius + 6, CONFIG.base.radius + 6.4, 80),
      new THREE.MeshBasicMaterial({ color: P.cyan, transparent: true, opacity: 0.3, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
    );
    inner.rotation.x = -Math.PI / 2; inner.position.y = 0.04;
    this.scene.add(inner);
  }

  // ---------------------------------------------------------
  _initInput() {
    const dom = this.renderer.domElement;
    addEventListener('pointermove', (e) => {
      this.ndc.x = (e.clientX / innerWidth) * 2 - 1;
      this.ndc.y = -(e.clientY / innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.ndc, this.camera);
      this.raycaster.ray.intersectPlane(this.groundPlane, this.aim);
    });
    addEventListener('pointerdown', (e) => {
      if (this.state !== 'playing') return;
      if (e.button === 2) { this._cancelBuild(); return; }
      if (e.target.closest && e.target.closest('#hud .panel, #dock, .build-btn, .screen, .btn, #sound-btn, #abilities')) return;
      this.sfx.resume();
      // refresh aim from the click position so ray-picking is exact
      this.ndc.x = (e.clientX / innerWidth) * 2 - 1;
      this.ndc.y = -(e.clientY / innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.ndc, this.camera);
      this.raycaster.ray.intersectPlane(this.groundPlane, this.aim);
      if (this.aimingAbility === 'orbital') { this._placeOrbital(this.aim.clone()); return; }
      if (this.selectedBuild) this._tryPlace();
      else this._fireBase();
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (this.state !== 'playing') return;
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); this._toggleShield(); return; }
      const ku = e.key.toLowerCase();
      if (ku === 'q') { this._useAbility('orbital'); return; }
      if (ku === 'e') { this._useAbility('overdrive'); return; }
      if (ku === 'r') { this._useAbility('emp'); return; }
      const keys = Object.keys(CONFIG.weapons);
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= keys.length) this._selectBuild(keys[n - 1]);
      else if (e.key === 'Escape' || e.key === '0') this._cancelBuild();
    });
  }
  _toggleShield() {
    const wantUp = !this.base.shieldUp;
    this.base.toggleShield();
    if (wantUp && !this.base.shieldUp) { this._toast('SHIELD RECHARGING…', false); this.sfx.deny(); }
    else if (this.base.shieldUp) { this._toast('AEGIS SHIELD UP', true); this.sfx.shieldUp(); }
    else { this.sfx.shieldDown(); }
    this._updateHUD();
  }

  // ---------------------------------------------------------
  _buildDock() {
    const dock = el('dock');
    dock.innerHTML = '';
    this.dockBtns = {};
    let i = 1;
    for (const key in CONFIG.weapons) {
      const w = CONFIG.weapons[key];
      const b = document.createElement('div');
      b.className = 'build-btn';
      b.innerHTML = `
        <span class="key">${i}</span>
        <span class="bname"><span class="dot" style="color:#${w.color.toString(16).padStart(6,'0')}"></span>${w.name}</span>
        <span class="bcost">◆ ${w.cost}</span>
        <span class="bdesc">${w.desc}</span>`;
      b.addEventListener('click', () => this._selectBuild(key));
      dock.appendChild(b);
      this.dockBtns[key] = b;
      i++;
    }
  }

  _selectBuild(key) {
    const w = CONFIG.weapons[key];
    if (w.unlock > this.levelIdx + 1) { this._toast('LOCKED — unlocks later'); this.sfx.deny(); return; }
    if (this.resources < w.cost) { this._toast('NOT ENOUGH RESOURCES'); this.sfx.deny(); return; }
    this.selectedBuild = key;
    this.sfx.click();
    this._refreshDock();
    el('buildmode').classList.add('on');
    el('buildmode').textContent = `PLACING ${w.name} — click ground · right-click to cancel`;
    this._makeGhost(key);
  }
  _cancelBuild() {
    this.selectedBuild = null;
    this.aimingAbility = null;
    el('buildmode').classList.remove('on');
    if (this.ghost) { this.scene.remove(this.ghost.group); this.ghost = null; }
    this._refreshDock();
  }
  _makeGhost(key) {
    if (this.ghost) this.scene.remove(this.ghost.group);
    const t = new Turret(this.scene, key, new THREE.Vector3(0, 0, 9999));
    t.group.traverse(o => {
      if (o.material && o.material.transparent !== undefined && o.isMesh) {
        o.material = o.material.clone();
        o.material.transparent = true; o.material.opacity = 0.55;
      }
    });
    if (t.hp) t.hp.group.visible = false;
    this.ghost = t;
  }
  _placeValid(p) {
    if (!p) return false;
    const r = Math.hypot(p.x, p.z);
    if (r > CONFIG.arenaRadius - 2) return false;
    if (p.distanceTo(this.base.pos) < this.base.radius + 3) return false;
    for (const t of this.turrets) { if (t.alive && t.pos.distanceTo(p) < 3.4) return false; }
    return true;
  }
  _tryPlace() {
    const key = this.selectedBuild;
    const w = CONFIG.weapons[key];
    if (this.resources < w.cost) { this._toast('NOT ENOUGH RESOURCES'); this.sfx.deny(); this._cancelBuild(); return; }
    const p = this.aim.clone(); p.y = 0;
    if (!this._placeValid(p)) { this._toast('CANNOT BUILD HERE'); this.sfx.deny(); return; }
    this.resources -= w.cost;
    const t = new Turret(this.scene, key, p);
    this.turrets.push(t);
    this.explode(p, w.color, 3);
    this.sfx.build();
    this._updateHUD();
    // keep building if still affordable, else exit
    if (this.resources < w.cost) this._cancelBuild();
  }

  // ---------------------------------------------------------
  _fireBase() {
    if (this.base.cooldown > 0) return;
    const c = this.base.cannon;
    this.base.cooldown = c.cooldown * this.fireRateMul();
    const muzzle = this.base.muzzleWorld().clone();
    // (1) precise cursor-ray pick — locks onto whatever is under the crosshair, AIR or ground
    let target = null;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const ray = this.raycaster.ray;
    let bestCam = Infinity;
    for (const r of this.robots) {
      if (!r.alive) continue;
      if (ray.distanceToPoint(r.pos) < r.radius + 1.7) {
        const camDist = ray.origin.distanceTo(r.pos);
        if (camDist < bestCam) { bestCam = camDist; target = r; }
      }
    }
    // (2) soft ground assist — nearest ground robot near the cursor point
    if (!target) {
      let bd = 6;
      for (const r of this.robots) {
        if (!r.alive || r.cfg.flying) continue;
        const d = Math.hypot(r.pos.x - this.aim.x, r.pos.z - this.aim.z);
        if (d < bd) { bd = d; target = r; }
      }
    }
    let dir;
    if (target) {
      // home in on the locked robot (full 3D — arcs up to flyers)
      dir = new THREE.Vector3(target.pos.x - muzzle.x, (target.pos.y + target.radius * 1.1) - muzzle.y, target.pos.z - muzzle.z);
    } else {
      // free shot — descend toward torso height at the cursor (can miss → AI threat)
      dir = new THREE.Vector3(this.aim.x - muzzle.x, 1.4 - muzzle.y, this.aim.z - muzzle.z);
    }
    const p = new Projectile(this.scene, muzzle, dir, c, false, target);
    p.manual = true;
    this.projectiles.push(p);
    this.explode(muzzle, c.color, 1.4);
    this.sfx.fire('base');
  }

  // ---------------------------------------------------------
  //  spawning helpers used by entities
  spawnProjectile(from, target, cfg, isEnemy) {
    const dir = new THREE.Vector3().subVectors(target.pos, from);
    const p = new Projectile(this.scene, from, dir, cfg, isEnemy, target);
    this.projectiles.push(p);
  }
  spawnEnemyProjectile(robot) {
    const from = robot.pos.clone(); from.y = 2;
    const dir = new THREE.Vector3().subVectors(this.base.pos, from);
    const p = new Projectile(this.scene, from, dir, robot.cfg, true, null);
    this.projectiles.push(p);
  }
  explode(pos, color, size) { this.fx.push(new Explosion(this.scene, pos, color, size)); }
  spawnLightning(points, color) { this.fx.push(new LightningArc(this.scene, points, color)); }
  damageRobot(r, n, type) {
    if (!r.alive) return;
    type = type || 'kinetic';
    if (this.aiResist[type] !== undefined) {   // 'pure' (abilities) bypasses resistance + tracking
      this.dmgWindow[type] += n;
      n *= (1 - this.aiResist[type]);
    }
    r.takeDamage(n);
    this.aiOnHit();
    if (!r.alive) this._onRobotKilled(r);
  }
  fireRateMul() { return this.overdriveT > 0 ? 0.5 : 1; }
  _onRobotKilled(r) {
    this.resources += r.reward;
    this.threat = Math.max(0, this.threat - 1.5); // efficient kills calm the AI
    this._updateHUD();
  }
  _destroyFx(r) {
    const boss = r.cfg.boss;
    const big = boss || r.cfg.scale >= 1.5 || r.cfg.flying;
    const col = boss ? 0xff2a4a : (r.cfg.flying ? 0xff5ce0 : 0xffae3b);
    this.explode(r.pos, col, boss ? 13 : (big ? 5.5 : 3));
    this.fx.push(new Debris(this.scene, r.pos, col, boss ? 26 : (big ? 12 : 6)));
    if (big) this.fx.push(new Shockwave(this.scene, r.pos, col, boss ? 22 : 9));
    this.sfx.explode(boss ? 'boss' : (big ? 'big' : 'robot'));
    if (boss) { this.shake = Math.min(1.0, this.shake + 0.7); this.hitStop = 0.18; this._flashScreen('255,42,74', 0.55); }
    else if (big) { this.shake = Math.min(0.6, this.shake + 0.18); }
  }
  _flashScreen(rgb, intensity) {
    const f = el('screen-flash');
    if (!f) return;
    f.style.transition = 'none';
    f.style.background = `rgba(${rgb}, ${intensity})`;
    f.style.opacity = '1';
    void f.offsetWidth;
    f.style.transition = 'opacity .4s ease';
    f.style.opacity = '0';
  }

  // ---------- adaptive AI ----------
  _adapt() {
    const a = CONFIG.adapt;
    this.aiResist.kinetic = Math.max(0, this.aiResist.kinetic - a.decay);
    this.aiResist.energy = Math.max(0, this.aiResist.energy - a.decay);
    const k = this.dmgWindow.kinetic, e = this.dmgWindow.energy;
    if (k + e >= a.minDamage) {
      const dom = k >= e ? 'kinetic' : 'energy';
      const before = this.aiResist[dom];
      this.aiResist[dom] = Math.min(a.max, this.aiResist[dom] + a.step);
      if (this.aiResist[dom] > before + 0.001) {
        this.threat = Math.min(100, this.threat + 4);
        this._adaptBanner(dom, this.aiResist[dom]);
      }
    }
    this.dmgWindow.kinetic = 0; this.dmgWindow.energy = 0;
    this._updateHUD();
  }
  _adaptBanner(type, val) {
    const label = type === 'kinetic' ? 'KINETIC' : 'ENERGY';
    const b = el('adapt-banner');
    b.textContent = `⚠ COLLECTIVE ADAPTING — ${label} RESIST ${Math.round(val * 100)}%`;
    b.classList.add('show');
    clearTimeout(this._adaptT2);
    this._adaptT2 = setTimeout(() => b.classList.remove('show'), 2600);
    this._threatHint(`The swarm is hardening against ${label.toLowerCase()} damage. Diversify your weapons.`);
    if (this.sfx) { this.sfx.deny(); this.sfx.tesla(); }
  }

  // ---------- active abilities ----------
  _useAbility(key) {
    if (this.state !== 'playing') return;
    if (this.cooldowns[key] > 0) { this._toast('ABILITY ON COOLDOWN'); this.sfx.deny(); return; }
    const ab = CONFIG.abilities[key];
    if (key === 'orbital') {
      this._cancelBuild();
      this.aimingAbility = (this.aimingAbility === 'orbital') ? null : 'orbital';
      el('buildmode').classList.toggle('on', this.aimingAbility === 'orbital');
      if (this.aimingAbility) el('buildmode').textContent = 'ORBITAL STRIKE — click a target · right-click to cancel';
      this.sfx.click();
    } else if (key === 'overdrive') {
      this.cooldowns.overdrive = ab.cd;
      this.overdriveT = ab.dur;
      this._toast('OVERDRIVE ENGAGED', true);
      this._flashScreen('53,224,255', 0.22);
      this.sfx.shieldUp();
    } else if (key === 'emp') {
      this.cooldowns.emp = ab.cd;
      this._emp(ab);
    }
    this._updateHUD();
  }
  _placeOrbital(point) {
    const ab = CONFIG.abilities.orbital;
    this.cooldowns.orbital = ab.cd;
    this.aimingAbility = null;
    el('buildmode').classList.remove('on');
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(ab.radius - 0.6, ab.radius, 48),
      new THREE.MeshBasicMaterial({ color: ab.color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.set(point.x, 0.12, point.z);
    this.scene.add(ring);
    this.orbitalQueue.push({ pos: point.clone(), t: ab.delay, ring });
    this.sfx.fire('cannon');
    this._updateHUD();
  }
  _orbitalDetonate(pos) {
    const ab = CONFIG.abilities.orbital;
    this.explode(pos, ab.color, 17);
    this.fx.push(new Shockwave(this.scene, pos, ab.color, 26));
    this.shake = Math.min(1.0, this.shake + 0.5);
    this._flashScreen('255,174,59', 0.35);
    this.sfx.explode('boss');
    for (const r of this.robots) {
      if (!r.alive) continue;
      const d = r.pos.distanceTo(pos);
      if (d <= ab.radius) this.damageRobot(r, ab.dmg * (1 - d / ab.radius * 0.4), 'pure');
    }
  }
  _emp(ab) {
    for (const r of this.robots) {
      if (!r.alive) continue;
      r.frozenT = Math.max(r.frozenT, ab.dur);
      this.damageRobot(r, ab.dmg, 'pure');
    }
    this.fx.push(new Shockwave(this.scene, this.base.pos, ab.color, 80));
    this._flashScreen('155,107,255', 0.3);
    this.sfx.shieldBreak();
    this._toast('EMP — ROBOTS FROZEN', true);
  }
  _updateAbilities(dt) {
    for (const k in this.cooldowns) if (this.cooldowns[k] > 0) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    if (this.overdriveT > 0) this.overdriveT = Math.max(0, this.overdriveT - dt);
    for (let i = this.orbitalQueue.length - 1; i >= 0; i--) {
      const o = this.orbitalQueue[i];
      o.t -= dt;
      o.ring.material.opacity = 0.35 + Math.sin(this.clock.elapsedTime * 22) * 0.25;
      const closing = 1 - (1 - o.t / CONFIG.abilities.orbital.delay) * 0.35;
      o.ring.scale.setScalar(Math.max(0.4, closing));
      if (o.t <= 0) {
        this._orbitalDetonate(o.pos);
        this.scene.remove(o.ring); o.ring.geometry.dispose();
        this.orbitalQueue.splice(i, 1);
      }
    }
  }

  // ---------- AI aggression / penalty mechanic ----------
  aiOnHit() { /* successful hits gently reduce threat */ this.threat = Math.max(0, this.threat - 0.02); }
  aiOnMiss() {
    this.threat = Math.min(100, this.threat + 4.5);
    this._threatHint('Wasted shot detected. The collective grows bolder.');
  }
  threatMul() { return 1 + (this.threat / 100) * 0.7; }          // robot speed multiplier
  spawnRateMul() { return 1 + (this.threat / 100) * 0.9; }        // faster spawns when threat high

  // ---------------------------------------------------------
  startGame() {
    this.sfx.init();
    this.sfx.resume();
    this.sfx.setLaser(false);
    this.levelIdx = 0;
    this.resources = CONFIG.startResources;
    this.threat = 0;
    this._clearField();
    this._showScreen(null);
    this.state = 'playing';
    this._startLevel(0);
  }
  _clearField() {
    [...this.robots, ...this.turrets, ...this.projectiles, ...this.fx].forEach(o => o.dispose && o.dispose());
    this.robots = []; this.turrets = []; this.projectiles = []; this.fx = [];
    this.orbitalQueue.forEach(o => { this.scene.remove(o.ring); o.ring.geometry.dispose(); });
    this.orbitalQueue = [];
    this.aiResist = { kinetic: 0, energy: 0 };
    this.dmgWindow = { kinetic: 0, energy: 0 };
    this.adaptT = CONFIG.adapt.interval;
    this.overdriveT = 0;
    this.cooldowns = { orbital: 0, overdrive: 0, emp: 0 };
    this.aimingAbility = null;
    this.base.reset();
    this._cancelBuild();
  }
  _startLevel(idx) {
    this.levelIdx = idx;
    this.waveIdx = 0;
    this._beginWave();
    this._refreshDock();
    this._updateHUD();
  }
  _beginWave() {
    const lvl = CONFIG.levels[this.levelIdx];
    const wave = lvl.waves[this.waveIdx];
    this.spawnQueue = [];
    for (const grp of wave) {
      const delay = grp.delay || 0;
      for (let i = 0; i < grp.count; i++) {
        this.spawnQueue.push({ type: grp.type, time: delay + i * grp.interval });
      }
    }
    this.spawnQueue.sort((a, b) => a.time - b.time);
    this.spawnPtr = 0;
    this.waveTimer = 0;
    this.waveActive = true;
    this.sfx.wave();
    this._updateHUD();
  }
  _spawnRobot(type) {
    const ang = Math.random() * Math.PI * 2;
    const r = CONFIG.arenaRadius - 0.5;
    const pos = new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r);
    if (CONFIG.robots[type].flying) pos.y = 15 + Math.random() * 5;   // dive in from the sky
    const speedMul = this.threatMul();
    const healthMul = 1 + this.levelIdx * 0.06;
    const robot = new Robot(this.scene, type, pos, speedMul, healthMul);
    this.robots.push(robot);
  }
  _spawnSplit(parent) {
    const n = parent.cfg.splitCount || 2;
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2 + Math.random();
      const off = new THREE.Vector3(Math.cos(ang) * 1.6, 0, Math.sin(ang) * 1.6);
      const child = new Robot(this.scene, parent.cfg.splits, parent.pos.clone().add(off), this.threatMul(), 1);
      this.robots.push(child);
    }
  }
  _updateSpawning(dt) {
    if (!this.waveActive) {
      // between waves / levels
      if (this.interWave > 0) {
        this.interWave -= dt;
        if (this.interWave <= 0) this._advance();
      }
      return;
    }
    this.waveTimer += dt * this.spawnRateMul();
    while (this.spawnPtr < this.spawnQueue.length && this.spawnQueue[this.spawnPtr].time <= this.waveTimer) {
      this._spawnRobot(this.spawnQueue[this.spawnPtr].type);
      this.spawnPtr++;
    }
    // wave cleared?
    if (this.spawnPtr >= this.spawnQueue.length && this.robots.length === 0) {
      this.waveActive = false;
      this.interWave = 2.2;
      this._upgradeBase();   // surviving a round reinforces the base
    }
  }
  _upgradeBase() {
    this.base.upgrade();
    this.sfx.upgrade();
    this._updateHUD();
    this._toast(`BASE UPGRADED \u2192 Mk.${this.base.level}`, true);
    this._threatHint(`Base reinforced to Mk.${this.base.level}: +max integrity, faster heavier cannon` + (this.base.cannon.splash ? ', splash rounds online.' : '.'));
  }
  _advance() {
    const lvl = CONFIG.levels[this.levelIdx];
    if (this.waveIdx < lvl.waves.length - 1) {
      this.waveIdx++;
      this._beginWave();
    } else {
      // level complete
      if (this.levelIdx >= CONFIG.levels.length - 1) {
        this._victory();
      } else {
        this.resources += lvl.reward;
        this._levelTransition();
      }
    }
  }

  // ---------------------------------------------------------
  _loop() {
    requestAnimationFrame(this._loop);
    let dt = this.clock.getDelta();
    if (dt > 0.05) dt = 0.05;
    const t = this.clock.elapsedTime;
    // hit-stop: briefly slow time for impact on big kills
    let sdt = dt;
    if (this.hitStop > 0) { this.hitStop -= dt; sdt = dt * 0.12; }

    if (this.state === 'playing') this._step(sdt, t);
    else { this.base.update(dt, t); this._idleFx(dt, t); }

    // camera shake
    if (this.shake > 0) {
      this.shake -= dt;
      const s = this.shake * 1.4;
      this.camera.position.set(
        this.camBase.x + (Math.random() - 0.5) * s,
        this.camBase.y + (Math.random() - 0.5) * s,
        this.camBase.z + (Math.random() - 0.5) * s);
    } else {
      this.camera.position.lerp(this.camBase, 0.1);
    }
    this.boundaryRing.material.opacity = 0.4 + Math.sin(t * 2) * 0.15 + this.threat / 300;
    this.renderer.render(this.scene, this.camera);
  }

  _idleFx(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      this.fx[i].update(dt);
      if (!this.fx[i].alive) { this.fx[i].dispose(); this.fx.splice(i, 1); }
    }
  }

  _step(dt, t) {
    this.base.update(dt, t);
    this.base.aimAt(this.aim);

    // ghost follow
    if (this.ghost) {
      const p = this.aim.clone(); p.y = 0;
      this.ghost.group.position.copy(p);
      const ok = this._placeValid(p) && this.resources >= CONFIG.weapons[this.selectedBuild].cost;
      this.ghost.group.traverse(o => { if (o.isMesh && o.material) o.material.opacity = ok ? 0.6 : 0.25; });
    }

    this._updateSpawning(dt);
    this._updateAbilities(dt);

    // adaptive AI: periodically harden against the player's dominant damage type
    this.adaptT -= dt;
    if (this.adaptT <= 0) { this.adaptT = CONFIG.adapt.interval; this._adapt(); }

    // --- aerial raids: Wraiths sometimes scream in from the sky; more often + more of them as AI threat climbs ---
    this.airRaidT -= dt;
    if (this.airRaidT <= 0) {
      const interval = (16 - this.levelIdx * 3) - (this.threat / 100) * 8;
      this.airRaidT = Math.max(5, interval) + Math.random() * 5;
      const count = 1 + Math.floor(this.levelIdx * 0.6 + this.threat / 40);
      for (let k = 0; k < count; k++) this._spawnRobot('wraith');
      this._threatHint(count > 1 ? `Air raid! ${count} Wraiths inbound!` : 'A Wraith dives from above!');
    }

    // robots
    for (let i = this.robots.length - 1; i >= 0; i--) {
      const r = this.robots[i];
      this._robotTick(r, dt, t);
      if (!r.alive) {
        this._destroyFx(r);
        if (r.cfg.splits && r.health <= 0) this._spawnSplit(r);
        r.dispose(); this.robots.splice(i, 1);
      }
    }
    // turrets
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const tr = this.turrets[i];
      tr.update(dt, t, this);
      if (!tr.alive) {
        this.explode(tr.pos, 0xff4d4d, 4);
        this.fx.push(new Debris(this.scene, tr.pos, 0xff7a4d, 8));
        this.sfx.explode('big');
        this.shake = Math.min(0.7, this.shake + 0.25);
        this.threat = Math.min(100, this.threat + 6);
        this._threatHint('A turret was destroyed. Hold the line!');
        tr.dispose(); this.turrets.splice(i, 1);
      }
    }
    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt, this);
      if (!p.alive) {
        if (p.manual && !p.hit) this.aiOnMiss();
        p.dispose(); this.projectiles.splice(i, 1);
      }
    }
    // fx
    this._idleFx(dt);

    // continuous laser hum if any laser is currently burning a target
    let laserOn = false;
    for (const tr of this.turrets) { if (tr.typeKey === 'laser' && tr.beam && tr.beam.visible) { laserOn = true; break; } }
    this.sfx.setLaser(laserOn);

    // ambient threat creep when base is hurt
    const hpFrac = this.base.health / this.base.maxHealth;
    if (hpFrac < 0.5) this.threat = Math.min(100, this.threat + dt * (0.5 - hpFrac) * 6);
    this.threat = Math.max(0, this.threat - dt * 0.4); // slow natural decay

    if (this._prevHp === undefined) this._prevHp = this.base.health;
    if (this.base.health < this._prevHp - 0.5) {
      const dmg = this._prevHp - this.base.health;
      this.shake = Math.min(0.6, this.shake + Math.min(0.3, dmg * 0.012));
      this.sfx.baseHit(dmg);
      this._flashScreen('255,77,77', Math.min(0.5, 0.12 + dmg * 0.01));
    }
    this._prevHp = this.base.health;

    // shield impact / collapse audio
    if (this.base.shieldEnergy < this._prevShieldE - 0.5) {
      if (this.base.shieldBroken) this.sfx.shieldBreak();
      else this.sfx.shieldImpact();
    }
    this._prevShieldE = this.base.shieldEnergy;

    this._updateHUD();

    if (this.base.health <= 0) this._gameOver();
  }

  _robotTick(r, dt, t) {
    if (!r.alive) return;

    // EMP-frozen robots just sit and spark
    if (r.frozenT > 0) { r.update(dt, t, this); return; }

    // Disruptor: hunts the nearest active turret and disables it on contact
    if (r.cfg.disruptor) {
      let tgt = null, bd = Infinity;
      for (const tr of this.turrets) {
        if (!tr.alive || tr.disabledT > 0) continue;
        const d = tr.pos.distanceTo(r.pos);
        if (d < bd) { bd = d; tgt = tr; }
      }
      if (tgt) {
        const to = new THREE.Vector3().subVectors(tgt.pos, r.pos); to.y = 0;
        const dist = to.length();
        if (dist > r.radius + 2.2) {
          to.normalize();
          r.pos.addScaledVector(to, r.speed * dt);
          r.group.position.copy(r.pos);
          r.group.rotation.y = Math.atan2(to.x, to.z);
          r.walkPhase += dt * r.speed * 1.6;
          const sw = Math.sin(r.walkPhase) * 0.5;
          if (r.legL) { r.legL.rotation.x = sw; r.legR.rotation.x = -sw; }
        } else {
          tgt.disabledT = Math.max(tgt.disabledT, r.cfg.disableTime);
          this.explode(r.pos, 0xffd24d, 5);
          this.fx.push(new Shockwave(this.scene, r.pos, 0xffd24d, 9));
          this.sfx.tesla();
          this._threatHint('A turret was disabled by a Disruptor!');
          r.alive = false;   // self-destructs; removal loop handles FX
        }
        r.hp.faceCamera(this.camera);
        return;
      }
      // no turrets left → falls through to attack the base directly
    }

    // melee robots: forward turrets in their path draw aggro (placement penalty)
    if (!r.cfg.ranged && !r.cfg.flying) {
      let blocker = null, bd = Infinity;
      for (const tr of this.turrets) {
        if (!tr.alive) continue;
        const d = tr.pos.distanceTo(r.pos);
        if (d < bd) { bd = d; blocker = tr; }
      }
      if (blocker && bd < r.radius + 2.4) {
        blocker.takeDamage(r.cfg.damage * dt * 1.2);
        r.group.position.y = Math.sin(t * 14) * 0.18;
        r.hp.faceCamera(this.camera);
        if (r._flash > 0) { r._flash -= dt; }
        return;
      }
    }
    r.update(dt, t, this);
  }

  // ---------------------------------------------------------
  //  HUD + screens
  _updateHUD() {
    const hpFrac = this.base.health / this.base.maxHealth;
    el('health-bar').style.width = (hpFrac * 100) + '%';
    el('health-num').textContent = Math.ceil(this.base.health) + ' / ' + this.base.maxHealth;
    el('base-mk').textContent = 'Mk.' + this.base.level;
    el('res-val').textContent = Math.floor(this.resources);

    // Aegis shield
    const sFrac = this.base.shieldEnergy / this.base.shieldMax;
    el('shield-bar').style.width = (sFrac * 100) + '%';
    const sw = el('shield-wrap'), btn = el('shield-btn');
    const sActive = this.base.shieldActive();
    let sLabel = 'READY';
    if (this.base.shieldBroken) sLabel = 'RECHARGING';
    else if (sActive) sLabel = 'SHIELDS UP';
    el('shield-status').textContent = sLabel + ' · ' + Math.round(sFrac * 100) + '%';
    sw.classList.toggle('up', sActive);
    sw.classList.toggle('broken', this.base.shieldBroken);
    btn.firstChild.textContent = sActive ? 'LOWER SHIELD ' : 'RAISE SHIELD ';
    btn.classList.toggle('active', sActive);
    btn.classList.toggle('disabled', this.base.shieldBroken);

    // abilities
    for (const k of ['orbital', 'overdrive', 'emp']) {
      const ab = CONFIG.abilities[k], abtn = el('ab-' + k);
      if (!abtn) continue;
      const cd = this.cooldowns[k];
      const cover = abtn.querySelector('.cd'), num = abtn.querySelector('.cdnum');
      if (cd > 0) { abtn.classList.add('cooling'); cover.style.height = (cd / ab.cd * 100) + '%'; num.textContent = Math.ceil(cd); }
      else { abtn.classList.remove('cooling'); cover.style.height = '0%'; num.textContent = ''; }
    }
    el('ab-orbital').classList.toggle('armed', this.aimingAbility === 'orbital');
    el('ab-overdrive').classList.toggle('active', this.overdriveT > 0);

    // adaptive-AI resistance chips
    const rk = el('resist-kin'), re = el('resist-en');
    rk.textContent = Math.round(this.aiResist.kinetic * 100) + '%';
    re.textContent = Math.round(this.aiResist.energy * 100) + '%';
    rk.parentElement.classList.toggle('on', this.aiResist.kinetic > 0.001);
    re.parentElement.classList.toggle('on', this.aiResist.energy > 0.001);
    el('level-val').textContent = (this.levelIdx + 1) + ' / 3';
    const lvl = CONFIG.levels[this.levelIdx];
    el('wave-val').textContent = (this.waveIdx + 1) + ' / ' + lvl.waves.length;

    el('threat-bar').style.width = this.threat + '%';
    const tw = el('threat-wrap');
    let label = 'DORMANT', col = '#49f5a0';
    if (this.threat > 75) { label = 'OVERWHELMING'; col = '#ff4d4d'; }
    else if (this.threat > 50) { label = 'AGGRESSIVE'; col = '#ffae3b'; }
    else if (this.threat > 25) { label = 'ALERT'; col = '#ffd76b'; }
    el('threat-label').textContent = label;
    el('threat-label').style.color = col;
    tw.classList.toggle('hot', this.threat > 50);

    this._refreshDock();
  }
  _refreshDock() {
    if (!this.dockBtns) return;
    for (const key in this.dockBtns) {
      const w = CONFIG.weapons[key];
      const b = this.dockBtns[key];
      const locked = w.unlock > this.levelIdx + 1;
      const cant = !locked && this.resources < w.cost;
      b.classList.toggle('locked', locked);
      b.classList.toggle('cant', cant);
      b.classList.toggle('selected', this.selectedBuild === key);
      const costEl = b.querySelector('.bcost');
      costEl.textContent = locked ? `LVL ${w.unlock}` : `◆ ${w.cost}`;
    }
  }
  _toast(msg, good) {
    const tt = el('toast');
    tt.textContent = msg;
    tt.classList.toggle('good', !!good);
    tt.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => tt.classList.remove('show'), 1700);
  }
  _threatHint(msg) {
    el('threat-hint').textContent = msg;
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => { if (this.threat < 25) el('threat-hint').textContent = 'The AI watches. Spend wisely; do not waste shots.'; }, 3500);
  }

  _showScreen(id) {
    ['start', 'transition', 'gameover', 'victory'].forEach(s => el(s).classList.remove('show'));
    el('hud').style.opacity = id ? '0' : '1';
    el('hud').style.pointerEvents = id ? 'none' : 'auto';
    if (id) el(id).classList.add('show');
  }
  _bindScreens() {
    el('start-btn').addEventListener('click', () => this.startGame());
    el('sound-btn').addEventListener('click', () => {
      this.sfx.init();
      const m = this.sfx.toggleMute();
      this.sfx.resume();
      const btn = el('sound-btn');
      btn.classList.toggle('muted', m);
      btn.querySelector('.lbl').textContent = m ? 'SOUND OFF' : 'SOUND ON';
    });
    el('shield-btn').addEventListener('click', () => { if (this.state === 'playing') this._toggleShield(); });
    { const sb = el('sound-btn'); sb.classList.toggle('muted', this.sfx.muted); sb.querySelector('.lbl').textContent = this.sfx.muted ? 'SOUND OFF' : 'SOUND ON'; }
    ['orbital', 'overdrive', 'emp'].forEach(k => el('ab-' + k).addEventListener('click', () => this._useAbility(k)));
    el('transition-btn').addEventListener('click', () => {
      this._showScreen(null); this.state = 'playing'; this._startLevel(this.levelIdx + 1);
    });
    el('gameover-btn').addEventListener('click', () => this.startGame());
    el('victory-btn').addEventListener('click', () => this.startGame());
    this._showScreen('start');
  }
  _levelTransition() {
    this.state = 'transition';
    this._cancelBuild();
    const next = CONFIG.levels[this.levelIdx + 1];
    el('tr-kicker').textContent = `LEVEL ${this.levelIdx + 1} SECURED`;
    el('tr-title').textContent = next.name;
    el('tr-blurb').textContent = next.blurb;
    el('tr-reward').textContent = '+' + CONFIG.levels[this.levelIdx].reward;
    el('tr-res').textContent = Math.floor(this.resources);
    this._showScreen('transition');
  }
  _gameOver() {
    this.state = 'gameover';
    this.sfx.setLaser(false);
    this.sfx.gameover();
    this._cancelBuild();
    el('go-level').textContent = (this.levelIdx + 1);
    el('go-wave').textContent = (this.waveIdx + 1);
    this._showScreen('gameover');
  }
  _victory() {
    this.state = 'victory';
    this.sfx.setLaser(false);
    this.sfx.victory();
    this._cancelBuild();
    el('vic-res').textContent = Math.floor(this.resources);
    el('vic-hp').textContent = Math.round(this.base.health / this.base.maxHealth * 100) + '%';
    this._showScreen('victory');
  }
}

window.addEventListener('DOMContentLoaded', () => { window.GAME = new Game(); });
