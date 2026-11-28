import * as THREE from 'three';
import { OrbitControls } from '../vendor/controls/OrbitControls.js';
import { GLTFLoader } from '../vendor/loaders/GLTFLoader.js';
import { HDRLoader } from '../vendor/loaders/HDRLoader.js';
import { RoundedBoxGeometry } from '../vendor/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from '../vendor/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/postprocessing/RenderPass.js';
import { ShaderPass } from '../vendor/postprocessing/ShaderPass.js';
import { SSAOPass } from '../vendor/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from '../vendor/postprocessing/UnrealBloomPass.js';
import { BokehPass } from '../vendor/postprocessing/BokehPass.js';
import { OutputPass } from '../vendor/postprocessing/OutputPass.js';
import * as RAPIER from '../vendor/rapier.mjs';

// ---------------------------------------------------------------- constants
const PHYS_DT = 1 / 120;
const BOWL_CENTER = { x: 0, z: 0.06 };
const FACE_VALUES = [
  { axis: new THREE.Vector3(0, 1, 0), value: 1 },
  { axis: new THREE.Vector3(0, -1, 0), value: 6 },
  { axis: new THREE.Vector3(1, 0, 0), value: 3 },
  { axis: new THREE.Vector3(-1, 0, 0), value: 4 },
  { axis: new THREE.Vector3(0, 0, 1), value: 5 },
  { axis: new THREE.Vector3(0, 0, -1), value: 2 },
];
const PIPS = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const ASSET_V = 'v=20260827d';      // cache-buster: bump on every asset/code change
const DIE_SCALE = 2;                // dice scaled 2x
const BOWL_SCALE = 1.15;            // bowl scaled up a touch
const BOWL_R = 0.165;               // containment radius (scaled)

// ---------------------------------------------------------------- renderer
const IS_COARSE = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
const renderer = new THREE.WebGLRenderer({ antialias: !IS_COARSE, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_COARSE ? 1.5 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;   // contact-soft shadows
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = IS_COARSE ? 1.56 : 1.42;   // 移动端关掉了 Bloom，用曝光补偿亮度
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060203);
scene.fog = new THREE.FogExp2(0x060203, 1.05);          // distant fade to black
const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.01, 30);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0.07, 0.045, 0.04);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 0.15;
controls.maxDistance = 2.4;
controls.minPolarAngle = 0.15;
controls.maxPolarAngle = Math.PI * 0.52;

const CAM_DIR = new THREE.Vector3(0.26, 0.55, 0.84).normalize();
function fitCamera() {
  const aspect = innerWidth / innerHeight;
  const base = aspect >= 1 ? 0.82 : 1.05 * Math.pow(1.05 / aspect, 0.55);
  const dist = Math.min(base, 2.0);
  camera.position.copy(controls.target).addScaledVector(CAM_DIR, dist);
}
fitCamera();

// ---------------------------------------------------------------- lighting
const key = new THREE.DirectionalLight(0xffc98a, 2.0);
key.position.set(0.3, 0.8, -0.75);          // warm light behind the screen -> lattice shadows
key.target.position.set(0, 0, 0.1);
key.castShadow = true;
key.shadow.mapSize.set(IS_COARSE ? 1024 : 2048, IS_COARSE ? 1024 : 2048);
key.shadow.camera.left = -0.6; key.shadow.camera.right = 0.6;
key.shadow.camera.top = 0.7; key.shadow.camera.bottom = -0.5;
key.shadow.camera.near = 0.1; key.shadow.camera.far = 3.0;
key.shadow.bias = -0.0002;
key.shadow.normalBias = 0.001;
key.shadow.intensity = 0.9;
key.shadow.radius = 7;                      // VSM: soft penumbra
key.shadow.blurSamples = IS_COARSE ? 8 : 10;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0xffd0a0, 0.6);
rim.position.set(-0.5, 0.35, -0.3);
scene.add(rim);
const fill = new THREE.DirectionalLight(0xcdd7f2, 0.78);   // cool counter-light
fill.position.set(0.55, 0.5, 0.45);
scene.add(fill);
scene.add(new THREE.HemisphereLight(0xffe0c8, 0x241612, IS_COARSE ? 0.74 : 0.62));

// 碗上方聚光灯：给碗内骰子补出真实接触阴影（烛光是点光无阴影，方向光被碗壁挡）
const bowlSpot = new THREE.SpotLight(0xffc9a0, 1.5, 1.8, 0.55, 0.9, 1.5);
bowlSpot.position.set(0.14, 0.44, -0.09);
bowlSpot.target.position.set(-0.01, 0.0, 0.03);
bowlSpot.castShadow = true;
bowlSpot.shadow.mapSize.set(IS_COARSE ? 512 : 1024, IS_COARSE ? 512 : 1024);
bowlSpot.shadow.camera.near = 0.1;
bowlSpot.shadow.camera.far = 1.2;
bowlSpot.shadow.bias = -0.0005;
bowlSpot.shadow.normalBias = 0.0015;
bowlSpot.shadow.radius = 3;
bowlSpot.shadow.intensity = 1.0;
scene.add(bowlSpot, bowlSpot.target);

