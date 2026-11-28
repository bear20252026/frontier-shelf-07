import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ============================================================
// 配置：76 节骨骼，前躯干稀疏（14 节、近刚性），尾部加密（62 节）
// 依据：斗鱼巡航靠前半身保持稳定，推进主要靠尾柄与尾鳍摆动
// ============================================================
const HEAD_Z = 0.86;
const MID_Z  = 0.05;
const TAIL_Z = -0.90;
const N_HEAD = 14;
const N_TAIL = 62;
const BONE_COUNT = N_HEAD + N_TAIL;   // 76 条主脊柱骨骼
const APPENDAGE_COUNT = 8;             // 左右胸鳍 + 背/腹鳍三段支链
const TOTAL_BONE_COUNT = BONE_COUNT + APPENDAGE_COUNT; // 84 条蒙皮骨骼

const spineZ = new Float32Array(BONE_COUNT);
for (let i = 0; i < N_HEAD; i++) spineZ[i] = HEAD_Z - (HEAD_Z - MID_Z) * (i / N_HEAD);
for (let j = 1; j <= N_TAIL; j++) spineZ[N_HEAD + j - 1] = MID_Z - (MID_Z - TAIL_Z) * (j / N_TAIL);

const segLen = new Float32Array(BONE_COUNT - 1);
const cumLen = new Float32Array(BONE_COUNT);
for (let i = 0; i < BONE_COUNT - 1; i++) {
  segLen[i] = spineZ[i] - spineZ[i + 1];
  cumLen[i + 1] = cumLen[i] + segLen[i];
}
const TOTAL_LEN = cumLen[BONE_COUNT - 1];

const SUBSTEPS = 24;
const FISH_SCALE = 0.5;    // 鱼体积缩小
// 鱼的局部坐标活动范围（× FISH_SCALE 即世界坐标）
const TANK_CENTER = new THREE.Vector3(0, -0.1, 0);
const TANK_RADII  = new THREE.Vector3(2.6, 1.5, 1.8);

const params = { tailFlex: 1.0, swim: 1.0, drag: 1.0 };

window.__errors = [];
addEventListener('error', (e) => window.__errors.push(String(e.message)));

// ============================================================
// 渲染器 / 场景 / 相机
// ============================================================
const renderer = new THREE.WebGLRenderer({ antialias: true });
// 高清模式：最高 2x 像素密度，保留鱼鳞与鳍条细节
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1.0;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x35383a, 0.05);

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0.2, 0.1, 3.6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, -0.05, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.8;
controls.maxDistance = 7;
controls.enablePan = false;
controls.enableRotate = false;   // 视角固定：左键按下不旋转
controls.maxPolarAngle = 1.65;

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

scene.add(new THREE.HemisphereLight(0x25304d, 0x100c14, 0.75));
// 正面补光压暗（整体背光）
const keyLight = new THREE.DirectionalLight(0xe0eaf5, 0.45);
keyLight.position.set(-4, 3.5, 1.5);
scene.add(keyLight);
// 粉色轮廓光（右后）
const rimLight = new THREE.DirectionalLight(0xf0e6ea, 0.9);
rimLight.position.set(3, 1.5, -3.5);
scene.add(rimLight);
// 蓝色轮廓光（左后）
const rimLight2 = new THREE.DirectionalLight(0xe0ecf2, 0.8);
rimLight2.position.set(-3, 2, -3);
scene.add(rimLight2);
// 顶部射灯（展厅吊灯感，压暗）
const pendant = new THREE.SpotLight(0xfff2dd, 0.6, 14, 0.55, 0.9, 1.2);
pendant.position.set(0.5, 5, 0.5);
pendant.target.position.set(0, -0.2, 0);
scene.add(pendant, pendant.target);
const fillLight = new THREE.DirectionalLight(0xa8b8bc, 0.24);
fillLight.position.set(3, 1, 2.5);
scene.add(fillLight);

// ============================================================
// 焦散函数（经典迭代，输入需大偏移避免发散）
// ============================================================
const CAUSTIC_GLSL = /* glsl */`
  float caustic(vec2 uv, float t) {
    vec2 p = mod(uv, 6.2831853) - 250.0;
    vec2 i = p;
    float c = 1.0;
    float inten = 0.005;
    for (int n = 0; n < 4; n++) {
      float tt = t * (1.0 - (3.5 / float(n + 1)));
      i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
    }
    c /= 4.0;
    c = 1.17 - pow(c, 1.4);
    return clamp(pow(abs(c), 7.0), 0.0, 1.5);
  }
`;

// ============================================================
// 背景：深青黑渐变穹顶
// ============================================================
{
  const bgMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 top = vec3(0.045, 0.055, 0.10);
        vec3 mid = vec3(0.025, 0.028, 0.055);
        vec3 bot = vec3(0.012, 0.012, 0.025);
        vec3 col = h > 0.0 ? mix(mid, top, pow(h, 0.8))
                           : mix(mid, bot, pow(-h, 0.6));
        vec3 winDir = normalize(vec3(-0.55, 0.3, -0.75));
        float glow = pow(max(dot(d, winDir), 0.0), 5.0);
        col += vec3(0.5, 0.55, 0.8) * glow * 0.06;
        float n = fract(sin(dot(d.xy * 411.0, vec2(12.9898, 78.233))) * 43758.5453);
        col += (n - 0.5) * 0.008;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(35, 32, 24), bgMat));
}

// ============================================================
// 第一层：路人视频背景（高斯模糊/颗粒/色散预处理过）
// ============================================================
{
  const vid = document.getElementById('bgvid');
  vid.preload = 'auto';

  const vidTex = new THREE.VideoTexture(vid);
  vidTex.colorSpace = THREE.SRGBColorSpace;
  vidTex.repeat.set(0.8, 0.78);
  vidTex.offset.set(0.1, 0.22);
  const vidMat = new THREE.MeshBasicMaterial({ fog: false });

  // 海报帧兜底（视频未加载前显示；后台标签页媒体延迟加载时也能出画面）
  new THREE.TextureLoader().load('./bg_poster.jpg', (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.repeat.set(0.8, 0.78);
    t.offset.set(0.1, 0.22);
    if (!vidMat.map) { vidMat.map = t; vidMat.needsUpdate = true; }
  });
  const useVideo = () => { vidMat.map = vidTex; vidMat.needsUpdate = true; };
  vid.addEventListener('playing', useVideo);
  if (!vid.paused && vid.readyState >= 2) useVideo();
  const tryPlay = () => vid.play().catch(() => {});
  tryPlay();
  addEventListener('pointermove', tryPlay);

  const vidPlane = new THREE.Mesh(new THREE.PlaneGeometry(18, 9), vidMat);
  vidPlane.position.set(0, -0.8, -9);
  scene.add(vidPlane);
}

