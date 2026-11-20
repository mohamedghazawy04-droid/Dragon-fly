import * as THREE from 'three';

function applyTextureQuality(
  tex: THREE.Texture,
  maxAnisotropy: number,
  isColor: boolean,
  repeatX = 1,
  repeatY = 1,
): THREE.Texture {
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

export interface DragonScaleMaps {
  map: THREE.CanvasTexture;
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
  dispose: () => void;
}

/**
 * Generates high-definition 512x512 overlapping reptilian dragon scale albedo,
 * Sobel-derived 3D tangent-space normal map, and per-scale roughness map.
 */
export function createDragonScaleMaps(
  baseHex: number,
  highlightHex: number,
  maxAnisotropy: number,
): DragonScaleMaps {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const baseColor = new THREE.Color(baseHex);
  const hiColor = new THREE.Color(highlightHex);
  const darkCrevice = baseColor.clone().multiplyScalar(0.28);

  // Height buffer [0..1] for normal & roughness derivation
  const heightBuf = new Float32Array(size * size);

  const rows = 18;
  const cols = 16;
  const cellW = size / cols;
  const cellH = size / rows;

  // Fill background crevice
  ctx.fillStyle = `#${darkCrevice.getHexString()}`;
  ctx.fillRect(0, 0, size, size);

  // Rasterize overlapping diamond-arched scales into both color canvas and height buffer
  for (let r = -1; r <= rows + 1; r++) {
    for (let c = -1; c <= cols + 1; c++) {
      const offsetX = (Math.abs(r) % 2) * (cellW * 0.5);
      const cx = c * cellW + offsetX + cellW * 0.5;
      const cy = r * cellH + cellH * 0.5;
      const rx = cellW * 0.58;
      const ry = cellH * 0.68;

      // Deterministic organic tint per scale
      const seed = Math.sin(r * 12.9898 + c * 78.233) * 43758.5453;
      const rand = seed - Math.floor(seed);
      const scaleTint = baseColor.clone().lerp(hiColor, rand * 0.36);
      const edgeTint = scaleTint.clone().multiplyScalar(0.52);

      const minX = Math.max(0, Math.floor(cx - rx));
      const maxX = Math.min(size - 1, Math.ceil(cx + rx));
      const minY = Math.max(0, Math.floor(cy - ry));
      const maxY = Math.min(size - 1, Math.ceil(cy + ry));

      for (let py = minY; py <= maxY; py++) {
        const dy = (py - cy) / ry;
        for (let px = minX; px <= maxX; px++) {
          const dx = (px - cx) / rx;
          // Pointed reptilian shield shape
          const shield = dx * dx + dy * dy * (dy > 0 ? 0.85 : 1.35);
          if (shield <= 1.0) {
            const ridge = Math.max(0, 1 - Math.abs(dx) * 3.2) * 0.14;
            const dome = Math.pow(1 - shield, 0.55) * 0.85 + ridge + (dy * 0.12);
            const hVal = Math.min(1, Math.max(0.05, dome));
            const idx = py * size + px;
            if (hVal >= heightBuf[idx] - 0.15) {
              heightBuf[idx] = hVal;
            }
          }
        }
      }

      // Paint beveled scale onto albedo canvas
      const grad = ctx.createRadialGradient(
        cx,
        cy - ry * 0.2,
        1,
        cx,
        cy + ry * 0.1,
        Math.max(rx, ry),
      );
      grad.addColorStop(
        0,
        `rgb(${Math.min(255, Math.round((scaleTint.r * 1.15) * 255))}, ${Math.min(255, Math.round((scaleTint.g * 1.15) * 255))}, ${Math.min(255, Math.round((scaleTint.b * 1.15) * 255))})`,
      );
      grad.addColorStop(
        0.72,
        `rgb(${Math.round(scaleTint.r * 255)}, ${Math.round(scaleTint.g * 255)}, ${Math.round(scaleTint.b * 255)})`,
      );
      grad.addColorStop(
        1,
        `rgb(${Math.round(edgeTint.r * 255)}, ${Math.round(edgeTint.g * 255)}, ${Math.round(edgeTint.b * 255)})`,
      );

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 0.94, ry * 0.94, 0, 0, Math.PI * 2);
      ctx.fill();

      // Subtle central keratin keel highlight along each scale
      ctx.strokeStyle = `rgba(${Math.round(hiColor.r * 255)}, ${Math.round(hiColor.g * 255)}, ${Math.round(hiColor.b * 255)}, 0.25)`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy - ry * 0.55);
      ctx.lineTo(cx, cy + ry * 0.65);
      ctx.stroke();
    }
  }

  // Derive tangent-space Normal Map & Roughness Map from heightBuf
  const normalData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const strength = 4.2;

  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;

      const hL = heightBuf[y * size + xm];
      const hR = heightBuf[y * size + xp];
      const hU = heightBuf[ym * size + x];
      const hD = heightBuf[yp * size + x];

      const nx = (hL - hR) * strength;
      const ny = (hU - hD) * strength;
      const nz = 1.0;
      const len = Math.hypot(nx, ny, nz);

      const p = (y * size + x) * 4;
      normalData[p] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      normalData[p + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      normalData[p + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      normalData[p + 3] = 255;

      // Scale peaks are glossier (0.28), crevices are rougher (0.85)
      const hC = heightBuf[y * size + x];
      const rVal = Math.round((0.85 - hC * 0.57) * 255);
      roughData[p] = rVal;
      roughData[p + 1] = rVal;
      roughData[p + 2] = rVal;
      roughData[p + 3] = 255;
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  applyTextureQuality(map, maxAnisotropy, true, 4, 4);

  const normalMap = new THREE.DataTexture(normalData, size, size, THREE.RGBAFormat);
  applyTextureQuality(normalMap, maxAnisotropy, false, 4, 4);

  const roughnessMap = new THREE.DataTexture(roughData, size, size, THREE.RGBAFormat);
  applyTextureQuality(roughnessMap, maxAnisotropy, false, 4, 4);

  return {
    map,
    normalMap,
    roughnessMap,
    dispose: () => {
      map.dispose();
      normalMap.dispose();
      roughnessMap.dispose();
    },
  };
}

/**
 * Tileable 512x512 seamless ocean wave normal map for crisp sky & sun reflections.
 */
export function createWaterNormalMap(maxAnisotropy: number): THREE.DataTexture {
  const size = 256;
  const hBuf = new Float32Array(size * size);
  const twoPi = Math.PI * 2;

  for (let y = 0; y < size; y++) {
    const v = (y / size) * twoPi;
    for (let x = 0; x < size; x++) {
      const u = (x / size) * twoPi;
      const h =
        Math.sin(u * 2 + v * 1) * 0.35 +
        Math.cos(u * 3 - v * 2) * 0.28 +
        Math.sin(u * 5 + v * 4) * 0.16 +
        Math.cos(u * 8 - v * 7) * 0.1 +
        Math.sin(u * 13 + v * 11) * 0.06;
      hBuf[y * size + x] = h;
    }
  }

  const data = new Uint8Array(size * size * 4);
  const strength = 1.9;
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const nx = (hBuf[y * size + xm] - hBuf[y * size + xp]) * strength;
      const ny = (hBuf[ym * size + x] - hBuf[yp * size + x]) * strength;
      const nz = 1.0;
      const len = Math.hypot(nx, ny, nz);
      const p = (y * size + x) * 4;
      data[p] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      data[p + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      data[p + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      data[p + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  applyTextureQuality(tex, maxAnisotropy, false, 36, 36);
  return tex;
}

/**
 * Tileable rocky terrain micro-detail normal map for crisp cliffs & sand dunes.
 */
export function createTerrainNormalMap(maxAnisotropy: number): THREE.DataTexture {
  const size = 256;
  const hBuf = new Float32Array(size * size);
  const twoPi = Math.PI * 2;

  for (let y = 0; y < size; y++) {
    const v = (y / size) * twoPi;
    for (let x = 0; x < size; x++) {
      const u = (x / size) * twoPi;
      hBuf[y * size + x] =
        Math.sin(u * 4 + Math.cos(v * 3)) * 0.4 +
        Math.cos(v * 7 + u * 5) * 0.25 +
        Math.sin(u * 14 - v * 12) * 0.15;
    }
  }

  const data = new Uint8Array(size * size * 4);
  const strength = 1.5;
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const nx = (hBuf[y * size + xm] - hBuf[y * size + xp]) * strength;
      const ny = (hBuf[ym * size + x] - hBuf[yp * size + x]) * strength;
      const nz = 1.0;
      const len = Math.hypot(nx, ny, nz);
      const p = (y * size + x) * 4;
      data[p] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      data[p + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      data[p + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      data[p + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  applyTextureQuality(tex, maxAnisotropy, false, 48, 48);
  return tex;
}

export function createStoneTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#6c6861';
  ctx.fillRect(0, 0, 256, 256);

  const rows = 8;
  const rowH = 256 / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    const cols = 4;
    const colW = 256 / cols;
    const offset = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * colW + offset;
      const shade = 92 + ((r * 17 + c * 31) % 34);
      ctx.fillStyle = `rgb(${shade}, ${shade - 4}, ${shade - 10})`;
      ctx.fillRect(x + 2, y + 2, colW - 4, rowH - 4);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x + 2, y + 2, colW - 4, 3);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  return applyTextureQuality(tex, maxAnisotropy, true, 4, 4) as THREE.CanvasTexture;
}

export function createPirateSailTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#271e1b');
  grad.addColorStop(0.5, '#1d1614');
  grad.addColorStop(1, '#311a18');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = 'rgba(255,235,210,0.1)';
  ctx.lineWidth = 2;
  for (let y = 32; y < 256; y += 44) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }

  ctx.fillStyle = '#e5dccb';
  ctx.beginPath();
  ctx.arc(128, 114, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(108, 136, 40, 22);

  ctx.fillStyle = '#181210';
  ctx.beginPath();
  ctx.arc(114, 114, 8, 0, Math.PI * 2);
  ctx.arc(142, 114, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#d4b483';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(76, 176);
  ctx.lineTo(180, 74);
  ctx.moveTo(180, 176);
  ctx.lineTo(76, 74);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  return applyTextureQuality(tex, maxAnisotropy, true, 1, 1) as THREE.CanvasTexture;
}

export function createSoftParticleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.72)');
  grad.addColorStop(0.75, 'rgba(255, 255, 255, 0.18)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createWoodPlankTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#4e3322';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 24) {
    const shade = (y % 48 === 0 ? 1 : -1) * 10;
    ctx.fillStyle = `rgb(${78 + shade}, ${51 + shade}, ${34 + shade})`;
    ctx.fillRect(0, y + 1, 256, 22);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, y, 256, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  return applyTextureQuality(tex, maxAnisotropy, true, 2, 2) as THREE.CanvasTexture;
}

export interface DragonWingMaps {
  map: THREE.CanvasTexture;
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
  dispose: () => void;
}

/**
 * Generates organic 512x512 leathery dragon wing membrane albedo, vein relief normal map,
 * and translucent subsurface-style roughness variation.
 */
export function createDragonWingMembraneMaps(
  membraneHex: number,
  maxAnisotropy: number,
): DragonWingMaps {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const base = new THREE.Color(membraneHex);
  const darkEdge = base.clone().multiplyScalar(0.36);
  const warmVein = base.clone().lerp(new THREE.Color(0xff9c5b), 0.32);

  // Radial leathery gradient (thicker/darker along wing bone edge, warmer/thinner inside)
  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, `#${darkEdge.getHexString()}`);
  bg.addColorStop(0.55, `#${base.getHexString()}`);
  bg.addColorStop(1, `#${warmVein.getHexString()}`);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Subtle leathery skin creases & height field
  const hBuf = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const ripple =
        Math.sin(u * 26 + Math.sin(v * 14) * 1.8) * 0.25 +
        Math.cos(v * 34 - u * 18) * 0.2 +
        Math.sin((u + v) * 52) * 0.12;
      hBuf[y * size + x] = 0.4 + ripple * 0.22;
    }
  }

  // Organic branching vascular veins
  ctx.lineCap = 'round';
  for (let b = 0; b < 14; b++) {
    let vx = (b % 2) * 16;
    let vy = (b / 14) * size;
    let angle = ((b / 14) - 0.5) * 0.45 + 0.12;
    ctx.strokeStyle = `rgba(${Math.round(darkEdge.r * 220)}, ${Math.round(darkEdge.g * 170)}, ${Math.round(darkEdge.b * 160)}, 0.58)`;
    ctx.lineWidth = 3.2 - (b % 3) * 0.6;
    ctx.beginPath();
    ctx.moveTo(vx, vy);
    for (let step = 0; step < 18; step++) {
      angle += Math.sin(step * 1.4 + b * 2.1) * 0.14;
      vx += Math.cos(angle) * 28;
      vy += Math.sin(angle) * 28;
      ctx.lineTo(vx, vy);
      // Paint vein ridge into height buffer
      const cx = Math.round(vx);
      const cy = Math.round(vy);
      for (let oy = -2; oy <= 2; oy++) {
        for (let ox = -2; ox <= 2; ox++) {
          const px = cx + ox;
          const py = cy + oy;
          if (px >= 0 && px < size && py >= 0 && py < size) {
            hBuf[py * size + px] = Math.min(1, hBuf[py * size + px] + 0.28);
          }
        }
      }
    }
    ctx.stroke();
  }

  const normalData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const strength = 2.6;
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const nx = (hBuf[y * size + xm] - hBuf[y * size + xp]) * strength;
      const ny = (hBuf[ym * size + x] - hBuf[yp * size + x]) * strength;
      const nz = 1.0;
      const len = Math.hypot(nx, ny, nz);
      const p = (y * size + x) * 4;
      normalData[p] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      normalData[p + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      normalData[p + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      normalData[p + 3] = 255;

      const rVal = Math.round((0.46 + hBuf[y * size + x] * 0.34) * 255);
      roughData[p] = rVal;
      roughData[p + 1] = rVal;
      roughData[p + 2] = rVal;
      roughData[p + 3] = 255;
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  applyTextureQuality(map, maxAnisotropy, true, 1, 1);

  const normalMap = new THREE.DataTexture(normalData, size, size, THREE.RGBAFormat);
  applyTextureQuality(normalMap, maxAnisotropy, false, 1, 1);

  const roughnessMap = new THREE.DataTexture(roughData, size, size, THREE.RGBAFormat);
  applyTextureQuality(roughnessMap, maxAnisotropy, false, 1, 1);

  return {
    map,
    normalMap,
    roughnessMap,
    dispose: () => {
      map.dispose();
      normalMap.dispose();
      roughnessMap.dispose();
    },
  };
}

/**
 * Generates a 256x256 realistic reptilian dragon eye iris with fiery radial fibers
 * and razor-sharp vertical slit pupil.
 */
export function createDragonEyeTexture(
  eyeHex: number,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const c = new THREE.Color(eyeHex);
  const bright = c.clone().lerp(new THREE.Color(0xffffff), 0.42);
  const rim = c.clone().multiplyScalar(0.24);

  const grad = ctx.createRadialGradient(128, 128, 18, 128, 128, 122);
  grad.addColorStop(0, `#${bright.getHexString()}`);
  grad.addColorStop(0.55, `#${c.getHexString()}`);
  grad.addColorStop(0.9, `#${rim.getHexString()}`);
  grad.addColorStop(1, '#080605');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Radial iris striations
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    ctx.lineWidth = i % 3 === 0 ? 2.2 : 1.0;
    ctx.beginPath();
    ctx.moveTo(128 + Math.cos(a) * 32, 128 + Math.sin(a) * 32);
    ctx.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112);
    ctx.stroke();
  }

  // Razor-sharp vertical reptilian slit pupil
  ctx.fillStyle = '#050404';
  ctx.beginPath();
  ctx.moveTo(128, 28);
  ctx.quadraticCurveTo(150, 128, 128, 228);
  ctx.quadraticCurveTo(106, 128, 128, 28);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a tileable 256x256 RGBA cloud volume sprite texture combining 6-octave
 * periodic FBM curl wisps and dual-scale Worley cauliflower billow domes for
 * photorealistic self-shadowed volumetric clouds.
 */
export function createVolumetricCloudTexture(maxAnisotropy: number): THREE.DataTexture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);

  const hash2 = (ix: number, iy: number, period: number): number => {
    const px = ((ix % period) + period) % period;
    const py = ((iy % period) + period) % period;
    const n = Math.sin(px * 127.1 + py * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  };

  const smoothNoise = (x: number, y: number, period: number): number => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy, period);
    const b = hash2(ix + 1, iy, period);
    const c = hash2(ix, iy + 1, period);
    const d = hash2(ix + 1, iy + 1, period);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };

  const fbm = (u: number, v: number): number => {
    let val = 0;
    let amp = 0.5;
    let freq = 4;
    for (let o = 0; o < 6; o++) {
      val += smoothNoise(u * freq, v * freq, freq) * amp;
      freq *= 2;
      amp *= 0.5;
    }
    return val;
  };

  const buildWorleyGrid = (cellCount: number, seedShift: number) => {
    const pts: { x: number; y: number }[] = [];
    for (let cy = 0; cy < cellCount; cy++) {
      for (let cx = 0; cx < cellCount; cx++) {
        pts.push({
          x: cx + 0.14 + hash2(cx + seedShift, cy + seedShift * 3, cellCount) * 0.72,
          y: cy + 0.14 + hash2(cx + 13 + seedShift, cy + 7 + seedShift * 5, cellCount) * 0.72,
        });
      }
    }
    return pts;
  };

  const sampleWorley = (
    u: number,
    v: number,
    cellCount: number,
    pts: { x: number; y: number }[],
    falloff: number,
  ): number => {
    const gx = u * cellCount;
    const gy = v * cellCount;
    const cix = Math.floor(gx);
    const ciy = Math.floor(gy);
    let minD2 = 9.0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const ncx = ((cix + ox) % cellCount + cellCount) % cellCount;
        const ncy = ((ciy + oy) % cellCount + cellCount) % cellCount;
        const pt = pts[ncy * cellCount + ncx];
        const px = pt.x + (cix + ox - ncx);
        const py = pt.y + (ciy + oy - ncy);
        const d2 = (gx - px) * (gx - px) + (gy - py) * (gy - py);
        if (d2 < minD2) minD2 = d2;
      }
    }
    return Math.max(0, 1 - Math.sqrt(minD2) * falloff);
  };

  const coarseCells = 5;
  const fineCells = 11;
  const coarsePts = buildWorleyGrid(coarseCells, 1);
  const finePts = buildWorleyGrid(fineCells, 19);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    const dy = (v - 0.5) * 2;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const dx = (u - 0.5) * 2;
      const radial = Math.hypot(dx, dy);

      // Domain-warped FBM for organic turbulent billowing edges
      const warpX = fbm(u + 0.13, v + 0.29) - 0.5;
      const warpY = fbm(u + 0.61, v + 0.47) - 0.5;
      const wu = u + warpX * 0.085;
      const wv = v + warpY * 0.085;

      const nMain = fbm(wu, wv);
      const nDetail = fbm(wu * 2.1 + 0.37, wv * 2.1 + 0.71);

      const worleyCoarse = sampleWorley(wu, wv, coarseCells, coarsePts, 0.88);
      const worleyFine = sampleWorley(wu + 0.21, wv + 0.17, fineCells, finePts, 0.96);
      const billowDome = worleyCoarse * 0.66 + worleyFine * 0.34;

      // Sculpted organic cloud silhouette: flat cumulus underside, fluffy towering domes
      const edgeMask = Math.max(0, 1 - Math.pow(radial, 1.58));
      const heightDensity = billowDome * 0.58 + nMain * 0.42;
      const rawDensity =
        edgeMask * (0.44 + billowDome * 0.56 + nMain * 0.46) -
        (1 - edgeMask) * (1 - nDetail) * 0.34;
      const alpha = Math.max(0, Math.min(1, rawDensity * 1.24));

      const p = (y * size + x) * 4;
      // R: sculpted cumulus billow height for self-shadow raymarch
      data[p] = Math.round(Math.min(1, heightDensity * 1.08) * 255);
      // G: fine animated wispy curl turbulence
      data[p + 1] = Math.round(nDetail * 255);
      // B: Beer-Lambert optical thickness core
      data[p + 2] = Math.round(Math.min(1, edgeMask * (0.65 + billowDome * 0.45)) * 255);
      // A: eroded wispy cloud opacity
      data[p + 3] = Math.round(alpha * 255);
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a high-contrast surface decal texture for sword slashes & dragon fire scorches
 * on castle masonry, palace walls, and wooden ship hulls.
 */