// ---------------------------------------------------------------- textures
const texLoader = new THREE.TextureLoader();
function pbrTex(url, srgb, rx, ry = rx) {
  const t = texLoader.load(url);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

// ---------------------------------------------------------------- set: table / wall
{ // room: red brocade wallpaper on all four walls (hi-fi: gold-thread normal + sheen)
  const wallMat = () => new THREE.MeshStandardMaterial({
    map: pbrTex(`./assets/wallpaper_red.jpg?${ASSET_V}`, true, 4.2, 2.6),
    normalMap: pbrTex(`./assets/wallpaper_red_nor.jpg?${ASSET_V}`, false, 4.2, 2.6),
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughnessMap: pbrTex(`./assets/wallpaper_red_rough.jpg?${ASSET_V}`, false, 4.2, 2.6),
    roughness: 1.0,
  });
  const mkWall = (w, h, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat());
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    scene.add(m);
  };
  mkWall(2.4, 1.6, 0, 0.55, -0.44, 0);            // back
  mkWall(2.2, 1.6, -0.9, 0.55, 0.35, Math.PI / 2);  // left
  mkWall(2.2, 1.6, 0.9, 0.55, 0.35, -Math.PI / 2);  // right
  mkWall(2.4, 1.6, 0, 0.55, 1.3, Math.PI);          // front (behind camera)
}

const gltfLoader = new GLTFLoader();
function loadGLB(url) { return gltfLoader.loadAsync(url); }

const P = './assets/props/props_dl';
const [dieGltf, bowlGltf, mooncakeGltf, teaTableGltf, teaSetGltf,
       basket1Gltf, basket2Gltf, brassGltf, branchesGltf, candelabraGltf] = await Promise.all([
  loadGLB(`./assets/die.glb?${ASSET_V}`), loadGLB(`./assets/bowl.glb?${ASSET_V}`),
  loadGLB(`./assets/mooncake.glb?${ASSET_V}`),
  loadGLB(`${P}/chinese_tea_table/chinese_tea_table_1k.gltf?${ASSET_V}`),
  loadGLB(`${P}/tea_set_01/tea_set_01_1k.gltf?${ASSET_V}`),
  loadGLB(`${P}/wicker_basket_01/wicker_basket_01_1k.gltf?${ASSET_V}`),
  loadGLB(`${P}/wicker_basket_02/wicker_basket_02_1k.gltf?${ASSET_V}`),
  loadGLB(`${P}/brass_vase_01/brass_vase_01_1k.gltf?${ASSET_V}`),
  loadGLB(`${P}/dry_branches_medium_01/dry_branches_medium_01_1k.gltf?${ASSET_V}`),
  loadGLB(`${P}/wooden_lantern_01/wooden_lantern_01_1k.gltf?${ASSET_V}`),
]);

function shadowed(node, receive = true) {
  node.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = receive; } });
  return node;
}

function place(node, x, y, z, { s = 1, ry = 0 } = {}) {
  shadowed(node);
  node.scale.setScalar(s);
  node.rotation.y = ry;
  node.position.set(x, y, z);
  scene.add(node);
  return node;
}

// normalize a model: scale so (width|height) hits target, base sits on y
function placeScaled(node, x, z, target, { ry = 0, mode = 'w', y = 0 } = {}) {
  shadowed(node);
  const box = new THREE.Box3().setFromObject(node);
  const size = box.getSize(new THREE.Vector3());
  const cur = mode === 'h' ? size.y : Math.max(size.x, size.z);
  const s = target / cur;
  node.scale.setScalar(s);
  node.rotation.y = ry;
  node.position.set(x, y - box.min.y * s, z);
  scene.add(node);
  return { node, box, s };
}

