import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  createPirateSailTexture,
  createStoneTexture,
  createTerrainNormalMap,
  createVolumetricCloudTexture,
  createWaterNormalMap,
  createWoodPlankTexture,
} from './textures';

export interface CloudCluster {
  baseCenter: THREE.Vector3;
  center: THREE.Vector3;
  radius: number;
  baseY: number;
  driftPhase: number;
  isVolcanic?: boolean;
}

export const MAX_CLOUD_SHADOWS = 20;
export const CLOUD_WRAP_HALF = 4800;
export const CLOUD_WRAP_SPAN = CLOUD_WRAP_HALF * 2;

export interface CloudShadowUniforms {
  uTime: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uWindOffset: { value: THREE.Vector2 };
  uStormFactor: { value: number };
  uCloudShadows: { value: THREE.Vector4[] };
  uCloudShadowMeta: { value: THREE.Vector4[] };
}

export interface NarrowRockPillar {
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
}

export interface PirateShipActor {
  group: THREE.Group;
  centerX: number;
  centerZ: number;
  orbitRadius: number;
  speed: number;
  phase: number;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  sinkProgress: number;
  masts: THREE.Group[];
  sails: THREE.Mesh[];
  hullMat: THREE.MeshStandardMaterial;
  sailMat: THREE.MeshStandardMaterial;
  fireLight: THREE.PointLight;
  burnLevel: number;
  burnTimer: number;
  brokenMasts: number;
  damageTiltX: number;
  damageTiltZ: number;
}

export interface DestructibleBuilding {
  id: string;
  nameAr: string;
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  radius: number;
  height: number;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  colorHex: number;
  breakableParts: THREE.Object3D[];
  brokenCount: number;
  baseMeshPos: THREE.Vector3;
  baseMeshRot: THREE.Euler;
  scorchAmount: number;
}

export interface DestructibleTree {
  index: number;
  kind?: 'palm' | 'enchanted';
  pos: THREE.Vector3;
  radius: number;
  height: number;
  destroyed: boolean;
}

export interface HangingRoostSpot {
  pos: THREE.Vector3;
  yaw: number;
}

export interface WindCurrentStream {
  id: number;
  points: THREE.Vector3[];
  tangents: THREE.Vector3[];
  radius: number;
  strength: number;
  kind: 'jetstream' | 'thermal' | 'canyon_draft';
}

export interface WorldBuildResult {
  skyMaterial: THREE.ShaderMaterial;
  cloudMaterial: THREE.ShaderMaterial;
  cloudShadowUniforms: CloudShadowUniforms;
  oceanMesh: THREE.Mesh;
  oceanMaterial: THREE.MeshPhysicalMaterial;
  oceanCubeCamera: THREE.CubeCamera;
  oceanRenderTarget: THREE.WebGLCubeRenderTarget;
  cloudClusters: CloudCluster[];
  windCurrents: WindCurrentStream[];
  windRibbonMaterial: THREE.ShaderMaterial;
  windStreakMaterial: THREE.ShaderMaterial;
  narrowPillars: NarrowRockPillar[];
  pirateShips: PirateShipActor[];
  destructibleBuildings: DestructibleBuilding[];
  destructibleTrees: DestructibleTree[];
  hangingRoostSpots: HangingRoostSpot[];
  palmTrunkInst: THREE.InstancedMesh | null;
  palmCrownInst: THREE.InstancedMesh | null;
  hideTree: (tree: DestructibleTree) => void;
  banners: THREE.Mesh[];
  sanctuaryBeacon: THREE.Mesh;
  sanctuaryRing: THREE.Mesh;
  sanctuaryDragonPerch: THREE.Vector3;
  hideSoldiersForBuilding: (buildingId: string) => void;
  getWalkableGroundHeight: (x: number, z: number) => number;
  updateCitizens: (elapsed: number) => void;
  deformTerrain: (
    wx: number,
    wz: number,
    radius: number,
    depth: number,
    scorch?: number,
  ) => void;
  dispose: () => void;
}

const _zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);
const TERRAIN_SIZE = 10400;
const TERRAIN_SEGS = 340;
const TERRAIN_STRIDE = TERRAIN_SEGS + 1;
const TERRAIN_HALF = TERRAIN_SIZE * 0.5;
const TERRAIN_CELL = TERRAIN_SIZE / TERRAIN_SEGS;
let activeTerrainDeltas: Float32Array | null = null;

function radialHill(
  x: number,
  z: number,
  cx: number,
  cz: number,
  radius: number,
  height: number,
): number {
  const dx = x - cx;
  const dz = z - cz;
  const d2 = dx * dx + dz * dz;
  const r2 = radius * radius;
  if (d2 >= r2) return 0;
  const t = 1 - d2 / r2;
  return height * t * t;
}

function baseTerrainHeight(x: number, z: number): number {
  let h = -10;

  // 1. Sanctuary Rock Cavern Island (-640, 580) with carved interior shelter plateau & surrounding jagged crag rim
  const sanctuaryDist = Math.hypot(x + 640, z - 580);
  if (sanctuaryDist < 220) {
    const edge = Math.max(0, 1 - sanctuaryDist / 220);
    const plateau = Math.min(1, edge * 2.15);
    let sH = -4 + plateau * 48;
    // Horseshoe mountain ridge around west/south/north leaving east cavern mouth open
    if (sanctuaryDist > 48 && sanctuaryDist < 145) {
      const ang = Math.atan2(z - 580, x + 640);
      // Opening facing +X (angle ~ 0)
      const mouthMask = THREE.MathUtils.smoothstep(Math.abs(ang), 0.52, 1.25);
      const ringBell = Math.sin(((sanctuaryDist - 48) / 97) * Math.PI);
      const crag = 32 + Math.sin(x * 0.08 + z * 0.07) * 9;
      sH += ringBell * crag * mouthMask;
    }
    h = Math.max(h, sH);
  }

  // 2. Hanging Roost Cliff Ridge (-510, 375)
  const roostDist = Math.hypot(x + 510, z - 375);
  if (roostDist < 140) {
    const t = Math.max(0, 1 - roostDist / 140);
    const plateau = Math.min(1, t * 2.0);
    h = Math.max(h, -4 + plateau * 54 + Math.sin(x * 0.07) * 4 * t);
  }

  // 3. Twin Canyon Mountains with sweeping fly-through chasm (-480, -560)
  const cX = x + 480;
  const cZ = z + 560;
  const canyonDist = Math.hypot(cX, cZ);
  if (canyonDist < 420) {
    const envelope = Math.pow(Math.max(0, 1 - canyonDist / 420), 1.4);
    const jag =
      Math.sin(x * 0.038) * Math.cos(z * 0.038) * 26 +
      Math.sin(x * 0.095 + z * 0.07) * 11;
    let ridgeHeight = envelope * (175 + jag);

    const chasmCenterLine = cX - Math.sin(cZ * 0.014) * 38;
    const distFromChasm = Math.abs(chasmCenterLine);
    if (distFromChasm < 52) {
      const carve = Math.cos((distFromChasm / 52) * (Math.PI / 2));
      ridgeHeight *= 1 - Math.pow(carve, 1.35) * 0.91;
    }
    h = Math.max(h, ridgeHeight - 6);
  }

  // 4. West Cliff Fortress Kingdom Promontory (-880, -60)
  const castleDist = Math.hypot(x + 880, z + 60);
  if (castleDist < 230) {
    const t = Math.max(0, 1 - castleDist / 230);
    const plateau = Math.min(1, t * 2.15);
    h = Math.max(h, -4 + plateau * 66);
  }

  // 5. East Coral Royal Kingdom Peninsula (820, -480)
  const palaceDist = Math.hypot(x - 820, z + 480);
  if (palaceDist < 235) {
    const t = Math.max(0, 1 - palaceDist / 235);
    const plateau = Math.min(1, t * 1.95);
    h = Math.max(h, -4 + plateau * 34);
  }

  // 6. Golden Crescent Beach & Lagoon Cove (720, 560)
  const beachDist = Math.hypot(x - 720, z - 560);
  if (beachDist < 310) {
    const t = Math.max(0, 1 - beachDist / 310);
    const dune = Math.sin(x * 0.024) * Math.cos(z * 0.024) * 5;
    let beachH = -4 + Math.pow(t, 1.15) * 30 + dune * t;
    const lagoonDist = Math.hypot(x - 620, z - 485);
    if (lagoonDist < 95) {
      beachH -= (1 - lagoonDist / 95) * 16;
    }
    h = Math.max(h, beachH);
  }

  // 7. Volcanic Caldera Spire (940, 90)
  const volcDist = Math.hypot(x - 940, z - 90);
  if (volcDist < 270) {
    const t = Math.max(0, 1 - volcDist / 270);
    let cone = Math.pow(t, 1.25) * 150 + Math.sin(x * 0.07) * Math.cos(z * 0.07) * 9 * t;
    if (volcDist < 54) {
      cone -= (1 - volcDist / 54) * 74;
    }
    h = Math.max(h, cone - 6);
  }

  // 8. Northern Frost Spires Archipelago (120, -940)
  const frostDist = Math.hypot(x - 120, z + 940);
  if (frostDist < 320) {
    const t = Math.max(0, 1 - frostDist / 320);
    const spire =
      Math.pow(t, 1.35) * 135 +
      Math.abs(Math.sin(x * 0.045) * Math.cos(z * 0.045)) * 34 * t;
    h = Math.max(h, spire - 8);
  }

  // 9. Hidden Volcanic Archipelago (Northwest Outer Sea: -1520, -1500 & flanking volcanic isles)
  const hiddenVolcDist = Math.hypot(x + 1520, z + 1500);
  if (hiddenVolcDist < 350) {
    const t = Math.max(0, 1 - hiddenVolcDist / 350);
    let cone =
      Math.pow(t, 1.2) * 168 +
      Math.sin(x * 0.048) * Math.cos(z * 0.048) * 14 * t +
      Math.sin(x * 0.11 + z * 0.09) * 6 * t;
    // Deep caldera bowl + dramatic southeastern lava breach for thrilling fly-throughs
    if (hiddenVolcDist < 66) {
      cone -= (1 - hiddenVolcDist / 66) * 86;
    } else {
      const ang = Math.atan2(z + 1500, x + 1520);
      if (Math.abs(ang - 0.78) < 0.34 && hiddenVolcDist < 220) {
        cone -= 36 * (1 - Math.abs(ang - 0.78) / 0.34);
      }
    }
    h = Math.max(h, cone - 6);
  }

  const basaltIsleDist = Math.hypot(x + 1840, z + 1240);
  if (basaltIsleDist < 205) {
    const t = Math.max(0, 1 - basaltIsleDist / 205);
    const crag =
      Math.pow(t, 1.25) * 98 +
      Math.abs(Math.sin(x * 0.065) * Math.cos(z * 0.065)) * 24 * t;
    h = Math.max(h, crag - 6);
  }

  const emberAtollDist = Math.hypot(x + 1230, z + 1780);
  if (emberAtollDist < 195) {
    const t = Math.max(0, 1 - emberAtollDist / 195);
    let ring = Math.pow(t, 1.15) * 88 + Math.sin(x * 0.07 + z * 0.06) * 8 * t;
    if (emberAtollDist < 48) {
      ring -= (1 - emberAtollDist / 48) * 62;
    }
    h = Math.max(h, ring - 5);
  }

  // 10. Enchanted Ancient Forests Archipelago (Southwest Outer Sea: -1600, 1220 & misty groves)
  const enchMainDist = Math.hypot(x + 1600, z - 1220);
  if (enchMainDist < 370) {
    const t = Math.max(0, 1 - enchMainDist / 370);
    const undulation =
      Math.sin(x * 0.018) * Math.cos(z * 0.018) * 11 +
      Math.sin(x * 0.045 + z * 0.04) * 5;
    // Gentle outer rim hills dipping to an open landing & walking glade at center
    const centerBowl = enchMainDist < 85 ? (1 - enchMainDist / 85) * 14 : 0;
    const fH = -4 + Math.pow(t, 0.95) * 56 + undulation * t - centerBowl;
    h = Math.max(h, fH);
  }

  const enchWestIsle = Math.hypot(x + 1940, z - 920);
  if (enchWestIsle < 195) {
    const t = Math.max(0, 1 - enchWestIsle / 195);
    const fH = -4 + Math.pow(t, 1.1) * 48 + Math.sin(x * 0.032) * Math.cos(z * 0.032) * 8 * t;
    h = Math.max(h, fH);
  }

  const enchSouthGrove = Math.hypot(x + 1280, z - 1480);
  if (enchSouthGrove < 200) {
    const t = Math.max(0, 1 - enchSouthGrove / 200);
    const fH = -4 + Math.pow(t, 1.05) * 44 + Math.sin(x * 0.028 + z * 0.03) * 7 * t;
    h = Math.max(h, fH);
  }

  // 11. Scattered Sea Stacks & Outer Reef Islands across the expanded 10400m ocean
  h = Math.max(h, radialHill(x, z, -140, -240, 44, 58) - 5);
  h = Math.max(h, radialHill(x, z, 280, -140, 38, 48) - 5);
  h = Math.max(h, radialHill(x, z, -210, 310, 42, 44) - 5);
  h = Math.max(h, radialHill(x, z, 240, 620, 56, 52) - 5);
  h = Math.max(h, radialHill(x, z, -1120, 460, 82, 85) - 6);
  h = Math.max(h, radialHill(x, z, 1180, -760, 74, 72) - 6);
  h = Math.max(h, radialHill(x, z, 360, 1080, 90, 64) - 6);
  h = Math.max(h, radialHill(x, z, -960, -820, 85, 88) - 6);
  h = Math.max(h, radialHill(x, z, -1210, -1080, 68, 76) - 6);
  h = Math.max(h, radialHill(x, z, -1180, 960, 64, 58) - 6);
  h = Math.max(h, radialHill(x, z, 1480, 1180, 105, 82) - 6);
  h = Math.max(h, radialHill(x, z, 1420, -1280, 95, 92) - 6);

  // 12. Eastern Sky Spires (Far Northeast: 2950, -2350) & flanking ridge
  const skySpireDist = Math.hypot(x - 2950, z + 2350);
  if (skySpireDist < 540) {
    const t = Math.max(0, 1 - skySpireDist / 540);
    const jag =
      Math.abs(Math.sin(x * 0.032) * Math.cos(z * 0.032)) * 52 * t +
      Math.sin(x * 0.075 + z * 0.06) * 14 * t;
    const peak = Math.pow(t, 1.25) * 188 + jag;
    h = Math.max(h, peak - 8);
  }
  const eastFlankDist = Math.hypot(x - 3360, z + 2040);
  if (eastFlankDist < 290) {
    const t = Math.max(0, 1 - eastFlankDist / 290);
    h = Math.max(
      h,
      Math.pow(t, 1.2) * 124 + Math.abs(Math.sin(x * 0.045) * Math.cos(z * 0.045)) * 28 * t - 6,
    );
  }

  // 13. Southern Coral Atoll & Tropical Lagoon (Far Southeast: 2450, 2780)
  const atollCoralDist = Math.hypot(x - 2450, z - 2780);
  if (atollCoralDist < 580) {
    const t = Math.max(0, 1 - atollCoralDist / 580);
    const dune = Math.sin(x * 0.021) * Math.cos(z * 0.021) * 7;
    let coralH = -4 + Math.pow(t, 0.92) * 44 + dune * t;
    if (atollCoralDist < 225) {
      const ang = Math.atan2(z - 2780, x - 2450);
      const mouthMask = THREE.MathUtils.smoothstep(Math.abs(ang + 2.2), 0.3, 0.95);
      coralH -= (1 - atollCoralDist / 225) * (36 - mouthMask * 6);
    }
    h = Math.max(h, coralH);
  }
  const southShoalDist = Math.hypot(x - 2890, z - 2490);
  if (southShoalDist < 240) {
    const t = Math.max(0, 1 - southShoalDist / 240);
    h = Math.max(h, -4 + Math.pow(t, 1.05) * 32 + Math.sin(x * 0.03) * 4 * t);
  }

  // 14. Northern Glacier Crown (Far North: -360, -3350)
  const glacierDist = Math.hypot(x + 360, z + 3350);
  if (glacierDist < 620) {
    const t = Math.max(0, 1 - glacierDist / 620);
    const crags =
      Math.abs(Math.sin(x * 0.034) * Math.cos(z * 0.034)) * 54 * t +
      Math.sin(x * 0.08 + z * 0.07) * 16 * t;
    h = Math.max(h, Math.pow(t, 1.28) * 195 + crags - 8);
  }
  const glacierWestDist = Math.hypot(x + 860, z + 3120);
  if (glacierWestDist < 310) {
    const t = Math.max(0, 1 - glacierWestDist / 310);
    h = Math.max(
      h,
      Math.pow(t, 1.3) * 136 + Math.abs(Math.sin(x * 0.05) * Math.cos(z * 0.05)) * 28 * t - 7,
    );
  }

  // 15. Western Storm Isles (Far West: -3250, 260)
  const stormIsleDist = Math.hypot(x + 3250, z - 260);
  if (stormIsleDist < 520) {
    const t = Math.max(0, 1 - stormIsleDist / 520);
    const crag =
      Math.pow(t, 1.22) * 158 +
      Math.sin(x * 0.042) * Math.cos(z * 0.042) * 24 * t +
      Math.abs(Math.sin(x * 0.085)) * 18 * t;
    h = Math.max(h, crag - 7);
  }
  const stormOutcropDist = Math.hypot(x + 3640, z + 140);
  if (stormOutcropDist < 260) {
    const t = Math.max(0, 1 - stormOutcropDist / 260);
    h = Math.max(h, Math.pow(t, 1.25) * 112 + Math.sin(x * 0.06) * 14 * t - 6);
  }

  // 16. Distant Open-Ocean Reefs & Basalt Sea Stacks (1900m - 4300m)
  h = Math.max(h, radialHill(x, z, 2150, -680, 115, 96) - 6);
  h = Math.max(h, radialHill(x, z, 2080, 1280, 128, 84) - 6);
  h = Math.max(h, radialHill(x, z, 860, 2240, 136, 78) - 6);
  h = Math.max(h, radialHill(x, z, -740, 2320, 145, 92) - 6);
  h = Math.max(h, radialHill(x, z, -2420, 2240, 155, 118) - 6);
  h = Math.max(h, radialHill(x, z, -2680, -1980, 150, 126) - 6);
  h = Math.max(h, radialHill(x, z, 1520, -2580, 130, 112) - 6);
  h = Math.max(h, radialHill(x, z, 3780, 420, 165, 128) - 6);
  h = Math.max(h, radialHill(x, z, 120, 3850, 180, 108) - 6);
  h = Math.max(h, radialHill(x, z, -2950, -3100, 175, 142) - 6);
  h = Math.max(h, radialHill(x, z, 3880, -3420, 160, 136) - 6);
  h = Math.max(h, radialHill(x, z, 3620, 3550, 155, 94) - 6);
  h = Math.max(h, radialHill(x, z, -3650, 2650, 168, 124) - 6);

  return h;
}

export function getTerrainHeight(x: number, z: number): number {
  let h = baseTerrainHeight(x, z);
  if (activeTerrainDeltas) {
    const fx = (x + TERRAIN_HALF) / TERRAIN_CELL;
    const fz = (z + TERRAIN_HALF) / TERRAIN_CELL;
    if (fx >= 0 && fx < TERRAIN_SEGS && fz >= 0 && fz < TERRAIN_SEGS) {
      const ix = fx | 0;
      const iz = fz | 0;
      const tx = fx - ix;
      const tz = fz - iz;
      const i00 = iz * TERRAIN_STRIDE + ix;
      const d00 = activeTerrainDeltas[i00];
      const d10 = activeTerrainDeltas[i00 + 1];
      const d01 = activeTerrainDeltas[i00 + TERRAIN_STRIDE];
      const d11 = activeTerrainDeltas[i00 + TERRAIN_STRIDE + 1];
      const d0 = d00 + (d10 - d00) * tx;
      const d1 = d01 + (d11 - d01) * tx;
      h += d0 + (d1 - d0) * tz;
    }
  }
  return h;
}

/**
 * Builds a single merged, vertex-colored 6-part warrior/pirate BufferGeometry
 * (legs, cuirass, shoulder pauldrons, crested helmet, shield, spear/cutlass)
 * so entire garrisons & ship crews render in 1 single InstancedMesh draw call!
 */