export function createImpactScarTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  // Outer soot / scorch halo
  const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 118);
  grad.addColorStop(0, 'rgba(18, 12, 10, 0.94)');
  grad.addColorStop(0.38, 'rgba(32, 22, 16, 0.78)');
  grad.addColorStop(0.7, 'rgba(20, 16, 14, 0.36)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Jagged diagonal gouge / slash fissures radiating from center
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const angle = -0.38 + (i - 2.5) * 0.24;
    const len = i === 2 || i === 3 ? 98 : 54 + (i % 2) * 26;
    ctx.strokeStyle = i === 2 || i === 3 ? 'rgba(8, 6, 5, 0.96)' : 'rgba(14, 10, 8, 0.85)';
    ctx.lineWidth = i === 2 || i === 3 ? 8 : 4;
    ctx.beginPath();
    ctx.moveTo(128 - Math.cos(angle) * len, 128 - Math.sin(angle) * len);
    ctx.quadraticCurveTo(
      128 + (Math.random() - 0.5) * 14,
      128 + (Math.random() - 0.5) * 14,
      128 + Math.cos(angle) * len,
      128 + Math.sin(angle) * len,
    );
    ctx.stroke();
  }

  // Hot glowing edge highlights along main central gouge
  ctx.strokeStyle = 'rgba(255, 138, 42, 0.52)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(46, 152);
  ctx.quadraticCurveTo(128, 126, 210, 104);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates an expanding luminous shockwave ring texture for heavy impacts and explosions.
 */
