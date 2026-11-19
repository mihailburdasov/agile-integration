// jaw3d.js — procedural 3D dental model (both jaws, 32 teeth, FDI numbering).
// ES module, three.js r160 via importmap ("three", "three/addons/").

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ------------------------------------------------------------------ */
/* FDI ids & names                                                     */
/* ------------------------------------------------------------------ */

export const FDI_ALL = [
  18, 17, 16, 15, 14, 13, 12, 11,
  21, 22, 23, 24, 25, 26, 27, 28,
  38, 37, 36, 35, 34, 33, 32, 31,
  41, 42, 43, 44, 45, 46, 47, 48,
];

const TYPE_NAMES = {
  1: 'Центральный резец',
  2: 'Боковой резец',
  3: 'Клык',
  4: 'Первый премоляр',
  5: 'Второй премоляр',
  6: 'Первый моляр',
  7: 'Второй моляр',
  8: 'Третий моляр (зуб мудрости)',
};
const QUAD_NAMES = {
  1: 'верхняя челюсть справа',
  2: 'верхняя челюсть слева',
  3: 'нижняя челюсть слева',
  4: 'нижняя челюсть справа',
};

export function toothName(id) {
  const n = Number(id);
  const q = Math.floor(n / 10);
  const t = n % 10;
  if (!Number.isInteger(n) || !QUAD_NAMES[q] || !TYPE_NAMES[t]) return `Зуб ${id}`;
  return `${TYPE_NAMES[t]}, ${QUAD_NAMES[q]}`;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const COLORS = {
  tooth: 0xe9e6e0,
  treated: 0xbdb8b0,
  current: 0xb3261e,
  next: 0x2b2b2b,
  gum: 0xd6d3ce,
};

const MOUTH_GAP = 0.6; // vertical gap between occlusal rows
const TOOTH_GAP = 0.04; // gap between neighbouring teeth along the arch
const MODEL_Z_OFFSET = 2.9; // shift so the arch is roughly centred at the origin
const SUNK = 0.1; // how deep crowns sit below the gum line

// Per-position (1..8) tooth dimensions: w = mesiodistal width, d = buccolingual depth
const DIMS = {
  upper: {
    w: [0.9, 0.78, 0.86, 0.8, 0.78, 1.1, 1.02, 0.95],
    d: [0.66, 0.62, 0.8, 0.86, 0.86, 1.05, 1.0, 0.95],
  },
  lower: {
    w: [0.85, 0.8, 0.84, 0.8, 0.8, 1.1, 1.05, 1.0],
    d: [0.58, 0.6, 0.76, 0.8, 0.84, 1.0, 0.98, 0.94],
  },
};

const ARCH = {
  upper: { c: 0.27, zFront: 0 },
  lower: { c: 0.31, zFront: -0.2 },
};

function kindOf(pos) {
  if (pos <= 2) return 'incisor';
  if (pos === 3) return 'canine';
  if (pos <= 5) return 'premolar';
  return 'molar';
}

// Visible crown height as a function of arc length from the midline.
function gumDepth(s) {
  return 0.72 + 0.28 * Math.exp(-((s / 2.3) ** 2));
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sgnPow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Average normals of coincident vertices (sphere seams / poles).
function smoothSeams(geom) {
  const p = geom.attributes.position;
  const n = geom.attributes.normal;
  const groups = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${Math.round(p.getX(i) * 1e4)}|${Math.round(p.getY(i) * 1e4)}|${Math.round(p.getZ(i) * 1e4)}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(i);
  }
  const v = new THREE.Vector3();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    v.set(0, 0, 0);
    for (const i of g) v.x += n.getX(i), v.y += n.getY(i), v.z += n.getZ(i);
    if (v.lengthSq() === 0) continue;
    v.normalize();
    for (const i of g) n.setXYZ(i, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
}

/**
 * Procedural tooth: deformed superellipsoid. Local frame:
 *  x = mesiodistal (along arch), z = buccolingual, y = up (towards occlusal).
 *  Spans y ∈ [-0.55, h]; crown tip / occlusal surface at y = h.
 */
function makeToothGeometry(kind, w, d, h) {
  const g = new THREE.SphereGeometry(1, 40, 30);
  const p = g.attributes.position;
  const bottom = 0.55;
  const mid = (h - bottom) / 2;
  const half = (h + bottom) / 2;
  const ex = kind === 'molar' ? 0.5 : 0.55;
  const ez = kind === 'incisor' ? 0.7 : 0.6;
  const ey = 0.32;
  const gauss = (u, s2) => Math.exp(-u / s2);

  for (let i = 0; i < p.count; i++) {
    const sx = sgnPow(p.getX(i), ex);
    const sy = sgnPow(p.getY(i), ey);
    const sz = sgnPow(p.getZ(i), ez);
    let y = mid + sy * half;
    const t = clamp(y / h, 0, 1);
    const bulge = 4 * t * (1 - t);
    let fx = 1;
    let fz = 1;
    let occ = 0;

    switch (kind) {
      case 'incisor':
        fx = 0.8 + 0.22 * t; // wider at the incisal edge
        fz = 1 - 0.62 * Math.pow(t, 1.3); // thin incisal edge
        occ = -0.05 * sx * sx;
        break;
      case 'canine':
        fx = 0.86 + 0.14 * bulge - 0.3 * Math.pow(t, 2.2);
        fz = 0.9 + 0.1 * bulge - 0.3 * Math.pow(t, 2.2);
        occ = -0.38 * sx * sx - 0.14 * sz * sz; // pointed cusp
        break;
      case 'premolar': {
        fx = 0.86 + 0.14 * bulge;
        fz = 0.88 + 0.12 * bulge;
        const a = 0.45 * sx * sx;
        occ = 0.15 * (gauss(a + (sz - 0.42) ** 2, 0.07) + gauss(a + (sz + 0.42) ** 2, 0.07)) - 0.13 - 0.05 * sx * sx;
        break;
      }
      case 'molar':
      default: {
        fx = 0.9 + 0.1 * bulge;
        fz = 0.9 + 0.1 * bulge;
        let c = 0;
        for (const cx of [-0.42, 0.42]) {
          for (const cz of [-0.42, 0.42]) c += gauss((sx - cx) ** 2 + (sz - cz) ** 2, 0.085);
        }
        occ = 0.13 * c - 0.12;
        break;
      }
    }
    const top = clamp((sy - 0.5) / 0.5, 0, 1);
    const wTop = top * top * (3 - 2 * top);
    y += occ * wTop;
    p.setXYZ(i, sx * w * 0.5 * fx, y, sz * d * 0.5 * fz);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  smoothSeams(g);
  g.computeBoundingSphere();
  return g;
}

// Parabolic arch z = zFront - c·x², sampled for arc-length lookups (+x half).
function buildArch(c, zFront) {
  const xs = [];
  const cum = [];
  let len = 0;
  let px = 0;
  let pz = zFront;
  for (let x = 0; x <= 10; x += 0.004) {
    const z = zFront - c * x * x;
    if (xs.length) len += Math.hypot(x - px, z - pz);
    xs.push(x);
    cum.push(len);
    px = x;
    pz = z;
  }
  return {
    at(s) {
      s = clamp(s, 0, cum[cum.length - 1]);
      let lo = 0;
      let hi = cum.length - 1;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (cum[m] < s) lo = m; else hi = m;
      }
      const f = cum[hi] === cum[lo] ? 0 : (s - cum[lo]) / (cum[hi] - cum[lo]);
      const x = xs[lo] + (xs[hi] - xs[lo]) * f;
      const z = zFront - c * x * x;
      const slope = -2 * c * x;
      const l = Math.hypot(1, slope);
      return { x, z, tx: 1 / l, tz: slope / l };
    },
  };
}

/**
 * Horseshoe gum ridge following the arch. sign: -1 lower jaw, +1 upper jaw.
 */
function makeGumGeometry(arch, L, sign) {
  const cap = 0.75;
  const N = 200;
  const M = 28;
  const total = L + cap;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const s = -total + (2 * total * i) / N;
    const abs = Math.abs(s);
    const side = s < 0 ? -1 : 1;
    let a;
    let f = 1;
    let ext = 0;
    if (abs <= L) {
      a = arch.at(abs);
    } else {
      a = arch.at(L);
      ext = abs - L;
      f = Math.sqrt(Math.max(0, 1 - (ext / cap) ** 2));
    }
    const cx = side * (a.x + a.tx * ext);
    const cz = a.z + a.tz * ext;
    const Tx = a.tx;
    const Tz = side > 0 ? a.tz : -a.tz;
    const nx = -Tz;
    const nz = Tx;
    const gd = gumDepth(Math.min(abs, L));
    const rw = 0.72 + 0.16 * Math.min(abs, L) / L;
    const rh = 0.52;
    const yTop = sign * (MOUTH_GAP / 2 + gd);
    const cy = yTop + sign * rh;
    for (let j = 0; j < M; j++) {
      const ang = (j / M) * Math.PI * 2;
      const co = sgnPow(Math.cos(ang), 0.8) * rw * f;
      const si = sgnPow(Math.sin(ang), 0.8) * rh * (0.25 + 0.75 * f);
      pos.push(cx + nx * co, cy + si, cz + nz * co);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * M + j;
      const b = (i + 1) * M + j;
      const c = (i + 1) * M + ((j + 1) % M);
      const d = i * M + ((j + 1) % M);
      idx.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const STYLE_ID = 'jaw3d-style';
let styleRefs = 0;
const CSS = `
.jaw-canvas{display:block;width:100%;height:100%;outline:none;touch-action:none}
.jaw-overlay{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:1}
.jaw-tag{position:absolute;left:0;top:0;font:600 11px/1 'Inter',system-ui,sans-serif;padding:4px 6px;border-radius:2px;white-space:nowrap;letter-spacing:.02em;font-variant-numeric:tabular-nums;user-select:none;will-change:transform}
.jaw-tag--current{background:#B3261E;color:#fff}
.jaw-tag--next{background:#111;color:#fff}
.jaw-tag--hover{background:#fff;color:#111;border:1px solid #111;padding:3px 5px}
.jaw-tag[hidden]{display:none}
`;
function acquireStyle() {
  styleRefs++;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}
function releaseStyle() {
  styleRefs = Math.max(0, styleRefs - 1);
  if (styleRefs === 0) document.getElementById(STYLE_ID)?.remove();
}

/* ------------------------------------------------------------------ */
/* Viewer                                                              */
/* ------------------------------------------------------------------ */

export function createJawViewer(container, options = {}) {
  if (!container) throw new Error('createJawViewer: container is required');
  acquireStyle();
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.className = 'jaw-canvas';
  container.appendChild(canvas);

  const overlay = document.createElement('div');
  overlay.className = 'jaw-overlay';
  container.appendChild(overlay);

  // Scene & camera
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1.5, 0.1, 200);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfccc7, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.position.set(5, 10, 9);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.45);
  fill.position.set(-7, -2, -5);
  scene.add(fill);

  const root = new THREE.Group();
  root.position.z = MODEL_Z_OFFSET;
  scene.add(root);
  const jawGroups = { upper: new THREE.Group(), lower: new THREE.Group() };
  jawGroups.upper.name = 'upper';
  jawGroups.lower.name = 'lower';
  root.add(jawGroups.upper, jawGroups.lower);

  const geometries = new Set();
  const materials = new Set();

  const gumMat = new THREE.MeshStandardMaterial({ color: COLORS.gum, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  materials.add(gumMat);

  // Build teeth
  const teeth = new Map(); // id -> record
  const toothMeshes = [];
  for (const jaw of ['upper', 'lower']) {
    const upper = jaw === 'upper';
    const arch = buildArch(ARCH[jaw].c, ARCH[jaw].zFront);
    const dims = DIMS[jaw];
    const centers = [];
    let acc = 0;
    for (let k = 0; k < 8; k++) {
      centers.push(acc + dims.w[k] / 2 + TOOTH_GAP / 2);
      acc += dims.w[k] + TOOTH_GAP;
    }
    const quads = upper ? [1, 2] : [3, 4];
    for (const q of quads) {
      const side = q === 2 || q === 3 ? 1 : -1; // patient's left appears on viewer's right
      for (let k = 1; k <= 8; k++) {
        const id = q * 10 + k;
        const kind = kindOf(k);
        const w = dims.w[k - 1];
        const d = dims.d[k - 1];
        const s = centers[k - 1];
        const h = gumDepth(s) + SUNK;
        const a = arch.at(s);
        const Tx = a.tx;
        const Tz = side > 0 ? a.tz : -a.tz;

        const geom = makeToothGeometry(kind, w, d, h);
        geometries.add(geom);
        const mat = new THREE.MeshStandardMaterial({ color: COLORS.tooth, roughness: 0.55, metalness: 0 });
        materials.add(mat);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.userData.fdi = id;
        if (upper) mesh.rotation.x = Math.PI;

        const pivot = new THREE.Group();
        pivot.position.set(side * a.x, (upper ? 1 : -1) * (MOUTH_GAP / 2 + h), a.z);
        pivot.rotation.y = Math.atan2(-Tz, Tx);
        pivot.add(mesh);
        jawGroups[jaw].add(pivot);

        const ys = upper ? -1 : 1; // pivot-local direction towards occlusal plane
        teeth.set(id, {
          id, jaw, upper, kind, w, d, h, mesh, pivot, mat,
          gumY: ys * SUNK, // gum line in pivot space (pivot sits at the crown base)
          labelLocal: new THREE.Vector3(0, ys * (SUNK - 0.5), 1.0),
          crownLocal: new THREE.Vector3(0, ys * (SUNK + (h - SUNK) * 0.5), 0),
        });
        toothMeshes.push(mesh);
      }
    }
    const L = acc + 0.12;
    const gumGeom = makeGumGeometry(arch, L, upper ? 1 : -1);
    geometries.add(gumGeom);
    const gum = new THREE.Mesh(gumGeom, gumMat);
    gum.userData.gum = true;
    jawGroups[jaw].add(gum);
  }
  root.updateMatrixWorld(true);

  // Current-tooth ring + halo
  const ringGeom = new THREE.TorusGeometry(1, 0.05, 10, 72);
  const haloGeom = new THREE.RingGeometry(0.93, 1.0, 72);
  geometries.add(ringGeom);
  geometries.add(haloGeom);
  const ringMat = new THREE.MeshBasicMaterial({ color: COLORS.current, transparent: true, opacity: 0.9, depthWrite: false });
  const haloMat = new THREE.MeshBasicMaterial({ color: COLORS.current, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
  materials.add(ringMat);
  materials.add(haloMat);
  const marker = new THREE.Group();
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.rotation.x = Math.PI / 2;
  const halo = new THREE.Mesh(haloGeom, haloMat);
  halo.rotation.x = -Math.PI / 2;
  marker.add(ring, halo);
  marker.visible = false;
  let markerBase = { rx: 1, rz: 1 };

  // Controls
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4.5;
  controls.maxDistance = 30;
  controls.minPolarAngle = 0.05;
  controls.maxPolarAngle = Math.PI - 0.05;
  controls.rotateSpeed = 0.8;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.7;
  const TARGET_MIN = new THREE.Vector3(-5, -3, -4.5);
  const TARGET_MAX = new THREE.Vector3(5, 3, 4.5);

  // State
  let width = 0;
  let height = 0;
  let disposed = false;
  let raf = 0;
  let tween = null;
  let showLabels = options.showLabels !== false;
  let jawMode = 'both';
  let hovered = null;
  let plan = { current: null, next: [], treated: [] };
  const clickCbs = new Set();
  const hoverCbs = new Set();
  const tags = []; // { el, id, kind, text, x, y, visible }
  let hoverTag = null;

  const defaultDir = new THREE.Vector3(0.36, 0.3, 1).normalize();
  const defaultTarget = new THREE.Vector3(0, -0.1, 0);
  function defaultCamPos() {
    const aspect = width && height ? width / height : 1.5;
    const dist = 15 * Math.max(1, 1.6 / aspect);
    // На узких экранах смотрим почти анфас, чтобы дуга целиком влезала в кадр
    const dir = aspect < 1 ? new THREE.Vector3(0.12, 0.3, 1).normalize() : defaultDir;
    return defaultTarget.clone().addScaledVector(dir, dist);
  }
  camera.position.copy(defaultCamPos());
  controls.target.copy(defaultTarget);
  controls.update();

  /* ---------- sizing ---------- */
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    const first = !width;
    width = w;
    height = h;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (first && !tween) {
      camera.position.copy(defaultCamPos());
      controls.target.copy(defaultTarget);
      controls.update();
    }
  }
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(resize);
    ro.observe(container);
  } else {
    window.addEventListener('resize', resize);
  }
  resize();

  /* ---------- appearance ---------- */
  function stateOf(id) {
    if (plan.current === id) return 'current';
    if (plan.next.includes(id)) return 'next';
    if (plan.treated.includes(id)) return 'treated';
    return 'normal';
  }

  function applyStyles() {
    for (const t of teeth.values()) {
      const st = stateOf(t.id);
      const isHover = hovered === t.id;
      const m = t.mat;
      m.color.setHex(st === 'current' ? COLORS.current : st === 'next' ? COLORS.next : st === 'treated' ? COLORS.treated : COLORS.tooth);
      m.roughness = st === 'next' ? 0.45 : st === 'current' ? 0.5 : 0.55;
      if (st === 'current') {
        m.emissive.setHex(COLORS.current);
        m.emissiveIntensity = isHover ? 0.45 : 0.22;
      } else if (isHover) {
        m.emissive.setHex(0xffffff);
        m.emissiveIntensity = st === 'next' ? 0.1 : 0.08;
      } else {
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 1;
      }
      t.mesh.scale.setScalar(isHover ? 1.03 : 1);
    }
  }

  function placeMarker() {
    if (marker.parent) marker.parent.remove(marker);
    const t = plan.current != null ? teeth.get(plan.current) : null;
    if (!t) {
      marker.visible = false;
      return;
    }
    t.pivot.add(marker);
    marker.position.set(0, t.gumY + (t.upper ? -0.03 : 0.03), 0);
    markerBase = { rx: t.w * 0.55 + 0.1, rz: t.d * 0.55 + 0.1 };
    marker.visible = true;
  }

  /* ---------- labels ---------- */
  function clearTags() {
    for (const t of tags) t.el.remove();
    tags.length = 0;
  }
  function makeTag(kind, text, id) {
    const el = document.createElement('div');
    el.className = `jaw-tag jaw-tag--${kind}`;
    el.textContent = text;
    el.hidden = true;
    overlay.appendChild(el);
    return { el, id, kind, text, x: 0, y: 0, visible: false };
  }
  function rebuildTags() {
    clearTags();
    if (plan.current != null) tags.push(makeTag('current', `1 · ${plan.current}`, plan.current));
    plan.next.forEach((id, i) => tags.push(makeTag('next', `${i + 2} · ${id}`, id)));
  }
  hoverTag = makeTag('hover', '', null);

  const tmpV = new THREE.Vector3();
  function jawVisible(jaw) {
    return jawMode === 'both' || jawMode === jaw;
  }
  function positionTag(tag) {
    const t = tag.id != null ? teeth.get(tag.id) : null;
    let vis = !!t && showLabels && width > 0 && jawVisible(t.jaw);
    if (vis) {
      tmpV.copy(t.labelLocal);
      t.pivot.localToWorld(tmpV);
      tmpV.project(camera);
      if (tmpV.z > 1 || tmpV.z < -1) vis = false;
      else {
        tag.x = (tmpV.x + 1) * 0.5 * width;
        tag.y = (1 - tmpV.y) * 0.5 * height;
        tag.el.style.transform = `translate(${tag.x.toFixed(1)}px,${tag.y.toFixed(1)}px) translate(-50%,-50%)`;
      }
    }
    if (vis !== tag.visible) {
      tag.visible = vis;
      tag.el.hidden = !vis;
    }
  }
  function updateLabels() {
    for (const tag of tags) positionTag(tag);
    const planIds = [plan.current, ...plan.next];
    hoverTag.id = hovered != null && !planIds.includes(hovered) ? hovered : null;
    const txt = hoverTag.id != null ? String(hoverTag.id) : '';
    if (txt !== hoverTag.text) {
      hoverTag.text = txt;
      hoverTag.el.textContent = txt;
    }
    positionTag(hoverTag);
  }

  /* ---------- picking ---------- */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const candidates = toothMeshes.filter((m) => jawVisible(teeth.get(m.userData.fdi).jaw));
    const gums = [];
    for (const jaw of ['upper', 'lower']) {
      if (!jawVisible(jaw)) continue;
      jawGroups[jaw].children.forEach((c) => c.userData.gum && gums.push(c));
    }
    const hits = raycaster.intersectObjects([...candidates, ...gums], false);
    if (!hits.length) return null;
    const fdi = hits[0].object.userData.fdi;
    return fdi != null ? fdi : null; // gum in front blocks picking
  }

  function setHovered(id) {
    if (id === hovered) return;
    hovered = id;
    canvas.style.cursor = id != null ? 'pointer' : '';
    applyStyles();
    for (const cb of hoverCbs) {
      try { cb(id); } catch (e) { console.error(e); }
    }
  }

  let down = null;
  let pointerPos = null;
  let pointerDirty = false;
  function onPointerDown(e) {
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }
  function onPointerUp(e) {
    const d = down;
    down = null;
    if (!d || d.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
    if (e.button !== undefined && e.button !== 0) return;
    const id = pick(e.clientX, e.clientY);
    if (id == null) return;
    for (const cb of clickCbs) {
      try { cb(id); } catch (err) { console.error(err); }
    }
  }
  function onPointerMove(e) {
    if (e.pointerType === 'touch') return;
    pointerPos = { x: e.clientX, y: e.clientY };
    pointerDirty = true;
  }
  function onPointerLeave() {
    pointerPos = null;
    pointerDirty = false;
    if (!down) setHovered(null);
  }
  function onPointerCancel() {
    down = null;
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('pointercancel', onPointerCancel);

  /* ---------- camera animation ---------- */
  function onControlsStart() {
    tween = null;
  }
  controls.addEventListener('start', onControlsStart);

  function animateTo(pos, target, dur = 600) {
    tween = {
      p0: camera.position.clone(),
      t0: controls.target.clone(),
      p1: pos.clone(),
      t1: target.clone().clamp(TARGET_MIN, TARGET_MAX),
      start: performance.now(),
      dur,
    };
  }

  /* ---------- loop ---------- */
  const clampTmp = new THREE.Vector3();
  function render() {
    renderer.render(scene, camera);
  }
  function frame(now) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    if (!width || !height) return;

    if (tween) {
      const k = clamp((now - tween.start) / tween.dur, 0, 1);
      const e = easeInOutCubic(k);
      camera.position.lerpVectors(tween.p0, tween.p1, e);
      controls.target.lerpVectors(tween.t0, tween.t1, e);
      if (k >= 1) tween = null;
    }
    controls.update();
    // keep pan within reasonable bounds
    clampTmp.copy(controls.target).clamp(TARGET_MIN, TARGET_MAX).sub(controls.target);
    if (clampTmp.lengthSq() > 0) {
      controls.target.add(clampTmp);
      camera.position.add(clampTmp);
    }

    // pulse
    if (marker.visible) {
      const tt = now / 1000;
      const breathe = 1 + 0.06 * Math.sin(tt * Math.PI * 2 * 0.9);
      ring.scale.set(markerBase.rx * breathe, markerBase.rz * breathe, 1);
      ringMat.opacity = 0.65 + 0.3 * (0.5 + 0.5 * Math.sin(tt * Math.PI * 2 * 0.9));
      const ph = (tt % 1.6) / 1.6;
      const hs = 1 + 0.55 * ph;
      halo.scale.set(markerBase.rx * hs, markerBase.rz * hs, 1);
      haloMat.opacity = 0.45 * (1 - ph);
    }

    if (pointerDirty && !down && pointerPos) {
      pointerDirty = false;
      setHovered(pick(pointerPos.x, pointerPos.y));
    }

    render();
    updateLabels();
  }
  raf = requestAnimationFrame(frame);

  /* ---------- public API ---------- */
  const toId = (v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return teeth.has(n) ? n : null;
  };

  const viewer = {
    setPlan(p = {}) {
      p = p || {};
      const current = toId(p.current);
      const next = [];
      for (const v of Array.isArray(p.next) ? p.next : []) {
        const id = toId(v);
        if (id != null && id !== current && !next.includes(id)) next.push(id);
      }
      const treated = [];
      for (const v of Array.isArray(p.treated) ? p.treated : []) {
        const id = toId(v);
        if (id != null && id !== current && !next.includes(id) && !treated.includes(id)) treated.push(id);
      }
      plan = { current, next: next.slice(0, 2), treated };
      applyStyles();
      placeMarker();
      rebuildTags();
      if (width) updateLabels();
    },

    focusTooth(id) {
      const t = teeth.get(Number(id));
      if (!t) return;
      root.updateMatrixWorld(true);
      const center = t.pivot.localToWorld(t.crownLocal.clone());
      const dir = new THREE.Vector3(center.x, 0, center.z + 0.8);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      const dist = 7.5 * Math.max(1, 1.2 / (width && height ? width / height : 1.5));
      const pos = center.clone().addScaledVector(dir, dist);
      pos.y += t.upper ? -0.6 : 3.0;
      animateTo(pos, center);
    },

    resetView() {
      animateTo(defaultCamPos(), defaultTarget);
    },

    onToothClick(cb) {
      if (typeof cb !== 'function') return () => {};
      clickCbs.add(cb);
      return () => clickCbs.delete(cb);
    },

    onToothHover(cb) {
      if (typeof cb !== 'function') return () => {};
      hoverCbs.add(cb);
      return () => hoverCbs.delete(cb);
    },

    setShowLabels(v) {
      showLabels = !!v;
      if (width) updateLabels();
    },

    setJaw(mode) {
      if (mode !== 'upper' && mode !== 'lower') mode = 'both';
      jawMode = mode;
      jawGroups.upper.visible = jawVisible('upper');
      jawGroups.lower.visible = jawVisible('lower');
      if (hovered != null && !jawVisible(teeth.get(hovered).jaw)) setHovered(null);
      if (width) updateLabels();
    },

    snapshot() {
      if (!width || !height) return '';
      controls.update();
      render();
      updateLabels();
      const src = renderer.domElement;
      const c = document.createElement('canvas');
      c.width = src.width;
      c.height = src.height;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(src, 0, 0);
      // draw visible labels so they appear in the exported image
      const s = c.width / width;
      ctx.font = `600 ${11 * s}px Inter, system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      for (const tag of [...tags, hoverTag]) {
        if (!tag.visible || !tag.text) continue;
        const tw = ctx.measureText(tag.text).width;
        const bw = tw + 12 * s;
        const bh = 19 * s;
        const x = tag.x * s - bw / 2;
        const y = tag.y * s - bh / 2;
        if (tag.kind === 'hover') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x, y, bw, bh);
          ctx.strokeStyle = '#111111';
          ctx.lineWidth = s;
          ctx.strokeRect(x + s / 2, y + s / 2, bw - s, bh - s);
          ctx.fillStyle = '#111111';
        } else {
          ctx.fillStyle = tag.kind === 'current' ? '#B3261E' : '#111111';
          ctx.fillRect(x, y, bw, bh);
          ctx.fillStyle = '#ffffff';
        }
        ctx.fillText(tag.text, tag.x * s, tag.y * s + 0.5 * s);
      }
      return c.toDataURL('image/png');
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      controls.removeEventListener('start', onControlsStart);
      controls.dispose();
      clickCbs.clear();
      hoverCbs.clear();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove();
      overlay.remove();
      releaseStyle();
    },
  };

  if (options.jaw) viewer.setJaw(options.jaw);
  viewer.setPlan(options.plan || {});
  return viewer;
}