// ---- composition: long table feast, candle-lit, black fade distance ----
{ // 拉长中式茶桌 (1.7x width)
  const t = teaTableGltf.scene;
  shadowed(t);
  t.scale.set(1.7, 1, 1);
  t.position.set(0, -0.499, 0);
  scene.add(t);
}
{ // glossy dark walnut floor
  const floorMat = new THREE.MeshStandardMaterial({
    map: pbrTex(`./assets/woodfloor/WoodFloor043_1K-JPG_Color.jpg?${ASSET_V}`, true, 3),
    normalMap: pbrTex(`./assets/woodfloor/WoodFloor043_1K-JPG_NormalGL.jpg?${ASSET_V}`, false, 3),
    roughnessMap: pbrTex(`./assets/woodfloor/WoodFloor043_1K-JPG_Roughness.jpg?${ASSET_V}`, false, 3),
    roughness: 0.9,
    color: 0x6b4a38,
    envMapIntensity: 0.5,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.5;
  floor.receiveShadow = true;
  scene.add(floor);
}

// 中式木烛灯 hero light prop (lit candle inside glass lantern)
placeScaled(candelabraGltf.scene, 0.03, -0.17, 0.30, { mode: 'h', ry: -0.2 });
const candleLight = new THREE.PointLight(0xff9a45, 2.0, 2.2, 2);
candleLight.position.set(0.03, 0.15, -0.17);
scene.add(candleLight);
const flames = [];
{ // simple billboard flames (canvas radial gradient)
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 70, 2, 64, 64, 60);
  g.addColorStop(0, 'rgba(255,230,160,1)');
  g.addColorStop(0.35, 'rgba(255,160,60,0.85)');
  g.addColorStop(1, 'rgba(255,90,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  sp.scale.set(0.02, 0.03, 1);
  sp.position.set(0.03, 0.145, -0.17);
  scene.add(sp);
  flames.push(sp);
}

// 已移除截图中圈出的异常大餐盘，避免贴图与比例干扰主体

// 铜瓶枯枝（雅致中式花艺）：黄铜瓶 + 干枝直立，放到烛光扫得到的左侧
{
  const v = placeScaled(brassGltf.scene, -0.44, 0.02, 0.30, { mode: 'h', ry: 0.5 });
  v.node.traverse((o) => { if (o.isMesh) { o.material.envMapIntensity = 1.6; o.material.needsUpdate = true; } });
}
{ // dry branches leaning beside the vase (never intersecting the vessel body)
  const br = branchesGltf.scene;
  shadowed(br);
  const box = new THREE.Box3().setFromObject(br);
  const size = box.getSize(new THREE.Vector3());
  const s = 0.5 / size.z;
  br.scale.setScalar(s);
  br.rotation.set(-Math.PI / 3.0, 0.15, -0.28);        // angled outward, not pierced through
  br.position.set(-0.36, 0.25, 0.02);
  scene.add(br);
  const cardPart = br.getObjectByName('dry_branches_medium_01_c');
  if (cardPart) cardPart.visible = false;              // packaging card, not a branch
}

// 原有中式摆件（保留，错位防穿模）
placeScaled(basket2Gltf.scene, -0.66, -0.20, 0.19, { mode: 'h', ry: 0.9 });// 高竹编 far-back-left
placeScaled(basket1Gltf.scene, 0.62, -0.16, 0.10, { ry: -0.4 });           // 扁竹篮 far-back-right

// cherry-pick teaware from the tea ceremony set (whole set spreads too wide)
function extract(node, name, x, z, s = 0.55, ry = 0, anchorName = null) {
  const src = node.getObjectByName(name);
  if (!src) return null;
  const anchor = anchorName ? node.getObjectByName(anchorName) : src;
  const c = src.clone(true);
  c.position.copy(src.position).sub(anchor.position);   // keep offset within its cluster
  const g = new THREE.Group();
  g.add(c);
  return place(g, x, 0, z, { s, ry });
}
extract(teaSetGltf.scene, 'tea_set_01_teapot_01', 0.28, 0.155, 0.55, -0.5);
extract(teaSetGltf.scene, 'tea_set_01_teapot_01_lid', 0.28, 0.155, 0.55, -0.5, 'tea_set_01_teapot_01');
extract(teaSetGltf.scene, 'tea_set_01_sugar_cup_01', 0.37, 0.23, 0.55, 0.4);
extract(teaSetGltf.scene, 'tea_set_01_sugar_cup_01_lid', 0.37, 0.23, 0.55, 0.4, 'tea_set_01_sugar_cup_01');
extract(teaSetGltf.scene, 'tea_set_01_cup_small_01', 0.31, 0.27, 0.55, 0.2);


// ---------------------------------------------------------------- physics
await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
world.timestep = PHYS_DT;
// crisper contacts for dice piled in the curved bowl
try { world.integrationParameters.numSolverIterations = 8; } catch (_) { }
const events = new RAPIER.EventQueue(true);

{ // table collider
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.0175, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.65, 0.0175, 0.5).setFriction(0.5).setRestitution(0.3), body);
}