function createWarriorGeometry(kind: 'castle' | 'palace' | 'pirate'): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const pushPart = (geo: THREE.BufferGeometry, colorHex: number) => {
    const nonIdx = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    if (nonIdx.attributes.uv) nonIdx.deleteAttribute('uv');
    const count = nonIdx.attributes.position.count;
    const cols = new Float32Array(count * 3);
    const c = new THREE.Color(colorHex);
    for (let i = 0; i < count; i++) {
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    nonIdx.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    nonIdx.computeVertexNormals();
    parts.push(nonIdx);
  };

  const primaryArmor =
    kind === 'castle' ? 0x64748b : kind === 'palace' ? 0xc29338 : 0x3f2c22;
  const clothAccent =
    kind === 'castle' ? 0x991b1b : kind === 'palace' ? 0x0f766e : 0xb91c1c;
  const steelCol = 0xcbd5e1;

  // Legs
  const legL = new THREE.BoxGeometry(0.28, 0.95, 0.3);
  legL.translate(-0.18, 0.48, 0);
  pushPart(legL, 0x1e293b);

  const legR = new THREE.BoxGeometry(0.28, 0.95, 0.3);
  legR.translate(0.18, 0.48, 0);
  pushPart(legR, 0x1e293b);

  // Armored Torso
  const torso = new THREE.CylinderGeometry(0.38, 0.32, 0.95, 7);
  torso.translate(0, 1.38, 0);
  pushPart(torso, primaryArmor);

  // Pauldrons / Sash
  const pauldron = new THREE.BoxGeometry(0.92, 0.28, 0.46);
  pauldron.translate(0, 1.72, 0);
  pushPart(pauldron, clothAccent);

  // Helmet / Pirate Headgear
  const head = new THREE.SphereGeometry(0.26, 7, 6);
  head.translate(0, 2.08, 0);
  pushPart(head, kind === 'pirate' ? 0xd9a074 : steelCol);

  const crest =
    kind === 'pirate'
      ? new THREE.BoxGeometry(0.56, 0.14, 0.46)
      : new THREE.BoxGeometry(0.14, 0.3, 0.44);
  crest.translate(0, kind === 'pirate' ? 2.26 : 2.34, 0);
  pushPart(crest, clothAccent);

  // Shield on left arm
  const shield = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 8);
  shield.rotateX(Math.PI / 2);
  shield.rotateY(0.35);
  shield.translate(-0.52, 1.35, 0.25);
  pushPart(shield, clothAccent);

  // Spear / Raised Cutlass on right arm
  const weapon =
    kind === 'pirate'
      ? new THREE.BoxGeometry(0.1, 1.35, 0.18)
      : new THREE.CylinderGeometry(0.045, 0.055, 2.55, 5);
  weapon.rotateX(kind === 'pirate' ? 0.42 : 0.12);
  weapon.translate(0.54, kind === 'pirate' ? 1.8 : 1.75, 0.2);
  pushPart(weapon, steelCol);

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged!;
}

/**
 * Builds a merged vertex-colored peaceful Townsfolk / Palace Noble geometry
 * (tunic, cloak, sash, headwrap/hat) rendered in 1 single InstancedMesh draw call.
 */
function createCitizenGeometry(variant: 'palace' | 'castle' | 'beach'): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const pushPart = (geo: THREE.BufferGeometry, colorHex: number) => {
    const nonIdx = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    if (nonIdx.attributes.uv) nonIdx.deleteAttribute('uv');
    const count = nonIdx.attributes.position.count;
    const cols = new Float32Array(count * 3);
    const c = new THREE.Color(colorHex);
    for (let i = 0; i < count; i++) {
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    nonIdx.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    nonIdx.computeVertexNormals();
    parts.push(nonIdx);
  };

  const robeCol =
    variant === 'palace' ? 0x0f766e : variant === 'castle' ? 0x7c2d12 : 0xd97706;
  const trimCol =
    variant === 'palace' ? 0xfbbf24 : variant === 'castle' ? 0x94a3b8 : 0xfef3c7;
  const skinCol = 0xd9a074;

  // Lower Robe / Legs
  const robe = new THREE.CylinderGeometry(0.28, 0.42, 1.05, 8);
  robe.translate(0, 0.54, 0);
  pushPart(robe, variant === 'beach' ? 0xf5deb3 : 0x334155);

  // Tunic Torso
  const torso = new THREE.CylinderGeometry(0.32, 0.28, 0.82, 8);
  torso.translate(0, 1.42, 0);
  pushPart(torso, robeCol);

  // Flowing Sash / Vest
  const sash = new THREE.BoxGeometry(0.68, 0.28, 0.42);
  sash.translate(0, 1.66, 0);
  pushPart(sash, trimCol);

  // Arms
  const armL = new THREE.CapsuleGeometry(0.09, 0.48, 4, 6);
  armL.translate(-0.4, 1.42, 0);
  pushPart(armL, robeCol);

  const armR = new THREE.CapsuleGeometry(0.09, 0.48, 4, 6);
  armR.translate(0.4, 1.42, 0);
  pushPart(armR, robeCol);

  // Head + Headwrap / Crowned Cap
  const head = new THREE.SphereGeometry(0.23, 8, 6);
  head.translate(0, 2.04, 0);
  pushPart(head, skinCol);

  const turban = new THREE.CylinderGeometry(0.25, 0.27, 0.22, 8);
  turban.translate(0, 2.24, 0);
  pushPart(turban, trimCol);

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged!;
}

interface SoldierPlacement {
  buildingId: string;
  matrix: THREE.Matrix4;
}

interface BuildingPartSpec {
  id: string;
  nameAr: string;
  obj: THREE.Object3D;
  localCenter: THREE.Vector3;
  radius: number;
  height: number;
  hp: number;
  colorHex: number;
  breakableParts: THREE.Object3D[];
}

function buildCompositeCastle(
  stoneTex: THREE.Texture,
  stoneNormal: THREE.Texture,
): {
  group: THREE.Group;
  banners: THREE.Mesh[];
  parts: BuildingPartSpec[];
  soldierPlacements: { buildingId: string; localPos: THREE.Vector3; yaw: number }[];
} {
  const group = new THREE.Group();
  const banners: THREE.Mesh[] = [];
  const parts: BuildingPartSpec[] = [];
  const soldierPlacements: { buildingId: string; localPos: THREE.Vector3; yaw: number }[] = [];

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x6f6961,
    map: stoneTex,
    normalMap: stoneNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.88,
    metalness: 0.06,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x2a364d,
    roughness: 0.48,
    metalness: 0.32,
  });
  const bannerMat = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    roughness: 0.74,
    side: THREE.DoubleSide,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xc2851c,
    roughness: 0.26,
    metalness: 0.88,
  });
  const torchMat = new THREE.MeshStandardMaterial({
    color: 0xffaa33,
    emissive: 0xff6a00,
    emissiveIntensity: 3.4,
  });

  const base = new THREE.Mesh(new THREE.BoxGeometry(84, 14, 84), stoneMat);
  base.position.y = 7;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // Destructible Central Keep
  const keepGroup = new THREE.Group();
  group.add(keepGroup);

  const keep = new THREE.Mesh(new THREE.BoxGeometry(32, 44, 32), stoneMat);
  keep.position.set(0, 28, 0);
  keep.castShadow = true;
  keep.receiveShadow = true;
  keepGroup.add(keep);

  const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(25, 20, 4), roofMat);
  keepRoof.rotation.y = Math.PI / 4;
  keepRoof.position.set(0, 60, 0);
  keepRoof.castShadow = true;
  keepRoof.receiveShadow = true;
  keepGroup.add(keepRoof);

  const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.85, 9, 6), goldMat);
  finial.position.set(0, 72, 0);
  finial.castShadow = true;
  keepGroup.add(finial);

  parts.push({
    id: 'castle_keep',
    nameAr: 'قلعة الصقر — البرج الأعظم',
    obj: keepGroup,
    localCenter: new THREE.Vector3(0, 16, 0),
    radius: 21,
    height: 60,
    hp: 120,
    colorHex: 0x6f6961,
    breakableParts: [finial, keepRoof],
  });

  // Keep roof rampart guards
  [-11, 0, 11].forEach((gx) => {
    soldierPlacements.push({
      buildingId: 'castle_keep',
      localPos: new THREE.Vector3(gx, 50, 14),
      yaw: 0,
    });
  });

  // Destructible Gatehouse archway (pivoted at (0, 7, 40))
  const gateGroup = new THREE.Group();
  gateGroup.position.set(0, 7, 40);
  group.add(gateGroup);
  const gateL = new THREE.Mesh(new THREE.BoxGeometry(9, 18, 11), stoneMat);
  gateL.position.set(-11, 9, 0);
  gateL.castShadow = true;
  gateL.receiveShadow = true;
  const gateR = gateL.clone();
  gateR.position.set(11, 9, 0);
  const gateBridge = new THREE.Mesh(new THREE.BoxGeometry(32, 6.5, 11), stoneMat);
  gateBridge.position.set(0, 20, 0);
  gateBridge.castShadow = true;
  gateBridge.receiveShadow = true;
  gateGroup.add(gateL, gateR, gateBridge);
  parts.push({
    id: 'castle_gate',
    nameAr: 'بوابة المملكة الحجرية',
    obj: gateGroup,
    localCenter: new THREE.Vector3(0, 12, 40),
    radius: 17,
    height: 25,
    hp: 80,
    colorHex: 0x6f6961,
    breakableParts: [gateBridge, gateL],
  });

  [-9, -3, 3, 9].forEach((gx) => {
    soldierPlacements.push({
      buildingId: 'castle_gate',
      localPos: new THREE.Vector3(gx, 30.3, 40),
      yaw: 0,
    });
  });

  // 4 Destructible Outer Kingdom Curtains / Battlement Walls (pivoted at (wc.x, 10, wc.z))
  const wallConfigs = [
    { id: 'castle_wall_n', nameAr: 'سور المملكة الشمالي', x: 0, z: -40, ry: 0 },
    { id: 'castle_wall_w', nameAr: 'سور المملكة الغربي', x: -40, z: 0, ry: Math.PI / 2 },
    { id: 'castle_wall_e', nameAr: 'سور المملكة الشرقي', x: 40, z: 0, ry: Math.PI / 2 },
  ];
  wallConfigs.forEach((wc) => {
    const wGroup = new THREE.Group();
    wGroup.position.set(wc.x, 10, wc.z);
    wGroup.rotation.y = wc.ry;
    group.add(wGroup);
    const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(56, 16, 6), stoneMat);
    wallMesh.position.set(0, 8, 0);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    wGroup.add(wallMesh);

    const wallBreakables: THREE.Object3D[] = [];
    for (let m = -22; m <= 22; m += 7.3) {
      const merl = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.2, 2.4), stoneMat);
      merl.position.set(m, 17.6, 0);
      merl.castShadow = true;
      wGroup.add(merl);
      wallBreakables.push(merl);
    }

    // Wall soldiers standing on the parapet
    for (let s = -18; s <= 18; s += 9) {
      const cosR = Math.cos(wc.ry);
      const sinR = Math.sin(wc.ry);
      soldierPlacements.push({
        buildingId: wc.id,
        localPos: new THREE.Vector3(wc.x + s * cosR, 26.0, wc.z - s * sinR),
        yaw: wc.ry,
      });
    }

    parts.push({
      id: wc.id,
      nameAr: wc.nameAr,
      obj: wGroup,
      localCenter: new THREE.Vector3(wc.x, 16, wc.z),
      radius: 22,
      height: 28,
      hp: 70,
      colorHex: 0x6f6961,
      breakableParts: wallBreakables,
    });
  });

  // 4 Destructible Corner Towers with guards on battlements (pivoted at (cx, 0, cz))
  const corners = [
    [-39, -39],
    [39, -39],
    [-39, 39],
    [39, 39],
  ];
  corners.forEach(([cx, cz], idx) => {
    const towerGroup = new THREE.Group();
    towerGroup.position.set(cx, 0, cz);
    group.add(towerGroup);

    const tower = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 10, 42, 14), stoneMat);
    tower.position.set(0, 21, 0);
    tower.castShadow = true;
    tower.receiveShadow = true;
    towerGroup.add(tower);

    const tRoof = new THREE.Mesh(new THREE.ConeGeometry(10.4, 15, 14), roofMat);
    tRoof.position.set(0, 49, 0);
    tRoof.castShadow = true;
    tRoof.receiveShadow = true;
    towerGroup.add(tRoof);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 9, 6), goldMat);
    pole.position.set(0, 59, 0);
    pole.castShadow = true;
    towerGroup.add(pole);

    const banner = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 2.8, 4, 1), bannerMat);
    banner.position.set(3.2, 61.5, 0);
    banner.castShadow = true;
    towerGroup.add(banner);
    banners.push(banner);

    const torch = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 8), torchMat);
    torch.position.set(0, 42.5, 0);
    towerGroup.add(torch);

    if (idx < 2) {
      const brazierLight = new THREE.PointLight(0xff8833, 10, 90, 1.8);
      brazierLight.position.set(0, 44, 0);
      towerGroup.add(brazierLight);
    }

    const tId = `castle_tower_${idx}`;
    for (let a = 0; a < 3; a++) {
      const ang = (a / 3) * Math.PI * 2;
      soldierPlacements.push({
        buildingId: tId,
        localPos: new THREE.Vector3(cx + Math.cos(ang) * 6.2, 42.0, cz + Math.sin(ang) * 6.2),
        yaw: ang,
      });
    }

    parts.push({
      id: tId,
      nameAr: 'برج مراقبة القلعة',
      obj: towerGroup,
      localCenter: new THREE.Vector3(cx, 15, cz),
      radius: 12.5,
      height: 52,
      hp: 72,
      colorHex: 0x57524b,
      breakableParts: [banner, pole, tRoof, torch],
    });
  });

  // Wide Stone Access Ramp leading through the open gatehouse into the courtyard
  for (let s = 0; s < 10; s++) {
    const t = s / 9;
    const step = new THREE.Mesh(new THREE.BoxGeometry(20, 1.5, 3.2), stoneMat);
    step.position.set(0, 13.3 - t * 13.0, 43.2 + s * 2.8);
    step.castShadow = true;
    step.receiveShadow = true;
    group.add(step);
  }

  // Courtyard patrol guards (remain on base)
  [
    [-16, 14, 24],
    [16, 14, 24],
    [-18, 14, -18],
    [18, 14, -18],
  ].forEach(([sx, sy, sz]) => {
    soldierPlacements.push({
      buildingId: 'castle_courtyard',
      localPos: new THREE.Vector3(sx, sy, sz),
      yaw: sx > 0 ? -0.4 : 0.4,
    });
  });

  return { group, banners, parts, soldierPlacements };
}

function buildAncientPalace(
  stoneTex: THREE.Texture,
  stoneNormal: THREE.Texture,
): {
  group: THREE.Group;
  banners: THREE.Mesh[];
  parts: BuildingPartSpec[];
  soldierPlacements: { buildingId: string; localPos: THREE.Vector3; yaw: number }[];
} {
  const group = new THREE.Group();
  const banners: THREE.Mesh[] = [];
  const parts: BuildingPartSpec[] = [];
  const soldierPlacements: { buildingId: string; localPos: THREE.Vector3; yaw: number }[] = [];

  const marbleMat = new THREE.MeshStandardMaterial({
    color: 0xc2b6a1,
    map: stoneTex,
    normalMap: stoneNormal,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.6,
    metalness: 0.08,
  });
  const domeMat = new THREE.MeshStandardMaterial({
    color: 0xb88228,
    roughness: 0.25,
    metalness: 0.88,
  });
  const tealTrimMat = new THREE.MeshStandardMaterial({
    color: 0x0d5c55,
    roughness: 0.42,
    metalness: 0.36,
  });
  const bannerMat = new THREE.MeshStandardMaterial({
    color: 0x0369a1,
    roughness: 0.72,
    side: THREE.DoubleSide,
  });

  const terrace = new THREE.Mesh(new THREE.BoxGeometry(88, 10, 70), marbleMat);
  terrace.position.y = 5;
  terrace.castShadow = true;
  terrace.receiveShadow = true;
  group.add(terrace);

  const mainHallGroup = new THREE.Group();
  group.add(mainHallGroup);

  const hall = new THREE.Mesh(new THREE.BoxGeometry(40, 24, 36), marbleMat);
  hall.position.y = 22;
  hall.castShadow = true;
  hall.receiveShadow = true;
  mainHallGroup.add(hall);

  const drum = new THREE.Mesh(new THREE.CylinderGeometry(12, 13, 8, 18), tealTrimMat);
  drum.position.y = 37;
  drum.castShadow = true;
  drum.receiveShadow = true;
  mainHallGroup.add(drum);

  const mainDome = new THREE.Mesh(
    new THREE.SphereGeometry(12.2, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    domeMat,
  );
  mainDome.position.y = 41;
  mainDome.castShadow = true;
  mainDome.receiveShadow = true;
  mainHallGroup.add(mainDome);

  const spire = new THREE.Mesh(new THREE.ConeGeometry(1.2, 10, 8), domeMat);
  spire.position.y = 57;
  spire.castShadow = true;
  mainHallGroup.add(spire);

  parts.push({
    id: 'palace_dome',
    nameAr: 'قبة قصر المرجان',
    obj: mainHallGroup,
    localCenter: new THREE.Vector3(0, 14, 0),
    radius: 22,
    height: 48,
    hp: 105,
    colorHex: 0xc2b6a1,
    breakableParts: [spire, mainDome, drum],
  });

  [-30, 30].forEach((px, idx) => {
    const wingGroup = new THREE.Group();
    wingGroup.position.set(px, 10, 0);
    group.add(wingGroup);

    const wing = new THREE.Mesh(new THREE.BoxGeometry(18, 16, 26), marbleMat);
    wing.position.set(0, 8, 0);
    wing.castShadow = true;
    wing.receiveShadow = true;
    wingGroup.add(wing);

    const sideDome = new THREE.Mesh(
      new THREE.SphereGeometry(7.2, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      tealTrimMat,
    );
    sideDome.position.set(0, 16, 0);
    sideDome.castShadow = true;
    wingGroup.add(sideDome);

    const banner = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.5, 4, 1), bannerMat);
    banner.position.set(2.6, 26, 0);
    banner.castShadow = true;
    wingGroup.add(banner);
    banners.push(banner);

    const wingId = `palace_wing_${idx}`;
    soldierPlacements.push(
      { buildingId: wingId, localPos: new THREE.Vector3(px - 5, 26, 10), yaw: 0 },
      { buildingId: wingId, localPos: new THREE.Vector3(px + 5, 26, 10), yaw: 0 },
    );

    parts.push({
      id: wingId,
      nameAr: 'جناح القصر الملكي',
      obj: wingGroup,
      localCenter: new THREE.Vector3(px, 12, 0),
      radius: 14,
      height: 30,
      hp: 70,
      colorHex: 0xc2b6a1,
      breakableParts: [banner, sideDome],
    });
  });

  // Royal Seafront Rampart Wall with Grand Open Archway Entrance (pivoted at (0, 9, 32))
  const frontWallGroup = new THREE.Group();
  frontWallGroup.position.set(0, 9, 32);
  group.add(frontWallGroup);
  const frontWallL = new THREE.Mesh(new THREE.BoxGeometry(26, 12, 5.5), marbleMat);
  frontWallL.position.set(-24, 6, 0);
  frontWallL.castShadow = true;
  frontWallL.receiveShadow = true;
  const frontWallArch = new THREE.Mesh(new THREE.BoxGeometry(24, 4.2, 5.5), marbleMat);
  frontWallArch.position.set(0, 10.5, 0);
  frontWallArch.castShadow = true;
  frontWallArch.receiveShadow = true;
  const frontWallR = new THREE.Mesh(new THREE.BoxGeometry(26, 12, 5.5), marbleMat);
  frontWallR.position.set(24, 6, 0);
  frontWallR.castShadow = true;
  frontWallR.receiveShadow = true;
  frontWallGroup.add(frontWallL, frontWallArch, frontWallR);
  parts.push({
    id: 'palace_wall_front',
    nameAr: 'سور قصر المرجان الأمامي',
    obj: frontWallGroup,
    localCenter: new THREE.Vector3(0, 14, 32),
    radius: 26,
    height: 22,
    hp: 65,
    colorHex: 0xc2b6a1,
    breakableParts: [frontWallArch, frontWallL],
  });

  for (let gx = -26; gx <= 26; gx += 8.6) {
    soldierPlacements.push({
      buildingId: 'palace_wall_front',
      localPos: new THREE.Vector3(gx, 21, 32),
      yaw: 0,
    });
  }

  for (let cx = -20; cx <= 20; cx += 6.6) {
    if (Math.abs(cx) < 4) continue;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 16, 10), marbleMat);
    col.position.set(cx, 18, 24);
    col.castShadow = true;
    col.receiveShadow = true;
    group.add(col);
  }

  // Grand Marble Staircase leading up onto the Royal Terrace
  for (let s = 0; s < 9; s++) {
    const t = s / 8;
    const step = new THREE.Mesh(new THREE.BoxGeometry(22, 1.2, 2.8), marbleMat);
    step.position.set(0, 9.4 - t * 9.0, 36.2 + s * 2.5);
    step.castShadow = true;
    step.receiveShadow = true;
    group.add(step);
  }

  // Ornate Courtyard Fountain & Market Canopies on the Royal Plaza
  const fountainRim = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 6.2, 1.5, 16), marbleMat);
  fountainRim.position.set(0, 10.6, 20);
  fountainRim.receiveShadow = true;
  fountainRim.castShadow = true;
  group.add(fountainRim);

  const waterPoolMat = new THREE.MeshStandardMaterial({
    color: 0x0ea5e9,
    roughness: 0.12,
    metalness: 0.25,
  });
  const fountainWater = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 4.8, 0.4, 16), waterPoolMat);
  fountainWater.position.set(0, 11.2, 20);
  group.add(fountainWater);

  const fountainSpire = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 1.1, 4.5, 10), domeMat);
  fountainSpire.position.set(0, 12.8, 20);
  fountainSpire.castShadow = true;
  group.add(fountainSpire);

  // Market & Royal Pavilion Canopies flanking the outer plaza
  [
    [-26, 46, 0x0f766e],
    [26, 46, 0xb45309],
  ].forEach(([bx, bz, cHex]) => {
    const stallMat = new THREE.MeshStandardMaterial({ color: cHex, roughness: 0.8 });
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(5.2, 2.6, 4), stallMat);
    canopy.rotation.y = Math.PI / 4;
    canopy.position.set(bx, 6.2, bz);
    canopy.castShadow = true;
    group.add(canopy);
    for (const [px, pz] of [
      [-2.8, -2.8],
      [2.8, -2.8],
      [-2.8, 2.8],
      [2.8, 2.8],
    ]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 5.2, 6), marbleMat);
      post.position.set(bx + px, 2.8, bz + pz);
      group.add(post);
    }
  });

  // Terrace honor guard
  [-14, -9, 9, 14].forEach((tx) => {
    soldierPlacements.push({
      buildingId: 'palace_terrace',
      localPos: new THREE.Vector3(tx, 10, 27),
      yaw: 0,
    });
  });

  return { group, banners, parts, soldierPlacements };
}

