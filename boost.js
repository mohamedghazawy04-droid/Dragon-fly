// تحسينات: صوت الفارس بالعربي + رفع الجرافيكس.
// بدون تعديل DragonEngine.ts: بنلفّ دوال المحرك من برّه.
import * as THREE from 'three';
import { DragonEngine } from './src/game/DragonEngine';
import { DragonAudio } from './src/game/audio';
import { DRAGON_SPECS } from './src/game/types';

const LINES = {
  jump: ['اقفز يا غزاوي، السماء كلها ملكنا!', 'أنا نازل، وغزاوي بيحمي ضهري.'],
  remount: ['يلا يا غزاوي، ارجع على ضهر التنين!', 'التنين مستنّي، وغزاوي ما بيتأخرش.'],
  launch: ['حلّق يا غزاوي، والنار معانا!', 'الجناحين اتفتحوا، وغزاوي قايدنا للنصر.'],
  board: ['هنقتحم التنين ده، وغزاوي شاهد على شجاعتنا!', 'اثبت يا غزاوي، السيف جاهز!'],
  slash: ['خد دي يا عدو، من سيف غزاوي!', 'ضربة قاضية باسم غزاوي!'],
  kill: ['سقط التنين، والفضل لغزاوي!', 'انتصرنا يا غزاوي، والسماء شاهدة.'],
  alarm: ['القلعة تحت الهجوم يا غزاوي، إلحق بينا!', 'الأعداء عند الأسوار، وغزاوي لازم يتحرك!'],
};
const COOLDOWN = { jump: 4000, remount: 4000, launch: 6000, board: 5000, slash: 9000, kill: 6000, alarm: 30000 };

let muted = false;
const lastAt = {};
const lastIdx = {};
let cachedVoice = null;

function getSynth() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null;
}

function say(key) {
  const synth = getSynth();
  if (!synth || muted) return;
  const now = performance.now();
  if (now - (lastAt[key] ?? -1e9) < COOLDOWN[key]) return;
  if (key === 'slash' && synth.speaking) return;
  lastAt[key] = now;
  const pool = LINES[key];
  let i = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && i === lastIdx[key]) i = (i + 1) % pool.length;
  lastIdx[key] = i;
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(pool[i]);
    u.lang = 'ar-EG';
    u.rate = 0.94;
    u.pitch = 0.65;
    if (!cachedVoice) {
      const vs = synth.getVoices();
      cachedVoice =
        vs.find((v) => /^ar[-_]EG/i.test(v.lang)) || vs.find((v) => /^ar/i.test(v.lang)) || null;
    }
    if (cachedVoice) u.voice = cachedVoice;
    synth.speak(u);
  } catch (e) {
    // نتجاهل أي رفض من المتصفح.
  }
}

const proto = DragonEngine.prototype;

function wrap(name, before, after) {
  const orig = proto[name];
  if (typeof orig !== 'function') return;
  proto[name] = function (...args) {
    let ctx;
    try { ctx = before ? before(this, args) : undefined; } catch (e) { /* ignore */ }
    const result = orig.apply(this, args);
    try { if (after) after(this, args, ctx); } catch (e) { /* ignore */ }
    return result;
  };
}

wrap('jumpOffDragon', (s) => s.phase, (s, a, prev) => {
  if (prev === 'flying' && s.phase === 'skydiving') say('jump');
});
wrap('remountDragon', (s) => s.phase, (s, a, prev) => {
  if (prev === 'on_foot' && s.phase !== 'on_foot') say('remount');
});
wrap('launchFlight', (s) => s.phase, (s, a, prev) => {
  if (prev !== 'flying' && s.phase === 'flying') say('launch');
});
wrap('tryBoardEnemy', (s) => s.phase, (s, a, prev) => {
  if (prev !== 'boarding' && s.phase === 'boarding') say('board');
});
wrap('performSwordSlash', (s) => s.boardingHits, (s, a, prev) => {
  if (typeof prev === 'number' && s.boardingHits > prev) say('slash');
});
wrap('killEnemyDragon', (s, a) => !!a[0] && a[0].alive === true && a[0].team === 'enemy', (s, a, was) => {
  if (was && a[0] && a[0].alive === false) say('kill');
});
wrap('setMuted', (s, a) => {
  muted = Boolean(a[0]);
  if (muted) { const sy = getSynth(); if (sy) sy.cancel(); }
});
wrap('dispose', () => { const sy = getSynth(); if (sy) sy.cancel(); });

