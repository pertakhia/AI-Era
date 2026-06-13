// ============================================================
// AI ERA — entities & FX
// Loaded after THREE + config.js. Exposes globals:
//   FX, Base, Robot, Turret, Projectile
// ============================================================

// ---------- shared glow sprite texture ----------
const FX = (function () {
  function radialTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.28)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.Texture(c);
    t.needsUpdate = true;
    return t;
  }
  const glowTex = radialTexture();

  function glow(color, size) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    m.scale.set(size, size, 1);
    return m;
  }
  return { glowTex, glow };
})();

// ---------- floating health bar (billboarded) ----------
class HealthBar {
  constructor(parent, y, width) {
    this.group = new THREE.Group();
    this.group.position.y = y;
    this.w = width;
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width * 0.16),
      new THREE.MeshBasicMaterial({ color: 0x0a0f1c, transparent: true, opacity: 0.85, depthTest: false })
    );
    bg.renderOrder = 999;
    this.fg = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width * 0.16),
      new THREE.MeshBasicMaterial({ color: 0x49f5a0, depthTest: false })
    );
    this.fg.renderOrder = 1000;
    this.fg.position.z = 0.01;
    this.group.add(bg, this.fg);
    this.group.visible = false;
    parent.add(this.group);
  }
  set(frac) {
    frac = Math.max(0, Math.min(1, frac));
    this.group.visible = frac < 0.999;
    this.fg.scale.x = frac || 0.0001;
    this.fg.position.x = -this.w * (1 - frac) / 2;
    const col = this.fg.material.color;
    if (frac > 0.5) col.setHex(0x49f5a0);
    else if (frac > 0.25) col.setHex(0xffae3b);
    else col.setHex(0xff4d4d);
  }
  faceCamera(cam) { this.group.quaternion.copy(cam.quaternion); }
}

