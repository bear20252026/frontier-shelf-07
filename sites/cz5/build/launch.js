// build/launch.js — C 组：发射序列（launchfx）
// 合同：createLaunch(ctx) → { group, seek(t), reset() }；seek(t) 是序列时间 t（秒）的纯函数：
// 给定 t 一次性摆好火箭各段位置/姿态、火焰烟雾状态、灯光、相机；可重复调用、顺序无关。
// reset() = seek(0)：一切特效清零、各段回合拢位、太阳翼折起、摆杆回位、背景恢复。
//
// 时间轴（LAUNCH 常量与 main.js HUD 对齐）：
//   0 ~ 3      倒计时（相机 = 发射场低位机位，缓慢推近）
//   3          点火：4 助推器橙焰 + 芯级双淡蓝焰 0.8s 内建立；导流槽两端喷焰 + 浓烟向 ±X 翻滚；
//              台周喷水白雾腾起；火焰点光 + 地面光斑；画面微震（点火 → 离台+2s）
//   4.6        摆杆 0.8s 内摆开 75°，火箭缓起渐加速，相机低位跟随 → 跟踪机位
//   13         助推器 ×4 同时分离（分离白烟、熄火、外翻漂移 + 滚转下坠）
//   16         整流罩双瓣张开漂走，太阳翼 ~1s 展开
//   19         级间段+芯一级整体脱离下坠（微滚转），二级淡蓝焰点亮；相机渐停，箭体缩成远点
//   13 → 22    深空球（spaceTex 内翻球）淡入，背景由夜空过渡到地球曲率
//   26         结束（main.js 停帧）
//
// 技术方案：
//   火焰：层叠旋转面（3 层 lathe 合并，1 drawcall/羽流）+ 自定义 GLSL（fbm 位移 + 沿轴流动 +
//         边缘 fbm 侵蚀 + 加色混合）；煤油 = 亮橙黄芯/橙红外层，氢氧 = 近透明淡蓝 + 马赫环。
//   烟雾：单个 InstancedMesh（296 实例 ≤300），运动/翻滚/生灭全部在顶点着色器内写成 (t-spawn) 的
//         闭式函数（零 CPU 逐帧更新、天然纯函数）；fbm 表面沸腾位移 + 逐顶点侵蚀 alpha + 片元
//         假体积光照（火焰暖光 + 跟踪冷光 + 环境光）。
//   相机：全程 controls.setLookAt(..., false) 驱动；确定性正弦抖动（不用随机）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const LAUNCH = {
  DURATION: 26,
  T_IGNITE: 3,     // 点火
  T_LIFTOFF: 4.6,  // 摆杆摆开 + 离台
  T_BSEP: 13,      // 助推器分离
  T_FAIRING: 16,   // 整流罩分离
  T_S1SEP: 19,     // 芯一级分离
};

const ARM_SWING = THREE.MathUtils.degToRad(75); // 摆杆摆开角度

/* ================= GLSL：噪声 ================= */

const NOISE2 = /* glsl */ `
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float vnoise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm2(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise2(p); p *= 2.03; a *= 0.5; }
  return s;
}
`;

const NOISE3 = /* glsl */ `
float hash31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123); }
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i);
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
             mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
float fbm3(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 2; i++) { s += a * vnoise3(p); p *= 2.13; a *= 0.5; }
  return s;
}
`;

/* ================= GLSL：火焰 ================= */

