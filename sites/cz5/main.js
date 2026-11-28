// 长征五号 3D 展示网站 — 主程序（主 agent 集成）
// 板块：总览（英雄机位环绕）/ 结构（爆炸图+标签+悬停高亮）/ 发射（序列由 build/launch.js 驱动）
import * as THREE from 'three';
import CameraControls from 'camera-controls';
import { buildRocket, ROCKET_PARTS } from './build/rocket.js?v=6';
import { buildPad } from './build/pad.js?v=6';
import { buildCZ7, CZ7_SPEC } from './build/rocket_cz7.js?v=1';
import { createLaunch, LAUNCH } from './build/launch.js?v=6';
import { createLaunchAudio } from './build/launchaudio.js?v=6';

CameraControls.install({ THREE });

/* ---------- 种子随机 ---------- */
const SEED = 20260830;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);

/* ---------- 资源就绪钩子 ---------- */
const manager = new THREE.LoadingManager();
let loadingStarted = false;
manager.onStart = () => { loadingStarted = true; };
window.__ready = new Promise((resolve) => {
  manager.onLoad = resolve;
  setTimeout(() => { if (!loadingStarted) resolve(); }, 0);
});
const loader = new THREE.TextureLoader(manager);

/* ---------- 渲染器 / 场景 / 相机 ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.24;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1424);
scene.fog = new THREE.FogExp2(0x0a1424, 0.0011);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.5, 1500);
const controls = new CameraControls(camera, renderer.domElement);
controls.smoothTime = 0.9;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.minDistance = 8;
controls.maxDistance = 260;

/* ---------- 夜空全景（生图 equirect）：背景 + PMREM 环境 ---------- */
const nightTex = loader.load('./assets/env/night_sky.webp');
nightTex.mapping = THREE.EquirectangularReflectionMapping;
nightTex.colorSpace = THREE.SRGBColorSpace;
const spaceTex = loader.load('./assets/env/space_earth.webp');
spaceTex.mapping = THREE.EquirectangularReflectionMapping;
spaceTex.colorSpace = THREE.SRGBColorSpace;
scene.background = nightTex;
// 360° 全景地平线：海侧（全景 u≈0.25）对准 +Z 北；环境旋转保持一致
scene.backgroundRotation = new THREE.Euler(0, Math.PI, 0);
scene.environmentRotation = new THREE.Euler(0, Math.PI, 0);

/* ---------- 夜景灯光 ---------- */
scene.add(new THREE.HemisphereLight(0x24344d, 0x0d0f14, 0.62));

// 海平线余晖：北侧低角度暖方向光（轮廓缘光）
const afterglow = new THREE.DirectionalLight(0xff8a4c, 0.72);
afterglow.position.set(15, 9, 120);
afterglow.target.position.set(0, 20, 0);
scene.add(afterglow, afterglow.target);

// 微弱月光：冷色环境塑形光（让夜空下的场区可读，不死黑）
const moon = new THREE.DirectionalLight(0x9db4d8, 0.22);
moon.position.set(50, 90, -40);
moon.target.position.set(0, 20, 0);
scene.add(moon, moon.target);

// 探照灯 ×3（主光）：从地面斜打箭体
function searchlight(pos, targetPos, intensity, color = 0xfff2df, shadow = false) {
  const s = new THREE.SpotLight(color, intensity);
  s.position.set(...pos);
  s.target.position.set(...targetPos);
  s.angle = 0.26;
  s.penumbra = 0.5;
  s.decay = 2;
  if (shadow) {
    s.castShadow = true;
    s.shadow.mapSize.set(2048, 2048);
    s.shadow.camera.near = 10;
    s.shadow.camera.far = 140;
    s.shadow.normalBias = 0.03;
  }
  scene.add(s, s.target);
  return s;
}
searchlight([-25, 1.6, -22], [0, 34, 0], 12000, 0xfff2df, true); // 西南主灯（唯一投影）
searchlight([25, 1.6, -20], [0, 38, 0], 8600, 0xf4ecff);
searchlight([24, 1.6, 22], [0, 26, 0], 7000, 0xffe8d0);
// 勤务塔泛光（冷色补光，勾塔架轮廓）
const towerFlood = new THREE.SpotLight(0xbfd0e8, 2600, 130, 0.6, 0.7, 2);
towerFlood.position.set(26, 52, -6);
towerFlood.target.position.set(0, 26, 0);
scene.add(towerFlood, towerFlood.target);

