import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { DragonAudio } from './audio';
import { KnightVoice } from './knightVoice';
import {
  ArticulatedRiderRig,
  createArticulatedRiderRig,
  createDragonRig,
  createFallingRiderMesh,
  DragonRig,
} from './dragonMesh';
import { createSoftParticleTexture } from './textures';
import {
  CameraView,
  DRAGON_SPECS,
  DragonId,
  ElementType,
  EnemyIndicator,
  GameMode,
  GamePhase,
  HudState,
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
const _zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

// Pre-allocated scratch colors for zero-GC weather interpolation (Unreal Engine 5 filmic contrast)
const _fogColorClear = new THREE.Color(0xc99c6e);
const _fogColorRain = new THREE.Color(0x455669);
const _fogColorStorm = new THREE.Color(0x19232e);
const _fogColorFlash = new THREE.Color(0x7ca7cc);
const _sunColorClear = new THREE.Color(0xffcfa0);
const _sunColorStorm = new THREE.Color(0x3a4f66);
const _hemiSkyClear = new THREE.Color(0x6ca2d9);
const _hemiSkyStorm = new THREE.Color(0x28374a);
const _hemiGndClear = new THREE.Color(0x1d241b);
const _hemiGndStorm = new THREE.Color(0x10161a);
const _shipCharColor = new THREE.Color(0x160f0b);

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

const UE5FilmicPostShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignetteStrength: { value: 0.3 },
    contrastBoost: { value: 1.1 },
    time: { value: 0 },
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
    uniform float time;
    varying vec2 vUv;
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec2 ca = (vUv - 0.5) * 0.0016;
      vec3 col = vec3(
        texture2D(tDiffuse, vUv + ca).r,
        tex.g,
        texture2D(tDiffuse, vUv - ca).b
      );
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, 1.12);
      col = col * vec3(1.03, 1.0, 0.97) + vec3(0.0, 0.0, 0.006);
      col = clamp((col - 0.5) * contrastBoost + 0.5, 0.0, 1.0);
      float grain = fract(sin(dot(vUv * 1000.0 + time, vec2(12.9898, 78.233))) * 43758.5453);
      col += (grain - 0.5) * 0.018;
      vec2 center = vUv - 0.5;
      float dist = dot(center, center);
      float vig = 1.0 - smoothstep(0.18, 0.78, dist) * vignetteStrength;
      col *= vig;
      gl_FragColor = vec4(col, tex.a);
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
}

