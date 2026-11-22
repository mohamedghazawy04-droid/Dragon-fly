import * as THREE from 'three';
import {
  createDragonEyeTexture,
  createDragonScaleMaps,
  createDragonWingMembraneMaps,
} from './textures';
import { DragonSpec } from './types';

export interface DragonRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  neckGroup: THREE.Group;
  headGroup: THREE.Group;
  jawGroup: THREE.Group;
  mouthOrigin: THREE.Object3D;
  leftWingInner: THREE.Group;
  leftWingOuter: THREE.Group;
  rightWingInner: THREE.Group;
  rightWingOuter: THREE.Group;
  leftWingTip: THREE.Object3D;
  rightWingTip: THREE.Object3D;
  leftHindLeg: THREE.Group;
  rightHindLeg: THREE.Group;
  leftHindFoot: THREE.Group;
  rightHindFoot: THREE.Group;
  tailSegments: THREE.Group[];
  riderCameraAnchor: THREE.Object3D;
  riderBodyGroup: THREE.Group;
  capeMesh: THREE.Mesh;
  leftHandGroup: THREE.Group;
  swordArmGroup: THREE.Group;
  leftReinStrap: THREE.Mesh;
  rightReinStrap: THREE.Mesh;
  swordBladeMat: THREE.MeshPhysicalMaterial;
  auraLight: THREE.PointLight;
  setFrozen: (frozen: boolean) => void;
  setLightningReflection: (
    intensity: number,
    dirWorld?: THREE.Vector3,
    colorHex?: number,
  ) => void;
  setFusionGlow: (intensity: number, colorHex?: number) => void;
  setDamageScars: (severity: number, timeSec: number) => void;
  dispose: () => void;
}

/**
 * Builds a cambered, scalloped bat-dragon wing membrane between radial wing-bone points.
 */
function createScallopedWingMembrane(
  anchor: [number, number, number],
  leadingEdge: [number, number, number],
  fingerTips: [number, number, number][],
  camberHeight: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];

  const ring: [number, number, number][] = [leadingEdge, ...fingerTips];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = anchor;
    const b = ring[i];
    const c = ring[i + 1];
    // Add cambered midpoint for realistic inflated wing airfoil curvature
    const midBC: [number, number, number] = [
      (b[0] + c[0]) * 0.5,
      (b[1] + c[1]) * 0.5 + camberHeight * 0.35,
      (b[2] + c[2]) * 0.5 - 0.38,
    ];
    const midAB: [number, number, number] = [
      (a[0] + b[0]) * 0.5,
      (a[1] + b[1]) * 0.5 + camberHeight,
      (a[2] + b[2]) * 0.5,
    ];
    const midAC: [number, number, number] = [
      (a[0] + c[0]) * 0.5,
      (a[1] + c[1]) * 0.5 + camberHeight,
      (a[2] + c[2]) * 0.5,
    ];

    const pushTri = (
      p1: [number, number, number],
      p2: [number, number, number],
      p3: [number, number, number],
      u1: number,
      v1: number,
      u2: number,
      v2: number,
      u3: number,
      v3: number,
    ) => {
      positions.push(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2]);
      uvs.push(u1, v1, u2, v2, u3, v3);
    };

    const t0 = i / (ring.length - 1);
    const t1 = (i + 1) / (ring.length - 1);
    const tm = (t0 + t1) * 0.5;
    pushTri(a, midAB, midAC, 0, 0.5, 0.5, t0, 0.5, t1);
    pushTri(midAB, b, midBC, 0.5, t0, 1, t0, 0.92, tm);
    pushTri(midAB, midBC, midAC, 0.5, t0, 0.92, tm, 0.5, t1);
    pushTri(midAC, midBC, c, 0.5, t1, 0.92, tm, 1, t1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Curved dorsal talon-spine shape extruded with bevels for dragon back & tail crests.
 */
function createDorsalSpineGeometry(height: number, width: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-width * 0.45, 0);
  shape.quadraticCurveTo(-width * 0.1, height * 0.65, width * 0.55, height);
  shape.quadraticCurveTo(width * 0.35, height * 0.42, width * 0.45, 0);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.035,
    bevelSegments: 2,
  });
  geo.center();
  geo.rotateY(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpted anatomical dragon cranium & snout using beveled ExtrudeGeometry profile.
 */
function createSculptedCraniumGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  // Side profile (X = forward length, Y = height)
  shape.moveTo(0.85, -0.35); // back base of skull
  shape.lineTo(0.78, 0.62); // crown crest
  shape.quadraticCurveTo(0.15, 0.72, -0.55, 0.48); // brow bridge
  shape.quadraticCurveTo(-1.35, 0.36, -2.35, 0.22); // nasal ridge
  shape.quadraticCurveTo(-2.62, 0.12, -2.55, -0.22); // snout tip
  shape.lineTo(-0.55, -0.28); // upper tooth gumline
  shape.quadraticCurveTo(0.35, -0.38, 0.85, -0.35);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 2,
    depth: 0.88,
    bevelEnabled: true,
    bevelThickness: 0.24,
    bevelSize: 0.18,
    bevelSegments: 3,
  });
  geo.translate(0, 0, -0.44);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpted tapered lower mandible jawbone.
 */
function createMandibleGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0.35, 0.14);
  shape.lineTo(-2.15, 0.06);
  shape.quadraticCurveTo(-2.3, -0.14, -1.9, -0.24);
  shape.quadraticCurveTo(-0.7, -0.32, 0.42, -0.18);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: 0.66,
    bevelEnabled: true,
    bevelThickness: 0.16,
    bevelSize: 0.12,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -0.33);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a tapered horn along a 3D Catmull-Rom curve with organic narrowing radius.
 */
function createTaperedHornGeometry(
  points: THREE.Vector3[],
  baseRadius: number,
  tipRadius: number,
  tubularSegments = 16,
  radialSegments = 8,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, tubularSegments, baseRadius, radialSegments, false);
  const pos = geo.attributes.position;
  const center = new THREE.Vector3();
  const v = new THREE.Vector3();

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    curve.getPointAt(t, center);
    const scale = THREE.MathUtils.lerp(1.0, tipRadius / baseRadius, Math.pow(t, 0.72));
    for (let j = 0; j <= radialSegments; j++) {
      const idx = i * (radialSegments + 1) + j;
      if (idx < pos.count) {
        v.fromBufferAttribute(pos, idx).sub(center).multiplyScalar(scale).add(center);
        pos.setXYZ(idx, v.x, v.y, v.z);
      }
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Detached falling armored knight rider spawned when an enemy/ally dragon is defeated mid-air.
 */
export function createFallingRiderMesh(team: 'ally' | 'enemy'): THREE.Group {
  const rider = new THREE.Group();
  const armorMat = new THREE.MeshStandardMaterial({
    color: team === 'ally' ? 0x3b485e : 0x262126,
    roughness: 0.28,
    metalness: 0.85,
  });
  const capeMat = new THREE.MeshStandardMaterial({
    color: team === 'ally' ? 0x1d4ed8 : 0x991b1b,
    roughness: 0.78,
    side: THREE.DoubleSide,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xd49b35,
    roughness: 0.25,
    metalness: 0.9,
  });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.56, 6, 10), armorMat);
  torso.castShadow = true;
  rider.add(torso);

  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), armorMat);
  helm.position.set(0, 0.62, 0);
  helm.castShadow = true;
  rider.add(helm);

  const crest = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 6), trimMat);
  crest.position.set(0, 0.84, 0.05);
  crest.rotation.x = -0.35;
  rider.add(crest);

  const limbGeo = new THREE.CapsuleGeometry(0.09, 0.55, 4, 8);
  [-0.36, 0.36].forEach((ax) => {
    const arm = new THREE.Mesh(limbGeo, armorMat);
    arm.position.set(ax, 0.22, 0);
    arm.rotation.z = ax > 0 ? -0.9 : 0.9;
    rider.add(arm);

    const leg = new THREE.Mesh(limbGeo, armorMat);
    leg.position.set(ax * 0.5, -0.58, 0);
    leg.rotation.z = ax > 0 ? -0.25 : 0.25;
    rider.add(leg);
  });

  const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.45, 3, 4), capeMat);
  cape.position.set(0, 0.1, 0.32);
  cape.rotation.x = 0.45;
  rider.add(cape);

  return rider;
}