// ============================================================
//  BASE
// ============================================================
class Base {
  constructor(scene) {
    this.scene = scene;
    this.health = CONFIG.base.maxHealth;
    this.maxHealth = CONFIG.base.maxHealth;
    this.radius = CONFIG.base.radius;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.group = new THREE.Group();
    this.cooldown = 0;
    this.shielded = false;
    this._hitFlash = 0;
    this.level = 1;
    this.cannon = Object.assign({}, CONFIG.base.cannon);
    this.upgradeMeshes = [];
    // Aegis shield state
    this.shieldMax = CONFIG.base.shield.max;
    this.shieldEnergy = this.shieldMax;
    this.shieldUp = false;
    this.shieldBroken = false;
    this._shieldFlash = 0;
    this._build();
    scene.add(this.group);
  }
  _build() {
    const P = CONFIG.palette;
    // foundation pad
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(this.radius + 2.4, this.radius + 3.2, 1.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x1a2236, metalness: 0.8, roughness: 0.5 })
    );
    pad.position.y = 0.6; pad.receiveShadow = true;
    // main tower
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(this.radius - 0.4, this.radius + 0.6, 5.2, 8),
      new THREE.MeshStandardMaterial({ color: P.baseMetal, metalness: 0.85, roughness: 0.38 })
    );
    tower.position.y = 3.6; tower.castShadow = true;
    // ringed mid band
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(this.radius + 0.2, 0.4, 8, 8),
      new THREE.MeshStandardMaterial({ color: P.baseCore, emissive: P.baseCore, emissiveIntensity: 1.1, metalness: 0.6, roughness: 0.3 })
    );
    band.position.y = 4.4; band.rotation.x = Math.PI / 2;
    // core orb
    this.core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.7, 1),
      new THREE.MeshStandardMaterial({ color: P.baseCore, emissive: P.baseCore, emissiveIntensity: 1.6, roughness: 0.2 })
    );
    this.core.position.y = 7.4;
    const coreGlow = FX.glow(P.baseCore, 9);
    coreGlow.position.y = 7.4;
    // turret head (aims at cursor)
    this.head = new THREE.Group();
    this.head.position.y = 6.0;
    const headBox = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1.5, 2.4),
      new THREE.MeshStandardMaterial({ color: 0x32405f, metalness: 0.9, roughness: 0.3 })
    );
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 4.2, 10),
      new THREE.MeshStandardMaterial({ color: 0x55708f, metalness: 0.95, roughness: 0.25, emissive: 0x0a2a3a, emissiveIntensity: 0.5 })
    );
    barrel.rotation.z = Math.PI / 2;
    barrel.position.x = 2.0;
    const tip = FX.glow(P.cyan, 2.2); tip.position.x = 4.2;
    barrel.add(tip);
    this.barrelTip = new THREE.Vector3();
    this._tipRef = tip;
    this.head.add(headBox, barrel);

    // light from core
    this.coreLight = new THREE.PointLight(P.baseCore, 1.4, 60, 2);
    this.coreLight.position.y = 7.4;

    this.group.add(pad, tower, band, this.core, coreGlow, this.head, this.coreLight);
    this.matsToFlash = [tower.material];

    // ---- Aegis round shield dome (hidden until raised) ----
    const sc = CONFIG.base.shield;
    this.shieldGroup = new THREE.Group();
    this.shieldGroup.position.y = 5.0;
    this.domeInner = new THREE.Mesh(
      new THREE.SphereGeometry(sc.radius, 32, 24),
      new THREE.MeshBasicMaterial({ color: P.cyan, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.domeWire = new THREE.Mesh(
      new THREE.SphereGeometry(sc.radius * 1.012, 22, 14),
      new THREE.MeshBasicMaterial({ color: 0xbff2ff, wireframe: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    // bright equator ring marks the dome edge
    this.domeRing = new THREE.Mesh(
      new THREE.TorusGeometry(sc.radius * 0.999, 0.16, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0xbff2ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.domeRing.rotation.x = Math.PI / 2;
    this.shieldGroup.add(this.domeInner, this.domeWire, this.domeRing);
    this.shieldGroup.visible = false;
    this.group.add(this.shieldGroup);
  }
  shieldActive() { return this.shieldUp && this.shieldEnergy > 0 && !this.shieldBroken; }
  setShield(up) {
    if (up) {
      if (this.shieldBroken || this.shieldEnergy <= 0) return false;
      this.shieldUp = true;
    } else {
      this.shieldUp = false;
    }
    return true;
  }
  toggleShield() { return this.setShield(!this.shieldUp); }
  aimAt(point) {
    // rotate head around Y toward point (point on ground plane)
    const dx = point.x - this.pos.x, dz = point.z - this.pos.z;
    this.head.rotation.y = Math.atan2(dx, dz) - Math.PI / 2;
  }
  muzzleWorld() {
    this._tipRef.getWorldPosition(this.barrelTip);
    return this.barrelTip;
  }
  takeDamage(n) {
    // Aegis shield soaks all incoming damage until its energy is spent
    if (this.shieldActive()) {
      this.shieldEnergy -= n;
      this._shieldFlash = Math.min(0.45, this._shieldFlash + 0.22);
      if (this.shieldEnergy <= 0) {
        this.shieldEnergy = 0;
        this.shieldUp = false;
        this.shieldBroken = true;   // collapsed — must recharge before reuse
        this._shieldFlash = 0.55;
      }
      return;
    }
    if (this.shielded) n *= 0.45;
    this.health = Math.max(0, this.health - n);
    this._hitFlash = 0.18;
  }
  heal(n) { this.health = Math.min(this.maxHealth, this.health + n); }
  upgrade() {
    this.level++;
    this.maxHealth += 160;
    this.health = Math.min(this.maxHealth, this.health + 190);
    this.cannon.damage += 7;
    this.cannon.cooldown = Math.max(0.12, this.cannon.cooldown * 0.9);
    this.cannon.projectileSpeed += 4;
    if (this.level >= 4) this.cannon.splash = Math.max(this.cannon.splash || 0, 3.4); // gains AoE rounds late
    // visual growth: stacked glowing armor ring + brighter, bigger core
    const P = CONFIG.palette;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(this.radius + 0.6 + this.level * 0.14, 0.22, 8, 24),
      new THREE.MeshStandardMaterial({ color: P.cyan, emissive: P.cyan, emissiveIntensity: 1.2, metalness: 0.7, roughness: 0.3 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.5 + Math.min(this.level, 8) * 0.5;
    this.group.add(ring);
    this.upgradeMeshes.push(ring);
    this.core.scale.multiplyScalar(1.05);
    this.coreLight.intensity += 0.15;
    this.shieldMax += 60;
    this.shieldEnergy = Math.min(this.shieldMax, this.shieldEnergy + 60);
  }
  reset() {
    this.level = 1;
    this.maxHealth = CONFIG.base.maxHealth;
    this.health = this.maxHealth;
    this.cannon = Object.assign({}, CONFIG.base.cannon);
    this.shielded = false;
    this.cooldown = 0;
    this._hitFlash = 0;
    this.upgradeMeshes.forEach(m => { this.group.remove(m); m.geometry.dispose(); });
    this.upgradeMeshes = [];
    this.core.scale.set(1, 1, 1);
    this.shieldMax = CONFIG.base.shield.max;
    this.shieldEnergy = this.shieldMax;
    this.shieldUp = false;
    this.shieldBroken = false;
    this._shieldFlash = 0;
  }
  update(dt, t) {
    this.core.rotation.y += dt * 0.6;
    this.core.rotation.x += dt * 0.3;
    const pulse = 1.4 + Math.sin(t * 3) * 0.3;
    this.core.material.emissiveIntensity = pulse;
    this.coreLight.intensity = 1.2 + Math.sin(t * 3) * 0.3 + (this.shielded ? 0.8 : 0);
    if (this._hitFlash > 0) {
      this._hitFlash -= dt;
      const f = Math.max(0, this._hitFlash / 0.18);
      this.matsToFlash[0].emissive.setRGB(f * 0.9, 0, 0);
      this.matsToFlash[0].emissiveIntensity = f;
    }
    if (this.cooldown > 0) this.cooldown -= dt;

    // ---- Aegis shield energy + dome ----
    const sc = CONFIG.base.shield;
    if (this.shieldUp) {
      this.shieldEnergy = Math.max(0, this.shieldEnergy - sc.idleDrain * dt);
      if (this.shieldEnergy <= 0) { this.shieldUp = false; this.shieldBroken = true; this.shieldEnergy = 0; }
    } else {
      this.shieldEnergy = Math.min(this.shieldMax, this.shieldEnergy + sc.regen * dt);
      if (this.shieldBroken && this.shieldEnergy >= this.shieldMax * sc.rechargeAt) this.shieldBroken = false;
    }
    this._shieldFlash = Math.max(0, this._shieldFlash - dt);
    const active = this.shieldActive();
    this.shieldGroup.visible = active || this._shieldFlash > 0;
    if (this.shieldGroup.visible) {
      this.domeWire.rotation.y += dt * 0.4;
      this.domeInner.rotation.y -= dt * 0.22;
      const flash = this._shieldFlash * 1.3;
      const frac = this.shieldEnergy / this.shieldMax;
      this.domeInner.material.opacity = (active ? 0.13 : 0) + flash + Math.sin(t * 4) * 0.02;
      this.domeWire.material.opacity = (active ? 0.34 : 0.06) + flash;
      this.domeRing.material.opacity = (active ? 0.55 : 0.1) + flash + Math.sin(t * 5) * 0.05;
      const col = this.shieldBroken ? 0xff5a5a : (frac < 0.3 ? 0xffae3b : 0x35e0ff);
      this.domeInner.material.color.setHex(col);
      this.domeWire.material.color.setHex(col === 0x35e0ff ? 0xbff2ff : col);
      this.domeRing.material.color.setHex(col === 0x35e0ff ? 0xbff2ff : col);
    }
  }
}

// ============================================================
//  ROBOT
// ============================================================
class Robot {
  constructor(scene, typeKey, spawnPos, speedMul, healthMul) {
    this.scene = scene;
    this.cfg = CONFIG.robots[typeKey];
    this.typeKey = typeKey;
    this.maxHealth = this.cfg.health * (healthMul || 1);
    this.health = this.maxHealth;
    this.speed = this.cfg.speed * (speedMul || 1);
    this.radius = this.cfg.radius;
    this.reward = this.cfg.reward;
    this.alive = true;
    this.pos = spawnPos.clone();
    this.frozenT = 0;
    this.fireCd = Math.random() * 1.2;
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this._build();
    scene.add(this.group);
  }
  _build() {
    const c = this.cfg;
    const s = c.scale;
    const metal = new THREE.MeshStandardMaterial({ color: c.color, metalness: 0.85, roughness: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: CONFIG.palette.robotDark, metalness: 0.9, roughness: 0.45 });
    const eyeCol = c.boss ? 0xff2a4a : (c.ranged ? 0xff8b3b : CONFIG.palette.robotEye);
    const eyeMat = new THREE.MeshStandardMaterial({ color: eyeCol, emissive: eyeCol, emissiveIntensity: 1.8 });

    // ---- flying kamikaze (Wraith) ----
    if (c.flying) {
      const fuse = new THREE.Mesh(
        new THREE.ConeGeometry(0.55 * s, 1.9 * s, 7),
        new THREE.MeshStandardMaterial({ color: c.color, metalness: 0.6, roughness: 0.35, emissive: c.color, emissiveIntensity: 0.45 })
      );
      fuse.rotation.x = Math.PI / 2; // point forward (+z)
      fuse.castShadow = true;
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(2.7 * s, 0.12 * s, 0.8 * s),
        new THREE.MeshStandardMaterial({ color: CONFIG.palette.robotDark, metalness: 0.9, roughness: 0.4 })
      );
      wing.position.z = -0.1 * s;
      const finV = new THREE.Mesh(new THREE.BoxGeometry(0.12 * s, 0.9 * s, 0.7 * s),
        new THREE.MeshStandardMaterial({ color: CONFIG.palette.robotDark, metalness: 0.9, roughness: 0.4 }));
      finV.position.set(0, 0.4 * s, -0.6 * s);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.34 * s, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xfff0a0, emissive: 0xff4d4d, emissiveIntensity: 2.0 }));
      core.position.z = 0.55 * s;
      const coreGlow = FX.glow(0xff5ce0, 2.6 * s); coreGlow.position.z = 0.55 * s;
      // engine trail behind
      const trail = FX.glow(0xff5ce0, 3.2 * s); trail.position.z = -1.1 * s;
      this.trailFx = trail;
      this.flyLight = new THREE.PointLight(0xff5ce0, 1.1, 22, 2);
      this.group.add(fuse, wing, finV, core, coreGlow, trail, this.flyLight);
      this.bodyMats = [fuse.material];
      this.hp = new HealthBar(this.group, 1.7 * s, 2.2 * s);
      this.walkPhase = Math.random() * 6;
      return;
    }

    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.4 * s, 1.5 * s, 1.1 * s), metal);
    torso.position.y = 1.5 * s; torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9 * s, 0.7 * s, 0.9 * s), dark);
    head.position.y = 2.55 * s;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22 * s, 10, 10), eyeMat);
    eye.position.set(0, 2.58 * s, 0.46 * s);
    const eyeGlow = FX.glow(eyeCol, 1.6 * s);
    eyeGlow.position.copy(eye.position);

    // legs
    const legGeo = new THREE.BoxGeometry(0.34 * s, 1.4 * s, 0.34 * s);
    this.legL = new THREE.Mesh(legGeo, dark); this.legL.position.set(-0.42 * s, 0.7 * s, 0);
    this.legR = new THREE.Mesh(legGeo, dark); this.legR.position.set(0.42 * s, 0.7 * s, 0);
    // arms / cannons
    const armGeo = new THREE.BoxGeometry(0.32 * s, 0.32 * s, 1.3 * s);
    const armL = new THREE.Mesh(armGeo, metal); armL.position.set(-0.95 * s, 1.6 * s, 0.2 * s);
    const armR = new THREE.Mesh(armGeo, metal); armR.position.set(0.95 * s, 1.6 * s, 0.2 * s);

    this.group.add(torso, head, eye, eyeGlow, this.legL, this.legR, armL, armR);

    if (c.boss) {
      // shoulder spikes + crown glow
      const crown = new THREE.Mesh(new THREE.TorusGeometry(1.3 * s, 0.18 * s, 6, 12),
        new THREE.MeshStandardMaterial({ color: 0xff2a4a, emissive: 0xff2a4a, emissiveIntensity: 1.4 }));
      crown.position.y = 3.1 * s; crown.rotation.x = Math.PI / 2;
      const bossGlow = FX.glow(0xff2a4a, 14 * 1); bossGlow.position.y = 2 * s;
      this.bossLight = new THREE.PointLight(0xff2a4a, 1.6, 40, 2); this.bossLight.position.y = 2.4 * s;
      this.group.add(crown, bossGlow, this.bossLight);
    }
    if (c.color === 0xb56fff || c.scale >= 1.5) {
      // armor plates
      const plate = new THREE.Mesh(new THREE.BoxGeometry(1.7 * s, 0.5 * s, 1.4 * s),
        new THREE.MeshStandardMaterial({ color: 0x6a4fb0, metalness: 0.95, roughness: 0.3 }));
      plate.position.y = 2.0 * s; this.group.add(plate);
    }

    this.bodyMats = [metal, dark];
    this.hp = new HealthBar(this.group, (c.boss ? 4.6 : 3.4) * s, (c.boss ? 5 : 2) * s);
    this.walkPhase = Math.random() * 6;
  }
  takeDamage(n) {
    this.health -= n;
    this.hp.set(this.health / this.maxHealth);
    // brief white flash
    this._flash = 0.08;
    if (this.health <= 0) this.alive = false;
  }
  update(dt, t, game) {
    if (!this.alive) return;

    // EMP freeze: held in place, sparking
    if (this.frozenT > 0) {
      this.frozenT -= dt;
      const f = 0.4 + Math.sin(t * 30) * 0.3;
      this.bodyMats.forEach(m => { m.emissive.setRGB(0.2 * f, 0.4 * f, 0.9 * f); m.emissiveIntensity = f; });
      this.hp.faceCamera(game.camera);
      return;
    }

    // ---- flying kamikaze dive ----
    if (this.cfg.flying) {
      const tgt = new THREE.Vector3(game.base.pos.x, 5.5, game.base.pos.z);
      const to = new THREE.Vector3().subVectors(tgt, this.pos);
      const dist = to.length();
      const hitDist = (game.base.shieldActive() ? CONFIG.base.shield.radius + this.radius * 0.4 : game.base.radius + this.radius + 0.6);
      if (dist > hitDist) {
        to.normalize();
        this.pos.addScaledVector(to, this.speed * dt);
        this.group.position.copy(this.pos);
        this.group.rotation.y = Math.atan2(to.x, to.z);
        // pitch toward dive + banking roll
        this.group.rotation.x = Math.asin(Math.max(-1, Math.min(1, -to.y))) * 0.8;
        this.group.rotation.z = Math.sin(t * 9 + this.walkPhase) * 0.18;
        if (this.trailFx) this.trailFx.material.opacity = 0.6 + Math.random() * 0.4;
      } else {
        // detonate on the base
        game.base.takeDamage(this.cfg.damage);
        game.explode(this.pos, this.cfg.color, 7);
        game.shake = Math.min(0.6, game.shake + 0.18);
        this.alive = false;
      }
      if (this._flash > 0) {
        this._flash -= dt;
        const f = this._flash > 0 ? 1 : 0;
        this.bodyMats.forEach(m => { m.emissive.setRGB(f, f, f); m.emissiveIntensity = f * 0.9; });
      }
      this.hp.faceCamera(game.camera);
      return;
    }

    const base = game.base;
    const toBase = new THREE.Vector3().subVectors(base.pos, this.pos);
    toBase.y = 0;
    const dist = toBase.length();
    const baseEdge = (game.base.shieldActive() && !this.cfg.ranged) ? CONFIG.base.shield.radius : base.radius;
    const stopDist = baseEdge + this.radius + (this.cfg.ranged ? (this.cfg.fireRange - 4) : 0.4);

    if (dist > stopDist) {
      toBase.normalize();
      this.pos.addScaledVector(toBase, this.speed * dt);
      this.group.position.copy(this.pos);
      // face base
      this.group.rotation.y = Math.atan2(toBase.x, toBase.z);
      // walk anim
      this.walkPhase += dt * this.speed * 1.6;
      const sw = Math.sin(this.walkPhase) * 0.5;
      this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
    } else {
      // in range: attack
      if (this.cfg.ranged) {
        this.fireCd -= dt;
        if (this.fireCd <= 0) {
          this.fireCd = 1 / this.cfg.fireRate;
          game.spawnEnemyProjectile(this);
        }
      } else {
        // melee dps
        base.takeDamage(this.cfg.damage * dt);
        this.group.position.y = Math.sin(t * 14) * 0.18; // shake
      }
    }
    if (this._flash > 0) {
      this._flash -= dt;
      const f = this._flash > 0 ? 1 : 0;
      this.bodyMats.forEach(m => { m.emissive.setRGB(f, f, f); m.emissiveIntensity = f * 0.9; });
    }
    if (this.bossLight) this.bossLight.intensity = 1.4 + Math.sin(t * 5) * 0.4;
    this.hp.faceCamera(game.camera);
  }
  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}