function buildPirateShip(
  woodTex: THREE.Texture,
  sailTex: THREE.Texture,
  pirateSoldierGeo: THREE.BufferGeometry,
  pirateSoldierMat: THREE.Material,
): {
  ship: THREE.Group;
  masts: THREE.Group[];
  sails: THREE.Mesh[];
  hullMat: THREE.MeshStandardMaterial;
  sailMat: THREE.MeshStandardMaterial;
  fireLight: THREE.PointLight;
} {
  const ship = new THREE.Group();
  const masts: THREE.Group[] = [];
  const sails: THREE.Mesh[] = [];

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x5c3c28,
    map: woodTex,
    roughness: 0.78,
    metalness: 0.08,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xd49b35,
    roughness: 0.35,
    metalness: 0.8,
  });
  const mastMat = new THREE.MeshStandardMaterial({
    color: 0x3b2416,
    roughness: 0.85,
  });
  const sailMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: sailTex,
    roughness: 0.75,
    side: THREE.DoubleSide,
  });
  const lanternMat = new THREE.MeshStandardMaterial({
    color: 0xffb347,
    emissive: 0xff8800,
    emissiveIntensity: 2.6,
  });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(10.5, 6.5, 36), hullMat);
  hull.position.y = 2.5;
  hull.castShadow = true;
  hull.receiveShadow = true;
  ship.add(hull);

  const bowGeo = new THREE.ConeGeometry(5.6, 11.5, 4);
  bowGeo.rotateX(-Math.PI / 2);
  bowGeo.rotateZ(Math.PI / 4);
  const bow = new THREE.Mesh(bowGeo, hullMat);
  bow.position.set(0, 3.0, -22);
  bow.scale.set(0.92, 0.72, 1);
  bow.castShadow = true;
  ship.add(bow);

  const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 13, 8), mastMat);
  bowsprit.rotation.x = Math.PI / 2 - 0.28;
  bowsprit.position.set(0, 6.4, -25);
  bowsprit.castShadow = true;
  ship.add(bowsprit);

  const stern = new THREE.Mesh(new THREE.BoxGeometry(10.6, 4.5, 10.5), hullMat);
  stern.position.set(0, 7.2, 12.5);
  stern.castShadow = true;
  ship.add(stern);

  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 8), lanternMat);
  lantern.position.set(0, 9.8, 18.2);
  ship.add(lantern);

  const fireLight = new THREE.PointLight(0xff6b1a, 0, 95, 1.35);
  fireLight.position.set(0, 10.5, 0);
  ship.add(fireLight);

  const mastConfigs = [
    { z: -9.5, h: 24, sailW: 13, sailH: 10, sailY: 11.5 },
    { z: 1.5, h: 29, sailW: 16, sailH: 13, sailY: 13.5 },
    { z: 12, h: 21, sailW: 11, sailH: 8.5, sailY: 10.5 },
  ];

  mastConfigs.forEach((m) => {
    // Pivot mast group at deck height (y = 4.5) so individual masts visibly crack, lean & topple when hit!
    const mastGroup = new THREE.Group();
    mastGroup.position.set(0, 4.5, m.z);
    ship.add(mastGroup);
    masts.push(mastGroup);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, m.h, 8), mastMat);
    mast.position.set(0, m.h / 2 - 0.5, 0);
    mast.castShadow = true;
    mastGroup.add(mast);

    const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, m.sailW + 2, 6), trimMat);
    yard.rotation.z = Math.PI / 2;
    yard.position.set(0, m.sailY + m.sailH * 0.45, 0);
    mastGroup.add(yard);

    const sailGeo = new THREE.PlaneGeometry(m.sailW, m.sailH, 6, 4);
    const pos = sailGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const bulge =
        Math.cos((x / m.sailW) * Math.PI) * Math.cos((y / m.sailH) * Math.PI) * 2.2;
      pos.setZ(i, -bulge);
    }
    sailGeo.computeVertexNormals();
    const sail = new THREE.Mesh(sailGeo, sailMat);
    sail.position.set(0, m.sailY, -0.4);
    sail.castShadow = true;
    mastGroup.add(sail);
    sails.push(sail);
  });

  // 10 Pirate Crew Soldiers standing guard on main deck, forecastle & stern deck (1 draw call!)
  const crewSpots: [number, number, number, number][] = [
    [-3.2, 5.75, -12, 0.4],
    [3.2, 5.75, -11, -0.4],
    [-3.4, 5.75, -4, 1.5],
    [3.4, 5.75, -3, -1.5],
    [-3.4, 5.75, 4, 1.5],
    [3.4, 5.75, 5, -1.5],
    [0, 5.75, -16, 0],
    [-3.2, 9.45, 11, 0.3],
    [3.2, 9.45, 11, -0.3],
    [0, 9.45, 14.5, Math.PI],
  ];
  const crewInst = new THREE.InstancedMesh(pirateSoldierGeo, pirateSoldierMat, crewSpots.length);
  const dObj = new THREE.Object3D();
  crewSpots.forEach(([px, py, pz, ry], idx) => {
    dObj.position.set(px, py, pz);
    dObj.rotation.set(0, ry, 0);
    dObj.scale.setScalar(1.05);
    dObj.updateMatrix();
    crewInst.setMatrixAt(idx, dObj.matrix);
  });
  crewInst.castShadow = true;
  ship.add(crewInst);

  return { ship, masts, sails, hullMat, sailMat, fireLight };
}

/**
 * Builds an overhanging ancient banyan-style dragon roost tree on cliff ledges
 * so peaceful dragons can hang upside-down underneath its wide horizontal boughs!
 */
function buildHangingRoostTree(
  trunkMat: THREE.Material,
  leafMat: THREE.Material,
  facingYaw: number,
): { group: THREE.Group; localPerch: THREE.Vector3; disposables: THREE.BufferGeometry[] } {
  const group = new THREE.Group();
  const disposables: THREE.BufferGeometry[] = [];

  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 12, 2),
    new THREE.Vector3(0, 24, 9),
    new THREE.Vector3(0, 29, 20),
    new THREE.Vector3(0, 28, 31),
  ]);
  const trunkGeo = new THREE.TubeGeometry(curve, 16, 2.3, 8, false);
  disposables.push(trunkGeo);
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  // Horizontal overhanging dragon-perch bough
  const branchGeo = new THREE.CylinderGeometry(1.1, 1.85, 22, 8);
  branchGeo.rotateX(Math.PI / 2);
  disposables.push(branchGeo);
  const branch = new THREE.Mesh(branchGeo, trunkMat);
  branch.position.set(0, 28.5, 20);
  branch.castShadow = true;
  group.add(branch);

  // Side branches & lush foliage canopy ABOVE the hanging perch
  const leafGeo = new THREE.DodecahedronGeometry(8.5, 1);
  disposables.push(leafGeo);
  [
    [0, 34, 17, 1.6, 0.72, 1.5],
    [-8, 33, 24, 1.2, 0.7, 1.2],
    [8, 33, 24, 1.2, 0.7, 1.2],
    [0, 32, 31, 1.35, 0.68, 1.2],
  ].forEach(([lx, ly, lz, sx, sy, sz]) => {
    const canopy = new THREE.Mesh(leafGeo, leafMat);
    canopy.position.set(lx, ly, lz);
    canopy.scale.set(sx, sy, sz);
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    group.add(canopy);
  });

  // Hanging aerial vines framing the perch
  const vineGeo = new THREE.CylinderGeometry(0.14, 0.14, 7.5, 5);
  disposables.push(vineGeo);
  [-6.5, 6.5].forEach((vx) => {
    const vine = new THREE.Mesh(vineGeo, leafMat);
    vine.position.set(vx, 25.5, 26);
    group.add(vine);
  });

  group.rotation.y = facingYaw;
  return {
    group,
    localPerch: new THREE.Vector3(0, 24.6, 21),
    disposables,
  };
}

