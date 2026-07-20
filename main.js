import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ─── Constants ───────────────────────────────────────────────────────────────
const NUM_LAYERS = 3;
const BASE_RADIUS = 2;
const LAYER_SPACING = 0.7;
const OPACITY_STEP = 0.25;
const NODE_RADIUS = 0.06;
const SUBDIVISIONS = 2;       // geodesic frequency
const DEFAULT_COLOR = 0x00ffff;
const GRAY = 0x555555;

// ─── Scene Setup ─────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.5;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 10);

scene.add(new THREE.AmbientLight(0xffffff, 0.15));

// ─── Post-processing (bloom) ─────────────────────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.5, 0.1);
composer.addPass(bloom);

// ─── Controls ────────────────────────────────────────────────────────────────
const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;

const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.setMode('translate');
transformControls.addEventListener('dragging-changed', e => {
  orbitControls.enabled = !e.value;
});
scene.add(transformControls);

// ─── State ───────────────────────────────────────────────────────────────────
let allLightNodes = [];
let layers = [];
let selectedNode = null;
let currentProgram = { name: 'Untitled', duration: 30, keyframes: [] };
let isPlaying = false;
let playStartTime = null;

// ─── Geodesic point generation (icosphere) ───────────────────────────────────
function generateGeodesicPoints(radius, freq) {
  const geo = new THREE.IcosahedronGeometry(radius, freq);
  const pos = geo.attributes.position;
  const points = [];
  const seen = new Set();
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i).normalize().multiplyScalar(radius);
    const key = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
    if (!seen.has(key)) { seen.add(key); points.push(v.clone()); }
  }
  geo.dispose();
  return points;
}

// ─── Build Lattice ───────────────────────────────────────────────────────────
function buildSphereLattice() {
  for (let li = 0; li < NUM_LAYERS; li++) {
    const radius = BASE_RADIUS + li * LAYER_SPACING;
    const opacity = 1.0 - li * OPACITY_STEP;
    const positions = generateGeodesicPoints(radius, SUBDIVISIONS);
    const group = new THREE.Group();

    positions.forEach(pos => {
      const node = createLightNode(pos, opacity);
      group.add(node);
      allLightNodes.push(node);
    });

    // Struts
    buildStruts(positions, opacity);

    scene.add(group);
    layers.push({ radius, group, positions, baseOpacity: opacity });
  }
}

function createLightNode(position, baseOpacity) {
  const geo = new THREE.SphereGeometry(NODE_RADIUS, 8, 8);
  const mat = new THREE.MeshBasicMaterial({
    color: DEFAULT_COLOR,
    transparent: true,
    opacity: baseOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const node = new THREE.Mesh(geo, mat);
  node.position.copy(position);
  node.userData = {
    id: crypto.randomUUID(),
    color: DEFAULT_COLOR,
    opacity: baseOpacity,
    status: 'active',
    connections: []
  };
  return node;
}

function buildStruts(positions, opacity) {
  // Connect each point to its nearest neighbours (within threshold)
  const threshold = (BASE_RADIUS * 2 * Math.PI) / (10 * SUBDIVISIONS);
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      if (positions[i].distanceTo(positions[j]) < threshold * 1.5) {
        const geom = new THREE.BufferGeometry().setFromPoints([positions[i], positions[j]]);
        const mat = new THREE.LineBasicMaterial({ color: 0x336688, opacity: opacity * 0.35, transparent: true });
        scene.add(new THREE.Line(geom, mat));
      }
    }
  }
}

// ─── Raycasting / Selection ───────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