// ============================================================
//  TURRET (buildable)
// ============================================================
class Turret {
  constructor(scene, typeKey, pos) {
    this.scene = scene;
    this.cfg = CONFIG.weapons[typeKey];
    this.typeKey = typeKey;
    this.pos = pos.clone();
    this.maxHealth = this.cfg.maxHealth;
    this.health = this.maxHealth;
    this.alive = true;
    this.cd = 0;
    this.target = null;
    this.disabledT = 0;
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this._build();
    scene.add(this.group);
  }
  _build() {
    const c = this.cfg;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.6, 0.9, 8),
      new THREE.MeshStandardMaterial({ color: 0x222c44, metalness: 0.85, roughness: 0.4 })
    );
    base.position.y = 0.45; base.castShadow = true;
    this.head = new THREE.Group();
    this.head.position.y = 1.1;

    if (this.typeKey === 'shield') {
      const dome = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.5, 1),
        new THREE.MeshStandardMaterial({ color: c.color, emissive: c.color, emissiveIntensity: 1.3, roughness: 0.2 })
      );
      dome.position.y = 1.4;
      const g = FX.glow(c.color, 6); g.position.y = 1.4;
      // aura ring on ground
      this.aura = new THREE.Mesh(
        new THREE.RingGeometry(c.auraRadius - 0.3, c.auraRadius, 48),
        new THREE.MeshBasicMaterial({ color: c.color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      this.aura.rotation.x = -Math.PI / 2; this.aura.position.y = 0.15;
      this.light = new THREE.PointLight(c.color, 1.0, c.auraRadius * 1.6, 2); this.light.position.y = 1.6;
      this.group.add(base, dome, g, this.aura, this.light);
    } else if (this.typeKey === 'tesla') {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 1.7, 8),
        new THREE.MeshStandardMaterial({ color: 0x2c2248, metalness: 0.9, roughness: 0.3 }));
      rod.position.y = 0.85;
      const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.08, 6, 16),
        new THREE.MeshStandardMaterial({ color: c.color, emissive: c.color, emissiveIntensity: 1.3 }));
      ring1.rotation.x = Math.PI / 2; ring1.position.y = 0.7;
      const ring2 = ring1.clone(); ring2.position.y = 1.18; ring2.scale.setScalar(0.62);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.44, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xe8d6ff, emissive: c.color, emissiveIntensity: 2.0, roughness: 0.2 }));
      orb.position.y = 1.9;
      const og = FX.glow(c.color, 3.2); og.position.y = 1.9;
      this.orb = orb; this.orbGlow = og;
      this.light = new THREE.PointLight(c.color, 1.0, 20, 2); this.light.position.y = 1.95;
      this.head.add(rod, ring1, ring2, orb, og, this.light);
      this.group.add(base, this.head);
    } else {
      const housing = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1.0, 1.6),
        new THREE.MeshStandardMaterial({ color: 0x2d3a5a, metalness: 0.9, roughness: 0.32 })
      );
      housing.castShadow = true;
      const barLen = this.typeKey === 'cannon' ? 2.6 : (this.typeKey === 'laser' ? 2.2 : 2.0);
      const barRad = this.typeKey === 'cannon' ? 0.42 : 0.26;
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(barRad, barRad * 0.9, barLen, 10),
        new THREE.MeshStandardMaterial({ color: c.color, emissive: c.color, emissiveIntensity: 0.7, metalness: 0.9, roughness: 0.3 })
      );
      barrel.rotation.x = Math.PI / 2; barrel.position.z = barLen / 2;
      this.tip = new THREE.Object3D(); this.tip.position.z = barLen; this.head.add(this.tip);
      const tipGlow = FX.glow(c.color, 1.6); tipGlow.position.z = barLen; this.head.add(tipGlow);
      this.head.add(housing, barrel);
      this.group.add(base, this.head);

      if (this.typeKey === 'laser') {
        // beam mesh, reused
        const beamMat = new THREE.MeshBasicMaterial({ color: c.color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
        this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 6), beamMat);
        this.beam.visible = false;
        this.group.add(this.beam);
      }
    }
    if (this.head.parent !== this.group && this.typeKey !== 'shield') this.group.add(this.head);
    this.hp = new HealthBar(this.group, 2.6, 2.2);
    // little spawn glow
    this.spawnFx = 0.4;
  }
  takeDamage(n) {
    this.health -= n; this.hp.set(this.health / this.maxHealth);
    if (this.health <= 0) this.alive = false;
  }
  _acquire(robots) {
    // nearest robot in range
    let best = null, bd = Infinity;
    for (const r of robots) {
      if (!r.alive) continue;
      const d = r.pos.distanceTo(this.pos);
      if (d <= this.cfg.range && d < bd) { bd = d; best = r; }
    }
    return best;
  }
  update(dt, t, game) {
    if (!this.alive) return;
    this.hp.faceCamera(game.camera);

    // disabled by a Disruptor — sparks, no firing
    if (this.disabledT > 0) {
      this.disabledT -= dt;
      const f = 0.5 + Math.sin(t * 28) * 0.4;
      if (this.head) this.head.rotation.z = Math.sin(t * 20) * 0.05;
      this.group.children.forEach(c => { if (c.material && c.material.emissive) c.material.emissiveIntensity = f * 0.4; });
      if (this.beam) this.beam.visible = false;
      return;
    }

    if (this.typeKey === 'shield') {
      this.aura.rotation.z += dt * 0.5;
      this.aura.material.opacity = 0.3 + Math.sin(t * 2) * 0.12;
      // heal base if base within aura
      if (game.base.pos.distanceTo(this.pos) <= this.cfg.auraRadius + game.base.radius) {
        game.base.heal(this.cfg.regen * dt);
      }
      return;
    }

    // re-acquire target periodically or if lost
    if (!this.target || !this.target.alive || this.target.pos.distanceTo(this.pos) > this.cfg.range) {
      this.target = this._acquire(game.robots);
    }
    if (this.target) {
      const tp = this.target.pos;
      this.head.rotation.y = Math.atan2(tp.x - this.pos.x, tp.z - this.pos.z);
    }

    if (this.typeKey === 'tesla') {
      this.head.rotation.y += dt * 1.4;             // spin coil (orb is on-axis; purely cosmetic)
      this.orb.material.emissiveIntensity = 1.6 + Math.sin(t * 10) * 0.5;
      this.orbGlow.material.opacity = 0.7 + Math.sin(t * 10) * 0.2;
      this.light.intensity = 0.9 + Math.sin(t * 10) * 0.3;
      if (this.cd > 0) this.cd -= dt;
      if (this.target && this.cd <= 0) {
        this.cd = (1 / this.cfg.fireRate) * game.fireRateMul();
        const origin = new THREE.Vector3(); this.orb.getWorldPosition(origin);
        const pts = [origin];
        const used = new Set();
        let cur = this.target;
        for (let i = 0; i <= this.cfg.chain && cur; i++) {
          game.damageRobot(cur, this.cfg.damage, 'energy');
          used.add(cur);
          const hp = cur.pos.clone(); hp.y += cur.cfg.flying ? 0 : 1.2;
          pts.push(hp);
          let nxt = null, nd = this.cfg.chainRange;
          for (const r of game.robots) {
            if (!r.alive || used.has(r)) continue;
            const d = r.pos.distanceTo(cur.pos);
            if (d < nd) { nd = d; nxt = r; }
          }
          cur = nxt;
        }
        game.spawnLightning(pts, this.cfg.color);
        if (game.sfx) game.sfx.tesla();
      }
      return;
    }

    if (this.typeKey === 'laser') {
      if (this.target) {
        // continuous beam (overdrive doubles dps)
        game.damageRobot(this.target, (this.cfg.damage * dt) / game.fireRateMul(), 'energy');
        const from = new THREE.Vector3(); this.tip.getWorldPosition(from);
        const to = this.target.pos.clone(); to.y = 1.4;
        this._drawBeam(from, to);
        this.beam.visible = true;
      } else if (this.beam) {
        this.beam.visible = false;
      }
      return;
    }

    // projectile turrets
    if (this.cd > 0) this.cd -= dt;
    if (this.target && this.cd <= 0) {
      this.cd = (1 / this.cfg.fireRate) * game.fireRateMul();
      const from = new THREE.Vector3(); this.tip.getWorldPosition(from);
      game.spawnProjectile(from, this.target, this.cfg, false);
      if (game.sfx) game.sfx.fire(this.typeKey === 'cannon' ? 'cannon' : 'turret');
    }
  }
  _drawBeam(from, to) {
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const len = from.distanceTo(to);
    this.beam.position.copy(this.group.worldToLocal(mid.clone()));
    this.beam.scale.y = len;
    // orient cylinder (local) toward direction
    const dir = to.clone().sub(from).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.beam.quaternion.copy(q);
    this.beam.material.opacity = 0.6 + Math.random() * 0.35;
  }
  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}