export class DragonEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private fxaaPass: FXAAPass | null = null;
  private filmPass: ShaderPass | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private maxAnisotropy: number;
  private clock = new THREE.Clock();
  private frameId = 0;
  private frameCount = 0;
  private disposed = false;

  private audio = new DragonAudio();
  private voice = new KnightVoice();
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
  private landingRequested = false;

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

  // Dynamic entities
  private aiDragons: AiDragon[] = [];
  private projectiles: Projectile[] = [];
  private particles: ParticleItem[] = [];
  private debris: DebrisPiece[] = [];
  private trailSpawnTimer = 0;
  private hudEmitTimer = 0;
  private toastMessage: string | null = null;
  private toastTimer = 0;
  private sanctuaryOrbitAngle = 0.6;

  // Dynamic Weather, Cinematic Rim/Bounce & Breath Lighting Rig
  private hemiLight: THREE.HemisphereLight;
  private sunLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private oceanBounceLight: THREE.DirectionalLight;
  private dragonBreathLight: THREE.PointLight;
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
    this.renderer.toneMappingExposure = 0.96;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
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
    this.scene.fog = new THREE.FogExp2(0xc99c6e, 0.00028);

    this.camera = new THREE.PerspectiveCamera(68, w / h, 0.4, 4800);

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
    const shadowRes = 4096;
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
    this.sunLight.shadow.radius = 2.2;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.rimLight = new THREE.DirectionalLight(0x4698de, 0.44);
    this.rimLight.position.set(-240, 130, 280);
    this.scene.add(this.rimLight);

    // Subtle sea-surface bounce fill light
    this.oceanBounceLight = new THREE.DirectionalLight(0x2596d4, 0.2);
    this.oceanBounceLight.position.set(0, -140, 0);
    this.scene.add(this.oceanBounceLight);

    // Dynamic elemental breath light illuminating dragon snout, scales, and surroundings
    this.dragonBreathLight = new THREE.PointLight(0xff6d1a, 0, 110, 1.25);
    this.scene.add(this.dragonBreathLight);

    this.lightningDirLight = new THREE.DirectionalLight(0xc8ecff, 0);
    this.lightningDirLight.position.set(120, 260, -180);
    this.scene.add(this.lightningDirLight);

    // Local high-intensity lights that highlight the dragon's 3D scales & neck during lightning flashes
    this.lightningDragonLight = new THREE.PointLight(0xdbf2ff, 0, 135, 1.35);
    this.scene.add(this.lightningDragonLight);
    this.lightningDragonRimLight = new THREE.PointLight(0x9bd6ff, 0, 105, 1.45);
    this.scene.add(this.lightningDragonRimLight);

    this.createWeatherSystems();

    // 5. World & Textures
    this.particleTex = createSoftParticleTexture();
    this.world = buildDragonWorld(this.scene, this.maxAnisotropy);

    // Capture initial Sky, Sun, Castles, and Mountains into Ocean Reflection CubeMap
    this.updateOceanReflection();

    // 6. Player Dragon Rig & Articulated Dismounted Knight Rig
    this.playerRig = createDragonRig(DRAGON_SPECS[this.dragonId], this.maxAnisotropy, true);
    this.scene.add(this.playerRig.root);
    this.activeRiderRig = createArticulatedRiderRig();
    this.activeRiderRig.root.visible = false;
    this.scene.add(this.activeRiderRig.root);
    this.placePlayerAtSanctuary();

    // 7. AI Dragons
    this.spawnAiDragons();

    // 8. UE5 Specular-Only Filmic Bloom + ACES Output + FXAA + Micro-Contrast/Vignette on Hardware GPU
    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(w, h),
        0.34,
        0.55,
        0.88,
      );
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
      this.fxaaPass = new FXAAPass();
      this.fxaaPass.setSize(w, h);
      this.composer.addPass(this.fxaaPass);
      this.filmPass = new ShaderPass(UE5FilmicPostShader);
      this.composer.addPass(this.filmPass);
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
      if (e.code === 'KeyF') this.tryBoardEnemy();
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
      if (e.code === 'KeyG' || e.code === 'KeyF') {
        this.remountDragon();
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
    this.voice.setMuted(muted);
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
    this.maxHp = spec.maxHp;
    this.hp = spec.maxHp;
    this.maxEnergy = spec.maxEnergy;
    this.energy = spec.maxEnergy;
    this.bondLevel = 35;

    this.scene.remove(this.playerRig.root);
    this.playerRig.dispose();
    this.playerRig = createDragonRig(spec, this.maxAnisotropy, true);
    this.scene.add(this.playerRig.root);

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
    }
    this.emitHud();
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
    this.audio.playWingbeat();
    this.emitHud();
  }

  public toggleKnifeEdge(): void {
    if (this.phase !== 'flying' || this.playerCrashing) return;
    this.audio.init();
    if (this.knifeEdgeSide !== 0) {
      this.knifeEdgeSide = 0;
    } else {
      const turnLeft =
        this.keys['KeyA'] || this.keys['ArrowLeft'] || this.manualSteerX < -0.2;
      this.knifeEdgeSide = turnLeft ? -1 : 1;
    }
    this.audio.playWingbeat();
    this.emitHud();
  }

  public jumpOffDragon(): void {
    if (this.phase !== 'flying' || this.playerCrashing) return;
    this.audio.init();
    this.knifeEdgeSide = 0;
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
    this.voice.say('jump');
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
    this.voice.say('remount');
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
    const near = this.riderPos.distanceTo(this.landedDragonPos) < 20;
    const lx = near ? this.landedDragonPos.x : this.riderPos.x;
    const lz = near ? this.landedDragonPos.z : this.riderPos.z;
    const yaw = near ? this.landedDragonYaw : this.riderYaw;

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
      this.spawnParticle(
        lx + Math.cos(a) * 3,
        launchY - 4,
        lz + Math.sin(a) * 3,
        Math.cos(a) * 18,
        3 + Math.random() * 6,
        Math.sin(a) * 18,
        0xa89274,
        0.9,
        2.4,
        7.5,
        3,
      );
    }
    this.audio.playWingbeat();
    this.audio.playRoar(this.activeElement);
    this.emitHud();
  }

  public launchFlight(): void {
    this.audio.init();
    this.voice.say('launch');
    if (this.bondLevel < 100) {
      this.bondLevel = 100;
    }
    this.playerCrashing = false;
    this.playerCrashTimer = 0;
    this.knifeEdgeSide = 0;
    this.landingRequested = false;
    this.activeRiderRig.root.visible = false;
    this.phase = 'flying';
    // Launch directly out of the Sanctuary rock-cavern mouth facing the open ocean
    this.playerPos.set(-555, 76, 515);
    this.setFlightEuler(-0.02, -0.78);
    this.playerSpeed = DRAGON_SPECS[this.dragonId].baseSpeed;
    _forward.set(0, 0, -1).applyQuaternion(this.flightQuat).normalize();
    this.velocity.copy(_forward).multiplyScalar(this.playerSpeed);
    this.audio.playRoar(this.activeElement);
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
    this.phase = 'flying';
    this.playerPos.set(lm.x + 95, Math.max(lm.y + 34, 40), lm.z + 95);
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
    this.voice.say('board');
    this.audio.playWingbeat();
    this.emitHud();
  }

  public performSwordSlash(): void {
    if (this.phase !== 'boarding' || !this.boardingTarget || this.boardingExitTimer > 0) return;
    if (this.swordSwingTimer > 0.12) return;
    this.audio.init();
    this.swordSwingTimer = 0.36;
    this.voice.say('slash');
    this.audio.playSwordSlash();
    this.audio.playSwordHit();
    this.boardingHits += 1;

    const tPos = this.boardingTarget.pos;
    for (let i = 0; i < 14; i++) {
      this.spawnParticle(
        tPos.x + (Math.random() - 0.5) * 2,
        tPos.y + 2.4,
        tPos.z + (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 18,
        4 + Math.random() * 12,
        (Math.random() - 0.5) * 18,
        0xfef08a,
        0.55,
        0.6,
        2.6,
        18,
      );
    }

    if (this.boardingHits >= this.boardingHitsRequired) {
      this.killEnemyDragon(this.boardingTarget, true);
      this.boardingExitTimer = 0.55;
    }
    this.emitHud();
  }

  private findBoardableEnemy(): AiDragon | null {
    if (this.mode !== 'combat') return null;
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
    if (ai.team === 'enemy') this.voice.say('kill');
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
    } else {
      this.enemyScore += 120;
    }

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
        if (this.filmPass) this.filmPass.uniforms.time.value = elapsed % 1000;
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

  private triggerLightningStrike(): void {
    this.lightningPower = 1.0;
    this.audio.playThunder();

    // Place bolt in front of the player camera so the strike and its sea reflections are dramatic
    this.camera.getWorldDirection(_v1);
    _right.set(-_v1.z, 0, _v1.x).normalize();
    const dist = 165 + Math.random() * 140;
    const lateral = (Math.random() - 0.5) * 230;
    const bx = this.camera.position.x + _v1.x * dist + _right.x * lateral;
    const bz = this.camera.position.z + _v1.z * dist + _right.z * lateral;

    this.lightningDirLight.position.set(
      bx - this.camera.position.x,
      260,
      bz - this.camera.position.z,
    );

    const attr = this.lightningBolt.geometry.getAttribute('position') as THREE.BufferAttribute;
    const topY = 215;
    const botY = -2;
    let curX = bx;
    let curZ = bz;
    for (let i = 0; i < this.lightningSegments; i++) {
      const t = i / (this.lightningSegments - 1);
      const y = THREE.MathUtils.lerp(topY, botY, t);
      if (i > 0 && i < this.lightningSegments - 1) {
        curX += (Math.random() - 0.5) * 26;
        curZ += (Math.random() - 0.5) * 26;
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

    // Periodic lightning strikes during thunderstorms
    this.lightningPower = Math.max(0, this.lightningPower - dt * 3.8);
    if (this.stormIntensity > 0.55) {
      this.nextLightningTimer -= dt;
      if (this.nextLightningTimer <= 0) {
        this.nextLightningTimer = 2.6 + Math.random() * 4.4 - this.stormIntensity * 0.9;
        this.triggerLightningStrike();
      }
    } else {
      this.nextLightningTimer = Math.min(this.nextLightningTimer, 1.5);
    }

    const flicker =
      this.lightningPower > 0.02
        ? this.lightningPower * (0.62 + 0.38 * Math.sin(elapsed * 72))
        : 0;

    // 1. Alter player visibility via exponential atmospheric fog
    const fog = this.scene.fog as THREE.FogExp2;
    const clearToRain = Math.min(1, this.stormIntensity * 2.5);
    const rainToStorm = Math.max(0, (this.stormIntensity - 0.36) / 0.64);
    fog.color
      .copy(_fogColorClear)
      .lerp(_fogColorRain, clearToRain)
      .lerp(_fogColorStorm, rainToStorm)
      .lerp(_fogColorFlash, flicker * 0.45);
    fog.density = THREE.MathUtils.lerp(
      0.00028,
      THREE.MathUtils.lerp(0.0011, 0.0020, rainToStorm),
      clearToRain,
    );
    (this.scene.background as THREE.Color).copy(fog.color);

    // 2. Update sky dome, UE5 volumetric cloud shader & ocean shader uniforms
    this.world.skyMaterial.uniforms.uStormFactor.value = this.stormIntensity;
    this.world.skyMaterial.uniforms.uLightning.value = flicker;
    this.world.cloudMaterial.uniforms.uTime.value = elapsed;
    this.world.cloudMaterial.uniforms.uStormFactor.value = this.stormIntensity;
    this.world.cloudMaterial.uniforms.uLightning.value = flicker;

    if (this.world.oceanMaterial.userData.shader) {
      const uniforms = this.world.oceanMaterial.userData.shader.uniforms;
      uniforms.uTime.value = elapsed;
      uniforms.uStormFactor.value = this.stormIntensity;
      uniforms.uLightning.value = flicker;
    }

    // 3. Modulate UE5 balanced lighting + electric specular lightning on dragon scales & ocean
    this.sunLight.intensity = THREE.MathUtils.lerp(2.15, 0.42, this.stormIntensity);
    this.sunLight.color.copy(_sunColorClear).lerp(_sunColorStorm, this.stormIntensity);
    this.hemiLight.intensity =
      THREE.MathUtils.lerp(0.36, 0.22, this.stormIntensity) + flicker * 0.55;
    this.hemiLight.color.copy(_hemiSkyClear).lerp(_hemiSkyStorm, this.stormIntensity);
    this.hemiLight.groundColor.copy(_hemiGndClear).lerp(_hemiGndStorm, this.stormIntensity);
    this.rimLight.intensity =
      THREE.MathUtils.lerp(0.44, 0.62, this.stormIntensity) + flicker * 1.15;
    this.oceanBounceLight.intensity = THREE.MathUtils.lerp(0.2, 0.1, this.stormIntensity);

    this.lightningDirLight.intensity = flicker * 7.8;
    this.world.oceanMaterial.envMapIntensity =
      THREE.MathUtils.lerp(1.15, 1.55, this.stormIntensity) + flicker * 0.85;

    // Position two close lightning point lights to rake across dragon's 3D scales & clearcoat
    _forward.set(0, 0, -1).applyQuaternion(this.flightQuat).normalize();
    _right.set(1, 0, 0).applyQuaternion(this.flightQuat).normalize();

    this.lightningDragonLight.position
      .copy(this.playerPos)
      .addScaledVector(_forward, 6)
      .addScaledVector(_right, -5);
    this.lightningDragonLight.position.y += 10;
    this.lightningDragonLight.intensity = flicker * 82;

    this.lightningDragonRimLight.position
      .copy(this.playerPos)
      .addScaledVector(_forward, 9)
      .addScaledVector(_right, 7);
    this.lightningDragonRimLight.position.y += 4.5;
    this.lightningDragonRimLight.intensity = flicker * 54;

    this.lightningBolt.visible = flicker > 0.08;
    this.lightningMat.opacity = Math.min(1, flicker * 1.3);

    // Refresh CubeMap sky reflection when storm band shifts
    const stormBand = Math.round(this.stormIntensity * 2);
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
          if (Math.random() < 0.55) {
            const isFire = ship.burnLevel > 0.15 && Math.random() < 0.45;
            this.spawnParticle(
              ship.group.position.x + (Math.random() - 0.5) * 14,
              1.4 + Math.random() * 2,
              ship.group.position.z + (Math.random() - 0.5) * 14,
              (Math.random() - 0.5) * 6,
              6 + Math.random() * 8,
              (Math.random() - 0.5) * 6,
              isFire ? 0xff5a00 : 0xcbd5e1,
              0.95,
              1.8,
              6.5,
              -1.2,
              isFire,
            );
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

        // Dynamic flame plumes, rising embers & thick black smoke along deck and rigging
        if (Math.random() < 0.78) {
          const alongZ = (Math.random() - 0.5) * 28;
          const sinY = Math.sin(ship.group.rotation.y);
          const cosY = Math.cos(ship.group.rotation.y);
          const fx = ship.group.position.x + sinY * alongZ + (Math.random() - 0.5) * 4;
          const fz = ship.group.position.z + cosY * alongZ + (Math.random() - 0.5) * 4;
          const flameY = ship.group.position.y + 4.5 + Math.random() * (9 * ship.burnLevel + 3);
          const kindRoll = Math.random();
          this.spawnParticle(
            fx,
            flameY,
            fz,
            (Math.random() - 0.5) * 5,
            8 + Math.random() * 11,
            (Math.random() - 0.5) * 5,
            kindRoll < 0.46 ? 0xff7b1a : kindRoll < 0.68 ? 0xffdf7a : 0x1e293b,
            kindRoll < 0.68 ? 0.72 : 1.55,
            kindRoll < 0.68 ? 2.1 : 2.6,
            kindRoll < 0.68 ? 5.8 : 9.4,
            kindRoll < 0.68 ? -2.2 : -3.4,
            kindRoll < 0.68,
          );
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
      c.center.y = c.baseY + Math.sin(elapsed * 0.32 + c.driftPhase) * 1.85;
    }

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastMessage = null;
    }
    if (this.roarTimer > 0) this.roarTimer = Math.max(0, this.roarTimer - dt);
    if (this.healBurstTimer > 0) this.healBurstTimer = Math.max(0, this.healBurstTimer - dt);
    if (this.fireCooldown > 0) this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.collisionCooldown > 0) this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    this.impactShake *= Math.exp(-8.5 * dt);

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
    this.updateDebris(dt, elapsed);

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
    this.playerRig.leftWingInner.rotation.z = -0.35 + breathe * 0.04 + stretch;
    this.playerRig.leftWingOuter.rotation.z = -0.65 - stretch * 0.4;
    this.playerRig.rightWingInner.rotation.z = 0.35 - breathe * 0.04 - stretch;
    this.playerRig.rightWingOuter.rotation.z = 0.65 + stretch * 0.4;

    this.playerRig.neckGroup.rotation.x =
      0.06 * breathe + (this.roarTimer > 0 ? -0.32 : 0);
    this.playerRig.jawGroup.rotation.x = this.roarTimer > 0 ? 0.55 : 0.04 + breathe * 0.02;
    this.playerRig.leftHindLeg.rotation.x = -0.68;
    this.playerRig.rightHindLeg.rotation.x = -0.68;

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

    // Real Newtonian Aerodynamics: Gravity + Wing Lift + Thrust + Quadratic Drag + Keel Side-Slip Damping + Wind Gusts
    const forwardSpeed = this.velocity.dot(_forward);

    // Aerodynamic stall: climbing steeply at low airspeed naturally drops the dragon's nose forward
    if (this.halfLoopRemaining <= 0 && forwardSpeed < 22 && _forward.y > 0.35) {
      _qPitch.setFromAxisAngle(_unitX, -0.78 * dt);
      this.flightQuat.multiply(_qPitch).normalize();
      _forward.set(0, 0, -1).applyQuaternion(this.flightQuat).normalize();
      _right.set(1, 0, 0).applyQuaternion(this.flightQuat).normalize();
      _up.set(0, 1, 0).applyQuaternion(this.flightQuat).normalize();
    }

    // 1. Gravity
    this.velocity.y -= 22.0 * dt;

    // 2. Wing Lift along local UP (plus loop centripetal support during active half-circle turn)
    const uprightFactor = Math.max(0, _up.y);
    const baseLift = Math.min(27.5, Math.max(0, forwardSpeed * 0.46)) * (0.38 + 0.62 * uprightFactor);
    const loopLift = this.halfLoopRemaining > 0 ? 18.0 : 0;
    this.velocity.addScaledVector(_up, (baseLift + loopLift) * dt);

    // 3. Thrust along forward vector (climb bleeds speed naturally, dive accelerates via gravity!)
    const thrustAccel = boosting
      ? spec.baseSpeed * 1.18
      : braking
        ? spec.baseSpeed * 0.14
        : spec.baseSpeed * 0.66;
    this.velocity.addScaledVector(_forward, thrustAccel * dt);

    // 4. Quadratic aerodynamic air resistance + rain drag
    const curSpeed = this.velocity.length();
    const dragCoeff = 0.0086 * (1 + this.rainIntensity * 0.28) * (braking ? 1.85 : 1.0);
    this.velocity.addScaledVector(this.velocity, -dragCoeff * curSpeed * dt);

    // 5. Weathercock / Wing-Keel Side-Slip Damping (banking carves curved turns with real inertia)
    const sideSlip = this.velocity.dot(_right);
    this.velocity.addScaledVector(_right, -sideSlip * (1 - Math.exp(-4.2 * dt)));

    // 6. Storm crosswind & vertical turbulence forces
    if (this.stormIntensity > 0.04) {
      this.velocity.x -= gustX * 14.0 * dt;
      this.velocity.y += gustY * 11.5 * dt;
    }

    // Integrate real world position
    this.playerPos.addScaledVector(this.velocity, dt);

    // Soft aerodynamic windwall boundary at expanded open-world edge (1750m)
    const distFromOrigin = Math.hypot(this.playerPos.x, this.playerPos.z);
    if (distFromOrigin > 1750) {
      const pull = (distFromOrigin - 1750) / 110;
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

    // 8. Active Safe Landing Descent OR Real Terrain Slope & Ocean Plunge Physics
    const walkableY = this.world.getWalkableGroundHeight(this.playerPos.x, this.playerPos.z);
    if (this.landingRequested) {
      if (walkableY < -0.2) {
        // Guide gently toward closest walkable shore/palace if over open sea
        const shoreTargets = [
          [-640, 580],
          [820, -480],
          [-880, -60],
          [720, 560],
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
        this.velocity.x *= Math.exp(-1.5 * dt);
        this.velocity.z *= Math.exp(-1.5 * dt);
        this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, -22, 3.5 * dt);
        if (this.playerPos.y <= walkableY + 3.0) {
          this.completeDragonTouchdown(walkableY);
          return { isSkimmingWater: false, isSlicingCloud: false };
        }
      }
    }

    const groundY = getTerrainHeight(this.playerPos.x, this.playerPos.z);
    const overWater = groundY < -0.5;
    const minFlightY = overWater ? 1.8 : Math.max(groundY, walkableY) + 2.8;
    if (this.playerPos.y < minFlightY) {
      if (overWater) {
        if (this.velocity.y < -12) {
          this.velocity.y = Math.abs(this.velocity.y) * 0.42 + 8;
          this.velocity.x *= 0.72;
          this.velocity.z *= 0.72;
          this.impactShake = Math.max(this.impactShake, 0.45);
          this.audio.playCrash('water', true);
          for (let k = 0; k < 14; k++) {
            this.spawnParticle(
              this.playerPos.x + (Math.random() - 0.5) * 6,
              1.0,
              this.playerPos.z + (Math.random() - 0.5) * 6,
              (Math.random() - 0.5) * 18,
              10 + Math.random() * 14,
              (Math.random() - 0.5) * 18,
              0xdbf4ff,
              0.85,
              1.8,
              6.0,
              20,
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
          for (let k = 0; k < 14; k++) {
            this.spawnParticle(
              this.playerPos.x + (Math.random() - 0.5) * 6,
              this.playerPos.y,
              this.playerPos.z + (Math.random() - 0.5) * 6,
              (Math.random() - 0.5) * 18,
              6 + Math.random() * 12,
              (Math.random() - 0.5) * 18,
              0x9a8c7a,
              0.85,
              1.9,
              6.6,
              10,
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
    if (this.playerPos.y > 260) {
      this.playerPos.y = 260;
      this.velocity.y = Math.min(0, this.velocity.y);
    }

    this.playerSpeed = this.velocity.length();
    const pitchSlope = _forward.y;

    _qRoll.setFromAxisAngle(_unitZ, this.playerRoll);
    _finalQuat.copy(this.flightQuat).multiply(_qRoll);

    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.quaternion.copy(_finalQuat);

    // Wingbeat kinematics
    const flapSpeed =
      pitchSlope > 0.1 || boosting ? 9.2 : pitchSlope < -0.18 ? 2.4 : 5.6;
    this.wingPhase += dt * flapSpeed;
    const flap = Math.sin(this.wingPhase);
    const sign = flap >= 0 ? 1 : -1;
    if (sign !== this.lastWingSign && sign < 0 && flapSpeed > 4.2) {
      this.audio.playWingbeat();
    }
    this.lastWingSign = sign;

    const flapAmp =
      this.knifeEdgeSide !== 0
        ? 0.24
        : pitchSlope < -0.2
          ? 0.14
          : 0.46;
    const wingTuck = this.knifeEdgeSide !== 0 ? 0.34 : 0;
    this.playerRig.leftWingInner.rotation.z = flap * flapAmp - wingTuck;
    this.playerRig.leftWingOuter.rotation.z =
      Math.sin(this.wingPhase - 0.65) * flapAmp * 0.9 - wingTuck * 0.4;
    this.playerRig.rightWingInner.rotation.z = -flap * flapAmp + wingTuck;
    this.playerRig.rightWingOuter.rotation.z =
      -Math.sin(this.wingPhase - 0.65) * flapAmp * 0.9 + wingTuck * 0.4;
    this.playerRig.leftHindLeg.rotation.x = 0.42 + flap * 0.08;
    this.playerRig.rightHindLeg.rotation.x = 0.42 - flap * 0.08;

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

    // Right Sword Hand leans & reacts with flight turn/attack
    const fireLift = this.isFiring ? 0.16 : 0;
    this.playerRig.swordArmGroup.position.set(
      0.88 + this.smoothedHandX * 0.16,
      2.3 + this.smoothedHandY * 0.12 + bob + fireLift,
      -0.92 - fireLift * 0.5,
    );
    this.playerRig.swordArmGroup.rotation.set(
      0.22 + this.smoothedHandY * 0.25 - fireLift,
      0.1 - this.smoothedHandX * 0.25,
      -0.35 - this.smoothedHandX * 0.35,
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

    this.energy = Math.min(this.maxEnergy, this.energy + dt * 7.8);

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
      const followDist = 21.5 + (boosting ? 3.2 : 0);
      _camTargetPos
        .copy(this.playerPos)
        .addScaledVector(_forward, -followDist)
        .addScaledVector(_up, 6.8);

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
      _camLookAt.copy(this.playerPos).addScaledVector(_forward, 26).addScaledVector(_up, 1.6);
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

    const targetFov = THREE.MathUtils.clamp(64 + (this.playerSpeed - 45) * 0.36, 62, 86);
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 5, dt);
    this.camera.updateProjectionMatrix();

    this.playerRig.leftWingTip.getWorldPosition(_v1);
    this.playerRig.rightWingTip.getWorldPosition(_v2);

    const leftOverWater = getTerrainHeight(_v1.x, _v1.z) < -0.5;
    const rightOverWater = getTerrainHeight(_v2.x, _v2.z) < -0.5;
    const leftSkim = leftOverWater && _v1.y < 7.2 && _v1.y > -2;
    const rightSkim = rightOverWater && _v2.y < 7.2 && _v2.y > -2;
    const bodySkim =
      getTerrainHeight(this.playerPos.x, this.playerPos.z) < -0.5 && this.playerPos.y < 8.5;
    const isSkimmingWater = leftSkim || rightSkim || bodySkim;

    let isSlicingCloud = false;
    for (const cloud of this.world.cloudClusters) {
      if (this.playerPos.distanceTo(cloud.center) < cloud.radius + 9) {
        isSlicingCloud = true;
        break;
      }
    }

    this.trailSpawnTimer += dt;
    if (this.trailSpawnTimer >= 0.03) {
      this.trailSpawnTimer = 0;

      if (leftSkim || bodySkim) {
        const sx = leftSkim ? _v1.x : this.playerPos.x - 4;
        const sz = leftSkim ? _v1.z : this.playerPos.z;
        this.spawnParticle(
          sx,
          0.9,
          sz,
          (Math.random() - 0.5) * 8,
          6 + Math.random() * 9,
          (Math.random() - 0.5) * 8,
          0xdbf4ff,
          0.75,
          1.4,
          4.8,
          14,
        );
      }
      if (rightSkim || bodySkim) {
        const sx = rightSkim ? _v2.x : this.playerPos.x + 4;
        const sz = rightSkim ? _v2.z : this.playerPos.z;
        this.spawnParticle(
          sx,
          0.9,
          sz,
          (Math.random() - 0.5) * 8,
          6 + Math.random() * 9,
          (Math.random() - 0.5) * 8,
          0xdbf4ff,
          0.75,
          1.4,
          4.8,
          14,
        );
      }

      if (isSlicingCloud) {
        this.spawnParticle(
          _v1.x,
          _v1.y,
          _v1.z,
          -_forward.x * 10 + (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 4,
          -_forward.z * 10 + (Math.random() - 0.5) * 5,
          0xf1f5f9,
          1.55,
          3.4,
          10.5,
          -0.6,
        );
        this.spawnParticle(
          _v2.x,
          _v2.y,
          _v2.z,
          -_forward.x * 10 + (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 4,
          -_forward.z * 10 + (Math.random() - 0.5) * 5,
          0xf1f5f9,
          1.55,
          3.4,
          10.5,
          -0.6,
        );
        this.spawnParticle(
          this.playerPos.x,
          this.playerPos.y + 1,
          this.playerPos.z,
          -_forward.x * 14,
          1.2,
          -_forward.z * 14,
          0xe2e8f0,
          1.7,
          4.5,
          12.0,
          -0.8,
        );
      }
    }

    const distSanctuary = this.playerPos.distanceTo(this.world.sanctuaryDragonPerch);
    if (distSanctuary < 24 && this.playerSpeed < 65) {
      this.returnToSanctuary();
    }

    return { isSkimmingWater, isSlicingCloud };
  }

  private completeDragonTouchdown(groundY: number): void {
    this.landingRequested = false;
    this.playerRoll = 0;
    this.playerSpeed = 0;
    this.velocity.set(0, 0, 0);

    _forward.set(0, 0, -1).applyQuaternion(this.flightQuat).normalize();
    this.landedDragonYaw = Math.atan2(-_forward.x, -_forward.z);
    this.landedDragonPos.set(this.playerPos.x, groundY + 2.0, this.playerPos.z);

    // Massive 360-degree wing-downdraft earth dust scatter + dirt/pebble debris
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
      const spd = 16 + Math.random() * 20;
      this.spawnParticle(
        this.landedDragonPos.x + Math.cos(a) * 3.2,
        groundY + 0.7,
        this.landedDragonPos.z + Math.sin(a) * 3.2,
        Math.cos(a) * spd,
        2.5 + Math.random() * 6.5,
        Math.sin(a) * spd,
        i % 2 === 0 ? 0xb89b72 : 0x8c7355,
        1.15,
        3.0,
        11.2,
        2.2,
      );
    }
    _v2.set(this.landedDragonPos.x, groundY + 1.0, this.landedDragonPos.z);
    this.spawnDebris(_v2, 16, 'stone', 20, 0.65);

    this.impactShake = 0.62;
    this.audio.playCrash('stone', false);
    this.audio.playWingbeat();

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
        const dLandY = Math.max(0, this.world.getWalkableGroundHeight(dLandX, dLandZ)) + 2.0;
        this.landedDragonPos.set(dLandX, dLandY, dLandZ);
        this.landedDragonYaw = Math.atan2(this.riderPos.x - dLandX, this.riderPos.z - dLandZ);
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
    // 1. Landed Dragon rests quietly with folded wings and gentle breathing
    this.playerPos.copy(this.landedDragonPos);
    this.playerRig.root.position.copy(this.landedDragonPos);
    this.playerRig.root.rotation.set(0, this.landedDragonYaw, 0, 'YXZ');
    const breathe = Math.sin(elapsed * 2.0);
    this.playerRig.leftWingInner.rotation.z = -0.78 + breathe * 0.03;
    this.playerRig.leftWingOuter.rotation.z = -0.92;
    this.playerRig.rightWingInner.rotation.z = 0.78 - breathe * 0.03;
    this.playerRig.rightWingOuter.rotation.z = 0.92;
    this.playerRig.leftHindLeg.rotation.x = -0.68;
    this.playerRig.rightHindLeg.rotation.x = -0.68;
    this.playerRig.neckGroup.rotation.x = 0.05 * breathe;
    this.playerRig.neckGroup.rotation.y = Math.sin(elapsed * 0.6) * 0.12;
    this.playerRig.jawGroup.rotation.x = 0.04 + breathe * 0.02;
    for (let i = 0; i < this.playerRig.tailSegments.length; i++) {
      this.playerRig.tailSegments[i].rotation.y = Math.sin(elapsed * 1.3 - i * 0.45) * 0.06;
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
    const walkMax = sprinting ? 18.5 : 10.5;
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

    // Articulated walking / running limb gait
    this.activeRiderRig.root.position.copy(this.riderPos);
    const faceYaw = horizSpeed > 0.6 ? Math.atan2(-this.riderVel.x, -this.riderVel.z) : this.riderYaw;
    this.activeRiderRig.root.rotation.set(0, faceYaw, 0, 'YXZ');
    this.activeRiderRig.bodyPivot.rotation.set(0, 0, 0);

    if (horizSpeed > 0.5) {
      this.riderWalkCycle += dt * (sprinting ? 14 : 9.5);
      const sw = Math.sin(this.riderWalkCycle) * (sprinting ? 0.78 : 0.52);
      this.activeRiderRig.leftLeg.rotation.set(sw, 0, 0);
      this.activeRiderRig.rightLeg.rotation.set(-sw, 0, 0);
      this.activeRiderRig.leftArm.rotation.set(-sw * 0.85, 0, -0.08);
      this.activeRiderRig.rightArm.rotation.set(sw * 0.85, 0, 0.08);
      this.activeRiderRig.bodyPivot.position.y = Math.abs(Math.sin(this.riderWalkCycle)) * 0.09;
      this.activeRiderRig.cape.rotation.x = 0.35 + (sprinting ? 0.55 : 0.25) + Math.sin(elapsed * 10) * 0.08;
    } else {
      this.activeRiderRig.leftLeg.rotation.set(0, 0, 0);
      this.activeRiderRig.rightLeg.rotation.set(0, 0, 0);
      this.activeRiderRig.leftArm.rotation.set(0, 0, -0.06);
      this.activeRiderRig.rightArm.rotation.set(0, 0, 0.06);
      this.activeRiderRig.bodyPivot.position.y = 0;
      this.activeRiderRig.cape.rotation.x = 0.15 + Math.sin(elapsed * 2.2) * 0.04;
    }

    // 3rd-Person Exploration Camera vs 1st-Person Explorer Eye Camera
    if (this.cameraView === 'full') {
      this.activeRiderRig.root.visible = true;
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
      this.activeRiderRig.root.visible = false;
      this.camera.position.set(this.riderPos.x, this.riderPos.y + 2.15, this.riderPos.z);
      _camLookAt.set(
        this.riderPos.x - sinY * Math.cos(this.riderCamPitch) * 20,
        this.riderPos.y + 2.15 + Math.sin(this.riderCamPitch) * 20,
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
      this.spawnParticle(
        _v1.x,
        _v1.y,
        _v1.z,
        _forward.x * (jetSpeed * 0.78) + (Math.random() - 0.5) * 12,
        _forward.y * (jetSpeed * 0.78) + (Math.random() - 0.5) * 12,
        _forward.z * (jetSpeed * 0.78) + (Math.random() - 0.5) * 12,
        0xc2410c,
        0.64,
        1.7,
        7.5,
        -4.5,
        false,
      );

      this.applyContinuousConeBreath('fire', 78, 7.5, 5.5);
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

      this.applyContinuousConeBreath('ice', 76, 8.5, 4.2);
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
          damage: 14,
          radius: 4.5,
        });
      }

      for (let k = 0; k < 8; k++) {
        this.spawnParticle(
          _v1.x,
          _v1.y,
          _v1.z,
          _forward.x * 42 + (Math.random() - 0.5) * 20,
          _forward.y * 42 + (Math.random() - 0.5) * 20,
          _forward.z * 42 + (Math.random() - 0.5) * 20,
          0xf59e0b,
          0.42,
          1.8,
          5.2,
          4,
          true,
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
        }
      }
      // Fire jet sweeping close across mountain slopes chars & slightly gouges terrain
      for (let step = 22; step <= 62; step += 20) {
        _closestPt.copy(_v1).addScaledVector(_forward, step);
        const gY = getTerrainHeight(_closestPt.x, _closestPt.z);
        if (gY > 0.5 && _closestPt.y < gY + 7.5 && _closestPt.y > gY - 8) {
          this.world.deformTerrain(_closestPt.x, _closestPt.z, 11, 0.35, 0.9);
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
          if (Math.random() < 0.65) {
            this.spawnParticle(
              ai.pos.x + (Math.random() - 0.5) * 3,
              ai.pos.y + (Math.random() - 0.5) * 2,
              ai.pos.z + (Math.random() - 0.5) * 3,
              (Math.random() - 0.5) * 10,
              6 + Math.random() * 8,
              (Math.random() - 0.5) * 10,
              0xff7700,
              0.4,
              2.0,
              5.4,
              -2,
              true,
            );
          }
        } else {
          ai.frozenTimer = 4.2;
          ai.rig.setFrozen(true);
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

        if (Math.random() < 0.6) {
          this.spawnParticle(
            ai.pos.x,
            ai.pos.y,
            ai.pos.z,
            (Math.random() - 0.5) * 4,
            3 + Math.random() * 5,
            (Math.random() - 0.5) * 4,
            Math.random() < 0.35 ? 0xf97316 : 0x334155,
            0.95,
            2.2,
            7.2,
            -1.2,
            false,
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
          for (let k = 0; k < 22; k++) {
            this.spawnParticle(
              ai.pos.x + (Math.random() - 0.5) * 6,
              hitY + 1.2,
              ai.pos.z + (Math.random() - 0.5) * 6,
              (Math.random() - 0.5) * 22,
              8 + Math.random() * 14,
              (Math.random() - 0.5) * 22,
              overWater ? 0xdbf4ff : 0x786c5e,
              1.05,
              2.6,
              8.8,
              14,
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

      if (this.mode === 'free' && ai.team === 'enemy') {
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
          ai.rig.leftHindLeg.rotation.x = -0.88;
          ai.rig.rightHindLeg.rotation.x = -0.88;
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

      const flap = Math.sin(elapsed * 6.2 + ai.patrolSeed);
      ai.rig.leftWingInner.rotation.z = flap * 0.45;
      ai.rig.leftWingOuter.rotation.z = Math.sin(elapsed * 6.2 + ai.patrolSeed - 0.6) * 0.4;
      ai.rig.rightWingInner.rotation.z = -flap * 0.45;
      ai.rig.rightWingOuter.rotation.z = -Math.sin(elapsed * 6.2 + ai.patrolSeed - 0.6) * 0.4;
      ai.rig.leftHindLeg.rotation.x = 0.4 + flap * 0.08;
      ai.rig.rightHindLeg.rotation.x = 0.4 - flap * 0.08;

      if (this.mode === 'combat' && targetPos !== _v3) {
        ai.fireCooldown -= dt;
        const distToTarget = ai.pos.distanceTo(targetPos);
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
      if (p.ownerTeam === 'ally') {
        // Destructibles vs player projectiles (scattered rocks, etc.)
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
            if (p.element === 'ice') ai.frozenTimer = 4.0;
            if (p.element === 'fire') ai.burnTimer = 3.0;
            hit = true;
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
            hit = true;
            break;
          }
        }
        if (!hit && this.phase === 'flying' && !this.playerCrashing) {
          if (p.mesh.position.distanceTo(this.playerPos) < p.radius + 4.2) {
            this.hp = Math.max(0, this.hp - p.damage);
            this.woundsCount = Math.min(5, this.woundsCount + 1);
            hit = true;
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
          const burstCol =
            p.element === 'fire' ? 0xff5500 : p.element === 'ice' ? 0xffffff : 0xf59e0b;
          for (let k = 0; k < 8; k++) {
            this.spawnParticle(
              p.mesh.position.x,
              p.mesh.position.y,
              p.mesh.position.z,
              (Math.random() - 0.5) * 16,
              (Math.random() - 0.5) * 16,
              (Math.random() - 0.5) * 16,
              burstCol,
              0.45,
              1.6,
              4.2,
              4,
            );
          }
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

  private computeZoneName(): string {
    let closestName = 'فوق البحر المفتوح';
    let bestD = 175;
    for (const lm of WORLD_LANDMARKS) {
      const d = Math.hypot(this.playerPos.x - lm.x, this.playerPos.z - lm.z);
      if (d < bestD) {
        bestD = d;
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
      stormIntensity: this.stormIntensity,
      lightningActive: this.lightningPower > 0.15,
      cameraView: this.cameraView,
      isLooping: this.halfLoopRemaining > 0.05,
      knifeEdgeSide: this.knifeEdgeSide,
      nearLandedDragon:
        this.phase === 'on_foot' &&
        this.riderPos.distanceTo(this.landedDragonPos) < 16,
      isInWater: this.phase === 'skydiving' && this.skydiveState === 'in_water',
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

        // Burning embers & charred planks leave dynamic spark/smoke wisps in mid-air
        if (d.burning && Math.random() < 0.28) {
          this.spawnParticle(
            d.mesh.position.x,
            d.mesh.position.y,
            d.mesh.position.z,
            (Math.random() - 0.5) * 2,
            2 + Math.random() * 3,
            (Math.random() - 0.5) * 2,
            d.kind === 'ember' ? 0xff7b1a : 0x334155,
            0.48,
            0.9,
            2.4,
            -1.5,
            d.kind === 'ember',
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
      if (Math.random() < 0.7) {
        this.spawnParticle(
          b.pos.x + (Math.random() - 0.5) * 10,
          b.pos.y + Math.random() * 8,
          b.pos.z + (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 6,
          6 + Math.random() * 9,
          (Math.random() - 0.5) * 6,
          Math.random() < 0.6 ? 0xff6b00 : 0x334155,
          0.8,
          2.2,
          6.8,
          -2,
          true,
        );
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
      for (let k = 0; k < 20; k++) {
        this.spawnParticle(
          b.pos.x + (Math.random() - 0.5) * 10,
          b.pos.y + Math.random() * 8,
          b.pos.z + (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 24,
          6 + Math.random() * 16,
          (Math.random() - 0.5) * 24,
          k < 10 ? 0xff7b1a : 0x78716c,
          1.15,
          3.2,
          10.5,
          4,
          k < 10,
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
    if (this.world.palmTrunkInst) {
      this.world.palmTrunkInst.setMatrixAt(t.index, _zeroMatrix);
      this.world.palmTrunkInst.instanceMatrix.needsUpdate = true;
    }
    if (this.world.palmCrownInst) {
      this.world.palmCrownInst.setMatrixAt(t.index, _zeroMatrix);
      this.world.palmCrownInst.instanceMatrix.needsUpdate = true;
    }

    this.spawnDebris(t.pos, 6, 'wood', 18, 0.75);
    _v3.set(t.pos.x, t.pos.y + 8, t.pos.z);
    this.spawnDebris(_v3, 7, 'leaf', 20, 0.9);
    for (let k = 0; k < 6; k++) {
      this.spawnParticle(
        t.pos.x,
        t.pos.y + 6,
        t.pos.z,
        (Math.random() - 0.5) * 14,
        4 + Math.random() * 8,
        (Math.random() - 0.5) * 14,
        0x4d7c0f,
        0.75,
        1.6,
        4.5,
        8,
      );
    }
    this.audio.playCrash('wood', false);
    this.impactShake = Math.max(this.impactShake, 0.32);
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
      this.spawnParticle(
        sp.x + (Math.random() - 0.5) * 12,
        4 + Math.random() * 8,
        sp.z + (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 24,
        8 + Math.random() * 16,
        (Math.random() - 0.5) * 24,
        k < 13 ? 0xff6b00 : 0x334155,
        1.1,
        2.8,
        10.5,
        5,
        k < 13,
      );
    }
    this.audio.playCrash('wood', true);
    this.impactShake = Math.max(this.impactShake, 0.88);
    this.allyScore += 200;
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

  public dispose(): void {
    this.disposed = true;
    this.voice.dispose();
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
    this.rainLines.geometry.dispose();
    this.rainMat.dispose();
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
