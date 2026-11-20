// صوت الفارس: نطق عربي عبر Web Speech API (بدون أي مكتبات خارجية).
// كلمة «غزاوي» (لقب المطوّر) مدخلة في وسط الجمل.

export type KnightLineKey =
  | 'jump'
  | 'remount'
  | 'launch'
  | 'board'
  | 'slash'
  | 'kill';

const LINES: Record<KnightLineKey, string[]> = {
  jump: [
    'اقفز يا غزاوي، السماء كلها ملكنا!',
    'أنا نازل، وغزاوي بيحمي ضهري.',
  ],
  remount: [
    'يلا يا غزاوي، ارجع على ضهر التنين!',
    'التنين مستنّي، وغزاوي ما بيتأخرش.',
  ],
  launch: [
    'حلّق يا غزاوي، والنار معانا!',
    'الجناحين اتفتحوا، وغزاوي قايدنا للنصر.',
  ],
  board: [
    'هنقتحم التنين ده، وغزاوي شاهد على شجاعتنا!',
    'اثبت يا غزاوي، السيف جاهز!',
  ],
  slash: [
    'خد دي يا عدو، من سيف غزاوي!',
    'ضربة قاضية باسم غزاوي!',
  ],
  kill: [
    'سقط التنين، والفضل لغزاوي!',
    'انتصرنا يا غزاوي، والسماء شاهدة.',
  ],
};

const COOLDOWN_MS: Record<KnightLineKey, number> = {
  jump: 4000,
  remount: 4000,
  launch: 6000,
  board: 5000,
  slash: 9000,
  kill: 6000,
};

export class KnightVoice {
  private muted = false;
  private lastAt: Partial<Record<KnightLineKey, number>> = {};
  private lastIdx: Partial<Record<KnightLineKey, number>> = {};
  private voice: SpeechSynthesisVoice | null = null;

  private get synth(): SpeechSynthesis | null {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
      ? window.speechSynthesis
      : null;
  }

  private pickVoice(): SpeechSynthesisVoice | null {
    const synth = this.synth;
    if (!synth) return null;
    if (this.voice) return this.voice;
    const voices = synth.getVoices();
    this.voice =
      voices.find((v) => /^ar[-_]EG/i.test(v.lang)) ??
      voices.find((v) => /^ar/i.test(v.lang)) ??
      null;
    return this.voice;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.synth?.cancel();
  }

  public say(key: KnightLineKey): void {
    const synth = this.synth;
    if (!synth || this.muted) return;
    const now = performance.now();
    if (now - (this.lastAt[key] ?? -1e9) < COOLDOWN_MS[key]) return;
    if (synth.speaking && key === 'slash') return;
    this.lastAt[key] = now;

    const pool = LINES[key];
    let idx = Math.floor(Math.random() * pool.length);
    if (pool.length > 1 && idx === this.lastIdx[key]) idx = (idx + 1) % pool.length;
    this.lastIdx[key] = idx;

    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(pool[idx]);
      u.lang = 'ar-EG';
      u.rate = 0.94;
      u.pitch = 0.65;
      u.volume = 1;
      const v = this.pickVoice();
      if (v) u.voice = v;
      synth.speak(u);
    } catch {
      // بعض المتصفحات بترفض النطق قبل أول تفاعل؛ نتجاهل الخطأ.
    }
  }

  public dispose(): void {
    this.synth?.cancel();
  }
}
