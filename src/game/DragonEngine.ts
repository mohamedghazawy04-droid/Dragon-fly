import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { DragonAudio } from './audio';
import {
  ArticulatedRiderRig,
  createArticulatedRiderRig,
  createDragonRig,
  createFallingRiderMesh,
  DragonRig,
} from './dragonMesh';
import {
  createImpactScarTexture,
  createRealisticSmokeTexture,
  createShockwaveRingTexture,
  createSoftParticleTexture,
} from './textures';
import {
  ANCIENT_LORE_TALES,
  CameraView,
  DEFAULT_PROGRESSION,
  DRAGON_SPECS,
  DragonId,
  DragonUpgradeKey,
  ElementType,
  EnemyIndicator,
  GameMode,
  GamePhase,
  HudState,
  KnightUpgradeKey,
  ManeuverKind,
  ProgressionState,
  UPGRADE_MAX_LEVEL,
  WarStatus,
  WarTargetType,
  WeatherMode,
  WeatherState,
  WORLD_LANDMARKS,
} from './types';
import {
  buildDragonWorld,
  DestructibleBuilding,
  DestructibleTree,
  getTerrainHeight,
  PirateShipActor,
  WorldBuildResult,
} from './worldBuilder';

// Pre-allocated scratch math objects (zero GC inside animation loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _camTargetPos = new THREE.Vector3();
const _camLookAt = new THREE.Vector3();
const _projVec = new THREE.Vector3();
const _rayToEnemy = new THREE.Vector3();
const _closestPt = new THREE.Vector3();
const _unitX = new THREE.Vector3(1, 0, 0);
const _unitY = new THREE.Vector3(0, 1, 0);
const _unitZ = new THREE.Vector3(0, 0, 1);
const _quatA = new THREE.Quaternion();
const _qPitch = new THREE.Quaternion();
const _qYaw = new THREE.Quaternion();
const _qRoll = new THREE.Quaternion();
const _finalQuat = new THREE.Quaternion();
const _eulerA = new THREE.Euler(0, 0, 0, 'YXZ');

// Pre-allocated scratch colors for zero-GC weather interpolation (Unreal Engine 5 filmic contrast)
const _fogColorClear = new THREE.Color(0xc99c6e);
const _fogColorRain = new THREE.Color(0x455669);
const _fogColorStorm = new THREE.Color(0x19232e);
const _fogColorVolcanic = new THREE.Color(0x281915);
const _fogColorFlash = new THREE.Color(0x7ca7cc);
const _sunColorClear = new THREE.Color(0xffcfa0);
const _sunColorStorm = new THREE.Color(0x3a4f66);
const _hemiSkyClear = new THREE.Color(0x6ca2d9);
const _hemiSkyStorm = new THREE.Color(0x28374a);
const _hemiGndClear = new THREE.Color(0x1d241b);
const _hemiGndStorm = new THREE.Color(0x10161a);
const _shipCharColor = new THREE.Color(0x160f0b);
const _lightningDir = new THREE.Vector3();

interface Projectile {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  rotVel?: THREE.Vector3;
  element: ElementType;
  ownerTeam: 'ally' | 'enemy';
  life: number;
  damage: number;
  radius: number;
}

interface ParticleItem {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  gravity: number;
}

const MAX_SMOKE = 560;
const _smokeColorTmp = new THREE.Color();

const MAX_ELEM_PARTICLES = 900;
const _elemColorA = new THREE.Color();
const _elemColorB = new THREE.Color();
const _burstNorm = new THREE.Vector3();
const _burstTanA = new THREE.Vector3();
const _burstTanB = new THREE.Vector3();
const _burstDir = new THREE.Vector3();

const MAX_WATER_WAKES = 160;

interface WaterWakeDecal {
  active: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  angle: number;
  angVel: number;
  kind: number; // 0 = expanding concentric wave ring, 1 = swirling spiral water vortex, 2 = frothy wake streak
  spin: number; // +1 or -1 vortex direction
}

interface ElemParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r0: number;
  g0: number;
  b0: number;
  r1: number;
  g1: number;
  b1: number;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  gravity: number;
  drag: number;
  angle: number;
  angVel: number;
  kind: number;
}

interface SmokePuff {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  g: number;
  b: number;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  buoyancy: number;
  fireGlow: number;
  windMul: number;
  angle: number;
  angVel: number;
  seed: number;
}

type DebrisKind =
  | 'stone'
  | 'palace'
  | 'wood'
  | 'char_wood'
  | 'ember'
  | 'leaf'
  | 'ice';

interface DebrisPiece {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  life: number;
  maxLife: number;
  baseScale: number;
  kind: DebrisKind;
  bounced: boolean;
  floating: boolean;
  burning: boolean;
}

interface SurfaceScar {
  mesh: THREE.Mesh;
  parent: THREE.Object3D;
  life: number;
  maxLife: number;
  baseOpacity: number;
}

interface VfxSpark {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface VfxShockRing {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
}

const PROGRESS_STORAGE_KEY = 'dragon_knight_progress_v1';

function loadSavedProgression(): ProgressionState {
  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_PROGRESSION,
        knightUpgrades: { ...DEFAULT_PROGRESSION.knightUpgrades },
        dragonUpgrades: { ...DEFAULT_PROGRESSION.dragonUpgrades },
      };
    }
    const parsed = JSON.parse(raw) as Partial<ProgressionState>;
    const clampLvl = (val: unknown) =>
      typeof val === 'number' && Number.isFinite(val)
        ? Math.max(0, Math.min(UPGRADE_MAX_LEVEL, Math.floor(val)))
        : 0;
    const clampInt = (val: unknown, fallback: number, minVal = 0) =>
      typeof val === 'number' && Number.isFinite(val)
        ? Math.max(minVal, Math.floor(val))
        : fallback;

    return {
      knightPoints: clampInt(parsed.knightPoints, DEFAULT_PROGRESSION.knightPoints),
      dragonPoints: clampInt(parsed.dragonPoints, DEFAULT_PROGRESSION.dragonPoints),
      warsWon: clampInt(parsed.warsWon, 0),
      warWave: clampInt(parsed.warWave, 1, 1),
      knightUpgrades: {
        sword: clampLvl(parsed.knightUpgrades?.sword),
        armor: clampLvl(parsed.knightUpgrades?.armor),
        spirit: clampLvl(parsed.knightUpgrades?.spirit),
      },
      dragonUpgrades: {
        breath: clampLvl(parsed.dragonUpgrades?.breath),
        scales: clampLvl(parsed.dragonUpgrades?.scales),
        wings: clampLvl(parsed.dragonUpgrades?.wings),
      },
      loreElapsedSeconds: clampInt(parsed.loreElapsedSeconds, 0),
      savedAt:
        typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt)
          ? parsed.savedAt
          : null,
    };
  } catch {
    return {
      ...DEFAULT_PROGRESSION,
      knightUpgrades: { ...DEFAULT_PROGRESSION.knightUpgrades },
      dragonUpgrades: { ...DEFAULT_PROGRESSION.dragonUpgrades },
    };
  }
}