// ============================================================
// 第二层：黑色钛金属窗墙（背光深黑 + 清漆轮廓高光）
// ============================================================
const windowWall = new THREE.Group();
scene.add(windowWall);
{
  const glassDark = new THREE.MeshBasicMaterial({
    color: 0x0a1018, transparent: true, opacity: 0.06, depthWrite: false, fog: false,
  });
  new GLTFLoader().load('./alu_window.glb', (gltf) => {
    const proto = gltf.scene;
    // 纯黑无贴图：只用几何和清漆边缘高光表现窗框
    const frameMetal = new THREE.MeshPhysicalMaterial({
      color: 0x000000,
      metalness: 0.72,
      roughness: 0.0,
      envMapIntensity: 0.0,
      clearcoat: 0.75,
      clearcoatRoughness: 0.0,
    });
    frameMetal.needsUpdate = true;

    proto.traverse((o) => {
      if (!o.isMesh) return;
      const matName = (o.material && o.material.name || '').toLowerCase();
      o.material = matName.includes('glass') ? glassDark : frameMetal;
    });
    // 模型实际尺寸：高 2、宽 1.2892（Z 朝前）。四扇统一朝向并按真实宽度对齐，
    // 不再交替镜像，消除相邻窗扇在接缝处的互插
    const S = 2.9;
    // 在下半幅大玻璃内增加细分格条与金属节点，提升窗墙层次但不改变拼接关系
    const vBarGeo = new THREE.BoxGeometry(0.016, 1.42, 0.012);
    const hBarGeo = new THREE.BoxGeometry(0.016, 0.012, 0.55);
    const boltGeo = new THREE.SphereGeometry(0.010, 8, 6);
    for (let i = 0; i < 4; i++) {
      const w = proto.clone();
      for (const z of [-0.314, 0.316]) {
        const vBar = new THREE.Mesh(vBarGeo, frameMetal);
        vBar.position.set(-0.023, -0.26, z);
        w.add(vBar);
        const hBar = new THREE.Mesh(hBarGeo, frameMetal);
        hBar.position.set(-0.023, -0.25, z);
        w.add(hBar);
        const bolt = new THREE.Mesh(boltGeo, frameMetal);
        bolt.position.set(-0.034, -0.25, z);
        w.add(bolt);
      }
      w.scale.setScalar(S);
      w.rotation.y = Math.PI / 2;
      w.position.set((i - 1.5) * 1.2892 * S, -0.3, -4.5);
      windowWall.add(w);
    }
  });
}

// 窗下实体墙：与窗框底边相接并延伸到画外，遮住露出的背景视频
{
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x11151b,
    roughness: 0.92,
    metalness: 0.0,
    envMapIntensity: 0.15,
  });
  const lowerWall = new THREE.Mesh(new THREE.BoxGeometry(18, 4.5, 0.16), wallMat);
  lowerWall.position.set(0, -5.45, -4.48);   // 顶面 y=-3.2，与窗框底边齐平
  scene.add(lowerWall);
}

// ============================================================
// 角落水草装饰（Sketchfab Pond Weed，保留原贴图）
// ============================================================
{
  new GLTFLoader().load('./pond_weed.glb', (gltf) => {
    const proto = gltf.scene;
    proto.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material.roughness = 0.9;
        o.material.envMapIntensity = 0.25;
        if ('emissive' in o.material) { o.material.emissive = new THREE.Color(0x16301c); o.material.emissiveIntensity = 0.35; }
      }
    });
    const spots = [
      { x: -2.55, y: -2.5, z: -1.3, s: 1.6, ry: 0.4 },
      { x: 2.65, y: -2.5, z: -1.2, s: 1.4, ry: -2.2 },
      { x: 1.9, y: -2.55, z: -2.3, s: 1.1, ry: 1.1 },
    ];
    for (const p of spots) {
      const w = proto.clone();
      w.scale.setScalar(p.s);
      w.position.set(p.x, p.y, p.z);
      w.rotation.x = -Math.PI / 2;   // Z-up 模型立起
      w.rotation.z = p.ry;
      scene.add(w);
    }
  });
}

