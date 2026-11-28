// A 组：长征五号火箭（rocket）
// 接口：export function buildRocket(ctx) → THREE.Group（name='rocket'）
// ctx = { THREE, rand, loader, texPath }；局部原点 = 芯一级底面圆心（堆叠表见 spec.md §3）
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const ROCKET_PARTS = ['payload', 'fairingL', 'fairingR', 'stage2', 'interstage', 'stage1', 'booster0', 'booster1', 'booster2', 'booster3'];

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/* ================= 自定义几何 ================= */

// 环带几何：rings [{y, r, o=向外偏移(+x), s=斜切系数(dy=s*r*cosA)}]（顺序任意，内部按 y 升序排为自下而上）
// 外向面（与 CylinderGeometry 同向），uv.y 由 uvY(i, y) 自定义
function ringGeometry(ringsIn, radialSegs = 48, uvY = null) {
  const rings = [...ringsIn].sort((p, q) => p.y - q.y); // 自下而上
  const pos = [], uv = [], idx = [];
  const n = rings.length;
  for (let i = 0; i < n; i++) {
    const { y, r, o = 0, s = 0 } = rings[i];
    for (let j = 0; j <= radialSegs; j++) {
      const a = (j / radialSegs) * Math.PI * 2;
      const sa = Math.sin(a), ca = Math.cos(a);
      pos.push(o + r * sa, y + s * r * sa, r * ca);
      uv.push(j / radialSegs, uvY ? uvY(i, y) : i / (n - 1));
    }
  }
  const w = radialSegs + 1;
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radialSegs; j++) {
    const a = i * w + j, b = a + w;
    idx.push(a, a + 1, b, a + 1, b + 1, b); // 外表面
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 带冷却管微凸竖纹的喷管：profile 自上而下 [[r, y]...]
function nozzleGeometry(profile, { radial = 48, ribs = 40, ribAmp = 0.008 } = {}) {
  const rings = profile.map(([r, y]) => ({ y, r }));
  const g = ringGeometry(rings, radial, (i) => i / (rings.length - 1)); // v: 出口 0 → 燃烧室 1
  if (ribAmp > 0) {
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), z = p.getZ(k);
      const a = Math.atan2(x, z);
      const f = 1 + (ribAmp * Math.cos(a * ribs)) / Math.max(0.2, Math.hypot(x, z));
      p.setX(k, x * f); p.setZ(k, z * f);
    }
    g.computeVertexNormals();
  }
  return g;
}

// 喷管铃型 profile：长度 L、出口半径 re、喉部半径 rt
function bellProfile(L, re, rt, steps = 22) {
  const pts = [[rt * 1.25, 0], [rt, -0.12]];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    pts.push([rt + (re - rt) * (1 - Math.pow(1 - t, 1.8)), -0.12 - (L - 0.12) * t]);
  }
  return pts;
}

// 整流罩剖面（局部 y，0 = 罩底）：圆柱 0~6.5 + 钝头锥 6.5~12.3（顶部钝圆）
function fairingProfile() {
  const pts = [[2.6, 0], [2.6, 6.5]];
  const R = 2.6, y0 = 6.5, y1 = 12.3;
  for (let i = 1; i <= 14; i++) {
    const t = i / 14;
    // 钝头 ogive：前段接近圆锥，顶部加速收圆
    const r = R * Math.pow(1 - Math.pow(t, 2.6), 0.72);
    pts.push([Math.max(r, 0.001), y0 + (y1 - y0) * t]);
  }
  return pts.map(([r, y]) => new THREE.Vector2(r, y));
}

/* ================= 贴花（CanvasTexture：国旗/中国航天/CASC 精确绘制） ================= */

function drawStar(g, cx, cy, R, rot = 0) {
  g.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + rot + (i * 2 * Math.PI) / 5;
    const a2 = a + Math.PI / 5;
    const r2 = R * 0.382;
    if (i === 0) g.moveTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
    else g.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
    g.lineTo(cx + r2 * Math.cos(a2), cy + r2 * Math.sin(a2));
  }
  g.closePath();
  g.fill();
}