export function createShockwaveRingTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const grad = ctx.createRadialGradient(128, 128, 72, 128, 128, 126);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  grad.addColorStop(0.45, 'rgba(255, 210, 140, 0.35)');
  grad.addColorStop(0.72, 'rgba(255, 245, 220, 0.95)');
  grad.addColorStop(0.88, 'rgba(255, 170, 75, 0.55)');
  grad.addColorStop(1, 'rgba(255, 120, 30, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a tileable 256x256 RGBA volumetric smoke texture combining 6-octave periodic FBM
 * curl filaments and dual-scale Worley eddy domes for realistic billowing soot, ash, and steam plumes:
 *   R = Billow dome elevation (for directional sunlight self-shadowing)
 *   G = Fine turbulent curl tendrils (for animated shader advection & wispy erosion)
 *   B = Dense optical soot core density
 *   A = Soft organic puff alpha envelope
 */
export function createRealisticSmokeTexture(maxAnisotropy: number): THREE.DataTexture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);

  const hash2 = (ix: number, iy: number, period: number): number => {
    const px = ((ix % period) + period) % period;
    const py = ((iy % period) + period) % period;
    const n = Math.sin(px * 127.1 + py * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  };

  const smoothNoise = (x: number, y: number, period: number): number => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy, period);
    const b = hash2(ix + 1, iy, period);
    const c = hash2(ix, iy + 1, period);
    const d = hash2(ix + 1, iy + 1, period);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };

  const fbm = (u: number, v: number, startFreq = 4, octaves = 6): number => {
    let val = 0;
    let amp = 0.5;
    let freq = startFreq;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      val += smoothNoise(u * freq, v * freq, freq) * amp;
      norm += amp;
      freq *= 2;
      amp *= 0.5;
    }
    return val / Math.max(0.001, norm);
  };

  const buildWorleyGrid = (cellCount: number, seedShift: number) => {
    const pts: { x: number; y: number }[] = [];
    for (let cy = 0; cy < cellCount; cy++) {
      for (let cx = 0; cx < cellCount; cx++) {
        pts.push({
          x: cx + 0.14 + hash2(cx + seedShift, cy + seedShift * 3, cellCount) * 0.72,
          y: cy + 0.14 + hash2(cx + 17 + seedShift, cy + 11 + seedShift * 5, cellCount) * 0.72,
        });
      }
    }
    return pts;
  };

  const sampleWorley = (
    u: number,
    v: number,
    cellCount: number,
    pts: { x: number; y: number }[],
    falloff: number,
  ): number => {
    const gx = u * cellCount;
    const gy = v * cellCount;
    const cix = Math.floor(gx);
    const ciy = Math.floor(gy);
    let minD2 = 9.0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const ncx = ((cix + ox) % cellCount + cellCount) % cellCount;
        const ncy = ((ciy + oy) % cellCount + cellCount) % cellCount;
        const pt = pts[ncy * cellCount + ncx];
        const px = pt.x + (cix + ox - ncx);
        const py = pt.y + (ciy + oy - ncy);
        const d2 = (gx - px) * (gx - px) + (gy - py) * (gy - py);
        if (d2 < minD2) minD2 = d2;
      }
    }
    return Math.max(0, 1 - Math.sqrt(minD2) * falloff);
  };

  const smoothstepLocal = (e0: number, e1: number, v: number) => {
    const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };

  const coarseCells = 4;
  const fineCells = 9;
  const coarsePts = buildWorleyGrid(coarseCells, 7);
  const finePts = buildWorleyGrid(fineCells, 31);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    const dy = (v - 0.5) * 2;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const dx = (u - 0.5) * 2;
      const radial = Math.hypot(dx, dy);

      // Rotational swirl + turbulent FBM domain warp for realistic smoke eddies
      const angle = Math.atan2(dy, dx);
      const swirl = (1 - Math.min(1, radial)) * 0.14;
      const su = u + Math.cos(angle + 1.57) * swirl;
      const sv = v + Math.sin(angle + 1.57) * swirl;

      const warpX = fbm(su + 0.17, sv + 0.31, 4, 4) - 0.5;
      const warpY = fbm(su + 0.63, sv + 0.52, 4, 4) - 0.5;
      const wu = su + warpX * 0.19;
      const wv = sv + warpY * 0.19;

      const fbmCoarse = fbm(wu, wv, 4, 5);
      const fbmFine = fbm(wu * 2.0 + 0.29, wv * 2.0 + 0.43, 6, 6);
      const worleyCoarse = sampleWorley(wu, wv, coarseCells, coarsePts, 0.92);
      const worleyFine = sampleWorley(wu + 0.19, wv - 0.13, fineCells, finePts, 1.02);

      const domeHeight = Math.max(
        0,
        Math.min(1, worleyCoarse * 0.48 + worleyFine * 0.26 + fbmCoarse * 0.26),
      );
      const curlTendrils = Math.max(
        0,
        Math.min(1, fbmFine * 0.64 + worleyFine * 0.36),
      );

      const radialCore = 1.0 - smoothstepLocal(0.14, 0.9, radial);
      const coreDensity = Math.max(
        0,
        Math.min(1, radialCore * (0.45 + fbmCoarse * 0.35 + worleyCoarse * 0.25)),
      );

      const distortedR = radial + (fbmCoarse - 0.5) * 0.46 + (fbmFine - 0.5) * 0.22;
      const radialMask = 1.0 - smoothstepLocal(0.28, 0.96, distortedR);
      const puffAlpha = Math.max(
        0,
        Math.min(1, radialMask * (0.56 + domeHeight * 0.44)),
      );

      const p = (y * size + x) * 4;
      data[p] = Math.round(domeHeight * 255);
      data[p + 1] = Math.round(curlTendrils * 255);
      data[p + 2] = Math.round(coreDensity * 255);
      data[p + 3] = Math.round(puffAlpha * 255);
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}