// bowl: visual (inner white / outer red / foot) + trimesh collider (concave, real rolling inside)
const bowlVisual = bowlGltf.scene;
const bowlColNode = bowlGltf.scene.getObjectByName('BowlCollider');
bowlColNode.removeFromParent();
shadowed(bowlVisual);
{ // procedural kiln-glaze maps (mottle / speckle / roughness variation)
  function glazeTex(url, srgb) {
    const t = texLoader.load(url);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false;                 // glTF UV convention
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  const redColor = glazeTex(`./assets/glaze_red_color.jpg?${ASSET_V}`, true);
  const redRough = glazeTex(`./assets/glaze_red_rough.jpg?${ASSET_V}`, false);
  bowlVisual.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name === 'BowlOuter' || o.name === 'BowlInner') {
      // 内外同祭红釉；漆面光泽（薄釉层 + 低釉糙度）
      o.material.map = redColor;
      o.material.roughnessMap = redRough;
      o.material.roughness = 1.0;    // driven by map
      o.material.color.set(0xffffff);
      o.material.clearcoat = 0.3;
      o.material.clearcoatRoughness = 0.18;
      o.material.envMapIntensity = 0.45;
    }
    o.material.needsUpdate = true;
  });
}
{ // soft contact shadow under the bowl (grounds it)
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const ctx = cv.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  grad.addColorStop(0, 'rgba(0,0,0,0.5)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.42),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.set(BOWL_CENTER.x, 0.0006, BOWL_CENTER.z);
  scene.add(blob);
}
bowlVisual.scale.setScalar(BOWL_SCALE);
bowlVisual.position.set(BOWL_CENTER.x, 0, BOWL_CENTER.z);
scene.add(bowlVisual);
{
  const geo = bowlColNode.geometry;
  const verts = Float32Array.from(geo.getAttribute('position').array, (v) => v * BOWL_SCALE);
  let idx = geo.index ? geo.index.array : null;
  if (!idx) {
    idx = new Uint32Array(geo.getAttribute('position').count);
    for (let i = 0; i < idx.length; i++) idx[i] = i;
  }
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(BOWL_CENTER.x, 0, BOWL_CENTER.z));
  world.createCollider(
    RAPIER.ColliderDesc.trimesh(verts, idx).setFriction(0.22).setRestitution(0.78),
    body
  );
}

// ---------------------------------------------------------------- dice
const colliderNode = dieGltf.scene.getObjectByName('Collider');
colliderNode.removeFromParent();
const hullPoints = Float32Array.from(colliderNode.geometry.getAttribute('position').array, (v) => v * DIE_SCALE);
const dieTemplate = dieGltf.scene;
{ // brushed-metal maps on the die body (enamel pips come from GLB materials)
  function brushedTex(url, srgb) {
    const t = texLoader.load(url);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  const body = dieTemplate.getObjectByName('Die');
  if (body && body.isMesh) {
    body.material.map = brushedTex(`./assets/brushed_color.jpg?${ASSET_V}`, true);
    body.material.roughnessMap = brushedTex(`./assets/brushed_rough.jpg?${ASSET_V}`, false);
    body.material.roughness = 1.0;              // map drives absolute roughness
    body.material.normalMap = brushedTex(`./assets/brushed_nor.jpg?${ASSET_V}`, false);
    body.material.normalScale = new THREE.Vector2(0.5, 0.5);
    body.material.color.set(0xffffff);
    body.material.envMapIntensity = 1.15;      // metal lives on reflections
    body.material.needsUpdate = true;
  }
}
dieTemplate.traverse((o) => { if (o.isMesh) o.castShadow = true; });

const dice = [];
let rolling = false;
let settledTimer = 0;

function makeDie() {
  const node = dieTemplate.clone(true);
  node.scale.setScalar(DIE_SCALE);
  scene.add(node);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic());
  body.enableCcd(true);
  body.setLinearDamping(0.01);
  body.setAngularDamping(0.02);
  const colDesc = RAPIER.ColliderDesc.convexHull(hullPoints);
  colDesc.setDensity(7800);          // metal die
  colDesc.setFriction(0.22);
  colDesc.setRestitution(0.78);
  colDesc.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
  colDesc.setContactForceEventThreshold(0.004);
  world.createCollider(colDesc, body);
  return { node, body };
}
for (let i = 0; i < 6; i++) dice.push(makeDie());