canvas.addEventListener('click', e => {
  if (transformControls.dragging) return;
  mouse.set(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(allLightNodes);
  if (hits.length > 0) {
    selectNode(hits[0].object);
  } else {
    deselectNode();
  }
});

function selectNode(node) {
  selectedNode = node;
  transformControls.attach(node);
  orbitControls.enabled = false;
  openNodeEditor(node);
}

function deselectNode() {
  selectedNode = null;
  transformControls.detach();
  orbitControls.enabled = true;
  document.getElementById('node-editor').classList.add('hidden');
}

// ─── Node Editor UI ──────────────────────────────────────────────────────────
function openNodeEditor(node) {
  const panel = document.getElementById('node-editor');
  panel.classList.remove('hidden');
  const colorHex = '#' + node.material.color.getHexString();
  document.getElementById('node-color').value = colorHex;
  document.getElementById('node-opacity').value = node.material.opacity;
  document.getElementById('node-status').value = node.userData.status;
}

document.getElementById('node-color').addEventListener('input', e => {
  if (!selectedNode) return;
  selectedNode.material.color.set(e.target.value);
  selectedNode.userData.color = e.target.value;
});

document.getElementById('node-opacity').addEventListener('input', e => {
  if (!selectedNode) return;
  selectedNode.material.opacity = parseFloat(e.target.value);
  selectedNode.userData.opacity = parseFloat(e.target.value);
});

document.getElementById('node-status').addEventListener('change', e => {
  if (!selectedNode) return;
  selectedNode.userData.status = e.target.value;
  if (e.target.value === 'defective') {
    selectedNode.material.color.set(GRAY);
    flashNode(selectedNode);
  }
});

document.getElementById('btn-delete-node').addEventListener('click', () => {
  if (!selectedNode) return;
  selectedNode.parent.remove(selectedNode);
  allLightNodes = allLightNodes.filter(n => n !== selectedNode);
  deselectNode();
});

document.getElementById('btn-duplicate-node').addEventListener('click', () => {
  if (!selectedNode) return;
  const clone = createLightNode(
    selectedNode.position.clone().addScalar(0.2),
    selectedNode.userData.opacity
  );
  clone.material.color.copy(selectedNode.material.color);
  scene.add(clone);
  allLightNodes.push(clone);
});

document.getElementById('btn-close-editor').addEventListener('click', deselectNode);

function flashNode(node) {
  let count = 0;
  const interval = setInterval(() => {
    node.visible = !node.visible;
    if (++count >= 6) { node.visible = true; clearInterval(interval); }
  }, 150);
}

// ─── Timeline & Programs ─────────────────────────────────────────────────────
const scrubber = document.getElementById('timeline-scrubber');
const timeDisplay = document.getElementById('timeline-time');
scrubber.addEventListener('input', () => { timeDisplay.textContent = parseFloat(scrubber.value).toFixed(1) + 's'; });

document.getElementById('btn-add-keyframe').addEventListener('click', addKeyframeAtCurrentTime);

function addKeyframeAtCurrentTime() {
  const t = parseFloat(scrubber.value);
  const nodeStates = allLightNodes.map(n => ({
    nodeId: n.userData.id,
    color: n.material.color.getHex(),
    opacity: n.material.opacity
  }));
  currentProgram.keyframes.push({ time: t, nodeStates });
  currentProgram.keyframes.sort((a, b) => a.time - b.time);
  refreshKeyframeList();
}

function refreshKeyframeList() {
  const list = document.getElementById('keyframe-list');
  list.innerHTML = '';
  currentProgram.keyframes.forEach((kf, i) => {
    const div = document.createElement('div');
    div.className = 'keyframe-item';
    div.textContent = `KF ${i + 1} @ ${kf.time.toFixed(1)}s  (${kf.nodeStates.length} nodes)`;
    div.addEventListener('click', () => applyKeyframe(kf));
    list.appendChild(div);
  });
}

function applyKeyframe(kf) {
  kf.nodeStates.forEach(ns => {
    const node = allLightNodes.find(n => n.userData.id === ns.nodeId);
    if (!node) return;
    node.material.color.setHex(ns.color);
    node.material.opacity = ns.opacity;
  });
}

// ─── Playback ─────────────────────────────────────────────────────────────────
document.getElementById('btn-play').addEventListener('click', () => {
  isPlaying = true;
  playStartTime = performance.now();
});
document.getElementById('btn-stop').addEventListener('click', () => { isPlaying = false; });

function stepProgramPlayback() {
  const elapsed = (performance.now() - playStartTime) / 1000;
  const looping = document.getElementById('loop-toggle').checked;
  let t = elapsed;
  if (t > currentProgram.duration) {
    if (looping) { playStartTime = performance.now(); t = 0; }
    else { isPlaying = false; return; }
  }
  scrubber.value = t;
  timeDisplay.textContent = t.toFixed(1) + 's';

  const kfs = currentProgram.keyframes;
  if (kfs.length < 2) return;
  let prev = kfs[0], next = kfs[kfs.length - 1];
  for (let i = 0; i < kfs.length - 1; i++) {
    if (kfs[i].time <= t && kfs[i + 1].time >= t) { prev = kfs[i]; next = kfs[i + 1]; break; }
  }
  const span = next.time - prev.time;
  const alpha = span === 0 ? 1 : (t - prev.time) / span;

  prev.nodeStates.forEach((ps, idx) => {
    const ns = next.nodeStates[idx];
    if (!ns) return;
    const node = allLightNodes.find(n => n.userData.id === ps.nodeId);
    if (!node) return;
    const cA = new THREE.Color(ps.color);
    const cB = new THREE.Color(ns.color);
    node.material.color.copy(cA.lerp(cB, alpha));
    node.material.opacity = ps.opacity + (ns.opacity - ps.opacity) * alpha;
  });
}

// ─── Save / Load ─────────────────────────────────────────────────────────────
function saveProgram(prog) {
  const all = JSON.parse(localStorage.getItem('lightPrograms') || '{}');
  all[prog.name] = prog;
  localStorage.setItem('lightPrograms', JSON.stringify(all));
  refreshProgramDropdown();
}

function loadProgram(name) {
  const all = JSON.parse(localStorage.getItem('lightPrograms') || '{}');
  if (all[name]) {
    currentProgram = all[name];
    document.getElementById('program-name').value = currentProgram.name;
    scrubber.max = currentProgram.duration;
    if (currentProgram.keyframes.length > 0) applyKeyframe(currentProgram.keyframes[0]);
    refreshKeyframeList();
  }
}

function deleteProgram(name) {
  const all = JSON.parse(localStorage.getItem('lightPrograms') || '{}');
  delete all[name];
  localStorage.setItem('lightPrograms', JSON.stringify(all));
  refreshProgramDropdown();
}

function refreshProgramDropdown() {
  const sel = document.getElementById('saved-programs');
  const all = JSON.parse(localStorage.getItem('lightPrograms') || '{}');
  sel.innerHTML = Object.keys(all).map(n => `<option value="${n}">${n}</option>`).join('');
}

document.getElementById('btn-save-program').addEventListener('click', () => {
  currentProgram.name = document.getElementById('program-name').value || 'Untitled';
  currentProgram.duration = parseFloat(scrubber.max);
  saveProgram(currentProgram);
});
document.getElementById('btn-load-program').addEventListener('click', () => {
  loadProgram(document.getElementById('saved-programs').value);
});
document.getElementById('btn-delete-program').addEventListener('click', () => {
  deleteProgram(document.getElementById('saved-programs').value);
});

// ─── Export / Import ─────────────────────────────────────────────────────────
document.getElementById('btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(currentProgram, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = (currentProgram.name || 'program') + '.json'; a.click();
});

document.getElementById('import-file').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => { const prog = JSON.parse(ev.target.result); saveProgram(prog); };
  reader.readAsText(file);
});

// ─── Troubleshoot Mode ────────────────────────────────────────────────────────
document.getElementById('troubleshoot-toggle').addEventListener('change', e => {
  layers.forEach((layer, li) => {
    if (li === 0) return;
    layer.group.children.forEach(node => {
      node.material.opacity = e.target.checked ? layer.baseOpacity * 0.15 : layer.baseOpacity;
    });
  });
  if (e.target.checked) {
    allLightNodes.forEach(n => {
      if (n.userData.status === 'defective') n.material.color.set(0xff2200);
    });
  } else {
    allLightNodes.forEach(n => {
      if (n.userData.status === 'defective') n.material.color.set(GRAY);
      else n.material.color.setHex(n.userData.color);
    });
  }
});

// ─── Resize ───────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Render Loop ──────────────────────────────────────────────────────────────
function renderLoop() {
  requestAnimationFrame(renderLoop);
  orbitControls.update();
  if (isPlaying) stepProgramPlayback();
  composer.render();
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
buildSphereLattice();
loadSavedProgramsList();
renderLoop();

function loadSavedProgramsList() { refreshProgramDropdown(); }