// 顶部水面（飘动、带反射光）
let topWaterMat;
{
  topWaterMat = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec2 vXZ;
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vXZ = wp.xz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      varying vec2 vXZ;
      varying vec3 vWorld;
      ${CAUSTIC_GLSL}
      void main() {
        float c = caustic(vXZ * 0.8, uTime * 0.6) + caustic(vXZ * 0.45 + 7.3, uTime * 0.4);
        // 回到原先的金色水线焦散与纵深反射
        float depthGlow = smoothstep(3.0, -4.0, vWorld.z);
        float band = smoothstep(0.55, 1.0, 1.0 - abs(vWorld.z + 0.5) * 0.28);
        vec3 col = vec3(1.0, 0.85, 0.6) * c * 1.3
                 + vec3(0.9, 0.95, 1.0) * band * 0.28;
        float a = clamp(c * 1.1 + band * 0.3, 0.0, 1.0) * depthGlow;
        gl_FragColor = vec4(col * depthGlow, a);
      }`,
  });
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), topWaterMat);
  surf.rotation.x = Math.PI / 2;
  surf.position.set(0, 1.25, -1.0);
  scene.add(surf);
}

// 水体光柱（微弱）
const rayPlanes = [];
{
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 256;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(64, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 64; x++) {
      const t01 = y / 255;
      const a = Math.pow(Math.max(0, Math.sin(Math.min(t01 * 1.15, 1) * Math.PI)), 1.2)
              * (1 - t01) * 1.6
              * Math.pow(Math.sin((x / 63) * Math.PI), 1.5);
      const i = (y * 64 + x) * 4;
      img.data[i] = 235; img.data[i + 1] = 230; img.data[i + 2] = 250;
      img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  for (let i = 0; i < 3; i++) {
    const m = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.06,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.9 + Math.random() * 0.8, 6.5), m);
    p.position.set(-2.5 + i * 2.0, 1.0, -2.2 - Math.random() * 2);
    p.rotation.z = 0.3;
    p.rotation.y = -0.4 + i * 0.35;
    p.userData.phase = Math.random() * 6;
    rayPlanes.push(p);
    scene.add(p);
  }
}

// 浮游微粒（开阔水体）
let plankton, planktonBase;
{
  const N = 380;
  planktonBase = new Float32Array(N * 3);
  const posArr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    planktonBase[i * 3]     = (Math.random() - 0.5) * 7;
    planktonBase[i * 3 + 1] = -1.8 + Math.random() * 3.6;
    planktonBase[i * 3 + 2] = (Math.random() - 0.5) * 5;
  }
  posArr.set(planktonBase);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  plankton = new THREE.Points(g, new THREE.PointsMaterial({
    color: 0xe8f2f0, size: 0.014, transparent: true, opacity: 0.42,
    depthWrite: false, sizeAttenuation: true,
  }));
  scene.add(plankton);
}

// 气泡
let bubbles, bubbleData;
{
  const N = 26;
  bubbleData = [];
  const posArr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    bubbleData.push({
      x: (Math.random() - 0.5) * 3,
      y: -1.8 + Math.random() * 3.2,
      z: (Math.random() - 0.5) * 3,
      v: 0.2 + Math.random() * 0.3,
      ph: Math.random() * 7,
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  bubbles = new THREE.Points(g, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.028, transparent: true, opacity: 0.35,
    depthWrite: false, sizeAttenuation: true,
  }));
  scene.add(bubbles);
}

// ============================================================
// 后期：原始高清输出（仅线性 → sRGB 转换）
// 不做曝光、Tone Mapping、折射、色差、颗粒或暗角，避免贴图失真
// ============================================================
const gradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAspect;
    uniform vec2 uTexel;
    varying vec2 vUv;

    void main() {
      // 原始场景输出：不做曝光、Tone Mapping、折射、滤镜或噪点
      vec3 col = texture2D(tDiffuse, vUv).rgb;

      // 仅做显示必需的线性 → sRGB 转换
      col = pow(max(col, 0.0), vec3(1.0 / 2.2));
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// 后期链：场景 → 高清输出；离屏目标启用 4x MSAA 抑制鳍条锯齿
const composer = new EffectComposer(renderer);
composer.renderTarget1.samples = 4;
composer.renderTarget2.samples = 4;
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight),
  0.3,    // 强度：只留水面微光
  0.55,   // 半径
  0.95    // 阈值：只让水面焦散发光，鱼的高光不进 bloom
);
// bloomPass 关闭：保持贴图本色
// composer.addPass(bloomPass);
const gradePass = new ShaderPass(gradeShader);
composer.addPass(gradePass);

function updateRTSize() {
  const pr = renderer.getPixelRatio();
  composer.setPixelRatio(pr);
  composer.setSize(innerWidth, innerHeight);
  gradePass.uniforms.uAspect.value = innerWidth / innerHeight;
  gradePass.uniforms.uTexel.value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr));
}
updateRTSize();

// ============================================================
// 骨骼 + 蒙皮
// ============================================================
const bones = [];
let skinnedMesh = null;
let skeletonHelper = null;

const finBones = [];

function buildSkeleton() {
  const root = new THREE.Bone();
  root.name = 'Spine_00_Head';
  root.position.set(0, 0, spineZ[0]);
  bones.push(root);
  let prev = root;
  for (let i = 1; i < BONE_COUNT; i++) {
    const b = new THREE.Bone();
    b.name = `Spine_${String(i).padStart(2, '0')}`;
    b.position.set(0, 0, -segLen[i - 1]);
    prev.add(b);
    bones.push(b);
    prev = b;
  }

  // 独立鳍部支链：胸鳍左右分开；背/腹鳍仿尾扇——Root/Tip 同点共挂同一脊柱节，
  // 仅旋转相位不同，膜片在两根骨间渐变蒙皮时不会产生跨脊柱塌陷（杜绝黑破面）
  const addFin = (name, parentIndex, position) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.copy(position);
    bones[parentIndex].add(b);
    bones.push(b);
    finBones.push(b);
    return b;
  };
  addFin('Pectoral_L', 4, new THREE.Vector3(-0.28, 0.02, 0));
  addFin('Pectoral_R', 4, new THREE.Vector3(0.28, 0.02, 0));
  addFin('Dorsal_Root', 7, new THREE.Vector3(0, 0.34, 0));
  addFin('Dorsal_Tip', 7, new THREE.Vector3(0, 0.34, 0));
  addFin('Ventral_Root', 7, new THREE.Vector3(0, -0.34, 0));
  addFin('Ventral_Tip', 7, new THREE.Vector3(0, -0.34, 0));
  addFin('Caudal_Upper', 48, new THREE.Vector3(0, 0.12, 0));
  addFin('Caudal_Lower', 48, new THREE.Vector3(0, -0.12, 0));
  return root;
}

function spineParam(z) {
  if (z >= spineZ[0]) return 0;
  if (z <= spineZ[BONE_COUNT - 1]) return BONE_COUNT - 1;
  let lo = 0, hi = BONE_COUNT - 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (spineZ[mid] >= z && z >= spineZ[mid + 1]) { lo = mid; break; }
    if (z > spineZ[mid]) hi = mid - 1; else lo = mid + 1;
  }
  const f = (spineZ[lo] - z) / (spineZ[lo] - spineZ[lo + 1]);
  return lo + THREE.MathUtils.clamp(f, 0, 1);
}

// 结构化刷权重：体块分区 + 全边界渐变（smoothstep 交叉淡化）
// body = 躯干核心；caudal = 尾柄/尾扇；dorsal/ventral = 背腹鳍；pectoral = 左右胸鳍
// 原则：任何体块交界处（鳍-躯干、鳍根-鳍尖、尾扇上下、胸鳍左右）相邻顶点必须共享
// 骨骼影响，权重随空间位置连续变化，旋转/摆动时才不会拉丝。
function paintWeights(geometry) {
  const count = geometry.attributes.position.count;
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const posAttr = geometry.attributes.position;
  const add = (items, bone, weight) => {
    if (weight > 1e-5) items.push([bone, weight]);
  };
  // 脊柱余量按 u 线性拆给相邻两节，避免 round(u) 硬切
  const addSpine = (items, u, w) => {
    if (w <= 1e-5) return;
    const base = Math.min(Math.floor(u), BONE_COUNT - 1);
    const f = THREE.MathUtils.clamp(u - base, 0, 1);
    add(items, base, w * (1 - f));
    if (base + 1 <= BONE_COUNT - 1) add(items, base + 1, w * f);
  };
  const write = (v, items) => {
    const merged = new Map();
    for (const [bone, weight] of items) merged.set(bone, (merged.get(bone) || 0) + weight);
    const sorted = [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    let sum = sorted.reduce((a, x) => a + x[1], 0);
    if (sum < 1e-8) { sorted.push([0, 1]); sum = 1; }
    for (let k = 0; k < 4; k++) {
      skinIndex[v * 4 + k] = sorted[k]?.[0] || 0;
      skinWeight[v * 4 + k] = (sorted[k]?.[1] || 0) / sum;
    }
  };

  for (let v = 0; v < count; v++) {
    const x = posAttr.getX(v), y = posAttr.getY(v), z = posAttr.getZ(v);
    const u = spineParam(z);
    const tailness = THREE.MathUtils.clamp((0.45 - z) / (0.45 - TAIL_Z), 0, 1);
    const radial = Math.hypot(x / 0.34, y / 0.38);
    // 外层叶片与躯干的缝合带：缝合区躯干影响连续淡出、鳍部影响连续淡入
    const outer = THREE.MathUtils.smoothstep(radial, 0.72, 1.16);
    const core = 1 - outer;
    const items = [];

    // 躯干：高斯核（本身渐变），σ 随尾部加长让尾柄更柔
    const bodySigma = 0.34 + tailness * 0.5;
    const bodyBase = Math.floor(u);
    for (let k = 0; k < 4; k++) {
      const bi = THREE.MathUtils.clamp(bodyBase - 1 + k, 0, BONE_COUNT - 1);
      add(items, bi, core * Math.exp(-Math.pow((u - bi) / bodySigma, 2) * 0.5));
    }

    // 尾扇：上下支链按 y 渐变分面（中线附近两根尾扇骨共享权重）
    const caudalMask = outer * THREE.MathUtils.smoothstep(tailness, 0.28, 0.62);
    if (caudalMask > 0.02) {
      const upW = THREE.MathUtils.smoothstep(y, -0.06, 0.06);
      const local = THREE.MathUtils.clamp((u - N_HEAD) / Math.max(1, N_TAIL - 1), 0, 1);
      const finW = caudalMask * (0.72 + 0.20 * local);
      add(items, BONE_COUNT + 6, finW * upW);        // Caudal_Upper
      add(items, BONE_COUNT + 7, finW * (1 - upW));  // Caudal_Lower
      addSpine(items, u, caudalMask * 0.28);
    }

    // 背/腹鳍：仿尾扇——Root/Tip 同点共挂，按 y（基部→末端）渐变分面，
    // 两根骨仅旋转相位不同，膜片混合永不跨脊柱塌陷
    const dorsalMask = outer * THREE.MathUtils.smoothstep(y, 0.18, 0.52) * (1 - caudalMask * 0.5);
    const ventralMask = outer * THREE.MathUtils.smoothstep(-y, 0.18, 0.52) * (1 - caudalMask * 0.5);
    if (dorsalMask > 0.02) {
      const tipW = THREE.MathUtils.smoothstep(y, 0.30, 0.50);
      add(items, BONE_COUNT + 2, dorsalMask * 0.82 * (1 - tipW)); // Dorsal_Root（基部）
      add(items, BONE_COUNT + 3, dorsalMask * 0.82 * tipW);       // Dorsal_Tip（末端）
      addSpine(items, u, dorsalMask * 0.18);
    }
    if (ventralMask > 0.02) {
      const tipW = THREE.MathUtils.smoothstep(-y, 0.30, 0.50);
      add(items, BONE_COUNT + 4, ventralMask * 0.82 * (1 - tipW)); // Ventral_Root（基部）
      add(items, BONE_COUNT + 5, ventralMask * 0.82 * tipW);       // Ventral_Tip（末端）
      addSpine(items, u, ventralMask * 0.18);
    }

    // 胸鳍：左右按 x 渐变（近身体中线处两骨共享），z 向根部缝合
    const pectoralMask = THREE.MathUtils.smoothstep(Math.abs(x), 0.20, 0.42)
      * THREE.MathUtils.smoothstep(z, -0.05, 0.52) * (1 - Math.min(1, Math.abs(y) / 0.5));
    if (pectoralMask > 0.02) {
      const rightW = THREE.MathUtils.smoothstep(x, -0.04, 0.04);
      add(items, BONE_COUNT + 0, pectoralMask * 0.86 * (1 - rightW)); // Pectoral_L
      add(items, BONE_COUNT + 1, pectoralMask * 0.86 * rightW);       // Pectoral_R
      addSpine(items, u, pectoralMask * 0.14);
    }
    write(v, items);
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
}

// ============================================================
// XPBD 粒子链
// ============================================================
const pos = [];
const prev = [];
const accel = [];
const ups = [];
const bendAlpha = new Float32Array(BONE_COUNT - 2);
const bendLambda = new Float32Array(BONE_COUNT - 2);
const angleLimitDmin = new Float32Array(BONE_COUNT - 2);

function initParticles() {
  pos.length = prev.length = accel.length = ups.length = 0;
  for (let i = 0; i < BONE_COUNT; i++) {
    pos.push(new THREE.Vector3(0, 0, spineZ[i]));
    prev.push(new THREE.Vector3(0, 0, spineZ[i]));
    accel.push(new THREE.Vector3());
    ups.push(new THREE.Vector3(0, 1, 0));
  }
}
initParticles();

for (let i = 0; i < BONE_COUNT - 2; i++) {
  bendAlpha[i] = i < N_HEAD
    ? 1.5e-6
    : THREE.MathUtils.lerp(1e-5, 7e-4, Math.pow((i - N_HEAD) / (BONE_COUNT - 3 - N_HEAD), 1.2));
}
for (let i = 0; i < BONE_COUNT - 2; i++) {
  const t = i / (BONE_COUNT - 3);
  const maxAng = THREE.MathUtils.lerp(0.05, 0.20, Math.pow(t, 1.6));
  const L1 = segLen[i], L2 = segLen[i + 1];
  angleLimitDmin[i] = Math.sqrt(L1 * L1 + L2 * L2 + 2 * L1 * L2 * Math.cos(maxAng));
}

function solveDistance(i, j, restLen, alpha, h, lambdaArr, lambdaSlot) {
  const p1 = pos[i], p2 = pos[j];
  const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d < 1e-9) return;
  const C = d - restLen;
  const alphaTilde = alpha / (h * h);
  let dl = (-C - alphaTilde * (lambdaArr ? lambdaArr[lambdaSlot] : 0)) / (2 + alphaTilde);
  const nx = dx / d, ny = dy / d, nz = dz / d;
  p1.x -= dl * nx; p1.y -= dl * ny; p1.z -= dl * nz;
  p2.x += dl * nx; p2.y += dl * ny; p2.z += dl * nz;
  if (lambdaArr) lambdaArr[lambdaSlot] += dl;
}

// 非相邻粒子球排斥：身体不会穿过自己（掉头防破模）
function solveSelfCollision() {
  for (let i = 0; i < BONE_COUNT; i++) {
    for (let j = i + 8; j < BONE_COUNT; j++) {
      const arc = cumLen[j] - cumLen[i];
      const minD = Math.min(0.11, arc * 0.62);
      const p1 = pos[i], p2 = pos[j];
      const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < minD * minD && d2 > 1e-12) {
        const d = Math.sqrt(d2);
        const corr = (minD - d) / (2 * d);
        p1.x -= dx * corr; p1.y -= dy * corr; p1.z -= dz * corr;
        p2.x += dx * corr; p2.y += dy * corr; p2.z += dz * corr;
      }
    }
  }
}

function solveAngleLimit(i) {
  const p1 = pos[i], p2 = pos[i + 2];
  const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const dmin = angleLimitDmin[i];
  if (d >= dmin || d < 1e-9) return;
  const corr = (dmin - d) / (2 * d);
  p1.x -= dx * corr; p1.y -= dy * corr; p1.z -= dz * corr;
  p2.x += dx * corr; p2.y += dy * corr; p2.z += dz * corr;
}

const headTarget = new THREE.Vector3(0, 0, HEAD_Z);
const headTargetSmooth = new THREE.Vector3(0, 0, HEAD_Z);
let dragging = false;
let simTime = 0;
let headSpeedSmooth = 0;

// 真实巡游：随机选点 → 冲刺 → 悬停停留（斗鱼典型行为）
const swimState = {
  point: new THREE.Vector3(0.4, -0.1, 0),
  timer: 3,
};
const _wander = new THREE.Vector3();

function updateWander(dt) {
  swimState.timer -= dt;
  _wander.subVectors(swimState.point, headTarget);
  const dist = _wander.length();
  if (dist > 0.06) {
    // 远快近慢：冲刺-滑行的节奏
    const speed = THREE.MathUtils.clamp(dist * 1.1, 0.15, 0.85);
    headTarget.addScaledVector(_wander.normalize(), Math.min(speed * dt, dist));
  } else if (swimState.timer <= 0) {
    swimState.point.set(
      (Math.random() * 2 - 1) * TANK_RADII.x * 0.55,
      TANK_CENTER.y + (Math.random() * 2 - 1) * TANK_RADII.y * 0.5,
      (Math.random() * 2 - 1) * TANK_RADII.z * 0.5
    );
    swimState.timer = 2.5 + Math.random() * 4.5;
  }
  // 悬停时的缓慢沉浮
  headTarget.y += Math.sin(simTime * 1.2) * 0.03 * dt;
}

const _lat = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _revHead = new THREE.Vector3();
const _revTgt = new THREE.Vector3();

function physicsStep(dt) {
  simTime += dt;
  const h = dt / SUBSTEPS;

  dragging = pointerActive || debugDrag;
  if (dashActive) {
    headTarget.copy(dashTarget);
    if (pos[0].distanceTo(dashTarget) < 0.14) dashActive = false;
  } else if (pointerActive && !debugDrag) {
    updateCursorFollow();
  }
  if (!dragging) updateWander(dt);

  {
    _dir.subVectors(headTarget, headTargetSmooth);
    const dist = _dir.length();
    const maxSpeed = dashActive ? 3.5 : dragging ? 2.4 : 1.1;
    if (dist > 1e-6) {
      const step = Math.min(dist, maxSpeed * dt, dist * (1 - Math.exp(-(dashActive ? 22 : dragging ? 11 : 5) * dt)) + maxSpeed * dt);
      headTargetSmooth.addScaledVector(_dir.normalize(), Math.min(step, dist));
    }
  }

  // 掉头检测：目标在正后方 → 头部弹簧变软，避免拖着链条穿自己
  _revHead.subVectors(pos[0], pos[3]).normalize();
  _revTgt.subVectors(headTargetSmooth, pos[0]).normalize();
  const revDot = _revHead.dot(_revTgt);
  const revK = revDot < -0.35 ? 0.35 : 1.0;
  // 反向程度 0→1：>120° 视为掉头
  const revAmount = THREE.MathUtils.smoothstep(-revDot, 0.35, 0.85);
  // 掉头时把目标压到头部水平面：只允许绕竖直轴 yaw 转身（禁止头朝上/朝下翻）
  if (revAmount > 0) {
    headTarget.y = THREE.MathUtils.lerp(headTarget.y, pos[0].y, revAmount);
  }

  const headV = pos[0].distanceTo(prev[0]) / Math.max(dt, 1e-5);
  headSpeedSmooth += (Math.min(headV, 3) - headSpeedSmooth) * (1 - Math.exp(-4 * dt));
  const activity = THREE.MathUtils.clamp(headSpeedSmooth * 0.9, 0, 1.6);
  const swimAmp = params.swim * (0.28 + 0.72 * Math.min(activity, 1.3));
  const swimFreq = 4.2 + activity * 2.2;

  for (let s = 0; s < SUBSTEPS; s++) {
    for (let i = 0; i < BONE_COUNT; i++) {
      const a = accel[i].set(0, 0, 0);
      a.y += 0.03;
      const p = pos[i];
      a.x += 0.02 * Math.sin(0.7 * simTime + p.y * 2.0);
      a.z += 0.018 * Math.sin(0.5 * simTime + p.x * 1.5);
      // 怠速时躯干缓慢侧摆（悬停不死板）
      if (cumLen[i] > TOTAL_LEN * 0.2 && cumLen[i] < TOTAL_LEN * 0.6) {
        a.x += 0.05 * Math.sin(simTime * 0.55 + cumLen[i] * 3.0);
      }
      if (i < 3) {
        const w = i === 0 ? 1 : i === 1 ? 0.32 : 0.1;
        const k = (dashActive ? 200 : dragging ? 96 : 26) * w * revK;
        a.x += (headTargetSmooth.x - p.x) * k;
        a.y += (headTargetSmooth.y - p.y) * k;
        a.z += (headTargetSmooth.z - p.z) * k;
      }
      if (cumLen[i] > TOTAL_LEN * 0.42) {
        const tBody = (cumLen[i] - TOTAL_LEN * 0.42) / (TOTAL_LEN * 0.58);
        const amp = swimAmp * Math.pow(tBody, 1.7) * 2.2;
        _dir.subVectors(pos[Math.min(i + 1, BONE_COUNT - 1)], pos[i]).normalize();
        _lat.set(1, 0, 0).addScaledVector(_dir, -_dir.x);
        if (_lat.lengthSq() > 1e-6) {
          _lat.normalize();
          a.addScaledVector(_lat, amp * Math.sin(cumLen[i] * 1.8 - simTime * swimFreq));
        }
      }
    }

    const damp = Math.exp(-3.2 * params.drag * h);
    for (let i = 0; i < BONE_COUNT; i++) {
      const p = pos[i], pr = prev[i], a = accel[i];
      const vx = (p.x - pr.x) * damp;
      const vy = (p.y - pr.y) * damp;
      const vz = (p.z - pr.z) * damp;
      pr.copy(p);
      p.x += vx + a.x * h * h;
      p.y += vy + a.y * h * h;
      p.z += vz + a.z * h * h;
    }

    bendLambda.fill(0);
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < BONE_COUNT - 1; i++) {
        solveDistance(i, i + 1, segLen[i], 0, h);
      }
    }
    for (let i = 0; i < BONE_COUNT - 2; i++) {
      solveDistance(i, i + 2, segLen[i] + segLen[i + 1], bendAlpha[i], h, bendLambda, i);
    }
    for (let i = 4; i < BONE_COUNT; i += 4) {
      solveDistance(0, i, cumLen[i], 2e-3, h);
    }
    for (let iter = 0; iter < 6; iter++) {
      for (let i = 0; i < BONE_COUNT - 1; i++) solveDistance(i, i + 1, segLen[i], 0, h);
      if (iter % 2 === 0) { for (let i = 0; i < BONE_COUNT - 2; i++) solveAngleLimit(i); }
      else { for (let i = BONE_COUNT - 3; i >= 0; i--) solveAngleLimit(i); }
    }
    // 掉头期间：前 8 节俯仰角硬限制（dy/节长 ≤ sin25°），身体保持水平转身
    if (revAmount > 0.01) {
      const maxDy = 0.4226;   // sin25°
      for (let i = 0; i < 8; i++) {
        const p1 = pos[i], p2 = pos[i + 1];
        const dy = p2.y - p1.y;
        const lim = segLen[i] * maxDy;
        if (Math.abs(dy) > lim) {
          const excess = (Math.abs(dy) - lim) * 0.5 * Math.sign(dy) * revAmount;
          p1.y += excess; p2.y -= excess;
        }
      }
    }
    solveSelfCollision();

    for (let i = 0; i < BONE_COUNT; i++) {
      const p = pos[i];
      const qx = (p.x - TANK_CENTER.x) / TANK_RADII.x;
      const qy = (p.y - TANK_CENTER.y) / TANK_RADII.y;
      const qz = (p.z - TANK_CENTER.z) / TANK_RADII.z;
      const q = Math.sqrt(qx * qx + qy * qy + qz * qz);
      if (q > 1) {
        p.set(
          TANK_CENTER.x + (qx / q) * TANK_RADII.x,
          TANK_CENTER.y + (qy / q) * TANK_RADII.y,
          TANK_CENTER.z + (qz / q) * TANK_RADII.z
        );
        prev[i].copy(p);
      }
    }
  }
}

// ============================================================
// 粒子 → 骨骼姿态（头部低通滤波 + 转弯侧倾 banking）
// ============================================================
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qTarget = new THREE.Quaternion();
const _parentInv = new THREE.Quaternion();
const _eye = new THREE.Vector3();
const _tgt = new THREE.Vector3();
const _heading = new THREE.Vector3();
const worldQ = [];
const smDir = [];          // 低通后的链方向（不产生扭转相位差）
const _qPT = new THREE.Quaternion();
const _upR = new THREE.Vector3();
const _tmpUp = new THREE.Vector3();
let prevYaw = 0;
let yawRateSmooth = 0;
for (let i = 0; i < BONE_COUNT; i++) {
  worldQ.push(new THREE.Quaternion());
  smDir.push(new THREE.Vector3(0, 0, -1));
}

function updateBones(dt) {
  // 头部航向 → 转弯侧倾角
  _heading.subVectors(pos[3], pos[0]);
  const yaw = Math.atan2(_heading.x, _heading.z);
  let dYaw = yaw - prevYaw;
  if (dYaw > Math.PI) dYaw -= Math.PI * 2;
  if (dYaw < -Math.PI) dYaw += Math.PI * 2;
  prevYaw = yaw;
  const yawRate = _heading.lengthSq() > 1e-6 ? dYaw / Math.max(dt, 1e-4) : 0;
  yawRateSmooth += (yawRate - yawRateSmooth) * (1 - Math.exp(-3 * dt));
  const roll = THREE.MathUtils.clamp(-yawRateSmooth * 0.22, -0.45, 0.45);

  // 1) 每节方向低通（掉头时平滑扫过，不滤波四元数 → 无相位扭转）
  for (let i = 0; i < BONE_COUNT; i++) {
    if (i < BONE_COUNT - 1) _dir.subVectors(pos[i + 1], pos[i]);
    else _dir.subVectors(pos[i], pos[i - 1]);
    if (_dir.lengthSq() < 1e-10) _dir.set(0, 0, -1);
    _dir.normalize();
    const rate = i < N_HEAD ? 9 : 18;
    smDir[i].lerp(_dir, 1 - Math.exp(-rate * dt));
    if (smDir[i].lengthSq() < 1e-8) smDir[i].copy(_dir);
    smDir[i].normalize();
  }

  // 2) 根骨骼 up：帧间平行迁移 + 缓慢回正世界 Y（防 180° 翻转跳变）
  const d0 = smDir[0];
  const up0 = ups[0];
  up0.addScaledVector(d0, -up0.dot(d0));
  if (up0.lengthSq() < 1e-6) up0.set(1, 0, 0).addScaledVector(d0, -d0.x);
  up0.normalize();
  if (Math.abs(d0.y) < 0.9) {
    _tmpUp.set(0, 1, 0).addScaledVector(d0, -d0.y).normalize();
    up0.lerp(_tmpUp, 1 - Math.exp(-1.5 * dt)).normalize();
  }

  // 3) 沿链平行迁移 up：相邻骨骼扭转严格连续（根治掉头拉丝）
  for (let i = 1; i < BONE_COUNT; i++) {
    _qPT.setFromUnitVectors(smDir[i - 1], smDir[i]);
    ups[i].copy(ups[i - 1]).applyQuaternion(_qPT);
    ups[i].addScaledVector(smDir[i], -ups[i].dot(smDir[i])).normalize();
  }

  // 4) 姿态：lookAt（含侧倾）→ 局部四元数
  for (let i = 0; i < BONE_COUNT; i++) {
    const rollW = i < N_HEAD ? 0.9 : 0.45;
    _upR.copy(ups[i]).applyAxisAngle(smDir[i], roll * rollW);

    _eye.copy(pos[i]);
    _tgt.copy(pos[i]).add(smDir[i]);
    _m4.lookAt(_eye, _tgt, _upR);
    worldQ[i].setFromRotationMatrix(_m4);
  }
  bones[0].position.copy(pos[0]);
  bones[0].quaternion.copy(worldQ[0]);
  for (let i = 1; i < BONE_COUNT; i++) {
    _parentInv.copy(worldQ[i - 1]).invert();
    _q.copy(_parentInv).multiply(worldQ[i]);
    bones[i].quaternion.copy(_q);
  }

  // 鳍部支链独立微动：胸鳍反相扑动；背/腹鳍 Root/Tip 同点共挂、相位错开，
  // 基部→末端形成行波；叠加小幅前后摆动（rotation.x）增加维度
  if (finBones.length === APPENDAGE_COUNT) {
    const idle = 0.55 + 0.45 * (1 - Math.min(headSpeedSmooth, 1));
    finBones[0].rotation.z =  0.12 * idle * Math.sin(simTime * 5.8);
    finBones[1].rotation.z = -0.12 * idle * Math.sin(simTime * 5.8);
    finBones[2].rotation.z =  0.09 * idle * Math.sin(simTime * 2.8 + 0.4);
    finBones[2].rotation.x =  0.06 * idle * Math.sin(simTime * 2.2 + 0.9);
    finBones[3].rotation.z =  0.13 * idle * Math.sin(simTime * 2.8 + 1.1);
    finBones[3].rotation.x = -0.07 * idle * Math.sin(simTime * 2.2 + 0.2);
    finBones[4].rotation.z = -0.09 * idle * Math.sin(simTime * 2.8 + 0.4);
    finBones[4].rotation.x =  0.06 * idle * Math.sin(simTime * 2.2 + 0.9);
    finBones[5].rotation.z = -0.13 * idle * Math.sin(simTime * 2.8 + 1.1);
    finBones[5].rotation.x = -0.07 * idle * Math.sin(simTime * 2.2 + 0.2);
    finBones[6].rotation.z =  0.13 * idle * Math.sin(simTime * 3.6 + 0.5);
    finBones[7].rotation.z = -0.13 * idle * Math.sin(simTime * 3.6 + 0.5);
  }
}

// ============================================================
// 模型加载
// ============================================================
const fishGroup = new THREE.Group();
fishGroup.scale.setScalar(FISH_SCALE);
scene.add(fishGroup);

const loadBar = document.getElementById('loadBar');
const loadPct = document.getElementById('loadPct');

let headHit = null;

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('./vendor/draco/');
const fishLoader = new GLTFLoader();
fishLoader.setDRACOLoader(dracoLoader);
fishLoader.setMeshoptDecoder(MeshoptDecoder);

fishLoader.load(
  './model_opt.glb',
  (gltf) => {
    const srcMesh = (function find(o) {
      if (o.isMesh) return o;
      for (const c of o.children) { const r = find(c); if (r) return r; }
      return null;
    })(gltf.scene);

    loadBar.style.width = '100%';

    setTimeout(() => {
      const geometry = srcMesh.geometry;
      paintWeights(geometry);

      // 原 GLB 贴图 + 少量虹彩/焦散/鱼鳞；不再二次调色或改粗糙度。
      // 保留原始法线与金属粗糙度贴图，叠加效果尽量克制。
      const source = srcMesh.material;
      const material = new THREE.MeshPhysicalMaterial({
        map: source.map || null,
        normalMap: source.normalMap || null,
        normalScale: source.normalScale ? source.normalScale.clone() : undefined,
        roughnessMap: source.roughnessMap || null,
        metalnessMap: source.metalnessMap || null,
        aoMap: source.aoMap || null,
        color: source.color ? source.color.clone() : undefined,
        side: source.side,
        metalness: source.metalness,
        roughness: source.roughness,
        emissive: source.emissive ? source.emissive.clone() : undefined,
        emissiveMap: source.emissiveMap || null,
        emissiveIntensity: 0,
        envMapIntensity: 0,
        iridescence: 0.32,
        iridescenceIOR: 1.30,
        iridescenceThicknessRange: [160, 420],
      });
      if (material.map) {
        material.map.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
      }
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, {
          uTime: { value: 0 },
          uCaustic: { value: 0.28 },
          uBumpScale: { value: 0.30 },
        });
        material.userData.shader = shader;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vModelPos;\nvarying vec3 vWorldPos;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvModelPos = position;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', /* glsl */`
            #include <common>
            varying vec3 vModelPos;
            varying vec3 vWorldPos;
            uniform float uTime, uCaustic, uBumpScale;
            ${CAUSTIC_GLSL}
            float fishBodyMask(vec3 mp) {
              float radial = length(vec2(mp.x / 0.34, mp.y / 0.38));
              return 1.0 - smoothstep(0.72, 1.12, radial);
            }
            // 很淡的鱼鳞高度场，只提供微弱起伏，不改颜色
            float fishScaleHeight(vec3 mp) {
              vec2 suv = vec2(mp.z * 0.85 + mp.y * 0.30, mp.y + mp.x * 0.45) * 22.0;
              suv.x += mod(floor(suv.y), 2.0) * 0.5;
              vec2 g = fract(suv) - vec2(0.5, 0.5);
              float r = length(g * vec2(1.0, 1.2));
              float disc = 1.0 - smoothstep(0.30, 0.48, r);
              float edge = smoothstep(0.46, 0.40, r) * (1.0 - smoothstep(0.36, 0.26, r));
              return disc * 0.6 + edge * 0.4;
            }
          `)
          .replace('#include <map_fragment>', /* glsl */`
            #include <map_fragment>
            float fishTexLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          `)
          // 先保留原始法线贴图，再叠加极轻的程序鱼鳞
          .replace('#include <normal_fragment_maps>', /* glsl */`
            #include <normal_fragment_maps>
            float sM = fishBodyMask(vModelPos);
            float sH = fishScaleHeight(vModelPos);
            vec2 dHdxy = vec2(dFdx(sH), dFdy(sH)) * (uBumpScale * sM);
            {
              vec3 vSigmaX = normalize(dFdx(-vViewPosition.xyz));
              vec3 vSigmaY = normalize(dFdy(-vViewPosition.xyz));
              vec3 R1 = cross(vSigmaY, normal);
              vec3 R2 = cross(normal, vSigmaX);
              float fDet = dot(vSigmaX, R1) * faceDirection;
              vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
              normal = normalize(abs(fDet) * normal - vGrad);
            }
          `)
          .replace('material.iridescence = iridescence;',
                   'material.iridescence = iridescence * fishBodyMask(vModelPos) * mix(0.35, 1.0, smoothstep(0.05, 0.35, fishTexLum));')
          // 真实水下焦散：只叠少量光纹，不改变贴图颜色
          .replace('#include <opaque_fragment>', /* glsl */`
            if (uCaustic > 0.001) {
              float ca = caustic(vWorldPos.xz * 1.1 + vec2(uTime * 0.03, uTime * 0.017), uTime * 0.6);
              float topFacing = clamp(vNormal.y * 0.5 + 0.5, 0.0, 1.0);
              outgoingLight *= 1.0 + ca * uCaustic * (0.25 + 0.75 * topFacing);
              outgoingLight += vec3(0.85, 0.95, 1.0) * ca * uCaustic * 0.015 * topFacing;
            }
            #include <opaque_fragment>
          `);
      };
      material.fog = false;
      material.transparent = false;
      material.depthWrite = true;
      material.needsUpdate = true;

      skinnedMesh = new THREE.SkinnedMesh(geometry, material);
      skinnedMesh.frustumCulled = false;

      const rootBone = buildSkeleton();
      skinnedMesh.add(rootBone);
      fishGroup.add(skinnedMesh);
      fishGroup.updateMatrixWorld(true);
      skinnedMesh.bind(new THREE.Skeleton(bones));

      headHit = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 12, 12),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      scene.add(headHit);

      const loading = document.getElementById('loading');
      loading.style.opacity = '0';
      setTimeout(() => loading.remove(), 900);
    }, 50);
  },
  (ev) => {
    if (ev.total) loadBar.style.width = Math.round((ev.loaded / ev.total) * 100) + '%';
  },
  (err) => {
    console.error('模型加载失败，2 秒后重试…', err);
    loadBar.style.background = '#ff5577';
    setTimeout(() => location.reload(), 2000);
  }
);

// ============================================================
// 交互：拖拽鱼头（无视觉指引，直接可拖）
// ============================================================
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
const _hit = new THREE.Vector3();

function setPointer(ev) {
  pointerNDC.x = (ev.clientX / innerWidth) * 2 - 1;
  pointerNDC.y = -(ev.clientY / innerHeight) * 2 + 1;
}

function clampToTank(v, scale = 0.92) {
  const qx = (v.x - TANK_CENTER.x) / (TANK_RADII.x * scale);
  const qy = (v.y - TANK_CENTER.y) / (TANK_RADII.y * scale);
  const qz = (v.z - TANK_CENTER.z) / (TANK_RADII.z * scale);
  const q = Math.sqrt(qx * qx + qy * qy + qz * qz);
  if (q > 1) {
    v.set(
      TANK_CENTER.x + (qx / q) * TANK_RADII.x * scale,
      TANK_CENTER.y + (qy / q) * TANK_RADII.y * scale,
      TANK_CENTER.z + (qz / q) * TANK_RADII.z * scale
    );
  }
  return v;
}

// 无需按压：光标移到哪，鱼头跟到哪
let pointerActive = false;
let debugDrag = false;
const cursorGlow = document.getElementById('cursorGlow');
let cursorBreathTimer = null;
addEventListener('pointermove', (ev) => {
  if (cursorGlow) {
    cursorGlow.style.left = `${ev.clientX}px`;
    cursorGlow.style.top = `${ev.clientY}px`;
    cursorGlow.style.opacity = '1';
    // 移动期间轻微呼吸缩放，停止后回到静止光圈
    cursorGlow.classList.add('moving');
    clearTimeout(cursorBreathTimer);
    cursorBreathTimer = setTimeout(() => cursorGlow.classList.remove('moving'), 180);
  }
  setPointer(ev);
  pointerActive = true;
  AudioSys.init();
}, { passive: true });

// 单击：敲玻璃 + 光点闪烁（不位移）
let dashActive = false;
const dashTarget = new THREE.Vector3();
addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0) return;
  AudioSys.init();
  AudioSys.knock();
  cursorFlash = 1.0;
  setPointer(ev);
  pointerActive = true;
});

// 双击：敲玻璃 + 鱼迅速游到光标点位
addEventListener('dblclick', (ev) => {
  AudioSys.init();
  AudioSys.knock();
  cursorFlash = 1.2;
  setPointer(ev);
  pointerActive = true;
  camera.getWorldDirection(_camDir);
  _worldHead.copy(pos[0]).multiplyScalar(FISH_SCALE);
  followPlane.setFromNormalAndCoplanarPoint(_camDir, _worldHead);
  raycaster.setFromCamera(pointerNDC, camera);
  if (raycaster.ray.intersectPlane(followPlane, _hit)) {
    cursorPoint.copy(_hit);
    _hit.divideScalar(FISH_SCALE);
    clampToTank(_hit, 0.95);
    dashTarget.copy(_hit);
    dashActive = true;
  }
});
addEventListener('pointerleave', () => {
  pointerActive = false;
  if (cursorGlow) cursorGlow.style.opacity = '0';
});
document.documentElement.addEventListener('mouseleave', () => {
  pointerActive = false;
  if (cursorGlow) cursorGlow.style.opacity = '0';
});

// 光标光点：跟随引导点的辉光
let cursorDot = null, cursorCore = null;
{
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx2 = cv.getContext('2d');
  const g = ctx2.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(240,240,240,0.55)');
  g.addColorStop(0.6, 'rgba(210,210,210,0.16)');
  g.addColorStop(1, 'rgba(200,200,200,0)');
  ctx2.fillStyle = g;
  ctx2.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  cursorDot = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  cursorDot.scale.setScalar(0.34);
  cursorDot.visible = false;
  scene.add(cursorDot);
  cursorCore = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  cursorCore.scale.setScalar(0.08);
  cursorCore.visible = false;
  scene.add(cursorCore);
}
const cursorPoint = new THREE.Vector3();
let cursorFlash = 0;   // 点击闪光强度（0→1 衰减）

const followPlane = new THREE.Plane();
const _camDir = new THREE.Vector3();
const _worldHead = new THREE.Vector3();

function updateCursorFollow() {
  // 过鱼头、垂直于视线的平面：光标射线与它的交点即目标（鱼保持自身深度）
  camera.getWorldDirection(_camDir);
  _worldHead.copy(pos[0]).multiplyScalar(FISH_SCALE);
  followPlane.setFromNormalAndCoplanarPoint(_camDir, _worldHead);
  raycaster.setFromCamera(pointerNDC, camera);
  if (raycaster.ray.intersectPlane(followPlane, _hit)) {
    cursorPoint.copy(_hit);
    _hit.divideScalar(FISH_SCALE);
    clampToTank(_hit);
    headTarget.copy(_hit);
  }
}

addEventListener('keydown', (ev) => {
  if (ev.key === 'b' || ev.key === 'B') {
    if (!skinnedMesh) return;
    if (!skeletonHelper) {
      skeletonHelper = new THREE.SkeletonHelper(skinnedMesh);
      scene.add(skeletonHelper);
      return;
    }
    skeletonHelper.visible = !skeletonHelper.visible;
  }
});

// ============================================================
// 环境动画
// ============================================================
function animateEnvironment(t, dt) {
  if (topWaterMat) topWaterMat.uniforms.uTime.value = t;
  // A/B 实验：window.__lightOverride = {keyLight, pendant, rimLight, rimLight2}
  const LO = window.__lightOverride || {};
  keyLight.intensity = LO.keyLight ?? (0.42 + 0.06 * Math.sin(t * 0.5));
  pendant.intensity = LO.pendant ?? (0.55 + 0.1 * Math.sin(t * 0.8 + 2.0));
  rimLight.intensity = LO.rimLight ?? (0.64 + 0.11 * Math.sin(t * 0.35 + 1.0));
  rimLight2.intensity = LO.rimLight2 ?? (0.56 + 0.11 * Math.sin(t * 0.42 + 3.5));

  for (const p of rayPlanes) {
    p.material.opacity = 0.04 + 0.025 * Math.sin(t * 0.4 + p.userData.phase);
  }

  const pp = plankton.geometry.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    pp.array[i * 3]     = planktonBase[i * 3]     + Math.sin(t * 0.18 + i * 1.7) * 0.15;
    pp.array[i * 3 + 1] = planktonBase[i * 3 + 1] + Math.sin(t * 0.12 + i * 2.3) * 0.12;
    pp.array[i * 3 + 2] = planktonBase[i * 3 + 2] + Math.cos(t * 0.15 + i * 0.9) * 0.15;
  }
  pp.needsUpdate = true;

  const bp = bubbles.geometry.attributes.position;
  for (let i = 0; i < bubbleData.length; i++) {
    const b = bubbleData[i];
    b.y += b.v * dt;
    if (b.y > 1.6) { b.y = -1.8; b.x = (Math.random() - 0.5) * 3; b.z = (Math.random() - 0.5) * 3; }
    bp.array[i * 3]     = b.x + Math.sin(t * 2 + b.ph) * 0.03;
    bp.array[i * 3 + 1] = b.y;
    bp.array[i * 3 + 2] = b.z;
  }
  bp.needsUpdate = true;

  if (headHit) headHit.position.copy(pos[0]).multiplyScalar(FISH_SCALE);

  // 光标光点：跟随 + 呼吸 + 点击闪光
  if (cursorDot) {
    const show = pointerActive || dashActive;
    cursorDot.visible = cursorCore.visible = show;
    if (show) {
      cursorDot.position.copy(cursorPoint);
      cursorCore.position.copy(cursorPoint);
      cursorFlash = Math.max(0, cursorFlash - dt * 3.2);
      const pulse = 0.3 + 0.05 * Math.sin(t * 4.0) + cursorFlash * 0.55;
      cursorDot.scale.setScalar(pulse);
      cursorCore.scale.setScalar(0.07 + cursorFlash * 0.12);
      cursorDot.material.opacity = 0.75 + cursorFlash * 0.25;
    }
  }
}

// ============================================================
// 调试钩子
// ============================================================
window.__fish = {
  ready: () => !!skinnedMesh,
  headScreen: () => {
    const v = pos[0].clone().multiplyScalar(FISH_SCALE).project(camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  },
  metrics: () => {
    let maxStretch = 0;
    for (let i = 0; i < BONE_COUNT - 1; i++) {
      const d = pos[i].distanceTo(pos[i + 1]);
      maxStretch = Math.max(maxStretch, Math.abs(d - segLen[i]) / segLen[i]);
    }
    let maxAng = 0;
    const d1 = new THREE.Vector3(), d2 = new THREE.Vector3();
    for (let i = 0; i < BONE_COUNT - 2; i++) {
      d1.subVectors(pos[i + 1], pos[i]).normalize();
      d2.subVectors(pos[i + 2], pos[i + 1]).normalize();
      maxAng = Math.max(maxAng, Math.acos(THREE.MathUtils.clamp(d1.dot(d2), -1, 1)));
    }
    return { maxStretchPct: (maxStretch * 100).toFixed(1), maxJointAngleDeg: (maxAng * 180 / Math.PI).toFixed(1) };
  },
};

// 调试钩子（A/B 实验用）
window.__dbg = {
  bloomPass, rimLight, rimLight2, keyLight, renderer, scene, camera, controls, composer, gradePass,
  material: () => skinnedMesh ? skinnedMesh.material : null,
  mesh: () => skinnedMesh,
};

// ============================================================
// 主循环
// ============================================================
const clock = new THREE.Clock();

function renderFrame(dt) {
  animateEnvironment(simTime, dt);
  controls.update();
  gradePass.uniforms.uTime.value = simTime;
  if (skinnedMesh && skinnedMesh.material.userData.shader) {
    skinnedMesh.material.userData.shader.uniforms.uTime.value = simTime;
  }
  composer.render();
}

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 1 / 30);
  if (dt <= 0) return;
  if (skinnedMesh) {
    physicsStep(dt);
    updateBones(dt);
  }
  renderFrame(dt);
}
tick();

// 同步步进钩子（隐藏标签页/自动化调试用）
window.__fish.setDragLocal = (x, y, z) => { debugDrag = true; headTarget.set(x, y, z); };
window.__fish.release = () => { debugDrag = false; pointerActive = false; headTarget.copy(pos[0]); };
window.__fish.step = (n) => { for (let k = 0; k < n; k++) { physicsStep(1 / 60); updateBones(1 / 60); } };
window.__fish.render = () => renderFrame(1 / 60);
window.__fish.setPointerNDC = (x, y) => { pointerNDC.set(x, y); pointerActive = true; };

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  updateRTSize();
});