// 每颗骰子的软接触影（碗内真阴影被碗壁和点光吃掉，用 blob 保证落地感）
const dieShadowTex = (() => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.72)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.42)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
})();
const dieShadows = dice.map(() => {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.052, 0.052),
    new THREE.MeshBasicMaterial({ map: dieShadowTex, transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  scene.add(m);
  return m;
});

function rand(a, b) { return a + Math.random() * (b - a); }

function throwDie(die, sector = 0) {
  const b = die.body;
  // spread aim points across bowl sectors so dice land in different spots
  const ang = sector * (Math.PI * 2 / 6) + rand(-0.35, 0.35);
  const rr = rand(0.01, 0.06);
  const tx = Math.cos(ang) * rr, tz = 0.02 + Math.sin(ang) * rr;
  const px = rand(-0.06, 0.06), pz = 0.02 + rand(-0.06, 0.08), py = rand(0.18, 0.26);
  const t = rand(0.14, 0.2);                                     // real cast speed ~1-2 m/s
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rand(0, Math.PI * 2), rand(0, Math.PI * 2), rand(0, Math.PI * 2)));
  b.setTranslation({ x: px, y: py, z: pz }, true);
  b.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
  // horizontal velocity toward target, rotated by a random swirl angle
  // so dice hit the curved wall and rattle around the bowl
  let vx = (tx - px) / t, vz = (tz - pz) / t;
  const swirl = rand(-0.5, 0.5);
  const cs = Math.cos(swirl), sn = Math.sin(swirl);
  [vx, vz] = [vx * cs - vz * sn, vx * sn + vz * cs];
  b.setLinvel({ x: vx, y: (0.02 - py) / t - 0.5 * 9.81 * t, z: vz }, true);
  const axis = new THREE.Vector3().randomDirection();
  const spin = rand(25, 45) * (Math.random() < 0.5 ? -1 : 1);
  b.setAngvel({ x: axis.x * spin, y: axis.y * spin, z: axis.z * spin }, true);
  b.wakeUp();
}

function inBowl(t) {
  const dx = t.x - BOWL_CENTER.x, dz = t.z - BOWL_CENTER.z;
  return Math.hypot(dx, dz) < BOWL_R && t.y > -0.01 && t.y < 0.14;
}

// ---------------------------------------------------------------- interaction state
// Audio is intentionally disabled: the visual simulation is silent.


// ---------------------------------------------------------------- bobing rules (中文 + 拼音)
function bobing(vals) {
  const c = [0, 0, 0, 0, 0, 0, 0];
  vals.forEach((v) => c[v]++);
  if (c[4] === 4 && c[1] === 2) return ['状元插金花', 'Zhuàngyuán Chā Jīnhuā', 5];
  if (c[4] === 6) return ['满堂红', 'Mǎntánghóng', 5];
  if (c[4] === 5) return ['五红', 'Wǔhóng', 5];
  if (c[1] === 6) return ['遍地锦', 'Biàndìjǐn', 4];
  if (c.some((k, i) => i >= 1 && k === 6)) return ['六勃黑', 'Liùbóhēi', 4];
  if (c.some((k, i) => i >= 1 && i !== 4 && k === 5)) return ['五子登科', 'Wǔzǐ Dēngkē', 4];
  if (c[4] === 4) return ['状元', 'Zhuàngyuán', 3];
  if (c.slice(1).every((k) => k === 1)) return ['对堂', 'Duìtáng', 3];
  if (c[4] === 3) return ['三红', 'Sānhóng', 2];
  if (c.some((k, i) => i >= 1 && i !== 4 && k === 4)) return ['四进', 'Sìjìn', 2];
  if (c[4] === 2) return ['二举', 'Èrjǔ', 1];
  if (c[4] === 1) return ['一秀', 'Yīxiù', 1];
  return ['无博', 'Wúbó', 0];
}

// ---------------------------------------------------------------- result UI
const up = new THREE.Vector3(0, 1, 0);
function readFace(die) {
  const r = die.body.rotation();
  const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
  let best = null, bestDot = -2;
  for (const f of FACE_VALUES) {
    const d = f.axis.clone().applyQuaternion(q).dot(up);
    if (d > bestDot) { bestDot = d; best = f.value; }
  }
  return { value: best, flat: bestDot > 0.985 };
}

const valsEl = document.getElementById('vals');
const slipOverlay = document.getElementById('slip-overlay');
slipOverlay.addEventListener('pointerdown', (e) => {
  if (e.target.closest('#slip-paper')) { e.stopPropagation(); return; }  // 点纸不关
  e.stopPropagation();
  slipOverlay.classList.remove('show');                                   // 点旁边关闭
});

function dieFaceEl(v, lean, delay) {
  const el = document.createElement('div');
  el.className = 'df' + ((v === 1 || v === 4) ? ' red' : '') + (lean ? ' lean' : '');
  el.style.animationDelay = `${delay}ms`;
  for (let i = 0; i < 9; i++) {
    const p = document.createElement('i');
    if (PIPS[v].includes(i)) p.className = 'on';
    el.appendChild(p);
  }
  return el;
}