export interface ArticulatedRiderRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  cape: THREE.Mesh;
  swordMesh: THREE.Mesh;
  dispose: () => void;
}

/**
 * Full-scale articulated Dragon Knight rig (feet at y = 0, facing -Z)
 * used for skydiving freefalls, ocean splashdowns, and walking through castles & palaces.
 */
export function createArticulatedRiderRig(): ArticulatedRiderRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const armorMat = new THREE.MeshPhysicalMaterial({
    color: 0x3b485e,
    roughness: 0.28,
    metalness: 0.85,
    clearcoat: 0.35,
  });
  const clothMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.82,
  });
  const capeMat = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    roughness: 0.72,
    side: THREE.DoubleSide,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xd49b35,
    roughness: 0.24,
    metalness: 0.9,
  });
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0xdbeafe,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.25,
    roughness: 0.14,
    metalness: 0.94,
  });

  // Legs (hips at y = 1.05, boots touching y = 0)
  const buildLeg = (xOff: number) => {
    const leg = new THREE.Group();
    leg.position.set(xOff, 1.05, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.56, 5, 8), clothMat);
    thigh.position.set(0, -0.38, 0);
    thigh.castShadow = true;
    leg.add(thigh);
    const greave = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.36, 5, 8), armorMat);
    greave.position.set(0, -0.78, 0);
    greave.castShadow = true;
    leg.add(greave);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.38), armorMat);
    boot.position.set(0, -0.97, -0.06);
    boot.castShadow = true;
    leg.add(boot);
    bodyPivot.add(leg);
    return leg;
  };
  const leftLeg = buildLeg(-0.2);
  const rightLeg = buildLeg(0.2);

  // Armored Breastplate & Belt
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.62, 6, 12), armorMat);
  torso.position.set(0, 1.48, 0);
  torso.scale.set(1.12, 1.0, 0.84);
  torso.castShadow = true;
  bodyPivot.add(torso);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.35, 0.15, 12), goldMat);
  belt.position.set(0, 1.09, 0);
  belt.scale.set(1.06, 1, 0.85);
  bodyPivot.add(belt);

  // Shoulder Pauldrons
  [-0.44, 0.44].forEach((px) => {
    const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), armorMat);
    pauldron.position.set(px, 1.88, 0);
    pauldron.scale.set(1.15, 0.85, 1.0);
    pauldron.castShadow = true;
    bodyPivot.add(pauldron);
  });

  // Crested Knight Helmet
  const head = new THREE.Group();
  head.position.set(0, 2.08, 0);
  bodyPivot.add(head);

  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), armorMat);
  helm.position.set(0, 0.14, 0);
  helm.castShadow = true;
  head.add(helm);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.12), clothMat);
  visor.position.set(0, 0.14, -0.2);
  head.add(visor);

  const crest = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.34, 6), goldMat);
  crest.position.set(0, 0.4, 0.06);
  crest.rotation.x = -0.35;
  crest.castShadow = true;
  head.add(crest);

  // Articulated Left & Right Arms with Gauntlets, Fingers & Faceted Broadsword
  const buildArm = (xOff: number, withSword: boolean) => {
    const arm = new THREE.Group();
    arm.position.set(xOff, 1.84, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.28, 5, 8), clothMat);
    upper.position.set(0, -0.18, 0);
    upper.castShadow = true;
    arm.add(upper);

    const vambrace = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.082, 0.34, 8), armorMat);
    vambrace.position.set(0, -0.48, -0.04);
    vambrace.rotation.x = 0.12;
    vambrace.castShadow = true;
    arm.add(vambrace);

    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 0.14), armorMat);
    palm.position.set(0, -0.68, -0.07);
    arm.add(palm);

    for (let f = 0; f < 4; f++) {
      const knuckle = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.07, 4, 6), armorMat);
      knuckle.rotation.x = Math.PI / 2;
      knuckle.position.set(-0.036 + f * 0.024, -0.72, -0.14);
      arm.add(knuckle);
    }

    let swordMesh!: THREE.Mesh;
    if (withSword) {
      const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.3, 8), goldMat);
      hilt.rotation.x = Math.PI / 2;
      hilt.position.set(0, -0.71, -0.12);
      arm.add(hilt);

      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.045, 0.055), goldMat);
      guard.position.set(0, -0.71, -0.26);
      arm.add(guard);

      swordMesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.095, 1.48), bladeMat);
      swordMesh.position.set(0, -0.71, -1.02);
      swordMesh.castShadow = true;
      arm.add(swordMesh);
    }
    bodyPivot.add(arm);
    return { arm, swordMesh };
  };
  const leftArm = buildArm(-0.46, false).arm;
  const rightArmBuilt = buildArm(0.46, true);

  // Flowing Scarlet Cape anchored at upper back
  const capeGeo = new THREE.PlaneGeometry(0.92, 1.55, 4, 6);
  capeGeo.translate(0, -0.77, 0);
  const cape = new THREE.Mesh(capeGeo, capeMat);
  cape.position.set(0, 1.86, 0.24);
  cape.rotation.x = 0.22;
  cape.castShadow = true;
  bodyPivot.add(cape);

  const dispose = () => {
    armorMat.dispose();
    clothMat.dispose();
    capeMat.dispose();
    goldMat.dispose();
    bladeMat.dispose();
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });
  };

  return {
    root,
    bodyPivot,
    head,
    leftArm,
    rightArm: rightArmBuilt.arm,
    leftLeg,
    rightLeg,
    cape,
    swordMesh: rightArmBuilt.swordMesh,
    dispose,
  };
}

export function createDragonRig(
  spec: DragonSpec,
  maxAnisotropy: number,
  isPlayer: boolean,
  team: 'ally' | 'enemy' = 'ally',
): DragonRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const scaleMaps = createDragonScaleMaps(
    spec.primaryColor,
    spec.secondaryColor,
    maxAnisotropy,
  );
  const wingMaps = createDragonWingMembraneMaps(spec.membraneColor, maxAnisotropy);
  const eyeTex = createDragonEyeTexture(spec.eyeColor, maxAnisotropy);

  const lightningUniforms = {
    uLightningReflect: { value: 0 },
    uLightningColor: { value: new THREE.Color(0xcceeff) },
    uLightningDir: { value: new THREE.Vector3(0.4, 0.85, -0.3).normalize() },
    uFusionAura: { value: 0 },
    uFusionColor: { value: new THREE.Color(0xffb84d) },
    uDamageSeverity: { value: 0 },
    uScarTime: { value: 0 },
    uScarCoreColor: {
      value: new THREE.Color(spec.element === 'ice' ? 0xff3b5c : 0xff2a00),
    },
    uScarEdgeColor: {
      value: new THREE.Color(spec.element === 'ice' ? 0x7dd3fc : 0xffaa2b),
    },
  };

  const applyLightningReflectionShader = (mat: THREE.MeshPhysicalMaterial, gain: number) => {
    mat.customProgramCacheKey = () => `dragon-skin-v3-${gain}`;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uLightningReflect = lightningUniforms.uLightningReflect;
      shader.uniforms.uLightningColor = lightningUniforms.uLightningColor;
      shader.uniforms.uLightningDir = lightningUniforms.uLightningDir;
      shader.uniforms.uFusionAura = lightningUniforms.uFusionAura;
      shader.uniforms.uFusionColor = lightningUniforms.uFusionColor;
      shader.uniforms.uDamageSeverity = lightningUniforms.uDamageSeverity;
      shader.uniforms.uScarTime = lightningUniforms.uScarTime;
      shader.uniforms.uScarCoreColor = lightningUniforms.uScarCoreColor;
      shader.uniforms.uScarEdgeColor = lightningUniforms.uScarEdgeColor;

      shader.vertexShader = `varying vec3 vScarPos;\n` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vScarPos = position;
        `,
      );

      shader.fragmentShader =
        `uniform float uLightningReflect;
uniform vec3 uLightningColor;
uniform vec3 uLightningDir;
uniform float uFusionAura;
uniform vec3 uFusionColor;
uniform float uDamageSeverity;
uniform float uScarTime;
uniform vec3 uScarCoreColor;
uniform vec3 uScarEdgeColor;
varying vec3 vScarPos;

vec3 scarHash3(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  );
  return fract(sin(p) * 43758.5453123);
}