export function buildDragonWorld(
  scene: THREE.Scene,
  maxAnisotropy: number,
): WorldBuildResult {
  const disposables: { dispose: () => void }[] = [];
  const stoneTex = createStoneTexture(maxAnisotropy);
  const woodTex = createWoodPlankTexture(maxAnisotropy);
  const sailTex = createPirateSailTexture(maxAnisotropy);
  const waterNormal = createWaterNormalMap(maxAnisotropy);
  const terrainNormal = createTerrainNormalMap(maxAnisotropy);
  const cloudTex = createVolumetricCloudTexture(maxAnisotropy);
  disposables.push(stoneTex, woodTex, sailTex, waterNormal, terrainNormal, cloudTex);

  // Shared Dynamic Sun-Projected Cloud Shadow Uniforms (synced every frame across Terrain, Ocean & Sky!)
  const cloudShadowSlots = Array.from(
    { length: MAX_CLOUD_SHADOWS },
    () => new THREE.Vector4(0, -9999, 0, 1),
  );
  const cloudShadowMeta = Array.from(
    { length: MAX_CLOUD_SHADOWS },
    () => new THREE.Vector4(0, 0, 0, 0),
  );
  const cloudShadowUniforms: CloudShadowUniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.62, 0.32, -0.72).normalize() },
    uWindOffset: { value: new THREE.Vector2(0, 0) },
    uStormFactor: { value: 0 },
    uCloudShadows: { value: cloudShadowSlots },
    uCloudShadowMeta: { value: cloudShadowMeta },
  };

  const cloudShadowShaderPars = `
uniform sampler2D uCloudTex;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec2 uWindOffset;
uniform float uStormFactor;
uniform vec4 uCloudShadows[${MAX_CLOUD_SHADOWS}];
uniform vec4 uCloudShadowMeta[${MAX_CLOUD_SHADOWS}];
varying vec3 vWorldPos;

float evalCloudShadow(vec3 worldPos) {
  vec3 sunN = normalize(uSunDir);
  float sunY = max(0.22, sunN.y);
  vec2 raySlope = sunN.xz / sunY;

  // 1. Explicit 3D sun-ray projected shadows from the nearest large cumulus/anvil/volcanic clouds
  float explicitShadow = 0.0;
  for (int i = 0; i < ${MAX_CLOUD_SHADOWS}; i++) {
    vec4 cs = uCloudShadows[i];
    if (cs.y < -500.0) continue;
    float heightAbove = max(0.0, cs.y - worldPos.y);
    if (heightAbove <= 1.0) continue;
    vec2 hitXZ = worldPos.xz + raySlope * heightAbove;
    vec2 delta = hitXZ - cs.xz;
    float r = cs.w * (1.42 + uStormFactor * 0.25);
    float d2 = dot(delta, delta);
    if (d2 >= r * r) continue;
    float distNorm = sqrt(d2) / r;

    vec4 meta = uCloudShadowMeta[i];
    vec2 puffUv = clamp(
      delta / (r * 2.0) + 0.5 + vec2(uTime * 0.012, -uTime * 0.010 + meta.x * 0.13),
      0.02,
      0.98
    );
    float texDens = texture2D(uCloudTex, puffUv).a;
    float coreSoft = 1.0 - smoothstep(0.14, 0.98, distNorm);
    float edgeWisp = smoothstep(0.14, 0.68, texDens * 0.88 + coreSoft * 0.52);
    float dens = clamp(coreSoft * (0.48 + 0.64 * edgeWisp) * meta.z, 0.0, 1.0);
    explicitShadow = max(explicitShadow, dens);
  }

  // 2. Vast continuous drifting cloud-deck shadow layer projected along sun rays across the 10.4km map
  float veilAlt = 260.0;
  float veilH = max(0.0, veilAlt - worldPos.y);
  vec2 veilXZ = worldPos.xz + raySlope * veilH;
  vec2 uvA = (veilXZ - uWindOffset) * 0.00056;
  vec2 rotXZ = vec2(
    veilXZ.x * 0.81 - veilXZ.y * 0.58,
    veilXZ.x * 0.58 + veilXZ.y * 0.81
  );
  vec2 uvB = (rotXZ - uWindOffset * 1.28) * 0.00034 + vec2(0.37, 0.71);
  float nA = texture2D(uCloudTex, uvA).r;
  float nB = texture2D(uCloudTex, uvB).g;
  float veilCoverage = nA * 0.62 + nB * 0.38;
  float veilThresh = mix(0.49, 0.24, uStormFactor);
  float veilShadow = smoothstep(veilThresh, veilThresh + 0.23, veilCoverage) * mix(0.68, 0.84, uStormFactor);

  float combined = clamp(
    max(explicitShadow * 0.94, veilShadow * 0.82) + explicitShadow * veilShadow * 0.16,
    0.0,
    0.92
  );
  return combined * mix(1.0, 0.76, uStormFactor);
}
`;

  // 1. UE5 Atmospheric Sky Dome (wide 15500m radius for vast 10400m world & ultra-high altitude soaring)
  const skyGeo = new THREE.SphereGeometry(15500, 44, 28);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      zenithColor: { value: new THREE.Color(0x071a36) },
      midColor: { value: new THREE.Color(0x215282) },
      horizonColor: { value: new THREE.Color(0xb88656) },
      sunDir: { value: new THREE.Vector3(0.62, 0.32, -0.72).normalize() },
      uStormFactor: { value: 0 },
      uLightning: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 zenithColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      uniform vec3 sunDir;
      uniform float uStormFactor;
      uniform float uLightning;
      varying vec3 vWorldDir;
      void main() {
        vec3 d = normalize(vWorldDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 clearCol = mix(horizonColor, midColor, smoothstep(0.0, 0.24, h));
        clearCol = mix(clearCol, zenithColor, smoothstep(0.24, 0.85, h));
        float sunAmt = max(dot(d, sunDir), 0.0);
        float sunVis = 1.0 - smoothstep(0.15, 0.75, uStormFactor);
        clearCol += vec3(1.0, 0.68, 0.35) * pow(sunAmt, 10.0) * 0.25 * sunVis;
        clearCol += vec3(1.0, 0.86, 0.62) * pow(sunAmt, 64.0) * 0.45 * sunVis;
        clearCol += vec3(1.0, 0.97, 0.88) * pow(sunAmt, 360.0) * 1.1 * sunVis;

        vec3 stormCol = mix(vec3(0.16, 0.21, 0.27), vec3(0.05, 0.08, 0.13), smoothstep(0.0, 0.65, h));
        vec3 col = mix(clearCol, stormCol, uStormFactor);
        col += vec3(0.62, 0.80, 1.0) * uLightning * (0.28 + 0.42 * (1.0 - h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyDome);
  disposables.push(skyGeo, skyMat);

  // 2. Vast 5600m Open-World Deformable Terrain Mesh (280x280 sharp spatial density)
  const terrainSize = TERRAIN_SIZE;
  const segments = TERRAIN_SEGS;
  const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
  const terrainBaseHeights = new Float32Array(posAttr.count);
  const terrainDeltas = new Float32Array(posAttr.count);
  activeTerrainDeltas = terrainDeltas;
  const colors = new Float32Array(posAttr.count * 3);
  const cSand = new THREE.Color(0xc5a876);
  const cGrass = new THREE.Color(0x264c2e);
  const cRock = new THREE.Color(0x48413b);
  const cDarkRock = new THREE.Color(0x26211d);
  const cLavaRock = new THREE.Color(0x3a1c14);
  const cObsidian = new THREE.Color(0x181316);
  const cEmberRim = new THREE.Color(0x7c2d12);
  const cEnchantedMoss = new THREE.Color(0x134e3a);
  const cEnchantedGlade = new THREE.Color(0x272048);
  const cEnchantedFern = new THREE.Color(0x0f766e);
  const cSnow = new THREE.Color(0xd5e3f0);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = baseTerrainHeight(x, z);
    terrainBaseHeights[i] = y;
    posAttr.setY(i, y);

    const nearVolcano = Math.hypot(x - 940, z - 90) < 260;
    const nearHiddenVolc =
      Math.hypot(x + 1520, z + 1500) < 350 ||
      Math.hypot(x + 1840, z + 1240) < 205 ||
      Math.hypot(x + 1230, z + 1780) < 195;
    const nearEnchanted =
      Math.hypot(x + 1600, z - 1220) < 370 ||
      Math.hypot(x + 1940, z - 920) < 195 ||
      Math.hypot(x + 1280, z - 1480) < 200;
    const nearFrost = Math.hypot(x - 120, z + 940) < 310;
    const nearGlacierCrown =
      Math.hypot(x + 360, z + 3350) < 620 || Math.hypot(x + 860, z + 3120) < 310;
    const nearCoralAtoll =
      Math.hypot(x - 2450, z - 2780) < 580 || Math.hypot(x - 2890, z - 2490) < 240;
    const nearEasternSpires =
      Math.hypot(x - 2950, z + 2350) < 540 || Math.hypot(x - 3360, z + 2040) < 290;
    const nearWesternStorm =
      Math.hypot(x + 3250, z - 260) < 520 || Math.hypot(x + 3640, z + 140) < 260;

    if ((nearFrost || nearGlacierCrown) && y > 3) {
      tmpColor.copy(cDarkRock).lerp(cSnow, Math.min(1, 0.35 + y / 88));
    } else if (nearHiddenVolc && y > 1) {
      const craterDist = Math.hypot(x + 1520, z + 1500);
      const atollDist = Math.hypot(x + 1230, z + 1780);
      if (craterDist < 76 || atollDist < 54) {
        tmpColor.copy(cEmberRim).lerp(cObsidian, 0.35);
      } else {
        tmpColor.copy(cObsidian).lerp(cLavaRock, Math.min(1, 0.25 + y / 130));
      }
    } else if (nearEnchanted && y > 2.2) {
      const gladeDist = Math.hypot(x + 1600, z - 1220);
      if (gladeDist < 105) {
        tmpColor.copy(cEnchantedGlade).lerp(cEnchantedFern, gladeDist / 105);
      } else {
        tmpColor.copy(cEnchantedMoss).lerp(cEnchantedFern, Math.min(1, (y - 8) / 42));
      }
    } else if (nearWesternStorm && y > 2) {
      tmpColor.copy(cObsidian).lerp(cRock, Math.min(1, y / 110));
    } else if (nearCoralAtoll) {
      if (y < 6.5) {
        tmpColor.copy(cSand);
      } else {
        tmpColor.copy(cSand).lerp(cGrass, Math.min(1, (y - 6.5) / 14));
      }
    } else if (nearEasternSpires && y > 4) {
      if (y < 42) {
        tmpColor.copy(cGrass).lerp(cRock, Math.max(0, (y - 10) / 32));
      } else if (y < 125) {
        tmpColor.copy(cRock).lerp(cDarkRock, (y - 42) / 83);
      } else {
        tmpColor.copy(cDarkRock).lerp(cSnow, Math.min(1, (y - 125) / 40));
      }
    } else if (nearVolcano && y > 8) {
      tmpColor.copy(cLavaRock).lerp(cDarkRock, Math.min(1, y / 120));
    } else if (y < 4.8) {
      tmpColor.copy(cSand);
    } else if (y < 28 && x > 220 && z > 200) {
      tmpColor.copy(cSand).lerp(cGrass, (y - 4.8) / 22);
    } else if (y < 46) {
      tmpColor.copy(cGrass).lerp(cRock, Math.max(0, (y - 18) / 28));
    } else if (y < 110) {
      tmpColor.copy(cRock).lerp(cDarkRock, (y - 46) / 64);
    } else {
      tmpColor.copy(cDarkRock).lerp(cSnow, Math.min(1, (y - 110) / 30));
    }
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  const terrainColorAttr = new THREE.BufferAttribute(colors, 3);
  terrainGeo.setAttribute('color', terrainColorAttr);
  terrainGeo.computeVertexNormals();
  const terrainNormalAttr = terrainGeo.attributes.normal as THREE.BufferAttribute;

  const _craterDark = new THREE.Color(0x28211b);
  const _craterScorch = new THREE.Color(0x140d0a);
  const _nVec = new THREE.Vector3();

  const deformTerrain = (
    wx: number,
    wz: number,
    radius: number,
    depth: number,
    scorch = 0.45,
  ) => {
    const ixMin = Math.max(1, Math.floor((wx - radius + TERRAIN_HALF) / TERRAIN_CELL));
    const ixMax = Math.min(TERRAIN_SEGS - 1, Math.ceil((wx + radius + TERRAIN_HALF) / TERRAIN_CELL));
    const izMin = Math.max(1, Math.floor((wz - radius + TERRAIN_HALF) / TERRAIN_CELL));
    const izMax = Math.min(TERRAIN_SEGS - 1, Math.ceil((wz + radius + TERRAIN_HALF) / TERRAIN_CELL));
    if (ixMin > ixMax || izMin > izMax) return;

    let changed = false;
    const invR = 1 / Math.max(4, radius);
    for (let iz = izMin; iz <= izMax; iz++) {
      for (let ix = ixMin; ix <= ixMax; ix++) {
        const idx = iz * TERRAIN_STRIDE + ix;
        const vx = posAttr.getX(idx);
        const vz = posAttr.getZ(idx);
        const dist = Math.hypot(vx - wx, vz - wz);
        if (dist >= radius) continue;

        const u = dist * invR;
        let disp: number;
        if (u < 0.74) {
          const inner = u / 0.74;
          disp = -depth * Math.pow(1 - inner * inner, 1.15);
        } else {
          const rim = (u - 0.74) / 0.26;
          disp = depth * 0.2 * Math.sin(rim * Math.PI);
        }
        const nextDelta = THREE.MathUtils.clamp(terrainDeltas[idx] + disp, -28, 6.5);
        terrainDeltas[idx] = nextDelta;
        posAttr.setY(idx, terrainBaseHeights[idx] + nextDelta);

        const darkenMix = Math.min(0.88, (1 - u) * (0.45 + scorch * 0.45));
        tmpColor.setRGB(
          terrainColorAttr.getX(idx),
          terrainColorAttr.getY(idx),
          terrainColorAttr.getZ(idx),
        );
        tmpColor.lerp(scorch > 0.55 ? _craterScorch : _craterDark, darkenMix);
        terrainColorAttr.setXYZ(idx, tmpColor.r, tmpColor.g, tmpColor.b);
        changed = true;
      }
    }

    if (!changed) return;

    // Recompute smooth vertex normals only in the affected crater patch (zero hitch)
    const nxMin = Math.max(1, ixMin - 1);
    const nxMax = Math.min(TERRAIN_SEGS - 1, ixMax + 1);
    const nzMin = Math.max(1, izMin - 1);
    const nzMax = Math.min(TERRAIN_SEGS - 1, izMax + 1);
    for (let iz = nzMin; iz <= nzMax; iz++) {
      for (let ix = nxMin; ix <= nxMax; ix++) {
        const idx = iz * TERRAIN_STRIDE + ix;
        const hL = posAttr.getY(idx - 1);
        const hR = posAttr.getY(idx + 1);
        const hD = posAttr.getY(idx - TERRAIN_STRIDE);
        const hU = posAttr.getY(idx + TERRAIN_STRIDE);
        _nVec.set(hL - hR, TERRAIN_CELL * 2, hD - hU).normalize();
        terrainNormalAttr.setXYZ(idx, _nVec.x, _nVec.y, _nVec.z);
      }
    }

    posAttr.needsUpdate = true;
    terrainNormalAttr.needsUpdate = true;
    terrainColorAttr.needsUpdate = true;
  };

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    normalMap: terrainNormal,
    normalScale: new THREE.Vector2(0.88, 0.88),
    roughness: 0.86,
    metalness: 0.04,
  });
  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uCloudTex = { value: cloudTex };
    shader.uniforms.uTime = cloudShadowUniforms.uTime;
    shader.uniforms.uSunDir = cloudShadowUniforms.uSunDir;
    shader.uniforms.uWindOffset = cloudShadowUniforms.uWindOffset;
    shader.uniforms.uStormFactor = cloudShadowUniforms.uStormFactor;
    shader.uniforms.uCloudShadows = cloudShadowUniforms.uCloudShadows;
    shader.uniforms.uCloudShadowMeta = cloudShadowUniforms.uCloudShadowMeta;

    shader.vertexShader = `varying vec3 vWorldPos;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      `,
    );

    shader.fragmentShader = cloudShadowShaderPars + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `
      #include <lights_fragment_end>
      float _terrainCloudShadow = evalCloudShadow(vWorldPos);
      float _terrainSunVis = 1.0 - _terrainCloudShadow * 0.86;
      reflectedLight.directDiffuse *= _terrainSunVis;
      reflectedLight.directSpecular *= _terrainSunVis;
      reflectedLight.indirectDiffuse *= mix(vec3(1.0), vec3(0.76, 0.83, 0.96), _terrainCloudShadow * 0.65);
      `,
    );
  };
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = true;
  scene.add(terrainMesh);
  disposables.push(terrainGeo, terrainMat);

  // Glowing Lava Pools inside Eastern Volcano & Hidden Volcanic Archipelago Calderas
  const lavaGeo = new THREE.CircleGeometry(42, 24);
  lavaGeo.rotateX(-Math.PI / 2);
  const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff5a00 });
  const lavaPool = new THREE.Mesh(lavaGeo, lavaMat);
  lavaPool.position.set(940, 74, 90);
  scene.add(lavaPool);

  const hiddenLavaPoolGeo = new THREE.CircleGeometry(52, 24);
  hiddenLavaPoolGeo.rotateX(-Math.PI / 2);
  const hiddenLavaPool = new THREE.Mesh(hiddenLavaPoolGeo, lavaMat);
  hiddenLavaPool.position.set(-1520, 78, -1500);
  scene.add(hiddenLavaPool);

  const atollLavaPoolGeo = new THREE.CircleGeometry(36, 20);
  atollLavaPoolGeo.rotateX(-Math.PI / 2);
  const atollLavaPool = new THREE.Mesh(atollLavaPoolGeo, lavaMat);
  atollLavaPool.position.set(-1230, 22, -1780);
  scene.add(atollLavaPool);

  const volcanicGlow = new THREE.PointLight(0xff5500, 32, 240, 1.4);
  volcanicGlow.position.set(-1520, 96, -1500);
  scene.add(volcanicGlow);
  disposables.push(lavaGeo, lavaMat, hiddenLavaPoolGeo, atollLavaPoolGeo);

  // 3. Real Sky-Reflecting Physical Ocean (22000m wide) + CubeCamera Reflection
  const oceanRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const oceanCubeCamera = new THREE.CubeCamera(1, 13000, oceanRenderTarget);
  oceanCubeCamera.position.set(0, 18, 0);
  scene.add(oceanCubeCamera);

  const oceanGeo = new THREE.PlaneGeometry(22000, 22000, 210, 210);
  oceanGeo.rotateX(-Math.PI / 2);

  const oceanMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x05283c,
    roughness: 0.08,
    metalness: 0.16,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    normalMap: waterNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    clearcoatNormalMap: waterNormal,
    clearcoatNormalScale: new THREE.Vector2(0.6, 0.6),
    envMap: oceanRenderTarget.texture,
    envMapIntensity: 1.15,
    ior: 1.333,
  });

  oceanMaterial.onBeforeCompile = (shader) => {
    const wakeTrailInit = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 99, 0));
    shader.uniforms.uTime = cloudShadowUniforms.uTime;
    shader.uniforms.uStormFactor = cloudShadowUniforms.uStormFactor;
    shader.uniforms.uLightning = { value: 0 };
    shader.uniforms.uSunDir = cloudShadowUniforms.uSunDir;
    shader.uniforms.uWindOffset = cloudShadowUniforms.uWindOffset;
    shader.uniforms.uCloudTex = { value: cloudTex };
    shader.uniforms.uCloudShadows = cloudShadowUniforms.uCloudShadows;
    shader.uniforms.uCloudShadowMeta = cloudShadowUniforms.uCloudShadowMeta;
    shader.uniforms.uDragonWakePos = { value: new THREE.Vector3(0, 0, 0) };
    shader.uniforms.uDragonWakeDir = { value: new THREE.Vector2(0, -1) };
    shader.uniforms.uWakeTrail = { value: wakeTrailInit };
    oceanMaterial.userData.shader = shader;

    shader.vertexShader =
      `uniform float uTime;\nuniform float uStormFactor;\nuniform vec3 uDragonWakePos;\nuniform vec2 uDragonWakeDir;\nvarying vec3 vWorldPos;\n` +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      float swellScale = 1.0 + uStormFactor * 1.45;
      float w1 = sin(position.x * 0.02 + uTime * (1.35 + uStormFactor * 0.65)) * cos(position.z * 0.02 + uTime * 1.1) * 0.9 * swellScale;
      float w2 = sin(position.x * 0.055 - uTime * (1.85 + uStormFactor * 0.9) + position.z * 0.045) * 0.38 * swellScale;
      if (uDragonWakePos.z > 0.005) {
        vec2 dW = position.xz - uDragonWakePos.xy;
        float dLen2 = dot(dW, dW);
        if (dLen2 < 18000.0) {
          float dLen = sqrt(dLen2);
          float along = dot(dW, uDragonWakeDir);
          vec2 perpDir = vec2(-uDragonWakeDir.y, uDragonWakeDir.x);
          float across = abs(dot(dW, perpDir));
          float bow = exp(-dLen2 / 560.0) * sin(dLen * 0.42 - uTime * 9.5) * 1.15;
          float behindDist = max(0.0, -along);
          float vArm = exp(-pow(across - behindDist * 0.4 - 2.8, 2.0) / 52.0) * exp(-behindDist * 0.018);
          float trough = -exp(-dLen2 / 150.0) * 0.8;
          transformed.y += (bow + vArm * 1.15 + trough) * uDragonWakePos.z;
        }
      }
      transformed.y += w1 + w2;
      vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      `,
    );

    shader.fragmentShader =
      cloudShadowShaderPars +
      `uniform float uLightning;
uniform vec3 uDragonWakePos;
uniform vec2 uDragonWakeDir;
uniform vec4 uWakeTrail[8];