function showRolling() {
  valsEl.innerHTML = '<span class="rolling">—</span>';
}
function showResult() {
  const reads = dice.map(readFace);
  const vals = reads.map((r) => r.value);
  const [cn, py, lv] = bobing(vals);
  valsEl.innerHTML = '';
  reads.forEach((r, i) => valsEl.appendChild(dieFaceEl(r.value, !r.flat, i * 60)));
  // haptics disabled to keep the experience silent & free of browser warnings
  // 纸条：仿真纸签，居中展开
  document.getElementById('slip-title').textContent = cn;
  document.getElementById('slip-pinyin').textContent = py;
  document.getElementById('slip-level').textContent = lv > 0 ? `Lv. ${lv}` : 'Lv. 0';
  slipOverlay.classList.add('show');
  clearTimeout(showResult._t);
  showResult._t = setTimeout(() => slipOverlay.classList.remove('show'), 4600);
}

// ---------------------------------------------------------------- roll SFX
const SFX = {
  castAll: new Audio('./assets/sfx_cast_all.wav'),      // 冰落杯中 — 整把六骰齐掷
  castMulti: [1, 2, 3, 4, 5].map((i) => new Audio(`./assets/sfx_cast_multi_${i}.mp3`)), // 混合变体×5 随机
  castOne: new Audio('./assets/sfx_cast_one.wav'),      // 金属敲击 — 单颗重落
};
SFX.castAll.volume = 0.55; SFX.castOne.volume = 0.5;
SFX.castMulti.forEach((a) => { a.volume = 0.5; });
function sfx(a) {
  if (window.__ambMuted) return;
  if (Array.isArray(a)) a = a[Math.floor(Math.random() * a.length)];
  try { a.currentTime = 0; a.play().catch(() => {}); } catch { /* pre-gesture */ }
}

// ---------------------------------------------------------------- roll
function roll(src = 'tap') {
  if (rolling) return;
  document.getElementById('slip-overlay').classList.remove('show');   // 收起上一把的纸条
  sfx(src === 'shake' ? SFX.castMulti : SFX.castAll);
  // throw in shuffled sectors with randomized stagger so dice land in sequence
  // and each gets a clean bounce off the porcelain instead of dying in the pile
  const order = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
  dice.forEach((d, i) => setTimeout(() => throwDie(d, order[i]), i * rand(70, 130)));
  rolling = true;
  settledTimer = 0;
  window.__bobing.rolling = true;
  showRolling();
}

// tap empty spot -> roll all; drag a die -> pick it up, flick/drop it yourself
const ray = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;
let grab = null;   // { die, plane, offset, samples:[{p,t}] }

function pickDieAt(e) {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(pointer, camera);
  for (const d of dice) {
    const hits = ray.intersectObject(d.node, true);
    if (hits.length) return { die: d, point: hits[0].point };
  }
  return null;
}

function beginGrab(e, die, point) {
  const t = die.body.translation();
  const camDir = camera.getWorldDirection(new THREE.Vector3());
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir.clone().negate(), point);
  die.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
  die.body.wakeUp();
  grab = {
    die, plane,
    offset: new THREE.Vector3(t.x - point.x, t.y - point.y, t.z - point.z),
    samples: [],
  };
  controls.enabled = false;
  moveGrab(e);
}

function moveGrab(e) {
  if (!grab) return;
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(pointer, camera);
  const hit = new THREE.Vector3();
  if (!ray.ray.intersectPlane(grab.plane, hit)) return;
  hit.add(grab.offset);
  // keep the die inside the play area
  hit.y = THREE.MathUtils.clamp(hit.y, 0.03, 0.45);
  const R = 0.3;
  hit.x = THREE.MathUtils.clamp(hit.x, BOWL_CENTER.x - R, BOWL_CENTER.x + R);
  hit.z = THREE.MathUtils.clamp(hit.z, BOWL_CENTER.z - R, BOWL_CENTER.z + R + 0.1);
  grab.die.body.setNextKinematicTranslation({ x: hit.x, y: hit.y, z: hit.z });
  grab.samples.push({ p: hit.clone(), t: performance.now() });
  if (grab.samples.length > 6) grab.samples.shift();
}