// ============================================================
//  PROJECTILE
// ============================================================
class Projectile {
  // mode: 'homing' tracks target slightly; enemy projectiles go straight at base
  constructor(scene, from, dir, cfg, isEnemy, target) {
    this.scene = scene;
    this.cfg = cfg;
    this.isEnemy = isEnemy;
    this.alive = true;
    this.damage = isEnemy ? cfg.projDamage : cfg.damage;
    this.splash = cfg.splash || 0;
    this.speed = isEnemy ? cfg.projSpeed : cfg.projectileSpeed;
    this.target = target || null;
    this.life = 3.5;
    this.pos = from.clone();
    this.vel = dir.clone().normalize().multiplyScalar(this.speed);
    const col = isEnemy ? 0xff4d4d : cfg.color;
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(isEnemy ? 0.32 : (this.splash ? 0.45 : 0.28), 8, 8),
      new THREE.MeshBasicMaterial({ color: col })
    );
    this.mesh.position.copy(from);
    this.glow = FX.glow(col, this.splash ? 3 : 2);
    this.glow.position.copy(from);
    scene.add(this.mesh, this.glow);
    this.col = col;
  }
  update(dt, game) {
    this.life -= dt;
    if (this.life <= 0) { this.alive = false; return; }
    // homing for player shots — full 3D so rounds arc UP to airborne targets
    if (!this.isEnemy && this.target && this.target.alive) {
      const desired = new THREE.Vector3().subVectors(this.target.pos, this.pos);
      desired.y += (this.target.radius || 1) * 0.7;   // aim at body center
      desired.normalize().multiplyScalar(this.speed);
      this.vel.lerp(desired, Math.min(1, dt * 6));
    }
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    this.glow.position.copy(this.pos);

    if (this.isEnemy) {
      // hit base?
      const shielded = game.base.shieldActive();
      const hitR = shielded ? CONFIG.base.shield.radius : game.base.radius + 0.6;
      if (this.pos.distanceTo(game.base.pos) < hitR) {
        game.base.takeDamage(this.damage);
        game.explode(this.pos, shielded ? 0x35e0ff : this.col, shielded ? 3.4 : 2.5);
        this.alive = false;
      }
    } else {
      // hit any robot?
      for (const r of game.robots) {
        if (!r.alive) continue;
        if (this.pos.distanceTo(r.pos) < r.radius + 0.5) {
          this._impact(r, game);
          break;
        }
      }
    }
  }
  _impact(robot, game) {
    this.hit = true;
    if (this.splash > 0) {
      game.explode(this.pos, this.col, this.splash * 1.4);
      for (const r of game.robots) {
        if (!r.alive) continue;
        const d = r.pos.distanceTo(this.pos);
        if (d <= this.splash) {
          const falloff = 1 - d / this.splash * 0.5;
          game.damageRobot(r, this.damage * falloff, this.cfg.dmgType);
        }
      }
    } else {
      game.damageRobot(robot, this.damage, this.cfg.dmgType);
      game.explode(this.pos, this.col, 1.2);
    }
    this.alive = false;
  }
  dispose() {
    this.scene.remove(this.mesh, this.glow);
    this.mesh.geometry.dispose();
  }
}