/* ---------- 探照灯光柱（体积感：加色锥面，fbm 不需要，低透明即可） ---------- */
function lightBeam(from, to, rEnd = 7) {
  const A = new THREE.Vector3(...from), B = new THREE.Vector3(...to);
  const len = A.distanceTo(B);
  const geo = new THREE.CylinderGeometry(0.45, rEnd, len, 20, 1, true);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(0xfff2df) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform vec3 uColor;
      void main(){ float a = pow(vUv.y, 2.8) * 0.05; gl_FragColor = vec4(uColor, a); }`,
  });
  mat.fog = false;
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize().negate());
  m.name = 'lightBeam';
  return m;
}
scene.add(
  lightBeam([-25, 2.2, -22], [0, 34, 0], 5.5),
  lightBeam([25, 2.2, -20], [0, 38, 0], 5),
  lightBeam([24, 2.2, 22], [0, 26, 0], 5),
);

/* ---------- 长七展示箭的补光（不影响发射区主光比） ---------- */
// 主补：西南低位暖光斜打箭体（唯一为长七投影的灯，让箭落座于基座）
const cz7Spot = new THREE.SpotLight(0xfff2df, 14000, 0, 0.42, 0.55, 2);
cz7Spot.position.set(-62, 3.2, -8);
cz7Spot.target.position.set(-34, 24, 30);
cz7Spot.castShadow = true;
cz7Spot.shadow.mapSize.set(1024, 1024);
cz7Spot.shadow.camera.near = 10;
cz7Spot.shadow.camera.far = 140;
cz7Spot.shadow.normalBias = 0.03;
scene.add(cz7Spot, cz7Spot.target);
// 轮廓补：东北冷色低功率勾边
const cz7Rim = new THREE.SpotLight(0xbfd0e8, 5200, 0, 0.4, 0.6, 2);
cz7Rim.position.set(-8, 4, 58);
cz7Rim.target.position.set(-34, 28, 30);
scene.add(cz7Rim, cz7Rim.target);
scene.add(lightBeam([-62, 3.6, -8], [-34, 26, 30], 6));

/* ---------- 远景环境：360° 全景地平线烘进 equirect 背景（见 assets/env/night_sky.webp），此处不放广告牌 ---------- */

/* ---------- 构件：火箭 + 发射场 ---------- */
const rocket = buildRocket({ THREE, rand, loader, texPath: './assets/textures/rocket/' });
rocket.position.set(0, 8.0, 0);
// 涂装面（局部贴花 θc=45°）转向首屏相机方位 200°，「中国航天」从两枚前助推器之间正对镜头
rocket.rotation.y = THREE.MathUtils.degToRad(155);
scene.add(rocket);

const pad = buildPad({ THREE, rand, loader, texPath: './assets/textures/pad/' });
scene.add(pad);

/* ---------- 长征七号对比展示箭（真实比例：53.1 m / Ø3.35 m，站在与 MLP 同高 8 m 的展示基座上） ---------- */
const badgeCZ7Tex = loader.load('./assets/textures/rocket/badge_cz7.webp');
badgeCZ7Tex.colorSpace = THREE.SRGBColorSpace;
badgeCZ7Tex.anisotropy = 8;
const cz7 = buildCZ7({
  THREE, rand, loader,
  texPath: './assets/textures/rocket/',
  padTexPath: './assets/textures/pad/',
  badgeTex: badgeCZ7Tex,
});
const CZ7_POS = new THREE.Vector3(-34, 8, 30); // 箭体底面圆心（基座台面，与胖五箭体底同高）
cz7.position.copy(CZ7_POS);
// 涂装面（θc=45°）转向总览对比机位方位 ~210°
cz7.rotation.y = THREE.MathUtils.degToRad(165);
scene.add(cz7);

// 高度差虚线：长七顶 → 水平引向胖五 → 竖直段补齐 Δ4.2 m（仅总览并排模式显示）
const CZ5_TOP = 8 + 57.3;                 // 胖五模型顶（世界）
const CZ7_TOP = CZ7_POS.y + CZ7_SPEC.HEIGHT; // 长七顶（世界）
const _dDir = new THREE.Vector3(-CZ7_POS.x, 0, -CZ7_POS.z).normalize();
const _dLen = Math.hypot(CZ7_POS.x, CZ7_POS.z) - 4.5;
const deltaMid = new THREE.Vector3(CZ7_POS.x + _dDir.x * _dLen, CZ7_TOP, CZ7_POS.z + _dDir.z * _dLen);
const deltaTop = new THREE.Vector3(deltaMid.x, CZ5_TOP, deltaMid.z);
const deltaGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(CZ7_POS.x, CZ7_TOP, CZ7_POS.z), deltaMid, deltaTop,
]);
const deltaLine = new THREE.Line(deltaGeo, new THREE.LineDashedMaterial({
  color: 0x6fa8dc, dashSize: 1.1, gapSize: 0.8, transparent: true, opacity: 0.65,
}));
deltaLine.computeLineDistances();
deltaLine.visible = false;
scene.add(deltaLine);

// 红色障碍灯：per-mesh 克隆材质，相位错开闪烁
const beacons = [];
pad.traverse((o) => { if (o.isMesh && /^beacon/.test(o.name)) beacons.push(o); });
beacons.forEach((b, i) => { b.material = b.material.clone(); b.userData.phase = i * 1.93; });

// 关键部件引用（发射序列合同）
const parts = {};
for (const n of ROCKET_PARTS) parts[n] = rocket.getObjectByName(n);
parts.wingL = rocket.getObjectByName('wingL');
parts.wingR = rocket.getObjectByName('wingR');
parts.arm1 = pad.getObjectByName('arm1');
parts.arm2 = pad.getObjectByName('arm2');
parts.mlp = pad.getObjectByName('mlp');

/* ---------- 爆炸图状态 ---------- */
let explodeT = 0, explodeTarget = 0;
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
function applyExplode(k) {
  const e = k * k * (3 - 2 * k); // smoothstep
  for (const n of ROCKET_PARTS) {
    const p = parts[n], ud = p.userData;
    p.position.lerpVectors(ud.assembled, ud.exploded, e);
  }
  // 太阳翼：合拢折起 ↔ 爆炸/分离展开
  const w = parts.payload.userData.wings;
  parts.wingL.rotation.z = THREE.MathUtils.lerp(-w.folded, -w.deployed, e);
  parts.wingR.rotation.z = THREE.MathUtils.lerp(w.folded, w.deployed, e);
}
function setExplode(v, instant = false) {
  explodeTarget = v;
  if (instant) { explodeT = v; applyExplode(explodeT); }
}

/* ---------- 结构板块：HTML 标签（固定槽位 + 引线，绝不跳动） ---------- */
const labelLayer = document.getElementById('labels');
const partLabels = new Map(); // name → { el, line, slot? }
for (const n of ROCKET_PARTS) {
  const ud = parts[n].userData;
  const el = document.createElement('div');
  el.className = 'part-label';
  el.innerHTML = `<b>${ud.label}</b><span>${ud.desc}</span>`;
  const line = document.createElement('div');
  line.className = 'leader';
  labelLayer.appendChild(line);
  labelLayer.appendChild(el);
  partLabels.set(n, { el, line });
}
const _v = new THREE.Vector3(), _box = new THREE.Box3();
let hoveredPart = null;
let labelSlotsPinned = false;
function pinLabelSlots() {
  // 一次性槽位分配：锚点投影分左右两池，池内按世界高度排序，槽位沿屏幕两侧纵向均布
  scene.updateMatrixWorld(true);
  const pools = { L: [], R: [] };
  const tmp = new THREE.Vector3(), bx = new THREE.Box3();
  for (const n of ROCKET_PARTS) {
    bx.setFromObject(parts[n]).getCenter(tmp);
    const wy = tmp.y;
    tmp.project(camera);
    pools[tmp.x < 0 ? 'L' : 'R'].push({ n, wy });
  }
  const margin = innerWidth < 640 ? 96 : innerWidth * 0.19;
  for (const side of ['L', 'R']) {
    const pool = pools[side].sort((a, b) => b.wy - a.wy);
    pool.forEach((p, i) => {
      const slotY = innerHeight * (pool.length === 1 ? 0.5 : 0.16 + 0.68 * (i / (pool.length - 1)));
      const rec = partLabels.get(p.n);
      const w = rec.el.offsetWidth || 150; // 按标签实际宽度钳位，绝不超出屏幕
      const slotX = side === 'L' ? Math.max(margin, w + 18) : Math.min(innerWidth - margin, innerWidth - w - 18);
      rec.slot = { x: slotX, y: slotY, side };
      rec.el.classList.remove('L', 'R');
      rec.el.classList.add(side);
    });
  }
}
function updateLabels() {
  const show = section === 'structure' && explodeT > 0.9;
  if (show && !labelSlotsPinned) { pinLabelSlots(); labelSlotsPinned = true; }
  for (const n of ROCKET_PARTS) {
    const rec = partLabels.get(n);
    const { el, line, slot } = rec;
    if (!show || !slot) { el.style.opacity = 0; line.style.opacity = 0; continue; }
    _box.setFromObject(parts[n]).getCenter(_v);
    _v.project(camera);
    if (_v.z > 1 || _v.z < -1) { el.style.opacity = 0; line.style.opacity = 0; continue; }
    const ax = (_v.x * 0.5 + 0.5) * innerWidth, ay = (-_v.y * 0.5 + 0.5) * innerHeight;
    const op = Math.min(1, (explodeT - 0.9) / 0.1);
    el.style.opacity = op;
    el.style.left = `${slot.x}px`;
    el.style.top = `${slot.y}px`;
    el.classList.toggle('hi', hoveredPart === n);
    const x0 = slot.x + (slot.side === 'L' ? 6 : -6);
    const dx = ax - x0, dy = ay - slot.y;
    line.style.opacity = op;
    line.style.left = `${x0}px`;
    line.style.top = `${slot.y}px`;
    line.style.width = `${Math.hypot(dx, dy)}px`;
    line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  }
}

// 悬停高亮（克隆材质加自发光，离开还原；booster 间共享材质互不影响）
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
function setHighlight(name, on) {
  const p = parts[name]; if (!p) return;
  p.traverse((o) => {
    if (!o.isMesh) return;
    if (on && !o.userData._mat) {
      o.userData._mat = o.material;
      const m = o.material.clone();
      m.emissive = new THREE.Color(0x2456a0);
      m.emissiveIntensity = 0.55;
      o.material = m;
    } else if (!on && o.userData._mat) {
      o.material.dispose();
      o.material = o.userData._mat;
      delete o.userData._mat;
    }
  });
}
renderer.domElement.addEventListener('pointermove', (ev) => {
  if (section !== 'structure' || explodeT < 0.9) return;
  pointer.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(rocket, true);
  let found = null;
  if (hits.length) {
    let o = hits[0].object;
    while (o && o !== rocket) {
      if (ROCKET_PARTS.includes(o.name)) { found = o.name; break; }
      o = o.parent;
    }
  }
  if (found !== hoveredPart) {
    if (hoveredPart) setHighlight(hoveredPart, false);
    hoveredPart = found;
    if (hoveredPart) setHighlight(hoveredPart, true);
    renderer.domElement.style.cursor = hoveredPart ? 'pointer' : '';
  }
});

/* ---------- 发射序列 ---------- */
const launch = createLaunch({
  THREE, rand, scene, camera, controls, rocket, pad, parts,
  env: { nightTex, spaceTex },
  texPath: './assets/textures/launch/',
  loader,
});
scene.add(launch.group);
window.__launch = { seek: (t) => launch.seek(t), reset: () => launch.reset() };

/* ---------- 发射音效（全程序化 Web Audio 合成） ---------- */
const launchAudio = createLaunchAudio();
const btnMute = document.getElementById('btnMute');
btnMute.addEventListener('click', () => {
  const m = !launchAudio.muted;
  launchAudio.setMuted(m);
  btnMute.textContent = m ? '🔇' : '🔊';
});

const hud = document.getElementById('hud');
const countdownEl = document.getElementById('countdown');
const launchMsgEl = document.getElementById('launchMsg');
const btnIgnite = document.getElementById('btnIgnite');
const btnReset = document.getElementById('btnReset');
let launchRunning = false, launchT = 0, launchDone = false;
let camUserHold = false; // 发射中/结束后用户接管相机
const _endTgt = new THREE.Vector3();
function onUserTakeCamera() {
  if (section !== 'launch' || (!launchRunning && !launchDone)) return;
  camUserHold = true;
  launch.cameraEnabled = false;
}
const MILESTONES = [
  [0, '倒计时'], [LAUNCH.T_IGNITE, '点火'], [LAUNCH.T_LIFTOFF, '离台'],
  [LAUNCH.T_BSEP, '助推器分离'], [LAUNCH.T_FAIRING, '整流罩分离'], [LAUNCH.T_S1SEP, '芯一级分离'],
];
function updateLaunchHUD() {
  if (!launchRunning) return;
  const t = launchT;
  countdownEl.style.opacity = t < LAUNCH.T_IGNITE ? 1 : 0;
  if (t < LAUNCH.T_IGNITE) countdownEl.textContent = Math.max(1, Math.ceil(LAUNCH.T_IGNITE - t));
  let msg = '';
  for (const [mt, m] of MILESTONES) if (t >= mt) msg = m;
  launchMsgEl.textContent = msg;
}
btnIgnite.addEventListener('click', () => {
  launchRunning = true; launchDone = false; launchT = 0;
  camUserHold = false; launch.cameraEnabled = true;
  launchAudio.start(0, LAUNCH); // 用户手势内启动 AudioContext（autoplay 合规）
  btnIgnite.style.display = 'none'; btnReset.style.display = '';
  btnReset.textContent = '重 置';
});
btnReset.addEventListener('click', () => {
  launchRunning = false; launchDone = false; launchT = 0;
  camUserHold = false; launch.cameraEnabled = true;
  launchAudio.stop();
  launch.reset();
  applyView('launchpad', true);
  countdownEl.style.opacity = 0; launchMsgEl.textContent = '';
  btnReset.style.display = 'none'; btnIgnite.style.display = '';
});

/* ---------- 机位表与板块切换 ---------- */
const VIEWS = {
  hero:      { pos: [-100, 16, -85], target: [-17, 28, 12] }, // 双箭并览（两箭等距，比例不失真）
  cz5:       { pos: [-33.5, 12, -92], target: [0, 33, 0] },  // 单看胖五（原英雄机位）
  cz7:       { pos: [-73, 17, -37.5],  target: [-34, 30, 30] }, // 单看长七
  exploded:  { pos: [-38, 42, -103],  target: [0, 40, 0] },
  launchpad: { pos: [-34, 7, -42],  target: [0, 22, 0] },
  top:       { pos: [0.01, 150, 0.01], target: [0, 0, 0] },
  nose:      { pos: [-14, 76, -20], target: [0, 62, 0] },
  decal:     { pos: [-5.5, 33.5, -15.0], target: [0, 33.5, 0] }, // 贴花特写（QA 用）
  cz7decal:  { pos: [-46, 32, 8], target: [-34, 30, 30] },        // 长七涂装特写（QA 用）
};
function applyView(name, instant = false) {
  const v = VIEWS[name]; if (!v) return false;
  controls.setLookAt(...v.pos, ...v.target, !instant);
  if (instant) controls.update(0); // camera-controls 的 update 必须给 delta，否则阻尼/过渡计算产生 NaN
  return true;
}

const CAPTIONS = {
  overview: {
    both: ['双箭并立', '长征五号 57 m × 长征七号 53.1 m · 真实比例同场<br>文昌航天发射场 · 夜幕'],
    cz5: ['胖五 · 静待出征', '长征五号运载火箭 · 全高 57 m · 4 枚助推器<br>文昌航天发射场 · 夜幕'],
    cz7: ['长七 · 天舟专车', '长征七号运载火箭 · 全高 53.1 m · 芯级 Ø3.35 m<br>4 枚 Ø2.25 m 助推器 · 比胖五矮 4.2 m、细一圈'],
  },
  structure: ['结构分解', '整流罩 · 天问一号 · 芯二级 · 级间段 · 芯一级 · 助推器<br>悬停查看各段，再点「结构」合拢'],
  launch: ['点火发射', '从点火到芯一级分离 · 全程约 26 秒'],
};
const captionEl = document.getElementById('caption');
let section = 'overview';

/* ---------- 总览：双箭并排 / 单看切换 ---------- */
const rocketSwitchEl = document.getElementById('rocketSwitch');
const topLabelEls = {
  cz5: document.getElementById('tlCZ5'),
  cz7: document.getElementById('tlCZ7'),
  delta: document.getElementById('tlDelta'),
};
let rocketMode = 'both';
function setCaption(name) {
  const c = name === 'overview' ? CAPTIONS.overview[rocketMode] : CAPTIONS[name];
  captionEl.querySelector('h1').textContent = c[0];
  captionEl.querySelector('p').innerHTML = c[1];
}
function setRocketMode(mode, instant = false) {
  rocketMode = mode;
  rocketSwitchEl.querySelectorAll('a[data-rk]').forEach((b) => b.classList.toggle('active', b.dataset.rk === mode));
  rocket.visible = mode !== 'cz7';
  cz7.visible = mode !== 'cz5';
  if (section === 'overview') {
    setCaption('overview');
    applyView(mode === 'cz5' ? 'cz5' : mode === 'cz7' ? 'cz7' : 'hero', instant);
  }
}
rocketSwitchEl.querySelectorAll('a[data-rk]').forEach((b) =>
  b.addEventListener('click', () => setRocketMode(b.dataset.rk)));

// 顶部高度标签（仅总览并排模式）：逐帧投影锚定两箭顶端与 Δ 中点
const _tlv = new THREE.Vector3();
function updateTopLabels() {
  const show = section === 'overview' && rocketMode === 'both';
  deltaLine.visible = show;
  if (!show) {
    for (const el of Object.values(topLabelEls)) el.style.opacity = 0;
    return;
  }
  const anchors = {
    cz5: [0, CZ5_TOP + 1.2, 0],
    cz7: [CZ7_POS.x, CZ7_TOP + 1.2, CZ7_POS.z],
    delta: [deltaMid.x + 2.2, (CZ7_TOP + CZ5_TOP) / 2, deltaMid.z + 0.8],
  };
  for (const [k, p] of Object.entries(anchors)) {
    const el = topLabelEls[k];
    _tlv.set(...p).project(camera);
    if (_tlv.z > 1 || _tlv.z < -1) { el.style.opacity = 0; continue; }
    el.style.opacity = 1;
    el.style.left = `${(_tlv.x * 0.5 + 0.5) * innerWidth}px`;
    el.style.top = `${(-_tlv.y * 0.5 + 0.5) * innerHeight}px`;
  }
}
function switchSection(name, instant = false) {
  const toggleCollapse = name === 'structure' && section === 'structure' && explodeTarget > 0.5;
  section = name;
  document.querySelectorAll('nav a[data-sec]').forEach((b) => b.classList.toggle('active', b.dataset.sec === name));
  setCaption(name);
  captionEl.style.display = name === 'structure' ? 'none' : ''; // 结构页让位给槽位标签
  hud.style.display = name === 'launch' ? 'block' : 'none';
  rocketSwitchEl.style.display = name === 'overview' ? 'flex' : 'none';
  controls.enabled = true;
  if (name !== 'launch') { launchRunning = false; launchAudio.stop(); } // 离开发射板块：停序列、停音效
  if (name !== 'structure') labelSlotsPinned = false; // 离开结构页后重进时按当时视角重排槽位
  if (name !== 'overview') { rocket.visible = true; cz7.visible = true; } // 对比显隐只在总览生效
  if (name === 'overview') {
    setExplode(0, instant);
    rocket.visible = rocketMode !== 'cz7';
    cz7.visible = rocketMode !== 'cz5';
    applyView(rocketMode === 'cz5' ? 'cz5' : rocketMode === 'cz7' ? 'cz7' : 'hero', instant);
  }
  if (name === 'structure') {
    setExplode(toggleCollapse ? 0 : 1, instant);
    applyView('exploded', instant);
  }
  if (name === 'launch') {
    setExplode(0, instant);
    camUserHold = false; launch.cameraEnabled = true;
    launch.reset();
    applyView('launchpad', instant);
    launchRunning = false; launchT = 0;
    countdownEl.style.opacity = 0; launchMsgEl.textContent = '';
    btnReset.style.display = 'none'; btnIgnite.style.display = '';
  }
}
document.querySelectorAll('nav a[data-sec]').forEach((b) =>
  b.addEventListener('click', () => switchSection(b.dataset.sec)));

/* ---------- 自检钩子 ---------- */
window.__scene = scene;
window.__renderer = renderer;
window.__camera = camera;
window.__controls = controls; // QA 用：多方位截图时直接 setLookAt
window.__audio = launchAudio; // QA 用：检查 AudioContext 状态
window.__render = () => renderer.render(scene, camera);
window.__views = Object.fromEntries(Object.keys(VIEWS).map((k) => [k, () => applyView(k, true)]));
window.__setState = (name) => {
  if (name === 'overview') switchSection('overview', true);
  else if (name === 'exploded' || name === 'structure') { switchSection('structure', true); }
  else if (name === 'assembled') { switchSection('structure', true); setExplode(0, true); }
  else if (name === 'launch') switchSection('launch', true);
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  updateLabels(); // shot.py 只放行一帧 rAF，标签需同步刷新一次
  updateTopLabels();
};
window.__rocketMode = (m) => { // QA 用：'both' | 'cz5' | 'cz7'
  setRocketMode(m, true);
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  updateTopLabels();
};

/* ---------- 总览缓慢环绕（拖拽期间不抢镜；小弧度往返摆动，不绕进遮挡物） ---------- */
let lastInteract = -10, isInteracting = false, orbitCenter = null, orbitDir = 1;
controls.addEventListener('controlstart', () => { isInteracting = true; lastInteract = performance.now() / 1000; onUserTakeCamera(); });
controls.addEventListener('controlend', () => { isInteracting = false; lastInteract = performance.now() / 1000; });

/* ---------- 移动端竖屏：拉远机位 ---------- */
function fitViewport() {
  const a = innerWidth / innerHeight;
  const k = a < 0.9 ? Math.min(1.5, 1.05 / a) : 1; // 竖屏拉远，火箭不顶边
  for (const v of Object.values(VIEWS)) {
    v._base ??= [...v.pos];
    v.pos = v._base.map((c, i) => (i === 1 ? c : c * k));
  }
  camera.aspect = a;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
fitViewport();
applyView('hero', true);
addEventListener('resize', fitViewport);

/* ---------- 主循环（动画 = t 的纯函数） ---------- */
const timer = new THREE.Timer();
function tick() {
  timer.update();
  const t = timer.getElapsed();
  const dt = Math.min(timer.getDelta(), 0.05);

  // 障碍灯闪烁（相位错开）
  for (const b of beacons) {
    const s = Math.sin(t * 2.1 + b.userData.phase);
    b.material.emissiveIntensity = 0.35 + 2.6 * (s > 0.2 ? 1 : 0.08);
  }

  // 爆炸图过渡
  if (Math.abs(explodeT - explodeTarget) > 1e-4) {
    explodeT += Math.sign(explodeTarget - explodeT) * Math.min(Math.abs(explodeTarget - explodeT), dt / 1.6);
    applyExplode(explodeT);
  }
  updateLabels();
  updateTopLabels();

  // 总览缓慢环绕：以用户停手方位为中心 ±20° 往返（拖拽中不叠加漂移）
  if (section === 'overview' && !isInteracting && performance.now() / 1000 - lastInteract > 4) {
    if (orbitCenter === null) { orbitCenter = controls.azimuthAngle; orbitDir = 1; }
    const off = controls.azimuthAngle - orbitCenter;
    if (off > 0.35) orbitDir = -1; else if (off < -0.35) orbitDir = 1;
    controls.azimuthAngle += orbitDir * dt * 0.045;
  } else {
    orbitCenter = null;
  }

  // 发射推进
  if (launchRunning) {
    launchT += dt;
    if (launchT >= LAUNCH.DURATION) {
      launchT = LAUNCH.DURATION; launchRunning = false; launchDone = true;
      // 序列结束：相机交给用户（不「卡住」），环绕目标对准远去的二级
      camUserHold = true; launch.cameraEnabled = false;
      parts.stage2.getWorldPosition(_endTgt);
      controls.setLookAt(camera.position.x, camera.position.y, camera.position.z, _endTgt.x, _endTgt.y, _endTgt.z, false);
    }
    launch.seek(launchT);
    launchAudio.update(launchT);
    updateLaunchHUD();
  }
  // 发射中用户拖拽接管视角，松手 2.5s 后交还脚本相机
  if (camUserHold && launchRunning && !isInteracting && performance.now() / 1000 - lastInteract > 2.5) {
    camUserHold = false; launch.cameraEnabled = true;
  }

  controls.update(dt); // 必须传 delta：update() 无参会让 camera-controls 内部阻尼算 NaN，相机矩阵 NaN → 白屏且状态被污染
  window.__render();
}
window.__ready.then(() => {
  // 贴图已全部就位：用夜景全景做 PMREM 环境（金属/湿地面反射来源）
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(nightTex).texture;
  scene.environmentIntensity = 0.62;
  pmrem.dispose();
  document.getElementById('loading')?.remove();
  renderer.setAnimationLoop(tick);
});