const UE5FilmicPostShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignetteStrength: { value: 0.24 },
    contrastBoost: { value: 1.07 },
    motionBlur: { value: 0.0 },
    boostFactor: { value: 0.0 },
    steerSmear: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float vignetteStrength;
    uniform float contrastBoost;
    uniform float motionBlur;
    uniform float boostFactor;
    uniform float steerSmear;
    varying vec2 vUv;
    void main() {
      vec2 center = vUv - 0.5;
      float rad = length(center);
      vec4 centerTex = texture2D(tDiffuse, vUv);
      vec3 col = centerTex.rgb;

      if (motionBlur > 0.004) {
        // Keep central focal zone razor-sharp around dragon & reticle while edges streak with speed
        float edgeMask = smoothstep(0.11, 0.56, rad);
        float blurAmt = motionBlur * edgeMask * (0.022 + 0.018 * boostFactor);
        vec2 radialDir = rad > 0.0001 ? (center / rad) : vec2(0.0);
        vec2 tangDir = vec2(-radialDir.y, radialDir.x) * (steerSmear * 0.34);
        vec2 stepVec = (radialDir * (0.45 + rad * 1.15) + tangDir) * blurAmt;

        vec3 acc = vec3(0.0);
        float totalW = 0.0;
        for (int i = 0; i < 10; i++) {
          float fi = float(i) / 9.0;
          float w = 1.0 - fi * 0.52;
          vec2 sampleUv = clamp(vUv - stepVec * fi, vec2(0.001), vec2(0.999));
          acc += texture2D(tDiffuse, sampleUv).rgb * w;
          totalW += w;
        }
        col = acc / totalW;

        // Subtle peripheral chromatic velocity fringe during boost & Mach dives
        float chroma = edgeMask * motionBlur * (0.0014 + 0.0024 * boostFactor);
        if (chroma > 0.0002) {
          float rCh = texture2D(tDiffuse, clamp(vUv - stepVec * 0.45 - radialDir * chroma, vec2(0.001), vec2(0.999))).r;
          float bCh = texture2D(tDiffuse, clamp(vUv - stepVec * 0.15 + radialDir * chroma, vec2(0.001), vec2(0.999))).b;
          col.r = mix(col.r, rCh, 0.48);
          col.b = mix(col.b, bCh, 0.48);
        }
      }

      col = clamp((col - 0.5) * contrastBoost + 0.5, 0.0, 1.0);
      float dist = dot(center, center);
      float vig = 1.0 - smoothstep(0.18, 0.78, dist) * vignetteStrength;
      col *= vig;
      gl_FragColor = vec4(col, centerTex.a);
    }
  `,
};

interface AiDragon {
  id: string;
  nameAr: string;
  team: 'ally' | 'enemy';
  specId: DragonId;
  rig: DragonRig;
  pos: THREE.Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  hp: number;
  maxHp: number;
  slowTimer: number;
  frozenTimer: number;
  burnTimer: number;
  fireCooldown: number;
  patrolSeed: number;
  alive: boolean;
  respawnTimer: number;
  state: 'alive' | 'falling' | 'dead_ground' | 'respawning';
  fallVel: THREE.Vector3;
  fallAngVel: THREE.Vector3;
  deadGroundTimer: number;
  fallingRider: THREE.Group | null;
  riderFallPos: THREE.Vector3;
  riderFallVel: THREE.Vector3;
  riderGrounded: boolean;
  roostState: 'flying' | 'approaching_roost' | 'hanging';
  roostIndex: number;
  roostTimer: number;
  clashTimer: number;
}

export class DragonEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private fxaaPass: FXAAPass | null = null;
  private filmicPass: ShaderPass | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private maxAnisotropy: number;
  private clock = new THREE.Clock();
  private frameId = 0;
  private frameCount = 0;
  private disposed = false;

  private audio = new DragonAudio();
  private world: WorldBuildResult;
  private particleTex: THREE.CanvasTexture;

  private playerRig: DragonRig;
  private playerPos = new THREE.Vector3(-280, 72, 230);
  private velocity = new THREE.Vector3(0, 0, -58);
  private playerYaw = -0.75;
  private playerRoll = 0;
  private flightQuat = new THREE.Quaternion();
  private cameraView: CameraView = 'full';
  private halfLoopRemaining = 0;
  private playerSpeed = 58;
  private wingPhase = 0;
  private lastWingSign = 1;
  private jawOpenAmount = 0;
  private roarTimer = 0;
  private healBurstTimer = 0;
  private smoothedHandX = 0;
  private smoothedHandY = 0;
  private impactShake = 0;
  private collisionCooldown = 0;
  private playerCrashing = false;
  private playerCrashTimer = 0;
  private knifeEdgeSide: -1 | 0 | 1 = 0;
  private prevTurnInput = 0;
  private maneuverKind: ManeuverKind = 'none';
  private maneuverSide: -1 | 0 | 1 = 0;
  private maneuverIntensity = 0;
  private maneuverFlashTimer = 0;
  private landingRequested = false;
  private diveTuckFactor = 0;
  private landingLegExtend = 0;
  private talonClashTimer = 0;
  private talonClashCooldown = 0;
  private movementRoarTimer = 3.2;
  private wasBoosting = false;

  // Skydiving & On-Foot Knight Exploration state
  private activeRiderRig!: ArticulatedRiderRig;
  private riderPos = new THREE.Vector3();
  private riderVel = new THREE.Vector3();
  private riderYaw = 0;
  private riderCamPitch = -0.14;
  private riderWalkCycle = 0;
  private riderGrounded = false;
  private skydiveState: 'falling' | 'in_water' | 'rescuing' = 'falling';
  private skydiveWaterTimer = 0;
  private companionOrbitAngle = 0;
  private landedDragonPos = new THREE.Vector3();
  private landedDragonYaw = 0;
  private landedAnchorPos = new THREE.Vector3();
  private landedMoveTarget = new THREE.Vector3();
  private landedWalkPhase = 0;
  private landedWalkBlend = 0;
  private landedWalkTimer = 2.4;
  private landedPauseTimer = 0;
  private landedIsWalking = true;
  private landedHeadYaw = 0;
  private landedHeadPitch = 0;
  private landedGroundPitch = 0;
  private landedGroundRoll = 0;
  private landedTurnRate = 0;

  private phase: GamePhase = 'sanctuary_bond';
  private mode: GameMode = 'combat';
  private dragonId: DragonId = 'ignis';
  private activeElement: ElementType = 'fire';
  private hp = 120;
  private maxHp = 120;
  private energy = 100;
  private maxEnergy = 100;
  private bondLevel = 35;
  private woundsCount = 0;
  private allyScore = 0;
  private enemyScore = 0;

  // Timed War & Upgrade Progression state
  private warType: WarTargetType = 'both';
  private warDuration = 120;
  private warTimeLeft = 120;
  private warStatus: WarStatus = 'idle';
  private warDragonsKilled = 0;
  private warDragonsGoal = 3;
  private warShipsSunk = 0;
  private warShipsGoal = 3;
  private progression: ProgressionState = loadSavedProgression();
  private dangerHornCooldown = 0;
  private dangerAlertTimer = 0;
  private shipFireCooldown = 2.5;
  private activeLoreTaleId: string | null = null;
  private activeLoreSegment = 0;
  private isLorePlaying = false;
  private loreAutosaveTimer = 0;

  // Boarding & Sword combat state
  private boardingTarget: AiDragon | null = null;
  private boardingProgress = 0;
  private boardingHits = 0;
  private readonly boardingHitsRequired = 3;
  private swordSwingTimer = 0;
  private boardingExitTimer = 0;

  // Input state
  private keys: Record<string, boolean> = {};
  private pointerLocked = false;
  private mouseSteerX = 0;
  private mouseSteerY = 0;
  private manualSteerX = 0;
  private manualSteerY = 0;
  private isFiring = false;
  private isBoosting = false;
  private fireCooldown = 0;
  private isDraggingMouse = false;
  private lastTouchX = 0;
  private lastTouchY = 0;

  // Dynamic entities & Advanced VFX Pools
  private aiDragons: AiDragon[] = [];
  private projectiles: Projectile[] = [];
  private particles: ParticleItem[] = [];
  private debris: DebrisPiece[] = [];
  private surfaceScars: SurfaceScar[] = [];
  private vfxSparks: VfxSpark[] = [];
  private vfxShockRings: VfxShockRing[] = [];
  private scarTex!: THREE.CanvasTexture;
  private shockRingTex!: THREE.CanvasTexture;
  private scarGeo = new THREE.PlaneGeometry(1, 1);
  private sparkGeo = new THREE.BoxGeometry(0.14, 0.14, 0.95);
  private shockRingGeo = new THREE.PlaneGeometry(1, 1);
  private trailSpawnTimer = 0;
  private hudEmitTimer = 0;
  private toastMessage: string | null = null;
  private toastTimer = 0;
  private knightSpeechText: string | null = null;
  private knightSpeechTimer = 0;
  private sanctuaryOrbitAngle = 0.6;
  private motionBlurIntensity = 0;
  private boostVisualFactor = 0;
  private speedStreakLines!: THREE.LineSegments;
  private speedStreakMat!: THREE.LineBasicMaterial;
  private speedStreakSeeds!: Float32Array;
  private readonly speedStreakCount = 72;

  // Single-draw-call Instanced Volumetric Smoke System
  private smokePool: SmokePuff[] = [];
  private smokeCursor = 0;
  private smokeTex!: THREE.DataTexture;
  private smokeGeo!: THREE.InstancedBufferGeometry;
  private smokeMat!: THREE.ShaderMaterial;
  private smokeMesh!: THREE.Mesh;
  private smokePosScaleArr = new Float32Array(MAX_SMOKE * 4);
  private smokeTintArr = new Float32Array(MAX_SMOKE * 3);
  private smokeParamsArr = new Float32Array(MAX_SMOKE * 4);
  private smokePosScaleAttr!: THREE.InstancedBufferAttribute;
  private smokeTintAttr!: THREE.InstancedBufferAttribute;
  private smokeParamsAttr!: THREE.InstancedBufferAttribute;
  private volcanoPlumeTimer = 0;

  // Single-draw-call GPU-Instanced Advanced Elemental Impact Particle System
  private elemPool: ElemParticle[] = [];
  private elemCursor = 0;
  private elemGeo!: THREE.InstancedBufferGeometry;
  private elemMat!: THREE.ShaderMaterial;
  private elemMesh!: THREE.Mesh;
  private elemPosScaleArr = new Float32Array(MAX_ELEM_PARTICLES * 4);
  private elemCol0Arr = new Float32Array(MAX_ELEM_PARTICLES * 3);
  private elemCol1Arr = new Float32Array(MAX_ELEM_PARTICLES * 3);
  private elemParamsArr = new Float32Array(MAX_ELEM_PARTICLES * 4);
  private elemPosScaleAttr!: THREE.InstancedBufferAttribute;
  private elemCol0Attr!: THREE.InstancedBufferAttribute;
  private elemCol1Attr!: THREE.InstancedBufferAttribute;
  private elemParamsAttr!: THREE.InstancedBufferAttribute;
  private breathImpactVfxTimer = 0;

  // Single-draw-call GPU-Instanced Water Vortices, Expanding Waves & Wake Trail System
  private waterWakePool: WaterWakeDecal[] = [];
  private waterWakeCursor = 0;
  private waterWakeGeo!: THREE.InstancedBufferGeometry;
  private waterWakeMat!: THREE.ShaderMaterial;
  private waterWakeMesh!: THREE.Mesh;
  private waterWakePosScaleArr = new Float32Array(MAX_WATER_WAKES * 4);
  private waterWakeParamsArr = new Float32Array(MAX_WATER_WAKES * 4);
  private waterWakePosScaleAttr!: THREE.InstancedBufferAttribute;
  private waterWakeParamsAttr!: THREE.InstancedBufferAttribute;
  private oceanWakeIntensity = 0;
  private oceanWakePosXZ = new THREE.Vector2();
  private oceanWakeDirXZ = new THREE.Vector2(0, -1);
  private wakeTrailCursor = 0;
  private wakeTrailDropTimer = 0;
  private wakeVortexSpawnTimer = 0;

  // Dynamic Weather, Cinematic Rim/Bounce & Breath Lighting Rig
  private hemiLight: THREE.HemisphereLight;
  private sunLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private oceanBounceLight: THREE.DirectionalLight;
  private dragonBreathLight: THREE.PointLight;
  private vfxFlashLight: THREE.PointLight;
  private vfxFlashPower = 0;
  private breathLightPower = 0;
  private breathLightColor = new THREE.Color(0xff6d1a);
  private lightningDirLight: THREE.DirectionalLight;
  private lightningDragonLight: THREE.PointLight;
  private lightningDragonRimLight: THREE.PointLight;
  private weatherMode: WeatherMode = 'auto';
  private currentWeather: WeatherState = 'clear';
  private weatherCycleTimer = 0;
  private rainIntensity = 0;
  private stormIntensity = 0;
  private lightningPower = 0;
  private nextLightningTimer = 3.2;
  private volcanicZoneFactor = 0;
  private volcanicLightningPower = 0;
  private nextVolcanicLightningTimer = 1.4;
  private lightningOrigin = new THREE.Vector3(120, 220, -180);
  private lastReflectionStormBand = 0;

  private rainLines!: THREE.LineSegments;
  private rainMat!: THREE.LineBasicMaterial;
  private rainBaseOffsets!: Float32Array;
  private readonly rainCount = 680;
  private lightningBolt!: THREE.Line;
  private lightningMat!: THREE.LineBasicMaterial;
  private readonly lightningSegments = 14;

  // Shared projectile & physical debris geometries/materials
  private fireGeo = new THREE.SphereGeometry(1.1, 10, 10);
  private fireMat = new THREE.MeshBasicMaterial({ color: 0xff7b1a });
  private iceGeo = new THREE.OctahedronGeometry(1.15, 0);
  private iceMat = new THREE.MeshStandardMaterial({
    color: 0x7dd3fc,
    emissive: 0x0ea5e9,
    emissiveIntensity: 2.0,
    roughness: 0.12,
  });
  private rockGeo = new THREE.DodecahedronGeometry(1.75, 0);
  private rockMat = new THREE.MeshStandardMaterial({
    color: 0x57483b,
    emissive: 0xc2590a,
    emissiveIntensity: 0.75,
    roughness: 0.9,
  });
  private stoneShardGeo = new THREE.DodecahedronGeometry(1.15, 0);
  private masonryBlockGeo = new THREE.BoxGeometry(1.85, 0.95, 1.35);
  private woodPlankGeo = new THREE.BoxGeometry(0.46, 0.22, 3.35);
  private emberChunkGeo = new THREE.DodecahedronGeometry(0.65, 0);
  private palmFrondGeo = new THREE.BoxGeometry(0.75, 0.08, 2.35);
  private iceShardGeo = new THREE.OctahedronGeometry(0.95, 0);

  private stoneDebrisMat = new THREE.MeshStandardMaterial({
    color: 0x4b443e,
    roughness: 0.92,
  });
  private palaceDebrisMat = new THREE.MeshStandardMaterial({
    color: 0xa69372,
    roughness: 0.68,
  });
  private woodDebrisMat = new THREE.MeshStandardMaterial({
    color: 0x5c3c24,
    roughness: 0.86,
  });
  private charWoodDebrisMat = new THREE.MeshStandardMaterial({
    color: 0x1a1310,
    roughness: 0.96,
  });
  private emberDebrisMat = new THREE.MeshStandardMaterial({
    color: 0x26120a,
    emissive: 0xff4d00,
    emissiveIntensity: 3.1,
    roughness: 0.72,
  });
  private leafDebrisMat = new THREE.MeshStandardMaterial({
    color: 0x245529,
    roughness: 0.85,
  });
  private iceDebrisMat = new THREE.MeshStandardMaterial({
    color: 0xbfe7ff,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.9,
    roughness: 0.16,
  });

  private onHudUpdate: (state: HudState) => void;

  constructor(container: HTMLElement, onHudUpdate: (state: HudState) => void) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;

    // 1. Software WebGL probe
    this.isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const w = Math.max(1, container.clientWidth || window.innerWidth || 1280);
    const h = Math.max(1, container.clientHeight || window.innerHeight || 720);

    // 2. Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.88;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.75),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(w, h);

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

    // 3. Scene, Camera, Fog, Studio Environment (UE5 filmic contrast balance)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xc99c6e);
    this.scene.fog = new THREE.FogExp2(0xc99c6e, 0.00021);

    this.camera = new THREE.PerspectiveCamera(68, w / h, 0.4, 9400);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const skyEnvScene = new THREE.Scene();
    const envGeo = new THREE.SphereGeometry(50, 32, 20);
    const posAttr = envGeo.attributes.position as THREE.BufferAttribute;
    const envColors = new Float32Array(posAttr.count * 3);
    const cZenith = new THREE.Color(0x0a2248);
    const cMidSky = new THREE.Color(0x4176ad);
    const cHorizon = new THREE.Color(0xd98f50);
    const cOcean = new THREE.Color(0x081e30);
    const cTmp = new THREE.Color();
    for (let i = 0; i < posAttr.count; i++) {
      const ny = posAttr.getY(i) / 50;
      if (ny >= 0.35) {
        cTmp.lerpColors(cMidSky, cZenith, (ny - 0.35) / 0.65);
      } else if (ny >= 0) {
        cTmp.lerpColors(cHorizon, cMidSky, ny / 0.35);
      } else {
        cTmp.lerpColors(cHorizon, cOcean, Math.min(1, -ny * 3.5));
      }
      envColors[i * 3] = cTmp.r;
      envColors[i * 3 + 1] = cTmp.g;
      envColors[i * 3 + 2] = cTmp.b;
    }
    envGeo.setAttribute('color', new THREE.BufferAttribute(envColors, 3));
    const envMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
    skyEnvScene.add(new THREE.Mesh(envGeo, envMat));

    // Golden-hour solar specular lobe for metallic scale/armor/horn reflections
    const sunOrbGeo = new THREE.SphereGeometry(4.8, 12, 12);
    const sunOrbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.35, 1.45) });
    const sunOrb = new THREE.Mesh(sunOrbGeo, sunOrbMat);
    sunOrb.position.set(24, 17, -21);
    skyEnvScene.add(sunOrb);

    this.scene.environment = pmremGenerator.fromScene(skyEnvScene, 0.025).texture;
    this.scene.environmentIntensity = 0.56;
    envGeo.dispose();
    envMat.dispose();
    sunOrbGeo.dispose();
    sunOrbMat.dispose();
    pmremGenerator.dispose();

    // 4. Unreal Engine 5 Lighting Rig + Dynamic Player-Tracking Shadow Frustum
    this.hemiLight = new THREE.HemisphereLight(0x6ca2d9, 0x1d241b, 0.36);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffcfa0, 2.15);
    this.sunLight.position.set(240, 175, -210);
    this.sunLight.castShadow = !this.isSoftwareGl;
    const shadowRes = 2048;
    this.sunLight.shadow.mapSize.width = shadowRes;
    this.sunLight.shadow.mapSize.height = shadowRes;
    this.sunLight.shadow.camera.near = 20;
    this.sunLight.shadow.camera.far = 920;
    const d = 260;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.00024;
    this.sunLight.shadow.normalBias = 0.022;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.rimLight = new THREE.DirectionalLight(0x4698de, 0.44);
    this.rimLight.position.set(-240, 130, 280);
    this.scene.add(this.rimLight);

    // Subtle sea-surface bounce fill light
    this.oceanBounceLight = new THREE.DirectionalLight(0x2596d4, 0.2);
    this.oceanBounceLight.position.set(0, -140, 0);
    this.scene.add(this.oceanBounceLight);

    // Dynamic elemental breath light & instantaneous VFX impact flash light
    this.dragonBreathLight = new THREE.PointLight(0xff6d1a, 0, 110, 1.25);
    this.scene.add(this.dragonBreathLight);
    this.vfxFlashLight = new THREE.PointLight(0xffb84d, 0, 105, 1.35);
    this.scene.add(this.vfxFlashLight);

    this.lightningDirLight = new THREE.DirectionalLight(0xc8ecff, 0);
    this.lightningDirLight.position.set(120, 260, -180);
    this.scene.add(this.lightningDirLight);

    // Local high-intensity lights that highlight the dragon's 3D scales & neck during lightning flashes
    this.lightningDragonLight = new THREE.PointLight(0xdbf2ff, 0, 135, 1.35);
    this.scene.add(this.lightningDragonLight);
    this.lightningDragonRimLight = new THREE.PointLight(0x9bd6ff, 0, 105, 1.45);
    this.scene.add(this.lightningDragonRimLight);

    this.createWeatherSystems();

    // 5. World, Volumetric Smoke & Textures
    this.particleTex = createSoftParticleTexture();
    this.scarTex = createImpactScarTexture(this.maxAnisotropy);
    this.shockRingTex = createShockwaveRingTexture();
    this.world = buildDragonWorld(this.scene, this.maxAnisotropy);
    this.initSmokeSystem();
    this.initElemParticleSystem();
    this.initWaterWakeSystem();
    this.audio.setOnSpeech((text) => {
      this.knightSpeechText = text;
      this.knightSpeechTimer = 4.2;
      this.emitHud();
    });

    // Capture initial Sky, Sun, Castles, and Mountains into Ocean Reflection CubeMap
    this.updateOceanReflection();

    // 6. Player Dragon Rig & Articulated Dismounted Knight Rig
    this.playerRig = createDragonRig(DRAGON_SPECS[this.dragonId], this.maxAnisotropy, true);
    this.scene.add(this.playerRig.root);
    this.activeRiderRig = createArticulatedRiderRig();
    this.activeRiderRig.root.visible = false;
    this.scene.add(this.activeRiderRig.root);
    this.applyUpgradeStats(true);
    this.placePlayerAtSanctuary();

    // 7. AI Dragons
    this.spawnAiDragons();

    // 8. UE5 Specular-Only Filmic Bloom + ACES Output + FXAA + Micro-Contrast/Vignette on Hardware GPU
    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(w, h),
        0.16,
        0.42,
        0.94,
      );
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
      this.fxaaPass = new FXAAPass();
      this.fxaaPass.setSize(w, h);
      this.composer.addPass(this.fxaaPass);
      this.filmicPass = new ShaderPass(UE5FilmicPostShader);
      this.composer.addPass(this.filmicPass);
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.emitHud();
    this.startLoop();
  }

  private createWeatherSystems(): void {
    // 1. 3D Wind-Slanted Rain Streaks surrounding camera
    const positions = new Float32Array(this.rainCount * 2 * 3);
    this.rainBaseOffsets = new Float32Array(this.rainCount * 3);
    for (let i = 0; i < this.rainCount; i++) {
      const rx = (Math.random() - 0.5) * 130;
      const ry = Math.random() * 70 - 28;
      const rz = (Math.random() - 0.5) * 130;
      this.rainBaseOffsets[i * 3] = rx;
      this.rainBaseOffsets[i * 3 + 1] = ry;
      this.rainBaseOffsets[i * 3 + 2] = rz;
      positions[i * 6] = rx;
      positions[i * 6 + 1] = ry;
      positions[i * 6 + 2] = rz;
      positions[i * 6 + 3] = rx;
      positions[i * 6 + 4] = ry - 2.6;
      positions[i * 6 + 5] = rz;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.rainMat = new THREE.LineBasicMaterial({
      color: 0xcfe8ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.rainLines = new THREE.LineSegments(rainGeo, this.rainMat);
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    this.scene.add(this.rainLines);

    // 2. Jagged 3D Lightning Bolt
    const boltPositions = new Float32Array(this.lightningSegments * 3);
    const boltGeo = new THREE.BufferGeometry();
    boltGeo.setAttribute('position', new THREE.BufferAttribute(boltPositions, 3));
    this.lightningMat = new THREE.LineBasicMaterial({
      color: 0xe6f6ff,
      transparent: true,
      opacity: 0,
    });
    this.lightningBolt = new THREE.Line(boltGeo, this.lightningMat);
    this.lightningBolt.frustumCulled = false;
    this.lightningBolt.visible = false;
    this.scene.add(this.lightningBolt);

    // 3. 3D Camera-Cone Hyper-Speed Wind Streaks (Boost & High-Speed Flight)
    const streakPositions = new Float32Array(this.speedStreakCount * 2 * 3);
    this.speedStreakSeeds = new Float32Array(this.speedStreakCount * 4);
    for (let i = 0; i < this.speedStreakCount; i++) {
      this.speedStreakSeeds[i * 4] = (i / this.speedStreakCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.14;
      this.speedStreakSeeds[i * 4 + 1] = 8.5 + Math.random() * 14.5; // radial ring radius
      this.speedStreakSeeds[i * 4 + 2] = Math.random(); // depth phase 0..1
      this.speedStreakSeeds[i * 4 + 3] = 0.78 + Math.random() * 0.55; // speed multiplier
    }
    const streakGeo = new THREE.BufferGeometry();
    streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPositions, 3));
    this.speedStreakMat = new THREE.LineBasicMaterial({
      color: 0xeaf6ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.speedStreakLines = new THREE.LineSegments(streakGeo, this.speedStreakMat);
    this.speedStreakLines.frustumCulled = false;
    this.speedStreakLines.visible = false;
    this.scene.add(this.speedStreakLines);
  }

  private updateOceanReflection(): void {
    this.world.oceanMesh.visible = false;
    this.world.oceanCubeCamera.update(this.renderer, this.scene);
    this.world.oceanMesh.visible = true;
  }

  private setFlightEuler(pitch: number, yaw: number): void {
    _eulerA.set(pitch, yaw, 0, 'YXZ');
    this.flightQuat.setFromEuler(_eulerA);
    this.playerRoll = 0;
    this.halfLoopRemaining = 0;
  }

  private placePlayerAtSanctuary(): void {
    this.playerPos.copy(this.world.sanctuaryDragonPerch);
    this.playerYaw = -0.65;
    this.setFlightEuler(0, this.playerYaw);
    this.velocity.set(0, 0, 0);
    this.playerSpeed = 0;
    this.playerRig.bodyGroup.position.set(0, 0, 0);
    this.playerRig.bodyGroup.rotation.set(0, 0, 0);
    this.playerRig.headGroup.rotation.set(0, 0, 0);
    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.rotation.set(0, this.playerYaw, 0, 'YXZ');
  }

  private spawnAiDragons(): void {
    const configs: {
      id: string;
      nameAr: string;
      team: 'ally' | 'enemy';
      specId: DragonId;
      x: number;
      y: number;
      z: number;
    }[] = [
      { id: 'ally_1', nameAr: 'حارس الفجر', team: 'ally', specId: 'glacius', x: -340, y: 105, z: 180 },
      { id: 'ally_2', nameAr: 'جناح العاصفة', team: 'ally', specId: 'terra', x: 240, y: 112, z: -280 },
      { id: 'ally_3', nameAr: 'فارس الشفق', team: 'ally', specId: 'ignis', x: -160, y: 98, z: -460 },
      { id: 'enemy_1', nameAr: 'تنين الرماد', team: 'enemy', specId: 'ignis', x: -660, y: 118, z: -120 },
      { id: 'enemy_2', nameAr: 'مخلب الصقيع', team: 'enemy', specId: 'glacius', x: -240, y: 120, z: -180 },
      { id: 'enemy_3', nameAr: 'وحش البازلت', team: 'enemy', specId: 'terra', x: 640, y: 112, z: -380 },
      { id: 'enemy_4', nameAr: 'ظل القراصنة', team: 'enemy', specId: 'ignis', x: 260, y: 94, z: 240 },
    ];

    const roostLen = Math.max(1, this.world.hangingRoostSpots.length);
    configs.forEach((cfg, idx) => {
      const spec = DRAGON_SPECS[cfg.specId];
      const rig = createDragonRig(spec, this.maxAnisotropy, false, cfg.team);
      this.scene.add(rig.root);
      this.aiDragons.push({
        id: cfg.id,
        nameAr: cfg.nameAr,
        team: cfg.team,
        specId: cfg.specId,
        rig,
        pos: new THREE.Vector3(cfg.x, cfg.y, cfg.z),
        yaw: idx * 1.1,
        pitch: 0,
        roll: 0,
        speed: spec.baseSpeed * 0.88,
        maxHp: spec.maxHp,
        hp: spec.maxHp,
        slowTimer: 0,
        frozenTimer: 0,
        burnTimer: 0,
        fireCooldown: 1 + idx * 0.5,
        patrolSeed: idx * 2.3,
        alive: true,
        respawnTimer: 0,
        state: 'alive',
        fallVel: new THREE.Vector3(),
        fallAngVel: new THREE.Vector3(),
        deadGroundTimer: 0,
        fallingRider: null,
        riderFallPos: new THREE.Vector3(),
        riderFallVel: new THREE.Vector3(),
        riderGrounded: false,
        roostState: 'flying',
        roostIndex: idx % roostLen,
        roostTimer: 6 + idx * 3.5,
        clashTimer: 0,
      });
    });
  }

  private bindEvents(): void {
    const canvas = this.renderer.domElement;
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
  }

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
  };

  private handleResize = (): void => {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth || window.innerWidth || 1280);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight || 720);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(w, h);
    }
  };

  private handlePointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    if (!this.pointerLocked) {
      this.mouseSteerX = 0;
      this.mouseSteerY = 0;
    }
    this.emitHud();
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    this.keys[e.code] = true;
    if (this.phase === 'flying') {
      if (e.code === 'Digit1') this.setActiveElement('fire');
      if (e.code === 'Digit2') this.setActiveElement('ice');
      if (e.code === 'Digit3') this.setActiveElement('rock');
      if (e.code === 'KeyF') {
        if (this.findBoardableEnemy()) {
          this.tryBoardEnemy();
        } else {
          this.performSwordSlash();
        }
      }
      if (e.code === 'KeyR') this.returnToSanctuary();
      if (e.code === 'KeyT') this.triggerRoar();
      if (e.code === 'KeyV') this.toggleCameraView();
      if (e.code === 'KeyX') this.triggerHalfLoop();
      if (e.code === 'KeyK') this.toggleKnifeEdge();
      if (e.code === 'KeyG') this.landDragon();
      if (e.code === 'KeyU') this.jumpOffDragon();
      if (e.code === 'KeyJ') this.isFiring = true;
    } else if (this.phase === 'boarding') {
      if (e.code === 'Space' || e.code === 'KeyF') {
        e.preventDefault();
        this.performSwordSlash();
      }
    } else if (this.phase === 'skydiving') {
      if (e.code === 'KeyU' || e.code === 'KeyG') {
        this.recallDragon();
      }
      if (e.code === 'KeyV') this.toggleCameraView();
    } else if (this.phase === 'on_foot') {
      if (e.code === 'KeyG') {
        this.remountDragon();
      }
      if (e.code === 'KeyF' || e.code === 'KeyJ') {
        this.performSwordSlash();
      }
      if (e.code === 'KeyV') this.toggleCameraView();
      if (e.code === 'Space' && this.riderGrounded) {
        e.preventDefault();
        this.riderVel.y = 11.5;
        this.riderGrounded = false;
      }
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys[e.code] = false;
    if (e.code === 'KeyJ') {
      this.isFiring = false;
    }
  };

  private handleMouseDown = (e: MouseEvent): void => {
    if (e.target !== this.renderer.domElement) return;
    this.audio.init();
    if (
      this.phase === 'flying' ||
      this.phase === 'skydiving' ||
      this.phase === 'on_foot' ||
      this.phase === 'sanctuary_bond' ||
      this.phase === 'resting'
    ) {
      this.isDraggingMouse = true;
    } else if (this.phase === 'boarding') {
      this.performSwordSlash();
    }
  };

  private handleMouseUp = (): void => {
    this.isDraggingMouse = false;
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (this.pointerLocked) {
      if (this.phase === 'on_foot' || this.phase === 'skydiving') {
        this.riderYaw -= e.movementX * 0.0042;
        this.riderCamPitch = THREE.MathUtils.clamp(
          this.riderCamPitch - e.movementY * 0.0036,
          -0.72,
          0.62,
        );
      } else {
        this.mouseSteerX = THREE.MathUtils.clamp(this.mouseSteerX - e.movementX * 0.0024, -1, 1);
        this.mouseSteerY = THREE.MathUtils.clamp(this.mouseSteerY - e.movementY * 0.0024, -1, 1);
      }
    } else if (this.isDraggingMouse) {
      if (this.phase === 'sanctuary_bond' || this.phase === 'resting') {
        this.sanctuaryOrbitAngle -= e.movementX * 0.008;
      } else if (this.phase === 'on_foot' || this.phase === 'skydiving') {
        this.riderYaw -= e.movementX * 0.0062;
        this.riderCamPitch = THREE.MathUtils.clamp(
          this.riderCamPitch - e.movementY * 0.0048,
          -0.72,
          0.62,
        );
      } else if (this.phase === 'flying') {
        // Direct 1:1 gimbal-free screen-drag steering synchronized with hand motion
        _qYaw.setFromAxisAngle(_unitY, -e.movementX * 0.0042);
        this.flightQuat.premultiply(_qYaw);
        _qPitch.setFromAxisAngle(_unitX, -e.movementY * 0.0036);
        this.flightQuat.multiply(_qPitch).normalize();
        this.smoothedHandX = THREE.MathUtils.clamp(-e.movementX * 0.06, -1, 1);
        this.smoothedHandY = THREE.MathUtils.clamp(-e.movementY * 0.06, -1, 1);
      }
    }
  };

  private handleTouchStart = (e: TouchEvent): void => {
    if (e.target !== this.renderer.domElement) return;
    this.audio.init();
    if (e.touches.length > 0) {
      this.lastTouchX = e.touches[0].clientX;
      this.lastTouchY = e.touches[0].clientY;
    }
  };

  private handleTouchMove = (e: TouchEvent): void => {
    if (e.target !== this.renderer.domElement || e.touches.length === 0) return;
    e.preventDefault();
    const tx = e.touches[0].clientX;
    const ty = e.touches[0].clientY;
    const dx = tx - this.lastTouchX;
    const dy = ty - this.lastTouchY;
    this.lastTouchX = tx;
    this.lastTouchY = ty;

    if (this.phase === 'sanctuary_bond' || this.phase === 'resting') {
      this.sanctuaryOrbitAngle -= dx * 0.01;
    } else if (this.phase === 'on_foot' || this.phase === 'skydiving') {
      this.riderYaw -= dx * 0.0075;
      this.riderCamPitch = THREE.MathUtils.clamp(
        this.riderCamPitch - dy * 0.0055,
        -0.72,
        0.62,
      );
    } else if (this.phase === 'flying') {
      _qYaw.setFromAxisAngle(_unitY, -dx * 0.0052);
      this.flightQuat.premultiply(_qYaw);
      _qPitch.setFromAxisAngle(_unitX, -dy * 0.0044);
      this.flightQuat.multiply(_qPitch).normalize();
      this.smoothedHandX = THREE.MathUtils.clamp(-dx * 0.08, -1, 1);
      this.smoothedHandY = THREE.MathUtils.clamp(-dy * 0.08, -1, 1);
    }
  };

  /**
   * Called continuously from the Left-Side Virtual Flight Stick.
   * x: -1 (left) to +1 (right); y: +1 (up/climb) to -1 (down/dive).
   */
  public setManualSteer(x: number, y: number): void {
    this.audio.init();
    this.manualSteerX = THREE.MathUtils.clamp(x, -1, 1);
    this.manualSteerY = THREE.MathUtils.clamp(y, -1, 1);
  }

  public setFiring(active: boolean): void {
    this.audio.init();
    this.isFiring = active;
  }

  public setBoosting(active: boolean): void {
    this.audio.init();
    this.isBoosting = active;
  }

  public requestPointerLock(): void {
    this.audio.init();
    if (this.renderer.domElement.requestPointerLock) {
      this.renderer.domElement.requestPointerLock();
    }
  }

  public setMuted(muted: boolean): void {
    this.audio.init();
    this.audio.setMuted(muted);
    if (muted && this.isLorePlaying) {
      this.isLorePlaying = false;
      this.emitHud();
    }
  }

  public isMuted(): boolean {
    return this.audio.isMuted();
  }

  public selectDragon(id: DragonId): void {
    if (this.dragonId === id) return;
    this.audio.init();
    this.dragonId = id;
    const spec = DRAGON_SPECS[id];
    this.activeElement = spec.element;
    this.bondLevel = 35;

    this.scene.remove(this.playerRig.root);
    this.playerRig.dispose();
    this.playerRig = createDragonRig(spec, this.maxAnisotropy, true);
    this.scene.add(this.playerRig.root);
    this.applyUpgradeStats(true);

    if (this.phase === 'sanctuary_bond' || this.phase === 'resting') {
      this.placePlayerAtSanctuary();
    }
    this.audio.playBondChime(0.4);
    this.emitHud();
  }

  public setMode(mode: GameMode): void {
    this.mode = mode;
    if (mode === 'combat') {
      for (const ai of this.aiDragons) {
        ai.roostState = 'flying';
      }
      this.startNewWarWave(this.warType);
    } else {
      this.warStatus = 'idle';
      this.emitHud();
    }
  }

  public setWarType(warType: WarTargetType): void {
    this.audio.init();
    this.warType = warType;
    if (this.mode === 'combat') {
      this.startNewWarWave(warType);
    } else {
      this.emitHud();
    }
  }

  public startNewWarWave(nextType?: WarTargetType): void {
    this.audio.init();
    if (nextType) {
      this.warType = nextType;
    }
    const wave = this.progression.warWave;
    const extra = Math.min(4, Math.floor((wave - 1) / 2));
    this.warDuration = 120;
    this.warTimeLeft = this.warDuration;
    this.warDragonsKilled = 0;
    this.warShipsSunk = 0;
    this.warDragonsGoal =
      this.warType === 'dragons' ? 3 + extra : this.warType === 'both' ? 2 + extra : 0;
    this.warShipsGoal =
      this.warType === 'ships' ? 3 + extra : this.warType === 'both' ? 2 + extra : 0;
    this.warStatus = this.mode === 'combat' ? 'active' : 'idle';

    // Restore pirate fleet cleanly for fresh ship / combined war rounds
    if (this.warType === 'ships' || this.warType === 'both') {
      for (const ship of this.world.pirateShips) {
        ship.hp = ship.maxHp;
        ship.destroyed = false;
        ship.sinkProgress = 0;
        ship.burnLevel = 0;
        ship.burnTimer = 0;
        ship.brokenMasts = 0;
        ship.damageTiltX = 0;
        ship.damageTiltZ = 0;
        ship.fireLight.intensity = 0;
        ship.hullMat.color.setHex(0x5c3c28);
        ship.hullMat.emissiveIntensity = 0;
        ship.sailMat.color.setHex(0xffffff);
        ship.sailMat.emissiveIntensity = 0;
        for (const mast of ship.masts) {
          mast.rotation.set(0, 0, 0);
        }
        for (const sail of ship.sails) {
          sail.scale.y = 1;
        }
        ship.group.position.y = 0;
        ship.group.rotation.x = 0;
        ship.group.rotation.z = 0;
        ship.group.visible = true;
      }
    }

    if (this.phase === 'flying') {
      this.audio.speakKnight('combat_start');
    }
    this.emitHud();
  }

  public upgradeKnight(key: KnightUpgradeKey): void {
    this.audio.init();
    if (
      this.progression.knightPoints <= 0 ||
      this.progression.knightUpgrades[key] >= UPGRADE_MAX_LEVEL
    ) {
      return;
    }
    this.progression.knightPoints -= 1;
    this.progression.knightUpgrades[key] += 1;
    this.applyUpgradeStats(false);
    this.saveProgression();
    this.audio.playBondChime(0.85);
    this.audio.speakKnight('battle_cry');
    this.emitHud();
  }

  public upgradeDragon(key: DragonUpgradeKey): void {
    this.audio.init();
    if (
      this.progression.dragonPoints <= 0 ||
      this.progression.dragonUpgrades[key] >= UPGRADE_MAX_LEVEL
    ) {
      return;
    }
    this.progression.dragonPoints -= 1;
    this.progression.dragonUpgrades[key] += 1;
    this.applyUpgradeStats(false);
    this.saveProgression();
    this.audio.playBondChime(0.95);
    this.audio.playRoar(this.activeElement);
    this.emitHud();
  }

  public saveProgression(): void {
    this.progression.savedAt = Date.now();
    try {
      window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(this.progression));
    } catch {
      // Ignore storage quota errors
    }
    this.emitHud();
  }

  public playLoreTale(taleId: string): void {
    const tale = ANCIENT_LORE_TALES.find((t) => t.id === taleId);
    if (!tale || this.progression.loreElapsedSeconds < tale.unlockSeconds) return;
    this.audio.playLoreTale(tale, (activeId, segIdx, playing) => {
      this.activeLoreTaleId = activeId;
      this.activeLoreSegment = segIdx;
      this.isLorePlaying = playing;
      if (playing && tale.segments[segIdx]) {
        this.knightSpeechText = tale.segments[segIdx];
        this.knightSpeechTimer = 11.5;
      } else if (!playing) {
        this.knightSpeechTimer = Math.min(this.knightSpeechTimer, 1.5);
      }
      this.emitHud();
    });
  }

  public stopLoreTale(): void {
    this.audio.stopLoreTale();
    this.isLorePlaying = false;
    this.knightSpeechText = null;
    this.knightSpeechTimer = 0;
    this.emitHud();
  }

  public resetProgression(): void {
    this.stopLoreTale();
    this.activeLoreTaleId = null;
    this.activeLoreSegment = 0;
    this.progression = {
      ...DEFAULT_PROGRESSION,
      knightUpgrades: { ...DEFAULT_PROGRESSION.knightUpgrades },
      dragonUpgrades: { ...DEFAULT_PROGRESSION.dragonUpgrades },
    };
    try {
      window.localStorage.removeItem(PROGRESS_STORAGE_KEY);
    } catch {
      // Ignore
    }
    this.applyUpgradeStats(true);
    this.emitHud();
  }

  private applyUpgradeStats(refillVitals: boolean): void {
    const spec = DRAGON_SPECS[this.dragonId];
    const scalesLvl = this.progression.dragonUpgrades.scales;
    const armorLvl = this.progression.knightUpgrades.armor;
    const spiritLvl = this.progression.knightUpgrades.spirit;
    const swordLvl = this.progression.knightUpgrades.sword;

    const prevMaxHp = this.maxHp;
    this.maxHp = spec.maxHp + scalesLvl * 24 + armorLvl * 14;
    this.maxEnergy = spec.maxEnergy + spiritLvl * 16;
    if (refillVitals) {
      this.hp = this.maxHp;
      this.energy = this.maxEnergy;
    } else {
      this.hp = Math.min(this.maxHp, this.hp + Math.max(0, this.maxHp - prevMaxHp));
      this.energy = Math.min(this.maxEnergy, this.energy + 16);
    }

    // Visual Damascus steel & rune luminescence as sword upgrade level increases
    if (this.playerRig?.swordBladeMat) {
      this.playerRig.swordBladeMat.emissive.setHex(swordLvl > 0 ? 0xf59e0b : 0x1e293b);
      this.playerRig.swordBladeMat.emissiveIntensity = 0.08 + swordLvl * 0.14;
    }
  }

  public setActiveElement(el: ElementType): void {
    this.activeElement = el;
    this.emitHud();
  }

  public setWeatherMode(mode: WeatherMode): void {
    this.audio.init();
    this.weatherMode = mode;
    this.weatherCycleTimer = 0;
    if (mode !== 'auto') {
      this.currentWeather = mode;
    }
    this.emitHud();
  }

  public bondStep(): void {
    this.audio.init();
    this.bondLevel = Math.min(100, this.bondLevel + 22);
    this.roarTimer = 0.65;
    this.healBurstTimer = 0.7;
    this.audio.playBondChime(this.bondLevel / 100);
    for (let i = 0; i < 14; i++) {
      this.spawnParticle(
        this.playerPos.x + (Math.random() - 0.5) * 6,
        this.playerPos.y + 2 + Math.random() * 4,
        this.playerPos.z + (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 4,
        3 + Math.random() * 5,
        (Math.random() - 0.5) * 4,
        0xfbbf24,
        1.2,
        0.5,
        3.5,
        -0.5,
      );
    }
    this.emitHud();
  }

  public toggleCameraView(): void {
    this.audio.init();
    this.cameraView = this.cameraView === 'full' ? 'rider' : 'full';
    this.emitHud();
  }

  public triggerHalfLoop(): void {
    if (this.phase !== 'flying' || this.halfLoopRemaining > 0.05) return;
    this.audio.init();
    this.halfLoopRemaining = Math.PI;
    this.maneuverKind = 'half_loop';
    this.maneuverSide = 0;
    this.maneuverIntensity = 1;
    this.maneuverFlashTimer = 0.48;
    this.audio.playWingbeat();
    this.audio.speakKnight('boost');
    this.emitHud();
  }

  public toggleKnifeEdge(): void {
    if (this.phase !== 'flying' || this.playerCrashing) return;
    this.audio.init();
    if (this.knifeEdgeSide !== 0) {
      this.knifeEdgeSide = 0;
      this.maneuverFlashTimer = 0.16;
    } else {
      const turnLeft =
        this.keys['KeyA'] || this.keys['ArrowLeft'] || this.manualSteerX < -0.2;
      const turnRight =
        this.keys['KeyD'] || this.keys['ArrowRight'] || this.manualSteerX > 0.2;
      if (turnLeft) {
        this.knifeEdgeSide = 1; // +90 deg Z roll -> left wing down / banking left
      } else if (turnRight) {
        this.knifeEdgeSide = -1; // -90 deg Z roll -> right wing down / banking right
      } else {
        this.knifeEdgeSide = this.playerRoll >= 0 ? 1 : -1;
      }
      this.maneuverKind = 'knife_edge';
      this.maneuverSide = this.knifeEdgeSide > 0 ? -1 : 1;
      this.maneuverIntensity = 0.92;
      this.maneuverFlashTimer = 0.45;
    }
    this.audio.playWingbeat();
    this.emitHud();
  }

  public jumpOffDragon(): void {
    if (this.phase !== 'flying' || this.playerCrashing) return;
    this.audio.init();
    this.knifeEdgeSide = 0;
    this.maneuverKind = 'none';
    this.maneuverSide = 0;
    this.maneuverIntensity = 0;
    this.maneuverFlashTimer = 0;
    this.landingRequested = false;
    this.isFiring = false;
    this.isBoosting = false;

    _forward.set(0, 0, -1).applyQuaternion(this.flightQuat).normalize();
    _up.set(0, 1, 0).applyQuaternion(this.flightQuat).normalize();

    this.riderPos.copy(this.playerPos).addScaledVector(_up, 3.2);
    this.riderVel.set(
      this.velocity.x * 0.65,
      Math.max(12, this.velocity.y + 14.5),
      this.velocity.z * 0.65,
    );
    this.riderYaw = Math.atan2(-_forward.x, -_forward.z);
    this.riderCamPitch = -0.22;
    this.companionOrbitAngle = this.riderYaw + 1.1;
    this.skydiveState = 'falling';
    this.skydiveWaterTimer = 0;

    this.playerRig.riderBodyGroup.visible = false;
    this.playerRig.leftHandGroup.visible = false;
    this.playerRig.swordArmGroup.visible = false;
    this.playerRig.leftReinStrap.visible = false;
    this.playerRig.rightReinStrap.visible = false;
    this.activeRiderRig.root.visible = true;

    this.phase = 'skydiving';
    this.audio.playWingbeat();
    this.audio.playFallWhoosh(1.4);
    this.emitHud();
  }

  public recallDragon(): void {
    if (this.phase === 'skydiving') {
      this.audio.init();
      this.skydiveState = 'rescuing';
      this.audio.playRoar(this.activeElement);
      this.emitHud();
    } else if (this.phase === 'on_foot') {
      this.remountDragon();
    }
  }

  public landDragon(): void {
    if (this.phase !== 'flying' || this.playerCrashing) return;
    this.audio.init();
    this.knifeEdgeSide = 0;
    this.halfLoopRemaining = 0;
    this.maneuverKind = 'none';
    this.maneuverSide = 0;
    this.maneuverIntensity = 0;
    this.maneuverFlashTimer = 0;
    this.isFiring = false;
    this.landingRequested = !this.landingRequested;
    this.audio.playWingbeat();
    this.emitHud();
  }

  public jumpOnFoot(): void {
    if (this.phase !== 'on_foot' || !this.riderGrounded) return;
    this.audio.init();
    this.riderVel.y = 11.5;
    this.riderGrounded = false;
  }

  public remountDragon(): void {
    if (this.phase !== 'on_foot') return;
    this.audio.init();
    const spec = DRAGON_SPECS[this.dragonId];
    this.activeRiderRig.root.visible = false;
    this.playerRig.riderBodyGroup.visible = true;
    this.playerRig.leftHandGroup.visible = true;
    this.playerRig.swordArmGroup.visible = true;
    this.playerRig.leftReinStrap.visible = true;
    this.playerRig.rightReinStrap.visible = true;

    const launchY = Math.max(
      this.landedDragonPos.y + 5.5,
      this.world.getWalkableGroundHeight(this.riderPos.x, this.riderPos.z) + 6.5,
    );
    const near = this.riderPos.distanceTo(this.landedDragonPos) < 28;
    const lx = near ? this.landedDragonPos.x : this.riderPos.x;
    const lz = near ? this.landedDragonPos.z : this.riderPos.z;
    const yaw = near ? this.landedDragonYaw : this.riderYaw;

    this.playerRig.bodyGroup.position.set(0, 0, 0);
    this.playerRig.bodyGroup.rotation.set(0, 0, 0);
    this.playerRig.headGroup.rotation.set(0, 0, 0);
    this.playerRig.leftHindFoot.rotation.set(0, 0, 0);
    this.playerRig.rightHindFoot.rotation.set(0, 0, 0);
    this.playerPos.set(lx, launchY, lz);
    this.setFlightEuler(0.18, yaw);
    this.playerSpeed = spec.baseSpeed * 0.85;
    _forward.set(0, 0, -1).applyQuaternion(this.flightQuat).normalize();
    this.velocity.copy(_forward).multiplyScalar(this.playerSpeed);
    this.velocity.y += 14;
    this.landingRequested = false;
    this.knifeEdgeSide = 0;
    this.phase = 'flying';

    // Takeoff dust scatter beneath wings
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.spawnSmoke(
        lx + Math.cos(a) * 3.5,
        launchY - 4.0,
        lz + Math.sin(a) * 3.5,
        Math.cos(a) * 18,
        2.5 + Math.random() * 5.5,
        Math.sin(a) * 18,
        0x9a8568,
        1.15,
        2.8,
        9.6,
        1.8,
        0,
        0.5,
      );
    }
    this.audio.playWingbeat();
    this.audio.playRoar(this.activeElement);
    this.audio.speakKnight('takeoff', true);
    this.emitHud();
  }

  public launchFlight(): void {
    this.audio.init();
    this.stopLoreTale();
    if (this.bondLevel < 100) {
      this.bondLevel = 100;
    }
    this.playerCrashing = false;
    this.playerCrashTimer = 0;
    this.knifeEdgeSide = 0;
    this.maneuverKind = 'none';
    this.maneuverSide = 0;
    this.maneuverIntensity = 0;
    this.maneuverFlashTimer = 0;
    this.landingRequested = false;
    this.activeRiderRig.root.visible = false;
    this.phase = 'flying';
    // Launch directly out of the Sanctuary rock-cavern mouth facing the open ocean
    this.playerPos.set(-555, 76, 515);
    this.setFlightEuler(-0.02, -0.78);
    this.playerSpeed =
      DRAGON_SPECS[this.dragonId].baseSpeed + this.progression.dragonUpgrades.wings * 6;
    _forward.set(0, 0, -1).applyQuaternion(this.flightQuat).normalize();
    this.velocity.copy(_forward).multiplyScalar(this.playerSpeed);
    if (this.mode === 'combat' && this.warStatus !== 'active') {
      this.startNewWarWave(this.warType);
    }
    this.audio.playRoar(this.activeElement);
    this.audio.speakKnight('takeoff', true);
    this.emitHud();
  }

  public returnToSanctuary(): void {
    this.audio.init();
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
    this.playerCrashing = false;
    this.playerCrashTimer = 0;
    this.knifeEdgeSide = 0;
    this.maneuverKind = 'none';
    this.maneuverSide = 0;
    this.maneuverIntensity = 0;
    this.maneuverFlashTimer = 0;
    this.landingRequested = false;
    this.activeRiderRig.root.visible = false;
    this.phase = 'resting';
    this.isFiring = false;
    this.isBoosting = false;
    this.manualSteerX = 0;
    this.manualSteerY = 0;
    this.boardingTarget = null;
    this.placePlayerAtSanctuary();
    this.audio.playBondChime(0.6);
    this.emitHud();
  }

  public tendWounds(): void {
    this.audio.init();
    this.hp = Math.min(this.maxHp, this.hp + 38);
    this.woundsCount = Math.max(0, this.woundsCount - 1);
    this.healBurstTimer = 1.0;
    this.audio.playHealTick();
    for (let i = 0; i < 16; i++) {
      this.spawnParticle(
        this.playerPos.x + (Math.random() - 0.5) * 7,
        this.playerPos.y + 1.5 + Math.random() * 3,
        this.playerPos.z + (Math.random() - 0.5) * 7,
        (Math.random() - 0.5) * 3,
        2.5 + Math.random() * 4,
        (Math.random() - 0.5) * 3,
        0x34d399,
        1.1,
        0.4,
        2.8,
        -0.4,
      );
    }
    if (this.hp >= this.maxHp) {
      this.woundsCount = 0;
    }
    this.emitHud();
  }

  public rechargeEnergy(): void {
    this.audio.init();
    this.energy = Math.min(this.maxEnergy, this.energy + 45);
    this.healBurstTimer = 0.8;
    this.audio.playBondChime(0.95);
    const col =
      this.activeElement === 'fire'
        ? 0xf97316
        : this.activeElement === 'ice'
          ? 0x38bdf8
          : 0xfacc15;
    for (let i = 0; i < 16; i++) {
      this.spawnParticle(
        this.playerPos.x + (Math.random() - 0.5) * 7,
        this.playerPos.y + 2 + Math.random() * 3,
        this.playerPos.z + (Math.random() - 0.5) * 7,
        (Math.random() - 0.5) * 4,
        3 + Math.random() * 4,
        (Math.random() - 0.5) * 4,
        col,
        1.2,
        0.5,
        3.2,
        -0.3,
      );
    }
    this.emitHud();
  }

  public flyToLandmark(landmarkId: string): void {
    const lm = WORLD_LANDMARKS.find((l) => l.id === landmarkId);
    if (!lm) return;
    this.audio.init();
    this.playerCrashing = false;
    this.playerCrashTimer = 0;
    this.knifeEdgeSide = 0;
    this.landingRequested = false;
    this.activeRiderRig.root.visible = false;
    this.playerRig.riderBodyGroup.visible = true;
    this.playerRig.leftHandGroup.visible = true;
    this.playerRig.swordArmGroup.visible = true;
    this.playerRig.leftReinStrap.visible = true;
    this.playerRig.rightReinStrap.visible = true;
    this.playerRig.bodyGroup.position.set(0, 0, 0);
    this.playerRig.bodyGroup.rotation.set(0, 0, 0);
    this.playerRig.headGroup.rotation.set(0, 0, 0);
    this.phase = 'flying';
    this.playerPos.set(lm.x + 95, Math.max(lm.y + 44, 52), lm.z + 95);
    this.setFlightEuler(-0.06, Math.atan2(this.playerPos.x - lm.x, this.playerPos.z - lm.z));
    this.playerSpeed = DRAGON_SPECS[this.dragonId].baseSpeed;
    _forward.set(0, 0, -1).applyQuaternion(this.flightQuat).normalize();
    this.velocity.copy(_forward).multiplyScalar(this.playerSpeed);
    this.emitHud();
  }

  public triggerRoar(): void {
    this.audio.init();
    this.roarTimer = 0.85;
    this.audio.playRoar(this.activeElement);
    const col =
      this.activeElement === 'fire'
        ? 0xff7722
        : this.activeElement === 'ice'
          ? 0x7dd3fc
          : 0xeab308;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      this.spawnParticle(
        this.playerPos.x,
        this.playerPos.y + 2,
        this.playerPos.z,
        Math.cos(a) * 26,
        (Math.random() - 0.5) * 6,
        Math.sin(a) * 26,
        col,
        0.9,
        1.5,
        6.5,
        0,
      );
    }
  }

  public triggerBreathOnce(): void {
    this.audio.init();
    this.fireElementalBreath();
  }

  public setTouchControl(code: string, pressed: boolean): void {
    this.audio.init();
    this.keys[code] = pressed;
    if (code === 'TouchFire') {
      this.isFiring = pressed;
    }
  }

  public tryBoardEnemy(): void {
    if (this.phase !== 'flying' || this.mode !== 'combat') return;
    const candidate = this.findBoardableEnemy();
    if (!candidate) return;
    this.audio.init();
    this.boardingTarget = candidate;
    this.boardingProgress = 0;
    this.boardingHits = 0;
    this.swordSwingTimer = 0;
    this.boardingExitTimer = 0;
    this.isFiring = false;
    this.phase = 'boarding';
    this.audio.playWingbeat();
    this.audio.speakKnight('battle_cry', true);
    this.emitHud();
  }

  public performSwordSlash(): void {
    if (this.swordSwingTimer > 0.12) return;
    this.audio.init();
    const swordDmg = 42 + this.progression.knightUpgrades.sword * 18;

    if (this.phase === 'boarding' && this.boardingTarget && this.boardingExitTimer <= 0) {
      this.swordSwingTimer = 0.36;
      this.audio.playSwordSlash();
      this.audio.playSwordSpark();
      this.boardingHits += 1;

      const tPos = this.boardingTarget.pos;
      this.spawnSparkBurst(tPos.clone().setY(tPos.y + 2.2), _unitY, 20, 0xfef08a, 1.15);
      this.spawnShockwaveRing(tPos.clone().setY(tPos.y + 2.0), _unitY, 0.8, 7.5, 0xfbbf24, 0.42);
      this.triggerVfxFlash(tPos, 0xfde047, 1.0);

      if (this.boardingHits >= this.boardingHitsRequired) {
        this.killEnemyDragon(this.boardingTarget, true);
        this.boardingExitTimer = 0.55;
      } else {
        this.audio.speakKnight('battle_cry');
      }
      this.emitHud();
      return;
    }

    if (this.phase === 'flying' || this.phase === 'on_foot') {
      this.swordSwingTimer = 0.38;
      this.audio.playSwordSlash();
      let struckAnything = false;

      const origin = this.phase === 'on_foot' ? this.riderPos : this.playerPos;
      if (this.phase === 'flying') {
        _forward.set(0, 0, -1).applyQuaternion(this.flightQuat).normalize();
      } else {
        _forward.set(-Math.sin(this.riderYaw), 0, -Math.cos(this.riderYaw)).normalize();
      }
      const strikeCenter = _v3.copy(origin).addScaledVector(_forward, this.phase === 'flying' ? 8.5 : 3.2);
      if (this.phase === 'on_foot') {
        strikeCenter.y += 1.4;
      }

      // 1. Sword vs Enemy Dragons (in flight close strafe)
      if (this.mode === 'combat' && this.phase === 'flying') {
        for (const ai of this.aiDragons) {
          if (!ai.alive || ai.team !== 'enemy') continue;
          if (ai.pos.distanceTo(strikeCenter) < 19) {
            struckAnything = true;
            ai.hp -= swordDmg;
            _normal.copy(origin).sub(ai.pos).normalize();
            this.spawnSparkBurst(ai.pos, _normal, 22, 0xffd166, 1.25);
            this.spawnShockwaveRing(ai.pos, _normal, 0.8, 9.0, 0xfbbf24, 0.42);
            this.triggerVfxFlash(ai.pos, 0xffd166, 1.1);
            if (ai.hp <= 0) {
              this.killEnemyDragon(ai, true);
            }
            break;
          }
        }
      }

      // 2. Sword vs Castles, Walls, Towers & Royal Palace (sparks + deep stone gouge scratches!)
      const bReach = this.phase === 'flying' ? 14 : 6.2;
      for (const b of this.world.destructibleBuildings) {
        if (b.destroyed) continue;
        const dx = strikeCenter.x - b.pos.x;
        const dz = strikeCenter.z - b.pos.z;
        const distHoriz = Math.hypot(dx, dz);
        if (
          distHoriz < b.radius + bReach &&
          strikeCenter.y >= b.pos.y - b.height * 0.5 &&
          strikeCenter.y <= b.pos.y + b.height * 0.65
        ) {
          struckAnything = true;
          const invD = distHoriz > 0.01 ? 1 / distHoriz : 1;
          const nx = distHoriz > 0.01 ? dx * invD : 0;
          const nz = distHoriz > 0.01 ? dz * invD : 1;
          const hitNormal = new THREE.Vector3(nx, 0.14, nz).normalize();
          const hitPt = new THREE.Vector3(
            b.pos.x + nx * (b.radius * 0.92),
            THREE.MathUtils.clamp(strikeCenter.y, b.pos.y - b.height * 0.35, b.pos.y + b.height * 0.42),
            b.pos.z + nz * (b.radius * 0.92),
          );
          this.spawnSurfaceScar(hitPt, hitNormal, this.phase === 'flying' ? 4.4 : 2.2, 'sword');
          this.spawnSparkBurst(hitPt, hitNormal, 24, 0xffd86b, 1.25);
          this.spawnShockwaveRing(hitPt, hitNormal, 0.5, 4.8, 0xffb74d, 0.35);
          this.triggerVfxFlash(hitPt, 0xffcf54, 1.15);
          this.damageBuilding(b, swordDmg * 0.65, true, _forward, 'ram');
          break;
        }
      }

      // 3. Sword vs Pirate Ships (hull scratches + timber & steel sparks!)
      const sReach = this.phase === 'flying' ? 20 : 14;
      for (const ship of this.world.pirateShips) {
        if (ship.destroyed) continue;
        const sp = ship.group.position;
        const dx = strikeCenter.x - sp.x;
        const dz = strikeCenter.z - sp.z;
        const dH = Math.hypot(dx, dz);
        if (dH < sReach && strikeCenter.y < 24) {
          struckAnything = true;
          const nx = dH > 0.01 ? dx / dH : 0;
          const nz = dH > 0.01 ? dz / dH : 1;
          const hitNormal = new THREE.Vector3(nx, 0.32, nz).normalize();
          const hitPt = new THREE.Vector3(
            sp.x + nx * Math.min(dH * 0.55, 6.5),
            Math.max(2.4, strikeCenter.y),
            sp.z + nz * Math.min(dH * 0.55, 6.5),
          );
          this.spawnSurfaceScar(hitPt, hitNormal, 3.6, 'sword', ship.group);
          this.spawnSparkBurst(hitPt, hitNormal, 22, 0xffd166, 1.18);
          this.spawnShockwaveRing(hitPt, hitNormal, 0.5, 5.2, 0xffa726, 0.38);
          this.triggerVfxFlash(hitPt, 0xffca3a, 1.05);
          this.damageShip(ship, swordDmg * 0.85, 'ram', _forward);
          break;
        }
      }

      if (struckAnything) {
        this.audio.playSwordSpark();
        this.impactShake = Math.max(this.impactShake, 0.36);
        this.audio.speakKnight('battle_cry', true);
      } else if (Math.random() < 0.45) {
        this.audio.speakKnight('battle_cry');
      }
      this.emitHud();
    }
  }

  private findBoardableEnemy(): AiDragon | null {
    if (this.mode !== 'combat' || this.warType === 'ships') return null;
    let best: AiDragon | null = null;
    let bestDist = 42;
    for (const ai of this.aiDragons) {
      if (!ai.alive || ai.team !== 'enemy') continue;
      const d = ai.pos.distanceTo(this.playerPos);
      if (d < bestDist) {
        bestDist = d;
        best = ai;
      }
    }
    return best;
  }

  private killEnemyDragon(ai: AiDragon, bySword: boolean): void {
    if (!ai.alive) return;
    ai.alive = false;
    ai.hp = 0;
    ai.state = 'falling';
    ai.deadGroundTimer = 3.4;
    ai.respawnTimer = 6.5;
    ai.rig.setFrozen(false);
    ai.rig.riderBodyGroup.visible = false;

    // Initial downward fall vector inheriting dragon momentum + gravity kick
    _eulerA.set(ai.pitch, ai.yaw, ai.roll, 'YXZ');
    _quatA.setFromEuler(_eulerA);
    _forward.set(0, 0, -1).applyQuaternion(_quatA).normalize();
    ai.fallVel.copy(_forward).multiplyScalar(ai.speed * 0.78);
    ai.fallVel.y -= 9.5;
    ai.fallAngVel.set(
      (Math.random() - 0.5) * 2.2,
      (Math.random() > 0.5 ? 1 : -1) * (1.8 + Math.random() * 1.4),
      (Math.random() > 0.5 ? 1 : -1) * (2.6 + Math.random() * 1.6),
    );

    // Eject the knight rider separately so both dragon and rider fall realistically from the sky
    if (ai.fallingRider) {
      this.disposeObject3D(ai.fallingRider);
      this.scene.remove(ai.fallingRider);
    }
    ai.fallingRider = createFallingRiderMesh(ai.team);
    ai.riderFallPos.set(ai.pos.x, ai.pos.y + 2.4, ai.pos.z);
    ai.fallingRider.position.copy(ai.riderFallPos);
    ai.riderFallVel.set(
      ai.fallVel.x * 0.65 + (Math.random() - 0.5) * 14,
      ai.fallVel.y + 11.0,
      ai.fallVel.z * 0.65 + (Math.random() - 0.5) * 14,
    );
    ai.riderGrounded = false;
    this.scene.add(ai.fallingRider);

    this.audio.playRoar(DRAGON_SPECS[ai.specId].element);
    this.audio.playFallWhoosh(1.75);

    if (ai.team === 'enemy') {
      this.allyScore += bySword ? 300 : 150;
      this.energy = Math.min(this.maxEnergy, this.energy + (bySword ? 30 : 15));
      this.audio.speakKnight(bySword ? 'sword_kill' : 'battle_cry', bySword);
      if (this.mode === 'combat' && this.warStatus === 'active' && this.warType !== 'ships') {
        this.warDragonsKilled += 1;
        this.checkWarResolution();
      }
    } else {
      this.enemyScore += 120;
    }

    this.spawnSparkBurst(ai.pos, _unitY, 22, ai.team === 'enemy' ? 0xff9b38 : 0x7dd3fc, 1.3);
    this.spawnShockwaveRing(ai.pos, _unitY, 1.2, 16, ai.team === 'enemy' ? 0xff7b1a : 0x38bdf8, 0.55);

    for (let i = 0; i < 20; i++) {
      this.spawnParticle(
        ai.pos.x,
        ai.pos.y,
        ai.pos.z,
        (Math.random() - 0.5) * 24,
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 24,
        i < 10 ? (ai.team === 'enemy' ? 0xf97316 : 0x38bdf8) : 0x334155,
        0.95,
        2.0,
        8.5,
        4,
        i < 10,
      );
    }
  }

  private showToast(msg: string): void {
    this.toastMessage = msg;
    this.toastTimer = 3.6;
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;
      const dt = Math.min(0.05, this.clock.getDelta());
      const elapsed = this.clock.elapsedTime;
      this.update(dt, elapsed);

      // Refresh ocean sky/cloud reflection periodically on GPU
      this.frameCount++;
      if (!this.isSoftwareGl && this.frameCount % 90 === 0) {
        this.updateOceanReflection();
      }

      if (this.isSoftwareGl || !this.composer) {
        this.renderer.render(this.scene, this.camera);
      } else {
        this.composer.render();
      }

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private computeVolcanicZoneFactor(x: number, z: number): number {
    const dMain = Math.hypot(x + 1520, z + 1500);
    const dTwin = Math.hypot(x + 1840, z + 1240);
    const dEmber = Math.hypot(x + 1230, z + 1780);
    const fMain = 1 - THREE.MathUtils.smoothstep(dMain, 190, 560);
    const fTwin = 1 - THREE.MathUtils.smoothstep(dTwin, 125, 360);
    const fEmber = 1 - THREE.MathUtils.smoothstep(dEmber, 120, 355);
    return Math.max(fMain, fTwin, fEmber);
  }

  private triggerLightningStrike(isVolcanic = false): void {
    if (isVolcanic) {
      this.volcanicLightningPower = 1.0;
    } else {
      this.lightningPower = 1.0;
    }
    this.audio.playThunder();

    const focus =
      this.phase === 'skydiving' || this.phase === 'on_foot' ? this.riderPos : this.playerPos;

    let bx: number;
    let bz: number;
    let topY: number;
    let botY: number;

    if (isVolcanic) {
      // Dirty-thunderstorm strike erupting inside the dense pyroclastic clouds above the Hidden Volcanic Islands
      const anchorX = THREE.MathUtils.lerp(-1520, focus.x, 0.55);
      const anchorZ = THREE.MathUtils.lerp(-1500, focus.z, 0.55);
      bx = anchorX + (Math.random() - 0.5) * 290;
      bz = anchorZ + (Math.random() - 0.5) * 290;
      topY = 235;
      botY = Math.max(12, getTerrainHeight(bx, bz) - 4);
      this.lightningOrigin.set(bx, 175, bz);
    } else {
      // Place bolt in front of the player camera so the strike and its sea reflections are dramatic
      this.camera.getWorldDirection(_v1);
      _right.set(-_v1.z, 0, _v1.x).normalize();
      const dist = 165 + Math.random() * 140;
      const lateral = (Math.random() - 0.5) * 230;
      bx = this.camera.position.x + _v1.x * dist + _right.x * lateral;
      bz = this.camera.position.z + _v1.z * dist + _right.z * lateral;
      topY = 215;
      botY = -2;
      this.lightningOrigin.set(bx, 165, bz);
    }

    this.lightningDirLight.position.set(bx - focus.x, 260, bz - focus.z);

    const attr = this.lightningBolt.geometry.getAttribute('position') as THREE.BufferAttribute;
    let curX = bx;
    let curZ = bz;
    for (let i = 0; i < this.lightningSegments; i++) {
      const t = i / (this.lightningSegments - 1);
      const y = THREE.MathUtils.lerp(topY, botY, t);
      if (i > 0 && i < this.lightningSegments - 1) {
        curX += (Math.random() - 0.5) * 28;
        curZ += (Math.random() - 0.5) * 28;
      }
      attr.setXYZ(i, curX, y, curZ);
    }
    attr.needsUpdate = true;
  }

  private updateWeather(dt: number, elapsed: number): void {
    if (this.weatherMode === 'auto') {
      this.weatherCycleTimer = (this.weatherCycleTimer + dt) % 96;
      const nextWeather: WeatherState =
        this.weatherCycleTimer < 32
          ? 'clear'
          : this.weatherCycleTimer < 64
            ? 'rain'
            : 'storm';
      if (nextWeather !== this.currentWeather) {
        this.currentWeather = nextWeather;
      }
    } else {
      this.currentWeather = this.weatherMode;
    }

    const targetRain =
      this.currentWeather === 'clear' ? 0 : this.currentWeather === 'rain' ? 0.68 : 1.0;
    const targetStorm =
      this.currentWeather === 'clear' ? 0 : this.currentWeather === 'rain' ? 0.36 : 1.0;

    this.rainIntensity = THREE.MathUtils.damp(this.rainIntensity, targetRain, 0.9, dt);
    this.stormIntensity = THREE.MathUtils.damp(this.stormIntensity, targetStorm, 0.8, dt);

    const focusPos =
      this.phase === 'skydiving' || this.phase === 'on_foot' ? this.riderPos : this.playerPos;
    const targetVolcZone = this.computeVolcanicZoneFactor(focusPos.x, focusPos.z);
    this.volcanicZoneFactor = THREE.MathUtils.damp(
      this.volcanicZoneFactor,
      targetVolcZone,
      1.35,
      dt,
    );

    // Periodic global storm lightning + localized volcanic dirty-thunderstorm lightning
    this.lightningPower = Math.max(0, this.lightningPower - dt * 3.8);
    this.volcanicLightningPower = Math.max(0, this.volcanicLightningPower - dt * 4.2);

    if (this.stormIntensity > 0.55) {
      this.nextLightningTimer -= dt;
      if (this.nextLightningTimer <= 0) {
        this.nextLightningTimer = 2.6 + Math.random() * 4.4 - this.stormIntensity * 0.9;
        this.triggerLightningStrike(false);
      }
    } else {
      this.nextLightningTimer = Math.min(this.nextLightningTimer, 1.5);
    }

    if (this.volcanicZoneFactor > 0.22) {
      this.nextVolcanicLightningTimer -= dt;
      if (this.nextVolcanicLightningTimer <= 0) {
        this.nextVolcanicLightningTimer =
          1.25 + Math.random() * 1.95 - this.volcanicZoneFactor * 0.45;
        this.triggerLightningStrike(true);
      }
    } else {
      this.nextVolcanicLightningTimer = Math.min(this.nextVolcanicLightningTimer, 0.9);
    }

    const flicker =
      this.lightningPower > 0.02
        ? this.lightningPower * (0.62 + 0.38 * Math.sin(elapsed * 72))
        : 0;
    const volcanicFlicker =
      this.volcanicLightningPower > 0.02
        ? this.volcanicLightningPower * (0.58 + 0.42 * Math.sin(elapsed * 86 + 1.3))
        : 0;
    const combinedFlicker = Math.max(flicker, volcanicFlicker);
    const effectiveStorm = Math.min(
      1,
      Math.max(this.stormIntensity, this.volcanicZoneFactor * 0.88),
    );

    // Ambient swirling volcanic soot/ash plumes & continuous rising crater columns
    if (this.volcanicZoneFactor > 0.25 && Math.random() < this.volcanicZoneFactor * 0.46) {
      const isEmber = Math.random() < 0.24;
      if (isEmber) {
        this.spawnParticle(
          focusPos.x + (Math.random() - 0.5) * 90,
          focusPos.y + (Math.random() - 0.4) * 34,
          focusPos.z + (Math.random() - 0.5) * 90,
          (Math.random() - 0.5) * 4,
          3.5 + Math.random() * 5.5,
          (Math.random() - 0.5) * 4,
          Math.random() < 0.5 ? 0xf97316 : 0xfbbf24,
          1.15,
          0.85,
          1.6,
          -0.9,
          true,
        );
      } else {
        this.spawnSmoke(
          focusPos.x + (Math.random() - 0.5) * 105,
          focusPos.y + (Math.random() - 0.4) * 38,
          focusPos.z + (Math.random() - 0.5) * 105,
          (Math.random() - 0.5) * 4,
          1.2 + Math.random() * 2.5,
          (Math.random() - 0.5) * 4,
          0x26211e,
          2.8,
          6.5,
          17.5,
          1.2,
          this.volcanicZoneFactor * 0.35,
          0.9,
        );
      }
    }

    // Towering realistic volcanic smoke columns rising from craters when nearby
    this.volcanoPlumeTimer += dt;
    if (this.volcanoPlumeTimer >= 0.24) {
      this.volcanoPlumeTimer = 0;
      const craters: [number, number, number, number][] = [
        [940, 112, 90, 1.0],
        [-1520, 108, -1500, 0.9],
        [-1780, 96, -1300, 0.78],
      ];
      for (const [cx, cy, cz, scaleM] of craters) {
        if (Math.hypot(focusPos.x - cx, focusPos.z - cz) < 1650) {
          this.spawnSmoke(
            cx + (Math.random() - 0.5) * 18,
            cy + Math.random() * 6,
            cz + (Math.random() - 0.5) * 18,
            (Math.random() - 0.5) * 4,
            10 + Math.random() * 6,
            (Math.random() - 0.5) * 4,
            Math.random() < 0.55 ? 0x2b2522 : 0x3b332e,
            5.4,
            18 * scaleM,
            58 * scaleM,
            3.6,
            0.55,
            1.1,
          );
        }
      }
    }

    // 1. Alter player visibility via exponential atmospheric + pyroclastic ash fog
    const fog = this.scene.fog as THREE.FogExp2;
    const clearToRain = Math.min(1, effectiveStorm * 2.5);
    const rainToStorm = Math.max(0, (effectiveStorm - 0.36) / 0.64);
    fog.color
      .copy(_fogColorClear)
      .lerp(_fogColorRain, clearToRain)
      .lerp(_fogColorStorm, rainToStorm)
      .lerp(_fogColorVolcanic, this.volcanicZoneFactor * 0.82)
      .lerp(_fogColorFlash, combinedFlicker * 0.45);
    const baseDensity = THREE.MathUtils.lerp(
      0.00021,
      THREE.MathUtils.lerp(0.0011, 0.0020, rainToStorm),
      clearToRain,
    );
    const altFogScale = Math.max(0.32, 1 - Math.max(0, focusPos.y - 160) / 860);
    fog.density =
      THREE.MathUtils.lerp(
        baseDensity,
        Math.max(baseDensity, 0.00148),
        this.volcanicZoneFactor,
      ) * altFogScale;
    (this.scene.background as THREE.Color).copy(fog.color);

    // 2. Update sky dome, UE5 volumetric cloud shader, volumetric smoke & ocean shader uniforms
    this.world.skyMaterial.uniforms.uStormFactor.value = effectiveStorm;
    this.world.skyMaterial.uniforms.uLightning.value = Math.max(flicker, volcanicFlicker * 0.72);
    this.world.cloudMaterial.uniforms.uTime.value = elapsed;
    this.world.cloudMaterial.uniforms.uStormFactor.value = effectiveStorm;
    this.world.cloudMaterial.uniforms.uLightning.value = flicker;
    this.world.cloudMaterial.uniforms.uVolcanicLightning.value = Math.max(
      volcanicFlicker,
      flicker * 0.65,
    );
    this.smokeMat.uniforms.uTime.value = elapsed;
    this.smokeMat.uniforms.uStormFactor.value = effectiveStorm;
    this.smokeMat.uniforms.uLightning.value = combinedFlicker;

    if (this.world.oceanMaterial.userData.shader) {
      const uniforms = this.world.oceanMaterial.userData.shader.uniforms;
      uniforms.uTime.value = elapsed;
      uniforms.uStormFactor.value = effectiveStorm;
      uniforms.uLightning.value = Math.max(flicker, volcanicFlicker * 0.78);
      if (uniforms.uDragonWakePos) {
        uniforms.uDragonWakePos.value.set(
          this.oceanWakePosXZ.x,
          this.oceanWakePosXZ.y,
          this.oceanWakeIntensity,
        );
      }
      if (uniforms.uDragonWakeDir) {
        uniforms.uDragonWakeDir.value.copy(this.oceanWakeDirXZ);
      }
      if (uniforms.uWakeTrail?.value) {
        const trail = uniforms.uWakeTrail.value as THREE.Vector4[];
        for (let i = 0; i < trail.length; i++) {
          if (trail[i].w > 0.005) {
            trail[i].z += dt;
            if (trail[i].z > 4.2) trail[i].w = 0;
          }
        }
      }
    }

    // 3. Modulate UE5 balanced lighting + electric specular lightning on dragon scales & ocean
    this.sunLight.intensity = THREE.MathUtils.lerp(2.15, 0.42, effectiveStorm);
    this.sunLight.color.copy(_sunColorClear).lerp(_sunColorStorm, effectiveStorm);
    this.hemiLight.intensity =
      THREE.MathUtils.lerp(0.36, 0.22, effectiveStorm) + combinedFlicker * 0.58;
    this.hemiLight.color.copy(_hemiSkyClear).lerp(_hemiSkyStorm, effectiveStorm);
    this.hemiLight.groundColor.copy(_hemiGndClear).lerp(_hemiGndStorm, effectiveStorm);
    this.rimLight.intensity =
      THREE.MathUtils.lerp(0.44, 0.62, effectiveStorm) + combinedFlicker * 1.25;
    this.oceanBounceLight.intensity = THREE.MathUtils.lerp(0.2, 0.1, effectiveStorm);

    this.lightningDirLight.intensity = combinedFlicker * 8.4;
    this.world.oceanMaterial.envMapIntensity =
      THREE.MathUtils.lerp(1.15, 1.55, effectiveStorm) + combinedFlicker * 0.9;
    this.scene.environmentIntensity = 0.56 + combinedFlicker * 0.95;

    // Position two close lightning point lights to rake across dragon's 3D scales & clearcoat
    _forward.set(0, 0, -1).applyQuaternion(this.flightQuat).normalize();
    _right.set(1, 0, 0).applyQuaternion(this.flightQuat).normalize();
    _lightningDir.copy(this.lightningOrigin).sub(this.playerPos);
    if (_lightningDir.lengthSq() > 1) {
      _lightningDir.normalize();
    } else {
      _lightningDir.set(0.3, 0.9, -0.3).normalize();
    }

    this.lightningDragonLight.position
      .copy(this.playerPos)
      .addScaledVector(_lightningDir, 14);
    this.lightningDragonLight.position.y += 8;
    this.lightningDragonLight.intensity = combinedFlicker * 92;

    this.lightningDragonRimLight.position
      .copy(this.playerPos)
      .addScaledVector(_forward, 9)
      .addScaledVector(_right, 7);
    this.lightningDragonRimLight.position.y += 4.5;
    this.lightningDragonRimLight.intensity = combinedFlicker * 64;

    // Physical clearcoat & custom Fresnel/specular lightning surface reflection on Player + AI dragons
    const boltColorHex = volcanicFlicker > flicker ? 0xe0f2fe : 0xcbeaff;
    if (combinedFlicker > 0.015) {
      const playerStrikeBoost = Math.min(1.5, combinedFlicker * (1 + this.volcanicZoneFactor * 0.42));
      this.playerRig.setLightningReflection(playerStrikeBoost, _lightningDir, boltColorHex);
    } else {
      this.playerRig.setLightningReflection(0);
    }

    for (const ai of this.aiDragons) {
      if (!ai.alive) {
        ai.rig.setLightningReflection(0);
        continue;
      }
      const aiVolc = this.computeVolcanicZoneFactor(ai.pos.x, ai.pos.z);
      const localAiFlash = Math.max(flicker, volcanicFlicker * Math.max(aiVolc, 0.25));
      if (localAiFlash > 0.02) {
        _v1.copy(this.lightningOrigin).sub(ai.pos);
        const distToBolt = _v1.length();
        const falloff = 1 - THREE.MathUtils.smoothstep(distToBolt, 260, 1450);
        const refl = localAiFlash * (0.45 + 0.85 * falloff) * (1 + aiVolc * 0.35);
        if (distToBolt > 0.01) {
          _v1.divideScalar(distToBolt);
        } else {
          _v1.set(0.3, 0.9, -0.3).normalize();
        }
        ai.rig.setLightningReflection(refl, _v1, boltColorHex);
      } else {
        ai.rig.setLightningReflection(0);
      }
    }

    this.lightningBolt.visible = combinedFlicker > 0.08;
    this.lightningMat.opacity = Math.min(1, combinedFlicker * 1.35);

    // Refresh CubeMap sky reflection when storm band shifts
    const stormBand = Math.round(effectiveStorm * 2);
    if (stormBand !== this.lastReflectionStormBand) {
      this.lastReflectionStormBand = stormBand;
      this.updateOceanReflection();
    }

    // 4. Update wind-driven 3D rain streaks around camera
    if (this.rainIntensity > 0.03) {
      this.rainLines.visible = true;
      this.rainMat.opacity = Math.min(0.68, this.rainIntensity * 0.64);
      this.rainLines.position.copy(this.camera.position);

      const posAttr = this.rainLines.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const fallSpeed = 52 + this.stormIntensity * 34;
      const windX = 10 + this.stormIntensity * 20;
      const windZ = 6 + this.stormIntensity * 12;
      const streakLen = 2.4 + this.rainIntensity * 1.9;
      const slantScale = streakLen / fallSpeed;

      for (let i = 0; i < this.rainCount; i++) {
        const idx = i * 3;
        let rx = this.rainBaseOffsets[idx] - windX * dt;
        let ry = this.rainBaseOffsets[idx + 1] - fallSpeed * dt;
        let rz = this.rainBaseOffsets[idx + 2] - windZ * dt;

        if (ry < -28) ry += 70;
        if (rx < -65) rx += 130;
        if (rz < -65) rz += 130;

        this.rainBaseOffsets[idx] = rx;
        this.rainBaseOffsets[idx + 1] = ry;
        this.rainBaseOffsets[idx + 2] = rz;

        const vIdx = i * 6;
        arr[vIdx] = rx;
        arr[vIdx + 1] = ry;
        arr[vIdx + 2] = rz;
        arr[vIdx + 3] = rx + windX * slantScale;
        arr[vIdx + 4] = ry + streakLen;
        arr[vIdx + 5] = rz + windZ * slantScale;
      }
      posAttr.needsUpdate = true;
    } else {
      this.rainLines.visible = false;
    }
  }

  private update(dt: number, elapsed: number): void {
    this.updateWeather(dt, elapsed);

    // UE5 Shadow Cascade Anchor: follow active player cleanly on 8m grid to keep castle/palace/knight shadows crisp
    const focusPos =
      this.phase === 'skydiving' || this.phase === 'on_foot' ? this.riderPos : this.playerPos;
    const tx = Math.round(focusPos.x / 8) * 8;
    const tz = Math.round(focusPos.z / 8) * 8;
    this.sunLight.target.position.set(tx, 0, tz);
    this.sunLight.position.set(tx + 240, 175, tz - 210);

    for (const ship of this.world.pirateShips) {
      if (ship.destroyed) {
        ship.fireLight.intensity = Math.max(0, ship.fireLight.intensity - dt * 16);
        if (ship.sinkProgress < 1) {
          ship.sinkProgress = Math.min(1, ship.sinkProgress + dt * 0.28);
          ship.group.position.y = -ship.sinkProgress * 19;
          ship.group.rotation.z = ship.damageTiltZ + ship.sinkProgress * 0.82;
          ship.group.rotation.x = ship.damageTiltX + ship.sinkProgress * 0.45;
          if (Math.random() < 0.6) {
            const isFire = ship.burnLevel > 0.15 && Math.random() < 0.42;
            if (isFire) {
              this.spawnParticle(
                ship.group.position.x + (Math.random() - 0.5) * 14,
                1.4 + Math.random() * 2,
                ship.group.position.z + (Math.random() - 0.5) * 14,
                (Math.random() - 0.5) * 6,
                6 + Math.random() * 8,
                (Math.random() - 0.5) * 6,
                0xff5a00,
                0.78,
                1.8,
                5.4,
                -1.4,
                true,
              );
            } else {
              this.spawnSmoke(
                ship.group.position.x + (Math.random() - 0.5) * 14,
                1.6 + Math.random() * 2.5,
                ship.group.position.z + (Math.random() - 0.5) * 14,
                (Math.random() - 0.5) * 4,
                5.5 + Math.random() * 6,
                (Math.random() - 0.5) * 4,
                ship.burnLevel > 0.15 ? 0x262220 : 0x94a3b8,
                2.5,
                4.2,
                15.0,
                3.2,
                ship.burnLevel * 0.45,
                0.85,
              );
            }
          }
        } else {
          ship.group.visible = false;
        }
        continue;
      }

      // Active Burning Ship Fire Simulation, Hull Charring, Sail Consumption & Flickering Firelight
      if (ship.burnTimer > 0) {
        ship.burnTimer = Math.max(0, ship.burnTimer - dt);
        ship.burnLevel = Math.min(1, ship.burnLevel + dt * 0.11);

        // Burn damage over time without re-extending burnTimer
        const burnDmg = dt * (7.2 + ship.burnLevel * 6.0);
        ship.hp -= burnDmg;
        if (ship.hp <= 0) {
          this.destroyPirateShip(ship);
          continue;
        } else {
          // Snap masts progressively as fire weakens rigging
          this.checkShipMastFracture(ship);
        }

        const flicker = 0.78 + 0.22 * Math.sin(elapsed * 23 + ship.phase * 3);
        ship.fireLight.intensity = ship.burnLevel * 28 * flicker;
        ship.hullMat.color.setHex(0x5c3c28).lerp(_shipCharColor, ship.burnLevel * 0.78);
        ship.hullMat.emissive.setHex(0xff3d00);
        ship.hullMat.emissiveIntensity = ship.burnLevel * 0.52 * flicker;
        ship.sailMat.color.setHex(0xffffff).lerp(_shipCharColor, ship.burnLevel * 0.85);
        ship.sailMat.emissive.setHex(0xff5500);
        ship.sailMat.emissiveIntensity = ship.burnLevel * 0.45 * flicker;

        for (const sail of ship.sails) {
          sail.scale.y = Math.max(0.18, 1 - ship.burnLevel * 0.62);
        }

        // Dynamic flame plumes + thick curling billowing black smoke columns with warm fire underglow
        if (Math.random() < 0.85) {
          const alongZ = (Math.random() - 0.5) * 28;
          const sinY = Math.sin(ship.group.rotation.y);
          const cosY = Math.cos(ship.group.rotation.y);
          const fx = ship.group.position.x + sinY * alongZ + (Math.random() - 0.5) * 4;
          const fz = ship.group.position.z + cosY * alongZ + (Math.random() - 0.5) * 4;
          const flameY = ship.group.position.y + 4.5 + Math.random() * (9 * ship.burnLevel + 3);
          const kindRoll = Math.random();
          if (kindRoll < 0.52) {
            this.spawnParticle(
              fx,
              flameY,
              fz,
              (Math.random() - 0.5) * 5,
              8 + Math.random() * 11,
              (Math.random() - 0.5) * 5,
              kindRoll < 0.34 ? 0xff7b1a : 0xffdf7a,
              0.68,
              2.1,
              5.6,
              -2.2,
              true,
            );
          } else {
            this.spawnSmoke(
              fx,
              flameY + 1.8,
              fz,
              (Math.random() - 0.5) * 4,
              7.5 + Math.random() * 6.5,
              (Math.random() - 0.5) * 4,
              kindRoll < 0.78 ? 0x1c1917 : 0x332d2a,
              3.1,
              4.6,
              18.5,
              4.2,
              0.85,
              0.95,
            );
          }
        }
      } else if (ship.burnLevel > 0) {
        ship.burnLevel = Math.max(0, ship.burnLevel - dt * 0.08);
        ship.fireLight.intensity = ship.burnLevel * 14;
      }

      const a = ship.phase + elapsed * ship.speed;
      const nx = ship.centerX + Math.cos(a) * ship.orbitRadius;
      const nz = ship.centerZ + Math.sin(a) * ship.orbitRadius;
      const dx = -Math.sin(a) * ship.speed * ship.orbitRadius;
      const dz = Math.cos(a) * ship.speed * ship.orbitRadius;
      const dmgFraction = 1 - Math.max(0, ship.hp) / ship.maxHp;
      const waterlineDrop = dmgFraction * 2.4;
      ship.group.position.set(
        nx,
        Math.sin(elapsed * 1.4 + ship.phase) * 0.65 - waterlineDrop,
        nz,
      );
      ship.group.rotation.y = Math.atan2(-dx, -dz);
      ship.damageTiltZ = THREE.MathUtils.damp(ship.damageTiltZ, dmgFraction * 0.28, 1.5, dt);
      ship.damageTiltX = THREE.MathUtils.damp(ship.damageTiltX, dmgFraction * 0.14, 1.5, dt);
      ship.group.rotation.z = Math.sin(elapsed * 1.1 + ship.phase) * 0.045 + ship.damageTiltZ;
      ship.group.rotation.x = Math.cos(elapsed * 0.9 + ship.phase) * 0.03 + ship.damageTiltX;
    }

    for (let i = 0; i < this.world.banners.length; i++) {
      this.world.banners[i].rotation.y = Math.sin(elapsed * 3.6 + i) * 0.28;
    }
    this.world.sanctuaryRing.rotation.z = elapsed * 0.6;
    this.world.updateCitizens(elapsed);

    for (const c of this.world.cloudClusters) {
      const rate = c.isVolcanic ? 0.5 : 0.32;
      const amp = c.isVolcanic ? 4.25 : 1.85;
      c.center.y = c.baseY + Math.sin(elapsed * rate + c.driftPhase) * amp;
    }

    // Smoldering smoke plumes rising from scorched/damaged buildings
    for (const b of this.world.destructibleBuildings) {
      if (b.destroyed) continue;
      if ((b.scorchAmount > 0.1 || b.hp < b.maxHp * 0.76) && Math.random() < 0.15) {
        this.spawnSmoke(
          b.pos.x + (Math.random() - 0.5) * b.radius * 0.9,
          b.pos.y + Math.random() * b.height * 0.45,
          b.pos.z + (Math.random() - 0.5) * b.radius * 0.9,
          (Math.random() - 0.5) * 3,
          5 + Math.random() * 5,
          (Math.random() - 0.5) * 3,
          b.scorchAmount > 0.25 ? 0x24201e : 0x524c48,
          3.2,
          4.8,
          17.5,
          3.4,
          b.scorchAmount * 0.65,
          0.95,
        );
      }
    }

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastMessage = null;
    }
    if (this.knightSpeechTimer > 0) {
      this.knightSpeechTimer -= dt;
      if (this.knightSpeechTimer <= 0) {
        this.knightSpeechText = null;
      }
    }
    if (this.roarTimer > 0) this.roarTimer = Math.max(0, this.roarTimer - dt);
    if (this.talonClashTimer > 0) this.talonClashTimer = Math.max(0, this.talonClashTimer - dt);
    if (this.talonClashCooldown > 0) {
      this.talonClashCooldown = Math.max(0, this.talonClashCooldown - dt);
    }
    if (this.healBurstTimer > 0) this.healBurstTimer = Math.max(0, this.healBurstTimer - dt);
    if (this.fireCooldown > 0) this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.collisionCooldown > 0) this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    if (this.swordSwingTimer > 0) this.swordSwingTimer = Math.max(0, this.swordSwingTimer - dt);
    if (this.dangerHornCooldown > 0) this.dangerHornCooldown = Math.max(0, this.dangerHornCooldown - dt);
    if (this.dangerAlertTimer > 0) this.dangerAlertTimer = Math.max(0, this.dangerAlertTimer - dt);
    this.impactShake *= Math.exp(-8.5 * dt);

    // Advance Sanctuary Ancient Lore unlock timer (2x rate while resting/bonding inside Sanctuary)
    const maxLoreThreshold = ANCIENT_LORE_TALES[ANCIENT_LORE_TALES.length - 1].unlockSeconds;
    if (this.progression.loreElapsedSeconds < maxLoreThreshold) {
      const prevSecs = this.progression.loreElapsedSeconds;
      const rate = this.phase === 'resting' || this.phase === 'sanctuary_bond' ? 2.0 : 1.0;
      const nextSecs = Math.min(maxLoreThreshold, prevSecs + dt * rate);
      this.progression.loreElapsedSeconds = nextSecs;

      for (const tale of ANCIENT_LORE_TALES) {
        if (prevSecs < tale.unlockSeconds && nextSecs >= tale.unlockSeconds) {
          this.audio.playBondChime(0.8);
          try {
            window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(this.progression));
          } catch {
            // Ignore
          }
        }
      }
      this.loreAutosaveTimer += dt;
      if (this.loreAutosaveTimer >= 12) {
        this.loreAutosaveTimer = 0;
        try {
          window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(this.progression));
        } catch {
          // Ignore
        }
      }
    }

    // Timed War Countdown & Pirate Ship Defensive Artillery during Ship / Combined Wars
    if (
      this.mode === 'combat' &&
      this.warStatus === 'active' &&
      this.phase !== 'sanctuary_bond' &&
      this.phase !== 'resting'
    ) {
      this.warTimeLeft = Math.max(0, this.warTimeLeft - dt);
      if (this.warTimeLeft <= 0) {
        this.resolveWarOnTimerEnd();
      }
      if (this.warType === 'ships' || this.warType === 'both') {
        this.shipFireCooldown -= dt;
        if (this.shipFireCooldown <= 0 && this.phase === 'flying') {
          this.shipFireCooldown = 2.6 + Math.random() * 1.4;
          for (const ship of this.world.pirateShips) {
            if (ship.destroyed) continue;
            const dShip = ship.group.position.distanceTo(this.playerPos);
            if (dShip < 340) {
              const mesh = new THREE.Mesh(this.fireGeo, this.fireMat);
              mesh.position.copy(ship.group.position).setY(10.5);
              this.scene.add(mesh);
              _v2.copy(this.playerPos).sub(mesh.position).normalize();
              this.projectiles.push({
                mesh,
                vel: _v2.clone().multiplyScalar(135),
                element: 'fire',
                ownerTeam: 'enemy',
                life: 2.8,
                damage: 8,
                radius: 3.6,
              });
              this.triggerDirectionalDangerHorn(ship.group.position);
              break;
            }
          }
        }
      }
    }

    // Decay instantaneous VFX flash light
    this.vfxFlashPower = Math.max(0, this.vfxFlashPower - dt * 5.6);
    this.vfxFlashLight.intensity = this.vfxFlashPower * 46;

    // Update dynamic elemental breath glow light
    this.breathLightPower = Math.max(0, this.breathLightPower - dt * 5.2);
    if (this.breathLightPower > 0.01) {
      this.playerRig.mouthOrigin.getWorldPosition(_v1);
      _forward.set(0, 0, -1).applyQuaternion(this.flightQuat).normalize();
      this.dragonBreathLight.position.copy(_v1).addScaledVector(_forward, 5);
      this.dragonBreathLight.color.copy(this.breathLightColor);
      this.dragonBreathLight.intensity = this.breathLightPower * 38;
    } else {
      this.dragonBreathLight.intensity = 0;
    }

    let isSkimmingWater = false;
    let isSlicingCloud = false;

    if (this.phase === 'sanctuary_bond' || this.phase === 'resting') {
      this.updateSanctuaryState(dt, elapsed);
    } else if (this.phase === 'flying') {
      const envState = this.updateFlightState(dt, elapsed);
      isSkimmingWater = envState.isSkimmingWater;
      isSlicingCloud = envState.isSlicingCloud;
    } else if (this.phase === 'boarding') {
      this.updateBoardingState(dt, elapsed);
    } else if (this.phase === 'skydiving') {
      isSkimmingWater = this.updateSkydivingState(dt, elapsed);
    } else if (this.phase === 'on_foot') {
      this.updateOnFootState(dt, elapsed);
    }

    this.updateAiDragons(dt, elapsed);
    this.updateProjectiles(dt);
    this.updateParticles(dt);
    this.updateElemParticles(dt, elapsed);
    this.updateWaterWakes(dt, elapsed);
    this.updateSmoke(dt, elapsed);
    this.updateDebris(dt, elapsed);
    this.updateVfx(dt);
    this.breathImpactVfxTimer = Math.max(0, this.breathImpactVfxTimer - dt);
    this.updateMotionBlurAndStreaks(dt, elapsed);

    this.audio.updateAmbience(
      this.playerSpeed,
      isSkimmingWater,
      this.phase === 'flying' || this.phase === 'boarding' || this.phase === 'skydiving',
      this.rainIntensity,
      this.stormIntensity,
    );

    this.hudEmitTimer += dt;
    if (this.hudEmitTimer >= 0.05) {
      this.hudEmitTimer = 0;
      this.emitHud(isSkimmingWater, isSlicingCloud);
    }
  }

  private updateMotionBlurAndStreaks(dt: number, elapsed: number): void {
    const boosting =
      this.phase === 'flying' &&
      !this.playerCrashing &&
      (this.isBoosting ||
        this.halfLoopRemaining > 0.05 ||
        Boolean(this.keys['ShiftLeft']) ||
        Boolean(this.keys['ShiftRight']) ||
        Boolean(this.keys['KeyW']));

    let targetBlur = 0;
    if (this.phase === 'flying' && !this.playerCrashing) {
      const speedFactor = THREE.MathUtils.clamp((this.playerSpeed - 68) / 56, 0, 1);
      const diveFactor = this.diveTuckFactor * 0.78;
      const boostPulse = boosting ? 0.65 + speedFactor * 0.35 : 0;
      targetBlur = THREE.MathUtils.clamp(
        Math.max(speedFactor * 0.88, boostPulse, diveFactor),
        0,
        1,
      );
    } else if (this.phase === 'skydiving' && this.skydiveState === 'falling') {
      targetBlur = THREE.MathUtils.clamp((this.riderVel.length() - 26) / 48, 0, 0.72);
    }

    this.motionBlurIntensity = THREE.MathUtils.damp(
      this.motionBlurIntensity,
      targetBlur,
      targetBlur > this.motionBlurIntensity ? 6.5 : 4.2,
      dt,
    );
    this.boostVisualFactor = THREE.MathUtils.damp(
      this.boostVisualFactor,
      boosting ? 1 : 0,
      7.5,
      dt,
    );

    if (this.filmicPass) {
      const u = this.filmicPass.uniforms;
      u.motionBlur.value = this.motionBlurIntensity;
      u.boostFactor.value = this.boostVisualFactor;
      u.steerSmear.value = THREE.MathUtils.clamp(
        -this.smoothedHandX * this.motionBlurIntensity,
        -1,
        1,
      );
      u.vignetteStrength.value = 0.24 + this.motionBlurIntensity * 0.14;
    }

    if (this.motionBlurIntensity > 0.08 && (this.phase === 'flying' || this.phase === 'skydiving')) {
      this.speedStreakLines.visible = true;
      this.speedStreakMat.opacity = THREE.MathUtils.clamp(
        (this.motionBlurIntensity - 0.08) * (0.34 + this.boostVisualFactor * 0.24),
        0,
        0.55,
      );
      if (this.boostVisualFactor > 0.35) {
        this.speedStreakMat.color.setHex(0xffe7c4);
      } else {
        this.speedStreakMat.color.setHex(0xeaf6ff);
      }

      // Camera basis vectors in world space (zero GC)
      this.camera.updateMatrixWorld();
      const me = this.camera.matrixWorld.elements;
      _right.set(me[0], me[1], me[2]).normalize();
      _up.set(me[4], me[5], me[6]).normalize();
      _forward.set(-me[8], -me[9], -me[10]).normalize();

      const posAttr = this.speedStreakLines.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const travelRate = 1.65 + this.motionBlurIntensity * 2.1 + this.boostVisualFactor * 1.1;
      const streakLen = 3.2 + this.motionBlurIntensity * 6.8 + this.boostVisualFactor * 3.4;
      const camPos = this.camera.position;

      for (let i = 0; i < this.speedStreakCount; i++) {
        const ang = this.speedStreakSeeds[i * 4];
        const rad = this.speedStreakSeeds[i * 4 + 1] * (1.0 - this.boostVisualFactor * 0.14);
        const phase0 = this.speedStreakSeeds[i * 4 + 2];
        const mul = this.speedStreakSeeds[i * 4 + 3];

        const zProg = (phase0 + elapsed * travelRate * mul) % 1;
        // Stream from 58m ahead down to 1m behind camera
        const depth = 58 - zProg * 60;
        const spreadScale = 0.55 + (1 - zProg) * 0.65;
        const ox = Math.cos(ang) * rad * spreadScale;
        const oy = Math.sin(ang) * rad * 0.68 * spreadScale;

        _v1
          .copy(camPos)
          .addScaledVector(_forward, depth)
          .addScaledVector(_right, ox)
          .addScaledVector(_up, oy);
        _v2.copy(_v1).addScaledVector(_forward, streakLen * mul);

        const idx = i * 6;
        arr[idx] = _v1.x;
        arr[idx + 1] = _v1.y;
        arr[idx + 2] = _v1.z;
        arr[idx + 3] = _v2.x;
        arr[idx + 4] = _v2.y;
        arr[idx + 5] = _v2.z;
      }
      posAttr.needsUpdate = true;
    } else {
      this.speedStreakLines.visible = false;
      this.speedStreakMat.opacity = 0;
    }
  }

  private updateSanctuaryState(dt: number, elapsed: number): void {
    this.playerSpeed = 0;
    this.playerPos.copy(this.world.sanctuaryDragonPerch);
    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.rotation.set(0, this.playerYaw, 0, 'YXZ');
    this.playerRig.riderBodyGroup.visible = false;
    this.playerRig.leftHandGroup.visible = false;
    this.playerRig.swordArmGroup.visible = false;
    this.playerRig.leftReinStrap.visible = false;
    this.playerRig.rightReinStrap.visible = false;

    const breathe = Math.sin(elapsed * 2.1);
    const stretch = this.healBurstTimer > 0 ? Math.sin(this.healBurstTimer * Math.PI) * 0.45 : 0;
    this.playerRig.leftWingInner.rotation.set(0, 0, -0.35 + breathe * 0.04 + stretch);
    this.playerRig.leftWingOuter.rotation.set(0, 0, -0.65 - stretch * 0.4);
    this.playerRig.rightWingInner.rotation.set(0, 0, 0.35 - breathe * 0.04 - stretch);
    this.playerRig.rightWingOuter.rotation.set(0, 0, 0.65 + stretch * 0.4);

    this.playerRig.neckGroup.rotation.x =
      0.06 * breathe + (this.roarTimer > 0 ? -0.32 : 0);
    this.playerRig.jawGroup.rotation.x = this.roarTimer > 0 ? 0.55 : 0.04 + breathe * 0.02;
    this.playerRig.bodyGroup.position.set(0, breathe * 0.04, 0);
    this.playerRig.bodyGroup.rotation.set(0.05, 0, 0);
    this.playerRig.leftHindLeg.rotation.x = 0.04;
    this.playerRig.rightHindLeg.rotation.x = 0.04;
    this.playerRig.leftHindFoot.rotation.x = -0.04;
    this.playerRig.rightHindFoot.rotation.x = -0.04;

    for (let i = 0; i < this.playerRig.tailSegments.length; i++) {
      this.playerRig.tailSegments[i].rotation.y = Math.sin(elapsed * 1.4 - i * 0.5) * 0.08;
    }

    if (!this.isDraggingMouse) {
      this.sanctuaryOrbitAngle += dt * 0.16;
    }
    const camDist = 20;
    _camTargetPos.set(
      this.playerPos.x + Math.sin(this.sanctuaryOrbitAngle) * camDist,
      this.playerPos.y + 6.5,
      this.playerPos.z + Math.cos(this.sanctuaryOrbitAngle) * camDist,
    );
    this.camera.position.lerp(_camTargetPos, 1 - Math.exp(-5 * dt));
    _camLookAt.set(this.playerPos.x, this.playerPos.y + 2.2, this.playerPos.z);
    this.camera.lookAt(_camLookAt);
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 54, 4, dt);
    this.camera.updateProjectionMatrix();
  }

  private updateFlightState(
    dt: number,
    elapsed: number,
  ): { isSkimmingWater: boolean; isSlicingCloud: boolean } {
    const spec = DRAGON_SPECS[this.dragonId];
    if (this.playerCrashing) {
      return this.updatePlayerCrashingState(dt, elapsed);
    }
    this.playerRig.leftHandGroup.visible = true;
    this.playerRig.swordArmGroup.visible = true;
    this.playerRig.leftReinStrap.visible = true;
    this.playerRig.rightReinStrap.visible = true;

    // Combine Keyboard + PointerLock + Left-Side Virtual Flight Stick
    // Note: manualSteerX > 0 means push stick RIGHT -> turn right (yaw decreases)
    const keyTurn =
      (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0) -
      (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0);
    const turnInput =
      keyTurn -
      this.manualSteerX * 1.15 +
      (this.pointerLocked ? this.mouseSteerX * 1.25 : 0);

    const keyPitch =
      (this.keys['Space'] || this.keys['KeyE'] || this.keys['ArrowUp'] ? 1 : 0) -
      (this.keys['KeyC'] || this.keys['KeyQ'] || this.keys['ArrowDown'] ? 1 : 0);
    const pitchInput =
      keyPitch +
      this.manualSteerY * 1.1 +
      (this.pointerLocked ? this.mouseSteerY * 1.15 : 0);

    if (this.pointerLocked) {
      this.mouseSteerX = THREE.MathUtils.damp(this.mouseSteerX, 0, 4.5, dt);
      this.mouseSteerY = THREE.MathUtils.damp(this.mouseSteerY, 0, 4.5, dt);
    }

    // Dynamic weather aerodynamics: crosswind gusts, turbulence roll/pitch, updrafts & rain drag
    const gustX =
      (Math.sin(elapsed * 1.45) * 0.55 + Math.sin(elapsed * 3.65) * 0.45) *
      this.stormIntensity;
    const gustY =
      (Math.cos(elapsed * 1.85) * 0.6 + Math.sin(elapsed * 4.25) * 0.4) *
      this.stormIntensity;

    // Gimbal-free quaternion flight: climbing upward smoothly loops in a half-circle around itself!
    if (this.halfLoopRemaining > 0) {
      const loopStep = Math.min(this.halfLoopRemaining, 2.85 * dt);
      this.halfLoopRemaining -= loopStep;
      _qPitch.setFromAxisAngle(_unitX, loopStep);
      this.flightQuat.multiply(_qPitch);
    } else {
      const yawDelta = (turnInput * spec.turnRate + gustX * 0.24) * dt;
      const pitchDelta = (pitchInput * 1.55 + gustY * 0.16) * dt;
      _qPitch.setFromAxisAngle(_unitX, pitchDelta);
      this.flightQuat.multiply(_qPitch);
      _qYaw.setFromAxisAngle(_unitY, yawDelta);
      this.flightQuat.premultiply(_qYaw);
    }

    // Auto-upright barrel recovery when player completes an upward half-circle loop and releases climb stick
    _up.set(0, 1, 0).applyQuaternion(this.flightQuat);
    if (this.halfLoopRemaining <= 0 && _up.y < 0.35 && Math.abs(pitchInput) < 0.25) {
      const rollSign = _up.x >= 0 ? 1 : -1;
      _qRoll.setFromAxisAngle(_unitZ, rollSign * 2.85 * dt);
      this.flightQuat.multiply(_qRoll);
    }
    this.flightQuat.normalize();

    const targetRoll =
      this.knifeEdgeSide !== 0
        ? this.knifeEdgeSide * (Math.PI * 0.5)
        : THREE.MathUtils.clamp(turnInput * 0.62 + gustX * 0.26, -0.84, 0.84);
    this.playerRoll = THREE.MathUtils.damp(
      this.playerRoll,
      targetRoll,
      this.knifeEdgeSide !== 0 ? 7.8 : 5.8,
      dt,
    );

    // 1:1 Hand Synchronization: smooth rider hand pull matching steering & pitch
    const rawHandX = THREE.MathUtils.clamp(-turnInput, -1, 1);
    const rawHandY = THREE.MathUtils.clamp(pitchInput, -1, 1);
    this.smoothedHandX = THREE.MathUtils.damp(this.smoothedHandX, rawHandX, 12, dt);
    this.smoothedHandY = THREE.MathUtils.damp(this.smoothedHandY, rawHandY, 12, dt);

    const boosting =
      this.isBoosting ||
      this.halfLoopRemaining > 0 ||
      this.keys['ShiftLeft'] ||
      this.keys['ShiftRight'] ||
      this.keys['KeyW'];
    const braking = this.keys['KeyS'];

    _forward.set(0, 0, -1).applyQuaternion(this.flightQuat).normalize();
    _right.set(1, 0, 0).applyQuaternion(this.flightQuat).normalize();
    _up.set(0, 1, 0).applyQuaternion(this.flightQuat).normalize();

    // Real Newtonian Aerodynamics: Gravity + Wing Lift + Dive Wing-Tuck Boost + Thrust + Drag + Keel Damping
    const forwardSpeed = this.velocity.dot(_forward);
    const currentPitchSlope = _forward.y;

    // Aerodynamic stall: only drop nose if climbing very steeply while nearly motionless and not boosting
    if (this.halfLoopRemaining <= 0 && !boosting && forwardSpeed < 16 && currentPitchSlope > 0.58) {
      _qPitch.setFromAxisAngle(_unitX, -0.72 * dt);
      this.flightQuat.multiply(_qPitch).normalize();
      _forward.set(0, 0, -1).applyQuaternion(this.flightQuat).normalize();
      _right.set(1, 0, 0).applyQuaternion(this.flightQuat).normalize();
      _up.set(0, 1, 0).applyQuaternion(this.flightQuat).normalize();
    }

    // Smooth dive wing-tuck factor when diving downward (folds wings tightly to body & boosts speed!)
    const targetDiveTuck =
      !this.landingRequested && this.halfLoopRemaining <= 0 && currentPitchSlope < -0.15
        ? THREE.MathUtils.clamp((-currentPitchSlope - 0.15) / 0.52, 0, 1)
        : 0;
    this.diveTuckFactor = THREE.MathUtils.damp(this.diveTuckFactor, targetDiveTuck, 7.2, dt);

    // Lateral Maneuver Telemetry: Knife-Edge 90°, Sudden/Sharp Turn, Half-Loop & Steep Dive
    const turnSpike = Math.abs(turnInput - this.prevTurnInput) / Math.max(0.008, dt);
    this.prevTurnInput = turnInput;
    const absTurn = Math.abs(turnInput);
    const absRoll = Math.abs(this.playerRoll);

    if (this.knifeEdgeSide !== 0 || absRoll > 1.05) {
      this.maneuverKind = 'knife_edge';
      const rollSide = this.knifeEdgeSide !== 0 ? this.knifeEdgeSide : this.playerRoll >= 0 ? 1 : -1;
      this.maneuverSide = rollSide > 0 ? -1 : 1;
      this.maneuverIntensity = THREE.MathUtils.clamp(absRoll / (Math.PI * 0.5), 0.72, 1);
      this.maneuverFlashTimer = Math.max(this.maneuverFlashTimer, 0.22);
    } else if (this.halfLoopRemaining > 0.08) {
      this.maneuverKind = 'half_loop';
      this.maneuverSide = 0;
      this.maneuverIntensity = 1;
      this.maneuverFlashTimer = Math.max(this.maneuverFlashTimer, 0.24);
    } else if (
      absTurn > 0.54 ||
      absRoll > 0.42 ||
      (turnSpike > 3.0 && absTurn > 0.3)
    ) {
      const sideFromInput: -1 | 1 =
        absTurn > 0.22 ? (turnInput > 0 ? -1 : 1) : this.playerRoll >= 0 ? -1 : 1;
      this.maneuverKind = 'sharp_turn';
      this.maneuverSide = sideFromInput;
      this.maneuverIntensity = THREE.MathUtils.clamp(
        Math.max(absTurn, absRoll / 0.84, Math.min(1, turnSpike / 7.5)),
        0.48,
        1,
      );
      this.maneuverFlashTimer = Math.max(this.maneuverFlashTimer, 0.4);
    } else if (this.diveTuckFactor > 0.52) {
      this.maneuverKind = 'steep_dive';
      this.maneuverSide = 0;
      this.maneuverIntensity = THREE.MathUtils.clamp(this.diveTuckFactor, 0.52, 1);
      this.maneuverFlashTimer = Math.max(this.maneuverFlashTimer, 0.2);
    } else {
      this.maneuverFlashTimer = Math.max(0, this.maneuverFlashTimer - dt);
      if (this.maneuverFlashTimer <= 0.01) {
        this.maneuverKind = 'none';
        this.maneuverSide = 0;
        this.maneuverIntensity = 0;
      } else {
        this.maneuverIntensity = THREE.MathUtils.damp(this.maneuverIntensity, 0, 8, dt);
      }
    }

    // 1. Gravity (amplified when wings are tucked cleanly into a dive)
    this.velocity.y -= (22.0 + 16.5 * this.diveTuckFactor) * dt;

    // 2. Wing Lift along local UP (scales smoothly down when wings are folded for a dive)
    const uprightFactor = Math.max(0, _up.y);
    const wingOpenLift = 1 - this.diveTuckFactor * 0.65;
    const baseLift =
      Math.min(31.5, Math.max(0, forwardSpeed * 0.52)) *
      (0.42 + 0.58 * uprightFactor) *
      wingOpenLift;
    const loopLift = this.halfLoopRemaining > 0 ? 18.0 : 0;
    this.velocity.addScaledVector(_up, (baseLift + loopLift) * dt);

    // 3. Thrust + High-Speed Dive Tuck Acceleration + Climb Reserve
    const wingSpeedBonus = this.progression.dragonUpgrades.wings * 6.5;
    const climbReserve = currentPitchSlope > 0.15 ? 14.0 * currentPitchSlope : 0;
    const diveDrive = 48.0 * this.diveTuckFactor;
    const thrustAccel =
      (boosting
        ? (spec.baseSpeed + wingSpeedBonus) * 1.24
        : braking
          ? (spec.baseSpeed + wingSpeedBonus) * 0.14
          : (spec.baseSpeed + wingSpeedBonus) * 0.72) +
      climbReserve +
      diveDrive;
    this.velocity.addScaledVector(_forward, thrustAccel * dt);

    // 4. Quadratic aerodynamic air resistance (dramatically lower drag while wings are tucked into body!)
    const curSpeed = this.velocity.length();
    const dragCoeff =
      0.0082 *
      (1 + this.rainIntensity * 0.28) *
      (braking ? 1.85 : 1.0) *
      (1 - 0.54 * this.diveTuckFactor);
    this.velocity.addScaledVector(this.velocity, -dragCoeff * curSpeed * dt);

    // 5. Weathercock / Wing-Keel Side-Slip Damping (banking carves curved turns with real inertia)
    const sideSlip = this.velocity.dot(_right);
    this.velocity.addScaledVector(_right, -sideSlip * (1 - Math.exp(-4.2 * dt)));

    // 6. Storm crosswind & vertical turbulence forces
    if (this.stormIntensity > 0.04) {
      this.velocity.x -= gustX * 14.0 * dt;
      this.velocity.y += gustY * 11.5 * dt;
    }

    // Expressive Dragon Roars during active flight, boost bursts & high-speed dives
    if (curSpeed > 28) {
      this.movementRoarTimer -= dt * (boosting ? 1.65 : this.diveTuckFactor > 0.45 ? 1.5 : 0.95);
      if ((boosting && !this.wasBoosting && this.movementRoarTimer < 2.2) || this.movementRoarTimer <= 0) {
        const roarEnergy = Math.min(1, curSpeed / 95 + this.diveTuckFactor * 0.35 + (boosting ? 0.25 : 0));
        this.audio.playMovementRoar(this.activeElement, roarEnergy);
        this.roarTimer = Math.max(this.roarTimer, 0.52);
        this.movementRoarTimer = 4.2 + Math.random() * 4.4;
      }
    }
    this.wasBoosting = boosting;

    // Integrate real world position
    this.playerPos.addScaledVector(this.velocity, dt);

    // Soft aerodynamic windwall boundary at expanded 5600m open-world edge (2550m radius)
    const distFromOrigin = Math.hypot(this.playerPos.x, this.playerPos.z);
    if (distFromOrigin > 2550) {
      const pull = (distFromOrigin - 2550) / 120;
      _v1.set(-this.playerPos.x, 0, -this.playerPos.z).normalize();
      this.velocity.addScaledVector(_v1, pull * 45 * dt);
      this.playerPos.x = THREE.MathUtils.lerp(this.playerPos.x, 0, pull * dt * 0.25);
      this.playerPos.z = THREE.MathUtils.lerp(this.playerPos.z, 0, pull * dt * 0.25);
    }

    // 7. Real Destructible Ramming Physics (Buildings, Golden Beach Palm Trees, Pirate Ships)
    for (const tree of this.world.destructibleTrees) {
      if (tree.destroyed) continue;
      const dx = this.playerPos.x - tree.pos.x;
      const dz = this.playerPos.z - tree.pos.z;
      if (
        dx * dx + dz * dz < (tree.radius + 3.4) * (tree.radius + 3.4) &&
        this.playerPos.y > tree.pos.y - 2 &&
        this.playerPos.y < tree.pos.y + tree.height + 2.5
      ) {
        this.destroyTree(tree);
        this.velocity.multiplyScalar(0.9);
      }
    }

    if (this.collisionCooldown <= 0) {
      for (const b of this.world.destructibleBuildings) {
        if (b.destroyed) continue;
        const dx = this.playerPos.x - b.pos.x;
        const dz = this.playerPos.z - b.pos.z;
        const hitR = b.radius + 3.6;
        if (
          dx * dx + dz * dz < hitR * hitR &&
          Math.abs(this.playerPos.y - b.pos.y) < b.height * 0.56 + 3.5
        ) {
          const ramSpeed = this.velocity.length();
          const ramDmg = 34 + ramSpeed * 0.95;
          this.damageBuilding(b, ramDmg, true, this.velocity, 'ram');
          if (b.destroyed && ramSpeed >= 42) {
            this.velocity.multiplyScalar(0.65);
          } else {
            _normal.set(dx, (this.playerPos.y - b.pos.y) * 0.35, dz).normalize();
            const vn = this.velocity.dot(_normal);
            if (vn < 0) {
              this.velocity.addScaledVector(_normal, -1.48 * vn);
              this.velocity.multiplyScalar(0.56);
            }
            this.playerPos.x = b.pos.x + _normal.x * (hitR + 0.6);
            this.playerPos.z = b.pos.z + _normal.z * (hitR + 0.6);
            this.hp = Math.max(8, this.hp - 6);
            this.woundsCount = Math.min(5, this.woundsCount + 1);
            this.impactShake = Math.max(this.impactShake, 0.72);
            this.audio.playCrash('stone', false);
          }
          this.collisionCooldown = 0.25;
          break;
        }
      }
    }

    if (this.collisionCooldown <= 0) {
      for (const ship of this.world.pirateShips) {
        if (ship.destroyed) continue;
        const sp = ship.group.position;
        const dx = this.playerPos.x - sp.x;
        const dz = this.playerPos.z - sp.z;
        if (dx * dx + dz * dz < 19 * 19 && this.playerPos.y < 23 && this.playerPos.y > -2) {
          const ramSpeed = this.velocity.length();
          this.damageShip(ship, 42 + ramSpeed * 0.9, 'ram', this.velocity);
          if (ship.destroyed) {
            this.velocity.multiplyScalar(0.75);
          } else {
            _normal.set(dx, 8, dz).normalize();
            const vn = this.velocity.dot(_normal);
            if (vn < 0) {
              this.velocity.addScaledVector(_normal, -1.35 * vn);
              this.velocity.multiplyScalar(0.68);
            }
            this.velocity.y = Math.max(this.velocity.y, 13);
            this.impactShake = Math.max(this.impactShake, 0.58);
            this.audio.playCrash('wood', false);
          }
          this.collisionCooldown = 0.28;
          break;
        }
      }
    }

    // 7b. Narrow Vertical Canyon Needle Pillar Collisions (90° knife-edge roll reduces wingspan profile cleanly!)
    if (this.collisionCooldown <= 0) {
      const wingHalfWidth = 3.2 + Math.abs(Math.cos(this.playerRoll)) * 9.5;
      for (const np of this.world.narrowPillars) {
        if (Math.abs(this.playerPos.y - np.y) > np.height * 0.5 + 3) continue;
        const dx = this.playerPos.x - np.x;
        const dz = this.playerPos.z - np.z;
        const minGap = np.radius + wingHalfWidth;
        if (dx * dx + dz * dz < minGap * minGap) {
          _normal.set(dx, 0, dz).normalize();
          const vn = this.velocity.dot(_normal);
          if (vn < 0) {
            this.velocity.addScaledVector(_normal, -1.38 * vn);
            this.velocity.multiplyScalar(0.66);
          }
          this.playerPos.x = np.x + _normal.x * (minGap + 0.5);
          this.playerPos.z = np.z + _normal.z * (minGap + 0.5);
          this.impactShake = Math.max(this.impactShake, 0.52);
          this.audio.playCrash('stone', false);
          this.collisionCooldown = 0.24;
          break;
        }
      }
    }

    // 7c. Close-Range Aerial Talon Grapple & Foot Clash with Enemy Dragons (يصيبه أو يصاب)
    let nearestTalonEnemyDist = Infinity;
    for (const ai of this.aiDragons) {
      if (!ai.alive || ai.team !== 'enemy' || !ai.rig.root.visible) continue;
      const dist = this.playerPos.distanceTo(ai.pos);
      if (dist < nearestTalonEnemyDist) {
        nearestTalonEnemyDist = dist;
      }
      if (dist < 12.2 && this.talonClashCooldown <= 0) {
        this.talonClashCooldown = 1.05;
        this.talonClashTimer = 0.68;
        ai.clashTimer = 0.68;

        const playerAdvantage =
          (curSpeed - ai.speed) * 0.45 +
          (this.playerPos.y - ai.pos.y) * 0.85 +
          this.diveTuckFactor * 28 +
          (boosting ? 14 : 0) +
          this.progression.knightUpgrades.sword * 5 +
          (ai.frozenTimer > 0 ? 45 : 0) +
          (Math.random() - 0.44) * 26;

        let dmgToEnemy = 0;
        let dmgToPlayer = 0;
        if (playerAdvantage >= 4) {
          // Player overpowers with crushing talon strike
          dmgToEnemy = Math.round(24 + Math.min(24, playerAdvantage * 0.55) + this.progression.dragonUpgrades.breath * 3);
          dmgToPlayer = ai.frozenTimer > 0 ? 0 : Math.round(Math.random() * 5);
        } else if (playerAdvantage <= -10) {
          // Rival dragon slashes player sharply in the grapple
          dmgToPlayer = Math.round(10 + Math.random() * 7);
          dmgToEnemy = Math.round(8 + Math.random() * 6);
        } else {
          // Fierce mutual mid-air talon brawl — both dragons wound each other
          dmgToEnemy = Math.round(16 + Math.random() * 10);
          dmgToPlayer = Math.round(7 + Math.random() * 6);
        }

        const armorMul = Math.max(0.45, 1 - this.progression.knightUpgrades.armor * 0.1);
        const finalPlayerDmg = Math.round(dmgToPlayer * armorMul);

        // Midpoint talon clash VFX & directional recoil
        _v2.copy(this.playerPos).add(ai.pos).multiplyScalar(0.5);
        _normal.copy(this.playerPos).sub(ai.pos);
        if (_normal.lengthSq() > 0.01) {
          _normal.normalize();
        } else {
          _normal.set(0, 1, 0);
        }

        this.spawnElementalCollisionBurst(_v2, _normal, this.activeElement, 0.9, true);
        this.audio.playCrash('flesh', true);
        this.audio.playSwordHit();
        this.audio.playRoar(this.activeElement, 0.92, 0.85);
        this.audio.speakKnight('battle_cry');
        this.roarTimer = 0.72;
        this.impactShake = Math.max(this.impactShake, finalPlayerDmg > 6 ? 0.82 : 0.52);

        // Elastic recoil push apart after talon strike
        this.playerPos.addScaledVector(_normal, 3.8);
        ai.pos.addScaledVector(_normal, -3.8);
        this.velocity.addScaledVector(_normal, 22);
        this.velocity.y = Math.max(this.velocity.y, 8);

        if (dmgToEnemy > 0) {
          ai.hp -= dmgToEnemy;
          if (ai.hp <= 0) {
            this.killEnemyDragon(ai, false);
          }
        }
        if (finalPlayerDmg > 0) {
          this.hp = Math.max(0, this.hp - finalPlayerDmg);
          this.woundsCount = Math.min(5, this.woundsCount + 1);
          if (this.hp <= 0) {
            this.playerCrashing = true;
            this.playerCrashTimer = 0;
            this.audio.playRoar(DRAGON_SPECS[this.dragonId].element);
            this.audio.playFallWhoosh(1.65);
          }
        }
        break;
      }
    }

    // 8. Active Safe Landing Descent (flaring cleanly onto hind feet) OR Terrain Slope & Ocean Physics
    const walkableY = this.world.getWalkableGroundHeight(this.playerPos.x, this.playerPos.z);
    if (this.landingRequested) {
      if (walkableY < -0.2) {
        // Guide gently toward closest walkable shore/biome if over open sea
        const shoreTargets = [
          [-640, 580],
          [820, -480],
          [-880, -60],
          [720, 560],
          [940, 90],
          [120, -940],
          [-480, -560],
          [-1520, -1500],
          [-1600, 1220],
        ];
        let bestTarget = shoreTargets[0];
        let bestD = Infinity;
        for (const st of shoreTargets) {
          const d = Math.hypot(this.playerPos.x - st[0], this.playerPos.z - st[1]);
          if (d < bestD) {
            bestD = d;
            bestTarget = st;
          }
        }
        _v1.set(bestTarget[0] - this.playerPos.x, 0, bestTarget[1] - this.playerPos.z).normalize();
        this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, _v1.x * 46, 2.2 * dt);
        this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, _v1.z * 46, 2.2 * dt);
        this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, 16 - this.playerPos.y, 2 * dt);
      } else {
        // Gentle nose-up landing flare so hind legs & talons clearly catch the earth
        if (_forward.y < 0.16) {
          _qPitch.setFromAxisAngle(_unitX, 1.45 * dt);
          this.flightQuat.multiply(_qPitch).normalize();
          _forward.set(0, 0, -1).applyQuaternion(this.flightQuat).normalize();
        }
        this.velocity.x *= Math.exp(-1.9 * dt);
        this.velocity.z *= Math.exp(-1.9 * dt);
        const distAbove = Math.max(0, this.playerPos.y - walkableY);
        const targetSink = distAbove < 14 ? -12 : -22;
        this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, targetSink, 3.8 * dt);
        if (this.playerPos.y <= walkableY + 4.2) {
          this.completeDragonTouchdown(walkableY);
          return { isSkimmingWater: false, isSlicingCloud: false };
        }
      }
    }

    const groundY = getTerrainHeight(this.playerPos.x, this.playerPos.z);
    const overWater = groundY < -0.5;
    const minFlightY = overWater ? 1.8 : Math.max(groundY, walkableY) + 4.15;
    if (overWater && this.playerPos.y < 3.6) {
      // Physical hydrodynamic surface cushion & gentle spray drag when brushing ocean crests
      const depthFrac = THREE.MathUtils.clamp((3.6 - this.playerPos.y) / 1.8, 0, 1);
      this.velocity.y += depthFrac * 9.5 * dt;
      this.velocity.multiplyScalar(1 - 0.14 * depthFrac * dt);
      this.impactShake = Math.max(this.impactShake, 0.07 * depthFrac);
    }
    if (this.playerPos.y < minFlightY) {
      if (overWater) {
        if (this.velocity.y < -12) {
          this.velocity.y = Math.abs(this.velocity.y) * 0.42 + 8;
          this.velocity.x *= 0.72;
          this.velocity.z *= 0.72;
          this.impactShake = Math.max(this.impactShake, 0.45);
          this.audio.playCrash('water', true);
          this.spawnWaterWake(this.playerPos.x, this.playerPos.z, 0, 0, 1.3, 4.5, 28, 0, 1);
          this.spawnWaterWake(this.playerPos.x - 4, this.playerPos.z, -_forward.z * 3, _forward.x * 3, 1.6, 4.0, 18, 1, 1);
          this.spawnWaterWake(this.playerPos.x + 4, this.playerPos.z, _forward.z * 3, -_forward.x * 3, 1.6, 4.0, 18, 1, -1);
          for (let k = 0; k < 18; k++) {
            this.spawnElemParticle(
              this.playerPos.x + (Math.random() - 0.5) * 6,
              0.7,
              this.playerPos.z + (Math.random() - 0.5) * 6,
              (Math.random() - 0.5) * 22,
              12 + Math.random() * 16,
              (Math.random() - 0.5) * 22,
              0xffffff,
              0x7dd3fc,
              0.65 + Math.random() * 0.35,
              1.6,
              4.8,
              24,
              1.2,
              2,
            );
          }
        } else {
          this.velocity.y = Math.max(0, this.velocity.y);
        }
        this.playerPos.y = minFlightY;
      } else {
        const hL = getTerrainHeight(this.playerPos.x - 1.8, this.playerPos.z);
        const hR = getTerrainHeight(this.playerPos.x + 1.8, this.playerPos.z);
        const hD = getTerrainHeight(this.playerPos.x, this.playerPos.z - 1.8);
        const hU = getTerrainHeight(this.playerPos.x, this.playerPos.z + 1.8);
        _normal.set(hL - hR, 3.6, hD - hU).normalize();

        this.playerPos.y = minFlightY;
        const vn = this.velocity.dot(_normal);
        if (vn < -10) {
          // Physical Mountain / Terrain Crater Deformation + Rock Shards Debris Shower!
          const impactForce = -vn;
          const craterR = Math.min(30, 14 + impactForce * 0.36);
          const craterD = Math.min(11.5, 2.6 + impactForce * 0.18);
          this.world.deformTerrain(this.playerPos.x, this.playerPos.z, craterR, craterD, 0.42);
          _v2.set(this.playerPos.x, groundY + 1.4, this.playerPos.z);
          this.spawnDebris(
            _v2,
            12,
            'stone',
            Math.min(34, 14 + impactForce * 0.42),
            0.95,
            this.velocity,
          );

          this.velocity.addScaledVector(_normal, -1.45 * vn);
          this.velocity.multiplyScalar(0.68);
          this.audio.playCrash('stone', vn < -28);
          this.impactShake = Math.max(this.impactShake, Math.min(0.85, -vn * 0.024));
          for (let k = 0; k < 12; k++) {
            this.spawnSmoke(
              this.playerPos.x + (Math.random() - 0.5) * 6,
              groundY + 1.0,
              this.playerPos.z + (Math.random() - 0.5) * 6,
              (Math.random() - 0.5) * 18,
              3 + Math.random() * 8,
              (Math.random() - 0.5) * 18,
              0x8f7e68,
              1.4,
              3.4,
              12.0,
              1.6,
              0,
              0.6,
            );
          }
          if (vn < -26) {
            this.hp = Math.max(8, this.hp - 8);
            this.woundsCount = Math.min(5, this.woundsCount + 1);
          }
        } else {
          this.velocity.y = Math.max(0, this.velocity.y);
        }
        if (_forward.y < 0.08) {
          _qPitch.setFromAxisAngle(_unitX, 2.3 * dt);
          this.flightQuat.multiply(_qPitch).normalize();
        }
      }
    }
    // Ultra-high-altitude sky ceiling (up to 920m above sea level with thin-air cushion)
    if (this.playerPos.y > 850) {
      const overFrac = (this.playerPos.y - 850) / 70;
      this.velocity.y -= overFrac * 24 * dt;
    }
    if (this.playerPos.y > 920) {
      this.playerPos.y = 920;
      this.velocity.y = Math.min(0, this.velocity.y);
    }

    this.playerSpeed = this.velocity.length();
    const pitchSlope = _forward.y;

    _qRoll.setFromAxisAngle(_unitZ, this.playerRoll);
    _finalQuat.copy(this.flightQuat).multiply(_qRoll);

    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.quaternion.copy(_finalQuat);

    // Wingbeat & Aerodynamic Dive Wing-Fold Kinematics
    const flapSpeed = this.landingRequested
      ? 10.2
      : this.diveTuckFactor > 0.35
        ? 1.8
        : pitchSlope > 0.1 || boosting
          ? 9.2
          : 5.6;
    this.wingPhase += dt * flapSpeed;
    const flap = Math.sin(this.wingPhase);
    const sign = flap >= 0 ? 1 : -1;
    if (sign !== this.lastWingSign && sign < 0 && flapSpeed > 4.2 && this.diveTuckFactor < 0.55) {
      this.audio.playWingbeat();
    }
    this.lastWingSign = sign;

    const baseFlapAmp = this.landingRequested
      ? 0.54
      : this.knifeEdgeSide !== 0
        ? 0.24
        : 0.46;
    const flapAmp = baseFlapAmp * (1 - this.diveTuckFactor * 0.92);
    const wingTuck = this.knifeEdgeSide !== 0 ? 0.34 : 0;

    // Sweeping wings tightly backward & down against flanks during steep dives
    const diveSweepInnerY = 0.98 * this.diveTuckFactor;
    const diveSweepOuterY = 0.34 * this.diveTuckFactor;
    const diveHugZ = 0.24 * this.diveTuckFactor;
    const diveOuterFoldZ = 0.55 * this.diveTuckFactor;

    this.playerRig.leftWingInner.rotation.y = diveSweepInnerY;
    this.playerRig.leftWingOuter.rotation.y = diveSweepOuterY;
    this.playerRig.rightWingInner.rotation.y = -diveSweepInnerY;
    this.playerRig.rightWingOuter.rotation.y = -diveSweepOuterY;

    this.playerRig.leftWingInner.rotation.z = flap * flapAmp - wingTuck + diveHugZ;
    this.playerRig.leftWingOuter.rotation.z =
      Math.sin(this.wingPhase - 0.65) * flapAmp * 0.9 - wingTuck * 0.4 - diveOuterFoldZ;
    this.playerRig.rightWingInner.rotation.z = -flap * flapAmp + wingTuck - diveHugZ;
    this.playerRig.rightWingOuter.rotation.z =
      -Math.sin(this.wingPhase - 0.65) * flapAmp * 0.9 + wingTuck * 0.4 + diveOuterFoldZ;

    // Prominent Hind Leg & Talon Pose: clearly lowered & extended during landing OR lunging in aerial talon clash!
    const nearLandingGround =
      walkableY >= -0.2 && this.playerPos.y - walkableY < 16 && this.velocity.y < 6;
    const targetLegExtend = this.landingRequested || nearLandingGround ? 1 : 0;
    this.landingLegExtend = THREE.MathUtils.damp(this.landingLegExtend, targetLegExtend, 6.5, dt);

    const talonReady = nearestTalonEnemyDist < 22 ? 1 - THREE.MathUtils.smoothstep(nearestTalonEnemyDist, 10, 22) : 0;
    const clashSwing =
      this.talonClashTimer > 0
        ? Math.sin(elapsed * 28) * 0.34
        : talonReady * Math.sin(elapsed * 14) * 0.14;

    const baseFlightLegX = 0.56;
    const landedDropLegX = 0.02;
    const clashLungeLegX = -0.78;
    const clashBlend =
      this.talonClashTimer > 0 ? 1 : talonReady > 0.05 ? talonReady * 0.85 : 0;
    let legX = THREE.MathUtils.lerp(baseFlightLegX, landedDropLegX, this.landingLegExtend);
    if (clashBlend > 0) {
      legX = THREE.MathUtils.lerp(legX, clashLungeLegX, clashBlend);
    }

    this.playerRig.leftHindLeg.rotation.x = legX + flap * 0.08 * (1 - this.landingLegExtend) + clashSwing;
    this.playerRig.rightHindLeg.rotation.x = legX - flap * 0.08 * (1 - this.landingLegExtend) - clashSwing;
    let footX = THREE.MathUtils.lerp(0.48, 0.0, this.landingLegExtend);
    if (clashBlend > 0) {
      footX = THREE.MathUtils.lerp(footX, -0.18, clashBlend);
    }
    this.playerRig.leftHindFoot.rotation.x = footX;
    this.playerRig.rightHindFoot.rotation.x = footX;

    // Synchronize Rider Hands, Leather Reins, and Dragon Neck with Hand Motion!
    const bob = Math.sin(this.wingPhase) * 0.04;
    this.playerRig.leftHandGroup.position.set(
      -0.62 + this.smoothedHandX * 0.18,
      2.36 + this.smoothedHandY * 0.14 + bob,
      -0.92 + (this.smoothedHandX < 0 ? 0.16 : -0.04),
    );
    this.playerRig.leftHandGroup.rotation.set(
      this.smoothedHandY * 0.35,
      -this.smoothedHandX * 0.3,
      -this.smoothedHandX * 0.45,
    );

    // Reins dynamically flex with hand pull & neck turn
    this.playerRig.leftReinStrap.position.set(
      -0.66 + this.smoothedHandX * 0.1,
      2.02 + this.smoothedHandY * 0.08 + bob * 0.5,
      -2.22,
    );
    this.playerRig.leftReinStrap.rotation.y = -this.smoothedHandX * 0.14;
    this.playerRig.rightReinStrap.position.set(
      0.66 + this.smoothedHandX * 0.1,
      2.02 + this.smoothedHandY * 0.08 + bob * 0.5,
      -2.22,
    );
    this.playerRig.rightReinStrap.rotation.y = -this.smoothedHandX * 0.14;

    // Right Sword Hand: lifelike grip sway, turn lean, AND full sweeping 3D sword slash arc!
    const fireLift = this.isFiring ? 0.14 : 0;
    const slashProgress = this.swordSwingTimer > 0 ? 1 - this.swordSwingTimer / 0.38 : 0;
    const slashArc = Math.sin(slashProgress * Math.PI);
    this.playerRig.swordArmGroup.position.set(
      0.88 + this.smoothedHandX * 0.16 - slashArc * 0.68,
      2.3 + this.smoothedHandY * 0.12 + bob + fireLift + slashArc * 0.28,
      -0.92 - fireLift * 0.45 - slashArc * 0.56,
    );
    this.playerRig.swordArmGroup.rotation.set(
      0.22 + this.smoothedHandY * 0.25 - fireLift - slashArc * 1.38,
      0.1 - this.smoothedHandX * 0.25 + slashArc * 0.72,
      -0.35 - this.smoothedHandX * 0.35 + slashArc * 1.15,
    );

    if (this.isFiring && this.energy > 1) {
      this.jawOpenAmount = THREE.MathUtils.damp(this.jawOpenAmount, 0.54, 12, dt);
    } else if (this.roarTimer > 0) {
      this.jawOpenAmount = THREE.MathUtils.damp(this.jawOpenAmount, 0.62, 12, dt);
    } else {
      this.jawOpenAmount = THREE.MathUtils.damp(this.jawOpenAmount, 0.05, 8, dt);
    }
    this.playerRig.jawGroup.rotation.x = this.jawOpenAmount;
    this.playerRig.neckGroup.rotation.y = THREE.MathUtils.damp(
      this.playerRig.neckGroup.rotation.y,
      -this.smoothedHandX * 0.24,
      8,
      dt,
    );
    this.playerRig.neckGroup.rotation.x = THREE.MathUtils.damp(
      this.playerRig.neckGroup.rotation.x,
      this.smoothedHandY * 0.16,
      8,
      dt,
    );

    for (let i = 0; i < this.playerRig.tailSegments.length; i++) {
      this.playerRig.tailSegments[i].rotation.y =
        Math.sin(elapsed * 4.5 - i * 0.6) * 0.09 + turnInput * 0.05;
      this.playerRig.tailSegments[i].rotation.x = Math.cos(elapsed * 3.8 - i * 0.5) * 0.05;
    }

    const energyRegen = 7.8 + this.progression.knightUpgrades.spirit * 2.2;
    this.energy = Math.min(this.maxEnergy, this.energy + dt * energyRegen);

    if (this.isFiring) {
      this.fireElementalBreath();
    }

    // Camera Perspective: Full Dragon 3rd-Person View vs 1st-Person Rider View
    this.playerRig.root.updateMatrixWorld(true);
    const shakeAmp =
      this.lightningPower * 0.16 + this.stormIntensity * 0.035 + this.impactShake;
    if (this.cameraView === 'full') {
      this.playerRig.riderBodyGroup.visible = true;
      this.playerRig.capeMesh.rotation.x =
        1.18 + Math.sin(elapsed * 15) * 0.14 + (boosting ? 0.18 : 0);

      _up.set(0, 1, 0).applyQuaternion(this.flightQuat).normalize();
      const followDist = 21.5 + (boosting ? 3.2 : 0) + this.diveTuckFactor * 2.2;
      const chaseUp = 6.8 - this.landingLegExtend * 2.2;
      _camTargetPos
        .copy(this.playerPos)
        .addScaledVector(_forward, -followDist)
        .addScaledVector(_up, chaseUp);

      const camGnd = getTerrainHeight(_camTargetPos.x, _camTargetPos.z);
      if (_up.y > 0.2) {
        _camTargetPos.y = Math.max(_camTargetPos.y, Math.max(2.4, camGnd + 2.6));
      }
      _camTargetPos.x += Math.sin(elapsed * 43) * shakeAmp;
      _camTargetPos.y += Math.cos(elapsed * 37) * shakeAmp;

      // Subtle tilt on full chase camera during 90° knife-edge flight so horizon remains legible
      _qRoll.setFromAxisAngle(_unitZ, this.playerRoll * 0.22);
      _quatA.copy(this.flightQuat).multiply(_qRoll);
      _up.set(0, 1, 0).applyQuaternion(_quatA).normalize();

      this.camera.position.lerp(_camTargetPos, 1 - Math.exp(-10.5 * dt));
      this.dampCameraUp(_up, 6.5, dt);
      _camLookAt.copy(this.playerPos).addScaledVector(_forward, 26).addScaledVector(_up, 1.4 - this.landingLegExtend * 0.8);
      this.camera.lookAt(_camLookAt);
    } else {
      this.playerRig.riderBodyGroup.visible = false;
      this.playerRig.riderCameraAnchor.getWorldPosition(_camTargetPos);
      _camTargetPos.x += Math.sin(elapsed * 43) * shakeAmp;
      _camTargetPos.y += Math.sin(this.wingPhase) * 0.07 + Math.cos(elapsed * 37) * shakeAmp;
      this.camera.position.copy(_camTargetPos);

      _camLookAt.copy(_camTargetPos).addScaledVector(_forward, 45);
      _up.set(0, 1, 0).applyQuaternion(_finalQuat);
      this.dampCameraUp(_up, 10, dt);
      this.camera.lookAt(_camLookAt);
    }

    const targetFov = THREE.MathUtils.clamp(
      64 + (this.playerSpeed - 45) * 0.36 + this.diveTuckFactor * 6,
      62,
      92,
    );
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 5, dt);
    this.camera.updateProjectionMatrix();

    this.playerRig.leftWingTip.getWorldPosition(_v1);
    this.playerRig.rightWingTip.getWorldPosition(_v2);

    const leftOverWater = getTerrainHeight(_v1.x, _v1.z) < -0.5;
    const rightOverWater = getTerrainHeight(_v2.x, _v2.z) < -0.5;
    const leftSkim = leftOverWater && _v1.y < 8.4 && _v1.y > -2;
    const rightSkim = rightOverWater && _v2.y < 8.4 && _v2.y > -2;
    const bodySkim = overWater && this.playerPos.y < 10.5;
    const isSkimmingWater = leftSkim || rightSkim || bodySkim;

    // Continuous hydrodynamic ocean wake & vortex interaction when approaching/skimming water
    const bodyProx = overWater
      ? THREE.MathUtils.clamp((18.5 - Math.max(0, this.playerPos.y)) / 12.5, 0, 1)
      : 0;
    const leftProx = leftOverWater
      ? THREE.MathUtils.clamp((11.5 - Math.max(0, _v1.y)) / 8.0, 0, 1)
      : 0;
    const rightProx = rightOverWater
      ? THREE.MathUtils.clamp((11.5 - Math.max(0, _v2.y)) / 8.0, 0, 1)
      : 0;
    const targetWake = Math.max(bodyProx, leftProx * 0.85, rightProx * 0.85);
    this.oceanWakeIntensity = THREE.MathUtils.damp(
      this.oceanWakeIntensity,
      targetWake,
      targetWake > this.oceanWakeIntensity ? 7.0 : 2.6,
      dt,
    );
    if (targetWake > 0.04) {
      this.oceanWakePosXZ.set(this.playerPos.x, this.playerPos.z);
      const hLen = Math.hypot(_forward.x, _forward.z);
      if (hLen > 0.05) {
        this.oceanWakeDirXZ.set(_forward.x / hLen, _forward.z / hLen);
      }

      this.wakeTrailDropTimer -= dt;
      if (this.wakeTrailDropTimer <= 0) {
        this.wakeTrailDropTimer = 0.14;
        const shader = this.world.oceanMaterial.userData.shader;
        if (shader?.uniforms?.uWakeTrail?.value) {
          const trail = shader.uniforms.uWakeTrail.value as THREE.Vector4[];
          trail[this.wakeTrailCursor].set(
            this.playerPos.x,
            this.playerPos.z,
            0,
            THREE.MathUtils.clamp(targetWake, 0.25, 1),
          );
          this.wakeTrailCursor = (this.wakeTrailCursor + 1) % trail.length;
        }
      }

      this.wakeVortexSpawnTimer -= dt;
      if (this.wakeVortexSpawnTimer <= 0) {
        this.wakeVortexSpawnTimer = isSkimmingWater ? 0.045 : 0.095;
        const fwdX = this.oceanWakeDirXZ.x;
        const fwdZ = this.oceanWakeDirXZ.y;
        const latX = -fwdZ;
        const latZ = fwdX;
        const speedMul = THREE.MathUtils.clamp(this.playerSpeed / 65, 0.65, 1.5);

        // Center expanding wave wake following dragon flight path
        this.spawnWaterWake(
          this.playerPos.x - fwdX * 3.5,
          this.playerPos.z - fwdZ * 3.5,
          -fwdX * 3.2,
          -fwdZ * 3.2,
          1.25 + targetWake * 0.55,
          4.5 + targetWake * 3.0,
          (18 + targetWake * 14) * speedMul,
          0,
          1,
        );

        // Counter-rotating wingtip & downwash water vortices (دوامات مائية)
        const lx = leftSkim || leftProx > 0.15 ? _v1.x : this.playerPos.x + latX * 7.2;
        const lz = leftSkim || leftProx > 0.15 ? _v1.z : this.playerPos.z + latZ * 7.2;
        const rx = rightSkim || rightProx > 0.15 ? _v2.x : this.playerPos.x - latX * 7.2;
        const rz = rightSkim || rightProx > 0.15 ? _v2.z : this.playerPos.z - latZ * 7.2;

        if (leftProx > 0.15 || bodyProx > 0.2) {
          this.spawnWaterWake(
            lx,
            lz,
            latX * 4.5 - fwdX * 4.0,
            latZ * 4.5 - fwdZ * 4.0,
            1.4 + targetWake * 0.7,
            3.6 + targetWake * 2.2,
            12.5 + targetWake * 7.5,
            1,
            1,
          );
        }
        if (rightProx > 0.15 || bodyProx > 0.2) {
          this.spawnWaterWake(
            rx,
            rz,
            -latX * 4.5 - fwdX * 4.0,
            -latZ * 4.5 - fwdZ * 4.0,
            1.4 + targetWake * 0.7,
            3.6 + targetWake * 2.2,
            12.5 + targetWake * 7.5,
            1,
            -1,
          );
        }

        // Churning frothy wake streak under dragon belly when touching/skimming closely
        if (isSkimmingWater) {
          this.spawnWaterWake(
            this.playerPos.x - fwdX * 2.5,
            this.playerPos.z - fwdZ * 2.5,
            -fwdX * 2.0,
            -fwdZ * 2.0,
            0.95,
            4.2,
            11.0 * speedMul,
            2,
            Math.random() < 0.5 ? 1 : -1,
            Math.atan2(fwdX, fwdZ),
          );
        }
      }
    }

    let isSlicingCloud = false;
    let isSlicingVolcanicCloud = false;
    for (const cloud of this.world.cloudClusters) {
      if (this.playerPos.distanceTo(cloud.center) < cloud.radius + 9) {
        isSlicingCloud = true;
        if (cloud.isVolcanic) isSlicingVolcanicCloud = true;
        break;
      }
    }

    this.trailSpawnTimer += dt;
    if (this.trailSpawnTimer >= 0.03) {
      this.trailSpawnTimer = 0;

      if (leftSkim || bodySkim) {
        const sx = leftSkim ? _v1.x : this.playerPos.x - 4;
        const sz = leftSkim ? _v1.z : this.playerPos.z;
        this.spawnElemParticle(
          sx + (Math.random() - 0.5) * 1.6,
          0.6,
          sz + (Math.random() - 0.5) * 1.6,
          -_forward.x * 8 + (Math.random() - 0.5) * 11,
          7 + Math.random() * 10,
          -_forward.z * 8 + (Math.random() - 0.5) * 11,
          0xffffff,
          0xbae6fd,
          0.48 + Math.random() * 0.25,
          1.2,
          3.8,
          22,
          1.4,
          2,
        );
      }
      if (rightSkim || bodySkim) {
        const sx = rightSkim ? _v2.x : this.playerPos.x + 4;
        const sz = rightSkim ? _v2.z : this.playerPos.z;
        this.spawnElemParticle(
          sx + (Math.random() - 0.5) * 1.6,
          0.6,
          sz + (Math.random() - 0.5) * 1.6,
          -_forward.x * 8 + (Math.random() - 0.5) * 11,
          7 + Math.random() * 10,
          -_forward.z * 8 + (Math.random() - 0.5) * 11,
          0xffffff,
          0xbae6fd,
          0.48 + Math.random() * 0.25,
          1.2,
          3.8,
          22,
          1.4,
          2,
        );
      }

      if (isSlicingCloud) {
        const wingTrailColor = isSlicingVolcanicCloud ? 0x26211e : 0xe2e8f0;
        const bodyTrailColor = isSlicingVolcanicCloud ? 0x1c1917 : 0xcbd5e1;
        this.spawnSmoke(
          _v1.x,
          _v1.y,
          _v1.z,
          -_forward.x * 10 + (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 4,
          -_forward.z * 10 + (Math.random() - 0.5) * 5,
          wingTrailColor,
          isSlicingVolcanicCloud ? 2.1 : 1.75,
          isSlicingVolcanicCloud ? 4.4 : 3.6,
          isSlicingVolcanicCloud ? 13.5 : 11.0,
          0.6,
          isSlicingVolcanicCloud ? 0.35 : 0,
          0.7,
        );
        this.spawnSmoke(
          _v2.x,
          _v2.y,
          _v2.z,
          -_forward.x * 10 + (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 4,
          -_forward.z * 10 + (Math.random() - 0.5) * 5,
          wingTrailColor,
          isSlicingVolcanicCloud ? 2.1 : 1.75,
          isSlicingVolcanicCloud ? 4.4 : 3.6,
          isSlicingVolcanicCloud ? 13.5 : 11.0,
          0.6,
          isSlicingVolcanicCloud ? 0.35 : 0,
          0.7,
        );
        this.spawnSmoke(
          this.playerPos.x,
          this.playerPos.y + 1,
          this.playerPos.z,
          -_forward.x * 14,
          1.2,
          -_forward.z * 14,
          bodyTrailColor,
          isSlicingVolcanicCloud ? 2.2 : 1.9,
          isSlicingVolcanicCloud ? 5.6 : 4.6,
          isSlicingVolcanicCloud ? 16.0 : 13.0,
          0.8,
          isSlicingVolcanicCloud ? 0.45 : 0,
          0.8,
        );
      }
    }

    const distSanctuary = this.playerPos.distanceTo(this.world.sanctuaryDragonPerch);
    if (distSanctuary < 24 && this.playerSpeed < 65) {
      this.returnToSanctuary();
    }

    return { isSkimmingWater, isSlicingCloud };
  }

  private pickNextDragonWalkTarget(): void {
    const anchorX =
      this.landedAnchorPos.distanceToSquared(this.riderPos) > 46 * 46
        ? THREE.MathUtils.lerp(this.landedAnchorPos.x, this.riderPos.x, 0.55)
        : this.landedAnchorPos.x;
    const anchorZ =
      this.landedAnchorPos.distanceToSquared(this.riderPos) > 46 * 46
        ? THREE.MathUtils.lerp(this.landedAnchorPos.z, this.riderPos.z, 0.55)
        : this.landedAnchorPos.z;

    let chosenX = this.landedDragonPos.x;
    let chosenZ = this.landedDragonPos.z;
    for (let attempt = 0; attempt < 10; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 14 + Math.random() * 24;
      const cx = anchorX + Math.cos(ang) * dist;
      const cz = anchorZ + Math.sin(ang) * dist;
      if (Math.hypot(cx - this.riderPos.x, cz - this.riderPos.z) < 9.5) continue;
      const gy = this.world.getWalkableGroundHeight(cx, cz);
      if (gy < 0.45) continue;
      let blocked = false;
      for (const b of this.world.destructibleBuildings) {
        if (b.destroyed) continue;
        if (Math.hypot(cx - b.pos.x, cz - b.pos.z) < b.radius + 5.5) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      chosenX = cx;
      chosenZ = cz;
      break;
    }
    this.landedMoveTarget.set(chosenX, 0, chosenZ);
  }

  private completeDragonTouchdown(groundY: number): void {
    this.landingRequested = false;
    this.diveTuckFactor = 0;
    this.landingLegExtend = 1;
    this.playerRoll = 0;
    this.playerSpeed = 0;
    this.velocity.set(0, 0, 0);

    _forward.set(0, 0, -1).applyQuaternion(this.flightQuat).normalize();
    this.landedDragonYaw = Math.atan2(-_forward.x, -_forward.z);
    this.landedDragonPos.set(this.playerPos.x, groundY + 4.0, this.playerPos.z);
    this.landedAnchorPos.copy(this.landedDragonPos);
    this.landedWalkPhase = 0;
    this.landedWalkBlend = 0;
    this.landedIsWalking = false;
    this.landedPauseTimer = 1.1;
    this.landedWalkTimer = 3.2;
    this.landedHeadYaw = 0;
    this.landedHeadPitch = 0;
    this.landedGroundPitch = 0;
    this.landedGroundRoll = 0;
    this.landedTurnRate = 0;
    this.playerRig.bodyGroup.position.set(0, 0, 0);
    this.playerRig.bodyGroup.rotation.set(0.08, 0, 0);
    this.playerRig.headGroup.rotation.set(0, 0, 0);
    this.playerRig.leftHindLeg.rotation.x = 0;
    this.playerRig.rightHindLeg.rotation.x = 0;
    this.playerRig.leftHindFoot.rotation.x = 0;
    this.playerRig.rightHindFoot.rotation.x = 0;

    // Massive 360-degree wing-downdraft earth dust scatter + dirt/pebble debris
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
      const spd = 16 + Math.random() * 20;
      this.spawnSmoke(
        this.landedDragonPos.x + Math.cos(a) * 3.2,
        groundY + 0.8,
        this.landedDragonPos.z + Math.sin(a) * 3.2,
        Math.cos(a) * spd,
        2.5 + Math.random() * 6.0,
        Math.sin(a) * spd,
        i % 2 === 0 ? 0xa88f6c : 0x826c52,
        1.45,
        3.6,
        13.5,
        1.8,
        0,
        0.55,
      );
    }
    _v2.set(this.landedDragonPos.x, groundY + 1.0, this.landedDragonPos.z);
    this.spawnDebris(_v2, 16, 'stone', 20, 0.65);

    this.impactShake = 0.62;
    this.audio.playCrash('stone', false);
    this.audio.playWingbeat();
    this.audio.speakKnight('landing', true);

    // Dismount knight right beside the dragon
    const rightX = Math.cos(this.landedDragonYaw);
    const rightZ = -Math.sin(this.landedDragonYaw);
    const rx = this.landedDragonPos.x + rightX * 6.0;
    const rz = this.landedDragonPos.z + rightZ * 6.0;
    this.riderPos.set(rx, this.world.getWalkableGroundHeight(rx, rz), rz);
    this.riderVel.set(0, 0, 0);
    this.riderYaw = this.landedDragonYaw;
    this.riderCamPitch = -0.14;
    this.riderGrounded = true;
    this.riderWalkCycle = 0;

    this.playerRig.riderBodyGroup.visible = false;
    this.playerRig.leftHandGroup.visible = false;
    this.playerRig.swordArmGroup.visible = false;
    this.playerRig.leftReinStrap.visible = false;
    this.playerRig.rightReinStrap.visible = false;
    this.activeRiderRig.root.visible = true;
    this.phase = 'on_foot';
    this.emitHud();
  }

  private updateSkydivingState(dt: number, elapsed: number): boolean {
    const stickX =
      (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) -
      (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0) +
      this.manualSteerX;
    const stickY =
      (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0) -
      (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0) +
      this.manualSteerY;

    let inWater = false;

    if (this.skydiveState === 'falling') {
      const sinY = Math.sin(this.riderYaw);
      const cosY = Math.cos(this.riderYaw);
      // Forward is (-sinY, -cosY), Right is (cosY, -sinY)
      const accel = 28;
      this.riderVel.x += (-sinY * stickY + cosY * stickX) * accel * dt;
      this.riderVel.z += (-cosY * stickY - sinY * stickX) * accel * dt;
      this.riderVel.y -= 24 * dt;

      // Quadratic aerodynamic terminal air drag (~42 m/s terminal fall)
      const spd = this.riderVel.length();
      this.riderVel.addScaledVector(this.riderVel, -0.014 * spd * dt);
      this.riderPos.addScaledVector(this.riderVel, dt);
      this.playerSpeed = this.riderVel.length();

      // Spread-eagle aerodynamic skydiver animation
      this.activeRiderRig.root.visible = true;
      this.activeRiderRig.root.position.copy(this.riderPos);
      this.activeRiderRig.root.rotation.set(0, this.riderYaw, 0, 'YXZ');
      this.activeRiderRig.bodyPivot.rotation.set(-1.18 + stickY * 0.22, 0, -stickX * 0.45);
      this.activeRiderRig.leftArm.rotation.set(-0.35, 0, -1.15);
      this.activeRiderRig.rightArm.rotation.set(-0.35, 0, 1.15);
      this.activeRiderRig.leftLeg.rotation.set(0.28, 0, -0.28);
      this.activeRiderRig.rightLeg.rotation.set(0.28, 0, 0.28);
      this.activeRiderRig.cape.rotation.x = 1.45 + Math.sin(elapsed * 28) * 0.34;

      if (Math.random() < 0.55) {
        this.spawnParticle(
          this.riderPos.x + (Math.random() - 0.5) * 4,
          this.riderPos.y - 3,
          this.riderPos.z + (Math.random() - 0.5) * 4,
          0,
          16,
          0,
          0xe2e8f0,
          0.35,
          0.45,
          1.4,
          0,
        );
      }

      // Loyal Dragon circles cleanly in the sky tracking the skydiver
      this.companionOrbitAngle += dt * 0.65;
      const dTargetX = this.riderPos.x + Math.cos(this.companionOrbitAngle) * 46;
      const dTargetZ = this.riderPos.z + Math.sin(this.companionOrbitAngle) * 46;
      const dTargetY = Math.max(24, this.riderPos.y + 12);
      _v1.set(dTargetX - this.playerPos.x, dTargetY - this.playerPos.y, dTargetZ - this.playerPos.z);
      const dYaw = Math.atan2(-_v1.x, -_v1.z);
      this.playerPos.lerp(_v2.set(dTargetX, dTargetY, dTargetZ), 1 - Math.exp(-2.2 * dt));
      this.playerRig.root.position.copy(this.playerPos);
      this.playerRig.root.rotation.set(0, dYaw, 0.42, 'YXZ');
      const flap = Math.sin(elapsed * 6.5);
      this.playerRig.leftWingInner.rotation.z = flap * 0.42;
      this.playerRig.rightWingInner.rotation.z = -flap * 0.42;

      const gY = this.world.getWalkableGroundHeight(this.riderPos.x, this.riderPos.z);
      const overWater = gY < -0.3;
      if (overWater && this.riderPos.y <= 0.4) {
        this.riderPos.y = 0.2;
        this.riderVel.set(0, 0, 0);
        this.skydiveState = 'in_water';
        this.skydiveWaterTimer = 1.95;
        this.impactShake = 0.72;
        this.audio.playCrash('water', true);
        this.spawnWaterWake(this.riderPos.x, this.riderPos.z, 0, 0, 1.5, 2.5, 22, 0, 1);
        this.spawnWaterWake(this.riderPos.x, this.riderPos.z, 0, 0, 1.4, 2.0, 14, 1, 1);
        for (let k = 0; k < 28; k++) {
          const ang = (k / 28) * Math.PI * 2;
          const out = 5 + Math.random() * 14;
          this.spawnParticle(
            this.riderPos.x + Math.cos(ang) * 1.4,
            0.5,
            this.riderPos.z + Math.sin(ang) * 1.4,
            Math.cos(ang) * out,
            10 + Math.random() * 18,
            Math.sin(ang) * out,
            0xe0f7ff,
            1.05,
            2.0,
            6.5,
            24,
          );
        }
      } else if (!overWater && this.riderPos.y <= gY + 0.3) {
        // Safe roll landing on island / palace ground + loyal dragon lands nearby
        this.riderPos.y = gY;
        this.riderVel.set(0, 0, 0);
        this.riderGrounded = true;
        this.activeRiderRig.bodyPivot.rotation.set(0, 0, 0);
        const dLandX = this.riderPos.x - 14;
        const dLandZ = this.riderPos.z - 10;
        const dLandY = Math.max(0, this.world.getWalkableGroundHeight(dLandX, dLandZ)) + 4.0;
        this.landedDragonPos.set(dLandX, dLandY, dLandZ);
        this.landedDragonYaw = Math.atan2(this.riderPos.x - dLandX, this.riderPos.z - dLandZ);
        this.landedAnchorPos.copy(this.landedDragonPos);
        this.landedWalkPhase = 0;
        this.landedWalkBlend = 0;
        this.landedIsWalking = false;
        this.landedPauseTimer = 1.2;
        this.landedWalkTimer = 3.0;
        this.pickNextDragonWalkTarget();
        this.audio.playCrash('stone', false);
        for (let k = 0; k < 14; k++) {
          const ang = (k / 14) * Math.PI * 2;
          this.spawnParticle(
            this.riderPos.x,
            gY + 0.5,
            this.riderPos.z,
            Math.cos(ang) * 10,
            3 + Math.random() * 5,
            Math.sin(ang) * 10,
            0x9c876c,
            0.8,
            1.6,
            5.0,
            6,
          );
        }
        this.phase = 'on_foot';
        this.emitHud();
        return false;
      }
    } else {
      // In ocean waves or mid-air rescue: dragon swoops in to scoop knight back into flight!
      inWater = this.skydiveState === 'in_water';
      this.skydiveWaterTimer = Math.max(0, this.skydiveWaterTimer - dt);
      this.playerSpeed = 0;

      if (inWater) {
        this.riderPos.y = Math.sin(elapsed * 3.4) * 0.35 - 0.15;
        this.activeRiderRig.bodyPivot.rotation.set(-0.25, 0, 0);
        this.activeRiderRig.leftArm.rotation.set(-0.8 + Math.sin(elapsed * 7) * 0.5, 0, -0.4);
        this.activeRiderRig.rightArm.rotation.set(-0.8 - Math.sin(elapsed * 7) * 0.5, 0, 0.4);
        this.activeRiderRig.cape.rotation.x = 0.75 + Math.sin(elapsed * 4) * 0.12;
        if (Math.random() < 0.22) {
          this.spawnWaterWake(this.riderPos.x, this.riderPos.z, 0, 0, 1.1, 2.0, 10, 0, 1);
        }
        if (Math.random() < 0.28) {
          this.spawnParticle(
            this.riderPos.x + (Math.random() - 0.5) * 2,
            0.4,
            this.riderPos.z + (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 3,
            2.5,
            (Math.random() - 0.5) * 3,
            0xe0f7ff,
            0.55,
            0.9,
            2.8,
            4,
          );
        }
      }
      this.activeRiderRig.root.position.copy(this.riderPos);
      this.activeRiderRig.root.rotation.set(0, this.riderYaw, 0, 'YXZ');

      // Dragon dives swiftly toward rider to catch them!
      _v1.set(this.riderPos.x, Math.max(3.6, this.riderPos.y + 1.8), this.riderPos.z);
      _v2.copy(_v1).sub(this.playerPos);
      const distToRider = _v2.length();
      const swoopDir = distToRider > 0.001 ? _v2.normalize() : _unitY;
      this.playerPos.addScaledVector(swoopDir, Math.min(distToRider, 88 * dt));
      const dYaw = Math.atan2(-swoopDir.x, -swoopDir.z);
      this.playerRig.root.position.copy(this.playerPos);
      this.playerRig.root.rotation.set(swoopDir.y * 0.5, dYaw, 0, 'YXZ');
      const flap = Math.sin(elapsed * 10);
      this.playerRig.leftWingInner.rotation.z = flap * 0.52;
      this.playerRig.rightWingInner.rotation.z = -flap * 0.52;

      if (distToRider < 7.5 || (this.skydiveState === 'rescuing' && distToRider < 10)) {
        // Scooped seamlessly back into the dragon saddle!
        this.activeRiderRig.root.visible = false;
        this.playerRig.riderBodyGroup.visible = true;
        this.playerRig.leftHandGroup.visible = true;
        this.playerRig.swordArmGroup.visible = true;
        this.playerRig.leftReinStrap.visible = true;
        this.playerRig.rightReinStrap.visible = true;
        this.playerPos.y = Math.max(6.5, this.riderPos.y + 4.5);
        this.setFlightEuler(0.24, dYaw);
        this.playerSpeed = DRAGON_SPECS[this.dragonId].baseSpeed * 0.92;
        _forward.set(0, 0, -1).applyQuaternion(this.flightQuat).normalize();
        this.velocity.copy(_forward).multiplyScalar(this.playerSpeed);
        this.velocity.y += 14;
        this.phase = 'flying';
        this.audio.playWingbeat();
        this.audio.playRoar(this.activeElement);
        this.emitHud();
        return false;
      }
    }

    // Camera trailing the falling/floating knight
    const sinY = Math.sin(this.riderYaw);
    const cosY = Math.cos(this.riderYaw);
    const camDist = inWater ? 11.5 : 9.5;
    _camTargetPos.set(
      this.riderPos.x + sinY * Math.cos(this.riderCamPitch) * camDist,
      Math.max(1.8, this.riderPos.y + 3.2 - Math.sin(this.riderCamPitch) * camDist),
      this.riderPos.z + cosY * Math.cos(this.riderCamPitch) * camDist,
    );
    _camTargetPos.x += Math.sin(elapsed * 43) * this.impactShake;
    _camTargetPos.y += Math.cos(elapsed * 37) * this.impactShake;
    this.camera.position.lerp(_camTargetPos, 1 - Math.exp(-9.5 * dt));
    this.dampCameraUp(_unitY, 8, dt);
    _camLookAt.set(this.riderPos.x, this.riderPos.y + 1.2, this.riderPos.z);
    this.camera.lookAt(_camLookAt);
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, inWater ? 64 : 78, 5, dt);
    this.camera.updateProjectionMatrix();
    return inWater;
  }

  private updateOnFootState(dt: number, elapsed: number): void {
    // 1. Landed Dragon stands upright on its hind feet and patrols naturally in all directions awaiting its knight
    const distToRider = Math.hypot(
      this.riderPos.x - this.landedDragonPos.x,
      this.riderPos.z - this.landedDragonPos.z,
    );

    if (this.landedAnchorPos.distanceToSquared(this.riderPos) > 48 * 48) {
      this.landedAnchorPos.lerp(this.riderPos, 1 - Math.exp(-0.8 * dt));
    }

    if (this.landedIsWalking) {
      this.landedWalkTimer -= dt;
      const toTargetX = this.landedMoveTarget.x - this.landedDragonPos.x;
      const toTargetZ = this.landedMoveTarget.z - this.landedDragonPos.z;
      const targetDist = Math.hypot(toTargetX, toTargetZ);

      if (targetDist < 3.0 || this.landedWalkTimer <= 0 || distToRider < 6.5) {
        this.landedIsWalking = false;
        this.landedPauseTimer = 1.6 + Math.random() * 2.0;
        this.landedTurnRate = 0;
      } else {
        const desiredYaw = Math.atan2(-toTargetX, -toTargetZ);
        let yawDiff = desiredYaw - this.landedDragonYaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

        const maxTurn = 1.65 * dt;
        const turnStep = THREE.MathUtils.clamp(yawDiff, -maxTurn, maxTurn);
        this.landedDragonYaw += turnStep;
        this.landedTurnRate = THREE.MathUtils.damp(
          this.landedTurnRate,
          THREE.MathUtils.clamp(yawDiff * 1.4, -1.2, 1.2),
          6,
          dt,
        );

        const moveDirX = -Math.sin(this.landedDragonYaw);
        const moveDirZ = -Math.cos(this.landedDragonYaw);
        const walkSpeed = 7.6 * Math.max(0.28, Math.cos(yawDiff));
        const nx = this.landedDragonPos.x + moveDirX * walkSpeed * dt;
        const nz = this.landedDragonPos.z + moveDirZ * walkSpeed * dt;
        const nextGround = this.world.getWalkableGroundHeight(nx, nz);

        let obstacleHit = nextGround < 0.45 || Math.hypot(nx - this.riderPos.x, nz - this.riderPos.z) < 6.8;
        if (!obstacleHit) {
          for (const b of this.world.destructibleBuildings) {
            if (b.destroyed) continue;
            if (Math.hypot(nx - b.pos.x, nz - b.pos.z) < b.radius + 4.8) {
              obstacleHit = true;
              break;
            }
          }
        }
        if (!obstacleHit) {
          this.landedDragonPos.x = nx;
          this.landedDragonPos.z = nz;
        } else {
          this.pickNextDragonWalkTarget();
        }
      }
    } else {
      this.landedTurnRate = THREE.MathUtils.damp(this.landedTurnRate, 0, 5, dt);
      this.landedPauseTimer -= dt;
      // Gently turn in place toward knight if knight moves well away while waiting
      if (distToRider > 38) {
        this.landedIsWalking = true;
        this.landedWalkTimer = 3.6 + Math.random() * 1.8;
        this.pickNextDragonWalkTarget();
      } else if (this.landedPauseTimer <= 0) {
        this.landedIsWalking = true;
        this.landedWalkTimer = 2.8 + Math.random() * 2.8;
        this.pickNextDragonWalkTarget();
      }
    }

    const dragonGroundY = Math.max(
      0,
      this.world.getWalkableGroundHeight(this.landedDragonPos.x, this.landedDragonPos.z),
    );
    const fwdX = -Math.sin(this.landedDragonYaw);
    const fwdZ = -Math.cos(this.landedDragonYaw);
    const rgtX = Math.cos(this.landedDragonYaw);
    const rgtZ = -Math.sin(this.landedDragonYaw);
    const hFwd = this.world.getWalkableGroundHeight(
      this.landedDragonPos.x + fwdX * 3.2,
      this.landedDragonPos.z + fwdZ * 3.2,
    );
    const hBack = this.world.getWalkableGroundHeight(
      this.landedDragonPos.x - fwdX * 3.2,
      this.landedDragonPos.z - fwdZ * 3.2,
    );
    const hRgt = this.world.getWalkableGroundHeight(
      this.landedDragonPos.x + rgtX * 2.6,
      this.landedDragonPos.z + rgtZ * 2.6,
    );
    const hLft = this.world.getWalkableGroundHeight(
      this.landedDragonPos.x - rgtX * 2.6,
      this.landedDragonPos.z - rgtZ * 2.6,
    );
    const targetPitch = THREE.MathUtils.clamp(Math.atan2(hFwd - hBack, 6.4), -0.28, 0.28);
    const targetRoll = THREE.MathUtils.clamp(Math.atan2(hLft - hRgt, 5.2), -0.22, 0.22);
    this.landedGroundPitch = THREE.MathUtils.damp(this.landedGroundPitch, targetPitch, 5, dt);
    this.landedGroundRoll = THREE.MathUtils.damp(this.landedGroundRoll, targetRoll, 5, dt);

    this.landedWalkBlend = THREE.MathUtils.damp(
      this.landedWalkBlend,
      this.landedIsWalking ? 1 : 0,
      5.5,
      dt,
    );
    if (this.landedWalkBlend > 0.02) {
      this.landedWalkPhase += dt * (4.8 * this.landedWalkBlend + 0.8);
    }

    const breathe = Math.sin(elapsed * 2.05);
    const stride = Math.sin(this.landedWalkPhase) * 0.42 * this.landedWalkBlend;
    const stepBounce = Math.abs(Math.sin(this.landedWalkPhase)) * 0.24 * this.landedWalkBlend;

    // Upright standing height (4.00m above terrain places both forward-toed feet flush on earth, knees high above ground!)
    this.landedDragonPos.y = dragonGroundY + 4.0 + stepBounce;
    this.playerPos.copy(this.landedDragonPos);

    this.playerRig.root.position.copy(this.landedDragonPos);
    this.playerRig.root.rotation.set(
      this.landedGroundPitch,
      this.landedDragonYaw,
      this.landedGroundRoll,
      'YXZ',
    );
    this.playerRig.bodyGroup.position.set(0, breathe * 0.055, 0);
    this.playerRig.bodyGroup.rotation.set(
      0.08 + Math.cos(this.landedWalkPhase * 2) * 0.025 * this.landedWalkBlend,
      0,
      Math.cos(this.landedWalkPhase) * 0.048 * this.landedWalkBlend - this.landedTurnRate * 0.08,
    );

    // Standing upright on both clawed feet (not knees!) with alternating natural walking stride & flat foot placement
    this.playerRig.leftHindLeg.rotation.x = stride;
    this.playerRig.rightHindLeg.rotation.x = -stride;
    this.playerRig.leftHindFoot.rotation.x =
      -stride * 0.85 - Math.max(0, -stride) * 0.28;
    this.playerRig.rightHindFoot.rotation.x =
      stride * 0.85 - Math.max(0, stride) * 0.28;

    // Wings: grounded folded stance with breathing expansion, gentle balance sway & occasional mantle flex
    const wingMantle = Math.max(0, Math.sin(elapsed * 0.52)) * 0.14;
    const wingWalkSway = Math.sin(this.landedWalkPhase) * 0.05 * this.landedWalkBlend;
    this.playerRig.leftWingInner.rotation.y = 0;
    this.playerRig.leftWingOuter.rotation.y = 0;
    this.playerRig.rightWingInner.rotation.y = 0;
    this.playerRig.rightWingOuter.rotation.y = 0;
    this.playerRig.leftWingInner.rotation.z =
      -0.62 + breathe * 0.04 + wingMantle + wingWalkSway - this.landedTurnRate * 0.07;
    this.playerRig.leftWingOuter.rotation.z = -0.94 - wingMantle * 0.45 + breathe * 0.03;
    this.playerRig.rightWingInner.rotation.z =
      0.62 - breathe * 0.04 - wingMantle + wingWalkSway - this.landedTurnRate * 0.07;
    this.playerRig.rightWingOuter.rotation.z = 0.94 + wingMantle * 0.45 - breathe * 0.03;

    // Expressive Head & Neck: scans surroundings and keeps an attentive eye on the waiting knight
    const riderAngleWorld = Math.atan2(
      -(this.riderPos.x - this.landedDragonPos.x),
      -(this.riderPos.z - this.landedDragonPos.z),
    );
    let relKnightYaw = riderAngleWorld - this.landedDragonYaw;
    while (relKnightYaw > Math.PI) relKnightYaw -= Math.PI * 2;
    while (relKnightYaw < -Math.PI) relKnightYaw += Math.PI * 2;
    const knightGlanceWeight = this.landedIsWalking ? 0.22 : 0.65;
    const scanSweep = Math.sin(elapsed * 0.85) * 0.34 + Math.sin(elapsed * 0.37) * 0.18;
    const targetHeadYaw = THREE.MathUtils.clamp(
      THREE.MathUtils.clamp(relKnightYaw, -0.75, 0.75) * knightGlanceWeight +
        scanSweep * (1 - knightGlanceWeight * 0.5) +
        this.landedTurnRate * 0.18,
      -0.68,
      0.68,
    );
    const targetHeadPitch =
      0.06 * breathe -
      Math.cos(this.landedWalkPhase * 2) * 0.048 * this.landedWalkBlend +
      (this.landedIsWalking ? -0.04 : 0.08 * Math.sin(elapsed * 0.62));
    this.landedHeadYaw = THREE.MathUtils.damp(this.landedHeadYaw, targetHeadYaw, 3.6, dt);
    this.landedHeadPitch = THREE.MathUtils.damp(this.landedHeadPitch, targetHeadPitch, 4.2, dt);

    this.playerRig.neckGroup.rotation.y = this.landedHeadYaw;
    this.playerRig.neckGroup.rotation.x = this.landedHeadPitch;
    this.playerRig.headGroup.rotation.y = this.landedHeadYaw * 0.25;
    this.playerRig.headGroup.rotation.z =
      Math.sin(elapsed * 0.7) * (this.landedIsWalking ? 0.04 : 0.11);
    this.playerRig.jawGroup.rotation.x = 0.04 + (breathe + 1) * 0.025;

    // Fluid sinuous tail S-wave compensating walking hips and turns
    const tailFreq = 1.65 + this.landedWalkBlend * 2.1;
    const tailAmp = 0.085 + this.landedWalkBlend * 0.065;
    for (let i = 0; i < this.playerRig.tailSegments.length; i++) {
      this.playerRig.tailSegments[i].rotation.y =
        Math.sin(elapsed * tailFreq - i * 0.52) * tailAmp - this.landedTurnRate * 0.06;
      this.playerRig.tailSegments[i].rotation.x =
        0.04 + Math.cos(elapsed * 1.4 - i * 0.4) * 0.035;
    }

    // 2. Knight On-Foot Locomotion (Joystick + WASD relative to camera yaw)
    const moveFwd =
      (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0) -
      (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0) +
      this.manualSteerY;
    const moveStrafe =
      (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) -
      (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0) +
      this.manualSteerX;

    const sprinting = this.isBoosting || this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    const walkMax = (sprinting ? 18.5 : 10.5) + this.progression.knightUpgrades.spirit * 1.4;
    const mag = Math.hypot(moveFwd, moveStrafe);
    const sinY = Math.sin(this.riderYaw);
    const cosY = Math.cos(this.riderYaw);

    let desiredVx = 0;
    let desiredVz = 0;
    if (mag > 0.08) {
      const nf = moveFwd / Math.max(1, mag);
      const ns = moveStrafe / Math.max(1, mag);
      desiredVx = (-sinY * nf + cosY * ns) * walkMax;
      desiredVz = (-cosY * nf - sinY * ns) * walkMax;
    }

    this.riderVel.x = THREE.MathUtils.lerp(this.riderVel.x, desiredVx, 1 - Math.exp(-12 * dt));
    this.riderVel.z = THREE.MathUtils.lerp(this.riderVel.z, desiredVz, 1 - Math.exp(-12 * dt));
    this.riderVel.y -= 28 * dt;

    const nextX = this.riderPos.x + this.riderVel.x * dt;
    const nextZ = this.riderPos.z + this.riderVel.z * dt;
    const nextGnd = this.world.getWalkableGroundHeight(nextX, nextZ);

    // Keep player out of deep sea while walking on shore
    if (nextGnd >= -0.45) {
      this.riderPos.x = nextX;
      this.riderPos.z = nextZ;
    } else {
      this.riderVel.x = 0;
      this.riderVel.z = 0;
    }

    // Soft collision against intact castle keeps/towers/walls (leaving gate/palace archways clear!)
    for (const b of this.world.destructibleBuildings) {
      if (b.destroyed) continue;
      if (b.id === 'castle_gate' || b.id === 'palace_wall_front') continue;
      const dx = this.riderPos.x - b.pos.x;
      const dz = this.riderPos.z - b.pos.z;
      const r = b.radius * 0.72 + 1.0;
      if (dx * dx + dz * dz < r * r && this.riderPos.y < b.pos.y + b.height * 0.5) {
        const d = Math.max(0.01, Math.hypot(dx, dz));
        this.riderPos.x = b.pos.x + (dx / d) * r;
        this.riderPos.z = b.pos.z + (dz / d) * r;
      }
    }

    this.riderPos.y += this.riderVel.y * dt;
    const floorY = Math.max(-0.4, this.world.getWalkableGroundHeight(this.riderPos.x, this.riderPos.z));
    if (this.riderPos.y <= floorY) {
      this.riderPos.y = floorY;
      this.riderVel.y = 0;
      this.riderGrounded = true;
    } else {
      this.riderGrounded = false;
    }

    const horizSpeed = Math.hypot(this.riderVel.x, this.riderVel.z);
    this.playerSpeed = horizSpeed;

    // Articulated walking / running limb gait + sword slash arc
    this.activeRiderRig.root.position.copy(this.riderPos);
    const faceYaw =
      this.cameraView === 'rider' || horizSpeed <= 0.6
        ? this.riderYaw
        : Math.atan2(-this.riderVel.x, -this.riderVel.z);
    this.activeRiderRig.root.rotation.set(0, faceYaw, 0, 'YXZ');
    this.activeRiderRig.bodyPivot.rotation.set(0, 0, 0);

    const slashT = this.swordSwingTimer > 0 ? 1 - this.swordSwingTimer / 0.38 : 0;
    const slashWave = Math.sin(slashT * Math.PI);

    if (horizSpeed > 0.5) {
      this.riderWalkCycle += dt * (sprinting ? 14 : 9.5);
      const sw = Math.sin(this.riderWalkCycle) * (sprinting ? 0.78 : 0.52);
      this.activeRiderRig.leftLeg.rotation.set(sw, 0, 0);
      this.activeRiderRig.rightLeg.rotation.set(-sw, 0, 0);
      this.activeRiderRig.leftArm.rotation.set(-sw * 0.85, 0, -0.08);
      this.activeRiderRig.rightArm.rotation.set(
        sw * 0.85 + slashWave * 1.65,
        slashWave * 0.55,
        0.08 - slashWave * 0.9,
      );
      this.activeRiderRig.bodyPivot.position.y = Math.abs(Math.sin(this.riderWalkCycle)) * 0.09;
      this.activeRiderRig.cape.rotation.x = 0.35 + (sprinting ? 0.55 : 0.25) + Math.sin(elapsed * 10) * 0.08;
    } else {
      this.activeRiderRig.leftLeg.rotation.set(0, 0, 0);
      this.activeRiderRig.rightLeg.rotation.set(0, 0, 0);
      this.activeRiderRig.leftArm.rotation.set(0, 0, -0.06);
      this.activeRiderRig.rightArm.rotation.set(
        0.25 + slashWave * 1.75,
        slashWave * 0.55,
        0.06 - slashWave * 0.9,
      );
      this.activeRiderRig.bodyPivot.position.y = 0;
      this.activeRiderRig.cape.rotation.x = 0.15 + Math.sin(elapsed * 2.2) * 0.04;
    }

    // 3rd-Person Exploration Camera vs 1st-Person Explorer Eye Camera (with real visible sword arm!)
    if (this.cameraView === 'full') {
      this.activeRiderRig.root.visible = true;
      this.activeRiderRig.head.visible = true;
      this.activeRiderRig.cape.visible = true;
      const camDist = 7.6;
      _camTargetPos.set(
        this.riderPos.x + sinY * Math.cos(this.riderCamPitch) * camDist,
        this.riderPos.y + 3.0 - Math.sin(this.riderCamPitch) * camDist,
        this.riderPos.z + cosY * Math.cos(this.riderCamPitch) * camDist,
      );
      const camFloor = this.world.getWalkableGroundHeight(_camTargetPos.x, _camTargetPos.z) + 1.2;
      _camTargetPos.y = Math.max(_camTargetPos.y, camFloor);
      this.camera.position.lerp(_camTargetPos, 1 - Math.exp(-12 * dt));
      this.dampCameraUp(_unitY, 8, dt);
      _camLookAt.set(this.riderPos.x, this.riderPos.y + 1.9, this.riderPos.z);
      this.camera.lookAt(_camLookAt);
    } else {
      this.activeRiderRig.root.visible = true;
      this.activeRiderRig.head.visible = false;
      this.activeRiderRig.cape.visible = false;
      this.camera.position.set(
        this.riderPos.x - sinY * 0.16,
        this.riderPos.y + 2.02,
        this.riderPos.z - cosY * 0.16,
      );
      _camLookAt.set(
        this.riderPos.x - sinY * Math.cos(this.riderCamPitch) * 20,
        this.riderPos.y + 2.02 + Math.sin(this.riderCamPitch) * 20,
        this.riderPos.z - cosY * Math.cos(this.riderCamPitch) * 20,
      );
      this.camera.up.copy(_unitY);
      this.camera.lookAt(_camLookAt);
    }
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 64, 6, dt);
    this.camera.updateProjectionMatrix();
  }

  private updatePlayerCrashingState(
    dt: number,
    elapsed: number,
  ): { isSkimmingWater: boolean; isSlicingCloud: boolean } {
    this.playerRig.riderBodyGroup.visible = true;
    this.playerRig.leftHandGroup.visible = false;
    this.playerRig.swordArmGroup.visible = false;

    const gY = getTerrainHeight(this.playerPos.x, this.playerPos.z);
    const overWater = gY < -0.5;
    const hitY = overWater ? 0.2 : gY + 1.8;

    if (this.playerCrashTimer === 0) {
      this.velocity.y -= 28 * dt;
      this.velocity.x *= Math.exp(-0.22 * dt);
      this.velocity.z *= Math.exp(-0.22 * dt);
      this.playerPos.addScaledVector(this.velocity, dt);
      this.playerSpeed = this.velocity.length();

      _qPitch.setFromAxisAngle(_unitX, -1.3 * dt);
      _qRoll.setFromAxisAngle(_unitZ, 2.4 * dt);
      this.flightQuat.multiply(_qPitch).multiply(_qRoll).normalize();
      this.playerRig.root.position.copy(this.playerPos);
      this.playerRig.root.quaternion.copy(this.flightQuat);

      if (Math.random() < 0.55) {
        this.spawnParticle(
          this.playerPos.x,
          this.playerPos.y,
          this.playerPos.z,
          (Math.random() - 0.5) * 4,
          4 + Math.random() * 5,
          (Math.random() - 0.5) * 4,
          0x475569,
          0.95,
          2.2,
          6.8,
          -1.5,
        );
      }

      if (this.playerPos.y <= hitY) {
        this.playerPos.y = hitY;
        this.playerCrashTimer = 0.01;
        this.impactShake = 1.05;
        this.audio.playCrash(overWater ? 'water' : 'flesh', true);
        if (!overWater) {
          this.world.deformTerrain(this.playerPos.x, this.playerPos.z, 24, 7.8, 0.72);
          this.spawnDebris(this.playerPos, 15, 'stone', 24, 1.0, this.velocity);
          this.spawnDebris(this.playerPos, 5, 'ember', 18, 0.8);
        }
        for (let k = 0; k < 22; k++) {
          this.spawnParticle(
            this.playerPos.x + (Math.random() - 0.5) * 6,
            this.playerPos.y + 1,
            this.playerPos.z + (Math.random() - 0.5) * 6,
            (Math.random() - 0.5) * 20,
            6 + Math.random() * 14,
            (Math.random() - 0.5) * 20,
            overWater ? 0xdbf4ff : 0x8c7b65,
            1.0,
            2.4,
            8.2,
            15,
          );
        }
      }
    } else {
      this.playerCrashTimer += dt;
      this.playerSpeed = 0;
      this.playerRig.root.position.copy(this.playerPos);
      this.playerRig.root.rotation.set(0.08, this.playerYaw, 1.35, 'YXZ');
      if (this.playerCrashTimer >= 1.25) {
        this.hp = Math.round(this.maxHp * 0.25);
        this.returnToSanctuary();
        return { isSkimmingWater: false, isSlicingCloud: false };
      }
    }

    _camTargetPos.set(
      this.playerPos.x + Math.sin(elapsed * 0.6) * 22,
      Math.max(hitY + 5, this.playerPos.y + 11),
      this.playerPos.z + Math.cos(elapsed * 0.6) * 22,
    );
    _camTargetPos.x += Math.sin(elapsed * 43) * this.impactShake;
    _camTargetPos.y += Math.cos(elapsed * 37) * this.impactShake;
    this.camera.position.lerp(_camTargetPos, 1 - Math.exp(-8 * dt));
    this.dampCameraUp(_unitY, 6, dt);
    this.camera.lookAt(this.playerPos);
    return { isSkimmingWater: overWater && this.playerCrashTimer > 0, isSlicingCloud: false };
  }

  private updateBoardingState(dt: number, elapsed: number): void {
    const target = this.boardingTarget;
    if (!target || !target.alive) {
      if (this.boardingExitTimer <= 0) {
        this.phase = 'flying';
        this.boardingTarget = null;
        return;
      }
    }

    if (this.boardingExitTimer > 0) {
      this.boardingExitTimer -= dt;
      if (this.boardingExitTimer <= 0) {
        this.phase = 'flying';
        this.boardingTarget = null;
        this.playerSpeed = DRAGON_SPECS[this.dragonId].baseSpeed;
        this.emitHud();
        return;
      }
    }

    if (target) {
      this.boardingProgress = Math.min(1, this.boardingProgress + dt * 3.2);
      this.playerPos.copy(target.pos).add(new THREE.Vector3(-10, -8, 12));
      this.playerRig.root.position.copy(this.playerPos);
      this.playerRig.root.rotation.set(target.pitch, target.yaw, target.roll, 'YXZ');

      _eulerA.set(target.pitch, target.yaw, target.roll, 'YXZ');
      _quatA.setFromEuler(_eulerA);
      _forward.set(0, 0, -1).applyQuaternion(_quatA).normalize();
      _up.set(0, 1, 0).applyQuaternion(_quatA).normalize();
      _right.set(1, 0, 0).applyQuaternion(_quatA).normalize();

      _camTargetPos
        .copy(target.pos)
        .addScaledVector(_up, 3.35)
        .addScaledVector(_forward, -1.2);
      this.camera.position.lerp(_camTargetPos, 1 - Math.exp(-12 * dt));
      this.dampCameraUp(_up, 10, dt);
      _camLookAt.copy(target.pos).addScaledVector(_forward, 18).addScaledVector(_up, 1.5);
      this.camera.lookAt(_camLookAt);

      this.playerRig.leftHandGroup.visible = false;
      this.playerRig.leftReinStrap.visible = false;
      this.playerRig.rightReinStrap.visible = false;
      this.playerRig.swordArmGroup.visible = true;

      if (this.swordSwingTimer > 0) {
        this.swordSwingTimer = Math.max(0, this.swordSwingTimer - dt);
        const slashPhase = 1 - this.swordSwingTimer / 0.36;
        const swingAngle = Math.sin(slashPhase * Math.PI) * 1.45;
        _v1
          .copy(this.camera.position)
          .addScaledVector(_forward, 1.45)
          .addScaledVector(_right, 0.55 - slashPhase * 0.85)
          .addScaledVector(_up, -0.55);
        this.playerRig.root.worldToLocal(_v1);
        this.playerRig.swordArmGroup.position.copy(_v1);
        this.playerRig.swordArmGroup.rotation.set(-0.6 - swingAngle, 0.35, slashPhase * 1.3);
      } else {
        _v1
          .copy(this.camera.position)
          .addScaledVector(_forward, 1.45)
          .addScaledVector(_right, 0.65)
          .addScaledVector(_up, -0.58 + Math.sin(elapsed * 8) * 0.04);
        this.playerRig.root.worldToLocal(_v1);
        this.playerRig.swordArmGroup.position.copy(_v1);
        this.playerRig.swordArmGroup.rotation.set(-0.2, 0.2, -0.3);
      }
    }
  }

  private fireElementalBreath(): void {
    const isRock = this.activeElement === 'rock';
    const isIce = this.activeElement === 'ice';
    const cost = isRock ? 14 : isIce ? 1.8 : 1.6;
    const rate = isRock ? 0.44 : isIce ? 0.032 : 0.028;
    if (this.fireCooldown > 0 || this.energy < cost) return;

    this.fireCooldown = rate;
    this.energy = Math.max(0, this.energy - cost);
    this.audio.playBreath(this.activeElement);

    this.playerRig.root.updateMatrixWorld(true);
    this.playerRig.mouthOrigin.getWorldPosition(_v1);

    _forward.set(0, 0, -1).applyQuaternion(this.flightQuat).normalize();
    _right.set(1, 0, 0).applyQuaternion(this.flightQuat).normalize();
    _up.set(0, 1, 0).applyQuaternion(this.flightQuat).normalize();

    const breathMul = 1 + this.progression.dragonUpgrades.breath * 0.24;
    const breathRangeBonus = this.progression.dragonUpgrades.breath * 6;

    if (this.activeElement === 'fire') {
      // Continuous Scorching Dragon Flame Stream (overlapping additive plasma + fire cloud)
      this.breathLightPower = 1.0;
      this.breathLightColor.setHex(0xff6d1a);

      const jetSpeed = 122 + this.playerSpeed * 0.72;
      for (let s = 0; s < 2; s++) {
        const jx = (Math.random() - 0.5) * 10;
        const jy = (Math.random() - 0.5) * 10;
        this.spawnParticle(
          _v1.x + _forward.x * s * 1.4,
          _v1.y + _forward.y * s * 1.4,
          _v1.z + _forward.z * s * 1.4,
          _forward.x * jetSpeed + _right.x * jx + _up.x * jy,
          _forward.y * jetSpeed + _right.y * jx + _up.y * jy,
          _forward.z * jetSpeed + _right.z * jx + _up.z * jy,
          s === 0 ? 0xffdf7a : 0xff5a00,
          0.56,
          1.45,
          6.8,
          -3.2,
          true,
        );
      }
      this.spawnSmoke(
        _v1.x + _forward.x * 2.5,
        _v1.y + _forward.y * 2.5,
        _v1.z + _forward.z * 2.5,
        _forward.x * (jetSpeed * 0.56) + (Math.random() - 0.5) * 14,
        _forward.y * (jetSpeed * 0.56) + 3 + (Math.random() - 0.5) * 10,
        _forward.z * (jetSpeed * 0.56) + (Math.random() - 0.5) * 14,
        0x261f1c,
        1.15,
        2.6,
        10.5,
        4.2,
        0.78,
        0.65,
      );

      this.applyContinuousConeBreath('fire', 78 + breathRangeBonus, 7.5, 5.5 * breathMul);
    } else if (this.activeElement === 'ice') {
      // Continuous Billowing White Freezing Wind pouring out of mouth -> freezes enemies!
      this.breathLightPower = 0.95;
      this.breathLightColor.setHex(0xe0f2fe);

      const windSpeed = 114 + this.playerSpeed * 0.68;
      for (let s = 0; s < 3; s++) {
        const jx = (Math.random() - 0.5) * 18;
        const jy = (Math.random() - 0.5) * 16;
        const isSpark = s === 2;
        this.spawnParticle(
          _v1.x + _forward.x * s * 1.2,
          _v1.y + _forward.y * s * 1.2,
          _v1.z + _forward.z * s * 1.2,
          _forward.x * windSpeed + _right.x * jx + _up.x * jy,
          _forward.y * windSpeed + _right.y * jx + _up.y * jy,
          _forward.z * windSpeed + _right.z * jx + _up.z * jy,
          isSpark ? 0xe0f2fe : s === 0 ? 0xffffff : 0xf1f5f9,
          0.62,
          1.7,
          8.4,
          -1.5,
          isSpark,
        );
      }

      this.applyContinuousConeBreath('ice', 76 + breathRangeBonus, 8.5, 4.2 * breathMul);
    } else {
      // Scattered Rock Barrage (7 tumbling jagged boulders in a spread cone)
      this.breathLightPower = 0.85;
      this.breathLightColor.setHex(0xf59e0b);

      for (let b = 0; b < 7; b++) {
        const mesh = new THREE.Mesh(this.rockGeo, this.rockMat);
        mesh.position
          .copy(_v1)
          .addScaledVector(_right, (Math.random() - 0.5) * 1.6)
          .addScaledVector(_up, (Math.random() - 0.5) * 1.4);
        mesh.scale.setScalar(0.62 + Math.random() * 0.95);
        mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        this.scene.add(mesh);

        _v2
          .copy(_forward)
          .addScaledVector(_right, (Math.random() - 0.5) * 0.34)
          .addScaledVector(_up, (Math.random() - 0.5) * 0.26)
          .normalize();
        const rockSpeed = 152 + Math.random() * 68 + this.playerSpeed * 0.45;

        this.projectiles.push({
          mesh,
          vel: _v2.clone().multiplyScalar(rockSpeed),
          rotVel: new THREE.Vector3(
            (Math.random() - 0.5) * 15,
            (Math.random() - 0.5) * 15,
            (Math.random() - 0.5) * 15,
          ),
          element: 'rock',
          ownerTeam: 'ally',
          life: 2.3,
          damage: 14 * breathMul,
          radius: 4.5,
        });
      }

      for (let k = 0; k < 6; k++) {
        this.spawnSmoke(
          _v1.x,
          _v1.y,
          _v1.z,
          _forward.x * 38 + (Math.random() - 0.5) * 18,
          _forward.y * 38 + (Math.random() - 0.5) * 18,
          _forward.z * 38 + (Math.random() - 0.5) * 18,
          0x4a423b,
          0.95,
          2.6,
          8.2,
          2.2,
          0.45,
          0.4,
        );
      }
    }
  }

  private applyContinuousConeBreath(
    element: 'fire' | 'ice',
    range: number,
    hitRadius: number,
    damagePerTick: number,
  ): void {
    const fireConeVfxReady = this.breathImpactVfxTimer <= 0;

    // Scorching fire destroys & burns buildings, palm trees, pirate ships, and mountainsides!
    if (element === 'fire') {
      for (const tree of this.world.destructibleTrees) {
        if (tree.destroyed) continue;
        _rayToEnemy.copy(tree.pos).sub(_v1);
        const along = _rayToEnemy.dot(_forward);
        if (along < 2 || along > range) continue;
        _closestPt.copy(_v1).addScaledVector(_forward, along);
        if (_closestPt.distanceTo(tree.pos) < hitRadius + tree.radius + along * 0.08) {
          this.destroyTree(tree);
        }
      }
      for (const b of this.world.destructibleBuildings) {
        if (b.destroyed) continue;
        _rayToEnemy.copy(b.pos).sub(_v1);
        const along = _rayToEnemy.dot(_forward);
        if (along < 2 || along > range + b.radius) continue;
        _closestPt.copy(_v1).addScaledVector(_forward, along);
        if (_closestPt.distanceTo(b.pos) < hitRadius + b.radius + along * 0.06) {
          this.damageBuilding(b, damagePerTick * 0.72, true, _forward, 'fire');
          if (fireConeVfxReady) {
            _burstDir.copy(_forward).negate();
            this.spawnElementalCollisionBurst(_closestPt, _burstDir, 'fire', 0.62, false);
            this.breathImpactVfxTimer = 0.065;
          }
        }
      }
      for (const ship of this.world.pirateShips) {
        if (ship.destroyed) continue;
        _rayToEnemy.copy(ship.group.position).sub(_v1);
        const along = _rayToEnemy.dot(_forward);
        if (along < 2 || along > range + 18) continue;
        _closestPt.copy(_v1).addScaledVector(_forward, along);
        if (_closestPt.distanceTo(ship.group.position) < hitRadius + 16 + along * 0.06) {
          this.damageShip(ship, damagePerTick * 0.75, 'fire', _forward);
          if (fireConeVfxReady) {
            this.spawnElementalCollisionBurst(_closestPt, _unitY, 'fire', 0.68, false);
            this.breathImpactVfxTimer = 0.065;
          }
        }
      }
      // Fire jet sweeping close across mountain slopes chars & slightly gouges terrain
      for (let step = 22; step <= 62; step += 20) {
        _closestPt.copy(_v1).addScaledVector(_forward, step);
        const gY = getTerrainHeight(_closestPt.x, _closestPt.z);
        if (gY > 0.5 && _closestPt.y < gY + 7.5 && _closestPt.y > gY - 8) {
          this.world.deformTerrain(_closestPt.x, _closestPt.z, 11, 0.35, 0.9);
          if (fireConeVfxReady) {
            _closestPt.y = gY + 0.5;
            this.spawnElementalCollisionBurst(_closestPt, _unitY, 'fire', 0.55, false);
            this.breathImpactVfxTimer = 0.07;
          }
          break;
        }
      }
    } else if (element === 'ice') {
      // Ice breath cools & extinguishes burning pirate ships
      for (const ship of this.world.pirateShips) {
        if (ship.destroyed || ship.burnLevel <= 0) continue;
        _rayToEnemy.copy(ship.group.position).sub(_v1);
        const along = _rayToEnemy.dot(_forward);
        if (along < 2 || along > range + 18) continue;
        _closestPt.copy(_v1).addScaledVector(_forward, along);
        if (_closestPt.distanceTo(ship.group.position) < hitRadius + 16 + along * 0.06) {
          this.damageShip(ship, damagePerTick * 0.35, 'ice', _forward);
          if (fireConeVfxReady) {
            this.spawnElementalCollisionBurst(_closestPt, _unitY, 'ice', 0.65, false);
            this.breathImpactVfxTimer = 0.065;
          }
        }
      }
    }

    if (this.mode !== 'combat') return;
    for (const ai of this.aiDragons) {
      if (!ai.alive || ai.team !== 'enemy') continue;
      _rayToEnemy.copy(ai.pos).sub(_v1);
      const along = _rayToEnemy.dot(_forward);
      if (along < 2 || along > range) continue;

      _closestPt.copy(_v1).addScaledVector(_forward, along);
      const distFromBeam = _closestPt.distanceTo(ai.pos);
      if (distFromBeam < hitRadius + along * 0.08) {
        ai.hp -= damagePerTick;
        if (element === 'fire') {
          ai.burnTimer = 4.0;
          ai.frozenTimer = Math.max(0, ai.frozenTimer - 0.5);
        } else {
          ai.frozenTimer = 4.2;
          ai.rig.setFrozen(true);
        }
        if (this.breathImpactVfxTimer <= 0) {
          _burstDir.copy(_forward).negate();
          this.spawnElementalCollisionBurst(ai.pos, _burstDir, element, 0.72, true);
          this.breathImpactVfxTimer = 0.06;
        }

        if (ai.hp <= 0) {
          this.killEnemyDragon(ai, false);
        }
      }
    }
  }

  private updateAiDragons(dt: number, elapsed: number): void {
    for (const ai of this.aiDragons) {
      if (ai.state === 'falling') {
        ai.fallVel.y -= 29 * dt;
        ai.fallVel.multiplyScalar(1 - 0.14 * dt);
        ai.pos.addScaledVector(ai.fallVel, dt);
        ai.pitch += ai.fallAngVel.x * dt;
        ai.yaw += ai.fallAngVel.y * dt;
        ai.roll += ai.fallAngVel.z * dt;

        _eulerA.set(ai.pitch, ai.yaw, ai.roll, 'YXZ');
        _quatA.setFromEuler(_eulerA);
        ai.rig.root.position.copy(ai.pos);
        ai.rig.root.quaternion.copy(_quatA);

        const limpFlap = Math.sin(elapsed * 14 + ai.patrolSeed) * 0.2;
        ai.rig.leftWingInner.rotation.z = -0.35 + limpFlap;
        ai.rig.leftWingOuter.rotation.z = -0.65 - limpFlap;
        ai.rig.rightWingInner.rotation.z = 0.35 - limpFlap;
        ai.rig.rightWingOuter.rotation.z = 0.65 + limpFlap;

        if (Math.random() < 0.72) {
          this.spawnSmoke(
            ai.pos.x,
            ai.pos.y,
            ai.pos.z,
            (Math.random() - 0.5) * 5,
            3.5 + Math.random() * 5,
            (Math.random() - 0.5) * 5,
            0x272321,
            2.1,
            3.8,
            14.0,
            3.4,
            0.65,
            0.85,
          );
        }

        this.updateFallingRiderPhysics(ai, dt);

        const gY = getTerrainHeight(ai.pos.x, ai.pos.z);
        const overWater = gY < -0.5;
        const hitY = overWater ? -0.35 : gY + 1.6;
        if (ai.pos.y <= hitY) {
          ai.pos.y = hitY;
          ai.state = 'dead_ground';
          ai.deadGroundTimer = 3.4;
          ai.rig.root.position.copy(ai.pos);
          ai.rig.root.rotation.set(0.08, ai.yaw, 1.38, 'YXZ');
          ai.rig.leftWingInner.rotation.z = -0.78;
          ai.rig.rightWingInner.rotation.z = 0.78;

          const distToCam = ai.pos.distanceTo(this.playerPos);
          if (distToCam < 240) {
            this.audio.playCrash(overWater ? 'water' : 'flesh', true);
            this.impactShake = Math.max(this.impactShake, Math.max(0.18, 0.75 * (1 - distToCam / 240)));
          }
          if (!overWater) {
            this.world.deformTerrain(ai.pos.x, ai.pos.z, 25, 8.5, 0.76);
            this.spawnDebris(ai.pos, 15, 'stone', 24, 1.05, ai.fallVel);
            this.spawnDebris(ai.pos, 6, 'ember', 18, 0.85);
          }
          for (let k = 0; k < 18; k++) {
            this.spawnSmoke(
              ai.pos.x + (Math.random() - 0.5) * 6,
              hitY + 1.2,
              ai.pos.z + (Math.random() - 0.5) * 6,
              (Math.random() - 0.5) * 20,
              4 + Math.random() * 10,
              (Math.random() - 0.5) * 20,
              overWater ? 0xcfe8f7 : 0x5c5349,
              1.9,
              4.2,
              15.5,
              2.6,
              overWater ? 0 : 0.35,
              0.8,
            );
          }
        }
        continue;
      }

      if (ai.state === 'dead_ground') {
        this.updateFallingRiderPhysics(ai, dt);
        ai.deadGroundTimer -= dt;
        if (ai.deadGroundTimer < 1.15) {
          ai.rig.root.position.y -= dt * 2.5;
          if (ai.fallingRider) {
            ai.fallingRider.position.y -= dt * 2.5;
          }
        }
        if (ai.deadGroundTimer <= 0) {
          ai.rig.root.visible = false;
          if (ai.fallingRider) {
            this.disposeObject3D(ai.fallingRider);
            this.scene.remove(ai.fallingRider);
            ai.fallingRider = null;
          }
          ai.state = 'respawning';
          ai.respawnTimer = 6.5;
        }
        continue;
      }

      if (ai.state === 'respawning' || !ai.alive) {
        if (this.mode === 'combat') {
          ai.respawnTimer -= dt;
          if (ai.respawnTimer <= 0) {
            ai.alive = true;
            ai.state = 'alive';
            ai.hp = ai.maxHp;
            ai.slowTimer = 0;
            ai.frozenTimer = 0;
            ai.burnTimer = 0;
            ai.rig.setFrozen(false);
            ai.rig.riderBodyGroup.visible = true;
            ai.pos.set(
              (Math.random() - 0.5) * 1200,
              90 + Math.random() * 65,
              (Math.random() - 0.5) * 1200,
            );
            ai.roostState = 'flying';
            ai.rig.root.visible = true;
          }
        }
        continue;
      }

      if ((this.mode === 'free' || this.warType === 'ships') && ai.team === 'enemy') {
        ai.rig.root.visible = false;
        continue;
      } else {
        ai.rig.root.visible = true;
      }

      // Non-combat mode: Dragons peacefully soar and hang UPSIDE-DOWN beneath overhanging roost trees!
      if (this.mode === 'free' && this.world.hangingRoostSpots.length > 0) {
        ai.roostTimer -= dt;
        const spot = this.world.hangingRoostSpots[ai.roostIndex % this.world.hangingRoostSpots.length];
        if (ai.roostState === 'hanging') {
          ai.pos.copy(spot.pos);
          ai.rig.root.position.copy(spot.pos);
          const sway = Math.sin(elapsed * 1.4 + ai.patrolSeed) * 0.06;
          ai.rig.root.rotation.set(0.18, spot.yaw, Math.PI + sway, 'YXZ');
          ai.rig.leftWingInner.rotation.z = -1.08;
          ai.rig.leftWingOuter.rotation.z = -1.15;
          ai.rig.rightWingInner.rotation.z = 1.08;
          ai.rig.rightWingOuter.rotation.z = 1.15;
          ai.rig.leftHindLeg.rotation.x = -0.78;
          ai.rig.rightHindLeg.rotation.x = -0.78;
          ai.rig.leftHindFoot.rotation.x = 0.35;
          ai.rig.rightHindFoot.rotation.x = 0.35;
          if (ai.roostTimer <= 0) {
            ai.roostState = 'flying';
            ai.roostTimer = 14 + Math.random() * 10;
            ai.pos.y -= 5;
            ai.roll = 0;
          }
          continue;
        }
        if (ai.roostState === 'flying' && ai.roostTimer <= 0) {
          ai.roostState = 'approaching_roost';
        }
        if (ai.roostState === 'approaching_roost') {
          const dSpot = ai.pos.distanceTo(spot.pos);
          if (dSpot < 5.2) {
            ai.roostState = 'hanging';
            ai.roostTimer = 11 + Math.random() * 9;
            continue;
          }
        }
      } else {
        ai.roostState = 'flying';
      }

      if (ai.slowTimer > 0) ai.slowTimer = Math.max(0, ai.slowTimer - dt);
      if (ai.frozenTimer > 0) {
        ai.frozenTimer = Math.max(0, ai.frozenTimer - dt);
        ai.rig.setFrozen(true);
        if (Math.random() < 0.25) {
          this.spawnParticle(
            ai.pos.x + (Math.random() - 0.5) * 5,
            ai.pos.y + (Math.random() - 0.5) * 3,
            ai.pos.z + (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 3,
            -2 - Math.random() * 4,
            (Math.random() - 0.5) * 3,
            0xffffff,
            0.55,
            1.4,
            3.2,
            2,
            false,
          );
        }
      } else {
        ai.rig.setFrozen(false);
      }

      if (ai.burnTimer > 0) {
        ai.burnTimer = Math.max(0, ai.burnTimer - dt);
        ai.hp -= dt * 7.5;
        if (ai.hp <= 0) {
          this.killEnemyDragon(ai, false);
          continue;
        }
      }

      // When frozen by the white frost wind, enemy stops moving & attacking in mid-air!
      if (ai.frozenTimer > 0) {
        ai.rig.root.position.set(
          ai.pos.x + Math.sin(elapsed * 45) * 0.08,
          ai.pos.y,
          ai.pos.z,
        );
        continue;
      }

      let targetPos: THREE.Vector3 | null = null;
      let attackingKingdom = false;
      if (this.mode === 'free' && ai.roostState === 'approaching_roost') {
        targetPos = this.world.hangingRoostSpots[ai.roostIndex % this.world.hangingRoostSpots.length].pos;
      } else if (this.mode === 'combat') {
        let bestDist = 420;
        if (ai.team === 'enemy' && this.phase === 'flying') {
          const dp = ai.pos.distanceTo(this.playerPos);
          if (dp < bestDist) {
            bestDist = dp;
            targetPos = this.playerPos;
          }
        }
        for (const other of this.aiDragons) {
          if (!other.alive || other.team === ai.team) continue;
          const d = ai.pos.distanceTo(other.pos);
          if (d < bestDist) {
            bestDist = d;
            targetPos = other.pos;
          }
        }
        // Enemy dragons also actively dive & breach Kingdom walls/fortresses!
        if (!targetPos && ai.team === 'enemy') {
          let bestBldDist = 900;
          for (const b of this.world.destructibleBuildings) {
            if (b.destroyed) continue;
            const d = ai.pos.distanceTo(b.pos);
            if (d < bestBldDist) {
              bestBldDist = d;
              targetPos = b.pos;
              attackingKingdom = true;
            }
          }
        }
      }

      if (!targetPos) {
        const angle = elapsed * 0.14 + ai.patrolSeed;
        _v3.set(
          Math.cos(angle) * 680,
          95 + Math.sin(elapsed * 0.4 + ai.patrolSeed) * 32,
          Math.sin(angle * 0.85) * 680,
        );
        targetPos = _v3;
      }

      _v1.copy(targetPos).sub(ai.pos);
      const desiredYaw = Math.atan2(-_v1.x, -_v1.z);
      let diffYaw = desiredYaw - ai.yaw;
      while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
      while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;

      ai.yaw += THREE.MathUtils.clamp(diffYaw, -1.35 * dt, 1.35 * dt);
      const horizDist = Math.max(1, Math.hypot(_v1.x, _v1.z));
      const desiredPitch = THREE.MathUtils.clamp(Math.atan2(_v1.y, horizDist), -0.55, 0.55);
      ai.pitch = THREE.MathUtils.damp(ai.pitch, desiredPitch, 2.5, dt);
      ai.roll = THREE.MathUtils.damp(ai.roll, THREE.MathUtils.clamp(diffYaw * 0.6, -0.6, 0.6), 4, dt);

      const moveSpeed = ai.speed * (ai.slowTimer > 0 ? 0.55 : 1);
      _eulerA.set(ai.pitch, ai.yaw, ai.roll, 'YXZ');
      _quatA.setFromEuler(_eulerA);
      _forward.set(0, 0, -1).applyQuaternion(_quatA).normalize();
      ai.pos.addScaledVector(_forward, moveSpeed * dt);

      const gY = getTerrainHeight(ai.pos.x, ai.pos.z);
      if (ai.roostState !== 'approaching_roost' && ai.pos.y < Math.max(16, gY + 14)) {
        ai.pos.y = Math.max(16, gY + 14);
      }

      ai.rig.root.position.copy(ai.pos);
      ai.rig.root.quaternion.copy(_quatA);

      if (ai.clashTimer > 0) ai.clashTimer = Math.max(0, ai.clashTimer - dt);

      const distToTarget = targetPos !== _v3 ? ai.pos.distanceTo(targetPos) : 999;
      const aiTalonReady =
        ai.clashTimer > 0 || (this.mode === 'combat' && distToTarget < 24);
      const flap = Math.sin(elapsed * 6.2 + ai.patrolSeed);
      const diveTuckAi = desiredPitch < -0.22 ? THREE.MathUtils.clamp((-desiredPitch - 0.22) * 2.1, 0, 1) : 0;
      ai.rig.leftWingInner.rotation.y = 0.9 * diveTuckAi;
      ai.rig.leftWingOuter.rotation.y = 0.3 * diveTuckAi;
      ai.rig.rightWingInner.rotation.y = -0.9 * diveTuckAi;
      ai.rig.rightWingOuter.rotation.y = -0.3 * diveTuckAi;
      ai.rig.leftWingInner.rotation.z = flap * 0.45 * (1 - diveTuckAi * 0.85) + 0.2 * diveTuckAi;
      ai.rig.leftWingOuter.rotation.z = Math.sin(elapsed * 6.2 + ai.patrolSeed - 0.6) * 0.4 * (1 - diveTuckAi * 0.85) - 0.45 * diveTuckAi;
      ai.rig.rightWingInner.rotation.z = -flap * 0.45 * (1 - diveTuckAi * 0.85) - 0.2 * diveTuckAi;
      ai.rig.rightWingOuter.rotation.z = -Math.sin(elapsed * 6.2 + ai.patrolSeed - 0.6) * 0.4 * (1 - diveTuckAi * 0.85) + 0.45 * diveTuckAi;

      const aiKick = ai.clashTimer > 0 ? Math.sin(elapsed * 26 + ai.patrolSeed) * 0.34 : 0;
      const aiLegBase = aiTalonReady ? -0.78 : 0.52;
      const aiFootBase = aiTalonReady ? -0.18 : 0.46;
      ai.rig.leftHindLeg.rotation.x = aiLegBase + flap * 0.08 + aiKick;
      ai.rig.rightHindLeg.rotation.x = aiLegBase - flap * 0.08 - aiKick;
      ai.rig.leftHindFoot.rotation.x = aiFootBase;
      ai.rig.rightHindFoot.rotation.x = aiFootBase;

      // AI-vs-AI Aerial Talon Clash in Combat Mode
      if (this.mode === 'combat' && ai.clashTimer <= 0) {
        for (const other of this.aiDragons) {
          if (!other.alive || other.team === ai.team || other.clashTimer > 0) continue;
          if (ai.pos.distanceToSquared(other.pos) < 10.5 * 10.5) {
            ai.clashTimer = 0.72;
            other.clashTimer = 0.72;
            ai.hp -= 12 + Math.random() * 8;
            other.hp -= 12 + Math.random() * 8;
            _v2.copy(ai.pos).add(other.pos).multiplyScalar(0.5);
            this.spawnElementalCollisionBurst(_v2, _unitY, DRAGON_SPECS[ai.specId].element, 0.78, true);
            if (ai.pos.distanceTo(this.playerPos) < 280) {
              this.audio.playRoar(DRAGON_SPECS[ai.specId].element, 0.55, 0.75);
            }
            if (other.hp <= 0) this.killEnemyDragon(other, false);
            if (ai.hp <= 0) this.killEnemyDragon(ai, false);
            break;
          }
        }
      }
      if (!ai.alive) continue;

      if (this.mode === 'combat' && targetPos !== _v3) {
        ai.fireCooldown -= dt;
        const maxRange = attackingKingdom ? 240 : 190;
        if (ai.fireCooldown <= 0 && distToTarget < maxRange && Math.abs(diffYaw) < 0.48) {
          ai.fireCooldown = 1.6 + Math.random() * 1.4;
          const el = DRAGON_SPECS[ai.specId].element;
          const mat = el === 'fire' ? this.fireMat : el === 'ice' ? this.iceMat : this.rockMat;
          const geo = el === 'fire' ? this.fireGeo : el === 'ice' ? this.iceGeo : this.rockGeo;
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.copy(ai.pos).addScaledVector(_forward, 6);
          this.scene.add(mesh);

          _v2.copy(targetPos).sub(ai.pos).normalize();
          this.projectiles.push({
            mesh,
            vel: _v2.clone().multiplyScalar(160),
            element: el,
            ownerTeam: ai.team,
            life: 2.2,
            damage: attackingKingdom ? 16 : 9,
            radius: 4.0,
          });

          // Sound directional War Horn from the attacking enemy dragon's azimuth!
          if (ai.team === 'enemy' && (targetPos === this.playerPos || attackingKingdom)) {
            this.triggerDirectionalDangerHorn(ai.pos);
          }
        }
      }
    }
  }

  private updateFallingRiderPhysics(ai: AiDragon, dt: number): void {
    const rider = ai.fallingRider;
    if (!rider || ai.riderGrounded) return;

    ai.riderFallVel.y -= 30 * dt;
    ai.riderFallPos.addScaledVector(ai.riderFallVel, dt);
    rider.position.copy(ai.riderFallPos);
    rider.rotation.x += dt * 4.5;
    rider.rotation.z += dt * 3.1;

    const rGy = getTerrainHeight(ai.riderFallPos.x, ai.riderFallPos.z);
    const overWater = rGy < -0.5;
    const hitY = overWater ? -0.1 : rGy + 0.45;
    if (ai.riderFallPos.y <= hitY) {
      ai.riderFallPos.y = hitY;
      ai.riderGrounded = true;
      rider.position.copy(ai.riderFallPos);
      rider.rotation.set(Math.PI * 0.48, ai.yaw, 0.4);
      if (ai.riderFallPos.distanceTo(this.playerPos) < 220) {
        this.audio.playCrash(overWater ? 'water' : 'flesh', false);
      }
      for (let k = 0; k < 8; k++) {
        this.spawnParticle(
          ai.riderFallPos.x + (Math.random() - 0.5) * 2,
          hitY + 0.5,
          ai.riderFallPos.z + (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 8,
          4 + Math.random() * 6,
          (Math.random() - 0.5) * 8,
          overWater ? 0xdbf4ff : 0x8c7b65,
          0.65,
          1.2,
          3.8,
          12,
        );
      }
    }
  }

  private disposeObject3D(root: THREE.Object3D): void {
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          m?.dispose();
        }
      }
    });
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.rotVel) {
        p.mesh.rotation.x += p.rotVel.x * dt;
        p.mesh.rotation.y += p.rotVel.y * dt;
        p.mesh.rotation.z += p.rotVel.z * dt;
      } else if (p.element === 'rock') {
        p.mesh.rotation.x += dt * 7;
        p.mesh.rotation.y += dt * 5;
      }

      if (Math.random() < 0.55) {
        const col =
          p.element === 'fire' ? 0xf97316 : p.element === 'ice' ? 0xe0f2fe : 0xd97706;
        this.spawnParticle(
          p.mesh.position.x,
          p.mesh.position.y,
          p.mesh.position.z,
          (Math.random() - 0.5) * 4,
          (Math.random() - 0.5) * 4,
          (Math.random() - 0.5) * 4,
          col,
          0.32,
          1.4,
          0.2,
          0,
        );
      }

      let hit = false;
      let hitDragon = false;
      _normal.copy(p.vel).negate().normalize();

      if (p.ownerTeam === 'ally') {
        // Destructibles vs player/ally projectiles
        for (const tree of this.world.destructibleTrees) {
          if (tree.destroyed) continue;
          const dx = p.mesh.position.x - tree.pos.x;
          const dz = p.mesh.position.z - tree.pos.z;
          if (
            dx * dx + dz * dz < (p.radius + tree.radius) * (p.radius + tree.radius) &&
            p.mesh.position.y >= tree.pos.y &&
            p.mesh.position.y <= tree.pos.y + tree.height + 2
          ) {
            this.destroyTree(tree);
            _normal.set(dx, 0.35, dz).normalize();
            hit = true;
            break;
          }
        }
        if (!hit) {
          for (const b of this.world.destructibleBuildings) {
            if (b.destroyed) continue;
            const dx = p.mesh.position.x - b.pos.x;
            const dz = p.mesh.position.z - b.pos.z;
            if (
              dx * dx + dz * dz < (p.radius + b.radius) * (p.radius + b.radius) &&
              Math.abs(p.mesh.position.y - b.pos.y) < b.height * 0.55 + p.radius
            ) {
              this.damageBuilding(b, p.damage * 1.45, true, p.vel, p.element);
              _normal.set(dx, 0.35, dz).normalize();
              hit = true;
              break;
            }
          }
        }
        if (!hit) {
          for (const ship of this.world.pirateShips) {
            if (ship.destroyed) continue;
            const sp = ship.group.position;
            const dx = p.mesh.position.x - sp.x;
            const dz = p.mesh.position.z - sp.z;
            if (
              dx * dx + dz * dz < (p.radius + 16) * (p.radius + 16) &&
              p.mesh.position.y < 24 &&
              p.mesh.position.y > -2
            ) {
              this.damageShip(ship, p.damage * 1.6, p.element, p.vel);
              _normal.set(dx * 0.3, 1, dz * 0.3).normalize();
              hit = true;
              break;
            }
          }
        }
      }

      if (!hit && p.ownerTeam === 'ally' && this.mode === 'combat') {
        for (const ai of this.aiDragons) {
          if (!ai.alive || ai.team !== 'enemy') continue;
          if (p.mesh.position.distanceTo(ai.pos) < p.radius + 4.8) {
            const bonus = ai.frozenTimer > 0 ? 1.5 : 1.0;
            ai.hp -= p.damage * bonus;
            if (p.element === 'ice') {
              ai.frozenTimer = 4.0;
              ai.rig.setFrozen(true);
            }
            if (p.element === 'fire') {
              ai.burnTimer = 3.0;
              ai.frozenTimer = Math.max(0, ai.frozenTimer - 0.5);
            }
            _normal.copy(p.mesh.position).sub(ai.pos);
            if (_normal.lengthSq() > 0.001) _normal.normalize();
            else _normal.copy(_unitY);
            hit = true;
            hitDragon = true;
            if (ai.hp <= 0) {
              this.killEnemyDragon(ai, false);
            }
            break;
          }
        }
      } else if (p.ownerTeam === 'enemy' && this.mode === 'combat') {
        // Enemy dragons actively breach Kingdom fortresses & walls!
        for (const b of this.world.destructibleBuildings) {
          if (b.destroyed) continue;
          const dx = p.mesh.position.x - b.pos.x;
          const dz = p.mesh.position.z - b.pos.z;
          if (
            dx * dx + dz * dz < (p.radius + b.radius) * (p.radius + b.radius) &&
            Math.abs(p.mesh.position.y - b.pos.y) < b.height * 0.55 + p.radius
          ) {
            this.damageBuilding(b, p.damage, false, p.vel, p.element);
            _normal.set(dx, 0.35, dz).normalize();
            hit = true;
            break;
          }
        }
        if (!hit) {
          for (const ai of this.aiDragons) {
            if (!ai.alive || ai.team !== 'ally') continue;
            if (p.mesh.position.distanceTo(ai.pos) < p.radius + 4.5) {
              ai.hp -= p.damage * 0.55;
              if (p.element === 'ice') ai.slowTimer = 3.0;
              if (p.element === 'fire') ai.burnTimer = 2.4;
              _normal.copy(p.mesh.position).sub(ai.pos);
              if (_normal.lengthSq() > 0.001) _normal.normalize();
              else _normal.copy(_unitY);
              hit = true;
              hitDragon = true;
              if (ai.hp <= 0) {
                this.killEnemyDragon(ai, false);
              }
              break;
            }
          }
        }
        if (!hit && this.phase === 'flying' && !this.playerCrashing) {
          if (p.mesh.position.distanceTo(this.playerPos) < p.radius + 4.2) {
            const armorMul = Math.max(0.45, 1 - this.progression.knightUpgrades.armor * 0.1);
            this.hp = Math.max(0, this.hp - p.damage * armorMul);
            this.woundsCount = Math.min(5, this.woundsCount + 1);
            this.triggerDirectionalDangerHorn(p.mesh.position);
            _normal.copy(p.mesh.position).sub(this.playerPos);
            if (_normal.lengthSq() > 0.001) _normal.normalize();
            else _normal.copy(_unitY);
            hit = true;
            hitDragon = true;
            if (this.hp <= 0) {
              this.playerCrashing = true;
              this.playerCrashTimer = 0;
              this.audio.playRoar(DRAGON_SPECS[this.dragonId].element);
              this.audio.playFallWhoosh(1.65);
            }
          }
        }
      }

      const gY = getTerrainHeight(p.mesh.position.x, p.mesh.position.z);
      if (p.mesh.position.y <= Math.max(0, gY)) {
        hit = true;
        _normal.copy(_unitY);
        if (gY > -0.4) {
          if (p.element === 'rock') {
            this.world.deformTerrain(p.mesh.position.x, p.mesh.position.z, 14, 3.8, 0.65);
            this.spawnDebris(p.mesh.position, 6, 'stone', 18, 0.72, p.vel);
            this.spawnDebris(p.mesh.position, 3, 'ember', 14, 0.65);
          } else if (p.element === 'fire') {
            this.world.deformTerrain(p.mesh.position.x, p.mesh.position.z, 10, 1.5, 0.88);
          } else if (p.element === 'ice') {
            this.spawnDebris(p.mesh.position, 5, 'ice', 16, 0.65, p.vel);
          }
        }
      }

      if (hit || p.life <= 0) {
        if (hit) {
          this.spawnElementalCollisionBurst(
            p.mesh.position,
            _normal,
            p.element,
            hitDragon ? 1.18 : p.element === 'rock' ? 1.15 : 0.95,
            hitDragon,
          );
        }
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private spawnParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    colorHex: number,
    maxLife: number,
    startScale: number,
    endScale: number,
    gravity: number,
    additive = false,
  ): void {
    if (this.particles.length > 520) return;
    const mat = new THREE.SpriteMaterial({
      map: this.particleTex,
      color: colorHex,
      transparent: true,
      opacity: additive ? 0.92 : 0.85,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(startScale);
    this.scene.add(sprite);
    this.particles.push({
      sprite,
      vel: new THREE.Vector3(vx, vy, vz),
      life: maxLife,
      maxLife,
      startScale,
      endScale,
      gravity,
    });
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.sprite);
        p.sprite.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      const t = 1 - p.life / p.maxLife;
      const s = THREE.MathUtils.lerp(p.startScale, p.endScale, t);
      p.sprite.scale.setScalar(s);
      p.sprite.material.opacity = (1 - t) * 0.82;
    }
  }

  private initSmokeSystem(): void {
    this.smokeTex = createRealisticSmokeTexture(this.maxAnisotropy);
    this.smokePool = [];
    for (let i = 0; i < MAX_SMOKE; i++) {
      this.smokePool.push({
        active: false,
        x: 0,
        y: -9999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        r: 0.2,
        g: 0.2,
        b: 0.2,
        life: 0,
        maxLife: 1,
        startScale: 1,
        endScale: 4,
        buoyancy: 2,
        fireGlow: 0,
        windMul: 1,
        angle: 0,
        angVel: 0,
        seed: i * 1.37,
      });
    }

    const baseQuad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = baseQuad.index;
    geo.attributes.position = baseQuad.attributes.position;
    geo.attributes.uv = baseQuad.attributes.uv;
    baseQuad.dispose();

    this.smokePosScaleAttr = new THREE.InstancedBufferAttribute(this.smokePosScaleArr, 4);
    this.smokePosScaleAttr.setUsage(THREE.DynamicDrawUsage);
    this.smokeTintAttr = new THREE.InstancedBufferAttribute(this.smokeTintArr, 3);
    this.smokeTintAttr.setUsage(THREE.DynamicDrawUsage);
    this.smokeParamsAttr = new THREE.InstancedBufferAttribute(this.smokeParamsArr, 4);
    this.smokeParamsAttr.setUsage(THREE.DynamicDrawUsage);

    geo.setAttribute('aSmokePosScale', this.smokePosScaleAttr);
    geo.setAttribute('aSmokeTint', this.smokeTintAttr);
    geo.setAttribute('aSmokeParams', this.smokeParamsAttr);
    geo.instanceCount = MAX_SMOKE;

    this.smokeMat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: this.smokeTex },
        uSunDir: { value: new THREE.Vector3(240, 175, -210).normalize() },
        uTime: { value: 0 },
        uStormFactor: { value: 0 },
        uLightning: { value: 0 },
      },
      vertexShader: `
        attribute vec4 aSmokePosScale;
        attribute vec3 aSmokeTint;
        attribute vec4 aSmokeParams;
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vTint;
        varying vec4 vParams;
        varying float vViewDist;
        varying vec3 vSunLocal;

        void main() {
          vUv = uv;
          vTint = aSmokeTint;
          vParams = aSmokeParams;

          float scale = aSmokePosScale.w;
          if (scale <= 0.001) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            vViewDist = 9999.0;
            vSunLocal = vec3(0.0, 1.0, 0.0);
            return;
          }

          float ang = aSmokeParams.x;
          float c = cos(ang);
          float s = sin(ang);
          vec2 rotPos = vec2(
            position.x * c - position.y * s,
            position.x * s + position.y * c
          );

          vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 camFwd   = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);

          float breathe = 1.0 + sin(uTime * 2.1 + aSmokeParams.w * 7.3) * 0.035;
          vec3 worldPos = aSmokePosScale.xyz + (camRight * rotPos.x + camUp * rotPos.y) * (scale * breathe);

          // Express sun vector in billboard UV tangent space for realistic self-shadowing
          vSunLocal = vec3(
            dot(camRight, normalize(vec3(0.65, 0.48, -0.58))),
            dot(camUp, normalize(vec3(0.65, 0.48, -0.58))),
            dot(camFwd, normalize(vec3(0.65, 0.48, -0.58)))
          );

          vec4 mvPos = viewMatrix * vec4(worldPos, 1.0);
          vViewDist = -mvPos.z;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform float uTime;
        uniform float uStormFactor;
        uniform float uLightning;
        varying vec2 vUv;
        varying vec3 vTint;
        varying vec4 vParams;
        varying float vViewDist;
        varying vec3 vSunLocal;

        void main() {
          float lifeFrac = clamp(vParams.y, 0.0, 1.0);
          float fireGlow = vParams.z;
          float seed = vParams.w;

          // Counter-rotating turbulent curl advection inside each puff
          vec2 driftA = vec2(uTime * 0.055 + seed * 0.31, -uTime * 0.085 - lifeFrac * 0.24);
          vec2 driftB = vec2(-uTime * 0.045 + seed * 0.71, -uTime * 0.065 + lifeFrac * 0.16);
          vec4 baseSample = texture2D(uMap, vUv + driftA * 0.18);
          vec4 eddySample = texture2D(uMap, vUv * 1.18 + driftB * 0.22 + (baseSample.rg - 0.5) * 0.14);

          float dome = mix(baseSample.r, eddySample.r, 0.45);
          float tendrils = mix(baseSample.g, eddySample.g, 0.55);
          float core = mix(baseSample.b, eddySample.b, 0.4);
          float rawAlpha = baseSample.a * mix(0.68, 1.18, eddySample.a);

          // Wispy edge erosion as puff expands & disperses
          float erodeMin = lifeFrac * 0.46;
          float erodeMax = 0.52 + lifeFrac * 0.48;
          float wispyMask = smoothstep(erodeMin, erodeMax, rawAlpha * 0.85 + tendrils * 0.28);

          // Fade in quickly on emission, dissolve organically on dissipation
          float lifeFade = smoothstep(0.0, 0.11, lifeFrac) * (1.0 - smoothstep(0.32, 1.0, lifeFrac));
          float nearFade = smoothstep(3.0, 14.0, vViewDist);
          float distFade = exp(-vViewDist * 0.00022);

          float finalAlpha = clamp(wispyMask * rawAlpha * lifeFade * nearFade * distFade * 0.94, 0.0, 0.92);
          if (finalAlpha < 0.006) discard;

          // 3D Billow dome self-shadowing toward solar azimuth
          vec2 radialVec = (vUv - 0.5) * 2.0;
          vec2 sun2D = normalize(vSunLocal.xy + vec2(0.001, 0.12));
          float sunDot = dot(radialVec, sun2D) * 0.5 + 0.5;
          float sunHighlight = clamp(dome * 0.65 + sunDot * 0.45 - core * 0.22, 0.0, 1.0);

          vec3 shadowTone = vTint * mix(0.34, 0.55, 1.0 - core);
          vec3 litTone = mix(vTint * 1.35 + vec3(0.18, 0.15, 0.12), vec3(0.84, 0.8, 0.75), 0.26);
          litTone = mix(litTone, vTint * 0.72, uStormFactor * 0.65);

          vec3 col = mix(shadowTone, litTone, smoothstep(0.18, 0.88, sunHighlight));

          // Internal warm fire/ember scattering from flames underneath
          float emberCore = core * pow(max(0.0, 1.0 - lifeFrac * 1.25), 1.35) * (0.45 + tendrils * 0.75);
          col += vec3(1.0, 0.42, 0.09) * fireGlow * emberCore * 1.45;

          // Storm lightning flash rim illumination
          col += vec3(0.65, 0.82, 1.0) * uLightning * (0.22 + 0.45 * dome);

          gl_FragColor = vec4(col, finalAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.smokeGeo = geo;
    this.smokeMesh = new THREE.Mesh(this.smokeGeo, this.smokeMat);
    this.smokeMesh.frustumCulled = false;
    this.smokeMesh.renderOrder = 6;
    this.scene.add(this.smokeMesh);
  }

  private spawnSmoke(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    colorHex: number,
    maxLife: number,
    startScale: number,
    endScale: number,
    buoyancy: number,
    fireGlow = 0,
    windMul = 1,
  ): void {
    const p = this.smokePool[this.smokeCursor];
    this.smokeCursor = (this.smokeCursor + 1) % MAX_SMOKE;
    _smokeColorTmp.setHex(colorHex);
    p.active = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.r = _smokeColorTmp.r;
    p.g = _smokeColorTmp.g;
    p.b = _smokeColorTmp.b;
    p.life = maxLife;
    p.maxLife = maxLife;
    p.startScale = startScale;
    p.endScale = endScale;
    p.buoyancy = buoyancy;
    p.fireGlow = fireGlow;
    p.windMul = windMul;
    p.angle = Math.random() * Math.PI * 2;
    p.angVel = (Math.random() - 0.5) * 0.95;
    p.seed = Math.random() * 100;
  }

  private updateSmoke(dt: number, elapsed: number): void {
    const windX = (2.6 + this.stormIntensity * 8.5) * dt;
    const windZ = (1.5 + this.stormIntensity * 5.0) * dt;

    for (let i = 0; i < MAX_SMOKE; i++) {
      const p = this.smokePool[i];
      const i4 = i * 4;
      const i3 = i * 3;
      if (!p.active) {
        this.smokePosScaleArr[i4 + 3] = 0;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.smokePosScaleArr[i4 + 3] = 0;
        continue;
      }

      const lifeFrac = 1 - p.life / p.maxLife;
      const drag = Math.exp(-0.92 * dt);
      p.vx *= drag;
      p.vz *= drag;
      p.vy = p.vy * Math.exp(-0.45 * dt) + p.buoyancy * dt;

      // Subtle curling eddy drift as plume ascends
      const curl = Math.sin(elapsed * 1.8 + p.seed + lifeFrac * 5.0) * 1.4 * dt;
      p.x += p.vx * dt + windX * p.windMul + curl;
      p.y += p.vy * dt;
      p.z += p.vz * dt + windZ * p.windMul - curl * 0.7;
      p.angle += p.angVel * dt;

      const easeOut = 1 - (1 - lifeFrac) * (1 - lifeFrac);
      const scale = THREE.MathUtils.lerp(p.startScale, p.endScale, easeOut);

      this.smokePosScaleArr[i4] = p.x;
      this.smokePosScaleArr[i4 + 1] = p.y;
      this.smokePosScaleArr[i4 + 2] = p.z;
      this.smokePosScaleArr[i4 + 3] = scale;

      this.smokeTintArr[i3] = p.r;
      this.smokeTintArr[i3 + 1] = p.g;
      this.smokeTintArr[i3 + 2] = p.b;

      this.smokeParamsArr[i4] = p.angle;
      this.smokeParamsArr[i4 + 1] = lifeFrac;
      this.smokeParamsArr[i4 + 2] = p.fireGlow;
      this.smokeParamsArr[i4 + 3] = p.seed;
    }

    this.smokePosScaleAttr.needsUpdate = true;
    this.smokeTintAttr.needsUpdate = true;
    this.smokeParamsAttr.needsUpdate = true;
  }

  private initElemParticleSystem(): void {
    this.elemPool = [];
    for (let i = 0; i < MAX_ELEM_PARTICLES; i++) {
      this.elemPool.push({
        active: false,
        x: 0,
        y: -9999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        r0: 1,
        g0: 0.7,
        b0: 0.3,
        r1: 1,
        g1: 0.2,
        b1: 0.05,
        life: 0,
        maxLife: 0.5,
        startScale: 1,
        endScale: 3,
        gravity: 0,
        drag: 2.0,
        angle: 0,
        angVel: 0,
        kind: 0,
      });
    }

    const baseQuad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = baseQuad.index;
    geo.attributes.position = baseQuad.attributes.position;
    geo.attributes.uv = baseQuad.attributes.uv;
    baseQuad.dispose();

    this.elemPosScaleAttr = new THREE.InstancedBufferAttribute(this.elemPosScaleArr, 4);
    this.elemPosScaleAttr.setUsage(THREE.DynamicDrawUsage);
    this.elemCol0Attr = new THREE.InstancedBufferAttribute(this.elemCol0Arr, 3);
    this.elemCol0Attr.setUsage(THREE.DynamicDrawUsage);
    this.elemCol1Attr = new THREE.InstancedBufferAttribute(this.elemCol1Arr, 3);
    this.elemCol1Attr.setUsage(THREE.DynamicDrawUsage);
    this.elemParamsAttr = new THREE.InstancedBufferAttribute(this.elemParamsArr, 4);
    this.elemParamsAttr.setUsage(THREE.DynamicDrawUsage);

    geo.setAttribute('aElemPosScale', this.elemPosScaleAttr);
    geo.setAttribute('aElemCol0', this.elemCol0Attr);
    geo.setAttribute('aElemCol1', this.elemCol1Attr);
    geo.setAttribute('aElemParams', this.elemParamsAttr);
    geo.instanceCount = MAX_ELEM_PARTICLES;

    this.elemMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        attribute vec4 aElemPosScale;
        attribute vec3 aElemCol0;
        attribute vec3 aElemCol1;
        attribute vec4 aElemParams;
        varying vec2 vUv;
        varying vec3 vCol0;
        varying vec3 vCol1;
        varying vec4 vParams;
        varying float vViewDist;

        void main() {
          vUv = uv;
          vCol0 = aElemCol0;
          vCol1 = aElemCol1;
          vParams = aElemParams;

          float scale = aElemPosScale.w;
          if (scale <= 0.001) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            vViewDist = 9999.0;
            return;
          }

          float ang = aElemParams.x;
          float c = cos(ang);
          float s = sin(ang);
          vec2 rotPos = vec2(
            position.x * c - position.y * s,
            position.x * s + position.y * c
          );

          vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 worldPos = aElemPosScale.xyz + (camRight * rotPos.x + camUp * rotPos.y) * scale;

          vec4 mvPos = viewMatrix * vec4(worldPos, 1.0);
          vViewDist = -mvPos.z;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vCol0;
        varying vec3 vCol1;
        varying vec4 vParams;
        varying float vViewDist;

        void main() {
          float lifeFrac = clamp(vParams.y, 0.0, 1.0);
          float kind = vParams.z;
          vec2 p = (vUv - 0.5) * 2.0;
          float r = length(p);
          if (r > 1.0) discard;

          float shape = 0.0;
          if (kind < 0.5) {
            // Kind 0: Intense blazing plasma/ember orb with bright hot nucleus
            float core = exp(-r * r * 7.8);
            float halo = pow(max(0.0, 1.0 - r), 1.9);
            float flicker = 0.86 + 0.14 * sin(uTime * 19.0 + vParams.w);
            shape = (core * 1.15 + halo * 0.58) * flicker;
          } else if (kind < 1.5) {
            // Kind 1: Faceted crystal shard / razor spark needle
            float diamond = abs(p.x) * 3.1 + abs(p.y) * 0.92;
            float shard = smoothstep(1.0, 0.16, diamond);
            float glint = exp(-diamond * diamond * 4.5);
            shape = shard * 0.72 + glint * 0.95;
          } else {
            // Kind 2: Expanding elemental shock halo / cryo mist wave
            float ring = smoothstep(0.98, 0.62, r) * smoothstep(0.18, 0.68, r);
            float softFill = smoothstep(0.96, 0.05, r) * 0.42;
            shape = ring * 0.85 + softFill;
          }

          float fadeIn = smoothstep(0.0, 0.06, lifeFrac);
          float fadeOut = pow(max(0.0, 1.0 - lifeFrac), 1.32);
          float nearFade = smoothstep(1.2, 5.5, vViewDist);
          float alpha = clamp(shape * fadeIn * fadeOut * nearFade, 0.0, 1.0);
          if (alpha < 0.008) discard;

          vec3 col = mix(vCol0, vCol1, smoothstep(0.0, 0.85, lifeFrac));
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.elemGeo = geo;
    this.elemMesh = new THREE.Mesh(this.elemGeo, this.elemMat);
    this.elemMesh.frustumCulled = false;
    this.elemMesh.renderOrder = 7;
    this.scene.add(this.elemMesh);
  }

  private spawnElemParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    colorStartHex: number,
    colorEndHex: number,
    maxLife: number,
    startScale: number,
    endScale: number,
    gravity: number,
    drag: number,
    kind: 0 | 1 | 2,
    angle = Math.random() * Math.PI * 2,
    angVel = (Math.random() - 0.5) * 8,
  ): void {
    const p = this.elemPool[this.elemCursor];
    this.elemCursor = (this.elemCursor + 1) % MAX_ELEM_PARTICLES;
    _elemColorA.setHex(colorStartHex);
    _elemColorB.setHex(colorEndHex);
    p.active = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.r0 = _elemColorA.r;
    p.g0 = _elemColorA.g;
    p.b0 = _elemColorA.b;
    p.r1 = _elemColorB.r;
    p.g1 = _elemColorB.g;
    p.b1 = _elemColorB.b;
    p.life = maxLife;
    p.maxLife = maxLife;
    p.startScale = startScale;
    p.endScale = endScale;
    p.gravity = gravity;
    p.drag = drag;
    p.kind = kind;
    p.angle = angle;
    p.angVel = angVel;
  }

  private spawnElementalCollisionBurst(
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    element: ElementType,
    intensity = 1.0,
    isDragonHit = false,
  ): void {
    _burstNorm.copy(normal);
    if (_burstNorm.lengthSq() > 0.001) {
      _burstNorm.normalize();
    } else {
      _burstNorm.set(0, 1, 0);
    }

    // Orthonormal tangent frame around impact normal (zero GC)
    if (Math.abs(_burstNorm.y) < 0.92) {
      _burstTanA.crossVectors(_burstNorm, _unitY).normalize();
    } else {
      _burstTanA.crossVectors(_burstNorm, _unitX).normalize();
    }
    _burstTanB.crossVectors(_burstNorm, _burstTanA).normalize();

    const scaleMul = intensity * (isDragonHit ? 1.18 : 1.0);

    if (element === 'fire') {
      this.triggerVfxFlash(pos, 0xff7b1c, 0.95 * intensity);
      this.spawnShockwaveRing(
        pos,
        _burstNorm,
        1.5 * intensity,
        (isDragonHit ? 13.5 : 10.5) * intensity,
        0xff6b1a,
        0.4,
      );
      this.spawnSparkBurst(pos, _burstNorm, Math.round(12 * intensity), 0xffad33, 1.15);

      const orbCount = Math.round(14 * intensity);
      for (let i = 0; i < orbCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spread = 0.35 + Math.random() * 0.95;
        _burstDir
          .copy(_burstNorm)
          .multiplyScalar(0.55 + Math.random() * 0.65)
          .addScaledVector(_burstTanA, Math.cos(ang) * spread)
          .addScaledVector(_burstTanB, Math.sin(ang) * spread)
          .normalize();
        const spd = (14 + Math.random() * 24) * scaleMul;
        this.spawnElemParticle(
          pos.x + (Math.random() - 0.5) * 1.6,
          pos.y + (Math.random() - 0.5) * 1.6,
          pos.z + (Math.random() - 0.5) * 1.6,
          _burstDir.x * spd,
          _burstDir.y * spd + 3,
          _burstDir.z * spd,
          0xfff3b0,
          0xff4800,
          0.38 + Math.random() * 0.34,
          (1.6 + Math.random() * 1.2) * scaleMul,
          (4.6 + Math.random() * 2.8) * scaleMul,
          -10,
          2.6,
          0,
        );
      }

      const needleCount = Math.round(16 * intensity);
      for (let i = 0; i < needleCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spread = 0.5 + Math.random() * 1.2;
        _burstDir
          .copy(_burstNorm)
          .multiplyScalar(0.35 + Math.random() * 0.6)
          .addScaledVector(_burstTanA, Math.cos(ang) * spread)
          .addScaledVector(_burstTanB, Math.sin(ang) * spread)
          .normalize();
        const spd = (26 + Math.random() * 34) * scaleMul;
        this.spawnElemParticle(
          pos.x,
          pos.y,
          pos.z,
          _burstDir.x * spd,
          _burstDir.y * spd,
          _burstDir.z * spd,
          0xffe596,
          0xd92600,
          0.32 + Math.random() * 0.36,
          (0.85 + Math.random() * 0.6) * scaleMul,
          0.35,
          16,
          1.4,
          1,
          ang,
          (Math.random() - 0.5) * 14,
        );
      }

      const smokeCount = isDragonHit ? 4 : 3;
      for (let i = 0; i < smokeCount; i++) {
        this.spawnSmoke(
          pos.x + (Math.random() - 0.5) * 2.2,
          pos.y + (Math.random() - 0.5) * 2.0,
          pos.z + (Math.random() - 0.5) * 2.2,
          (Math.random() - 0.5) * 12,
          4 + Math.random() * 8,
          (Math.random() - 0.5) * 12,
          0x261f1c,
          1.3 + Math.random() * 0.7,
          2.1 * scaleMul,
          7.6 * scaleMul,
          4.2,
          0.9,
          0.7,
        );
      }
    } else if (element === 'ice') {
      this.triggerVfxFlash(pos, 0x7dd3fc, 0.88 * intensity);
      this.spawnShockwaveRing(
        pos,
        _burstNorm,
        1.4 * intensity,
        (isDragonHit ? 12.5 : 9.8) * intensity,
        0xbaf2ff,
        0.44,
      );
      this.spawnSparkBurst(pos, _burstNorm, Math.round(12 * intensity), 0xe0f7ff, 1.05);

      // Shattering diamond ice shards
      const shardCount = Math.round(18 * intensity);
      for (let i = 0; i < shardCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spread = 0.4 + Math.random() * 1.15;
        _burstDir
          .copy(_burstNorm)
          .multiplyScalar(0.4 + Math.random() * 0.7)
          .addScaledVector(_burstTanA, Math.cos(ang) * spread)
          .addScaledVector(_burstTanB, Math.sin(ang) * spread)
          .normalize();
        const spd = (20 + Math.random() * 30) * scaleMul;
        this.spawnElemParticle(
          pos.x + (Math.random() - 0.5) * 1.2,
          pos.y + (Math.random() - 0.5) * 1.2,
          pos.z + (Math.random() - 0.5) * 1.2,
          _burstDir.x * spd,
          _burstDir.y * spd,
          _burstDir.z * spd,
          0xffffff,
          0x38bdf8,
          0.42 + Math.random() * 0.32,
          (1.25 + Math.random() * 0.9) * scaleMul,
          (0.6 + Math.random() * 0.5) * scaleMul,
          14,
          1.7,
          1,
          ang,
          (Math.random() - 0.5) * 12,
        );
      }

      // Expanding cryo-frost mist & halo waves
      const mistCount = Math.round(11 * intensity);
      for (let i = 0; i < mistCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spread = 0.45 + Math.random() * 0.9;
        _burstDir
          .copy(_burstNorm)
          .multiplyScalar(0.3)
          .addScaledVector(_burstTanA, Math.cos(ang) * spread)
          .addScaledVector(_burstTanB, Math.sin(ang) * spread)
          .normalize();
        const spd = (8 + Math.random() * 14) * scaleMul;
        this.spawnElemParticle(
          pos.x + (Math.random() - 0.5) * 1.8,
          pos.y + (Math.random() - 0.5) * 1.8,
          pos.z + (Math.random() - 0.5) * 1.8,
          _burstDir.x * spd,
          _burstDir.y * spd - 1.2,
          _burstDir.z * spd,
          0xe0f7ff,
          0x1d4ed8,
          0.5 + Math.random() * 0.38,
          (1.5 + Math.random() * 0.8) * scaleMul,
          (5.2 + Math.random() * 2.4) * scaleMul,
          2.2,
          3.1,
          2,
        );
      }

      for (let i = 0; i < 3; i++) {
        this.spawnSmoke(
          pos.x + (Math.random() - 0.5) * 2.0,
          pos.y + (Math.random() - 0.5) * 2.0,
          pos.z + (Math.random() - 0.5) * 2.0,
          (Math.random() - 0.5) * 9,
          1.5 + Math.random() * 4,
          (Math.random() - 0.5) * 9,
          0xc5e8ff,
          1.15 + Math.random() * 0.5,
          2.0 * scaleMul,
          6.8 * scaleMul,
          -0.6,
          0,
          0.65,
        );
      }
    } else {
      // Element === 'rock' : molten magma bursts, pulverized glowing stone shards, shock halos & debris
      this.triggerVfxFlash(pos, 0xfbbf24, 1.05 * intensity);
      this.spawnShockwaveRing(
        pos,
        _burstNorm,
        1.8 * intensity,
        (isDragonHit ? 15 : 12.5) * intensity,
        0xf59e0b,
        0.46,
      );
      this.spawnSparkBurst(pos, _burstNorm, Math.round(15 * intensity), 0xfbbf24, 1.25);

      const coreCount = Math.round(12 * intensity);
      for (let i = 0; i < coreCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spread = 0.4 + Math.random() * 0.9;
        _burstDir
          .copy(_burstNorm)
          .multiplyScalar(0.5 + Math.random() * 0.6)
          .addScaledVector(_burstTanA, Math.cos(ang) * spread)
          .addScaledVector(_burstTanB, Math.sin(ang) * spread)
          .normalize();
        const spd = (12 + Math.random() * 20) * scaleMul;
        this.spawnElemParticle(
          pos.x + (Math.random() - 0.5) * 1.8,
          pos.y + (Math.random() - 0.5) * 1.8,
          pos.z + (Math.random() - 0.5) * 1.8,
          _burstDir.x * spd,
          _burstDir.y * spd + 2,
          _burstDir.z * spd,
          0xfef08a,
          0xc2410c,
          0.38 + Math.random() * 0.3,
          (1.8 + Math.random() * 1.1) * scaleMul,
          (5.0 + Math.random() * 2.5) * scaleMul,
          8,
          2.4,
          0,
        );
      }

      const rockShardCount = Math.round(18 * intensity);
      for (let i = 0; i < rockShardCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spread = 0.45 + Math.random() * 1.2;
        _burstDir
          .copy(_burstNorm)
          .multiplyScalar(0.4 + Math.random() * 0.7)
          .addScaledVector(_burstTanA, Math.cos(ang) * spread)
          .addScaledVector(_burstTanB, Math.sin(ang) * spread)
          .normalize();
        const spd = (24 + Math.random() * 32) * scaleMul;
        this.spawnElemParticle(
          pos.x,
          pos.y,
          pos.z,
          _burstDir.x * spd,
          _burstDir.y * spd + 4,
          _burstDir.z * spd,
          0xfbbf24,
          0x574c41,
          0.45 + Math.random() * 0.35,
          (1.1 + Math.random() * 0.8) * scaleMul,
          0.5,
          26,
          1.2,
          1,
          ang,
          (Math.random() - 0.5) * 16,
        );
      }

      const haloCount = Math.round(7 * intensity);
      for (let i = 0; i < haloCount; i++) {
        this.spawnElemParticle(
          pos.x + (Math.random() - 0.5) * 2.0,
          pos.y + (Math.random() - 0.5) * 1.5,
          pos.z + (Math.random() - 0.5) * 2.0,
          (Math.random() - 0.5) * 12,
          2 + Math.random() * 6,
          (Math.random() - 0.5) * 12,
          0xd6b88d,
          0x4a4035,
          0.48 + Math.random() * 0.3,
          2.0 * scaleMul,
          7.5 * scaleMul,
          4,
          3.2,
          2,
        );
      }

      if (isDragonHit) {
        this.spawnDebris(pos, 5, 'stone', 18, 0.58, _burstNorm);
        this.spawnDebris(pos, 3, 'ember', 16, 0.55, _burstNorm);
      }

      for (let i = 0; i < 4; i++) {
        this.spawnSmoke(
          pos.x + (Math.random() - 0.5) * 2.4,
          pos.y + (Math.random() - 0.5) * 2.0,
          pos.z + (Math.random() - 0.5) * 2.4,
          (Math.random() - 0.5) * 14,
          3 + Math.random() * 7,
          (Math.random() - 0.5) * 14,
          0x574c41,
          1.4 + Math.random() * 0.6,
          2.4 * scaleMul,
          8.4 * scaleMul,
          2.6,
          0.52,
          0.7,
        );
      }
    }
  }

  private updateElemParticles(dt: number, elapsed: number): void {
    this.elemMat.uniforms.uTime.value = elapsed;

    for (let i = 0; i < MAX_ELEM_PARTICLES; i++) {
      const p = this.elemPool[i];
      const i4 = i * 4;
      const i3 = i * 3;
      if (!p.active) {
        this.elemPosScaleArr[i4 + 3] = 0;
        continue;
      }

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.elemPosScaleArr[i4 + 3] = 0;
        continue;
      }

      const lifeFrac = 1 - p.life / p.maxLife;
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp;
      p.vz *= damp;
      p.vy = p.vy * damp - p.gravity * dt;

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.angle += p.angVel * dt;

      const ease = 1 - (1 - lifeFrac) * (1 - lifeFrac);
      const scale = THREE.MathUtils.lerp(p.startScale, p.endScale, ease);

      this.elemPosScaleArr[i4] = p.x;
      this.elemPosScaleArr[i4 + 1] = p.y;
      this.elemPosScaleArr[i4 + 2] = p.z;
      this.elemPosScaleArr[i4 + 3] = scale;

      this.elemCol0Arr[i3] = p.r0;
      this.elemCol0Arr[i3 + 1] = p.g0;
      this.elemCol0Arr[i3 + 2] = p.b0;

      this.elemCol1Arr[i3] = p.r1;
      this.elemCol1Arr[i3 + 1] = p.g1;
      this.elemCol1Arr[i3 + 2] = p.b1;

      this.elemParamsArr[i4] = p.angle;
      this.elemParamsArr[i4 + 1] = lifeFrac;
      this.elemParamsArr[i4 + 2] = p.kind;
      this.elemParamsArr[i4 + 3] = i * 1.13;
    }

    this.elemPosScaleAttr.needsUpdate = true;
    this.elemCol0Attr.needsUpdate = true;
    this.elemCol1Attr.needsUpdate = true;
    this.elemParamsAttr.needsUpdate = true;
  }

  private initWaterWakeSystem(): void {
    this.waterWakePool = [];
    for (let i = 0; i < MAX_WATER_WAKES; i++) {
      this.waterWakePool.push({
        active: false,
        x: 0,
        z: -9999,
        vx: 0,
        vz: 0,
        life: 0,
        maxLife: 1.5,
        startScale: 3,
        endScale: 16,
        angle: 0,
        angVel: 0,
        kind: 0,
        spin: 1,
      });
    }

    const baseQuad = new THREE.PlaneGeometry(1, 1);
    baseQuad.rotateX(-Math.PI / 2);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = baseQuad.index;
    geo.attributes.position = baseQuad.attributes.position;
    geo.attributes.uv = baseQuad.attributes.uv;
    baseQuad.dispose();

    this.waterWakePosScaleAttr = new THREE.InstancedBufferAttribute(this.waterWakePosScaleArr, 4);
    this.waterWakePosScaleAttr.setUsage(THREE.DynamicDrawUsage);
    this.waterWakeParamsAttr = new THREE.InstancedBufferAttribute(this.waterWakeParamsArr, 4);
    this.waterWakeParamsAttr.setUsage(THREE.DynamicDrawUsage);

    geo.setAttribute('aWakePosScale', this.waterWakePosScaleAttr);
    geo.setAttribute('aWakeParams', this.waterWakeParamsAttr);
    geo.instanceCount = MAX_WATER_WAKES;

    this.waterWakeMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        attribute vec4 aWakePosScale;
        attribute vec4 aWakeParams;
        varying vec2 vUv;
        varying vec4 vParams;
        varying float vViewDist;

        void main() {
          vUv = uv;
          vParams = aWakeParams;

          float scale = aWakePosScale.w;
          if (scale <= 0.001) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            vViewDist = 9999.0;
            return;
          }

          float ang = aWakeParams.x;
          float c = cos(ang);
          float s = sin(ang);
          vec3 localPos = position * scale;
          vec3 rotPos = vec3(
            localPos.x * c - localPos.z * s,
            localPos.y,
            localPos.x * s + localPos.z * c
          );
          vec3 worldPos = vec3(aWakePosScale.x, aWakePosScale.y, aWakePosScale.z) + rotPos;
          vec4 mvPos = viewMatrix * vec4(worldPos, 1.0);
          vViewDist = -mvPos.z;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying vec4 vParams;
        varying float vViewDist;

        void main() {
          float lifeFrac = clamp(vParams.y, 0.0, 1.0);
          float kind = vParams.z;
          float spin = vParams.w;
          vec2 p = (vUv - 0.5) * 2.0;
          float r = length(p);
          if (r > 1.0) discard;

          float theta = atan(p.y, p.x);
          float alpha = 0.0;
          vec3 col = vec3(0.74, 0.91, 0.98);

          if (kind < 0.5) {
            // Kind 0: Expanding concentric water wave crest ring
            float crestA = exp(-pow(r - (0.76 - lifeFrac * 0.08), 2.0) * 65.0);
            float crestB = exp(-pow(r - 0.50, 2.0) * 48.0) * 0.58;
            float breakup = 0.72 + 0.28 * sin(theta * 8.0 + uTime * 3.0 * spin);
            alpha = (crestA + crestB) * breakup;
            col = mix(vec3(0.32, 0.72, 0.84), vec3(0.88, 0.96, 1.0), clamp(crestA * 1.15, 0.0, 1.0));
          } else if (kind < 1.5) {
            // Kind 1: Swirling 3-arm logarithmic water vortex (wingtip downwash eddy)
            float spiralPhase = theta * 3.0 * spin - r * 9.5 - uTime * 5.2 * spin;
            float arms = pow(max(0.0, 0.5 + 0.5 * cos(spiralPhase)), 1.7);
            float ringFade = smoothstep(1.0, 0.28, r) * smoothstep(0.05, 0.24, r);
            float centerCore = exp(-r * r * 14.0) * 0.55;
            alpha = (arms * ringFade * 0.88 + centerCore);
            col = mix(vec3(0.24, 0.66, 0.79), vec3(0.85, 0.95, 1.0), clamp(arms * ringFade + centerCore, 0.0, 1.0));
          } else {
            // Kind 2: Turbulent frothy wake trail foam patch
            float stretch = exp(-(p.x * p.x * 3.6 + p.y * p.y * 1.15));
            float froth = 0.55 + 0.45 * sin(p.y * 14.0 - uTime * 6.5) * cos(p.x * 16.0);
            alpha = stretch * froth * 0.85;
            col = mix(vec3(0.38, 0.76, 0.86), vec3(0.92, 0.98, 1.0), stretch);
          }

          float fadeIn = smoothstep(0.0, 0.10, lifeFrac);
          float fadeOut = pow(max(0.0, 1.0 - lifeFrac), 1.35);
          float distFade = exp(-vViewDist * 0.00045);
          float finalAlpha = clamp(alpha * fadeIn * fadeOut * distFade * 0.82, 0.0, 0.88);
          if (finalAlpha < 0.01) discard;

          gl_FragColor = vec4(col, finalAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.waterWakeGeo = geo;
    this.waterWakeMesh = new THREE.Mesh(this.waterWakeGeo, this.waterWakeMat);
    this.waterWakeMesh.frustumCulled = false;
    this.waterWakeMesh.renderOrder = 3;
    this.scene.add(this.waterWakeMesh);
  }

  private spawnWaterWake(
    x: number,
    z: number,
    vx: number,
    vz: number,
    maxLife: number,
    startScale: number,
    endScale: number,
    kind: 0 | 1 | 2,
    spin: -1 | 1 = 1,
    angle = Math.random() * Math.PI * 2,
  ): void {
    const w = this.waterWakePool[this.waterWakeCursor];
    this.waterWakeCursor = (this.waterWakeCursor + 1) % MAX_WATER_WAKES;
    w.active = true;
    w.x = x;
    w.z = z;
    w.vx = vx;
    w.vz = vz;
    w.life = maxLife;
    w.maxLife = maxLife;
    w.startScale = startScale;
    w.endScale = endScale;
    w.kind = kind;
    w.spin = spin;
    w.angle = angle;
    w.angVel = kind === 1 ? spin * (2.6 + Math.random() * 1.4) : spin * 0.35;
  }

  private updateWaterWakes(dt: number, elapsed: number): void {
    this.waterWakeMat.uniforms.uTime.value = elapsed;

    // Reset wake intensity smoothly if not actively flying over water
    if (this.phase !== 'flying') {
      this.oceanWakeIntensity = THREE.MathUtils.damp(this.oceanWakeIntensity, 0, 2.5, dt);
    }

    // Subtle wakes from low-skimming AI dragons over open sea
    if (Math.random() < 0.35) {
      for (const ai of this.aiDragons) {
        if (!ai.alive || ai.pos.y > 14.0) continue;
        if (getTerrainHeight(ai.pos.x, ai.pos.z) < -0.5) {
          this.spawnWaterWake(
            ai.pos.x,
            ai.pos.z,
            0,
            0,
            1.35,
            3.5,
            16.0,
            Math.random() < 0.55 ? 0 : 1,
            Math.random() < 0.5 ? 1 : -1,
          );
          break;
        }
      }
    }

    for (let i = 0; i < MAX_WATER_WAKES; i++) {
      const w = this.waterWakePool[i];
      const i4 = i * 4;
      if (!w.active) {
        this.waterWakePosScaleArr[i4 + 3] = 0;
        continue;
      }

      w.life -= dt;
      if (w.life <= 0) {
        w.active = false;
        this.waterWakePosScaleArr[i4 + 3] = 0;
        continue;
      }

      const lifeFrac = 1 - w.life / w.maxLife;
      const drag = Math.exp(-1.5 * dt);
      w.vx *= drag;
      w.vz *= drag;
      w.x += w.vx * dt;
      w.z += w.vz * dt;
      w.angle += w.angVel * dt;

      const easeOut = 1 - (1 - lifeFrac) * (1 - lifeFrac);
      const scale = THREE.MathUtils.lerp(w.startScale, w.endScale, easeOut);
      // Track ocean swell gently so wakes ride the surface waves cleanly
      const swellY =
        0.34 +
        Math.sin(w.x * 0.02 + elapsed * 1.35) * Math.cos(w.z * 0.02 + elapsed * 1.1) * 0.48;

      this.waterWakePosScaleArr[i4] = w.x;
      this.waterWakePosScaleArr[i4 + 1] = swellY;
      this.waterWakePosScaleArr[i4 + 2] = w.z;
      this.waterWakePosScaleArr[i4 + 3] = scale;

      this.waterWakeParamsArr[i4] = w.angle;
      this.waterWakeParamsArr[i4 + 1] = lifeFrac;
      this.waterWakeParamsArr[i4 + 2] = w.kind;
      this.waterWakeParamsArr[i4 + 3] = w.spin;
    }

    this.waterWakePosScaleAttr.needsUpdate = true;
    this.waterWakeParamsAttr.needsUpdate = true;
  }

  private computeZoneName(): string {
    let closestName = 'فوق البحر المفتوح';
    let bestScore = 1;
    for (const lm of WORLD_LANDMARKS) {
      const zoneRadius =
        lm.id === 'volcanic_archipelago' || lm.id === 'enchanted_forest' ? 320 : 185;
      const d = Math.hypot(this.playerPos.x - lm.x, this.playerPos.z - lm.z);
      const norm = d / zoneRadius;
      if (norm < bestScore) {
        bestScore = norm;
        closestName = lm.nameAr;
      }
    }
    return closestName;
  }

  private dampCameraUp(targetUp: THREE.Vector3, rate: number, dt: number): void {
    this.camera.up.lerp(targetUp, 1 - Math.exp(-rate * dt));
    if (this.camera.up.lengthSq() < 1e-4) {
      this.camera.up.copy(targetUp);
    }
    if (this.camera.up.lengthSq() < 1e-4) {
      this.camera.up.set(0, 1, 0);
    } else {
      this.camera.up.normalize();
    }
  }

  private emitHud(isSkimmingWater = false, isSlicingCloud = false): void {
    const indicators: EnemyIndicator[] = [];
    if (this.mode === 'combat' && this.phase === 'flying') {
      const w = Math.max(1, this.container.clientWidth || window.innerWidth || 1280);
      const h = Math.max(1, this.container.clientHeight || window.innerHeight || 720);
      this.camera.updateMatrixWorld();
      for (const ai of this.aiDragons) {
        if (!ai.alive) continue;
        const dist = ai.pos.distanceTo(this.playerPos);
        if (!Number.isFinite(dist) || dist > 360) continue;
        _projVec.copy(ai.pos).project(this.camera);
        const screenX = (_projVec.x + 1) * 0.5 * w;
        const screenY = (-_projVec.y + 1) * 0.5 * h;
        const visible =
          Number.isFinite(_projVec.z) &&
          Number.isFinite(screenX) &&
          Number.isFinite(screenY) &&
          _projVec.z < 1 &&
          _projVec.z > -1;
        indicators.push({
          id: ai.id,
          nameAr: ai.nameAr,
          screenX: Number.isFinite(screenX) ? screenX : -9999,
          screenY: Number.isFinite(screenY) ? screenY : -9999,
          visible,
          hp: Math.max(0, Math.round(ai.hp)),
          maxHp: ai.maxHp,
          distance: Math.round(dist),
          canBoard: ai.team === 'enemy' && dist < 42,
          isAlly: ai.team === 'ally',
        });
      }
    }

    const boardable = this.findBoardableEnemy();
    const alliesAlive = this.aiDragons.filter((d) => d.team === 'ally' && d.alive).length;
    const enemiesAlive = this.aiDragons.filter((d) => d.team === 'enemy' && d.alive).length;
    const activeAlt =
      this.phase === 'skydiving' || this.phase === 'on_foot'
        ? this.riderPos.y
        : this.playerPos.y;

    this.onHudUpdate({
      phase: this.phase,
      mode: this.mode,
      dragonId: this.dragonId,
      activeElement: this.activeElement,
      hp: Math.round(this.hp),
      maxHp: this.maxHp,
      energy: Math.round(this.energy),
      maxEnergy: this.maxEnergy,
      bondLevel: Math.round(this.bondLevel),
      speed: Math.round(this.playerSpeed),
      altitude: Math.max(0, Math.round(activeAlt)),
      zoneNameAr: this.computeZoneName(),
      isSkimmingWater,
      isSlicingCloud,
      nearSanctuary:
        this.playerPos.distanceTo(this.world.sanctuaryDragonPerch) < 65,
      boardableEnemyId: boardable?.id ?? null,
      boardableEnemyName: boardable?.nameAr ?? null,
      boardingHits: this.boardingHits,
      boardingHitsRequired: this.boardingHitsRequired,
      allyScore: this.allyScore,
      enemyScore: this.enemyScore,
      alliesAlive,
      enemiesAlive,
      indicators,
      toastMessage: this.toastMessage,
      woundsCount: this.woundsCount,
      pointerLocked: this.pointerLocked,
      weather: this.currentWeather,
      weatherMode: this.weatherMode,
      stormIntensity: Math.max(this.stormIntensity, this.volcanicZoneFactor * 0.85),
      lightningActive: Math.max(this.lightningPower, this.volcanicLightningPower) > 0.14,
      cameraView: this.cameraView,
      isLooping: this.halfLoopRemaining > 0.05,
      knifeEdgeSide: this.knifeEdgeSide,
      maneuverKind: this.phase === 'flying' && !this.playerCrashing ? this.maneuverKind : 'none',
      maneuverSide: this.phase === 'flying' && !this.playerCrashing ? this.maneuverSide : 0,
      maneuverIntensity:
        this.phase === 'flying' && !this.playerCrashing ? this.maneuverIntensity : 0,
      bankAngleDeg:
        this.phase === 'flying' ? Math.round(THREE.MathUtils.radToDeg(this.playerRoll)) : 0,
      motionBlurIntensity: Number(this.motionBlurIntensity.toFixed(3)),
      isBoosting: this.boostVisualFactor > 0.18,
      nearLandedDragon:
        this.phase === 'on_foot' &&
        this.riderPos.distanceTo(this.landedDragonPos) < 16,
      isInWater: this.phase === 'skydiving' && this.skydiveState === 'in_water',
      warType: this.warType,
      warTimeLeft: Math.ceil(this.warTimeLeft),
      warDuration: this.warDuration,
      warStatus: this.warStatus,
      warDragonsKilled: this.warDragonsKilled,
      warDragonsGoal: this.warDragonsGoal,
      warShipsSunk: this.warShipsSunk,
      warShipsGoal: this.warShipsGoal,
      progression: {
        ...this.progression,
        knightUpgrades: { ...this.progression.knightUpgrades },
        dragonUpgrades: { ...this.progression.dragonUpgrades },
      },
      dangerAlertActive: this.dangerAlertTimer > 0,
      activeLoreTaleId: this.activeLoreTaleId,
      activeLoreSegment: this.activeLoreSegment,
      isLorePlaying: this.isLorePlaying,
      knightSpeechText: this.knightSpeechText,
    });
  }

  private spawnDebris(
    center: THREE.Vector3,
    count: number,
    kind: DebrisKind,
    spreadSpeed: number,
    scaleMul: number,
    impactVel?: THREE.Vector3,
  ): void {
    const mat =
      kind === 'stone'
        ? this.stoneDebrisMat
        : kind === 'palace'
          ? this.palaceDebrisMat
          : kind === 'wood'
            ? this.woodDebrisMat
            : kind === 'char_wood'
              ? this.charWoodDebrisMat
              : kind === 'ember'
                ? this.emberDebrisMat
                : kind === 'ice'
                  ? this.iceDebrisMat
                  : this.leafDebrisMat;

    const dirKickX = impactVel ? THREE.MathUtils.clamp(impactVel.x * 0.28, -24, 24) : 0;
    const dirKickZ = impactVel ? THREE.MathUtils.clamp(impactVel.z * 0.28, -24, 24) : 0;

    for (let i = 0; i < count; i++) {
      if (this.debris.length > 260) break;

      const geo =
        kind === 'stone' || kind === 'palace'
          ? i % 2 === 0
            ? this.stoneShardGeo
            : this.masonryBlockGeo
          : kind === 'wood' || kind === 'char_wood'
            ? this.woodPlankGeo
            : kind === 'ember'
              ? this.emberChunkGeo
              : kind === 'ice'
                ? this.iceShardGeo
                : this.palmFrondGeo;

      const mesh = new THREE.Mesh(geo, mat);
      const baseScale = (0.55 + Math.random() * 1.15) * scaleMul;
      mesh.scale.set(
        baseScale * (0.65 + Math.random() * 0.8),
        baseScale * (kind === 'leaf' || kind === 'wood' || kind === 'char_wood' ? 0.85 : 0.65 + Math.random() * 0.7),
        baseScale * (0.7 + Math.random() * 0.85),
      );
      mesh.position.set(
        center.x + (Math.random() - 0.5) * 6.5,
        center.y + (Math.random() - 0.2) * 5.5,
        center.z + (Math.random() - 0.5) * 6.5,
      );
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      mesh.castShadow = !this.isSoftwareGl;
      this.scene.add(mesh);
      this.debris.push({
        mesh,
        vel: new THREE.Vector3(
          dirKickX + (Math.random() - 0.5) * spreadSpeed * 2.1,
          8 + Math.random() * spreadSpeed * 1.05,
          dirKickZ + (Math.random() - 0.5) * spreadSpeed * 2.1,
        ),
        rotVel: new THREE.Vector3(
          (Math.random() - 0.5) * 11,
          (Math.random() - 0.5) * 11,
          (Math.random() - 0.5) * 11,
        ),
        life: 4.0 + Math.random() * 1.6,
        maxLife: 5.2,
        baseScale,
        kind,
        bounced: false,
        floating: false,
        burning: kind === 'ember' || (kind === 'char_wood' && i % 2 === 0),
      });
    }
  }

  private updateDebris(dt: number, elapsed: number): void {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        this.debris.splice(i, 1);
        continue;
      }

      if (d.floating) {
        // Buoyant charred ship planks bob on ocean swells while fading
        d.vel.x *= Math.exp(-1.8 * dt);
        d.vel.z *= Math.exp(-1.8 * dt);
        d.mesh.position.x += d.vel.x * dt;
        d.mesh.position.z += d.vel.z * dt;
        d.mesh.position.y = Math.sin(elapsed * 2.1 + i * 0.7) * 0.35 + 0.12;
        d.mesh.rotation.z = Math.sin(elapsed * 1.6 + i) * 0.14;
      } else {
        d.vel.y -= 34 * dt;
        d.vel.multiplyScalar(1 - 0.14 * dt);
        d.mesh.position.addScaledVector(d.vel, dt);
        d.mesh.rotation.x += d.rotVel.x * dt;
        d.mesh.rotation.y += d.rotVel.y * dt;
        d.mesh.rotation.z += d.rotVel.z * dt;

        // Burning embers & charred planks leave realistic curling smoke wisps in mid-air
        if (d.burning && Math.random() < 0.34) {
          this.spawnSmoke(
            d.mesh.position.x,
            d.mesh.position.y,
            d.mesh.position.z,
            (Math.random() - 0.5) * 2.5,
            3 + Math.random() * 4,
            (Math.random() - 0.5) * 2.5,
            d.kind === 'ember' ? 0x261c18 : 0x2f343c,
            1.25,
            1.6,
            6.2,
            2.4,
            d.kind === 'ember' ? 0.72 : 0.25,
            0.7,
          );
        }

        const gY = getTerrainHeight(d.mesh.position.x, d.mesh.position.z);
        const overWater = gY < -0.5;
        const floorY = overWater ? 0.15 : gY + 0.45;
        if (d.mesh.position.y < floorY) {
          d.mesh.position.y = floorY;
          if (overWater) {
            if (!d.bounced) {
              d.bounced = true;
              this.spawnParticle(
                d.mesh.position.x,
                0.7,
                d.mesh.position.z,
                (Math.random() - 0.5) * 4,
                5 + Math.random() * 5,
                (Math.random() - 0.5) * 4,
                0xdbf4ff,
                0.65,
                1.2,
                3.6,
                14,
              );
            }
            if (d.kind === 'wood' || d.kind === 'char_wood' || d.kind === 'leaf') {
              d.floating = true;
              d.burning = false;
              d.vel.y = 0;
            } else {
              d.vel.y *= 0.25;
              d.vel.x *= 0.5;
              d.vel.z *= 0.5;
              d.life = Math.min(d.life, 0.35);
            }
          } else {
            // Reflect debris off real mountain/ground slope normals so rocks tumble downhill!
            if (!d.bounced) {
              d.bounced = true;
              this.spawnParticle(
                d.mesh.position.x,
                floorY + 0.4,
                d.mesh.position.z,
                (Math.random() - 0.5) * 5,
                3 + Math.random() * 4,
                (Math.random() - 0.5) * 5,
                0x8c7b65,
                0.68,
                1.3,
                3.8,
                3,
              );
            }
            if (d.vel.y < -3) {
              const hL = getTerrainHeight(d.mesh.position.x - 1.5, d.mesh.position.z);
              const hR = getTerrainHeight(d.mesh.position.x + 1.5, d.mesh.position.z);
              const hD = getTerrainHeight(d.mesh.position.x, d.mesh.position.z - 1.5);
              const hU = getTerrainHeight(d.mesh.position.x, d.mesh.position.z + 1.5);
              _normal.set(hL - hR, 3.0, hD - hU).normalize();
              const vn = d.vel.dot(_normal);
              if (vn < 0) {
                d.vel.addScaledVector(_normal, -1.36 * vn);
              }
              d.vel.multiplyScalar(0.68);
              d.rotVel.multiplyScalar(0.65);
            } else {
              d.vel.set(0, 0, 0);
              d.rotVel.set(0, 0, 0);
            }
          }
        }
      }

      if (d.life < 0.7) {
        d.mesh.scale.multiplyScalar(Math.max(0.84, 1 - dt * 1.6));
      }
    }
  }

  private damageBuilding(
    b: DestructibleBuilding,
    dmg: number,
    byAlly = true,
    impactVel?: THREE.Vector3,
    element: ElementType | 'ram' = 'ram',
  ): void {
    if (b.destroyed) return;
    b.hp -= dmg;
    const kind = b.id.startsWith('palace') ? 'palace' : 'stone';
    const dmgRatio = THREE.MathUtils.clamp(1 - b.hp / b.maxHp, 0, 1);

    // Progressive physical buckling & leaning under impacts
    const tiltDirX = impactVel ? Math.sign(impactVel.z || 1) : b.pos.x >= 0 ? 1 : -1;
    const tiltDirZ = impactVel ? Math.sign(-impactVel.x || 1) : b.pos.z >= 0 ? -1 : 1;
    b.mesh.rotation.x = b.baseMeshRot.x + tiltDirX * dmgRatio * 0.16;
    b.mesh.rotation.z = b.baseMeshRot.z + tiltDirZ * dmgRatio * 0.16;
    b.mesh.position.y = b.baseMeshPos.y - dmgRatio * 2.8;

    // Snap off distinct architectural sub-parts (spires, roofs, merlons, domes) as HP drops!
    const totalParts = b.breakableParts.length;
    if (totalParts > 0) {
      const targetBroken = Math.min(totalParts, Math.floor(dmgRatio * (totalParts + 0.6)));
      while (b.brokenCount < targetBroken) {
        const part = b.breakableParts[b.brokenCount];
        b.brokenCount++;
        if (part.visible) {
          part.getWorldPosition(_v2);
          part.visible = false;
          this.spawnDebris(_v2, 7, kind, 22, 1.05, impactVel);
          if (element === 'fire' || element === 'rock') {
            this.spawnDebris(_v2, 3, 'ember', 16, 0.75);
          }
        }
      }
    }

    if (element === 'fire') {
      b.scorchAmount = Math.min(1, b.scorchAmount + 0.18);
      if (Math.random() < 0.75) {
        this.spawnParticle(
          b.pos.x + (Math.random() - 0.5) * 10,
          b.pos.y + Math.random() * 8,
          b.pos.z + (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 6,
          6 + Math.random() * 9,
          (Math.random() - 0.5) * 6,
          0xff6b00,
          0.65,
          2.0,
          5.6,
          -2,
          true,
        );
        this.spawnSmoke(
          b.pos.x + (Math.random() - 0.5) * 10,
          b.pos.y + Math.random() * 8,
          b.pos.z + (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 5,
          6 + Math.random() * 6,
          (Math.random() - 0.5) * 5,
          0x231e1b,
          2.6,
          4.2,
          15.5,
          3.4,
          0.8,
          0.9,
        );
      }
    }

    // Cinematic Surface Impact VFX: Wall Scorch / Rock Gouge Scars + Directional Sparks + Impact Flash!
    if (Math.random() < 0.52) {
      const fromVec = impactVel
        ? new THREE.Vector3(-impactVel.x, 0.25, -impactVel.z)
        : new THREE.Vector3(this.playerPos.x - b.pos.x, 2, this.playerPos.z - b.pos.z);
      if (fromVec.lengthSq() > 0.001) {
        fromVec.normalize();
      } else {
        fromVec.set(0, 0.25, 1).normalize();
      }
      const surfPt = b.pos
        .clone()
        .addScaledVector(fromVec, b.radius * 0.92)
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.35) * b.height * 0.45,
            (Math.random() - 0.5) * 4,
          ),
        );
      const scarKind =
        element === 'fire' ? 'fire' : element === 'ice' ? 'ice' : element === 'rock' ? 'rock' : 'sword';
      this.spawnSurfaceScar(surfPt, fromVec, 3.6 + Math.random() * 2.2, scarKind);
      this.spawnSparkBurst(
        surfPt,
        fromVec,
        14,
        element === 'ice' ? 0xbae6fd : element === 'fire' ? 0xff8c24 : 0xffd166,
        1.05,
      );
      this.triggerVfxFlash(surfPt, element === 'ice' ? 0x7dd3fc : 0xff7b1a, 0.85);
      if (element === 'rock' || element === 'ram') {
        this.spawnShockwaveRing(surfPt, fromVec, 0.7, 6.2, 0xfbbf24, 0.42);
      }
    }

    if (Math.random() < 0.85) {
      this.spawnDebris(b.pos, 4, kind, 16, 0.75, impactVel);
    }

    if (b.hp <= 0) {
      b.destroyed = true;
      for (const p of b.breakableParts) p.visible = false;

      // Walls/gates/arches clear completely so dragons can breach & fly right through the gap;
      // keeps/towers/palaces crumble into low jagged ruined stumps!
      const isBreachablePassage =
        b.id.includes('wall') || b.id.includes('gate') || b.id.startsWith('chasm_arch');
      if (isBreachablePassage) {
        b.mesh.visible = false;
      } else {
        b.mesh.scale.set(1.06, 0.22, 1.06);
        b.mesh.rotation.x = b.baseMeshRot.x + tiltDirX * 0.24;
        b.mesh.rotation.z = b.baseMeshRot.z + tiltDirZ * 0.26;
        b.mesh.position.y = b.baseMeshPos.y - 4.2;
      }

      this.world.hideSoldiersForBuilding(b.id);
      this.spawnDebris(b.pos, 24, kind, 30, 1.45, impactVel);
      this.spawnDebris(b.pos, 7, 'ember', 24, 0.9, impactVel);
      for (let k = 0; k < 18; k++) {
        if (k < 8) {
          this.spawnParticle(
            b.pos.x + (Math.random() - 0.5) * 10,
            b.pos.y + Math.random() * 8,
            b.pos.z + (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 24,
            6 + Math.random() * 14,
            (Math.random() - 0.5) * 24,
            0xff7b1a,
            0.9,
            2.8,
            8.2,
            4,
            true,
          );
        }
        this.spawnSmoke(
          b.pos.x + (Math.random() - 0.5) * 12,
          b.pos.y + Math.random() * 8,
          b.pos.z + (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 20,
          4 + Math.random() * 12,
          (Math.random() - 0.5) * 20,
          k < 8 ? 0x302925 : 0x6c645d,
          3.4,
          6.0,
          24.0,
          3.2,
          k < 8 ? 0.65 : 0.15,
          0.9,
        );
      }
      if (b.pos.distanceTo(this.playerPos) < 380) {
        this.audio.playCrash('stone', true);
        this.impactShake = Math.max(this.impactShake, 0.78);
      }
      if (byAlly) {
        this.allyScore += 150;
      } else {
        this.enemyScore += 100;
      }
    }
  }

  private destroyTree(t: DestructibleTree): void {
    if (t.destroyed) return;
    t.destroyed = true;
    this.world.hideTree(t);

    const isEnchanted = t.kind === 'enchanted';
    this.spawnDebris(t.pos, 7, 'wood', 19, isEnchanted ? 0.95 : 0.75);
    _v3.set(t.pos.x, t.pos.y + (isEnchanted ? 12 : 8), t.pos.z);
    this.spawnDebris(_v3, 8, 'leaf', 22, isEnchanted ? 1.1 : 0.9);
    for (let k = 0; k < 8; k++) {
      this.spawnParticle(
        t.pos.x,
        t.pos.y + (isEnchanted ? 10 : 6),
        t.pos.z,
        (Math.random() - 0.5) * 16,
        4 + Math.random() * 9,
        (Math.random() - 0.5) * 16,
        isEnchanted ? 0x2dd4bf : 0x4d7c0f,
        0.85,
        1.9,
        5.2,
        7,
      );
    }
    this.audio.playCrash('wood', false);
    this.impactShake = Math.max(this.impactShake, 0.34);
  }

  private checkShipMastFracture(ship: PirateShipActor): void {
    const targetBroken =
      ship.hp < ship.maxHp * 0.35 ? 2 : ship.hp < ship.maxHp * 0.7 ? 1 : 0;
    while (ship.brokenMasts < targetBroken && ship.brokenMasts < ship.masts.length) {
      const mast = ship.masts[ship.brokenMasts];
      const dirSign = ship.brokenMasts % 2 === 0 ? 1 : -1;
      mast.rotation.z = dirSign * (0.85 + Math.random() * 0.3);
      mast.rotation.x = 0.45;
      ship.brokenMasts++;
      this.spawnDebris(
        ship.group.position,
        8,
        ship.burnLevel > 0.25 ? 'char_wood' : 'wood',
        20,
        0.95,
      );
      if (ship.group.position.distanceTo(this.playerPos) < 320) {
        this.audio.playCrash('wood', false);
      }
    }
  }

  private destroyPirateShip(ship: PirateShipActor): void {
    if (ship.destroyed) return;
    ship.destroyed = true;
    ship.sinkProgress = 0;
    const sp = ship.group.position;
    for (let i = ship.brokenMasts; i < ship.masts.length; i++) {
      ship.masts[i].rotation.z = (i % 2 === 0 ? 1 : -1) * 1.15;
    }
    this.spawnDebris(sp, 18, ship.burnLevel > 0.2 ? 'char_wood' : 'wood', 26, 1.2);
    this.spawnDebris(sp, 8, 'ember', 24, 0.9);
    for (let k = 0; k < 22; k++) {
      if (k < 11) {
        this.spawnParticle(
          sp.x + (Math.random() - 0.5) * 12,
          4 + Math.random() * 8,
          sp.z + (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 24,
          8 + Math.random() * 16,
          (Math.random() - 0.5) * 24,
          0xff6b00,
          0.95,
          2.6,
          8.8,
          5,
          true,
        );
      }
      this.spawnSmoke(
        sp.x + (Math.random() - 0.5) * 12,
        4 + Math.random() * 8,
        sp.z + (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 18,
        5 + Math.random() * 12,
        (Math.random() - 0.5) * 18,
        k < 12 ? 0x1c1917 : 0x3b3532,
        3.6,
        5.5,
        24.0,
        3.8,
        0.9,
        0.95,
      );
    }
    this.spawnSparkBurst(sp.clone().setY(6), _unitY, 28, 0xff9b38, 1.4);
    this.spawnShockwaveRing(sp.clone().setY(4), _unitY, 1.5, 22, 0xff6b00, 0.65);
    this.triggerVfxFlash(sp.clone().setY(8), 0xff6b00, 1.35);
    this.audio.playCrash('wood', true);
    this.impactShake = Math.max(this.impactShake, 0.88);
    this.allyScore += 200;
    this.audio.speakKnight('battle_cry');
    if (this.mode === 'combat' && this.warStatus === 'active' && this.warType !== 'dragons') {
      this.warShipsSunk += 1;
      this.checkWarResolution();
    }
  }

  private damageShip(
    ship: PirateShipActor,
    dmg: number,
    element: ElementType | 'ram' = 'ram',
    impactVel?: THREE.Vector3,
  ): void {
    if (ship.destroyed) return;
    ship.hp -= dmg;
    const sp = ship.group.position;

    if (element === 'fire') {
      // Ignites the pirate ship into a raging blaze!
      ship.burnLevel = Math.min(1, ship.burnLevel + 0.22);
      ship.burnTimer = Math.max(ship.burnTimer, 16.0);
      if (Math.random() < 0.65) {
        this.spawnDebris(sp, 3, 'ember', 16, 0.75, impactVel);
      }
    } else if (element === 'ice') {
      ship.burnLevel = Math.max(0, ship.burnLevel - 0.25);
      if (ship.burnLevel <= 0.05) {
        ship.burnTimer = 0;
        ship.hullMat.emissiveIntensity = 0;
        ship.sailMat.emissiveIntensity = 0;
      }
      this.spawnDebris(sp, 3, 'ice', 14, 0.7, impactVel);
    } else {
      // Physical ram or rock boulder impact lurches hull & blasts timber splinters
      ship.damageTiltZ += (Math.random() > 0.5 ? 1 : -1) * 0.14;
      ship.damageTiltX += (Math.random() - 0.5) * 0.1;
      if (element === 'rock') {
        ship.burnLevel = Math.min(1, ship.burnLevel + 0.1);
        ship.burnTimer = Math.max(ship.burnTimer, 7.0);
      }
    }

    // Cinematic Hull Burn Scars & Sparks attached to Ship Group!
    if (Math.random() < 0.55) {
      const fromVec = impactVel
        ? new THREE.Vector3(-impactVel.x, 0.35, -impactVel.z)
        : new THREE.Vector3(this.playerPos.x - sp.x, 3, this.playerPos.z - sp.z);
      if (fromVec.lengthSq() > 0.001) {
        fromVec.normalize();
      } else {
        fromVec.set(0, 0.4, 1).normalize();
      }
      const hullPt = sp
        .clone()
        .addScaledVector(fromVec, 5.2)
        .add(new THREE.Vector3((Math.random() - 0.5) * 3, 2.8 + Math.random() * 3.5, (Math.random() - 0.5) * 5));
      const scarKind =
        element === 'fire' ? 'fire' : element === 'ice' ? 'ice' : element === 'rock' ? 'rock' : 'sword';
      this.spawnSurfaceScar(hullPt, fromVec, 3.2 + Math.random() * 1.6, scarKind, ship.group);
      this.spawnSparkBurst(
        hullPt,
        fromVec,
        14,
        element === 'ice' ? 0xbae6fd : 0xffaa33,
        1.05,
      );
      this.triggerVfxFlash(hullPt, element === 'ice' ? 0x7dd3fc : 0xff7b1a, 0.8);
    }

    if (Math.random() < 0.85) {
      this.spawnDebris(
        sp,
        4,
        ship.burnLevel > 0.3 ? 'char_wood' : 'wood',
        18,
        0.78,
        impactVel,
      );
    }

    this.checkShipMastFracture(ship);

    if (ship.hp <= 0) {
      this.destroyPirateShip(ship);
    }
  }

  private checkWarResolution(): void {
    if (this.warStatus !== 'active') return;
    const dragonsDone = this.warDragonsKilled >= this.warDragonsGoal;
    const shipsDone = this.warShipsSunk >= this.warShipsGoal;
    if (dragonsDone && shipsDone) {
      this.completeWarVictory();
    }
  }

  private resolveWarOnTimerEnd(): void {
    if (this.warStatus !== 'active') return;
    if (
      (this.warDragonsKilled > 0 || this.warShipsSunk > 0) &&
      this.allyScore >= this.enemyScore
    ) {
      this.completeWarVictory();
    } else {
      this.warStatus = 'defeat';
      this.triggerDirectionalDangerHorn(this.playerPos.clone().add(new THREE.Vector3(60, 0, -60)));
      this.emitHud();
    }
  }

  private completeWarVictory(): void {
    this.warStatus = 'victory';
    const spiritBonus = this.progression.knightUpgrades.spirit >= 2 ? 1 : 0;
    const kPts = (this.warType === 'both' ? 3 : 2) + spiritBonus;
    const dPts = this.warType === 'both' ? 3 : 2;
    this.progression.knightPoints += kPts;
    this.progression.dragonPoints += dPts;
    this.progression.warsWon += 1;
    this.progression.warWave += 1;
    this.saveProgression();
    this.audio.playBondChime(1.0);
    this.audio.playRoar(this.activeElement);
    this.audio.speakKnight('victory', true);
    this.emitHud();
  }

  private triggerDirectionalDangerHorn(threatPos: THREE.Vector3): void {
    if (this.dangerHornCooldown > 0) return;
    this.dangerHornCooldown = 8.5;
    this.dangerAlertTimer = 3.2;

    const focus = this.phase === 'skydiving' || this.phase === 'on_foot' ? this.riderPos : this.playerPos;
    _v1.copy(threatPos).sub(focus);
    const dist = _v1.length();
    if (dist > 0.01) _v1.divideScalar(dist);
    _right.set(1, 0, 0).applyQuaternion(this.camera.quaternion).normalize();
    const pan = THREE.MathUtils.clamp(_v1.dot(_right), -1, 1);
    const distRatio = THREE.MathUtils.clamp(1 - dist / 750, 0.28, 1.0);
    this.audio.playWarHorn(pan, distRatio);
    this.audio.speakKnight('danger');
  }

  private spawnSurfaceScar(
    worldPos: THREE.Vector3,
    worldNormal: THREE.Vector3,
    size: number,
    kind: 'sword' | 'fire' | 'rock' | 'ice',
    parent: THREE.Object3D = this.scene,
  ): void {
    if (this.surfaceScars.length >= 68) {
      const oldest = this.surfaceScars.shift();
      if (oldest) {
        oldest.parent.remove(oldest.mesh);
        (oldest.mesh.material as THREE.Material).dispose();
      }
    }

    const mat = new THREE.MeshStandardMaterial({
      map: this.scarTex,
      color: kind === 'ice' ? 0xdbeafe : kind === 'fire' ? 0x1c120d : 0x261d17,
      emissive:
        kind === 'fire'
          ? 0xff4d00
          : kind === 'sword'
            ? 0xff9f38
            : kind === 'ice'
              ? 0x38bdf8
              : 0x92400e,
      emissiveIntensity: kind === 'fire' ? 0.95 : kind === 'sword' ? 0.78 : 0.45,
      transparent: true,
      opacity: 0.92,
      roughness: 0.85,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(this.scarGeo, mat);
    const n = worldNormal.clone().normalize();
    const worldPt = worldPos.clone().addScaledVector(n, 0.16);
    if (parent !== this.scene) {
      parent.worldToLocal(worldPt);
      mesh.position.copy(worldPt);
    } else {
      mesh.position.copy(worldPt);
    }

    const q = new THREE.Quaternion().setFromUnitVectors(_unitZ, n);
    mesh.quaternion.copy(q);
    if (parent !== this.scene) {
      const parentInv = new THREE.Quaternion();
      parent.getWorldQuaternion(parentInv).invert();
      mesh.quaternion.premultiply(parentInv);
    }
    mesh.rotateZ(kind === 'sword' ? -0.65 + (Math.random() - 0.5) * 0.6 : Math.random() * Math.PI * 2);
    if (kind === 'sword') {
      mesh.scale.set(size * 1.45, size * 0.42, 1);
    } else {
      mesh.scale.set(size, size * (0.85 + Math.random() * 0.3), 1);
    }
    parent.add(mesh);

    this.surfaceScars.push({
      mesh,
      parent,
      life: 16,
      maxLife: 16,
      baseOpacity: 0.92,
    });
  }

  private spawnSparkBurst(
    origin: THREE.Vector3,
    normal: THREE.Vector3,
    count: number,
    colorHex: number,
    speedScale = 1.0,
  ): void {
    const n = normal.clone().normalize();
    for (let i = 0; i < count; i++) {
      if (this.vfxSparks.length >= 140) break;
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.96,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      mesh.position.copy(origin);
      const spd = (18 + Math.random() * 28) * speedScale;
      const vel = new THREE.Vector3(
        n.x * 0.55 + (Math.random() - 0.5) * 1.4,
        n.y * 0.55 + Math.random() * 0.9,
        n.z * 0.55 + (Math.random() - 0.5) * 1.4,
      )
        .normalize()
        .multiplyScalar(spd);
      mesh.scale.set(1, 1, 0.7 + Math.random() * 0.9);
      this.scene.add(mesh);
      this.vfxSparks.push({
        mesh,
        vel,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.65,
      });
    }
  }

  private spawnShockwaveRing(
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    startScale: number,
    endScale: number,
    colorHex: number,
    duration = 0.48,
  ): void {
    if (this.vfxShockRings.length >= 18) return;
    const mat = new THREE.MeshBasicMaterial({
      map: this.shockRingTex,
      color: colorHex,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.shockRingGeo, mat);
    mesh.position.copy(pos);
    const n = normal.clone().normalize();
    mesh.quaternion.setFromUnitVectors(_unitZ, n);
    mesh.scale.setScalar(startScale);
    this.scene.add(mesh);
    this.vfxShockRings.push({
      mesh,
      life: duration,
      maxLife: duration,
      startScale,
      endScale,
    });
  }

  private triggerVfxFlash(pos: THREE.Vector3, colorHex: number, power = 1.0): void {
    this.vfxFlashLight.position.copy(pos);
    this.vfxFlashLight.color.setHex(colorHex);
    this.vfxFlashPower = Math.max(this.vfxFlashPower, power);
  }

  private updateVfx(dt: number): void {
    for (let i = this.vfxSparks.length - 1; i >= 0; i--) {
      const sp = this.vfxSparks[i];
      sp.life -= dt;
      if (sp.life <= 0) {
        this.scene.remove(sp.mesh);
        (sp.mesh.material as THREE.Material).dispose();
        this.vfxSparks.splice(i, 1);
        continue;
      }
      sp.vel.y -= 28 * dt;
      sp.mesh.position.addScaledVector(sp.vel, dt);
      _v2.copy(sp.mesh.position).add(sp.vel);
      sp.mesh.lookAt(_v2);
      const t = sp.life / sp.maxLife;
      (sp.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, t * 1.4);
    }

    for (let i = this.vfxShockRings.length - 1; i >= 0; i--) {
      const r = this.vfxShockRings[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        this.vfxShockRings.splice(i, 1);
        continue;
      }
      const p = 1 - r.life / r.maxLife;
      const s = THREE.MathUtils.lerp(r.startScale, r.endScale, 1 - (1 - p) * (1 - p));
      r.mesh.scale.setScalar(s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.85;
    }

    for (let i = this.surfaceScars.length - 1; i >= 0; i--) {
      const sc = this.surfaceScars[i];
      sc.life -= dt;
      if (sc.life <= 0) {
        sc.parent.remove(sc.mesh);
        (sc.mesh.material as THREE.Material).dispose();
        this.surfaceScars.splice(i, 1);
        continue;
      }
      const mat = sc.mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = Math.max(0, mat.emissiveIntensity - dt * 0.14);
      if (sc.life < 3.0) {
        mat.opacity = sc.baseOpacity * (sc.life / 3.0);
      }
    }
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    const canvas = this.renderer.domElement;
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    canvas.removeEventListener('touchstart', this.handleTouchStart);
    canvas.removeEventListener('touchmove', this.handleTouchMove);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    canvas.removeEventListener('webglcontextlost', this.handleContextLost);

    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }

    this.audio.dispose();
    this.playerRig.dispose();
    this.activeRiderRig.dispose();
    for (const ai of this.aiDragons) {
      ai.rig.dispose();
      if (ai.fallingRider) {
        this.disposeObject3D(ai.fallingRider);
        this.scene.remove(ai.fallingRider);
        ai.fallingRider = null;
      }
    }
    for (const p of this.particles) {
      p.sprite.material.dispose();
    }
    for (const d of this.debris) {
      this.scene.remove(d.mesh);
    }
    for (const sc of this.surfaceScars) {
      sc.parent.remove(sc.mesh);
      (sc.mesh.material as THREE.Material).dispose();
    }
    for (const sp of this.vfxSparks) {
      this.scene.remove(sp.mesh);
      (sp.mesh.material as THREE.Material).dispose();
    }
    for (const r of this.vfxShockRings) {
      this.scene.remove(r.mesh);
      (r.mesh.material as THREE.Material).dispose();
    }
    this.scarGeo.dispose();
    this.sparkGeo.dispose();
    this.shockRingGeo.dispose();
    this.scarTex.dispose();
    this.shockRingTex.dispose();
    this.fireGeo.dispose();
    this.fireMat.dispose();
    this.iceGeo.dispose();
    this.iceMat.dispose();
    this.rockGeo.dispose();
    this.rockMat.dispose();
    this.stoneShardGeo.dispose();
    this.masonryBlockGeo.dispose();
    this.woodPlankGeo.dispose();
    this.emberChunkGeo.dispose();
    this.palmFrondGeo.dispose();
    this.iceShardGeo.dispose();
    this.stoneDebrisMat.dispose();
    this.palaceDebrisMat.dispose();
    this.woodDebrisMat.dispose();
    this.charWoodDebrisMat.dispose();
    this.emberDebrisMat.dispose();
    this.leafDebrisMat.dispose();
    this.iceDebrisMat.dispose();
    this.particleTex.dispose();
    this.scene.remove(this.smokeMesh);
    this.smokeGeo.dispose();
    this.smokeMat.dispose();
    this.smokeTex.dispose();
    this.scene.remove(this.elemMesh);
    this.elemGeo.dispose();
    this.elemMat.dispose();
    this.scene.remove(this.waterWakeMesh);
    this.waterWakeGeo.dispose();
    this.waterWakeMat.dispose();
    this.rainLines.geometry.dispose();
    this.rainMat.dispose();
    this.speedStreakLines.geometry.dispose();
    this.speedStreakMat.dispose();
    this.lightningBolt.geometry.dispose();
    this.lightningMat.dispose();
    this.world.dispose();
    if (this.composer) {
      this.composer.dispose();
    }
    this.renderer.dispose();
    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
