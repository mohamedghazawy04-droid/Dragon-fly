import { ElementType } from './types';

export type CrashMaterial = 'stone' | 'wood' | 'water' | 'flesh';

export class DragonAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private skimFilter: BiquadFilterNode | null = null;
  private skimGain: GainNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  private rainGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private crackleBuffer: AudioBuffer | null = null;
  private muted = false;
  private initialized = false;
  private lastBreathSound = 0;
  private lastImpactSound = 0;

  public init(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.48;
    this.masterGain.connect(this.ctx.destination);

    // 1. Rich multi-band pink/brown noise buffer for wind, wings, splashes, stone & rain
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.16;
    }
    this.noiseBuffer = noiseBuffer;

    // 2. High-transient debris/splinter crackle buffer for wood snaps, rock fractures & fire sparks
    const crackleBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const cData = crackleBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const r = Math.random();
      cData[i] = r > 0.975 ? (Math.random() * 2 - 1) * 0.95 : (Math.random() * 2 - 1) * 0.18;
    }
    this.crackleBuffer = crackleBuffer;

    // Wind rush loop
    const windSource = this.ctx.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;

    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 320;
    this.windFilter.Q.value = 0.85;

    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.02;

    windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    windSource.start();

    // Water-skim spray layer
    const skimSource = this.ctx.createBufferSource();
    skimSource.buffer = noiseBuffer;
    skimSource.loop = true;

    this.skimFilter = this.ctx.createBiquadFilter();
    this.skimFilter.type = 'highpass';
    this.skimFilter.frequency.value = 1150;

    this.skimGain = this.ctx.createGain();
    this.skimGain.gain.value = 0;

    skimSource.connect(this.skimFilter);
    this.skimFilter.connect(this.skimGain);
    this.skimGain.connect(this.masterGain);
    skimSource.start();

    // Dynamic Rain hiss layer
    const rainSource = this.ctx.createBufferSource();
    rainSource.buffer = noiseBuffer;
    rainSource.loop = true;

    this.rainFilter = this.ctx.createBiquadFilter();
    this.rainFilter.type = 'bandpass';
    this.rainFilter.frequency.value = 2100;
    this.rainFilter.Q.value = 0.65;

    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0;

    rainSource.connect(this.rainFilter);
    this.rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.masterGain);
    rainSource.start();

    this.initialized = true;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.48, this.ctx.currentTime, 0.08);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public updateAmbience(
    speed: number,
    isSkimming: boolean,
    isFlying: boolean,
    rainIntensity = 0,
    stormIntensity = 0,
  ): void {
    if (!this.ctx || !this.windGain || !this.windFilter || !this.skimGain || !this.rainGain) {
      return;
    }
    const now = this.ctx.currentTime;
    const normSpeed = Math.min(1.5, Math.max(0, speed / 75));
    const galeBoost = stormIntensity * 0.11;
    const targetWindGain = (isFlying ? 0.04 + normSpeed * 0.18 : 0.025) + galeBoost;
    const targetWindFreq = (isFlying ? 240 + normSpeed * 580 : 200) + stormIntensity * 180;

    this.windGain.gain.setTargetAtTime(targetWindGain, now, 0.12);
    this.windFilter.frequency.setTargetAtTime(targetWindFreq, now, 0.12);
    this.skimGain.gain.setTargetAtTime(isSkimming && isFlying ? 0.24 : 0, now, 0.08);
    this.rainGain.gain.setTargetAtTime(rainIntensity * 0.18, now, 0.25);
  }

  public playThunder(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;

    const rumbleSource = this.ctx.createBufferSource();
    rumbleSource.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1100, now);
    filter.frequency.exponentialRampToValueAtTime(85, now + 1.8);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.55, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.65);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.25);

    rumbleSource.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    rumbleSource.start(now);
    rumbleSource.stop(now + 2.3);

    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(64, now);
    sub.frequency.exponentialRampToValueAtTime(26, now + 1.45);
    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.3, now + 0.05);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.55);
    sub.connect(subGain);
    subGain.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + 1.6);
  }

  /**
   * Realistic material-specific physical impact sound (stone fracture, wood splintering,
   * hydrodynamic water plunge, or visceral dragon/rider ground impact).
   */
  public playCrash(materialOrHeavy: CrashMaterial | boolean = 'stone', heavyArg = false): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this.lastImpactSound < 0.07) return;
    this.lastImpactSound = now;

    const material: CrashMaterial =
      typeof materialOrHeavy === 'boolean' ? 'stone' : materialOrHeavy;
    const heavy = typeof materialOrHeavy === 'boolean' ? materialOrHeavy : heavyArg;

    if (material === 'water') {
      // 1. Deep hydrodynamic underwater plunge thump
      const plunge = this.ctx.createOscillator();
      const plungeGain = this.ctx.createGain();
      plunge.type = 'sine';
      plunge.frequency.setValueAtTime(heavy ? 115 : 145, now);
      plunge.frequency.exponentialRampToValueAtTime(32, now + (heavy ? 0.36 : 0.22));
      plungeGain.gain.setValueAtTime(heavy ? 0.34 : 0.22, now);
      plungeGain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.38 : 0.24));
      plunge.connect(plungeGain);
      plungeGain.connect(this.masterGain);
      plunge.start(now);
      plunge.stop(now + 0.4);

      // 2. Massive erupting whitewater splash burst
      const splash = this.ctx.createBufferSource();
      splash.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 0.6;
      bp.frequency.setValueAtTime(520, now);
      bp.frequency.exponentialRampToValueAtTime(2400, now + 0.14);
      bp.frequency.exponentialRampToValueAtTime(640, now + (heavy ? 1.15 : 0.65));

      const sGain = this.ctx.createGain();
      sGain.gain.setValueAtTime(0.001, now);
      sGain.gain.linearRampToValueAtTime(heavy ? 0.56 : 0.38, now + 0.04);
      sGain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 1.2 : 0.7));

      splash.connect(bp);
      bp.connect(sGain);
      sGain.connect(this.masterGain);
      splash.start(now);
      splash.stop(now + 1.25);
      return;
    }

    if (material === 'wood') {
      // 1. Hollow timber hull resonance
      const hull = this.ctx.createOscillator();
      const hullGain = this.ctx.createGain();
      hull.type = 'triangle';
      hull.frequency.setValueAtTime(heavy ? 112 : 148, now);
      hull.frequency.exponentialRampToValueAtTime(38, now + (heavy ? 0.35 : 0.2));
      hullGain.gain.setValueAtTime(heavy ? 0.32 : 0.2, now);
      hullGain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.38 : 0.22));
      hull.connect(hullGain);
      hullGain.connect(this.masterGain);
      hull.start(now);
      hull.stop(now + 0.4);

      // 2. Sharp wood splinter & plank snapping crackle
      const crack = this.ctx.createBufferSource();
      crack.buffer = this.crackleBuffer ?? this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.6;
      bp.frequency.setValueAtTime(1350, now);
      bp.frequency.exponentialRampToValueAtTime(420, now + (heavy ? 0.62 : 0.34));

      const cGain = this.ctx.createGain();
      cGain.gain.setValueAtTime(0.001, now);
      cGain.gain.linearRampToValueAtTime(heavy ? 0.52 : 0.36, now + 0.015);
      cGain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.66 : 0.38));

      crack.connect(bp);
      bp.connect(cGain);
      cGain.connect(this.masterGain);
      crack.start(now);
      crack.stop(now + 0.7);
      return;
    }

    if (material === 'flesh') {
      // Heavy body & armored ground slam + dirt slide
      const bodyThump = this.ctx.createOscillator();
      const bodyGain = this.ctx.createGain();
      bodyThump.type = 'sine';
      bodyThump.frequency.setValueAtTime(heavy ? 76 : 96, now);
      bodyThump.frequency.exponentialRampToValueAtTime(22, now + (heavy ? 0.48 : 0.25));
      bodyGain.gain.setValueAtTime(heavy ? 0.48 : 0.28, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.52 : 0.28));
      bodyThump.connect(bodyGain);
      bodyGain.connect(this.masterGain);
      bodyThump.start(now);
      bodyThump.stop(now + 0.55);

      const skid = this.ctx.createBufferSource();
      skid.buffer = this.noiseBuffer;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(heavy ? 520 : 420, now);
      lp.frequency.exponentialRampToValueAtTime(85, now + (heavy ? 0.72 : 0.32));

      const sGain = this.ctx.createGain();
      sGain.gain.setValueAtTime(0.001, now);
      sGain.gain.linearRampToValueAtTime(heavy ? 0.44 : 0.26, now + 0.02);
      sGain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.76 : 0.36));

      skid.connect(lp);
      lp.connect(sGain);
      sGain.connect(this.masterGain);
      skid.start(now);
      skid.stop(now + 0.8);
      return;
    }

    // 'stone': Heavy masonry / rock fracture + cascading gravel rubble
    const quake = this.ctx.createOscillator();
    const quakeGain = this.ctx.createGain();
    quake.type = 'sine';
    quake.frequency.setValueAtTime(heavy ? 82 : 115, now);
    quake.frequency.exponentialRampToValueAtTime(24, now + (heavy ? 0.5 : 0.25));
    quakeGain.gain.setValueAtTime(heavy ? 0.42 : 0.25, now);
    quakeGain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.54 : 0.28));
    quake.connect(quakeGain);
    quakeGain.connect(this.masterGain);
    quake.start(now);
    quake.stop(now + 0.56);

    const rubble = this.ctx.createBufferSource();
    rubble.buffer = this.crackleBuffer ?? this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(heavy ? 1450 : 1250, now);
    lp.frequency.exponentialRampToValueAtTime(110, now + (heavy ? 0.95 : 0.42));

    const rGain = this.ctx.createGain();
    rGain.gain.setValueAtTime(0.001, now);
    rGain.gain.linearRampToValueAtTime(heavy ? 0.54 : 0.34, now + 0.018);
    rGain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 1.0 : 0.46));

    rubble.connect(lp);
    lp.connect(rGain);
    rGain.connect(this.masterGain);
    rubble.start(now);
    rubble.stop(now + 1.05);
  }

  /**
   * Realistic Doppler aerodynamic falling wind-rush for defeated dragons/riders plummeting from sky.
   */
  public playFallWhoosh(duration = 1.65): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;

    const rush = this.ctx.createBufferSource();
    rush.buffer = this.noiseBuffer;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.8;
    bp.frequency.setValueAtTime(880, now);
    bp.frequency.exponentialRampToValueAtTime(195, now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.26, now + 0.16);
    gain.gain.linearRampToValueAtTime(0.32, now + duration * 0.85);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    rush.connect(bp);
    bp.connect(gain);
    gain.connect(this.masterGain);
    rush.start(now);
    rush.stop(now + duration + 0.05);

    // Subtle high-altitude whistling air pitch drop
    const whistle = this.ctx.createOscillator();
    const wGain = this.ctx.createGain();
    whistle.type = 'sine';
    whistle.frequency.setValueAtTime(520, now);
    whistle.frequency.exponentialRampToValueAtTime(165, now + duration);
    wGain.gain.setValueAtTime(0.001, now);
    wGain.gain.linearRampToValueAtTime(0.032, now + 0.25);
    wGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    whistle.connect(wGain);
    wGain.connect(this.masterGain);
    whistle.start(now);
    whistle.stop(now + duration + 0.05);
  }

  /**
   * Realistic massive leathery wing downstroke displacing air.
   */
  public playWingbeat(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;

    // Air swoosh through low-passed pink noise
    const air = this.ctx.createBufferSource();
    air.buffer = this.noiseBuffer;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(480, now);
    lp.frequency.exponentialRampToValueAtTime(75, now + 0.28);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.34, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

    air.connect(lp);
    lp.connect(gain);
    gain.connect(this.masterGain);
    air.start(now);
    air.stop(now + 0.36);

    // Subtle deep air-pressure displacement
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(64, now);
    sub.frequency.exponentialRampToValueAtTime(28, now + 0.22);
    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.09, now + 0.03);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    sub.connect(subGain);
    subGain.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + 0.27);
  }

  public playCloudSlice(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const mist = this.ctx.createBufferSource();
    mist.buffer = this.noiseBuffer;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(760, now);
    bp.frequency.exponentialRampToValueAtTime(340, now + 0.45);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
    mist.connect(bp);
    bp.connect(gain);
    gain.connect(this.masterGain);
    mist.start(now);
    mist.stop(now + 0.5);
  }

  /**
   * Realistic acoustic elemental breath: roaring combustion fire, howling arctic blizzard wind,
   * or explosive rock barrage launch.
   */
  public playBreath(element: ElementType): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this.lastBreathSound < 0.13) return;
    this.lastBreathSound = now;

    if (element === 'fire') {
      // Turbulent roaring jet combustion
      const jet = this.ctx.createBufferSource();
      jet.buffer = this.crackleBuffer ?? this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 0.75;
      bp.frequency.setValueAtTime(860, now);
      bp.frequency.exponentialRampToValueAtTime(260, now + 0.24);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.28, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.27);

      jet.connect(bp);
      bp.connect(gain);
      gain.connect(this.masterGain);
      jet.start(now);
      jet.stop(now + 0.29);

      // Deep dragon throat flame rumble
      const throat = this.ctx.createOscillator();
      const tFilter = this.ctx.createBiquadFilter();
      const tGain = this.ctx.createGain();
      throat.type = 'sawtooth';
      throat.frequency.setValueAtTime(92, now);
      throat.frequency.exponentialRampToValueAtTime(54, now + 0.22);
      tFilter.type = 'lowpass';
      tFilter.frequency.value = 240;
      tGain.gain.setValueAtTime(0.11, now);
      tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      throat.connect(tFilter);
      tFilter.connect(tGain);
      tGain.connect(this.masterGain);
      throat.start(now);
      throat.stop(now + 0.26);
    } else if (element === 'ice') {
      // High-velocity howling freezing wind + crystal frost hiss
      const gale = this.ctx.createBufferSource();
      gale.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 2.2;
      bp.frequency.setValueAtTime(1450, now);
      bp.frequency.exponentialRampToValueAtTime(2850, now + 0.12);
      bp.frequency.exponentialRampToValueAtTime(1600, now + 0.26);

      const gGain = this.ctx.createGain();
      gGain.gain.setValueAtTime(0.001, now);
      gGain.gain.linearRampToValueAtTime(0.24, now + 0.04);
      gGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      gale.connect(bp);
      bp.connect(gGain);
      gGain.connect(this.masterGain);
      gale.start(now);
      gale.stop(now + 0.3);
    } else {
      // Heavy rock volley launch: deep chest heave + crumbling boulder scatter
      const heave = this.ctx.createOscillator();
      const hGain = this.ctx.createGain();
      heave.type = 'sine';
      heave.frequency.setValueAtTime(115, now);
      heave.frequency.exponentialRampToValueAtTime(34, now + 0.28);
      hGain.gain.setValueAtTime(0.32, now);
      hGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      heave.connect(hGain);
      hGain.connect(this.masterGain);
      heave.start(now);
      heave.stop(now + 0.32);

      const gravel = this.ctx.createBufferSource();
      gravel.buffer = this.crackleBuffer ?? this.noiseBuffer;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(980, now);
      lp.frequency.exponentialRampToValueAtTime(180, now + 0.34);
      const rGain = this.ctx.createGain();
      rGain.gain.setValueAtTime(0.32, now);
      rGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      gravel.connect(lp);
      lp.connect(rGain);
      rGain.connect(this.masterGain);
      gravel.start(now);
      gravel.stop(now + 0.38);
    }
  }

  /**
   * Realistic biological dragon roar with laryngeal formants + raspy breathy snarl.
   */
  public playRoar(element: ElementType): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const base = element === 'ice' ? 145 : element === 'rock' ? 78 : 108;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const formant = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc1.frequency.setValueAtTime(base * 1.15, now);
    osc1.frequency.exponentialRampToValueAtTime(base * 0.58, now + 0.85);
    osc2.frequency.setValueAtTime(base * 1.18, now);
    osc2.frequency.exponentialRampToValueAtTime(base * 0.61, now + 0.85);

    formant.type = 'bandpass';
    formant.Q.value = 2.1;
    formant.frequency.setValueAtTime(640, now);
    formant.frequency.exponentialRampToValueAtTime(220, now + 0.85);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

    osc1.connect(formant);
    osc2.connect(formant);
    formant.connect(gain);
    gain.connect(this.masterGain);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.92);
    osc2.stop(now + 0.92);

    // Breathy reptilian hiss layered on top
    const snarl = this.ctx.createBufferSource();
    snarl.buffer = this.noiseBuffer;
    const sFilter = this.ctx.createBiquadFilter();
    sFilter.type = 'bandpass';
    sFilter.Q.value = 1.4;
    sFilter.frequency.setValueAtTime(920, now);
    sFilter.frequency.exponentialRampToValueAtTime(340, now + 0.82);

    const sGain = this.ctx.createGain();
    sGain.gain.setValueAtTime(0.001, now);
    sGain.gain.linearRampToValueAtTime(0.24, now + 0.07);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

    snarl.connect(sFilter);
    sFilter.connect(sGain);
    sGain.connect(this.masterGain);
    snarl.start(now);
    snarl.stop(now + 0.88);
  }

  public playSwordSlash(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const swoosh = this.ctx.createBufferSource();
    swoosh.buffer = this.noiseBuffer;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.8;
    bp.frequency.setValueAtTime(2400, now);
    bp.frequency.exponentialRampToValueAtTime(580, now + 0.14);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    swoosh.connect(bp);
    bp.connect(gain);
    gain.connect(this.masterGain);
    swoosh.start(now);
    swoosh.stop(now + 0.18);
  }

  public playSwordHit(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const freqs = [1180, 1790, 2640, 3810];
    freqs.forEach((f, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.94, now + 0.28);
      gain.gain.setValueAtTime(0.11 / (idx + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.32);
    });
  }

  public playBondChime(progressRatio: number): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const baseFreq = 293.66 + progressRatio * 293.66;
    [baseFreq, baseFreq * 1.25, baseFreq * 1.5].forEach((f, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + i * 0.05);
      gain.gain.setValueAtTime(0.001, now + i * 0.05);
      gain.gain.linearRampToValueAtTime(0.11, now + i * 0.05 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.45);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 0.48);
    });
  }

  public playHealTick(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(528, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.25);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.initialized = false;
  }
}