function endGrab() {
  if (!grab) return;
  const { die, samples } = grab;
  let vx = 0, vy = 0, vz = 0;
  if (samples.length >= 2) {
    const a = samples[0], b = samples[samples.length - 1];
    const dt = Math.max(0.016, (b.t - a.t) / 1000);
    vx = (b.p.x - a.p.x) / dt; vy = (b.p.y - a.p.y) / dt; vz = (b.p.z - a.p.z) / dt;
    const sp = Math.hypot(vx, vy, vz);
    const MAX = 4.5;
    if (sp > MAX) { const k = MAX / sp; vx *= k; vy *= k; vz *= k; }
  }
  die.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
  die.body.setLinvel({ x: vx, y: vy, z: vz }, true);
  const axis = new THREE.Vector3().randomDirection();
  const spin = Math.min(20, Math.hypot(vx, vy, vz) * 8 + rand(2, 8));
  die.body.setAngvel({ x: axis.x * spin, y: axis.y * spin, z: axis.z * spin }, true);
  die.body.wakeUp();
  grab = null;
  controls.enabled = true;
  sfx(SFX.castOne);   // 单颗手动落碗
  rolling = true; settledTimer = 0; window.__bobing.rolling = true; showRolling();
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  downAt = [e.clientX, e.clientY];
  if (rolling) return;
  const hit = pickDieAt(e);
  if (hit) {
    beginGrab(e, hit.die, hit.point);
  }
});
renderer.domElement.addEventListener('pointermove', (e) => moveGrab(e));
renderer.domElement.addEventListener('pointerup', (e) => {
  if (grab) { endGrab(); return; }
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  if (rolling) return;
  roll();
});
renderer.domElement.addEventListener('pointercancel', () => endGrab());

// ---------------------------------------------------------------- gyro (mobile): shake to roll, tilt to slosh
const IS_TOUCH_DEVICE = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
let gyroOn = false;
let lastG = { x: 0, z: 0 };
let lastShake = 0;

function applyTilt(betaDeg, gammaDeg) {
  const b = (betaDeg || 0) * Math.PI / 180;
  const g = (gammaDeg || 0) * Math.PI / 180;
  const GAIN = 1.45;                               // 倾斜响应增益，让骰子更跟手
  let gx = 9.81 * Math.sin(g) * Math.cos(b) * GAIN;
  let gz = -9.81 * Math.sin(b) * Math.cos(g) * GAIN;
  const H = 6.2;                                   // cap so dice stay in the bowl
  gx = THREE.MathUtils.clamp(gx, -H, H);
  gz = THREE.MathUtils.clamp(gz, -H, H);
  const gy = -Math.sqrt(Math.max(1, 9.81 * 9.81 - gx * gx - gz * gz));
  world.gravity = { x: gx, y: gy, z: gz };
  if (Math.abs(gx - lastG.x) + Math.abs(gz - lastG.z) > 0.5) {
    dice.forEach((d) => d.body.wakeUp());
  }
  lastG = { x: gx, z: gz };
}

function onOrientation(e) { if (gyroOn) applyTilt(e.beta, e.gamma); }
function onMotion(e) {
  if (!gyroOn) return;
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null) return;
  const mag = Math.hypot(a.x, a.y, a.z);
  const now = performance.now();
  // 轻摇即掷：绝对加速度或偏离重力即触发
  if ((mag > 13.5 || Math.abs(mag - 9.81) > 4.5) && now - lastShake > 900 && !rolling) {
    lastShake = now;
    roll('shake');
  }
}

function enableGyro() {
  if (gyroOn) return;
  gyroOn = true;
  window.addEventListener('deviceorientation', onOrientation);
  window.addEventListener('devicemotion', onMotion);
}

async function armGyro() {
  if (!IS_TOUCH_DEVICE || gyroOn) return;
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission();   // iOS 13+
      if (r !== 'granted') return;
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try { await DeviceMotionEvent.requestPermission(); } catch (_) {}
      }
    }
    if (typeof DeviceOrientationEvent !== 'undefined') enableGyro();
  } catch (_) { /* denied / unsupported */ }
}
// arm on the first touch anywhere (Android: direct; iOS: system permission sheet)
window.addEventListener('pointerdown', () => { armGyro(); }, { once: false, passive: true });

// debug/testing hook
window.__bobing = { roll, dice, world, scene, camera, renderer, rolling: false, applyTilt, enableGyro };

// ---------------------------------------------------------------- environment
new HDRLoader().load(`./assets/studio_1k.hdr?${ASSET_V}`, (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(hdr).texture;
  scene.environmentIntensity = 0.55;
});