float scarVoronoiEdge(vec3 x) {
  vec3 n = floor(x);
  vec3 f = fract(x);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int k = -1; k <= 1; k++) {
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec3 g = vec3(float(i), float(j), float(k));
        vec3 o = scarHash3(n + g);
        vec3 r = g + (0.18 + 0.64 * o) - f;
        float d = dot(r, r);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) {
          d2 = d;
        }
      }
    }
  }
  return sqrt(d2) - sqrt(d1);
}

void evalDragonDamageScars(vec3 p, float sev, float tSec, out float charMask, out float glowMask) {
  charMask = 0.0;
  glowMask = 0.0;
  if (sev <= 0.01) return;

  // Organic domain warp so fissures follow musculature & scale seams
  vec3 warp = vec3(
    sin(p.y * 2.3 + p.z * 1.4),
    cos(p.z * 2.1 - p.x * 1.6),
    sin(p.x * 2.5 + p.y * 1.3)
  ) * 0.24;
  vec3 sp = p * 1.32 + warp;

  // 1. Voronoi tectonic fissures spreading with damage severity
  float vEdge = scarVoronoiEdge(sp);
  float cellPick = fract(sin(dot(floor(sp * 0.55), vec3(12.9898, 78.233, 45.164))) * 43758.5453);
  float cellSpread = smoothstep(0.05, 0.85, sev * 1.25 - cellPick * 0.58);
  float crackWidth = mix(0.035, 0.145, sev);
  float crackCore = (1.0 - smoothstep(0.0, crackWidth, vEdge)) * cellSpread;
  float crackChar = (1.0 - smoothstep(crackWidth * 0.6, crackWidth * 2.4, vEdge)) * cellSpread;

  // 2. Jagged claw / sword battle slashes across flanks, chest & wing membranes
  float slashWaveA = abs(sin((p.x * 1.9 + p.y * 1.5 + sin(p.z * 2.7) * 0.65) * 1.45));
  float slashWaveB = abs(sin((p.z * 1.7 - p.y * 2.1 + cos(p.x * 2.4) * 0.55) * 1.3));
  float patchMask = smoothstep(0.22, 0.78, sin(p.x * 0.95 + 1.2) * cos(p.z * 0.85 - 0.5) * 0.5 + 0.5);
  float slashReveal = smoothstep(0.06, 0.52, sev);
  float slashCore = (1.0 - smoothstep(0.0, mix(0.04, 0.11, sev), min(slashWaveA, slashWaveB))) * patchMask * slashReveal;
  float slashChar = (1.0 - smoothstep(0.05, 0.22, min(slashWaveA, slashWaveB))) * patchMask * slashReveal;

  float combinedCore = clamp(max(crackCore, slashCore * 0.92), 0.0, 1.0);
  charMask = clamp(max(crackChar, slashChar * 0.85), 0.0, 1.0);

  // Urgent rhythmic heartbeat / molten ember pulse when critically wounded
  float pulseRate = 3.8 + sev * 8.5;
  float pulse = 0.66 + 0.34 * sin(tSec * pulseRate - length(p) * 0.55);
  glowMask = combinedCore * (0.45 + 0.95 * sev) * pulse;
}
` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        float _scarChar = 0.0;
        float _scarGlow = 0.0;
        if (uDamageSeverity > 0.01) {
          evalDragonDamageScars(vScarPos, uDamageSeverity, uScarTime, _scarChar, _scarGlow);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.02, 0.018), _scarChar * (0.55 + uDamageSeverity * 0.35));
        }
        `,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
        if (uLightningReflect > 0.002 || uFusionAura > 0.002 || uDamageSeverity > 0.01) {
          vec3 lViewDir = normalize(vViewPosition);
          vec3 lSurfN = normalize(normal);
          float lFresnel = pow(1.0 - clamp(abs(dot(lViewDir, lSurfN)), 0.0, 1.0), 2.2);
          if (uLightningReflect > 0.002) {
            vec3 lDirView = normalize((viewMatrix * vec4(uLightningDir, 0.0)).xyz);
            vec3 lHalf = normalize(lDirView + lViewDir);
            float lSpec = pow(max(dot(lSurfN, lHalf), 0.0), 40.0);
            float lWrap = max(dot(lSurfN, lDirView) * 0.55 + 0.45, 0.0);
            outgoingLight += uLightningColor * uLightningReflect * ${gain.toFixed(2)} * (lFresnel * 1.45 + lSpec * 1.95 + lWrap * 0.25);
          }
          if (uFusionAura > 0.002) {
            outgoingLight += uFusionColor * uFusionAura * ${gain.toFixed(2)} * (lFresnel * 1.65 + 0.16);
          }
          if (uDamageSeverity > 0.01 && _scarGlow > 0.002) {
            vec3 crackCol = mix(uScarCoreColor, uScarEdgeColor, smoothstep(0.35, 1.15, _scarGlow));
            outgoingLight += crackCol * (_scarGlow * (1.8 + uDamageSeverity * 2.2) * ${gain.toFixed(2)});
          }
        }
        #include <opaque_fragment>
        `,
      );
    };
  };

  // Ultra PBR Dragon Scale Material with normal relief, clearcoat, subtle iridescence & lightning reflections
  const primaryMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: scaleMaps.map,
    normalMap: scaleMaps.normalMap,
    normalScale: new THREE.Vector2(1.65, 1.65),
    roughnessMap: scaleMaps.roughnessMap,
    roughness: 0.68,
    metalness: 0.18,
    clearcoat: 0.34,
    clearcoatRoughness: 0.32,
    iridescence: 0.26,
    iridescenceIOR: 1.38,
  });
  applyLightningReflectionShader(primaryMat, 1.0);

  const armorMat = new THREE.MeshPhysicalMaterial({
    color: spec.secondaryColor,
    normalMap: scaleMaps.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.26,
    metalness: 0.74,
    clearcoat: 0.4,
    clearcoatRoughness: 0.24,
  });
  applyLightningReflectionShader(armorMat, 1.25);

  const bellyMat = new THREE.MeshPhysicalMaterial({
    color: spec.bellyColor,
    normalMap: scaleMaps.normalMap,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughness: 0.58,
    metalness: 0.12,
    clearcoat: 0.14,
  });
  applyLightningReflectionShader(bellyMat, 0.9);

  const membraneMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: wingMaps.map,
    normalMap: wingMaps.normalMap,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughnessMap: wingMaps.roughnessMap,
    roughness: 0.52,
    metalness: 0.04,
    sheen: 0.45,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(spec.membraneColor),
    clearcoat: 0.24,
    clearcoatRoughness: 0.48,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.96,
  });
  applyLightningReflectionShader(membraneMat, 0.82);

  const eyeMat = new THREE.MeshStandardMaterial({
    map: eyeTex,
    emissive: spec.eyeColor,
    emissiveMap: eyeTex,
    emissiveIntensity: 1.65,
    roughness: 0.08,
    metalness: 0.1,
  });

  const fangMat = new THREE.MeshStandardMaterial({
    color: 0xeae2cf,
    roughness: 0.25,
    metalness: 0.06,
  });

  const clawMat = new THREE.MeshStandardMaterial({
    color: 0x161418,
    roughness: 0.22,
    metalness: 0.65,
  });

  // 1. Anatomically Sculpted Muscular Dragon Torso (Deep Pectoral Chest -> Lean Waist -> Pelvic Haunches)
  const torsoProfile = [
    new THREE.Vector2(0.01, -4.85), // neck base blend
    new THREE.Vector2(1.22, -3.55), // broad chest sternum
    new THREE.Vector2(2.04, -2.05), // deep ribcage / pectorals
    new THREE.Vector2(2.26, -0.65), // mid-thorax
    new THREE.Vector2(1.86, 0.95), // athletic tapered waist
    new THREE.Vector2(1.62, 2.25), // pelvic haunches
    new THREE.Vector2(1.12, 3.55), // tail root
    new THREE.Vector2(0.01, 4.35),
  ];
  const torsoGeo = new THREE.LatheGeometry(torsoProfile, 28);
  torsoGeo.rotateX(Math.PI / 2);
  torsoGeo.scale(0.94, 0.92, 1);
  torsoGeo.computeVertexNormals();
  const torsoMesh = new THREE.Mesh(torsoGeo, primaryMat);
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  bodyGroup.add(torsoMesh);

  // Sculpted Pectoral Chest Keel
  const chestKeelGeo = new THREE.CapsuleGeometry(0.95, 2.2, 8, 14);
  chestKeelGeo.rotateX(Math.PI / 2 + 0.18);
  const chestKeel = new THREE.Mesh(chestKeelGeo, bellyMat);
  chestKeel.position.set(0, -1.08, -1.55);
  chestKeel.scale.set(1.08, 0.64, 1.0);
  chestKeel.castShadow = true;
  bodyGroup.add(chestKeel);

  // 12 Segmented Overlapping Ventral Belly Scute Plates
  const scuteGeo = new THREE.CylinderGeometry(1.18, 1.06, 0.56, 12, 1, false, -Math.PI * 0.45, Math.PI * 0.9);
  scuteGeo.rotateX(Math.PI / 2);
  scuteGeo.rotateZ(Math.PI);
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    const scute = new THREE.Mesh(scuteGeo, bellyMat);
    const scaleW = 1.05 - Math.abs(t - 0.35) * 0.48;
    scute.position.set(0, -0.78 - Math.sin(t * Math.PI) * 0.25, -2.9 + i * 0.62);
    scute.scale.set(scaleW, 0.46, 1.05);
    scute.rotation.x = 0.12;
    bodyGroup.add(scute);
  }

  // Swept Curved Dorsal Spine Fins along Back (ExtrudeGeometry)
  const spineGeo = createDorsalSpineGeometry(1.22, 0.68);
  for (let i = 0; i < 10; i++) {
    const spike = new THREE.Mesh(spineGeo, armorMat);
    const s = 1.12 - i * 0.065;
    spike.position.set(0, 1.72 - i * 0.08, -3.1 + i * 0.72);
    spike.scale.set(s, s, s);
    spike.castShadow = true;
    bodyGroup.add(spike);
  }

  // Sculpted Shoulder Deltoid & Scapula Armor Plates
  const shoulderGeo = new THREE.CapsuleGeometry(0.75, 1.35, 8, 12);
  shoulderGeo.rotateX(Math.PI / 2);
  [-1.38, 1.38].forEach((sx) => {
    const sh = new THREE.Mesh(shoulderGeo, primaryMat);
    sh.position.set(sx, 0.78, -2.05);
    sh.rotation.z = sx > 0 ? -0.45 : 0.45;
    sh.rotation.y = sx > 0 ? -0.18 : 0.18;
    sh.scale.set(0.85, 0.72, 1.15);
    sh.castShadow = true;
    bodyGroup.add(sh);
  });

  // 2. Anatomically Articulated Digitigrade Hind Legs, Elevated Knees & Forward-Planted 3-Toed Taloned Feet
  // Total standing clearance from bodyGroup origin to bottom of foot soles = 4.00m
  // (Thigh angles forward to elevated knee -> shin angles back to raised hock -> vertical metatarsus -> flat forward foot!)
  const legUpAxis = new THREE.Vector3(0, 1, 0);
  const orientMeshSegment = (
    mesh: THREE.Mesh,
    fromPt: THREE.Vector3,
    toPt: THREE.Vector3,
  ) => {
    mesh.position.addVectors(fromPt, toPt).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(toPt, fromPt).normalize();
    mesh.quaternion.setFromUnitVectors(legUpAxis, dir);
  };

  const buildHindLeg = (side: -1 | 1): { leg: THREE.Group; foot: THREE.Group } => {
    const leg = new THREE.Group();
    leg.position.set(side * 1.38, -0.34, 1.24);
    bodyGroup.add(leg);

    const hipAnchor = new THREE.Vector3(side * 0.04, 0, 0);
    // Knee stays HIGH under flank (y = -1.04 in leg space -> 2.62m above ground when standing!) and points FORWARD (-Z)
    const kneePt = new THREE.Vector3(side * 0.18, -1.04, -0.64);
    // Hock / upper ankle sits behind center (z = +0.26) well above earth
    const hockPt = new THREE.Vector3(side * 0.22, -2.52, 0.26);
    // Ankle-to-foot joint drops cleanly to foot pivot
    const footPivotPt = new THREE.Vector3(side * 0.24, -3.48, -0.02);

    // Muscular Upper Thigh (Hip -> Elevated Knee)
    const thighLen = hipAnchor.distanceTo(kneePt);
    const thighGeo = new THREE.CapsuleGeometry(0.62, Math.max(0.25, thighLen - 0.62), 8, 12);
    const thigh = new THREE.Mesh(thighGeo, primaryMat);
    orientMeshSegment(thigh, hipAnchor, kneePt);
    thigh.scale.set(0.92, 1.0, 1.12);
    thigh.castShadow = true;
    leg.add(thigh);

    // Armored Knee Plate & Forward Knee Spur
    const kneeArmor = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), armorMat);
    kneeArmor.position.copy(kneePt);
    kneeArmor.scale.set(0.92, 1.12, 1.08);
    kneeArmor.castShadow = true;
    leg.add(kneeArmor);

    // Sculpted Shin / Crus (Elevated Knee -> Raised Hock)
    const shinLen = kneePt.distanceTo(hockPt);
    const shinGeo = new THREE.CapsuleGeometry(0.36, Math.max(0.25, shinLen - 0.36), 6, 10);
    const shin = new THREE.Mesh(shinGeo, primaryMat);
    orientMeshSegment(shin, kneePt, hockPt);
    shin.castShadow = true;
    leg.add(shin);

    // Raised Hock Armor Cuff & Back Spur
    const hockCuff = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.09, 6, 12), armorMat);
    hockCuff.position.copy(hockPt);
    hockCuff.rotation.x = Math.PI / 2;
    leg.add(hockCuff);

    const hockSpur = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.42, 6), clawMat);
    hockSpur.position.set(hockPt.x, hockPt.y + 0.06, hockPt.z + 0.36);
    hockSpur.rotation.x = Math.PI / 2.2;
    leg.add(hockSpur);

    // Upright Metatarsus Column (Raised Hock -> Planted Foot Pivot)
    const metaLen = hockPt.distanceTo(footPivotPt);
    const metaGeo = new THREE.CapsuleGeometry(0.25, Math.max(0.2, metaLen - 0.25), 6, 10);
    const metatarsus = new THREE.Mesh(metaGeo, bellyMat);
    orientMeshSegment(metatarsus, hockPt, footPivotPt);
    metatarsus.castShadow = true;
    leg.add(metatarsus);

    // Articulated Foot Group (pivots to keep toes & talons flush on ground or thrusting forward in aerial clash!)
    const foot = new THREE.Group();
    foot.position.copy(footPivotPt);
    leg.add(foot);

    // Armored Ankle Ring & Broad Foot Sole Pad (bottom of sole rests at y = -0.18 -> total clearance = 4.00m)
    const ankleCollar = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.08, 6, 12), armorMat);
    ankleCollar.rotation.x = Math.PI / 2;
    ankleCollar.position.set(0, 0.02, 0);
    foot.add(ankleCollar);

    const footPad = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 0.24, 10), bellyMat);
    footPad.position.set(0, -0.06, -0.08);
    footPad.scale.set(1.18, 1.0, 1.32);
    footPad.castShadow = true;
    foot.add(footPad);

    // 3 Large Splayed Forward-Pointing (-Z) Reptilian Toes + Curved Obsidian Talons
    [-0.38, 0, 0.38].forEach((spreadYaw, idx) => {
      const toeReach = idx === 1 ? 1.05 : 0.88;
      const sinT = Math.sin(spreadYaw);
      const cosT = Math.cos(spreadYaw);

      const toeStart = new THREE.Vector3(sinT * 0.14, -0.07, -0.14 * cosT);
      const toeEnd = new THREE.Vector3(sinT * toeReach, -0.11, -toeReach * cosT);
      const toeLen = toeStart.distanceTo(toeEnd);

      const toe = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.14, Math.max(0.18, toeLen - 0.14), 5, 8),
        primaryMat,
      );
      orientMeshSegment(toe, toeStart, toeEnd);
      toe.castShadow = true;
      foot.add(toe);

      const talonStart = toeEnd;
      const talonEnd = new THREE.Vector3(
        sinT * (toeReach + 0.56),
        -0.18,
        -(toeReach + 0.56) * cosT,
      );
      const talonLen = talonStart.distanceTo(talonEnd);
      const talon = new THREE.Mesh(new THREE.ConeGeometry(0.12, talonLen, 7), clawMat);
      orientMeshSegment(talon, talonStart, talonEnd);
      talon.castShadow = true;
      foot.add(talon);
    });

    // Rear Hallux / Heel Brace Claw (+Z)
    const rearToeStart = new THREE.Vector3(0, -0.07, 0.12);
    const rearToeEnd = new THREE.Vector3(0, -0.14, 0.58);
    const rearTalon = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, rearToeStart.distanceTo(rearToeEnd), 6),
      clawMat,
    );
    orientMeshSegment(rearTalon, rearToeStart, rearToeEnd);
    rearTalon.castShadow = true;
    foot.add(rearTalon);

    return { leg, foot };
  };
  const leftHind = buildHindLeg(-1);
  const rightHind = buildHindLeg(1);
  const leftHindLeg = leftHind.leg;
  const rightHindLeg = rightHind.leg;
  const leftHindFoot = leftHind.foot;
  const rightHindFoot = rightHind.foot;

  // Saddle & Forged Brass Pommel
  const leatherMat = new THREE.MeshStandardMaterial({
    color: 0x3b2214,
    roughness: 0.72,
    metalness: 0.14,
  });
  const saddle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 1.1, 1.85, 12, 1, false, -Math.PI * 0.4, Math.PI * 0.8),
    leatherMat,
  );
  saddle.rotation.x = Math.PI / 2;
  saddle.rotation.z = Math.PI;
  saddle.position.set(0, 1.35, -0.45);
  saddle.scale.set(1.1, 0.55, 1);
  bodyGroup.add(saddle);

  const pommel = new THREE.Mesh(
    new THREE.TorusGeometry(0.46, 0.1, 8, 16, Math.PI),
    armorMat,
  );
  pommel.position.set(0, 1.78, -1.3);
  bodyGroup.add(pommel);

  // First-person Rider Camera Anchor
  const riderCameraAnchor = new THREE.Object3D();
  riderCameraAnchor.position.set(0, 3.08, 0.25);
  bodyGroup.add(riderCameraAnchor);

  // 3. Detailed Armored Dragon Rider (visible on AI dragons & in 3rd-person Full Dragon View!)
  const gauntletMat = new THREE.MeshPhysicalMaterial({
    color: isPlayer ? 0x2c3647 : team === 'enemy' ? 0x241d22 : 0x26354d,
    roughness: 0.22,
    metalness: 0.9,
    clearcoat: 0.45,
    clearcoatRoughness: 0.2,
  });
  const chainmailMat = new THREE.MeshStandardMaterial({
    color: 0x3b4252,
    roughness: 0.44,
    metalness: 0.82,
  });
  const hiltMat = new THREE.MeshPhysicalMaterial({
    color: 0xd9a23b,
    roughness: 0.2,
    metalness: 0.94,
    clearcoat: 0.35,
  });
  const bladeMat = new THREE.MeshPhysicalMaterial({
    color: 0xeaf2fa,
    emissive: 0x1e293b,
    emissiveIntensity: 0.08,
    roughness: 0.09,
    metalness: 0.98,
    clearcoat: 0.55,
    clearcoatRoughness: 0.12,
  });
  const capeMat = new THREE.MeshStandardMaterial({
    color: isPlayer ? 0x991b1b : team === 'enemy' ? 0x7f1d1d : 0x1e40af,
    roughness: 0.78,
    side: THREE.DoubleSide,
  });

  const riderBodyGroup = new THREE.Group();
  riderBodyGroup.position.set(0, 1.68, -0.38);
  riderBodyGroup.visible = !isPlayer;
  bodyGroup.add(riderBodyGroup);

  // Sculpted Knight Breastplate & Waist
  const breastplateGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.01, -0.1),
      new THREE.Vector2(0.28, 0.05),
      new THREE.Vector2(0.36, 0.55),
      new THREE.Vector2(0.32, 0.88),
      new THREE.Vector2(0.01, 0.96),
    ],
    14,
  );
  const riderTorso = new THREE.Mesh(breastplateGeo, gauntletMat);
  riderTorso.position.set(0, 0.08, 0);
  riderTorso.rotation.x = 0.24;
  riderTorso.scale.set(1.15, 1, 0.82);
  riderTorso.castShadow = true;
  riderBodyGroup.add(riderTorso);

  // Layered Pauldrons
  [-0.44, 0.44].forEach((px) => {
    const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), armorMat);
    pauldron.scale.set(1.15, 0.75, 1.25);
    pauldron.position.set(px, 0.88, -0.06);
    pauldron.rotation.z = px > 0 ? -0.35 : 0.35;
    pauldron.castShadow = true;
    riderBodyGroup.add(pauldron);
  });

  // Visored Knight Helm
  const riderHead = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), gauntletMat);
  riderHead.position.set(0, 1.24, -0.16);
  riderHead.scale.set(0.92, 1.08, 1.05);
  riderHead.castShadow = true;
  riderBodyGroup.add(riderHead);

  const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.16, 8), armorMat);
  visor.position.set(0, 1.21, -0.24);
  visor.rotation.x = 0.2;
  riderBodyGroup.add(visor);

  const helmetCrest = new THREE.Mesh(createDorsalSpineGeometry(0.42, 0.24), hiltMat);
  helmetCrest.position.set(0, 1.48, -0.04);
  helmetCrest.rotation.x = -0.35;
  riderBodyGroup.add(helmetCrest);

  // Seated Armored Knight Thighs gripping the saddle
  [-0.58, 0.58].forEach((lx) => {
    const rThigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.55, 6, 8), gauntletMat);
    rThigh.position.set(lx, 0.08, -0.16);
    rThigh.rotation.z = lx > 0 ? -0.65 : 0.65;
    rThigh.rotation.x = 0.55;
    riderBodyGroup.add(rThigh);
  });

  const capeGeo = new THREE.PlaneGeometry(1.02, 2.05, 4, 6);
  capeGeo.translate(0, -1.02, 0);
  const capeMesh = new THREE.Mesh(capeGeo, capeMat);
  capeMesh.position.set(0, 0.96, 0.16);
  capeMesh.rotation.x = 1.22;
  capeMesh.castShadow = true;
  riderBodyGroup.add(capeMesh);

  // Helper: Realistic Articulated Armored Hand with Palm, Knuckle Guard, 4 Segmented Fingers & Thumb
  const buildArticulatedGauntletHand = (
    parent: THREE.Group,
    side: -1 | 1,
    gripAngle: number,
  ) => {
    // Upper arm extending backward toward knight shoulder (no floating arms in 1st-person!)
    const upperArm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.105, 0.42, 6, 10),
      chainmailMat,
    );
    upperArm.rotation.x = Math.PI / 2.9;
    upperArm.rotation.z = side * -0.18;
    upperArm.position.set(side * -0.08, 0.04, 0.52);
    parent.add(upperArm);

    const elbowCouter = new THREE.Mesh(
      new THREE.SphereGeometry(0.115, 10, 8),
      gauntletMat,
    );
    elbowCouter.scale.set(1.05, 0.9, 1.2);
    elbowCouter.position.set(side * -0.04, -0.09, 0.34);
    parent.add(elbowCouter);

    // Sculpted Tapered Plate Vambrace with Brass Trim Cuff & Rivets
    const vambrace = new THREE.Mesh(
      new THREE.CylinderGeometry(0.088, 0.108, 0.48, 12),
      gauntletMat,
    );
    vambrace.rotation.x = Math.PI / 2.25;
    vambrace.position.set(0, -0.05, 0.09);
    parent.add(vambrace);

    const wristCuff = new THREE.Mesh(
      new THREE.TorusGeometry(0.086, 0.018, 6, 14),
      hiltMat,
    );
    wristCuff.position.set(0, -0.01, -0.12);
    wristCuff.rotation.x = 0.25;
    parent.add(wristCuff);

    for (let s = 0; s < 2; s++) {
      const strap = new THREE.Mesh(
        new THREE.TorusGeometry(0.098, 0.014, 6, 12),
        leatherMat,
      );
      strap.position.set(0, -0.05 - s * 0.02, 0.04 + s * 0.13);
      strap.rotation.x = 0.2;
      parent.add(strap);
    }

    // Articulated Gauntlet Hand Cluster
    const handGroup = new THREE.Group();
    handGroup.position.set(0, 0.01, -0.22);
    handGroup.rotation.z = side * gripAngle;
    parent.add(handGroup);

    // Metacarpal Palm + Steel Dorsal Plate
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.068, 0.13), leatherMat);
    handGroup.add(palm);
    const backPlate = new THREE.Mesh(new THREE.BoxGeometry(0.122, 0.032, 0.125), gauntletMat);
    backPlate.position.set(0, 0.032, 0);
    handGroup.add(backPlate);

    const knuckleBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.124, 8),
      hiltMat,
    );
    knuckleBar.rotation.z = Math.PI / 2;
    knuckleBar.position.set(0, 0.028, -0.062);
    handGroup.add(knuckleBar);

    // 4 Articulated 2-Phalanx Fingers curled firmly around rein or sword grip
    for (let f = 0; f < 4; f++) {
      const fx = (f - 1.5) * 0.028 * -side;
      const prox = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.013, 0.042, 4, 6),
        gauntletMat,
      );
      prox.position.set(fx, 0.008, -0.088);
      prox.rotation.x = Math.PI / 2.8;
      handGroup.add(prox);

      const dist = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.011, 0.036, 4, 6),
        leatherMat,
      );
      dist.position.set(fx, -0.028, -0.095);
      dist.rotation.x = Math.PI / 1.45;
      handGroup.add(dist);
    }

    // Opposable Armored Thumb locking across the grip
    const thumb = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.015, 0.056, 4, 6),
      gauntletMat,
    );
    thumb.position.set(side * -0.062, 0.015, -0.045);
    thumb.rotation.set(0.75, side * -0.45, side * 0.55);
    handGroup.add(thumb);
  };

  // Left Rein Arm & Articulated Gauntlet Hand gripping the leather rein
  const leftHandGroup = new THREE.Group();
  leftHandGroup.position.set(-0.62, 2.38, -0.92);
  leftHandGroup.visible = isPlayer;
  bodyGroup.add(leftHandGroup);
  buildArticulatedGauntletHand(leftHandGroup, -1, 0.25);

  // Leather Reins connecting neck collar to rider hands
  const reinGeo = new THREE.CylinderGeometry(0.032, 0.032, 2.55, 6);
  reinGeo.rotateX(Math.PI / 2);
  const leftReinStrap = new THREE.Mesh(reinGeo, leatherMat);
  leftReinStrap.position.set(-0.68, 2.02, -2.25);
  leftReinStrap.visible = isPlayer;
  bodyGroup.add(leftReinStrap);

  const rightReinStrap = new THREE.Mesh(reinGeo, leatherMat);
  rightReinStrap.position.set(0.68, 2.02, -2.25);
  rightReinStrap.visible = isPlayer;
  bodyGroup.add(rightReinStrap);

  // Right Sword Arm & Masterwork Damascus Knight Broadsword
  const swordArmGroup = new THREE.Group();
  swordArmGroup.position.set(0.88, 2.32, -0.92);
  swordArmGroup.visible = isPlayer;
  bodyGroup.add(swordArmGroup);
  buildArticulatedGauntletHand(swordArmGroup, 1, -0.22);

  // Ribbed Leather Grip + Ruby/Gold Counterweight Pommel
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 0.36, 10), leatherMat);
  grip.position.set(0, 0.04, -0.34);
  grip.rotation.x = Math.PI / 4;
  swordArmGroup.add(grip);

  const swordPommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.072, 1), hiltMat);
  swordPommel.position.set(0, -0.09, -0.2);
  swordArmGroup.add(swordPommel);

  // Engraved Winged Crossguard
  const crossguard = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.62, 10), hiltMat);
  crossguard.rotation.z = Math.PI / 2;
  crossguard.position.set(0, 0.19, -0.49);
  swordArmGroup.add(crossguard);

  const guardCenter = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.09), hiltMat);
  guardCenter.position.set(0, 0.19, -0.49);
  swordArmGroup.add(guardCenter);

  // Faceted Double-Edged Damascus Broadsword Blade with Central Fuller Groove
  const swordShape = new THREE.Shape();
  swordShape.moveTo(-0.052, 0);
  swordShape.lineTo(-0.044, 1.65);
  swordShape.lineTo(0, 1.98);
  swordShape.lineTo(0.044, 1.65);
  swordShape.lineTo(0.052, 0);
  swordShape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(swordShape, {
    steps: 2,
    depth: 0.02,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.014,
    bevelSegments: 2,
  });
  bladeGeo.translate(0, 0, -0.01);
  bladeGeo.computeVertexNormals();
  const blade = new THREE.Mesh(bladeGeo, bladeMat);
  blade.position.set(0, 0.21, -0.51);
  blade.rotation.x = -Math.PI / 4;
  blade.castShadow = true;
  swordArmGroup.add(blade);

  const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.022, 1.38, 0.046), gauntletMat);
  fuller.position.set(0, 0.72, -1.02);
  fuller.rotation.x = -Math.PI / 4;
  swordArmGroup.add(fuller);

  // 4. Muscular S-Curved Articulated Neck & Layered Armor Scales
  const neckGroup = new THREE.Group();
  neckGroup.position.set(0, 0.72, -3.55);
  bodyGroup.add(neckGroup);

  const neckProfile = [
    new THREE.Vector2(0.01, -0.2),
    new THREE.Vector2(1.32, 0.15),
    new THREE.Vector2(1.12, 1.35),
    new THREE.Vector2(0.95, 2.55),
    new THREE.Vector2(0.84, 3.65),
    new THREE.Vector2(0.01, 3.95),
  ];
  const neckGeo = new THREE.LatheGeometry(neckProfile, 20);
  neckGeo.rotateX(-Math.PI / 2 + 0.22);
  neckGeo.scale(0.88, 1.0, 1);
  neckGeo.computeVertexNormals();
  const neckMesh = new THREE.Mesh(neckGeo, primaryMat);
  neckMesh.position.set(0, 0.05, 0.1);
  neckMesh.castShadow = true;
  neckMesh.receiveShadow = true;
  neckGroup.add(neckMesh);

  // Cervical Collar Armor Scales & Neck Dorsal Spikes
  const neckSpineGeo = createDorsalSpineGeometry(0.88, 0.45);
  for (let i = 0; i < 6; i++) {
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(1.12 - i * 0.075, 0.14, 8, 16, Math.PI * 1.25),
      bellyMat,
    );
    collar.position.set(0, 0.04 + i * 0.14, -0.35 - i * 0.56);
    collar.rotation.z = -Math.PI * 0.125;
    collar.rotation.x = 0.22;
    neckGroup.add(collar);

    const nSpike = new THREE.Mesh(neckSpineGeo, armorMat);
    nSpike.position.set(0, 1.15 + i * 0.13, -0.35 - i * 0.56);
    nSpike.scale.setScalar(1.05 - i * 0.07);
    nSpike.castShadow = true;
    neckGroup.add(nSpike);
  }

  // 5. 100% Realistic Sculpted Reptilian Head, Brow Ridges, Eyes, Fangs & Tapered Horns
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.92, -3.45);
  neckGroup.add(headGroup);

  const craniumGeo = createSculptedCraniumGeometry();
  const craniumMesh = new THREE.Mesh(craniumGeo, primaryMat);
  craniumMesh.position.set(0, 0.05, -0.1);
  craniumMesh.castShadow = true;
  craniumMesh.receiveShadow = true;
  headGroup.add(craniumMesh);

  // Pronounced Supraorbital Brow Ridges framing sunken reptilian eyes
  [-0.58, 0.58].forEach((bx) => {
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.85, 6, 10), armorMat);
    brow.rotation.x = Math.PI / 2 - 0.16;
    brow.rotation.z = bx > 0 ? -0.25 : 0.25;
    brow.position.set(bx, 0.45, -1.05);
    brow.castShadow = true;
    headGroup.add(brow);

    // Flared Zygomatic Cheek Spikes
    const cheekHorn = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.85, 7), armorMat);
    cheekHorn.position.set(bx * 1.35, -0.05, -0.05);
    cheekHorn.rotation.x = Math.PI / 2 + 0.18;
    cheekHorn.rotation.z = bx > 0 ? -0.55 : 0.55;
    headGroup.add(cheekHorn);
  });

  // Flared Nostril Ridges
  [-0.28, 0.28].forEach((nx) => {
    const nostril = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.055, 6, 10), primaryMat);
    nostril.position.set(nx, 0.26, -2.35);
    nostril.rotation.y = nx > 0 ? 0.55 : -0.55;
    headGroup.add(nostril);
  });

  const nasalHorn = new THREE.Mesh(createDorsalSpineGeometry(0.72, 0.42), armorMat);
  nasalHorn.position.set(0, 0.5, -2.25);
  headGroup.add(nasalHorn);

  // Swept-Back Tapered Crown Horns
  const hornLGeo = createTaperedHornGeometry(
    [
      new THREE.Vector3(-0.48, 0.52, -0.15),
      new THREE.Vector3(-0.88, 1.18, 0.85),
      new THREE.Vector3(-1.26, 1.62, 2.25),
      new THREE.Vector3(-1.42, 1.52, 3.05),
    ],
    0.26,
    0.03,
  );
  const hornL = new THREE.Mesh(hornLGeo, armorMat);
  hornL.castShadow = true;
  headGroup.add(hornL);

  const hornRGeo = createTaperedHornGeometry(
    [
      new THREE.Vector3(0.48, 0.52, -0.15),
      new THREE.Vector3(0.88, 1.18, 0.85),
      new THREE.Vector3(1.26, 1.62, 2.25),
      new THREE.Vector3(1.42, 1.52, 3.05),
    ],
    0.26,
    0.03,
  );
  const hornR = new THREE.Mesh(hornRGeo, armorMat);
  hornR.castShadow = true;
  headGroup.add(hornR);

  // Secondary lower temple horns
  [-1, 1].forEach((side) => {
    const subHornGeo = createTaperedHornGeometry(
      [
        new THREE.Vector3(side * 0.62, 0.15, 0.05),
        new THREE.Vector3(side * 1.05, 0.35, 0.95),
        new THREE.Vector3(side * 1.32, 0.48, 1.65),
      ],
      0.16,
      0.02,
      10,
      6,
    );
    headGroup.add(new THREE.Mesh(subHornGeo, armorMat));
  });

  // Vertical Slit-Pupil Reptilian Eyes
  const eyeGeo = new THREE.SphereGeometry(0.18, 14, 14);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.62, 0.25, -1.12);
  eyeL.rotation.y = -Math.PI / 2 - 0.18;
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.62, 0.25, -1.12);
  eyeR.rotation.y = Math.PI / 2 + 0.18;
  headGroup.add(eyeL, eyeR);

  // Upper Row of Curved Ivory Fangs
  const fangGeo = new THREE.ConeGeometry(0.052, 0.26, 6);
  for (let i = 0; i < 6; i++) {
    const zPos = -0.78 - i * 0.32;
    const xOff = 0.42 - i * 0.045;
    [-1, 1].forEach((side) => {
      const fang = new THREE.Mesh(fangGeo, fangMat);
      fang.position.set(side * xOff, -0.32, zPos);
      fang.rotation.x = Math.PI + (i === 5 ? 0.15 : 0);
      fang.scale.setScalar(i === 4 || i === 5 ? 1.28 : 0.95);
      headGroup.add(fang);
    });
  }

  // Articulated Sculpted Lower Mandible Jaw & Lower Fangs
  const jawGroup = new THREE.Group();
  jawGroup.position.set(0, -0.26, -0.32);
  headGroup.add(jawGroup);

  const jawGeo = createMandibleGeometry();
  const jawMesh = new THREE.Mesh(jawGeo, bellyMat);
  jawMesh.position.set(0, -0.05, -0.05);
  jawMesh.castShadow = true;
  jawGroup.add(jawMesh);

  for (let i = 0; i < 5; i++) {
    const zPos = -0.45 - i * 0.34;
    const xOff = 0.34 - i * 0.04;
    [-1, 1].forEach((side) => {
      const lFang = new THREE.Mesh(fangGeo, fangMat);
      lFang.position.set(side * xOff, 0.12, zPos);
      lFang.scale.setScalar(i === 4 ? 1.15 : 0.85);
      jawGroup.add(lFang);
    });
  }

  const mouthOrigin = new THREE.Object3D();
  mouthOrigin.position.set(0, -0.15, -2.75);
  headGroup.add(mouthOrigin);

  // 6. Anatomically Accurate Bat-Dragon Wings (Humerus + Wrist Thumb Claw + 4 Wing Fingers + Cambered Veined Membrane)
  const span = spec.wingSpan;
  const buildWing = (side: -1 | 1) => {
    const inner = new THREE.Group();
    inner.position.set(side * 1.45, 0.9, -1.4);
    bodyGroup.add(inner);

    // Muscular Humerus/Forearm wing spar sweeping slightly forward then out
    const innerSpar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.42, 6.25 * span, 12),
      primaryMat,
    );
    innerSpar.rotation.z = side * (Math.PI / 2);
    innerSpar.position.set(side * 3.1 * span, 0.05, -0.08);
    innerSpar.castShadow = true;
    inner.add(innerSpar);

    const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), primaryMat);
    elbowJoint.position.set(side * 6.2 * span, 0.05, -0.15);
    inner.add(elbowJoint);

    // Inner wing finger strut anchoring trailing edge
    const innerStrut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.14, 4.9, 8),
      armorMat,
    );
    innerStrut.rotation.x = Math.PI / 2;
    innerStrut.rotation.z = side * -0.35;
    innerStrut.position.set(side * 5.0 * span, -0.05, 2.25);
    inner.add(innerStrut);

    const innerMembraneGeo = createScallopedWingMembrane(
      [0, 0, 0.25],
      [side * 6.2 * span, 0.05, -0.15],
      [
        [side * 5.6 * span, -0.08, 4.45],
        [side * 2.6 * span, -0.12, 4.95],
        [0, -0.08, 3.85],
      ],
      0.24,
    );
    const innerMembrane = new THREE.Mesh(innerMembraneGeo, membraneMat);
    innerMembrane.castShadow = true;
    innerMembrane.receiveShadow = true;
    inner.add(innerMembrane);

    const outer = new THREE.Group();
    outer.position.set(side * 6.2 * span, 0.05, -0.15);
    inner.add(outer);

    // Curved Armored Wing-Thumb Claw at wrist knuckle
    const thumbHorn = createTaperedHornGeometry(
      [
        new THREE.Vector3(0, 0.12, -0.1),
        new THREE.Vector3(side * 0.1, 0.28, -0.62),
        new THREE.Vector3(0, 0.18, -1.05),
      ],
      0.16,
      0.02,
      8,
      6,
    );
    const clawSpike = new THREE.Mesh(thumbHorn, clawMat);
    clawSpike.castShadow = true;
    outer.add(clawSpike);

    // 4 Radiating Wing Finger Bones (Phalanges) fanning across the outer leather membrane
    const fingerTargets: [number, number, number][] = [
      [side * 7.85 * span, 0.06, 1.35],
      [side * 6.45 * span, -0.04, 3.45],
      [side * 4.35 * span, -0.1, 4.85],
      [side * 1.95 * span, -0.12, 5.25],
    ];
    fingerTargets.forEach((ft, fIdx) => {
      const len = Math.hypot(ft[0], ft[1], ft[2]);
      const finger = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, fIdx === 0 ? 0.22 : 0.12, len, 8),
        fIdx === 0 ? primaryMat : armorMat,
      );
      const dir = new THREE.Vector3(ft[0], ft[1], ft[2]).normalize();
      finger.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      finger.position.set(ft[0] * 0.5, ft[1] * 0.5, ft[2] * 0.5);
      finger.castShadow = true;
      outer.add(finger);
    });

    const outerMembraneGeo = createScallopedWingMembrane(
      [-side * 0.1, 0, 0.05],
      fingerTargets[0],
      [
        fingerTargets[1],
        fingerTargets[2],
        fingerTargets[3],
        [-side * 0.65 * span, -0.1, 4.55],
      ],
      0.28,
    );
    const outerMembrane = new THREE.Mesh(outerMembraneGeo, membraneMat);
    outerMembrane.castShadow = true;
    outerMembrane.receiveShadow = true;
    outer.add(outerMembrane);

    const wingTip = new THREE.Object3D();
    wingTip.position.set(fingerTargets[0][0], fingerTargets[0][1], fingerTargets[0][2]);
    outer.add(wingTip);

    return { inner, outer, wingTip };
  };

  const left = buildWing(-1);
  const right = buildWing(1);

  // 7. 7-Segment Muscular Dragon Tail with Dorsal Fins & Beveled Spade Tip
  const tailSegments: THREE.Group[] = [];
  let parentTail: THREE.Object3D = bodyGroup;
  const tailSpineGeo = createDorsalSpineGeometry(0.65, 0.42);
  for (let i = 0; i < 7; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, i === 0 ? 0.08 : 0, i === 0 ? 3.8 : 1.75 - i * 0.11);
    parentTail.add(seg);

    const rTop = Math.max(0.14, 0.92 - i * 0.12);
    const rBot = Math.max(0.08, 0.78 - i * 0.115);
    const segLen = 1.9 - i * 0.12;
    const segGeo = new THREE.CylinderGeometry(rBot, rTop, segLen, 12);
    segGeo.rotateX(Math.PI / 2);
    const segMesh = new THREE.Mesh(segGeo, primaryMat);
    segMesh.position.set(0, 0, segLen * 0.45);
    segMesh.castShadow = true;
    seg.add(segMesh);

    const tSpike = new THREE.Mesh(tailSpineGeo, armorMat);
    tSpike.position.set(0, rTop * 0.92, segLen * 0.48);
    tSpike.scale.setScalar(Math.max(0.35, 0.92 - i * 0.1));
    seg.add(tSpike);

    if (i === 6) {
      const spadeShape = new THREE.Shape();
      spadeShape.moveTo(0, 0);
      spadeShape.lineTo(1.25, 0.65);
      spadeShape.lineTo(0, 2.35);
      spadeShape.lineTo(-1.25, 0.65);
      spadeShape.closePath();
      const spadeGeo = new THREE.ExtrudeGeometry(spadeShape, {
        steps: 1,
        depth: 0.1,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.04,
        bevelSegments: 2,
      });
      spadeGeo.rotateX(Math.PI / 2);
      spadeGeo.computeVertexNormals();
      const fin = new THREE.Mesh(spadeGeo, armorMat);
      fin.position.set(0, 0.04, 1.0);
      fin.castShadow = true;
      seg.add(fin);
    }

    tailSegments.push(seg);
    parentTail = seg;
  }

  const auraLight = new THREE.PointLight(spec.eyeColor, isPlayer ? 1.8 : 1.0, 24, 1.6);
  auraLight.position.set(0, 1.2, -3.5);
  bodyGroup.add(auraLight);

  let currentlyFrozen = false;
  const setFrozen = (frozen: boolean) => {
    if (currentlyFrozen === frozen) return;
    currentlyFrozen = frozen;
    if (frozen) {
      primaryMat.emissive.setHex(0xdbeafe);
      primaryMat.emissiveIntensity = 0.65;
      membraneMat.emissive.setHex(0xe0f2fe);
      membraneMat.emissiveIntensity = 0.52;
      armorMat.emissive.setHex(0xbae6fd);
      armorMat.emissiveIntensity = 0.5;
    } else {
      primaryMat.emissive.setHex(0x000000);
      primaryMat.emissiveIntensity = 0;
      membraneMat.emissive.setHex(0x000000);
      membraneMat.emissiveIntensity = 0;
      armorMat.emissive.setHex(0x000000);
      armorMat.emissiveIntensity = 0;
    }
  };

  const dispose = () => {
    scaleMaps.dispose();
    wingMaps.dispose();
    eyeTex.dispose();
    primaryMat.dispose();
    armorMat.dispose();
    bellyMat.dispose();
    membraneMat.dispose();
    eyeMat.dispose();
    fangMat.dispose();
    clawMat.dispose();
    leatherMat.dispose();
    gauntletMat.dispose();
    chainmailMat.dispose();
    hiltMat.dispose();
    bladeMat.dispose();
    capeMat.dispose();
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });
  };

  const setLightningReflection = (
    intensity: number,
    dirWorld?: THREE.Vector3,
    colorHex?: number,
  ) => {
    const clamped = Math.max(0, Math.min(1.6, intensity));
    lightningUniforms.uLightningReflect.value = clamped;
    if (dirWorld && dirWorld.lengthSq() > 1e-4) {
      lightningUniforms.uLightningDir.value.copy(dirWorld).normalize();
    }
    if (colorHex !== undefined) {
      lightningUniforms.uLightningColor.value.setHex(colorHex);
    }
    const boost = Math.min(1, clamped);
    primaryMat.clearcoat = 0.34 + boost * 0.58;
    primaryMat.clearcoatRoughness = 0.32 - boost * 0.22;
    primaryMat.iridescence = 0.26 + boost * 0.52;
    armorMat.clearcoat = 0.4 + boost * 0.54;
    armorMat.clearcoatRoughness = 0.24 - boost * 0.16;
    membraneMat.clearcoat = 0.24 + boost * 0.52;
  };

  const setFusionGlow = (intensity: number, colorHex?: number) => {
    const clamped = Math.max(0, Math.min(1.5, intensity));
    lightningUniforms.uFusionAura.value = clamped;
    if (colorHex !== undefined) {
      lightningUniforms.uFusionColor.value.setHex(colorHex);
      auraLight.color.setHex(colorHex);
    } else {
      auraLight.color.setHex(spec.eyeColor);
    }
    const baseAura = isPlayer ? 1.8 : 1.0;
    auraLight.intensity = baseAura + clamped * 4.2;
    auraLight.distance = 24 + clamped * 22;
    eyeMat.emissiveIntensity = 1.65 + clamped * 1.8;
    bladeMat.emissiveIntensity = 0.28 + clamped * 1.45;
  };

  const setDamageScars = (severity: number, timeSec: number) => {
    const clamped = Math.max(0, Math.min(1, severity));
    lightningUniforms.uDamageSeverity.value = clamped;
    lightningUniforms.uScarTime.value = timeSec;
  };

  return {
    root,
    bodyGroup,
    neckGroup,
    headGroup,
    jawGroup,
    mouthOrigin,
    leftWingInner: left.inner,
    leftWingOuter: left.outer,
    rightWingInner: right.inner,
    rightWingOuter: right.outer,
    leftWingTip: left.wingTip,
    rightWingTip: right.wingTip,
    leftHindLeg,
    rightHindLeg,
    leftHindFoot,
    rightHindFoot,
    tailSegments,
    riderCameraAnchor,
    riderBodyGroup,
    capeMesh,
    leftHandGroup,
    swordArmGroup,
    leftReinStrap,
    rightReinStrap,
    swordBladeMat: bladeMat,
    auraLight,
    setFrozen,
    setLightningReflection,
    setFusionGlow,
    setDamageScars,
    dispose,
  };
}