// رفع الجرافيكس: بيتنفذ مرة وقت تجهيز المحرك (بعد ما الـ composer يتبني).
wrap('bindEvents', (s) => {
  if (s.isSoftwareGl) return;
  if (s.renderer) s.renderer.toneMappingExposure = 0.96;
  const sun = s.sunLight;
  if (sun && sun.shadow) {
    sun.shadow.mapSize.set(3072, 3072);
    sun.shadow.radius = 2.2;
    if (sun.shadow.map) sun.shadow.map.dispose();
    sun.shadow.map = null;
  }
  const b = s.bloomPass;
  if (b) { b.strength = 0.34; b.radius = 0.55; b.threshold = 0.88; }
  const passes = s.composer && s.composer.passes;
  const film = passes && passes[passes.length - 1];
  if (film && film.uniforms && film.uniforms.vignetteStrength) {
    film.uniforms.vignetteStrength.value = 0.3;
    film.uniforms.contrastBoost.value = 1.1;
  }
});


// ===== أصوات ومؤثرات إضافية =====
const AUD = DragonAudio.prototype;
const origBreath = AUD.playBreath;
// طبقة هدير نار عميقة فوق صوت النفَس الحالي
AUD.playBreath = function (element) {
  origBreath.call(this, element);
  try {
    if (element !== 'fire' || !this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    if (this.__rumbleAt && t - this.__rumbleAt < 0.3) return;
    this.__rumbleAt = t;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 240;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    src.connect(lp); lp.connect(g); g.connect(this.masterGain);
    src.start(t); src.stop(t + 0.5);
  } catch (e) { /* ignore */ }
};

function horn(a) {
  if (!a || !a.ctx || !a.masterGain || a.muted) return;
  const c = a.ctx, t0 = c.currentTime;
  for (let k = 0; k < 3; k++) {
    const t = t0 + k * 0.75;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(174, t);
    o.frequency.linearRampToValueAtTime(233, t + 0.55);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 950;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.24, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    o.connect(lp); lp.connect(g); g.connect(a.masterGain);
    o.start(t); o.stop(t + 0.7);
  }
}

const CASTLE = { x: -880, z: -60, r: 280 };

wrap('updateAiDragons', null, (s) => {
  const b = s.__b || (s.__b = { alarmAt: -1e9, roarAt: -1e9, hitAt: -1e9, stars: null });
  const now = performance.now();
  const falling = s.phase === 'skydiving' || s.phase === 'on_foot';
  const P = falling ? s.riderPos : s.playerPos;

  // نجوم قرب الفضاء: بتظهر تدريجيًا فوق ~500م
  if (!b.stars && s.scene) {
    const n = 1600, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      pos[i * 3] = 3600 * r * Math.cos(th);
      pos[i * 3 + 1] = 3600 * Math.abs(u) * 0.8 + 200;
      pos[i * 3 + 2] = 3600 * r * Math.sin(th);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    b.stars = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true,
      opacity: 0, depthWrite: false, fog: false,
    }));
    b.stars.frustumCulled = false;
    b.stars.renderOrder = -1;
    s.scene.add(b.stars);
  }
  if (b.stars) {
    b.stars.position.copy(s.camera.position);
    b.stars.material.opacity = THREE.MathUtils.clamp((P.y - 500) / 1400, 0, 1);
  }

  const ais = s.aiDragons || [];

  // إنذار القلعة لما تنين عدو يقرّب منها
  for (const ai of ais) {
    if (!ai.alive || ai.team !== 'enemy' || ai.state !== 'alive') continue;
    if (Math.hypot(ai.pos.x - CASTLE.x, ai.pos.z - CASTLE.z) < CASTLE.r && now - b.alarmAt > 30000) {
      b.alarmAt = now;
      horn(s.audio);
      setTimeout(() => say('alarm'), 2300);
    }
  }

  // تفاعل التنانين: زئير متبادل لما تقرّب من بعض
  if (now - b.roarAt > 8000 && !falling) {
    for (const ai of ais) {
      if (!ai.alive || ai.state !== 'alive' || !DRAGON_SPECS[ai.specId]) continue;
      if (ai.pos.distanceTo(P) < 140) {
        b.roarAt = now;
        s.audio.playRoar(DRAGON_SPECS[ai.specId].element);
        setTimeout(() => { try { s.audio.playRoar(s.activeElement); } catch (e) { /* ignore */ } }, 900);
        break;
      }
    }
  }

  // الفارس يقتل أعداء أثناء السقوط لو فيه فرصة
  if (s.phase === 'skydiving' && s.skydiveState === 'falling' && now - b.hitAt > 1500) {
    for (const ai of ais) {
      if (ai.alive && ai.team === 'enemy' && ai.state === 'alive' && ai.pos.distanceTo(s.riderPos) < 18) {
        b.hitAt = now;
        s.audio.playSwordHit();
        s.killEnemyDragon(ai, true);
        break;
      }
    }
  }
});

// كاميرا سقوط سينمائية: زاوية أوسع وميلان خفيف
wrap('updateSkydivingState', null, (s) => {
  if (s.skydiveState !== 'falling') return;
  s.camera.fov += (88 - s.camera.fov) * 0.08;
  s.camera.updateProjectionMatrix();
  s.camera.rotateZ(Math.sin(performance.now() * 0.0009) * 0.05);
});