// 层叠旋转面羽流：uv.y = 0 喷口 → 1 焰尖；aLayer 0/1/2 = 内/中/外层
const FLAME_VERT = /* glsl */ `
uniform float uTime;
uniform float uPower;
uniform float uLen;
uniform float uRad;
uniform float uSeed;
uniform float uFlow;
attribute float aLayer;
varying vec2 vUv;
varying float vLayer;
${NOISE2}
void main() {
  vUv = uv;
  vLayer = aLayer;
  vec3 p = position;
  float v = uv.y;
  float ang = atan(p.x, p.z);
  // 沿轴流动的湍流鼓包（根部稳定、向焰尖放大）
  float n = fbm2(vec2(ang * 1.2 + uSeed * 7.0 + aLayer * 3.1, v * 3.5 - uTime * uFlow));
  float amp = 0.28 * smoothstep(0.04, 0.45, v);
  float rs = 1.0 + (n - 0.5) * 2.0 * amp;
  float root = 0.30 + 0.70 * min(1.0, uPower * 1.7);   // 先成小团
  p.xz *= rs * uRad * root;
  // 焰尖摆动
  p.x += (fbm2(vec2(uSeed * 3.0, v * 2.0 - uTime * uFlow * 0.6)) - 0.5) * 0.5 * v * uRad;
  p.y *= uLen * (0.20 + 0.80 * pow(uPower, 1.35));      // 后拉伸成锥
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

// 煤油（YF-100）：亮橙黄芯 + 橙红外层
const FLAME_FRAG_KERO = /* glsl */ `
uniform float uTime;
uniform float uPower;
uniform float uSeed;
uniform float uIntensity;
uniform float uFlow;
varying vec2 vUv;
varying float vLayer;
${NOISE2}
void main() {
  float v = vUv.y;
  float er = fbm2(vec2(vUv.x * 7.0 + uSeed * 11.0 + vLayer * 5.0, v * 5.0 - uTime * uFlow * 1.3));
  float th = 0.30 + vLayer * 0.17;
  float body = smoothstep(th, th + 0.30, er + (1.0 - v) * 0.32);
  float tipFade = 1.0 - smoothstep(0.55, 1.0, v);
  vec3 col = mix(vec3(1.0, 0.75, 0.35), vec3(1.0, 0.42, 0.08), smoothstep(0.02, 0.40, v));
  col = mix(col, vec3(0.55, 0.08, 0.02), smoothstep(0.40, 0.92, v));
  col += vec3(1.0, 0.72, 0.35) * (1.0 - smoothstep(0.0, 0.16, v)) * 0.5;
  float lw = vLayer < 0.5 ? 0.85 : (vLayer < 1.5 ? 0.45 : 0.20);
  float a = body * tipFade * uPower;
  gl_FragColor = vec4(col * uIntensity * lw, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// 氢氧（YF-77 / YF-75D）：近透明淡蓝锥 + 马赫环亮点
const FLAME_FRAG_HYDRO = /* glsl */ `
uniform float uTime;
uniform float uPower;
uniform float uSeed;
uniform float uIntensity;
uniform float uFlow;
varying vec2 vUv;
varying float vLayer;
${NOISE2}
void main() {
  float v = vUv.y;
  float er = fbm2(vec2(vUv.x * 8.0 + uSeed * 13.0 + vLayer * 5.0, v * 5.0 - uTime * uFlow * 1.4));
  float th = 0.30 + vLayer * 0.16;
  float body = smoothstep(th, th + 0.32, er + (1.0 - v) * 0.30);
  float tipFade = 1.0 - smoothstep(0.50, 1.0, v);
  // 马赫环：沿轴周期性亮带
  float bands = pow(0.5 + 0.5 * sin(v * 22.0 + uSeed * 3.0), 6.0);
  vec3 col = vec3(0.55, 0.72, 1.0);
  col += vec3(0.85, 0.92, 1.0) * bands * 1.5 * (1.0 - v * 0.55);
  col += vec3(0.90, 0.95, 1.0) * (1.0 - smoothstep(0.0, 0.14, v)) * 1.0;
  float lw = vLayer < 0.5 ? 1.2 : (vLayer < 1.5 ? 0.6 : 0.3);
  float a = body * tipFade * uPower * 0.32;
  gl_FragColor = vec4(col * uIntensity * lw, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* ================= GLSL：烟雾（实例化软粒子团） ================= */

// 全部运动在顶点着色器内闭式求解：aSpawn 出生点、aVel 初速（带指数阻力）、
// aTime = (出生 t, 寿命, 初始尺寸, 生长率)、aMisc = (种子, 翻滚速率, 类型, 摆动幅度)
// 类型：0 = 导流槽浓烟（灰）/ 1 = 喷水白雾 / 2 = 分离白烟
const SMOKE_VERT = /* glsl */ `
uniform float uTime;
attribute vec3 aSpawn;
attribute vec3 aVel;
attribute vec4 aTime;
attribute vec4 aMisc;
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vWorld;
varying float vAlpha;
varying float vSeed;
varying float vType;
${NOISE3}
void main() {
  float dt = uTime - aTime.x;
  float life = aTime.y;
  float env = smoothstep(0.0, 0.55, dt) * (1.0 - smoothstep(life * 0.55, life, dt));
  if (dt < 0.0 || dt > life) env = 0.0;
  float dtc = max(dt, 0.0);
  float k = 0.35; // 水平阻力
  vec3 travel = aVel * (1.0 - exp(-k * dtc)) / k;
  float ph = aMisc.x * 17.0;
  float sw = aMisc.w * min(dtc, 3.0);
  vec3 swirl = vec3(sin(dtc * 1.1 + ph), 0.35 * sin(dtc * 1.9 + ph * 1.3), cos(dtc * 0.9 + ph)) * sw;
  vec3 center = aSpawn + travel + swirl;
  float scale = aTime.z + aTime.w * pow(dtc, 0.75);
  scale *= step(0.0001, env);
  vLocal = position;
  // 表面沸腾位移（翻滚感）
  float boil = vnoise3(position * 1.5 + aMisc.x * 37.0 + vec3(0.0, -uTime * 0.28 * aMisc.y, uTime * 0.17 * aMisc.y));
  vec3 displaced = position * (1.0 + 0.55 * (boil - 0.5));
  // 侵蚀移到片元（逐顶点在低球面上有棱面感）；顶点只传生命包络
  vAlpha = env * 0.75;
  vec4 world = modelMatrix * vec4(center + displaced * scale, 1.0);
  vWorld = world.xyz;
  vSeed = aMisc.x;
  vType = aMisc.z;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const SMOKE_FRAG = /* glsl */ `
uniform vec3 uFirePos;
uniform float uFireI;
uniform vec3 uTrackPos;
uniform float uTrackI;
uniform float uAmbient;
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vWorld;
varying float vAlpha;
varying float vSeed;
varying float vType;
${NOISE3}
void main() {
  // 片元 fbm 侵蚀 + 视线边缘软化 → 软烟团
  float e = fbm3(vLocal * 2.2 + vSeed * 53.0);
  vec3 V = normalize(cameraPosition - vWorld);
  float rim = abs(dot(normalize(vNormalW), V));
  float a = vAlpha * smoothstep(0.28, 0.62, e) * smoothstep(0.05, 0.42, rim);
  if (a < 0.004) discard;
  vec3 base = vType < 0.5 ? vec3(0.40, 0.42, 0.46)
            : (vType < 1.5 ? vec3(0.72, 0.76, 0.81) : vec3(0.82, 0.85, 0.89));
  vec3 N = normalize(vNormalW);
  vec3 Lf = normalize(uFirePos - vWorld);
  float diff = 0.55 + 0.45 * max(dot(N, Lf), 0.0);
  float dF = distance(vWorld, uFirePos);
  float fireL = uFireI / (1.0 + dF * dF / 500.0);
  float dT = distance(vWorld, uTrackPos);
  float trackL = uTrackI / (1.0 + dT * dT / 1800.0);
  vec3 col = base * (uAmbient + trackL * vec3(0.65, 0.72, 0.95));
  col += vec3(1.0, 0.42, 0.12) * fireL * diff * (base + 0.35);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* ================= 主构建 ================= */

export function createLaunch(ctx) {
  const { rand, controls, rocket, parts, env } = ctx;

  const group = new THREE.Group();
  group.name = 'launchfx';

  /* ---- 常量与工具 ---- */
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const sstep = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
  const ramp = (dt, w) => sstep(dt / w);                       // 0→1 平滑斜坡
  const pulse = (t, a, b, w = 0.8) => ramp(t - a, w) * (1 - ramp(t - b, w)); // 事件窗口
  const lerp = THREE.MathUtils.lerp;

  const rocketYaw = rocket.rotation.y;
  const cosY = Math.cos(rocketYaw), sinY = Math.sin(rocketYaw);
  // 火箭局部 (x,z) → 世界水平偏移
  const rotY = (x, z) => [x * cosY + z * sinY, -x * sinY + z * cosY];

  // 高度曲线 h(t)：τ = t - 离台；缓起渐加速（分段匀加速）
  function hOf(t) {
    const tau = Math.max(0, t - LAUNCH.T_LIFTOFF);
    if (tau <= 4) return 2.2 * tau * tau;                        // h(4)=35.2, v=17.6
    const h1 = 35.2 + 17.6 * (tau - 4) + 1.5 * (tau - 4) * (tau - 4);
    if (tau <= 14.4) return h1;                                  // h(14.4)=380 @芯一级分离
    const d = tau - 14.4;
    return 380.4 + 48.8 * d + 0.6 * d * d;                       // 分离后续爬升，末速放缓
  }

  /* ---- 火焰几何：层叠旋转面（3 层合并） ---- */
  function plumeGeometry(profilePts) {
    const layers = [0.55, 0.85, 1.12];
    const geos = [];
    for (let L = 0; L < 3; L++) {
      const pts = profilePts.map(([r, y]) => new THREE.Vector2(r * layers[L], y));
      const g = new THREE.LatheGeometry(pts, 20);
      const n = g.attributes.position.count;
      g.setAttribute('aLayer', new THREE.BufferAttribute(new Float32Array(n).fill(L), 1));
      geos.push(g);
    }
    return mergeGeometries(geos);
  }
  // 煤油羽流剖面（海平面过膨胀：喷口鼓包后收尖），单位长度（y: 0 → -1）
  const KERO_PROFILE = [
    [1.00, 0.00], [1.05, -0.05], [1.18, -0.14], [1.22, -0.28], [1.18, -0.42],
    [1.04, -0.58], [0.84, -0.72], [0.56, -0.85], [0.28, -0.94], [0.02, -1.00],
  ];
  // 氢氧羽流剖面（更细长）
  const HYDRO_PROFILE = [
    [0.95, 0.00], [0.98, -0.06], [1.05, -0.16], [1.02, -0.30], [0.88, -0.48],
    [0.66, -0.66], [0.42, -0.80], [0.20, -0.91], [0.02, -1.00],
  ];
  const keroGeo = plumeGeometry(KERO_PROFILE);
  const hydroGeo = plumeGeometry(HYDRO_PROFILE);

  function flameMaterial(hydro, seed) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: FLAME_VERT,
      fragmentShader: hydro ? FLAME_FRAG_HYDRO : FLAME_FRAG_KERO,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uPower: { value: 0 },
        uLen: { value: 14 },
        uRad: { value: 1 },
        uSeed: { value: seed },
        uFlow: { value: hydro ? 7.0 : 5.5 },
        uIntensity: { value: 0 },
      },
    });
    mat.fog = false;
    return mat;
  }

  function makePlume(hydro, seed) {
    const mesh = new THREE.Mesh(hydro ? hydroGeo : keroGeo, flameMaterial(hydro, seed));
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;
    mesh.visible = false;
    mesh.rotation.y = rocketYaw; // 羽流随箭 yaw（径向对称，仅让噪声相位正确）
    group.add(mesh);
    return mesh;
  }

  // 羽流：助推器 ×4（煤油）、芯级 ×2（氢氧）、二级 ×2（氢氧）、导流槽喷焰 ×2（煤油，横向）
  const boostPlumes = [0, 1, 2, 3].map((i) => makePlume(false, 1.7 + i * 3.3));
  const corePlumes = [0, 1].map((i) => makePlume(true, 11.3 + i * 4.1));
  const s2Plumes = [0, 1].map((i) => makePlume(true, 23.9 + i * 5.7));
  const trenchPlumes = [0, 1].map((i) => {
    const m = makePlume(false, 31.7 + i * 6.3);
    // 横向喷焰：置于槽口外、露出地面（槽内会被槽壁挡住），微上仰
    m.rotation.set(0, 0, (i === 0 ? 1 : -1) * (Math.PI / 2 - 0.2)); // +X / −X 水平微上仰
    m.position.set(i === 0 ? 29 : -29, 0.3, 0);
    return m;
  });

  /* ---- 烟雾系统（单 InstancedMesh，296 实例） ---- */
  const TRENCH_N = 200, DELUGE_N = 56, SEP_N = 40;
  const SMOKE_N = TRENCH_N + DELUGE_N + SEP_N;

  const hB = hOf(LAUNCH.T_BSEP);            // 分离时刻高度（用于预置分离烟出生点）
  const rocketBaseB = 8 + hB;
  const boosterLocal = [];                   // 助推器合拢位（局部）
  const boosterRadial = [];                  // 径向单位向量（局部）
  for (let i = 0; i < 4; i++) {
    const a = parts['booster' + i].userData.assembled;
    boosterLocal.push(new THREE.Vector3(a.x, a.y, a.z));
    boosterRadial.push(new THREE.Vector3(a.x, 0, a.z).normalize());
  }

  const smokeData = { spawn: [], vel: [], time: [], misc: [] };
  function pushPuff(spawn, vel, time, misc) {
    smokeData.spawn.push(...spawn);
    smokeData.vel.push(...vel);
    smokeData.time.push(...time);
    smokeData.misc.push(...misc);
  }
  // 导流槽浓烟：两端喷出，向 ±X 翻滚扩散
  for (let i = 0; i < TRENCH_N; i++) {
    const side = i < TRENCH_N / 2 ? -1 : 1;
    pushPuff(
      [side * (23 + rand() * 5), -4.5 + rand() * 3.5, (rand() - 0.5) * 7],
      [side * (6 + rand() * 8), 1.2 + rand() * 3.2, (rand() - 0.5) * 3],
      [LAUNCH.T_IGNITE + 0.05 + (i % (TRENCH_N / 2)) * 0.075 + rand() * 0.05,
       5.5 + rand() * 3.5, 1.1 + rand() * 1.1, 1.5 + rand() * 1.2],
      [rand(), (rand() - 0.5) * 2, 0, 0.5 + rand() * 1.0],
    );
  }
  // 喷水降噪白雾：MLP 台周一圈腾起
  for (let i = 0; i < DELUGE_N; i++) {
    const ang = rand() * Math.PI * 2;
    const r = 12.5 + rand() * 3;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    pushPuff(
      [ca * r, 0.2 + rand() * 2, sa * r],
      [ca * (2.5 + rand() * 2.5), 3 + rand() * 3.5, sa * (2.5 + rand() * 2.5)],
      [LAUNCH.T_IGNITE + 0.02 + i * 0.05 + rand() * 0.04, 3 + rand() * 2,
       0.9 + rand() * 0.8, 2.0 + rand() * 1.2],
      [rand(), (rand() - 0.5) * 2, 1, 0.3 + rand() * 0.5],
    );
  }
  // 助推器分离白烟：分离瞬间贴箭体一小团
  for (let b = 0; b < 4; b++) {
    const [rwx, rwz] = rotY(boosterRadial[b].x, boosterRadial[b].z);
    const [bwx, bwz] = rotY(boosterLocal[b].x, boosterLocal[b].z);
    for (let j = 0; j < SEP_N / 4; j++) {
      const [jwx, jwz] = rotY((rand() - 0.5) * 2, (rand() - 0.5) * 2);
      pushPuff(
        [bwx + jwx, rocketBaseB + 4 + rand() * 18, bwz + jwz],
        [rwx * (2.5 + rand() * 4) + (rand() - 0.5) * 2, (rand() - 0.5) * 2, rwz * (2.5 + rand() * 4) + (rand() - 0.5) * 2],
        [LAUNCH.T_BSEP + rand() * 0.22, 1.6 + rand() * 1.2, 0.9 + rand() * 0.6, 2.2 + rand() * 1.2],
        [rand(), (rand() - 0.5) * 2, 2, 0.3 + rand() * 0.4],
      );
    }
  }

  const smokeGeo = new THREE.SphereGeometry(1, 9, 7);
  smokeGeo.setAttribute('aSpawn', new THREE.InstancedBufferAttribute(new Float32Array(smokeData.spawn), 3));
  smokeGeo.setAttribute('aVel', new THREE.InstancedBufferAttribute(new Float32Array(smokeData.vel), 3));
  smokeGeo.setAttribute('aTime', new THREE.InstancedBufferAttribute(new Float32Array(smokeData.time), 4));
  smokeGeo.setAttribute('aMisc', new THREE.InstancedBufferAttribute(new Float32Array(smokeData.misc), 4));
  const smokeMat = new THREE.ShaderMaterial({
    vertexShader: SMOKE_VERT,
    fragmentShader: SMOKE_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uFirePos: { value: new THREE.Vector3(0, 2, 0) },
      uFireI: { value: 0 },
      uTrackPos: { value: new THREE.Vector3() },
      uTrackI: { value: 0 },
      uAmbient: { value: 0.30 },
    },
  });
  smokeMat.fog = false;
  const smoke = new THREE.InstancedMesh(smokeGeo, smokeMat, SMOKE_N);
  smoke.frustumCulled = false;
  smoke.renderOrder = 6;
  smoke.visible = false;
  group.add(smoke);

  /* ---- 灯光（新增 2 盏 ≤3） ---- */
  // 火焰主光：橙色，强度随火焰建立 + 闪烁，随箭上升；芯一级分离后转冷色
  const fireLight = new THREE.PointLight(0xff8a3c, 0, 220, 2);
  fireLight.position.set(0, 2, 0);
  group.add(fireLight);
  // 跟踪补光：高空段照亮箭体（分离事件可读）
  const trackLight = new THREE.PointLight(0xcfe0ff, 0, 260, 2);
  trackLight.position.set(-20, 60, -35);
  group.add(trackLight);
  // 高空阳光：t≈11s 起渐入（深空段照亮分离件/探测器；地面段强度 0 不影响夜景）
  const sunLight = new THREE.DirectionalLight(0xfff4e0, 0);
  sunLight.position.set(280, 520, -260);
  group.add(sunLight, sunLight.target);

  /* ---- 光斑 / 辉光（程序化 CanvasTexture 径向渐变，不生图） ---- */
  function makeGlowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const glowTex = makeGlowTexture();

  // 地面照亮光斑（加色大平面，点火时地面泛橙）
  const groundGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshBasicMaterial({
      map: glowTex, color: 0xff7a30, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  groundGlow.material.fog = false;
  groundGlow.rotation.x = -Math.PI / 2;
  groundGlow.position.y = 0.15;
  groundGlow.renderOrder = 2;
  groundGlow.visible = false;
  group.add(groundGlow);

  // 发动机辉光（夜空中的明亮光点）
  const engineGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xff9040, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  engineGlow.material.fog = false;
  engineGlow.renderOrder = 9;
  engineGlow.visible = false;
  group.add(engineGlow);
  // 二级辉光（结尾远处亮点）
  const s2Glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xbfd4ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  s2Glow.material.fog = false;
  s2Glow.renderOrder = 9;
  s2Glow.visible = false;
  group.add(s2Glow);

  /* ---- 深空球：内翻球 + 按视线方向采样 equirect（与 scene.background 同款数学， ----
     规避球面 UV 采样的不确定性）；uVShift 把地球弧线上抬到收尾画框内 ---- */
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uMap: { value: env.spaceTex },
      uOpacity: { value: 0 },
      uVShift: { value: -0.05 }, // 把地球弧线（原图仰角 -14.4°）上抬至约 -5.4°，确保在收尾画框内
      uBoost: { value: 1.55 }, // 深空段整体提亮（用户反馈太暗）
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vDir = wp.xyz - cameraPosition; // 按视线方向采样（相机偏离球心时不能用球心方向）
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uOpacity;
      uniform float uVShift;
      uniform float uBoost;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float u = atan(d.z, d.x) / 6.28318530718 + 0.5;
        float v = asin(clamp(d.y, -1.0, 1.0)) / 3.14159265359 + 0.5 + uVShift;
        vec3 col = texture2D(uMap, vec2(u, v)).rgb * uBoost;
        gl_FragColor = vec4(col, uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  skyMat.fog = false;
  const skySphere = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat);
  skySphere.renderOrder = 1;
  skySphere.visible = false;
  group.add(skySphere);

  /* ---- 各段运动学（全部为 t 的闭式函数） ---- */

  const boosterInit = [];
  for (let i = 0; i < 4; i++) {
    boosterInit.push({
      yaw: parts['booster' + i].rotation.y,
      tipAxis: (i === 0 || i === 2) ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0),
      tipSign: i === 0 ? -1 : i === 2 ? 1 : i === 1 ? 1 : -1, // 顶部向各自径向外翻
      spinSign: i % 2 === 0 ? 1 : -1,
    });
  }
  const _qTip = new THREE.Quaternion(), _qYaw = new THREE.Quaternion();
  const _Y = new THREE.Vector3(0, 1, 0);

  // 助推器：t<T_BSEP 合拢；分离后径向漂移 + 外翻 + 滚转 + 相对下坠
  function boosterState(i, t, outPos, outQuat) {
    const tau = t - LAUNCH.T_BSEP;
    const init = boosterInit[i];
    outPos.copy(boosterLocal[i]);
    let tip = 0, spin = 0;
    if (tau > 0) {
      const radial = 10 * (1 - Math.exp(-tau / 0.8)) + 1.2 * tau;
      const relY = -2.0 * tau * tau; // 火箭继续加速 → 相对下坠
      outPos.addScaledVector(boosterRadial[i], radial);
      outPos.y += relY;
      tip = 0.55 * (1 - Math.exp(-tau / 0.7)) + 0.06 * tau;
      spin = 0.25 * tau * init.spinSign;
    }
    _qTip.setFromAxisAngle(init.tipAxis, init.tipSign * tip);
    _qYaw.setFromAxisAngle(_Y, init.yaw + spin);
    outQuat.copy(_qTip).multiply(_qYaw);
  }

  // 整流罩：t<T_FAIRING 合拢；分离后两侧张开平移漂走 + 微转
  function fairingState(side, t, outPos, outQuat) {
    const tau = t - LAUNCH.T_FAIRING;
    outPos.set(0, 45, 0);
    let tip = 0, yawDrift = 0;
    if (tau > 0) {
      const x = 14 * (1 - Math.exp(-tau / 0.75));
      outPos.x += side * x;
      outPos.y += -1.6 * tau * tau;
      tip = Math.min(1.0, 0.45 * tau + 0.3 * (1 - Math.exp(-tau / 0.5)));
      yawDrift = -side * 0.12 * tau;
    }
    _qTip.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -side * tip); // side=+1(+X 瓣) 顶向 +X 倾
    _qYaw.setFromAxisAngle(_Y, yawDrift);
    outQuat.copy(_qYaw).multiply(_qTip);
  }

  // 芯一级 + 级间段：t<T_S1SEP 合拢；分离后整体下坠 + 微滚转（绕同一 pivot 保持刚性连接）
  const _s1Axis = new THREE.Vector3(1, 0, 0.35).normalize();
  const _s1Quat = new THREE.Quaternion();
  const _s1Pos = new THREE.Vector3();
  function s1State(t) {
    const tau = Math.max(0, t - LAUNCH.T_S1SEP);
    const fall = -2.6 * tau * tau;
    const driftX = 0.8 * tau;
    const ang = Math.min(0.85, 0.10 * tau * tau);
    _s1Quat.setFromAxisAngle(_s1Axis, ang);
    _s1Pos.set(driftX, fall, 0);
  }

  /* ---- 相机轨迹 ---- */
  const _camPos = new THREE.Vector3(), _camTgt = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  let camDist = 60; // 供辉光缩放

  function camAt(t, h) {
    // 跟踪机位：pos = 箭底 + dir*D，target = 箭底 + yoff（yoff 随事件窗口转移焦点）
    let dirY = -0.30;
    if (t > 19.5) dirY = -0.30 + 0.46 * sstep((t - 19.5) / 2.5); // 收尾快速放平（近似平视），收入地球弧线
    _dir.set(-0.45, dirY, -0.78).normalize();
    let D = 48 + 0.12 * h;
    if (t > 19.5) D += (t - 19.5) * 26; // 分离后停追拉远 → 箭体缩小
    camDist = D;
    // 焦点：默认中下段；分离窗口依次转向助推器 / 整流罩 / 级间段 / 二级
    let yoff = 16;
    yoff = lerp(yoff, 10, pulse(t, 12.2, 14.8));
    yoff = lerp(yoff, 44, pulse(t, 15.2, 17.9));
    yoff = lerp(yoff, 34, pulse(t, 18.5, 20.8));
    yoff = lerp(yoff, 36, sstep((t - 20.8) / 1.2));
    const tx = 0, ty = 8 + h + yoff, tz = 0;
    const px = _dir.x * D, py = Math.max(3.2, 8 + h + _dir.y * D), pz = _dir.z * D;

    if (t <= LAUNCH.T_LIFTOFF) {
      // 倒计时起点 = main.js 的 launchpad 机位（点火按钮按下时零跳变接入），
      // 3s 内缓推到方位 ~200° 的低位机位（正对涂装面，避开 MLP 西南柱对发动机区的遮挡）
      const k1 = sstep(t / LAUNCH.T_IGNITE);
      _camPos.set(lerp(-34, -16.5, k1), lerp(7, 7.5, k1), lerp(-42, -46, k1));
      _camTgt.set(0, lerp(22, 10, sstep((t - LAUNCH.T_IGNITE) / 1.4)), 0);
      camDist = _camPos.distanceTo(_camTgt);
    } else {
      // 离台后平滑混入跟踪机位
      const k = sstep((t - LAUNCH.T_LIFTOFF) / 2.8);
      _camPos.set(lerp(-16.5, px, k), lerp(7.5, py, k), lerp(-46, pz, k));
      _camTgt.set(0, lerp(10, ty, k), 0);
      camDist = lerp(_camPos.distanceTo(_camTgt), D, k);
    }
  }

  // 确定性微震：点火 → 离台+2s 主震，分离事件小额冲击（幅值克制）
  function addShake(t) {
    let amp = 0.38 * ramp(t - LAUNCH.T_IGNITE, 0.5) * (1 - ramp(t - LAUNCH.T_LIFTOFF, 2.4));
    if (t > LAUNCH.T_BSEP) amp += 0.16 * Math.exp(-(t - LAUNCH.T_BSEP) * 2.6);
    if (t > LAUNCH.T_S1SEP) amp += 0.12 * Math.exp(-(t - LAUNCH.T_S1SEP) * 2.6);
    if (amp <= 0.0005) return;
    _camPos.x += amp * 0.35 * (Math.sin(t * 39.7) + 0.6 * Math.sin(t * 57.9 + 1.3));
    _camPos.y += amp * 0.30 * (Math.sin(t * 47.3 + 0.7) + 0.6 * Math.sin(t * 71.1 + 2.1));
    _camPos.z += amp * 0.35 * (Math.sin(t * 43.1 + 2.9) + 0.6 * Math.sin(t * 63.7 + 0.5));
    _camTgt.x += amp * 0.7 * Math.sin(t * 36.3 + 1.9);
    _camTgt.y += amp * 0.55 * Math.sin(t * 51.7 + 0.3);
    _camTgt.z += amp * 0.7 * Math.sin(t * 41.9 + 2.3);
  }

  /* ---- 预分配临时对象 ---- */
  const _pos = new THREE.Vector3(), _quat = new THREE.Quaternion();
  const _wings = parts.payload.userData.wings;
  const _fireColorA = new THREE.Color(0xff8a3c), _fireColorB = new THREE.Color(0x9db8ff);

  /* ================= seek：t 的纯函数 ================= */

  function seek(tRaw) {
    const t = Math.min(LAUNCH.DURATION, Math.max(0, tRaw));
    const h = hOf(t);
    const flick = 1 + 0.09 * Math.sin(t * 41.3) + 0.06 * Math.sin(t * 67.7 + 1.7) + 0.05 * Math.sin(t * 23.9 + 0.6);

    // --- 火箭整体 ---
    rocket.position.set(0, 8 + h, 0);

    // --- 摆杆（离台瞬间 0.8s 摆开 75°） ---
    const armK = ramp(t - (LAUNCH.T_LIFTOFF - 0.05), 0.8);
    parts.arm1.rotation.y = armK * ARM_SWING;
    parts.arm2.rotation.y = armK * ARM_SWING;

    // --- 助推器 ---
    for (let i = 0; i < 4; i++) {
      boosterState(i, t, _pos, _quat);
      const b = parts['booster' + i];
      b.position.copy(_pos);
      b.quaternion.copy(_quat);
    }

    // --- 整流罩 + 太阳翼 ---
    fairingState(1, t, _pos, _quat);
    parts.fairingR.position.copy(_pos);
    parts.fairingR.quaternion.copy(_quat);
    fairingState(-1, t, _pos, _quat);
    parts.fairingL.position.copy(_pos);
    parts.fairingL.quaternion.copy(_quat);
    const wingK = ramp(t - (LAUNCH.T_FAIRING + 0.5), 1.0);
    parts.wingL.rotation.z = -_wings.folded * (1 - wingK);
    parts.wingR.rotation.z = _wings.folded * (1 - wingK);

    // --- 芯一级 + 级间段 ---
    s1State(t);
    parts.stage1.position.copy(_s1Pos);
    parts.stage1.quaternion.copy(_s1Quat);
    _pos.set(0, 31, 0).applyQuaternion(_s1Quat).add(_s1Pos);
    parts.interstage.position.copy(_pos);
    parts.interstage.quaternion.copy(_s1Quat);

    // --- 相机轨迹先行（烟雾光照/辉光缩放都引用本帧的相机与跟踪光位置） ---
    camAt(t, h);
    // 跟踪补光放相机一侧，照亮箭体迎光面
    trackLight.position.set(
      _camPos.x * 0.25 + _dir.x * 6,
      8 + h + 12,
      _camPos.z * 0.25 + _dir.z * 6
    );

    // --- 火焰功率包络 ---
    const P_boost = ramp(t - LAUNCH.T_IGNITE, 0.75) * (1 - ramp(t - LAUNCH.T_BSEP, 0.35));
    const P_core = ramp(t - (LAUNCH.T_IGNITE + 0.08), 0.85) * (1 - ramp(t - LAUNCH.T_S1SEP, 0.4));
    const P_s2 = ramp(t - LAUNCH.T_S1SEP, 0.6);
    const P_tr = ramp(t - (LAUNCH.T_IGNITE + 0.15), 0.7) * (1 - ramp(t - (LAUNCH.T_LIFTOFF + 3.2), 1.6));
    const fireP = Math.max(P_boost, P_core);

    // 助推器羽流：跟助推器局部位（分离后 0.35s 内熄火，位置同步即可）
    for (let i = 0; i < 4; i++) {
      const m = boostPlumes[i];
      const P = P_boost;
      m.visible = P > 0.002;
      if (m.visible) {
        boosterState(i, t, _pos, _quat);
        _pos.y -= 2.3; // 喷口面
        const [wx, wz] = rotY(_pos.x, _pos.z);
        m.position.set(wx, 8 + h + _pos.y, wz);
        const u = m.material.uniforms;
        u.uTime.value = t; u.uPower.value = P;
        u.uLen.value = 14 + 6 * sstep(h / 180);
        u.uRad.value = 1.45;
        u.uIntensity.value = P * flick * 0.45;
      }
    }
    // 芯级双羽流（淡蓝）
    for (let j = 0; j < 2; j++) {
      const m = corePlumes[j];
      m.visible = P_core > 0.002;
      if (m.visible) {
        const lx = (j === 0 ? 1.1 : -1.1) + _s1Pos.x;
        const ly = -2.6 + _s1Pos.y;
        const [wx, wz] = rotY(lx, 0);
        m.position.set(wx, 8 + h + ly, wz);
        const u = m.material.uniforms;
        u.uTime.value = t; u.uPower.value = P_core;
        u.uLen.value = 12 + 4 * sstep(h / 180);
        u.uRad.value = 0.9;
        u.uIntensity.value = P_core * flick * 0.8;
      }
    }
    // 二级双羽流（真空膨胀：更长更宽更透明）
    for (let j = 0; j < 2; j++) {
      const m = s2Plumes[j];
      m.visible = P_s2 > 0.002;
      if (m.visible) {
        const lx = j === 0 ? 0.8 : -0.8;
        const [wx, wz] = rotY(lx, 0);
        m.position.set(wx, 8 + h + 30.0, wz);
        const u = m.material.uniforms;
        u.uTime.value = t; u.uPower.value = P_s2;
        u.uLen.value = 7 + 4 * ramp(t - LAUNCH.T_S1SEP, 4);
        u.uRad.value = 0.75 + 0.4 * ramp(t - LAUNCH.T_S1SEP, 4);
        u.uIntensity.value = P_s2 * flick * 0.8;
      }
    }
    // 导流槽横向喷焰
    for (let j = 0; j < 2; j++) {
      const m = trenchPlumes[j];
      m.visible = P_tr > 0.002;
      if (m.visible) {
        const u = m.material.uniforms;
        u.uTime.value = t; u.uPower.value = P_tr;
        u.uLen.value = 11; u.uRad.value = 2.4;
        u.uIntensity.value = P_tr * flick * 0.85;
      }
    }

    // --- 烟雾 ---
    const smokeOn = (t > LAUNCH.T_IGNITE - 0.05 && t < 19) || (t > LAUNCH.T_BSEP - 0.1 && t < 17.6);
    smoke.visible = smokeOn;
    if (smokeOn) {
      const su = smokeMat.uniforms;
      su.uTime.value = t;
      su.uFirePos.value.set(0, 2 + h, 0);
      su.uFireI.value = 1.2 * fireP * flick;
      su.uTrackPos.value.copy(trackLight.position);
      su.uTrackI.value = trackLight.intensity / 5000;
    }

    // --- 灯光 ---
    const dim = (1 - 0.65 * ramp(t - LAUNCH.T_BSEP, 0.5)) * (1 - 0.65 * ramp(t - LAUNCH.T_S1SEP, 0.5));
    fireLight.intensity = 10000 * fireP * flick * dim;
    fireLight.position.set(0, 2 + h, 0);
    fireLight.color.lerpColors(_fireColorA, _fireColorB, ramp(t - LAUNCH.T_S1SEP, 1));
    trackLight.intensity = 5000 * ramp(t - 6, 3) * (1 - 0.4 * ramp(t - 19.5, 2));
    sunLight.intensity = 1.9 * ramp(t - 11, 3); // 高空阳光渐入

    // --- 地面光斑 / 辉光 ---
    groundGlow.visible = fireP > 0.002 && h < 70;
    if (groundGlow.visible) {
      groundGlow.material.opacity = 0.38 * fireP * flick * (1 - sstep((h - 10) / 50));
    }
    engineGlow.visible = fireP > 0.002;
    if (engineGlow.visible) {
      engineGlow.position.set(0, 8 + h - 4, 0);
      engineGlow.material.opacity = 0.22 * fireP * flick;
      const s = 5 + 0.012 * camDist;
      engineGlow.scale.set(s, s, 1);
    }
    s2Glow.visible = P_s2 > 0.002;
    if (s2Glow.visible) {
      s2Glow.position.set(0, 8 + h + 29.5, 0);
      s2Glow.material.opacity = 0.9 * P_s2;
      const s = 7 + 0.035 * camDist;
      s2Glow.scale.set(s, s, 1);
    }

    // --- 深空球淡入 ---
    const skyK = sstep((t - LAUNCH.T_BSEP) / (LAUNCH.T_S1SEP + 3 - LAUNCH.T_BSEP));
    skySphere.visible = skyK > 0.002;
    if (skySphere.visible) skyMat.uniforms.uOpacity.value = skyK;

    // --- 相机写入（camAt 已在前文调用，此处只加抖动并落盘；用户接管时不写） ---
    addShake(t);
    if (cameraEnabled) {
      controls.setLookAt(_camPos.x, _camPos.y, _camPos.z, _camTgt.x, _camTgt.y, _camTgt.z, false);
    }
  }

  function reset() {
    seek(0);
  }

  // 相机接管开关：main.js 在用户拖拽/序列结束时置 false，本模块即不再写相机
  let cameraEnabled = true;

  // 集成兜底：发射完/中途切到其他板块时，main.js 不调用本模块的 reset——
  // 这里监听导航点击，离开「发射」板块即恢复初始（段位置由 applyExplode 接管，
  // 但分离产生的旋转/太阳翼/摆杆只有本模块会还原）。
  document.querySelectorAll('nav a[data-sec]').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.sec !== 'launch') reset();
    })
  );

  return {
    group, seek, reset,
    get cameraEnabled() { return cameraEnabled; },
    set cameraEnabled(v) { cameraEnabled = v; },
  };
}