// ---------- transient explosion ring ----------
class Explosion {
  constructor(scene, pos, color, size) {
    this.scene = scene;
    this.alive = true;
    this.t = 0; this.dur = 0.4; this.size = size;
    this.sprite = FX.glow(color, size * 0.6);
    this.sprite.position.copy(pos);
    this.sprite.position.y += 0.5;
    scene.add(this.sprite);
  }
  update(dt) {
    this.t += dt;
    const k = this.t / this.dur;
    if (k >= 1) { this.alive = false; return; }
    const s = this.size * (0.6 + k * 1.4);
    this.sprite.scale.set(s, s, 1);
    this.sprite.material.opacity = 1 - k;
  }
  dispose() { this.scene.remove(this.sprite); }
}

// ---------- transient chain-lightning arc ----------
class LightningArc {
  constructor(scene, points, color) {
    this.scene = scene;
    this.alive = true;
    this.t = 0; this.dur = 0.16;
    const verts = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const segs = 5;
      for (let s = 0; s < segs; s++) {
        const p = a.clone().lerp(b, s / segs);
        if (s > 0) { p.x += (Math.random() - 0.5) * 0.9; p.y += (Math.random() - 0.5) * 0.9; p.z += (Math.random() - 0.5) * 0.9; }
        verts.push(p.x, p.y, p.z);
      }
    }
    const last = points[points.length - 1];
    verts.push(last.x, last.y, last.z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(this.line);
  }
  update(dt) {
    this.t += dt;
    const k = this.t / this.dur;
    if (k >= 1) { this.alive = false; return; }
    this.line.material.opacity = (1 - k) * (0.6 + Math.random() * 0.4);
  }
  dispose() { this.scene.remove(this.line); this.line.geometry.dispose(); }
}