// 芯一级贴花：国旗 + 竖排「中国航天」+ CASC 标志（布置于芯一级上部）
// 【位图约定】全部正向绘制、带顶内容（国旗）在位图顶部——CanvasTexture(flipY=true) 与筒面 UV 对齐。
// 不要用负 y 缩放变换画文字：各浏览器对变换内文字渲染不一致（实测出倒字），此坑已踩。
// patch：r=2.506，θlen=1.1（宽 2.76m），y∈[19.5, 30.7]（高 11.2m）
function makeMarkingsTexture() {
  const W = 1024, H = 2048, Wm = 2.76, Hm = 11.2;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const px = (u) => W / 2 + u * (W / Wm);   // 横向米（中轴 0）→ 像素列
  const py = (v) => H - v * (H / Hm);        // 纵向米（自 patch 底向上）→ 像素行（高 v → 位图顶部）

  // --- 国旗（1.2×0.8，v∈[9.9,10.7]；30×20 网格标准画法，星群在左上） ---
  {
    const fw = 1.2 * (W / Wm), fh = 0.8 * (H / Hm);
    const x0 = px(-0.6), y0 = py(10.7); // 旗面左上角
    g.fillStyle = '#de2910'; g.fillRect(x0, y0, fw, fh);
    g.fillStyle = '#ffde00';
    const u = fh / 20;
    const gx = (i) => x0 + i * u, gy = (j) => y0 + (20 - j) * u; // 网格 i 向右、j 向上
    drawStar(g, gx(5), gy(15), 3 * u);
    const small = [[10, 18], [12, 16], [12, 13], [10, 11]];
    for (const [sx, sy] of small) {
      const ang = Math.atan2(gy(15) - gy(sy), gx(5) - gx(sx));
      drawStar(g, gx(sx), gy(sy), 1 * u, ang + Math.PI / 2);
    }
  }

  // --- 竖排「中国航天」蓝 #1a5fb4，字高 1.6m，v 中心 8.6/6.7/4.8/2.9（正向） ---
  g.fillStyle = '#1a5fb4';
  g.font = `bold ${1.6 * (H / Hm)}px "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  ['中', '国', '航', '天'].forEach((ch, i) => g.fillText(ch, px(0), py(8.6 - i * 1.9)));

  // --- CASC 圆形标志（Ø1.4，中心 v=1.0；与「天」字(底 2.1)留 0.4m 间距） ---
  {
    const cx = px(0), cy = py(1.0), s = W / Wm, R = 0.7 * s;
    g.fillStyle = '#1a5fb4';
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 0.045 * s;
    g.beginPath(); g.arc(cx, cy, 0.62 * s, 0, Math.PI * 2); g.stroke();
    // 中央白色箭头（人字形火箭，朝上 = 位图负 y 方向）
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(cx, cy - 0.46 * s); g.lineTo(cx + 0.20 * s, cy + 0.05 * s); g.lineTo(cx + 0.07 * s, cy + 0.05 * s);
    g.lineTo(cx + 0.07 * s, cy + 0.42 * s); g.lineTo(cx - 0.07 * s, cy + 0.42 * s); g.lineTo(cx - 0.07 * s, cy + 0.05 * s);
    g.lineTo(cx - 0.20 * s, cy + 0.05 * s); g.closePath(); g.fill();
    g.lineWidth = 0.05 * s;
    g.beginPath(); g.ellipse(cx, cy + 0.05 * s, 0.48 * s, 0.20 * s, -0.5, Math.PI * 0.9, Math.PI * 2.05); g.stroke();
    g.beginPath(); g.ellipse(cx, cy - 0.02 * s, 0.40 * s, 0.16 * s, 0.6, Math.PI * 1.05, Math.PI * 2.1); g.stroke();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function makeCZ5Texture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1a5fb4';
  g.font = 'bold 150px "Arial", "Helvetica", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('CZ-5', 256, 138);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// 助推器贴花：两条红色虚线竖纹 + 中间横排「CZ-5」（实拍涂装），朝助推器外侧（局部 +X）
// patch：r=1.685，θlen=1.2（宽 ~2.0m），y∈[6, 20]（高 14m）。全部正向绘制。
function makeBoosterMarkTexture() {
  const W = 512, H = 2048, Wm = 2.0, Hm = 14;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const px = (u) => W / 2 + u * (W / Wm);
  const py = (v) => H - v * (H / Hm);
  // 红色虚线竖纹 ×2（u=±0.62，v 1~13 每 0.55 一格，每格高 0.34）
  g.fillStyle = '#c8242e';
  const dw = 0.18 * (W / Wm), dh = 0.34 * (H / Hm);
  for (const uu of [-0.62, 0.62]) {
    for (let v = 1.0; v < 13.0; v += 0.55) {
      g.fillRect(px(uu) - dw / 2, py(v + 0.34), dw, dh);
    }
  }
  // 横排 CZ-5（v=7，深色，正向）
  g.fillStyle = '#23262b';
  g.font = `bold ${0.52 * (H / Hm)}px "Arial", "Helvetica", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('CZ-5', px(0), py(7));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ================= 主构建 ================= */

export function buildRocket(ctx) {
  const { loader, texPath } = ctx;

  /* ---- 贴图加载（全部经 ctx.loader，__ready 才算数） ---- */
  const load = (file, srgb = true) => {
    const t = loader.load(texPath + file);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  const clone = (t, rx, ry) => { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return c; };

  const paintTex = load('paint_white.webp');
  const paintNrm = load('paint_white_normal.webp', false);
  const frostTex = load('paint_frost.webp');
  const interTex = load('interstage.webp');
  const nozTex = load('nozzle_metal.webp');
  const nozNrm = load('nozzle_metal_normal.webp', false);
  const solarTex = load('solar_panel.webp');
  const goldTex = load('gold_mli.webp');
  const badgeTex = load('badge_tianwen.webp');

  /* ---- 材质 ---- */
  const paintMat = (rx, ry) => new THREE.MeshStandardMaterial({
    map: clone(paintTex, rx, ry), normalMap: clone(paintNrm, rx, ry),
    roughness: 0.5, metalness: 0.12,
  });
  const frostMat = (h) => new THREE.MeshStandardMaterial({
    map: clone(frostTex, 1, h / 6), normalMap: clone(paintNrm, 1, h / 6),
    roughness: 0.62, metalness: 0.05,
  });
  const interMat = new THREE.MeshStandardMaterial({
    map: clone(interTex, 1, 1), roughness: 0.48, metalness: 0.65,
  });
  const nozzleMat = new THREE.MeshStandardMaterial({
    map: nozTex, normalMap: nozNrm, roughness: 0.42, metalness: 0.9,
  });
  const nozzleInnerMat = new THREE.MeshStandardMaterial({
    map: clone(nozTex, 1, 1), color: 0xa0492e, roughness: 0.55, metalness: 0.55,
    side: THREE.BackSide,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    map: clone(nozTex, 2, 2), color: 0xb9bec4, roughness: 0.38, metalness: 0.9,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    map: clone(nozTex, 2, 2), color: 0x4a4d52, roughness: 0.7, metalness: 0.6,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    map: clone(goldTex, 3, 3), roughness: 0.32, metalness: 0.85,
  });
  const solarMat = new THREE.MeshStandardMaterial({
    map: clone(solarTex, 6, 4), roughness: 0.35, metalness: 0.4,
  });
  const badgeMat = new THREE.MeshStandardMaterial({
    map: badgeTex, transparent: true, depthWrite: false, roughness: 0.5, metalness: 0.1,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  const markingMat = new THREE.MeshStandardMaterial({
    map: makeMarkingsTexture(), transparent: true, depthWrite: false, roughness: 0.5, metalness: 0.08,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  const cz5Mat = new THREE.MeshStandardMaterial({
    map: makeCZ5Texture(), transparent: true, depthWrite: false, roughness: 0.5, metalness: 0.08,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  const boosterMarkMat = new THREE.MeshStandardMaterial({
    map: makeBoosterMarkTexture(), transparent: true, depthWrite: false, roughness: 0.5, metalness: 0.08,
    polygonOffset: true, polygonOffsetFactor: -2,
  });

  /* ---- 小工具 ---- */
  // 贴花贴片：贴在 r 半径、y[y0,y1]、方位角中心 θc、宽 θlen 的筒段上
  // （筒面 UV 从外侧看本来就是正的，不要翻 u——曾经误加翻转导致国旗/文字镜像，已撤）
  function decalPatch(r, y0, y1, θc, θlen, mat) {
    const g = new THREE.CylinderGeometry(r, r, y1 - y0, 24, 1, true, θc - θlen / 2, θlen);
    g.translate(0, (y0 + y1) / 2, 0);
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = 2;
    return m;
  }
  // 发动机组（2 台）：返回 Group，内含 outer/inner/chamber 三网格
  function buildEnginePair(L, re, rt, dx, axis = 'x') {
    const g = new THREE.Group(); g.name = 'engines';
    const geo = nozzleGeometry(bellProfile(L, re, rt));
    const [x1, z1, x2, z2] = axis === 'x' ? [dx, 0, -dx, 0] : [0, dx, 0, -dx];
    const outer = mergeGeometries([geo.clone().translate(x1, 0, z1), geo.clone().translate(x2, 0, z2)]);
    const inner = mergeGeometries([geo.clone().translate(x1, 0, z1), geo.clone().translate(x2, 0, z2)]);
    const outerMesh = new THREE.Mesh(outer, nozzleMat); outerMesh.castShadow = true; outerMesh.name = 'nozzles';
    const innerMesh = new THREE.Mesh(inner, nozzleInnerMat); innerMesh.name = 'nozzlesInner';
    // 燃烧室短节 + 摇摆作动臂（合并）
    const parts = [];
    for (const [x, z] of [[x1, z1], [x2, z2]]) {
      parts.push(new THREE.CylinderGeometry(rt * 1.25, rt * 1.15, 0.7, 20).translate(x, 0.35, z));
      parts.push(new THREE.CylinderGeometry(0.09, 0.09, 0.9, 8).rotateZ(axis === 'x' ? 0.5 : 0).rotateX(axis === 'x' ? 0 : -0.5).translate(x * 0.6, 0.55, z * 0.6));
    }
    const chamberMesh = new THREE.Mesh(mergeGeometries(parts), steelMat);
    chamberMesh.castShadow = true; chamberMesh.name = 'chambers';
    g.add(outerMesh, innerMesh, chamberMesh);
    return g;
  }

  const group = new THREE.Group(); group.name = 'rocket';

  /* ================= 芯一级 stage1（y 0~31，Ø5.0） ================= */
  const stage1 = new THREE.Group(); stage1.name = 'stage1';
  {
    const R = 2.5;
    // 分段：下部设备/箱间段白漆、贮箱段霜层（贴图分段实现）
    const segs = [
      [0, 5, paintMat(1, 5 / 6)],
      [5, 15, frostMat(10)],
      [15, 19, paintMat(1, 4 / 6)],
      [19, 31, frostMat(12)],
    ];
    for (const [y0, y1, m] of segs) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(R, R, y1 - y0, 64, 1, true).translate(0, (y0 + y1) / 2, 0), m);
      mesh.castShadow = mesh.receiveShadow = true;
      stage1.add(mesh);
    }
    // 顶部封口环（与级间段衔接）
    stage1.add(new THREE.Mesh(new THREE.RingGeometry(0.8, R, 48).rotateX(-Math.PI / 2).translate(0, 31, 0), paintMat(1, 0.2)));
    // 细节合并：环向加强框、外走线管 ×3、助推器连接短柱 ×8
    const det = [];
    for (const y of [0.15, 5, 15, 19, 30.8]) det.push(new THREE.TorusGeometry(R + 0.015, 0.035, 8, 64).rotateX(Math.PI / 2).translate(0, y, 0));
    for (const az of [1.8, 3.6, 5.5]) {
      det.push(new THREE.CylinderGeometry(0.05, 0.05, 29, 10).translate(0, 15, 0));
      const last = det[det.length - 1];
      last.translate(Math.sin(az) * (R + 0.06), 0, Math.cos(az) * (R + 0.06));
    }
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      for (const y of [2.5, 22]) {
        const len = 0.5;
        const s = new THREE.CylinderGeometry(0.09, 0.11, len, 10);
        if (dx !== 0) s.rotateZ(Math.PI / 2 * Math.sign(dx)); else s.rotateX(-Math.PI / 2 * Math.sign(dz));
        s.translate(dx * (R + len / 2 - 0.15), y, dz * (R + len / 2 - 0.15));
        det.push(s);
      }
    }
    const detMesh = new THREE.Mesh(mergeGeometries(det), paintMat(2, 2));
    detMesh.castShadow = true; detMesh.name = 'stage1Details';
    stage1.add(detMesh);
    // 尾段：尾裙 + 底部防热板（y −0.5~0）
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 0.03, 0.5, 48, 1, true).translate(0, -0.25, 0), darkMat);
    const shield = new THREE.Mesh(new THREE.CircleGeometry(R, 48).rotateX(Math.PI / 2).translate(0, -0.42, 0), darkMat);
    skirt.castShadow = true;
    stage1.add(skirt, shield);
    // 发动机：2× YF-77（出口 Ø1.5、长 2.5、中心间距 2.2）
    stage1.add(buildEnginePair(2.5, 0.75, 0.3, 1.1, 'x'));
    // 贴花：国旗 + 中国航天 + CASC（布置于芯一级上部）
    stage1.add(decalPatch(R + 0.006, 19.5, 30.7, Math.PI / 4, 1.1, markingMat));
  }
  stage1.userData = {
    label: '芯一级', desc: '直径 5.0 m · 2× YF-77 · 大喷管宽间距',
    assembled: V3(0, 0, 0), exploded: V3(0, 0, 0),
  };

  /* ================= 级间段 interstage（y 31~33.5） ================= */
  const interstage = new THREE.Group(); interstage.name = 'interstage';
  interstage.position.set(0, 31, 0);
  {
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 2.5, 64, 1, true).translate(0, 1.25, 0), interMat);
    shell.castShadow = shell.receiveShadow = true;
    const rims = mergeGeometries([
      new THREE.TorusGeometry(2.5, 0.04, 8, 64).rotateX(Math.PI / 2).translate(0, 0.05, 0),
      new THREE.TorusGeometry(2.5, 0.04, 8, 64).rotateX(Math.PI / 2).translate(0, 2.45, 0),
      new THREE.RingGeometry(1.2, 2.5, 48).rotateX(-Math.PI / 2).translate(0, 2.5, 0),
    ]);
    const rimMesh = new THREE.Mesh(rims, steelMat);
    interstage.add(shell, rimMesh);
  }
  interstage.userData = {
    label: '级间段', desc: '直径 5.0 m · 铆接蒙皮 + 排焰窗',
    assembled: V3(0, 31, 0), exploded: V3(0, 35, 0),
  };

  /* ================= 芯二级 stage2（y 33.5~45） ================= */
  const stage2 = new THREE.Group(); stage2.name = 'stage2';
  stage2.position.set(0, 33.5, 0);
  {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 11.5, 64, 1, true).translate(0, 5.75, 0), paintMat(1, 11.5 / 6));
    body.castShadow = body.receiveShadow = true;
    const topRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 2.5, 48).rotateX(-Math.PI / 2).translate(0, 11.5, 0), paintMat(1, 0.2));
    stage2.add(body, topRing, decalPatch(2.506, 6.2, 7.2, Math.PI / 4, 0.42, cz5Mat));
    // 2× YF-75D 细长喷管（出口 Ø1.0、长 3.2，向下伸入级间段）
    stage2.add(buildEnginePair(3.2, 0.5, 0.16, 0.8, 'x'));
  }
  stage2.userData = {
    label: '芯二级', desc: '直径 5.0 m · 2× YF-75D（细长喷管）',
    assembled: V3(0, 33.5, 0), exploded: V3(0, 42.5, 0),
  };

  /* ================= 载荷 payload：天问一号（y 45~49.5） ================= */
  const payload = new THREE.Group(); payload.name = 'payload';
  payload.position.set(0, 45, 0);
  {
    // 卫星支架锥（0~0.8）
    const adapter = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.5, 0.8, 48, 1, true).translate(0, 0.4, 0), interMat);
    adapter.castShadow = true;
    // 环绕器本体 ~2×2×1.5 金箔箱体（0.8~2.3）
    const orbiter = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.5, 2.0).translate(0, 1.55, 0), goldMat);
    orbiter.castShadow = true;
    // 细节合并：顶部设备板、贮箱球、推力器、框架边条
    const detParts = [
      new THREE.BoxGeometry(1.7, 0.1, 1.7).translate(0, 2.35, 0),
      new THREE.SphereGeometry(0.32, 16, 12).translate(0.6, 1.1, 0.6),
      new THREE.SphereGeometry(0.32, 16, 12).translate(-0.6, 1.1, -0.6),
      new THREE.CylinderGeometry(0.06, 0.1, 0.25, 10).rotateX(Math.PI / 2).translate(0.7, 1.5, 1.05),
      new THREE.CylinderGeometry(0.06, 0.1, 0.25, 10).rotateX(Math.PI / 2).translate(-0.7, 1.5, 1.05),
      new THREE.BoxGeometry(2.06, 0.08, 0.08).translate(0, 0.85, 0.98),
      new THREE.BoxGeometry(2.06, 0.08, 0.08).translate(0, 2.25, 0.98),
      new THREE.BoxGeometry(2.06, 0.08, 0.08).translate(0, 0.85, -0.98),
      new THREE.BoxGeometry(2.06, 0.08, 0.08).translate(0, 2.25, -0.98),
    ];
    const orbDet = new THREE.Mesh(mergeGeometries(detParts), steelMat);
    // 太阳翼：沿 X 翼展 ~8m（每侧根段+外段，深蓝电池片）。
    // 8m 翼展放不进 Ø5.2 整流罩（真实天问一号也是收拢发射）：
    // 两翼挂在 wingL/wingR 铰链组上，合拢态向上折起 65°（V 形收于罩内），爆炸/分离态展开。
    const FOLD = 1.134; // 65°
    const mkWing = (s) => {
      const wg = new THREE.Group();
      wg.name = s > 0 ? 'wingR' : 'wingL';
      const parts = [
        new THREE.BoxGeometry(1.4, 0.04, 2.2).translate(s * 0.72, 0, 0),
        new THREE.BoxGeometry(1.6, 0.04, 2.2).translate(s * 2.22, 0, 0),
        new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8).rotateZ(Math.PI / 2).translate(s * 0.2, 0, 0),
      ];
      const m = new THREE.Mesh(mergeGeometries(parts), solarMat);
      m.castShadow = true;
      wg.add(m);
      wg.position.set(s * 1.05, 1.55, 0);
      wg.rotation.z = s > 0 ? FOLD : -FOLD; // 交付默认 = 合拢态（折起）
      wg.userData = { folded: wg.rotation.z, deployed: 0 };
      return wg;
    };
    const wingR = mkWing(1), wingL = mkWing(-1);
    payload.add(wingR, wingL);
    // 高增益天线：Ø1.2 白碟，朝 +Z 偏上 35°（lathe 轴向 +Y，rotation.x=π/2−0.6 后指向 +Z 偏上）
    const hgaG = new THREE.Group();
    const dishPts = [];
    for (let i = 0; i <= 10; i++) { const r = (i / 10) * 0.6; dishPts.push(new THREE.Vector2(r, 0.3 * Math.pow(r / 0.6, 2))); }
    const dish = new THREE.Mesh(new THREE.LatheGeometry(dishPts, 32), paintMat(0.3, 0.3));
    dish.material.side = THREE.DoubleSide;
    const feed = mergeGeometries([
      new THREE.CylinderGeometry(0.02, 0.02, 0.42, 6).translate(0, 0.32, 0),       // 馈源支杆（沿碟轴）
      new THREE.ConeGeometry(0.05, 0.12, 10).translate(0, 0.56, 0),                // 馈源喇叭
      new THREE.CylinderGeometry(0.045, 0.06, 0.65, 8).translate(0, -0.32, 0),     // 安装臂（碟后接本体）
    ]);
    const feedMesh = new THREE.Mesh(feed, steelMat);
    hgaG.add(dish, feedMesh);
    hgaG.position.set(0.3, 1.7, 1.15);
    hgaG.rotation.x = Math.PI / 2 - 0.6; // 碟面朝 +Z 偏上 ~35°
    // 钟形背罩（着陆巡视器，Ø2.4 倒扣在环绕器上方 2.3~3.5）
    const bellPts = [
      [1.2, 2.3], [1.19, 2.55], [1.12, 2.85], [0.98, 3.12], [0.78, 3.32], [0.52, 3.44], [0.22, 3.5], [0.0, 3.5],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const backshell = new THREE.Mesh(new THREE.LatheGeometry(bellPts, 48), paintMat(1, 0.3));
    backshell.material.side = THREE.DoubleSide;
    backshell.castShadow = true;
    payload.add(adapter, orbiter, orbDet, hgaG, backshell);
  }
  payload.userData = {
    label: '载荷 · 天问一号', desc: '环绕器 · 太阳翼 · 高增益天线 · 背罩',
    assembled: V3(0, 45, 0), exploded: V3(0, 59, 0),
    // 太阳翼随整流罩状态：罩内折起（folded）、罩开后展开（deployed），子组名 wingL/wingR
    wings: { folded: 1.134, deployed: 0 },
  };

  /* ================= 整流罩双瓣 fairingL/R（y 45~57.3，Ø5.2） ================= */
  const fairingPts = fairingProfile();
  const fairingMatL = paintMat(0.5, 12.3 / 6); fairingMatL.side = THREE.DoubleSide;
  const fairingMatR = paintMat(0.5, 12.3 / 6); fairingMatR.side = THREE.DoubleSide;
  // 分离缝边条 + 铆钉 + 分离螺母（沿两个切边，合并为一个几何）
  function fairingSeam(xOff) {
    const parts = [];
    const prof = fairingProfile();
    for (const zSign of [1, -1]) {
      // 边条带（x=xOff 平面内，沿剖面曲线，宽 0.18 向内）
      const pos = [], idx = [];
      const n = prof.length;
      for (let i = 0; i < n; i++) {
        const r = prof[i].x, y = prof[i].y;
        const wdt = 0.18 * Math.min(1, r / 0.5);
        pos.push(xOff, y, zSign * r, xOff, y, zSign * Math.max(0, r - wdt));
      }
      for (let i = 0; i < n - 1; i++) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); // 材质 DoubleSide，绕向无关
      }
      const ribbon = new THREE.BufferGeometry();
      ribbon.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      ribbon.setIndex(idx);
      const uvArr = new Float32Array((pos.length / 3) * 2);
      ribbon.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
      ribbon.computeVertexNormals();
      parts.push(ribbon);
      // 铆钉线 + 分离螺母
      for (let y = 0.25; y < 6.4; y += 0.4) {
        parts.push(new THREE.SphereGeometry(0.02, 6, 5).translate(xOff, y, zSign * 2.6));
      }
      for (let y = 0.8; y < 6.4; y += 1.5) {
        parts.push(new THREE.CylinderGeometry(0.045, 0.045, 0.07, 10).rotateX(Math.PI / 2).translate(xOff, y, zSign * 2.63));
      }
      for (let y = 6.8; y < 11.5; y += 0.8) {
        // 锥段铆钉沿剖面收半径
        const t = (y - 6.5) / 5.8;
        const r = 2.6 * Math.pow(1 - Math.pow(t, 2.6), 0.72);
        parts.push(new THREE.SphereGeometry(0.02, 6, 5).translate(xOff, y, zSign * Math.max(0.05, r)));
      }
    }
    return mergeGeometries(parts);
  }
  const mkFairing = (half) => {
    const g = new THREE.Group();
    const isL = half === 'L';
    g.name = isL ? 'fairingL' : 'fairingR';
    const shell = new THREE.Mesh(
      new THREE.LatheGeometry(fairingPts, 64, isL ? Math.PI : 0, Math.PI),
      isL ? fairingMatL : fairingMatR
    );
    shell.castShadow = shell.receiveShadow = true;
    const seam = new THREE.Mesh(fairingSeam(isL ? -0.012 : 0.012), isL ? fairingMatL : fairingMatR);
    g.add(shell, seam);
    if (!isL) {
      // 任务徽章：Ø1.5，朝 +Z 偏 +X 40°（+Z 正中是分离缝，徽章放右瓣前侧面）
      const badge = decalPatch(2.606, 0.75, 2.25, 0.7, 0.575, badgeMat);
      g.add(badge);
    }
    g.position.set(0, 45, 0);
    return g;
  };
  const fairingL = mkFairing('L');
  fairingL.userData = {
    label: '整流罩 · 左瓣', desc: '直径 5.2 m · 双瓣分离 · 钝头锥',
    assembled: V3(0, 45, 0), exploded: V3(-8, 59, 0),
  };
  const fairingR = mkFairing('R');
  fairingR.userData = {
    label: '整流罩 · 右瓣', desc: '直径 5.2 m · 双瓣分离 · 任务徽章',
    assembled: V3(0, 45, 0), exploded: V3(8, 59, 0),
  };

  /* ================= 助推器 ×4（Ø3.35，斜切头锥，2× YF-100） ================= */
  function buildBooster() {
    const g = new THREE.Group();
    // 筒身 + 斜切头锥一体环带：外壁直上 27.8，内壁自 ~20 起斜收（外高内低）
    const rings = [
      { y: 0, r: 1.72 }, { y: 0.5, r: 1.69 }, { y: 1.0, r: 1.675 }, { y: 20, r: 1.675 },
    ];
    const N = 16;
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      const y = 20 + 7.8 * t;
      const r = Math.max(0.02, 1.675 * Math.pow(1 - Math.pow(t, 2.4), 0.62));
      const ramp = THREE.MathUtils.smoothstep(Math.min(1, t / 0.25), 0, 1);
      // 同心收分锥 + 斜切（外高内低）：顶点留在助推器轴线上，不外撇
      rings.push({ y, r, o: 0, s: 0.95 * ramp });
    }
    const body = new THREE.Mesh(ringGeometry(rings, 56, (i, y) => y / 6), paintMat(1, 1));
    body.castShadow = body.receiveShadow = true;
    body.name = 'boosterBody';
    g.add(body);
    // 涂装：外侧红色虚线竖纹 ×2 + CZ-5（朝局部 +X = 径向外侧）
    g.add(decalPatch(1.688, 6, 20, Math.PI / 2, 1.2, boosterMarkMat));
    // 发动机：2× YF-100（出口 Ø1.35、长 2.2，沿切向 z 并排）
    const eng = buildEnginePair(2.2, 0.675, 0.27, 0.75, 'z');
    g.add(eng);
    // 底部防热板
    const shield = new THREE.Mesh(new THREE.CircleGeometry(1.68, 40).rotateX(Math.PI / 2).translate(0, 0.02, 0), darkMat);
    g.add(shield);
    return g;
  }
  const boosters = [];
  const bPos = [[4.2, 0, 0, 0], [0, 0, 4.2, -Math.PI / 2], [-4.2, 0, 0, Math.PI], [0, 0, -4.2, Math.PI / 2]];
  const bNames = ['booster0', 'booster1', 'booster2', 'booster3'];
  const bDirs = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]];
  for (let i = 0; i < 4; i++) {
    const b = i === 0 ? buildBooster() : boosters[0].clone();
    b.name = bNames[i];
    b.position.set(bPos[i][0], bPos[i][1], bPos[i][2]);
    b.rotation.y = bPos[i][3];
    b.userData = {
      label: `助推器 · ${['东', '北', '西', '南'][i]}`, desc: '直径 3.35 m · 2× YF-100 · 斜切头锥',
      assembled: V3(bPos[i][0], 0, bPos[i][2]),
      exploded: V3(bPos[i][0] + bDirs[i][0] * 6, 0, bPos[i][2] + bDirs[i][2] * 6),
    };
    boosters.push(b);
  }

  group.add(stage1, interstage, stage2, payload, fairingL, fairingR, ...boosters);
  return group;
}
