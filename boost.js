// تحسينات: صوت الفارس بالعربي + رفع الجرافيكس.
// بدون تعديل DragonEngine.ts: بنلفّ دوال المحرك من برّه.
import { DragonEngine } from './src/game/DragonEngine';

const LINES = {
  jump: ['اقفز يا غزاوي، السماء كلها ملكنا!', 'أنا نازل، وغزاوي بيحمي ضهري.'],
  remount: ['يلا يا غزاوي، ارجع على ضهر التنين!', 'التنين مستنّي، وغزاوي ما بيتأخرش.'],
  launch: ['حلّق يا غزاوي، والنار معانا!', 'الجناحين اتفتحوا، وغزاوي قايدنا للنصر.'],
  board: ['هنقتحم التنين ده، وغزاوي شاهد على شجاعتنا!', 'اثبت يا غزاوي، السيف جاهز!'],
  slash: ['خد دي يا عدو، من سيف غزاوي!', 'ضربة قاضية باسم غزاوي!'],
  kill: ['سقط التنين، والفضل لغزاوي!', 'انتصرنا يا غزاوي، والسماء شاهدة.'],
};
const COOLDOWN = { jump: 4000, remount: 4000, launch: 6000, board: 5000, slash: 9000, kill: 6000 };

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