// ---------- debris burst: glowing shards flung out on destruction ----------
class Debris {
  constructor(scene, pos, color, count) {
    this.scene = scene;
    this.alive = true;
    this.t = 0; this.dur = 0.7 + Math.random() * 0.3;
    const n = count;
    const positions = new Float32Array(n * 3);
    this.vel = [];
    for (let i = 0; i < n; i++) {
      positions[i * 3] = pos.x; positions[i * 3 + 1] = pos.y + 1; positions[i * 3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2, e = Math.random() * 0.9 + 0.2;
      const sp = 6 + Math.random() * 12;
      this.vel.push(new THREE.Vector3(Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 4, Math.sin(a) * Math.cos(e) * sp));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geo = geo;
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      color, size: 0.55, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    scene.add(this.points);
  }
  update(dt) {
    this.t += dt;
    if (this.t >= this.dur) { this.alive = false; return; }
    const p = this.geo.attributes.position.array;
    for (let i = 0; i < this.vel.length; i++) {
      const v = this.vel[i];
      v.y -= 26 * dt;            // gravity
      v.multiplyScalar(0.96);    // drag
      p[i * 3] += v.x * dt; p[i * 3 + 1] += v.y * dt; p[i * 3 + 2] += v.z * dt;
      if (p[i * 3 + 1] < 0.1) { p[i * 3 + 1] = 0.1; v.y *= -0.35; v.x *= 0.6; v.z *= 0.6; }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.points.material.opacity = 1 - this.t / this.dur;
  }
  dispose() { this.scene.remove(this.points); this.geo.dispose(); }
}

// ---------- shockwave: expanding ground ring on big explosions ----------
class Shockwave {
  constructor(scene, pos, color, size) {
    this.scene = scene;
    this.alive = true;
    this.t = 0; this.dur = 0.5; this.size = size;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.9, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.set(pos.x, 0.12, pos.z);
    scene.add(this.ring);
  }
  update(dt) {
    this.t += dt;
    const k = this.t / this.dur;
    if (k >= 1) { this.alive = false; return; }
    const s = 0.5 + k * this.size;
    this.ring.scale.set(s, s, s);
    this.ring.material.opacity = 0.9 * (1 - k);
  }
  dispose() { this.scene.remove(this.ring); this.ring.geometry.dispose(); }
}