// ---------------------------------------------------------------- post pipeline
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
let ssaoPass = null;
if (!IS_COARSE) {
  ssaoPass = new SSAOPass(scene, camera, innerWidth, innerHeight);
  ssaoPass.kernelRadius = 0.035;          // scene is ~0.5 m
  ssaoPass.minDistance = 0.0008;
  ssaoPass.maxDistance = 0.09;
  ssaoPass.output = SSAOPass.OUTPUT.Default;
  composer.addPass(ssaoPass);
}
if (!IS_COARSE) {
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.5, 0.86);
  composer.addPass(bloomPass);
}
if (!IS_COARSE) {
  const bokehPass = new BokehPass(scene, camera, {
    focus: 0.72, aperture: 0.0007, maxblur: 0.010,
  });
  composer.addPass(bokehPass);
}
// film grade: contrast + saturation + subtle grain
const gradePass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    contrast: { value: 1.04 },
    saturation: { value: 1.1 },
    grain: { value: 0.02 },
    time: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float contrast, saturation, grain, time;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + time) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb = (c.rgb - 0.5) * contrast + 0.5;
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, saturation);
      c.rgb += (hash(vUv * 913.0) - 0.5) * grain;
      gl_FragColor = c;
    }
  `,
});
composer.addPass(gradePass);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- main loop
roll();

// adaptive resolution: drop pixel ratio when the GPU can't keep up
let dprNow = Math.min(window.devicePixelRatio, IS_COARSE ? 1.5 : 1.75);
function applyDpr(v) {
  dprNow = v;
  renderer.setPixelRatio(v);
  composer.setPixelRatio(v);
  composer.setSize(innerWidth, innerHeight);
}
let ftAvg = 16, ftCheck = 0;

let last = performance.now();
let acc = 0;
function tick(now) {
  requestAnimationFrame(tick);
  const frameDt = Math.min((now - last) / 1000, 0.05);
  last = now;
  ftAvg = ftAvg * 0.95 + frameDt * 1000 * 0.05;
  if (++ftCheck >= 90) {
    ftCheck = 0;
    if (ftAvg > 22 && dprNow > 1.0) applyDpr(Math.max(1.0, dprNow - 0.25));
  }
  acc += frameDt;
  while (acc >= PHYS_DT) {
    world.step(events);
    acc -= PHYS_DT;
  }
  events.drainContactForceEvents((ev) => {
    const mag = ev.totalForceMagnitude();
    // intentionally silent
  });

  for (const d of dice) {
    const t = d.body.translation(), r = d.body.rotation();
    d.node.position.set(t.x, t.y, t.z);
    d.node.quaternion.set(r.x, r.y, r.z, r.w);
  }
  // 骰子接触影：贴碗底弧面跟随，越高越淡越大
  for (let i = 0; i < dice.length; i++) {
    const t = dice[i].body.translation();
    const s = dieShadows[i];
    const dx = t.x - BOWL_CENTER.x, dz = t.z - BOWL_CENTER.z;
    const rr = Math.hypot(dx, dz);
    const floorStatic = rr < BOWL_R * 1.15 ? 0.0165 + Math.pow(Math.min(rr / BOWL_R, 1), 2) * 0.05 : 0.0006;
    // blob 跟随骰子底面，但最多贴到碗底釉面上方，悬空时淡出
    const blobY = Math.min(t.y - 0.014, floorStatic + 0.0015);
    s.position.set(t.x, blobY, t.z);
    const h = Math.max(t.y - floorStatic, 0);
    const k = Math.max(0, 1 - h * 4);
    s.material.opacity = 1.0 * k;
    const sc = 1 + h * 3.5;
    s.scale.set(sc, sc, 1);
    s.visible = k > 0.02;
  }

  if (rolling) {
    settledTimer += frameDt;
    for (const d of dice) {
      if (d.body.translation().y < -0.25) throwDie(d);   // fell off the world -> recover
    }
    if (settledTimer > 0.6 && dice.every((d) => d.body.isSleeping())) {
      const outliers = dice.filter((d) => !inBowl(d.body.translation()));
      if (outliers.length) {
        outliers.forEach(throwDie);   // 跳出碗的骰子按博饼规矩重掷
        sfx(outliers.length === 1 ? SFX.castOne : SFX.castMulti);
        settledTimer = 0;
      } else {
        rolling = false;
        window.__bobing.rolling = false;
        showResult();
      }
    }
    if (settledTimer > 14) {
      const stuck = dice.filter((d) => !d.body.isSleeping());
      stuck.forEach(throwDie);
      sfx(stuck.length === 1 ? SFX.castOne : SFX.castMulti);
      settledTimer = 0;
    }
  }

  controls.update();
  gradePass.uniforms.time.value = now / 1000;
  // candle flicker
  const fl = 1 + Math.sin(now * 0.0137) * 0.06 + Math.sin(now * 0.031) * 0.05 + (Math.random() - 0.5) * 0.04;
  candleLight.intensity = 2.0 * fl;
  for (let i = 0; i < flames.length; i++) {
    const s = 1 + Math.sin(now * 0.02 + i * 2.1) * 0.12 + (Math.random() - 0.5) * 0.08;
    flames[i].scale.set(0.022 * s, 0.034 * (2 - s), 1);
    flames[i].material.opacity = 0.85 + 0.15 * Math.sin(now * 0.017 + i);
  }
  composer.render();
}
requestAnimationFrame(tick);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  fitCamera();
});
window.addEventListener('orientationchange', () => setTimeout(() => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  fitCamera();
}, 300));

document.getElementById('loading').classList.add('done');