float evalDragonWakeField(vec2 wp, out float foamOut) {
  float h = 0.0;
  foamOut = 0.0;

  if (uDragonWakePos.z > 0.005) {
    vec2 dW = wp - uDragonWakePos.xy;
    float d2 = dot(dW, dW);
    if (d2 < 24000.0) {
      float str = uDragonWakePos.z;
      float along = dot(dW, uDragonWakeDir);
      vec2 perp = vec2(-uDragonWakeDir.y, uDragonWakeDir.x);
      float acrossSigned = dot(dW, perp);
      float across = abs(acrossSigned);
      float behind = max(0.0, -along);

      // Dynamic Kelvin V-wake crests & bow pressure wave
      float d = sqrt(d2);
      float bowWave = exp(-d2 / 420.0) * sin(d * 0.72 - uTime * 10.5);
      float armOffset = across - behind * 0.36 - 2.4;
      float vCrest = exp(-(armOffset * armOffset) / (10.0 + behind * 0.16)) * exp(-behind * 0.014);
      float vRipple = sin(armOffset * 1.15 - uTime * 8.0) * vCrest;
      float centerChurn = exp(-(across * across) / 20.0) * exp(-behind * 0.022) * step(along, 6.0);

      h += (bowWave * 0.9 + vRipple * 1.15) * str;
      foamOut += (vCrest * 0.85 + centerChurn * 0.75 + max(0.0, bowWave) * 0.4) * str;
    }
  }

  for (int i = 0; i < 8; i++) {
    vec4 node = uWakeTrail[i];
    if (node.w <= 0.01 || node.z > 4.2) continue;
    vec2 dv = wp - node.xy;
    float d2 = dot(dv, dv);
    if (d2 > 4200.0) continue;
    float r = sqrt(d2) + 0.001;
    float age = node.z;
    float lifeFade = 1.0 - smoothstep(0.4, 4.2, age);
    float ringR = 2.8 + age * 11.5;
    float band = exp(-pow(r - ringR, 2.0) / (14.0 + age * 8.0));
    float ang = atan(dv.y, dv.x);
    float spiral = sin(r * 0.92 - age * 8.5 + ang * 2.0 * (mod(float(i), 2.0) * 2.0 - 1.0));
    float eddy = band * (0.55 + 0.45 * spiral) * lifeFade * node.w;
    h += eddy * 0.95;
    foamOut += band * lifeFade * node.w * 0.52;
  }

  foamOut = clamp(foamOut, 0.0, 1.0);
  return h;
}
` +
      shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `
      #ifdef USE_NORMALMAP_OBJECTSPACE
        normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
        #ifdef FLIP_SIDED
          normal = - normal;
        #endif
        #ifdef DOUBLE_SIDED
          normal = normal * faceDirection;
        #endif
        normal = normalize( normalMatrix * normal );
      #elif defined( USE_NORMALMAP_TANGENTSPACE )
        float speedMul = 1.0 + uStormFactor * 0.85;
        vec2 uvA = vNormalMapUv + vec2(uTime * 0.022 * speedMul, uTime * 0.015 * speedMul);
        vec2 uvB = vNormalMapUv * 1.45 - vec2(uTime * 0.018 * speedMul, -uTime * 0.026 * speedMul);
        vec3 nA = texture2D( normalMap, uvA ).xyz * 2.0 - 1.0;
        vec3 nB = texture2D( normalMap, uvB ).xyz * 2.0 - 1.0;
        vec3 mapN = normalize(vec3((nA.xy + nB.xy) * (0.65 + uStormFactor * 0.35) * normalScale, 1.0));
        normal = normalize( tbn * mapN );
      #endif
      float _wakeDummyFoam = 0.0;
      float _wakeEps = 0.85;
      float _wC = evalDragonWakeField(vWorldPos.xz, _wakeDummyFoam);
      if (abs(_wC) > 0.002 || _wakeDummyFoam > 0.01) {
        float _wX = evalDragonWakeField(vWorldPos.xz + vec2(_wakeEps, 0.0), _wakeDummyFoam);
        float _wZ = evalDragonWakeField(vWorldPos.xz + vec2(0.0, _wakeEps), _wakeDummyFoam);
        vec3 wakeSlopeW = vec3((_wC - _wX) * 0.55, 0.0, (_wC - _wZ) * 0.55);
        vec3 wakeTiltV = (viewMatrix * vec4(wakeSlopeW, 0.0)).xyz;
        normal = normalize(normal + wakeTiltV);
      }
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      float _oceanCloudShadow = evalCloudShadow(vWorldPos);
      vec3 viewDirW = normalize(cameraPosition - vWorldPos);
      float fresnel = pow(1.0 - clamp(dot(viewDirW, vec3(0.0, 1.0, 0.0)), 0.0, 1.0), 3.2);
      float crest = sin(vWorldPos.x * 0.04 + uTime * 1.6) * cos(vWorldPos.z * 0.04 - uTime * 1.2);
      vec3 clearRefl = mix(vec3(0.14, 0.36, 0.56), vec3(0.78, 0.62, 0.44), fresnel * 0.65);
      vec3 stormRefl = mix(vec3(0.06, 0.11, 0.17), vec3(0.16, 0.23, 0.31), fresnel * 0.7);
      vec3 skyReflCol = mix(clearRefl, stormRefl, uStormFactor);
      skyReflCol += vec3(0.65, 0.85, 1.0) * uLightning * (0.35 + fresnel * 0.95);
      diffuseColor.rgb = mix(diffuseColor.rgb, skyReflCol, fresnel * 0.62);
      float foamThreshold = mix(0.45, 0.20, uStormFactor);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.46, 0.60, 0.68), smoothstep(foamThreshold, 0.96, crest) * (0.20 + uStormFactor * 0.34));
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.36, 0.50, 0.68), _oceanCloudShadow * 0.72);
      float wakeFoam = 0.0;
      evalDragonWakeField(vWorldPos.xz, wakeFoam);
      if (wakeFoam > 0.01) {
        vec3 wakeFoamCol = mix(vec3(0.32, 0.68, 0.78), vec3(0.84, 0.94, 0.99), smoothstep(0.22, 0.85, wakeFoam));
        diffuseColor.rgb = mix(diffuseColor.rgb, wakeFoamCol, wakeFoam * 0.78);
      }
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `
      #include <lights_fragment_end>
      float _oceanSunVis = 1.0 - _oceanCloudShadow * 0.88;
      reflectedLight.directDiffuse *= _oceanSunVis;
      reflectedLight.directSpecular *= mix(1.0, 0.10, _oceanCloudShadow);
      reflectedLight.indirectSpecular *= mix(vec3(1.0), vec3(0.62, 0.72, 0.86), _oceanCloudShadow * 0.52);
      #ifdef USE_CLEARCOAT
        clearcoatSpecularDirect *= mix(1.0, 0.14, _oceanCloudShadow);
      #endif
      `,
    );
  };

  const oceanMesh = new THREE.Mesh(oceanGeo, oceanMaterial);
  oceanMesh.receiveShadow = true;
  scene.add(oceanMesh);
  disposables.push(oceanGeo, oceanMaterial, oceanRenderTarget);

  // 4. Giant Stone Archways & Narrow Vertical Twin-Monolith Needle Gates (for 90° knife-edge flight!)
  const destructibleBuildings: DestructibleBuilding[] = [];
  const narrowPillars: NarrowRockPillar[] = [];
  const archMat = new THREE.MeshStandardMaterial({
    color: 0x453e38,
    map: stoneTex,
    normalMap: terrainNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.9,
  });
  disposables.push(archMat);
  [-650, -560, -460].forEach((az, idx) => {
    const cx = -480 + Math.sin((az + 560) * 0.014) * 38;
    const archGeo = new THREE.TorusGeometry(42 + idx * 5, 6.5, 10, 24, Math.PI);
    const arch = new THREE.Mesh(archGeo, archMat);
    arch.position.set(cx, 46 + idx * 9, az);
    arch.rotation.y = (idx - 1) * 0.14;
    arch.castShadow = true;
    arch.receiveShadow = true;
    scene.add(arch);
    disposables.push(archGeo);
    destructibleBuildings.push({
      id: `chasm_arch_${idx}`,
      nameAr: 'القوس الصخري العملاق',
      mesh: arch,
      pos: new THREE.Vector3(cx, 56 + idx * 9, az),
      radius: 30,
      height: 46,
      hp: 85,
      maxHp: 85,
      destroyed: false,
      colorHex: 0x453e38,
      breakableParts: [],
      brokenCount: 0,
      baseMeshPos: arch.position.clone(),
      baseMeshRot: arch.rotation.clone(),
      scorchAmount: 0,
    });
  });

  // 3 Thrilling Twin-Monolith Narrow Corridors (17.5m inner gap: clips flat 25m wings, clears 90° knife-edge!)
  const needleGeo = new THREE.CylinderGeometry(5.4, 8.2, 82, 8);
  const beaconTrimMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.4,
    roughness: 0.35,
  });
  const runeRingGeo = new THREE.TorusGeometry(6.4, 0.5, 6, 16);
  disposables.push(needleGeo, beaconTrimMat, runeRingGeo);

  const needleGates: { cx: number; cz: number; yaw: number; baseY: number }[] = [
    { cx: -480, cz: -492, yaw: 0.12, baseY: 34 },
    { cx: -484, cz: -618, yaw: -0.14, baseY: 36 },
    { cx: 650, cz: -305, yaw: 0.65, baseY: 2 },
    // Hidden Volcanic Archipelago twin basalt needle straits
    { cx: -1680, cz: -1370, yaw: 0.72, baseY: 4 },
    { cx: -1380, cz: -1630, yaw: -0.55, baseY: 6 },
    // Enchanted Ancient Forest crystal-monolith fly-through gate
    { cx: -1455, cz: 1345, yaw: 0.42, baseY: 22 },
    // Far Eastern Sky Spires twin canyon gate
    { cx: 2950, cz: -2350, yaw: 0.58, baseY: 36 },
    // Far Western Storm Isles basalt strait
    { cx: -3250, cz: 260, yaw: -0.45, baseY: 14 },
  ];
  for (const ng of needleGates) {
    const cosY = Math.cos(ng.yaw);
    const sinY = Math.sin(ng.yaw);
    for (const side of [-1, 1]) {
      // Offset 16.0m from center; pillar radius 7.2 -> clean 17.6m inner slit!
      const px = ng.cx + side * cosY * 16.0;
      const pz = ng.cz - side * sinY * 16.0;
      const gY = Math.max(ng.baseY, getTerrainHeight(px, pz) - 4);
      const pillar = new THREE.Mesh(needleGeo, archMat);
      pillar.position.set(px, gY + 40, pz);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      scene.add(pillar);

      const band = new THREE.Mesh(runeRingGeo, beaconTrimMat);
      band.rotation.x = Math.PI / 2;
      band.position.set(px, gY + 48, pz);
      scene.add(band);

      narrowPillars.push({
        x: px,
        y: gY + 40,
        z: pz,
        radius: 7.2,
        height: 82,
      });
    }
  }

  // 5. Fortified Kingdoms (West Cliff Castle + East Coral Palace) + Garrisoned Armored Soldiers!
  const allBanners: THREE.Mesh[] = [];
  const soldierMapByBuilding = new Map<string, number[]>();

  const castleSoldierGeo = createWarriorGeometry('castle');
  const palaceSoldierGeo = createWarriorGeometry('palace');
  const pirateSoldierGeo = createWarriorGeometry('pirate');
  const warriorMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.45,
    metalness: 0.55,
  });
  disposables.push(castleSoldierGeo, palaceSoldierGeo, pirateSoldierGeo, warriorMat);

  const castle = buildCompositeCastle(stoneTex, terrainNormal);
  castle.group.position.set(-880, getTerrainHeight(-880, -60) - 2, -60);
  castle.group.rotation.y = 0.55;
  scene.add(castle.group);
  castle.group.updateMatrixWorld(true);
  allBanners.push(...castle.banners);
  for (const part of castle.parts) {
    destructibleBuildings.push({
      id: part.id,
      nameAr: part.nameAr,
      mesh: part.obj,
      pos: part.localCenter.clone().applyMatrix4(castle.group.matrixWorld),
      radius: part.radius,
      height: part.height,
      hp: part.hp,
      maxHp: part.hp,
      destroyed: false,
      colorHex: part.colorHex,
      breakableParts: part.breakableParts,
      brokenCount: 0,
      baseMeshPos: part.obj.position.clone(),
      baseMeshRot: part.obj.rotation.clone(),
      scorchAmount: 0,
    });
  }

  const palace = buildAncientPalace(stoneTex, terrainNormal);
  palace.group.position.set(820, getTerrainHeight(820, -480) - 1, -480);
  palace.group.rotation.y = -0.7;
  scene.add(palace.group);
  palace.group.updateMatrixWorld(true);
  allBanners.push(...palace.banners);
  for (const part of palace.parts) {
    destructibleBuildings.push({
      id: part.id,
      nameAr: part.nameAr,
      mesh: part.obj,
      pos: part.localCenter.clone().applyMatrix4(palace.group.matrixWorld),
      radius: part.radius,
      height: part.height,
      hp: part.hp,
      maxHp: part.hp,
      destroyed: false,
      colorHex: part.colorHex,
      breakableParts: part.breakableParts,
      brokenCount: 0,
      baseMeshPos: part.obj.position.clone(),
      baseMeshRot: part.obj.rotation.clone(),
      scorchAmount: 0,
    });
  }

  // Batch Castle & Palace soldiers into 2 single InstancedMeshes (1 draw call per kingdom!)
  const createKingdomGarrison = (
    geo: THREE.BufferGeometry,
    groupMatrix: THREE.Matrix4,
    groupYaw: number,
    placements: { buildingId: string; localPos: THREE.Vector3; yaw: number }[],
  ): THREE.InstancedMesh | null => {
    if (placements.length === 0) return null;
    const inst = new THREE.InstancedMesh(geo, warriorMat, placements.length);
    const dummy = new THREE.Object3D();
    placements.forEach((p, idx) => {
      dummy.position.copy(p.localPos).applyMatrix4(groupMatrix);
      dummy.rotation.set(0, p.yaw + groupYaw, 0);
      dummy.scale.setScalar(1.35);
      dummy.updateMatrix();
      inst.setMatrixAt(idx, dummy.matrix);
      const list = soldierMapByBuilding.get(p.buildingId) ?? [];
      list.push(idx);
      soldierMapByBuilding.set(p.buildingId, list);
    });
    inst.castShadow = true;
    inst.computeBoundingSphere();
    scene.add(inst);
    return inst;
  };

  const castleSoldiersInst = createKingdomGarrison(
    castleSoldierGeo,
    castle.group.matrixWorld,
    castle.group.rotation.y,
    castle.soldierPlacements,
  );
  const palaceSoldiersInst = createKingdomGarrison(
    palaceSoldierGeo,
    palace.group.matrixWorld,
    palace.group.rotation.y,
    palace.soldierPlacements,
  );

  // Track which InstancedMesh owns each building prefix so destroyed walls hide their soldiers cleanly
  const hideSoldiersForBuilding = (buildingId: string) => {
    const indices = soldierMapByBuilding.get(buildingId);
    if (!indices || indices.length === 0) return;
    const targetInst = buildingId.startsWith('castle') ? castleSoldiersInst : palaceSoldiersInst;
    if (!targetInst) return;
    for (const idx of indices) {
      targetInst.setMatrixAt(idx, _zeroMat);
    }
    targetInst.instanceMatrix.needsUpdate = true;
  };

  // Seamless walkable surface solver (terrain + Castle Deck/Ramp + Coral Palace Terrace/Stairs + Sanctuary Dais)
  const castleOriginX = -880;
  const castleOriginZ = -60;
  const castleBaseY = castle.group.position.y;
  const castleCos = Math.cos(-0.55);
  const castleSin = Math.sin(-0.55);

  const palaceOriginX = 820;
  const palaceOriginZ = -480;
  const palaceBaseY = palace.group.position.y;
  const palaceCos = Math.cos(0.7);
  const palaceSin = Math.sin(0.7);

  const getWalkableGroundHeight = (x: number, z: number): number => {
    let h = getTerrainHeight(x, z);

    // 1. Sanctuary Dais (-640, 580)
    if (Math.hypot(x + 640, z - 580) < 27) {
      h = Math.max(h, getTerrainHeight(-640, 580) + 2.8);
    }

    // 2. Castle Courtyard Deck + Stone Ramp
    const cdx = x - castleOriginX;
    const cdz = z - castleOriginZ;
    if (cdx * cdx + cdz * cdz < 75 * 75) {
      const lx = cdx * castleCos - cdz * castleSin;
      const lz = cdx * castleSin + cdz * castleCos;
      if (Math.abs(lx) <= 42 && Math.abs(lz) <= 42) {
        h = Math.max(h, castleBaseY + 14.0);
      } else if (Math.abs(lx) <= 10.5 && lz > 42 && lz <= 70) {
        const rampT = 1 - (lz - 42) / 28;
        h = Math.max(h, castleBaseY + 0.5 + rampT * 13.5);
      }
    }

    // 3. Royal Coral Palace Terrace + Grand Marble Staircase
    const pdx = x - palaceOriginX;
    const pdz = z - palaceOriginZ;
    if (pdx * pdx + pdz * pdz < 75 * 75) {
      const lx = pdx * palaceCos - pdz * palaceSin;
      const lz = pdx * palaceSin + pdz * palaceCos;
      if (Math.abs(lx) <= 44 && Math.abs(lz) <= 35) {
        h = Math.max(h, palaceBaseY + 10.0);
      } else if (Math.abs(lx) <= 11.5 && lz > 35 && lz <= 58) {
        const stairT = 1 - (lz - 35) / 23;
        h = Math.max(h, palaceBaseY + 0.4 + stairT * 9.6);
      }
    }

    return h;
  };

  // Animated Villagers, Palace Nobles & Coastal Townsfolk patrolling courtyards, plazas & beaches!
  interface CitizenWalker {
    inst: THREE.InstancedMesh;
    index: number;
    anchorX: number;
    anchorZ: number;
    patrolRadiusX: number;
    patrolRadiusZ: number;
    speed: number;
    phase: number;
  }
  const citizenMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.08,
  });
  const palaceCitizenGeo = createCitizenGeometry('palace');
  const castleCitizenGeo = createCitizenGeometry('castle');
  const beachCitizenGeo = createCitizenGeometry('beach');
  disposables.push(citizenMat, palaceCitizenGeo, castleCitizenGeo, beachCitizenGeo);

  const citizenWalkers: CitizenWalker[] = [];
  const spawnCitizenGroup = (
    geo: THREE.BufferGeometry,
    spots: { ax: number; az: number; rx: number; rz: number; speed: number; phase: number }[],
  ) => {
    const inst = new THREE.InstancedMesh(geo, citizenMat, spots.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    scene.add(inst);
    spots.forEach((s, idx) => {
      citizenWalkers.push({
        inst,
        index: idx,
        anchorX: s.ax,
        anchorZ: s.az,
        patrolRadiusX: s.rx,
        patrolRadiusZ: s.rz,
        speed: s.speed,
        phase: s.phase,
      });
    });
  };

  // 22 Royal Palace Citizens & Plaza Visitors
  const palaceSpots: { ax: number; az: number; rx: number; rz: number; speed: number; phase: number }[] = [];
  for (let i = 0; i < 22; i++) {
    const isOuterPlaza = i >= 12;
    const lx = isOuterPlaza ? ((i % 5) - 2) * 14 : ((i % 4) - 1.5) * 13;
    const lz = isOuterPlaza ? 46 + ((i * 7) % 18) : 16 + ((i * 5) % 14);
    const cosP = Math.cos(-0.7);
    const sinP = Math.sin(-0.7);
    const wx = palaceOriginX + lx * cosP + lz * sinP;
    const wz = palaceOriginZ - lx * sinP + lz * cosP;
    palaceSpots.push({
      ax: wx,
      az: wz,
      rx: 4.5 + (i % 3) * 2.2,
      rz: 3.5 + ((i + 1) % 3) * 2.0,
      speed: 0.42 + (i % 4) * 0.11,
      phase: i * 1.37,
    });
  }
  spawnCitizenGroup(palaceCitizenGeo, palaceSpots);

  // 16 Castle Townsfolk & Squires
  const castleSpots: { ax: number; az: number; rx: number; rz: number; speed: number; phase: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const isOuter = i >= 9;
    const lx = isOuter ? ((i % 4) - 1.5) * 14 : ((i % 3) - 1) * 14;
    const lz = isOuter ? 58 + (i % 3) * 8 : 16 + (i % 3) * 8;
    const cosC = Math.cos(0.55);
    const sinC = Math.sin(0.55);
    const wx = castleOriginX + lx * cosC + lz * sinC;
    const wz = castleOriginZ - lx * sinC + lz * cosC;
    castleSpots.push({
      ax: wx,
      az: wz,
      rx: 4.0 + (i % 3) * 1.8,
      rz: 4.0 + ((i + 2) % 3) * 1.8,
      speed: 0.38 + (i % 5) * 0.1,
      phase: i * 1.71,
    });
  }
  spawnCitizenGroup(castleCitizenGeo, castleSpots);

  // 14 Golden Beach Villagers
  const beachSpots: { ax: number; az: number; rx: number; rz: number; speed: number; phase: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2;
    const dist = 42 + (i % 4) * 16;
    const wx = 720 + Math.cos(ang) * dist;
    const wz = 560 + Math.sin(ang) * dist;
    beachSpots.push({
      ax: wx,
      az: wz,
      rx: 5.5 + (i % 3) * 2.4,
      rz: 5.5 + ((i + 1) % 3) * 2.2,
      speed: 0.36 + (i % 4) * 0.09,
      phase: i * 2.05,
    });
  }
  spawnCitizenGroup(beachCitizenGeo, beachSpots);

  const _citDummy = new THREE.Object3D();
  const updateCitizens = (elapsed: number) => {
    for (let i = 0; i < citizenWalkers.length; i++) {
      const c = citizenWalkers[i];
      const t = elapsed * c.speed + c.phase;
      const cx = c.anchorX + Math.sin(t) * c.patrolRadiusX;
      const cz = c.anchorZ + Math.cos(t * 0.85) * c.patrolRadiusZ;
      const dx = Math.cos(t) * c.patrolRadiusX * c.speed;
      const dz = -Math.sin(t * 0.85) * c.patrolRadiusZ * c.speed * 0.85;
      const gy = getWalkableGroundHeight(cx, cz);
      const bob = Math.abs(Math.sin(elapsed * 6.5 + c.phase)) * 0.12;
      _citDummy.position.set(cx, gy + bob, cz);
      _citDummy.rotation.set(0, Math.atan2(dx, dz), 0);
      _citDummy.scale.setScalar(1.22);
      _citDummy.updateMatrix();
      c.inst.setMatrixAt(c.index, _citDummy.matrix);
    }
    const updatedInsts = new Set<THREE.InstancedMesh>();
    for (const c of citizenWalkers) {
      if (!updatedInsts.has(c.inst)) {
        updatedInsts.add(c.inst);
        c.inst.instanceMatrix.needsUpdate = true;
      }
    }
  };
  updateCitizens(0);

  // 6. Sanctuary INSIDE THE ROCKS (-640, 580): Jagged Mountain Cavern Shelter + Altar
  const sanctuaryY = getTerrainHeight(-640, 580);
  const sanctuaryGroup = new THREE.Group();
  sanctuaryGroup.position.set(-640, sanctuaryY, 580);
  scene.add(sanctuaryGroup);

  const rockShelterMat = new THREE.MeshStandardMaterial({
    color: 0x3b3530,
    map: stoneTex,
    normalMap: terrainNormal,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughness: 0.92,
    metalness: 0.06,
  });
  const crystalVeinMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xd97706,
    emissiveIntensity: 1.85,
    roughness: 0.25,
    metalness: 0.4,
  });
  disposables.push(rockShelterMat, crystalVeinMat);

  const daisGeo = new THREE.CylinderGeometry(26, 30, 3.2, 24);
  const daisMat = new THREE.MeshStandardMaterial({
    color: 0x625b52,
    map: stoneTex,
    roughness: 0.74,
  });
  const dais = new THREE.Mesh(daisGeo, daisMat);
  dais.position.y = 1.2;
  dais.receiveShadow = true;
  dais.castShadow = true;
  sanctuaryGroup.add(dais);
  disposables.push(daisGeo, daisMat);

  // Carved Vaulted Rock Cavern Walls & Overarching Stone Ribs around the sanctuary (mouth open toward +X/+Z sea)
  const cragGeo = new THREE.DodecahedronGeometry(12, 1);
  disposables.push(cragGeo);
  for (let i = 0; i < 9; i++) {
    // Arc from +75 deg around the back (-X, -Z) to +285 deg (leaving front-east flight opening wide!)
    const ang = THREE.MathUtils.lerp(Math.PI * 0.42, Math.PI * 1.62, i / 8);
    const dist = 36 + (i % 2) * 4;
    const pillar = new THREE.Mesh(cragGeo, rockShelterMat);
    pillar.position.set(Math.cos(ang) * dist, 15 + (i % 3) * 4, Math.sin(ang) * dist);
    pillar.scale.set(1.15, 2.2 + (i % 2) * 0.4, 1.15);
    pillar.rotation.set(i * 0.3, ang, i * 0.2);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    sanctuaryGroup.add(pillar);
  }

  // Vaulted Cavern Ceiling Archways overhead (high clearance 42m so camera never clips inside!)
  const vaultGeo = new THREE.TorusGeometry(39, 7.2, 8, 22, Math.PI);
  disposables.push(vaultGeo);
  [-10, 6, 22].forEach((vz, idx) => {
    const vault = new THREE.Mesh(vaultGeo, rockShelterMat);
    vault.position.set(-10 + idx * 6, 4, vz - 12);
    vault.rotation.y = 0.78 + (idx - 1) * 0.16;
    vault.scale.set(1.0, 1.15, 1.2);
    vault.castShadow = true;
    vault.receiveShadow = true;
    sanctuaryGroup.add(vault);
  });

  // Glowing Amber Crystal Veins inside the rock walls
  const crystalGeo = new THREE.OctahedronGeometry(2.4, 0);
  disposables.push(crystalGeo);
  for (let c = 0; c < 6; c++) {
    const ang = THREE.MathUtils.lerp(Math.PI * 0.55, Math.PI * 1.48, c / 5);
    const cry = new THREE.Mesh(crystalGeo, crystalVeinMat);
    cry.position.set(Math.cos(ang) * 28, 7 + (c % 2) * 5, Math.sin(ang) * 28);
    cry.scale.set(0.7, 1.9, 0.7);
    cry.rotation.z = (c - 2.5) * 0.25;
    sanctuaryGroup.add(cry);
  }

  const hearthCoreGeo = new THREE.OctahedronGeometry(3.4, 1);
  const hearthCoreMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 2.4,
    roughness: 0.2,
    metalness: 0.5,
  });
  const hearthCore = new THREE.Mesh(hearthCoreGeo, hearthCoreMat);
  hearthCore.position.set(-12, 6.2, -10);
  sanctuaryGroup.add(hearthCore);
  disposables.push(hearthCoreGeo, hearthCoreMat);

  const hearthLight = new THREE.PointLight(0xffaa33, 24, 95, 1.4);
  hearthLight.position.set(-6, 12, -6);
  sanctuaryGroup.add(hearthLight);

  const monolithGeo = new THREE.BoxGeometry(3.0, 14, 2.4);
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const mono = new THREE.Mesh(monolithGeo, daisMat);
    mono.position.set(Math.cos(angle) * 23, 7, Math.sin(angle) * 23);
    mono.lookAt(0, 7, 0);
    mono.castShadow = true;
    mono.receiveShadow = true;
    sanctuaryGroup.add(mono);
  }
  disposables.push(monolithGeo);

  const beaconGeo = new THREE.CylinderGeometry(2.6, 4.5, 220, 16, 1, true);
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const sanctuaryBeacon = new THREE.Mesh(beaconGeo, beaconMat);
  sanctuaryBeacon.position.set(22, 110, 0);
  sanctuaryGroup.add(sanctuaryBeacon);
  disposables.push(beaconGeo, beaconMat);

  const ringGeo = new THREE.TorusGeometry(22, 0.85, 10, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.65,
  });
  const sanctuaryRing = new THREE.Mesh(ringGeo, ringMat);
  sanctuaryRing.rotation.x = Math.PI / 2;
  sanctuaryRing.position.set(28, 16, -12);
  sanctuaryGroup.add(sanctuaryRing);
  disposables.push(ringGeo, ringMat);

  // 7. Giant Overhanging Dragon-Roost Trees (for upside-down resting dragons in non-war mode!)
  const roostTrunkMat = new THREE.MeshStandardMaterial({
    color: 0x453020,
    normalMap: terrainNormal,
    roughness: 0.92,
  });
  const roostLeafMat = new THREE.MeshStandardMaterial({
    color: 0x1e4d26,
    roughness: 0.82,
  });
  disposables.push(roostTrunkMat, roostLeafMat);

  const hangingRoostSpots: HangingRoostSpot[] = [];
  const roostTreeSpecs: { x: number; z: number; yaw: number }[] = [
    { x: -510, z: 375, yaw: 0.8 },
    { x: -555, z: 425, yaw: 1.4 },
    { x: -465, z: 345, yaw: -0.4 },
    { x: -565, z: 505, yaw: 0.6 },
    { x: 640, z: 495, yaw: -1.2 },
    { x: -410, z: -435, yaw: 0.3 },
    { x: -1650, z: 1120, yaw: 0.9 },
    { x: -1525, z: 1290, yaw: -1.1 },
    { x: -1910, z: 915, yaw: 0.4 },
    { x: 2930, z: -2290, yaw: 0.8 },
    { x: 3340, z: -2010, yaw: -0.7 },
    { x: -3210, z: 240, yaw: 1.2 },
  ];
  roostTreeSpecs.forEach((spec) => {
    const ry = getTerrainHeight(spec.x, spec.z);
    if (ry < 5) return;
    const built = buildHangingRoostTree(roostTrunkMat, roostLeafMat, spec.yaw);
    built.group.position.set(spec.x, ry - 1, spec.z);
    scene.add(built.group);
    built.group.updateMatrixWorld(true);
    disposables.push(...built.disposables);
    const worldPerch = built.localPerch.clone().applyMatrix4(built.group.matrixWorld);
    hangingRoostSpots.push({ pos: worldPerch, yaw: spec.yaw });
  });

  // 8. Palm Trees along Golden Beach (720, 560), Southern Coral Atoll (2450, 2780) & Ancient Glowing Trees
  const palmPositions: { x: number; y: number; z: number; scale: number; rot: number }[] = [];
  for (let i = 0; i < 64; i++) {
    const angle = (i / 64) * Math.PI * 2;
    const dist = 58 + ((i * 43) % 165);
    const px = 720 + Math.cos(angle) * dist;
    const pz = 560 + Math.sin(angle) * dist;
    const py = getTerrainHeight(px, pz);
    if (py > 2.2 && py < 26) {
      palmPositions.push({
        x: px,
        y: py,
        z: pz,
        scale: 0.9 + ((i * 13) % 35) / 100,
        rot: i * 1.7,
      });
    }
  }
  for (let i = 0; i < 56; i++) {
    const angle = (i / 56) * Math.PI * 2;
    const dist = 235 + ((i * 53) % 245);
    const px = 2450 + Math.cos(angle) * dist;
    const pz = 2780 + Math.sin(angle) * dist;
    const py = getTerrainHeight(px, pz);
    if (py > 2.4 && py < 28) {
      palmPositions.push({
        x: px,
        y: py,
        z: pz,
        scale: 1.0 + ((i * 17) % 38) / 100,
        rot: i * 1.9,
      });
    }
  }
  const destructibleTrees: DestructibleTree[] = [];
  let palmTrunkInst: THREE.InstancedMesh | null = null;
  let palmCrownInst: THREE.InstancedMesh | null = null;

  if (palmPositions.length > 0) {
    const trunkGeo = new THREE.CylinderGeometry(0.45, 0.85, 13, 7);
    trunkGeo.translate(0, 6.5, 0);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x543c27,
      normalMap: terrainNormal,
      roughness: 0.92,
    });
    palmTrunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, palmPositions.length);

    const crownGeo = new THREE.ConeGeometry(5.5, 3.8, 7);
    crownGeo.translate(0, 13.5, 0);
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x225429, roughness: 0.78 });
    palmCrownInst = new THREE.InstancedMesh(crownGeo, crownMat, palmPositions.length);

    const dummy = new THREE.Object3D();
    palmPositions.forEach((p, idx) => {
      dummy.position.set(p.x, p.y - 0.3, p.z);
      dummy.rotation.set(0.08, p.rot, 0.06);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      palmTrunkInst!.setMatrixAt(idx, dummy.matrix);
      palmCrownInst!.setMatrixAt(idx, dummy.matrix);
      destructibleTrees.push({
        index: idx,
        kind: 'palm',
        pos: new THREE.Vector3(p.x, p.y, p.z),
        radius: 4.5 * p.scale,
        height: 15.5 * p.scale,
        destroyed: false,
      });
    });
    palmTrunkInst.computeBoundingSphere();
    palmCrownInst.computeBoundingSphere();
    palmTrunkInst.castShadow = true;
    palmTrunkInst.receiveShadow = true;
    palmCrownInst.castShadow = true;
    scene.add(palmTrunkInst, palmCrownInst);
    disposables.push(trunkGeo, trunkMat, crownGeo, crownMat);
  }

  // 8b. Enchanted Ancient Forest Bioluminescent Trees, Crystal Shrines & Glowing Mushroom Groves (-1600, 1220)
  const enchantedCenters = [
    { cx: -1600, cz: 1220, minR: 72, maxR: 310, count: 68 },
    { cx: -1940, cz: 920, minR: 25, maxR: 155, count: 24 },
    { cx: -1280, cz: 1480, minR: 25, maxR: 165, count: 24 },
  ];
  const enchTreePositions: { x: number; y: number; z: number; scale: number; rot: number }[] = [];
  for (const ec of enchantedCenters) {
    for (let i = 0; i < ec.count; i++) {
      const angle = i * 2.39996 + ec.cx * 0.01;
      const dist = ec.minR + (((i * 67) % 100) / 100) * (ec.maxR - ec.minR);
      const px = ec.cx + Math.cos(angle) * dist;
      const pz = ec.cz + Math.sin(angle) * dist;
      const py = getTerrainHeight(px, pz);
      if (py > 4.0 && py < 68) {
        enchTreePositions.push({
          x: px,
          y: py,
          z: pz,
          scale: 1.05 + ((i * 19) % 45) / 100,
          rot: i * 1.4,
        });
      }
    }
  }

  let enchTrunkInst: THREE.InstancedMesh | null = null;
  let enchCrownInst: THREE.InstancedMesh | null = null;
  if (enchTreePositions.length > 0) {
    const eTrunkGeo = new THREE.CylinderGeometry(0.85, 1.55, 19, 8);
    eTrunkGeo.translate(0, 9.5, 0);
    const eTrunkMat = new THREE.MeshStandardMaterial({
      color: 0x3b2c42,
      normalMap: terrainNormal,
      roughness: 0.88,
    });
    enchTrunkInst = new THREE.InstancedMesh(eTrunkGeo, eTrunkMat, enchTreePositions.length);

    // Double-layered bioluminescent ancient canopy
    const lowerCanopy = new THREE.DodecahedronGeometry(6.8, 1);
    lowerCanopy.scale(1.15, 0.65, 1.15);
    lowerCanopy.translate(0, 19.5, 0);
    const upperCanopy = new THREE.DodecahedronGeometry(4.8, 1);
    upperCanopy.scale(1.0, 0.72, 1.0);
    upperCanopy.translate(0, 24.5, 0);
    const eCrownGeo = mergeGeometries([lowerCanopy, upperCanopy], false)!;
    lowerCanopy.dispose();
    upperCanopy.dispose();

    const eCrownMat = new THREE.MeshStandardMaterial({
      color: 0x0f766e,
      emissive: 0x14b8a6,
      emissiveIntensity: 0.34,
      roughness: 0.68,
    });
    enchCrownInst = new THREE.InstancedMesh(eCrownGeo, eCrownMat, enchTreePositions.length);

    const dummy = new THREE.Object3D();
    enchTreePositions.forEach((p, idx) => {
      dummy.position.set(p.x, p.y - 0.5, p.z);
      dummy.rotation.set(0.04, p.rot, -0.04);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      enchTrunkInst!.setMatrixAt(idx, dummy.matrix);
      enchCrownInst!.setMatrixAt(idx, dummy.matrix);
      destructibleTrees.push({
        index: idx,
        kind: 'enchanted',
        pos: new THREE.Vector3(p.x, p.y, p.z),
        radius: 6.2 * p.scale,
        height: 25.0 * p.scale,
        destroyed: false,
      });
    });
    enchTrunkInst.computeBoundingSphere();
    enchCrownInst.computeBoundingSphere();
    enchTrunkInst.castShadow = true;
    enchTrunkInst.receiveShadow = true;
    enchCrownInst.castShadow = true;
    scene.add(enchTrunkInst, enchCrownInst);
    disposables.push(eTrunkGeo, eTrunkMat, eCrownGeo, eCrownMat);
  }

  // Bioluminescent Crystal Spires & Giant Glowing Mushrooms inside the Enchanted Glade (-1600, 1220)
  const crystalSpireGeo = new THREE.OctahedronGeometry(2.6, 0);
  crystalSpireGeo.scale(0.65, 2.5, 0.65);
  const crystalSpireMat = new THREE.MeshStandardMaterial({
    color: 0x5eead4,
    emissive: 0x2dd4bf,
    emissiveIntensity: 1.55,
    roughness: 0.22,
    metalness: 0.35,
  });
  const enchCrystalInst = new THREE.InstancedMesh(crystalSpireGeo, crystalSpireMat, 44);
  const dummyC = new THREE.Object3D();
  for (let i = 0; i < 44; i++) {
    const ang = i * 2.39996;
    const rad = 22 + (i % 11) * 20;
    const cx = -1600 + Math.cos(ang) * rad;
    const cz = 1220 + Math.sin(ang) * rad;
    const cy = Math.max(4, getTerrainHeight(cx, cz));
    dummyC.position.set(cx, cy + 2.2, cz);
    dummyC.rotation.set((i % 3 - 1) * 0.22, ang, ((i + 1) % 3 - 1) * 0.2);
    dummyC.scale.setScalar(0.65 + (i % 4) * 0.35);
    dummyC.updateMatrix();
    enchCrystalInst.setMatrixAt(i, dummyC.matrix);
  }
  enchCrystalInst.computeBoundingSphere();
  scene.add(enchCrystalInst);

  const gladeLight = new THREE.PointLight(0x2dd4bf, 28, 220, 1.4);
  gladeLight.position.set(-1600, getTerrainHeight(-1600, 1220) + 18, 1220);
  scene.add(gladeLight);
  disposables.push(crystalSpireGeo, crystalSpireMat);

  // Destructible Biome Shrines & Obsidian Fire Monoliths (for full collision & destruction physics in new biomes!)
  const obsidianMat = new THREE.MeshStandardMaterial({
    color: 0x1e191c,
    map: stoneTex,
    normalMap: terrainNormal,
    roughness: 0.72,
    metalness: 0.28,
  });
  const magmaCoreMat = new THREE.MeshStandardMaterial({
    color: 0xff6b1a,
    emissive: 0xff4500,
    emissiveIntensity: 2.2,
    roughness: 0.3,
  });
  disposables.push(obsidianMat, magmaCoreMat);

  const shrineSpecs: {
    id: string;
    nameAr: string;
    x: number;
    z: number;
    kind: 'volcanic' | 'enchanted';
  }[] = [
    { id: 'volc_shrine_1', nameAr: 'مسلة البازلت المشتعلة', x: -1615, z: -1385, kind: 'volcanic' },
    { id: 'volc_shrine_2', nameAr: 'معبد الجمر الخفي', x: -1835, z: -1245, kind: 'volcanic' },
    { id: 'volc_shrine_3', nameAr: 'برج الحمم القديم', x: -1240, z: -1725, kind: 'volcanic' },
    { id: 'ench_arch_1', nameAr: 'بوابة الغابة المسحورة', x: -1565, z: 1185, kind: 'enchanted' },
    { id: 'ench_arch_2', nameAr: 'مزار البلورات الخالد', x: -1640, z: 1265, kind: 'enchanted' },
  ];
  const shrineColGeo = new THREE.CylinderGeometry(3.2, 4.4, 34, 8);
  const shrineCapGeo = new THREE.OctahedronGeometry(4.8, 0);
  disposables.push(shrineColGeo, shrineCapGeo);

  for (const sh of shrineSpecs) {
    const sy = Math.max(4, getTerrainHeight(sh.x, sh.z));
    const g = new THREE.Group();
    g.position.set(sh.x, sy, sh.z);
    const body = new THREE.Mesh(shrineColGeo, sh.kind === 'volcanic' ? obsidianMat : archMat);
    body.position.y = 17;
    body.castShadow = true;
    body.receiveShadow = true;
    const cap = new THREE.Mesh(
      shrineCapGeo,
      sh.kind === 'volcanic' ? magmaCoreMat : crystalSpireMat,
    );
    cap.position.y = 37;
    cap.castShadow = true;
    g.add(body, cap);
    scene.add(g);

    destructibleBuildings.push({
      id: sh.id,
      nameAr: sh.nameAr,
      mesh: g,
      pos: new THREE.Vector3(sh.x, sy + 18, sh.z),
      radius: 10,
      height: 42,
      hp: 85,
      maxHp: 85,
      destroyed: false,
      colorHex: sh.kind === 'volcanic' ? 0x2a1f1d : 0x134e4a,
      breakableParts: [cap],
      brokenCount: 0,
      baseMeshPos: g.position.clone(),
      baseMeshRot: g.rotation.clone(),
      scorchAmount: 0,
    });
  }

  const hideTree = (t: DestructibleTree) => {
    if (t.kind === 'enchanted') {
      if (enchTrunkInst) {
        enchTrunkInst.setMatrixAt(t.index, _zeroMat);
        enchTrunkInst.instanceMatrix.needsUpdate = true;
      }
      if (enchCrownInst) {
        enchCrownInst.setMatrixAt(t.index, _zeroMat);
        enchCrownInst.instanceMatrix.needsUpdate = true;
      }
    } else {
      if (palmTrunkInst) {
        palmTrunkInst.setMatrixAt(t.index, _zeroMat);
        palmTrunkInst.instanceMatrix.needsUpdate = true;
      }
      if (palmCrownInst) {
        palmCrownInst.setMatrixAt(t.index, _zeroMat);
        palmCrownInst.instanceMatrix.needsUpdate = true;
      }
    }
  };

  // Instanced Boulders across cliffs, beaches, volcanic slopes, enchanted glades, and chasms
  const boulderGeo = new THREE.DodecahedronGeometry(3.4, 1);
  const boulderMat = new THREE.MeshStandardMaterial({
    color: 0x5c534a,
    normalMap: terrainNormal,
    roughness: 0.9,
  });
  const boulderCount = 136;
  const boulderInst = new THREE.InstancedMesh(boulderGeo, boulderMat, boulderCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < boulderCount; i++) {
    const region = i % 7;
    const baseAngle = (i * 2.39996) % (Math.PI * 2);
    const rad = 55 + (i % 10) * 20;
    const bx =
      region === 0
        ? -880 + Math.cos(baseAngle) * rad
        : region === 1
          ? 720 + Math.cos(baseAngle) * rad
          : region === 2
            ? -480 + Math.cos(baseAngle) * (rad * 0.75)
            : region === 3
              ? 940 + Math.cos(baseAngle) * rad
              : region === 4
                ? -640 + Math.cos(baseAngle) * (rad * 0.7)
                : region === 5
                  ? -1520 + Math.cos(baseAngle) * (rad * 1.1)
                  : -1600 + Math.cos(baseAngle) * (rad * 1.1);
    const bz =
      region === 0
        ? -60 + Math.sin(baseAngle) * rad
        : region === 1
          ? 560 + Math.sin(baseAngle) * rad
          : region === 2
            ? -560 + Math.sin(baseAngle) * (rad * 0.9)
            : region === 3
              ? 90 + Math.sin(baseAngle) * rad
              : region === 4
                ? 580 + Math.sin(baseAngle) * (rad * 0.7)
                : region === 5
                  ? -1500 + Math.sin(baseAngle) * (rad * 1.1)
                  : 1220 + Math.sin(baseAngle) * (rad * 1.1);
    const by = Math.max(-1, getTerrainHeight(bx, bz));
    dummy.position.set(bx, by, bz);
    dummy.rotation.set(i * 0.5, i * 1.1, i * 0.3);
    dummy.scale.set(0.85 + (i % 5) * 0.34, 0.65 + (i % 3) * 0.28, 0.9 + (i % 4) * 0.25);
    dummy.updateMatrix();
    boulderInst.setMatrixAt(i, dummy.matrix);
  }
  boulderInst.computeBoundingSphere();
  boulderInst.castShadow = true;
  boulderInst.receiveShadow = true;
  scene.add(boulderInst);
  disposables.push(boulderGeo, boulderMat);

  // 9. Pirate Fleet (11 War Galleons across inner & outer seas!)
  const pirateShips: PirateShipActor[] = [];
  const shipConfigs = [
    { cx: 80, cz: 60, r: 210, speed: 0.045, phase: 0.2 },
    { cx: -120, cz: 190, r: 175, speed: -0.042, phase: 2.1 },
    { cx: 280, cz: -80, r: 190, speed: 0.044, phase: 3.9 },
    { cx: 190, cz: 310, r: 155, speed: -0.05, phase: 5.0 },
    { cx: -210, cz: -40, r: 165, speed: 0.038, phase: 1.2 },
    { cx: 460, cz: -280, r: 160, speed: 0.04, phase: 4.3 },
    { cx: -320, cz: -310, r: 150, speed: -0.046, phase: 0.9 },
    { cx: 1680, cz: 1450, r: 240, speed: 0.036, phase: 1.5 },
    { cx: -2120, cz: -140, r: 220, speed: -0.038, phase: 3.1 },
    { cx: 1860, cz: -1350, r: 230, speed: 0.035, phase: 4.8 },
    { cx: -1260, cz: 2180, r: 215, speed: -0.04, phase: 2.6 },
  ];
  shipConfigs.forEach((cfg) => {
    const built = buildPirateShip(woodTex, sailTex, pirateSoldierGeo, warriorMat);
    disposables.push(built.hullMat, built.sailMat);
    scene.add(built.ship);
    pirateShips.push({
      group: built.ship,
      centerX: cfg.cx,
      centerZ: cfg.cz,
      orbitRadius: cfg.r,
      speed: cfg.speed,
      phase: cfg.phase,
      hp: 95,
      maxHp: 95,
      destroyed: false,
      sinkProgress: 0,
      masts: built.masts,
      sails: built.sails,
      hullMat: built.hullMat,
      sailMat: built.sailMat,
      fireLight: built.fireLight,
      burnLevel: 0,
      burnTimer: 0,
      brokenMasts: 0,
      damageTiltX: 0,
      damageTiltZ: 0,
    });
  });

  // 10. UE5 Volumetric-Lit Soft Atmospheric, High-Altitude & Pyroclastic Cloud Banks across 10.4km Open World
  const cloudClusters: CloudCluster[] = [];
  const atmClusterCount = 156;
  const atmPuffsPerCluster = 12;
  const highClusterCount = 72;
  const highPuffsPerCluster = 10;
  const volcanicClusterCount = 32;
  const volcanicPuffsPerCluster = 12;
  const totalPuffs =
    atmClusterCount * atmPuffsPerCluster +
    highClusterCount * highPuffsPerCluster +
    volcanicClusterCount * volcanicPuffsPerCluster;

  const baseQuad = new THREE.PlaneGeometry(1, 1);
  const instCloudGeo = new THREE.InstancedBufferGeometry();
  instCloudGeo.index = baseQuad.index;
  instCloudGeo.attributes.position = baseQuad.attributes.position;
  instCloudGeo.attributes.uv = baseQuad.attributes.uv;
  baseQuad.dispose();

  // Per-instance attributes: [rollAngle, heightNorm(0=belly..1=crown), uvOffset, driftPhase]
  const cloudSeeds = new Float32Array(totalPuffs * 4);
  const puffOffsets = new Float32Array(totalPuffs * 3);
  const clusterCentersAttr = new Float32Array(totalPuffs * 3);
  const puffScales = new Float32Array(totalPuffs * 2);
  const volcanicFactors = new Float32Array(totalPuffs);

  let puffIdx = 0;
  // Layer A: Low & Mid Towering Cumulus Banks (74m - 228m) distributed across the 10.4km map
  for (let i = 0; i < atmClusterCount; i++) {
    const angle = (i / atmClusterCount) * Math.PI * 2 + (i % 7) * 0.43;
    const dist = 165 + ((i * 277) % 4450);
    const cx = Math.cos(angle) * dist;
    const cz = Math.sin(angle) * dist;
    const cy = 76 + ((i * 31) % 146);
    const clusterRadius = 54 + (i % 4) * 11;

    cloudClusters.push({
      baseCenter: new THREE.Vector3(cx, cy, cz),
      center: new THREE.Vector3(cx, cy, cz),
      radius: clusterRadius,
      baseY: cy,
      driftPhase: i * 0.65,
      isVolcanic: false,
    });

    for (let p = 0; p < atmPuffsPerCluster; p++) {
      const frac = p / atmPuffsPerCluster;
      const puffAng = p * 2.39996 + i * 0.8;
      const spreadR = (0.16 + (p % 4) * 0.24) * clusterRadius;
      // Flat cumulus base with sculpted multi-tier billow crown
      const isCrown = p >= atmPuffsPerCluster - 4;
      const ox = cx + Math.cos(puffAng) * spreadR * (isCrown ? 0.5 : 1.04);
      const oz = cz + Math.sin(puffAng) * spreadR * (isCrown ? 0.5 : 1.04);
      const oy = cy + (isCrown ? 8.5 + (p - 8) * 5.2 : ((p % 3) - 1) * 3.4);

      const scaleW = (38 + ((i * 11 + p * 7) % 24)) * (isCrown ? 0.96 : 1.38);
      const scaleH = scaleW * (isCrown ? 0.82 : 0.58);

      puffOffsets[puffIdx * 3] = ox;
      puffOffsets[puffIdx * 3 + 1] = oy;
      puffOffsets[puffIdx * 3 + 2] = oz;

      clusterCentersAttr[puffIdx * 3] = cx;
      clusterCentersAttr[puffIdx * 3 + 1] = cy;
      clusterCentersAttr[puffIdx * 3 + 2] = cz;

      puffScales[puffIdx * 2] = scaleW;
      puffScales[puffIdx * 2 + 1] = scaleH;

      cloudSeeds[puffIdx * 4] = (i * 1.7 + p * 2.3) % (Math.PI * 2);
      cloudSeeds[puffIdx * 4 + 1] = isCrown ? 0.82 + frac * 0.18 : 0.16 + (p % 3) * 0.26;
      cloudSeeds[puffIdx * 4 + 2] = ((i * 13 + p * 29) % 100) / 100;
      cloudSeeds[puffIdx * 4 + 3] = i * 0.65;
      volcanicFactors[puffIdx] = 0;

      puffIdx++;
    }
  }

  // Layer B: High-Altitude Stratospheric & Anvil Cloud Deck (295m - 650m) across 10.4km skies
  for (let hIdx = 0; hIdx < highClusterCount; hIdx++) {
    const i = atmClusterCount + hIdx;
    const angle = (hIdx / highClusterCount) * Math.PI * 2 + (hIdx % 7) * 0.29;
    const dist = 140 + ((hIdx * 337) % 4480);
    const cx = Math.cos(angle) * dist;
    const cz = Math.sin(angle) * dist;
    const cy = 295 + ((hIdx * 47) % 345);
    const clusterRadius = 82 + (hIdx % 4) * 16;

    cloudClusters.push({
      baseCenter: new THREE.Vector3(cx, cy, cz),
      center: new THREE.Vector3(cx, cy, cz),
      radius: clusterRadius,
      baseY: cy,
      driftPhase: i * 0.52,
      isVolcanic: false,
    });

    for (let p = 0; p < highPuffsPerCluster; p++) {
      const frac = p / highPuffsPerCluster;
      const puffAng = p * 2.39996 + hIdx * 1.1;
      const spreadR = (0.18 + (p % 4) * 0.26) * clusterRadius;
      const isCrown = p >= highPuffsPerCluster - 3;
      const ox = cx + Math.cos(puffAng) * spreadR * (isCrown ? 0.55 : 1.12);
      const oz = cz + Math.sin(puffAng) * spreadR * (isCrown ? 0.55 : 1.12);
      const oy = cy + (isCrown ? 11.0 + (p - 7) * 6.4 : ((p % 3) - 1) * 4.2);

      const scaleW = (62 + ((i * 13 + p * 9) % 34)) * (isCrown ? 0.98 : 1.46);
      const scaleH = scaleW * (isCrown ? 0.72 : 0.44);

      puffOffsets[puffIdx * 3] = ox;
      puffOffsets[puffIdx * 3 + 1] = oy;
      puffOffsets[puffIdx * 3 + 2] = oz;

      clusterCentersAttr[puffIdx * 3] = cx;
      clusterCentersAttr[puffIdx * 3 + 1] = cy;
      clusterCentersAttr[puffIdx * 3 + 2] = cz;

      puffScales[puffIdx * 2] = scaleW;
      puffScales[puffIdx * 2 + 1] = scaleH;

      cloudSeeds[puffIdx * 4] = (i * 1.4 + p * 2.5) % (Math.PI * 2);
      cloudSeeds[puffIdx * 4 + 1] = isCrown ? 0.85 + frac * 0.15 : 0.22 + (p % 3) * 0.25;
      cloudSeeds[puffIdx * 4 + 2] = ((i * 19 + p * 31) % 100) / 100;
      cloudSeeds[puffIdx * 4 + 3] = i * 0.52;
      volcanicFactors[puffIdx] = 0;

      puffIdx++;
    }
  }

  // Layer C: Dense pyroclastic ash & dirty-thunderstorm cloud banks above the Hidden Volcanic Archipelago
  const volcanicAnchors = [
    { x: -1520, z: -1500, spread: 345, baseMinY: 112, baseRangeY: 142, count: 18 },
    { x: -1840, z: -1240, spread: 195, baseMinY: 96, baseRangeY: 105, count: 7 },
    { x: -1230, z: -1780, spread: 190, baseMinY: 92, baseRangeY: 98, count: 7 },
  ];
  let volcClusterIdx = 0;
  for (const anchor of volcanicAnchors) {
    for (let k = 0; k < anchor.count; k++) {
      const i = atmClusterCount + highClusterCount + volcClusterIdx;
      const ringFrac = k === 0 ? 0.04 : 0.2 + ((k * 0.37) % 0.8);
      const ang = k * 2.39996 + volcClusterIdx * 0.42;
      const cx = anchor.x + Math.cos(ang) * anchor.spread * ringFrac;
      const cz = anchor.z + Math.sin(ang) * anchor.spread * ringFrac;
      const cy = anchor.baseMinY + ((volcClusterIdx * 23) % anchor.baseRangeY);
      const clusterRadius = 54 + (volcClusterIdx % 4) * 8;

      cloudClusters.push({
        baseCenter: new THREE.Vector3(cx, cy, cz),
        center: new THREE.Vector3(cx, cy, cz),
        radius: clusterRadius,
        baseY: cy,
        driftPhase: i * 0.85,
        isVolcanic: true,
      });

      for (let p = 0; p < volcanicPuffsPerCluster; p++) {
        const frac = p / volcanicPuffsPerCluster;
        const puffAng = p * 2.39996 + volcClusterIdx * 0.95;
        const spreadR = (0.14 + (p % 4) * 0.25) * clusterRadius;
        const isCrown = p >= volcanicPuffsPerCluster - 4;
        const ox = cx + Math.cos(puffAng) * spreadR * (isCrown ? 0.58 : 1.04);
        const oz = cz + Math.sin(puffAng) * spreadR * (isCrown ? 0.58 : 1.04);
        const oy = cy + (isCrown ? 9.5 + (p - 8) * 5.8 : ((p % 3) - 1) * 4.2);

        const scaleW = (40 + ((i * 13 + p * 9) % 22)) * (isCrown ? 1.08 : 1.38);
        const scaleH = scaleW * (isCrown ? 0.88 : 0.68);

        puffOffsets[puffIdx * 3] = ox;
        puffOffsets[puffIdx * 3 + 1] = oy;
        puffOffsets[puffIdx * 3 + 2] = oz;

        clusterCentersAttr[puffIdx * 3] = cx;
        clusterCentersAttr[puffIdx * 3 + 1] = cy;
        clusterCentersAttr[puffIdx * 3 + 2] = cz;

        puffScales[puffIdx * 2] = scaleW;
        puffScales[puffIdx * 2 + 1] = scaleH;

        cloudSeeds[puffIdx * 4] = (i * 1.9 + p * 2.1) % (Math.PI * 2);
        cloudSeeds[puffIdx * 4 + 1] = isCrown ? 0.82 + frac * 0.18 : 0.14 + (p % 3) * 0.25;
        cloudSeeds[puffIdx * 4 + 2] = ((i * 17 + p * 31) % 100) / 100;
        cloudSeeds[puffIdx * 4 + 3] = i * 0.85;
        volcanicFactors[puffIdx] = 0.84 + (p % 3) * 0.08;

        puffIdx++;
      }
      volcClusterIdx++;
    }
  }

  instCloudGeo.setAttribute(
    'aCloudCenter',
    new THREE.InstancedBufferAttribute(puffOffsets, 3),
  );
  instCloudGeo.setAttribute(
    'aClusterCenter',
    new THREE.InstancedBufferAttribute(clusterCentersAttr, 3),
  );
  instCloudGeo.setAttribute(
    'aCloudSize',
    new THREE.InstancedBufferAttribute(puffScales, 2),
  );
  instCloudGeo.setAttribute(
    'aCloudSeed',
    new THREE.InstancedBufferAttribute(cloudSeeds, 4),
  );
  instCloudGeo.setAttribute(
    'aVolcanicFactor',
    new THREE.InstancedBufferAttribute(volcanicFactors, 1),
  );
  instCloudGeo.instanceCount = totalPuffs;

  const cloudMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uCloudTex: { value: cloudTex },
      uTime: { value: 0 },
      uSunDir: cloudShadowUniforms.uSunDir,
      uWindOffset: cloudShadowUniforms.uWindOffset,
      uStormFactor: { value: 0 },
      uLightning: { value: 0 },
      uVolcanicLightning: { value: 0 },
      uPlayerPos: { value: new THREE.Vector3(0, -999, 0) },
      uPlayerSpeed: { value: 0 },
    },
    vertexShader: `
      attribute vec3 aCloudCenter;
      attribute vec3 aClusterCenter;
      attribute vec2 aCloudSize;
      attribute vec4 aCloudSeed;
      attribute float aVolcanicFactor;
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec2 uWindOffset;
      uniform float uStormFactor;
      uniform vec3 uPlayerPos;
      uniform float uPlayerSpeed;
      varying vec2 vUv;
      varying vec4 vSeed;
      varying vec3 vWorldPos;
      varying float vViewDist;
      varying float vVolcanic;
      varying vec2 vSunUvDir;
      varying float vWake;
      varying float vBorderFade;

      void main() {
        vUv = uv;
        vSeed = aCloudSeed;
        vVolcanic = aVolcanicFactor;

        float spinDir = aCloudSeed.z >= 0.5 ? 1.0 : -1.0;
        float windPace = 1.0 + uStormFactor * 0.95 + aVolcanicFactor * 0.85;

        // Whole-cluster prevailing wind advection wrapped cleanly across ±${CLOUD_WRAP_HALF}m
        vec3 center = aCloudCenter;
        if (aVolcanicFactor < 0.5) {
          float wx = mod(aClusterCenter.x + uWindOffset.x + ${CLOUD_WRAP_HALF}.0, ${CLOUD_WRAP_SPAN}.0) - ${CLOUD_WRAP_HALF}.0;
          float wz = mod(aClusterCenter.z + uWindOffset.y + ${CLOUD_WRAP_HALF}.0, ${CLOUD_WRAP_SPAN}.0) - ${CLOUD_WRAP_HALF}.0;
          center += vec3(wx - aClusterCenter.x, 0.0, wz - aClusterCenter.z);
          float edgeDist = max(abs(wx), abs(wz));
          vBorderFade = 1.0 - smoothstep(${CLOUD_WRAP_HALF - 420}.0, ${CLOUD_WRAP_HALF}.0, edgeDist);
        } else {
          vBorderFade = 1.0;
        }

        // Convective smoke-like vertical rise & horizontal turbulent eddy drift
        center.y += sin(uTime * 0.42 * windPace + aCloudSeed.w) * (3.2 + aVolcanicFactor * 3.8 + uStormFactor * 2.2)
                  + cos(uTime * 0.78 + aCloudSeed.z * 12.566) * 1.4;
        center.x += sin(uTime * 0.085 * windPace + aCloudSeed.z * 6.2831) * (14.0 + aVolcanicFactor * 12.0 + uStormFactor * 10.0)
                  + cos(uTime * 0.21 + aCloudSeed.w) * 4.5;
        center.z += cos(uTime * 0.11 * windPace + aCloudSeed.w * 1.3) * (8.0 + aVolcanicFactor * 11.0 + uStormFactor * 7.0);

        // Aerodynamic wake swirl & parting turbulence when the dragon tears through a cloud
        vec3 fromPlayer = center - uPlayerPos;
        float pDist = length(fromPlayer);
        float speedFactor = clamp(uPlayerSpeed / 75.0, 0.2, 1.6);
        float wake = (1.0 - smoothstep(10.0, 74.0, pDist)) * speedFactor;
        vec3 wakePushDir = pDist > 0.001 ? fromPlayer / pDist : vec3(0.0, 1.0, 0.0);
        center += wakePushDir * wake * 11.5;
        vWake = wake;

        // Extract camera right & up vectors directly from viewMatrix for silky billboarding
        vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

        // Continuous counter-rotating smoke roll + organic convective billowing stretch
        float swirlAngle = uTime * (0.065 + aVolcanicFactor * 0.085 + uStormFactor * 0.055) * spinDir
                         + wake * 0.55 * spinDir;
        float ang = aCloudSeed.x + swirlAngle + sin(uTime * (0.28 + aVolcanicFactor * 0.18) + aCloudSeed.z * 6.2831) * 0.22;
        float c = cos(ang);
        float s = sin(ang);
        float breatheW = 1.0 + sin(uTime * 0.55 + aCloudSeed.w * 2.1) * 0.085 + wake * 0.22;
        float breatheH = 1.0 + cos(uTime * 0.68 + aCloudSeed.z * 9.42) * 0.095 + wake * 0.18;
        vec2 scaledPos = position.xy * aCloudSize * vec2(breatheW, breatheH);
        vec2 rotatedPos = vec2(
          scaledPos.x * c - scaledPos.y * s,
          scaledPos.x * s + scaledPos.y * c
        );

        // Project world sun direction into rotated sprite UV space for true volumetric self-shadowing
        vec2 sunScreen = vec2(dot(uSunDir, camRight), dot(uSunDir, camUp));
        vSunUvDir = vec2(
          sunScreen.x * c + sunScreen.y * s,
          -sunScreen.x * s + sunScreen.y * c
        );

        vec3 worldPos = center + camRight * rotatedPos.x + camUp * rotatedPos.y;
        vWorldPos = worldPos;
        vec4 mvPos = viewMatrix * vec4(worldPos, 1.0);
        vViewDist = -mvPos.z;
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform sampler2D uCloudTex;
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform float uStormFactor;
      uniform float uLightning;
      uniform float uVolcanicLightning;
      varying vec2 vUv;
      varying vec4 vSeed;
      varying vec3 vWorldPos;
      varying float vViewDist;
      varying float vVolcanic;
      varying vec2 vSunUvDir;
      varying float vWake;
      varying float vBorderFade;

      void main() {
        if (vBorderFade < 0.01) discard;
        vec2 centered = vUv - 0.5;
        float r2 = dot(centered, centered) * 4.0;
        if (r2 >= 1.0) discard;

        float spinDir = vSeed.z >= 0.5 ? 1.0 : -1.0;
        float tempo = 1.0 + uStormFactor * 0.85 + vVolcanic * 0.75 + vWake * 2.3;

        // Dual counter-rotating turbulent curl advection for living smoke-like internal motion
        vec2 driftA = vec2(uTime * 0.032 * tempo * spinDir + vSeed.z, -uTime * 0.048 * tempo - vSeed.w * 0.13);
        vec2 driftB = vec2(-uTime * 0.026 * tempo * spinDir - vSeed.z * 0.5, -uTime * 0.036 * tempo + vSeed.w * 0.09);
        vec4 curlA = texture2D(uCloudTex, vUv * 1.35 + driftA);
        vec4 curlB = texture2D(uCloudTex, vUv * 2.15 + driftB);

        vec2 curlWarp = (vec2(curlA.g, curlB.g) - 0.5) * (0.145 + uStormFactor * 0.05 + vVolcanic * 0.05 + vWake * 0.11);
        float ribbonShear = sin(uTime * (0.42 + uStormFactor * 0.35) + vUv.y * 5.2 + vSeed.w) * 0.024 * spinDir;
        vec2 smokeUv = clamp(vUv + curlWarp + vec2(ribbonShear, -0.012), 0.01, 0.99);

        vec4 texA = texture2D(uCloudTex, smokeUv);
        vec4 texSun1 = texture2D(uCloudTex, clamp(smokeUv + vSunUvDir * 0.055, 0.02, 0.98));
        vec4 texSun2 = texture2D(uCloudTex, clamp(smokeUv + vSunUvDir * 0.115, 0.02, 0.98));

        // Wispy smoky edge erosion with curling translucent tendrils
        float tendrilNoise = mix(curlA.g, curlB.g, 0.52);
        float ridgeNoise = mix(curlA.r, curlB.r, 0.45);
        float erodedAlpha = texA.a - (1.0 - tendrilNoise) * mix(0.28, 0.15, vVolcanic) * (1.0 - texA.b * 0.78);
        float wispyVeil = smoothstep(0.14, 0.74, texA.a * 0.78 + tendrilNoise * 0.34);
        float radialSoft = 1.0 - smoothstep(mix(0.34, 0.26, vVolcanic), 1.0, r2);
        float densityGain = mix(1.04, 1.54, vVolcanic);
        float maxOpacity = mix(0.90, 0.98, vVolcanic);
        float alpha = clamp(mix(erodedAlpha, erodedAlpha * wispyVeil, 0.55) * radialSoft * densityGain, 0.0, maxOpacity);
        if (alpha < 0.012) discard;

        // Beer-Lambert volumetric self-shadowing + Powder edge brightening over undulating smoke domes
        float sunOccl = (texSun1.b * 0.6 + texSun2.b * 0.4);
        float beerShadow = exp(-sunOccl * mix(1.65, 2.35, uStormFactor + vVolcanic * 0.4));
        float powder = 1.0 - exp(-texA.b * 2.4);
        float directSun = clamp(mix(beerShadow, beerShadow * powder * 1.38, 0.55) + (texA.r - texSun1.r) * 0.52, 0.0, 1.35);

        // Dual-lobe Henyey-Greenstein atmospheric sun scattering (forward silver lining + soft warm bounce)
        vec3 viewDir = normalize(vWorldPos - cameraPosition);
        float cosTheta = dot(viewDir, uSunDir);
        float g1 = 0.72;
        float hgFwd = (1.0 - g1 * g1) / (4.0 * 3.14159 * pow(max(0.08, 1.0 + g1 * g1 - 2.0 * g1 * cosTheta), 1.5));
        float silverLining = clamp(hgFwd * 0.36, 0.0, 1.4) * (1.0 - uStormFactor * 0.72) * (1.0 - texA.b * 0.42) * (1.0 - vVolcanic * 0.78);

        float crownShade = clamp(vSeed.y * 0.5 + vUv.y * 0.22 + directSun * 0.4 + ridgeNoise * 0.16, 0.0, 1.0);
        vec3 clearTop = vec3(1.0, 0.97, 0.92);
        vec3 clearBelly = vec3(0.44, 0.56, 0.70);
        vec3 stormTop = vec3(0.32, 0.38, 0.45);
        vec3 stormBelly = vec3(0.10, 0.13, 0.18);
        vec3 volcTop = vec3(0.19, 0.15, 0.17);
        vec3 volcBelly = vec3(0.05, 0.04, 0.05);

        vec3 topCol = mix(mix(clearTop, stormTop, uStormFactor), volcTop, vVolcanic);
        vec3 bellyCol = mix(mix(clearBelly, stormBelly, uStormFactor), volcBelly, vVolcanic);
        vec3 col = mix(bellyCol, topCol, smoothstep(0.08, 0.94, crownShade));

        // Warm golden rim scattering & sunlit dome highlights
        col += vec3(1.0, 0.85, 0.62) * silverLining * 0.68;
        col += vec3(0.22, 0.18, 0.14) * max(0.0, directSun - 0.65) * (1.0 - uStormFactor * 0.8) * (1.0 - vVolcanic);

        // Caldera magma underglow inside lower volcanic ash plumes
        float magmaMask = (1.0 - smoothstep(0.06, 0.74, crownShade)) * (0.62 + 0.38 * sin(uTime * 2.1 + vSeed.w));
        col += vec3(0.96, 0.33, 0.05) * magmaMask * (0.45 + 0.32 * (1.0 - texA.r)) * vVolcanic;

        // Global storm lightning + localized volcanic dirty-thunderstorm subsurface arcs
        float localFlash = max(uLightning, uVolcanicLightning * vVolcanic);
        vec3 lightningTint = mix(vec3(0.62, 0.84, 1.0), vec3(0.76, 0.90, 1.0), vVolcanic);
        col += lightningTint * localFlash * (0.35 + (1.0 - texA.r) * 0.65 + vVolcanic * 0.32);
        col += vec3(1.0, 0.52, 0.18) * uVolcanicLightning * vVolcanic * (1.0 - crownShade) * 0.42;

        // Smooth near-camera soft dissolve & wide 10.4km horizon fade
        float nearFade = smoothstep(8.0, 34.0, vViewDist);
        float farFade = 1.0 - smoothstep(7800.0, 14500.0, vViewDist);
        alpha *= nearFade * farFade * vBorderFade;

        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  const cloudInstMesh = new THREE.Mesh(instCloudGeo, cloudMat);
  cloudInstMesh.frustumCulled = false;
  cloudInstMesh.renderOrder = 2;
  scene.add(cloudInstMesh);
  disposables.push(instCloudGeo, cloudMat);

  // 12. Sky Wind Currents (تيارات هوائية مرئية): sweeping slipstream ribbons & rushing airflow streaks
  const windCurrentDefs: {
    waypoints: [number, number, number][];
    radius: number;
    strength: number;
    kind: 'jetstream' | 'thermal' | 'canyon_draft';
  }[] = [
    // Launch slipstream outside Sanctuary Cavern heading across the sea
    {
      waypoints: [
        [-470, 82, 430],
        [-230, 92, 235],
        [40, 86, 45],
        [330, 74, -125],
      ],
      radius: 32,
      strength: 1.05,
      kind: 'canyon_draft',
    },
    // Twin Canyon Chasm wind tunnel
    {
      waypoints: [
        [-485, 96, -320],
        [-480, 108, -560],
        [-430, 132, -790],
        [-210, 148, -945],
      ],
      radius: 28,
      strength: 1.12,
      kind: 'canyon_draft',
    },
    // Golden Beach to Coral Palace sea breeze
    {
      waypoints: [
        [520, 56, 420],
        [690, 68, 130],
        [780, 74, -220],
        [650, 84, -520],
      ],
      radius: 30,
      strength: 1.0,
      kind: 'canyon_draft',
    },
    // Mount Volcano soaring thermal updraft
    {
      waypoints: [
        [850, 112, 165],
        [940, 185, 85],
        [905, 275, -15],
        [815, 370, 65],
      ],
      radius: 34,
      strength: 1.18,
      kind: 'thermal',
    },
    // Enchanted Forest glowing canopy draft
    {
      waypoints: [
        [-1410, 84, 1070],
        [-1600, 98, 1220],
        [-1480, 125, 1430],
        [-1210, 144, 1340],
      ],
      radius: 30,
      strength: 1.02,
      kind: 'canyon_draft',
    },
    // Pirate Fleet low-altitude ocean slipstream
    {
      waypoints: [
        [-240, 44, 185],
        [45, 42, 40],
        [270, 48, -145],
        [530, 58, -265],
      ],
      radius: 30,
      strength: 1.04,
      kind: 'canyon_draft',
    },
    // Northern Frostspire alpine tailwind
    {
      waypoints: [
        [-150, 118, -780],
        [120, 134, -940],
        [430, 152, -885],
        [690, 140, -680],
      ],
      radius: 31,
      strength: 1.08,
      kind: 'jetstream',
    },
    // Falcon Castle rampart draft
    {
      waypoints: [
        [-750, 102, 190],
        [-865, 114, -60],
        [-785, 128, -320],
        [-600, 136, -470],
      ],
      radius: 29,
      strength: 1.0,
      kind: 'canyon_draft',
    },
    // Volcanic Archipelago storm thermal
    {
      waypoints: [
        [-1250, 132, -1230],
        [-1500, 168, -1500],
        [-1690, 215, -1380],
        [-1540, 270, -1120],
      ],
      radius: 34,
      strength: 1.16,
      kind: 'thermal',
    },
    // High-altitude Stratospheric Jetstream 1 (West -> East)
    {
      waypoints: [
        [-1150, 240, -240],
        [-450, 265, -80],
        [260, 250, 60],
        [960, 275, 180],
      ],
      radius: 35,
      strength: 1.2,
      kind: 'jetstream',
    },
    // High-altitude Stratospheric Jetstream 2 (South -> North)
    {
      waypoints: [
        [-140, 310, 1040],
        [-40, 335, 380],
        [80, 320, -320],
        [180, 350, -980],
      ],
      radius: 35,
      strength: 1.22,
      kind: 'jetstream',
    },
    // High-altitude Ring Current (NE -> SW above cloud deck)
    {
      waypoints: [
        [980, 390, -760],
        [460, 420, -1080],
        [-220, 405, -1040],
        [-860, 375, -720],
      ],
      radius: 36,
      strength: 1.24,
      kind: 'jetstream',
    },
    // Sanctuary Ascending Skybridge Current (connects Sanctuary ridge up to high clouds)
    {
      waypoints: [
        [-680, 135, 420],
        [-840, 205, 190],
        [-780, 275, -140],
        [-520, 330, -420],
      ],
      radius: 32,
      strength: 1.14,
      kind: 'jetstream',
    },
    // South-East Lagoon to Volcano Climbing Thermal
    {
      waypoints: [
        [680, 72, 680],
        [860, 118, 490],
        [945, 165, 250],
        [910, 225, -40],
      ],
      radius: 31,
      strength: 1.1,
      kind: 'thermal',
    },
    // Deep-Sky Apex Jetstream (460m - 540m soaring expressway)
    {
      waypoints: [
        [-1280, 465, 860],
        [-540, 505, 460],
        [220, 520, 40],
        [920, 480, -380],
      ],
      radius: 36,
      strength: 1.26,
      kind: 'jetstream',
    },
    // Western Archipelago Express Current
    {
      waypoints: [
        [-1380, 195, -960],
        [-1180, 170, -420],
        [-1120, 155, 240],
        [-1320, 168, 860],
      ],
      radius: 33,
      strength: 1.15,
      kind: 'jetstream',
    },
    // Far Northeast Sky Spires Expressway
    {
      waypoints: [
        [1060, 145, -540],
        [1760, 185, -1240],
        [2480, 215, -1890],
        [2980, 235, -2380],
      ],
      radius: 38,
      strength: 1.24,
      kind: 'jetstream',
    },
    // Eastern Sky Spires Climbing Thermal
    {
      waypoints: [
        [2850, 125, -2420],
        [2960, 215, -2340],
        [3060, 315, -2220],
        [2920, 415, -2140],
      ],
      radius: 36,
      strength: 1.22,
      kind: 'thermal',
    },
    // Far Southeast Tropical Coral Trade Wind
    {
      waypoints: [
        [920, 74, 760],
        [1520, 92, 1540],
        [2080, 86, 2260],
        [2520, 78, 2790],
      ],
      radius: 36,
      strength: 1.18,
      kind: 'canyon_draft',
    },
    // Far Northern Glacier Polar Jetstream
    {
      waypoints: [
        [140, 155, -1220],
        [-40, 195, -1980],
        [-210, 225, -2680],
        [-360, 245, -3320],
      ],
      radius: 38,
      strength: 1.25,
      kind: 'jetstream',
    },
    // Far Western Storm Isles Gale
    {
      waypoints: [
        [-1180, 118, -20],
        [-1880, 138, 120],
        [-2580, 154, 210],
        [-3220, 168, 260],
      ],
      radius: 37,
      strength: 1.22,
      kind: 'jetstream',
    },
    // Outer Rim Stratospheric Ring (East -> South)
    {
      waypoints: [
        [3120, 390, -1850],
        [3240, 420, -280],
        [3050, 405, 1350],
        [2520, 370, 2640],
      ],
      radius: 40,
      strength: 1.3,
      kind: 'jetstream',
    },
    // Outer Rim Stratospheric Ring (North -> West)
    {
      waypoints: [
        [-420, 430, -3280],
        [-1780, 440, -2550],
        [-2780, 410, -1240],
        [-3240, 360, 180],
      ],
      radius: 40,
      strength: 1.28,
      kind: 'jetstream',
    },
  ];

  const windCurrents: WindCurrentStream[] = [];
  const ribbonPositions: number[] = [];
  const ribbonUvs: number[] = [];
  const ribbonSeeds: number[] = [];
  const ribbonKinds: number[] = [];
  const ribbonIndices: number[] = [];

  const streakCenters: number[] = [];
  const streakTangents: number[] = [];
  const streakCorners: number[] = [];
  const streakSeeds: number[] = [];
  const streakKinds: number[] = [];
  const streakIndices: number[] = [];

  const wUpVec = new THREE.Vector3(0, 1, 0);
  const wAltUpVec = new THREE.Vector3(1, 0, 0);
  const wRightVec = new THREE.Vector3();
  const wBinormVec = new THREE.Vector3();
  const wOffsetVec = new THREE.Vector3();
  const wWidthVec = new THREE.Vector3();

  const ribbonSegs = 40;
  const ribbonsPerStream = 3;
  const streaksPerStream = 26;

  windCurrentDefs.forEach((def, streamIdx) => {
    const curve = new THREE.CatmullRomCurve3(
      def.waypoints.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      false,
      'catmullrom',
      0.5,
    );
    const kindCode = def.kind === 'thermal' ? 1 : def.kind === 'canyon_draft' ? 2 : 0;

    // Sample 18 physics segments along each stream for fast runtime detection
    const sampleCount = 18;
    const pts: THREE.Vector3[] = [];
    const tans: THREE.Vector3[] = [];
    for (let s = 0; s <= sampleCount; s++) {
      const t = s / sampleCount;
      pts.push(curve.getPointAt(t));
      tans.push(curve.getTangentAt(t).normalize());
    }
    windCurrents.push({
      id: streamIdx,
      points: pts,
      tangents: tans,
      radius: def.radius,
      strength: def.strength,
      kind: def.kind,
    });

    // Build 3 intertwined helical translucent wind ribbons per current
    for (let r = 0; r < ribbonsPerStream; r++) {
      const baseVertex = ribbonPositions.length / 3;
      const phaseSeed = (streamIdx * 0.37 + r * 0.333) % 1;
      const flowSpeed = 0.48 + ((streamIdx + r) % 4) * 0.08;

      for (let s = 0; s <= ribbonSegs; s++) {
        const u = s / ribbonSegs;
        const center = curve.getPointAt(u);
        const tan = curve.getTangentAt(u).normalize();
        const refUp = Math.abs(tan.y) > 0.9 ? wAltUpVec : wUpVec;
        wRightVec.crossVectors(tan, refUp).normalize();
        wBinormVec.crossVectors(wRightVec, tan).normalize();

        const helixAngle = u * Math.PI * 3.8 + (r * Math.PI * 2) / ribbonsPerStream + streamIdx * 0.7;
        const radialR =
          def.radius * (0.34 + 0.14 * Math.sin(u * Math.PI * 2.5 + r * 1.9));
        const cosH = Math.cos(helixAngle);
        const sinH = Math.sin(helixAngle);

        wOffsetVec
          .copy(wRightVec)
          .multiplyScalar(cosH * radialR)
          .addScaledVector(wBinormVec, sinH * radialR);

        // Ribbon width tilts organically around the helix tangent
        wWidthVec
          .copy(wRightVec)
          .multiplyScalar(-sinH)
          .addScaledVector(wBinormVec, cosH)
          .normalize();
        const halfWidth = (1.1 + 1.25 * Math.sin(u * Math.PI)) * (0.85 + 0.25 * (r % 2));

        const lx = center.x + wOffsetVec.x - wWidthVec.x * halfWidth;
        const ly = center.y + wOffsetVec.y - wWidthVec.y * halfWidth;
        const lz = center.z + wOffsetVec.z - wWidthVec.z * halfWidth;

        const rx = center.x + wOffsetVec.x + wWidthVec.x * halfWidth;
        const ry = center.y + wOffsetVec.y + wWidthVec.y * halfWidth;
        const rz = center.z + wOffsetVec.z + wWidthVec.z * halfWidth;

        ribbonPositions.push(lx, ly, lz, rx, ry, rz);
        ribbonUvs.push(u, 0, u, 1);
        ribbonSeeds.push(phaseSeed, flowSpeed, phaseSeed, flowSpeed);
        ribbonKinds.push(kindCode, kindCode);

        if (s < ribbonSegs) {
          const i0 = baseVertex + s * 2;
          const i1 = i0 + 1;
          const i2 = i0 + 2;
          const i3 = i0 + 3;
          ribbonIndices.push(i0, i2, i1, i1, i2, i3);
        }
      }
    }

    // Build rushing aerodynamic airflow streaks along the corridor
    for (let k = 0; k < streaksPerStream; k++) {
      const t0 = 0.08 + ((k + 0.35) / streaksPerStream) * 0.84;
      const center = curve.getPointAt(t0);
      const tan = curve.getTangentAt(t0).normalize();
      const refUp = Math.abs(tan.y) > 0.9 ? wAltUpVec : wUpVec;
      wRightVec.crossVectors(tan, refUp).normalize();
      wBinormVec.crossVectors(wRightVec, tan).normalize();

      const ang = k * 2.39996 + streamIdx * 1.1;
      const distFrac = 0.16 + ((k * 0.37) % 0.68);
      const radialDist = def.radius * distFrac;
      const sx =
        center.x +
        (wRightVec.x * Math.cos(ang) + wBinormVec.x * Math.sin(ang)) * radialDist;
      const sy =
        center.y +
        (wRightVec.y * Math.cos(ang) + wBinormVec.y * Math.sin(ang)) * radialDist;
      const sz =
        center.z +
        (wRightVec.z * Math.cos(ang) + wBinormVec.z * Math.sin(ang)) * radialDist;

      const phase = ((k * 0.29 + streamIdx * 0.17) % 1 + 1) % 1;
      const spd = 0.42 + (k % 5) * 0.07;
      const streakLen = 14 + (k % 4) * 4.5;

      const vBase = streakCenters.length / 3;
      const corners: [number, number][] = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ];
      for (const [cx, cy] of corners) {
        streakCenters.push(sx, sy, sz);
        streakTangents.push(tan.x, tan.y, tan.z);
        streakCorners.push(cx, cy);
        streakSeeds.push(phase, spd, streakLen);
        streakKinds.push(kindCode);
      }
      streakIndices.push(vBase, vBase + 1, vBase + 2, vBase, vBase + 2, vBase + 3);
    }
  });

  const windRibbonGeo = new THREE.BufferGeometry();
  windRibbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(ribbonPositions, 3));
  windRibbonGeo.setAttribute('uv', new THREE.Float32BufferAttribute(ribbonUvs, 2));
  windRibbonGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(ribbonSeeds, 2));
  windRibbonGeo.setAttribute('aKind', new THREE.Float32BufferAttribute(ribbonKinds, 1));
  windRibbonGeo.setIndex(ribbonIndices);
  windRibbonGeo.computeBoundingSphere();

  const windRibbonMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uStormFactor: { value: 0 },
    },
    vertexShader: `
      attribute vec2 aSeed;
      attribute float aKind;
      uniform float uTime;
      varying vec2 vUv;
      varying vec2 vSeed;
      varying float vKind;
      varying float vViewDist;

      void main() {
        vUv = uv;
        vSeed = aSeed;
        vKind = aKind;
        vec3 pos = position;
        float flutter = sin(uv.x * 24.0 - uTime * 3.8 + aSeed.x * 6.2831) * 0.45;
        pos.y += flutter * sin(uv.x * 3.14159);
        vec4 mvPos = viewMatrix * vec4(pos, 1.0);
        vViewDist = -mvPos.z;
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uStormFactor;
      varying vec2 vUv;
      varying vec2 vSeed;
      varying float vKind;
      varying float vViewDist;

      void main() {
        float flow = uTime * vSeed.y * (1.0 + uStormFactor * 0.42);
        float w1 = pow(0.5 + 0.5 * sin((vUv.x * 4.5 - flow + vSeed.x) * 6.28318), 2.6);
        float w2 = pow(0.5 + 0.5 * sin((vUv.x * 9.0 - flow * 1.45 + vSeed.x * 2.1) * 6.28318), 3.4);
        float crossProfile = pow(sin(clamp(vUv.y, 0.0, 1.0) * 3.14159), 1.55);
        float endFade = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.86, vUv.x);

        float nearFade = smoothstep(6.0, 22.0, vViewDist);
        float farFade = 1.0 - smoothstep(2600.0, 5400.0, vViewDist);

        float ribbonMask = crossProfile * endFade * (0.14 + w1 * 0.56 + w2 * 0.35);
        float alpha = clamp(ribbonMask * nearFade * farFade * (0.46 + uStormFactor * 0.14), 0.0, 0.62);
        if (alpha < 0.01) discard;

        vec3 jetCol = mix(vec3(0.42, 0.82, 0.99), vec3(0.95, 0.99, 1.0), w2 * 0.65 + crossProfile * 0.3);
        vec3 thermalCol = mix(vec3(0.98, 0.64, 0.24), vec3(1.0, 0.94, 0.76), w2 * 0.6 + crossProfile * 0.35);
        vec3 draftCol = mix(vec3(0.32, 0.88, 0.84), vec3(0.92, 0.99, 0.98), w2 * 0.6 + crossProfile * 0.35);

        vec3 col = vKind > 1.5 ? draftCol : (vKind > 0.5 ? thermalCol : jetCol);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  const windRibbonMesh = new THREE.Mesh(windRibbonGeo, windRibbonMaterial);
  windRibbonMesh.frustumCulled = false;
  windRibbonMesh.renderOrder = 4;
  scene.add(windRibbonMesh);
  disposables.push(windRibbonGeo, windRibbonMaterial);

  const windStreakGeo = new THREE.BufferGeometry();
  windStreakGeo.setAttribute('position', new THREE.Float32BufferAttribute(streakCenters, 3));
  windStreakGeo.setAttribute('aTangent', new THREE.Float32BufferAttribute(streakTangents, 3));
  windStreakGeo.setAttribute('aCorner', new THREE.Float32BufferAttribute(streakCorners, 2));
  windStreakGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(streakSeeds, 3));
  windStreakGeo.setAttribute('aKind', new THREE.Float32BufferAttribute(streakKinds, 1));
  windStreakGeo.setIndex(streakIndices);
  windStreakGeo.computeBoundingSphere();

  const windStreakMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uStormFactor: { value: 0 },
    },
    vertexShader: `
      attribute vec3 aTangent;
      attribute vec2 aCorner;
      attribute vec3 aSeed;
      attribute float aKind;
      uniform float uTime;
      uniform float uStormFactor;
      varying vec2 vCorner;
      varying float vCycle;
      varying float vKind;
      varying float vViewDist;

      void main() {
        vCorner = aCorner;
        vKind = aKind;

        float cycle = fract(uTime * aSeed.y * (1.0 + uStormFactor * 0.45) + aSeed.x);
        vCycle = cycle;

        vec3 center = position + aTangent * ((cycle - 0.5) * 58.0);
        vec3 toCam = normalize(cameraPosition - center + vec3(0.0001, 0.0002, 0.0001));
        vec3 sideAxis = cross(aTangent, toCam);
        float sideLen = length(sideAxis);
        sideAxis = sideLen > 0.001 ? sideAxis / sideLen : vec3(1.0, 0.0, 0.0);

        float widthHalf = 0.34 * (1.0 - abs(aCorner.x) * 0.55);
        vec3 worldPos = center + aTangent * (aCorner.x * aSeed.z * 0.5) + sideAxis * (aCorner.y * widthHalf);
        vec4 mvPos = viewMatrix * vec4(worldPos, 1.0);
        vViewDist = -mvPos.z;
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      varying vec2 vCorner;
      varying float vCycle;
      varying float vKind;
      varying float vViewDist;

      void main() {
        float lifeFade = sin(clamp(vCycle, 0.0, 1.0) * 3.14159);
        float along = 1.0 - abs(vCorner.x);
        float across = 1.0 - abs(vCorner.y);
        float shape = pow(max(0.0, along), 0.7) * pow(max(0.0, across), 1.6);

        float nearFade = smoothstep(5.0, 18.0, vViewDist);
        float farFade = 1.0 - smoothstep(1800.0, 4200.0, vViewDist);
        float alpha = clamp(shape * lifeFade * nearFade * farFade * 0.78, 0.0, 0.85);
        if (alpha < 0.015) discard;

        vec3 jetCol = vec3(0.88, 0.97, 1.0);
        vec3 thermalCol = vec3(1.0, 0.91, 0.68);
        vec3 draftCol = vec3(0.82, 0.99, 0.96);
        vec3 col = vKind > 1.5 ? draftCol : (vKind > 0.5 ? thermalCol : jetCol);

        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  const windStreakMesh = new THREE.Mesh(windStreakGeo, windStreakMaterial);
  windStreakMesh.frustumCulled = false;
  windStreakMesh.renderOrder = 5;
  scene.add(windStreakMesh);
  disposables.push(windStreakGeo, windStreakMaterial);

  return {
    skyMaterial: skyMat,
    cloudMaterial: cloudMat,
    cloudShadowUniforms,
    oceanMesh,
    oceanMaterial,
    oceanCubeCamera,
    oceanRenderTarget,
    cloudClusters,
    windCurrents,
    windRibbonMaterial,
    windStreakMaterial,
    narrowPillars,
    pirateShips,
    destructibleBuildings,
    destructibleTrees,
    hangingRoostSpots,
    palmTrunkInst,
    palmCrownInst,
    hideTree,
    banners: allBanners,
    sanctuaryBeacon,
    sanctuaryRing,
    sanctuaryDragonPerch: new THREE.Vector3(-640, sanctuaryY + 6.8, 580),
    hideSoldiersForBuilding,
    getWalkableGroundHeight,
    updateCitizens,
    deformTerrain,
    dispose: () => {
      activeTerrainDeltas = null;
      disposables.forEach((d) => d.dispose());
    },
  };
}
