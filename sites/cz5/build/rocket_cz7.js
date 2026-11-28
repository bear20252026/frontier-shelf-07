// build/rocket_cz7.js — 长征七号对比展示箭（静态外观模型，真实尺度）
// 接口：export function buildCZ7(ctx) → THREE.Group（name='cz7'）
// ctx = { THREE, rand, loader, texPath（火箭贴图）, padTexPath（场坪贴图）, badgeTex?（CMS 徽章，可空） }
// 局部原点 = 芯一级底面圆心；展示基座在局部 y∈[-8,0]（台面与胖五的 MLP 台面同高 8 m，
// 两箭箭体底位于同一基准面，高度差一眼可比）。
// 真实尺度对照（m）：          长七      胖五
//   全高                      53.1     57.3（模型）
//   芯级直径                  3.35     5.0
//   助推器直径 ×数量          2.25×4   3.35×4
//   整流罩直径                4.2      5.2   （长七罩径 > 芯级 = 标志性锤头形）
//   助推动力                  1×YF-100 2×YF-100（长七助推器单发）
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const CZ7_SPEC = { HEIGHT: 53.1, CORE_D: 3.35, FAIRING_D: 4.2, BOOSTER_D: 2.25 };

/* ================= 自定义几何（与 rocket.js 同款约定） ================= */

// 环带几何：rings [{y, r, o=向外偏移, s=斜切系数}]（内部按 y 升序）
function ringGeometry(ringsIn, radialSegs = 48, uvY = null) {
  const rings = [...ringsIn].sort((p, q) => p.y - q.y);
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
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 带冷却管微凸竖纹的喷管
function nozzleGeometry(profile, { radial = 40, ribs = 36, ribAmp = 0.007 } = {}) {
  const rings = profile.map(([r, y]) => ({ y, r }));
  const g = ringGeometry(rings, radial, (i) => i / (rings.length - 1));
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
function bellProfile(L, re, rt, steps = 18) {
  const pts = [[rt * 1.25, 0], [rt, -0.1]];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    pts.push([rt + (re - rt) * (1 - Math.pow(1 - t, 1.8)), -0.1 - (L - 0.1) * t]);
  }
  return pts;
}

/* ================= 贴花（CanvasTexture，全部正向绘制；约定同 rocket.js） ================= */

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

// 芯一级贴花：国旗 + 竖排「中国载人航天」（长七是天舟货运飞船专车，刷载人航天标识）
// patch：r=1.681，θlen=1.1（宽 1.85m），y∈[13.5, 23.8]（高 10.3m）
function makeMarkingsTexture() {
  const W = 512, H = 2048, Wm = 1.85, Hm = 10.3;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const px = (u) => W / 2 + u * (W / Wm);
  const py = (v) => H - v * (H / Hm);

  // --- 国旗（0.9×0.6，v∈[9.4,10.0]） ---
  {
    const fw = 0.9 * (W / Wm), fh = 0.6 * (H / Hm);
    const x0 = px(-0.45), y0 = py(10.0);
    g.fillStyle = '#de2910'; g.fillRect(x0, y0, fw, fh);
    g.fillStyle = '#ffde00';
    const u = fh / 20;
    const gx = (i) => x0 + i * u, gy = (j) => y0 + (20 - j) * u;
    drawStar(g, gx(5), gy(15), 3 * u);
    const small = [[10, 18], [12, 16], [12, 13], [10, 11]];
    for (const [sx, sy] of small) {
      const ang = Math.atan2(gy(15) - gy(sy), gx(5) - gx(sx));
      drawStar(g, gx(sx), gy(sy), 1 * u, ang + Math.PI / 2);
    }
  }

  // --- 竖排「中国载人航天」蓝 #1a5fb4，字高 1.05m ---
  g.fillStyle = '#1a5fb4';
  g.font = `bold ${1.05 * (H / Hm)}px "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  ['中', '国', '载', '人', '航', '天'].forEach((ch, i) => g.fillText(ch, px(0), py(7.9 - i * 1.35)));

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function makeCZ7Texture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1a5fb4';
  g.font = 'bold 150px "Arial", "Helvetica", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('CZ-7', 256, 138);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// 助推器贴花：两条红色虚线竖纹 + 中间横排「CZ-7」，朝助推器外侧（局部 +X）
// patch：r=1.131，θlen=1.2（宽 ~1.36m），y∈[4, 15]（高 11m）
function makeBoosterMarkTexture() {
  const W = 512, H = 2048, Wm = 1.36, Hm = 11;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const px = (u) => W / 2 + u * (W / Wm);
  const py = (v) => H - v * (H / Hm);
  g.fillStyle = '#c8242e';
  const dw = 0.13 * (W / Wm), dh = 0.27 * (H / Hm);
  for (const uu of [-0.42, 0.42]) {
    for (let v = 0.8; v < 10.2; v += 0.45) {
      g.fillRect(px(uu) - dw / 2, py(v + 0.27), dw, dh);
    }
  }
  g.fillStyle = '#23262b';
  g.font = `bold ${0.38 * (H / Hm)}px "Arial", "Helvetica", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('CZ-7', px(0), py(5.5));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// CMS 徽章兜底（生图贴花缺失时的程序化版本：蓝底圆徽 + 白箭 + 轨道弧 + CMS）
function makeCMSBadgeCanvas() {
  const S = 512;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const cx = S / 2, cy = S / 2;
  g.fillStyle = '#17468f';
  g.beginPath(); g.arc(cx, cy, S * 0.46, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#d8b84e'; g.lineWidth = S * 0.016;
  g.beginPath(); g.arc(cx, cy, S * 0.435, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#ffffff'; g.lineWidth = S * 0.012;
  g.beginPath(); g.ellipse(cx, cy, S * 0.36, S * 0.15, -0.5, Math.PI * 0.85, Math.PI * 2.1); g.stroke();
  g.beginPath(); g.ellipse(cx, cy, S * 0.30, S * 0.12, 0.55, Math.PI * 1.05, Math.PI * 2.15); g.stroke();
  // 中央白箭（人字形，朝上 = 位图负 y）
  g.fillStyle = '#ffffff';
  const s = S * 0.62;
  g.beginPath();
  g.moveTo(cx, cy - 0.30 * s); g.lineTo(cx + 0.13 * s, cy + 0.03 * s); g.lineTo(cx + 0.045 * s, cy + 0.03 * s);
  g.lineTo(cx + 0.045 * s, cy + 0.27 * s); g.lineTo(cx - 0.045 * s, cy + 0.27 * s); g.lineTo(cx - 0.045 * s, cy + 0.03 * s);
  g.lineTo(cx - 0.13 * s, cy + 0.03 * s); g.closePath(); g.fill();
  g.fillStyle = '#ffde00';
  for (const [sx, sy] of [[-0.22, -0.24], [0.24, -0.18], [0.05, -0.33]]) {
    g.beginPath(); g.arc(cx + sx * S, cy + sy * S, S * 0.014, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#ffffff';
  g.font = `bold ${S * 0.11}px "Arial", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('CMS', cx, cy + S * 0.30);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ================= 主构建 ================= */

export function buildCZ7(ctx) {
  const { loader, texPath } = ctx;

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

  /* ---- 材质（与胖五同贴图族，观感同源） ---- */
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
  const markingMat = new THREE.MeshStandardMaterial({
    map: makeMarkingsTexture(), transparent: true, depthWrite: false, roughness: 0.5, metalness: 0.08,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  const cz7Mat = new THREE.MeshStandardMaterial({
    map: makeCZ7Texture(), transparent: true, depthWrite: false, roughness: 0.5, metalness: 0.08,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  const boosterMarkMat = new THREE.MeshStandardMaterial({
    map: makeBoosterMarkTexture(), transparent: true, depthWrite: false, roughness: 0.5, metalness: 0.08,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  const badgeMat = new THREE.MeshStandardMaterial({
    map: ctx.badgeTex || makeCMSBadgeCanvas(), transparent: true, depthWrite: false,
    roughness: 0.5, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2,
  });

  /* ---- 小工具 ---- */
  function decalPatch(r, y0, y1, θc, θlen, mat) {
    const g = new THREE.CylinderGeometry(r, r, y1 - y0, 24, 1, true, θc - θlen / 2, θlen);
    g.translate(0, (y0 + y1) / 2, 0);
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = 2;
    return m;
  }
  // 发动机组：positions [[x,z]...]，单喷管/双喷管/四喷管通用
  function buildEngines(L, re, rt, positions) {
    const g = new THREE.Group(); g.name = 'engines';
    const geo = nozzleGeometry(bellProfile(L, re, rt));
    const outers = [], inners = [], chambers = [];
    for (const [x, z] of positions) {
      outers.push(geo.clone().translate(x, 0, z));
      inners.push(geo.clone().translate(x, 0, z));
      chambers.push(new THREE.CylinderGeometry(rt * 1.25, rt * 1.15, 0.6, 16).translate(x, 0.3, z));
    }
    const outerMesh = new THREE.Mesh(mergeGeometries(outers), nozzleMat);
    outerMesh.castShadow = true; outerMesh.name = 'nozzles';
    const innerMesh = new THREE.Mesh(mergeGeometries(inners), nozzleInnerMat);
    innerMesh.name = 'nozzlesInner';
    const chamberMesh = new THREE.Mesh(mergeGeometries(chambers), steelMat);
    chamberMesh.castShadow = true; chamberMesh.name = 'chambers';
    g.add(outerMesh, innerMesh, chamberMesh);
    return g;
  }

  const group = new THREE.Group(); group.name = 'cz7';
  const R = 1.675; // 芯级半径（Ø3.35）

  /* ================= 芯一级 stage1（y 0~24.5，Ø3.35） ================= */
  const stage1 = new THREE.Group(); stage1.name = 'cz7Stage1';
  {
    const segs = [
      [0, 4, paintMat(1, 4 / 6)],
      [4, 14, frostMat(10)],
      [14, 17, paintMat(1, 3 / 6)],
      [17, 24.5, frostMat(7.5)],
    ];
    for (const [y0, y1, m] of segs) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(R, R, y1 - y0, 48, 1, true).translate(0, (y0 + y1) / 2, 0), m);
      mesh.castShadow = mesh.receiveShadow = true;
      stage1.add(mesh);
    }
    // 顶部封口环
    stage1.add(new THREE.Mesh(new THREE.RingGeometry(0.55, R, 40).rotateX(-Math.PI / 2).translate(0, 24.5, 0), paintMat(1, 0.2)));
    // 细节：环向加强框、外走线管 ×2、助推器连接短柱 ×8
    const det = [];
    for (const y of [0.15, 4, 14, 17, 24.3]) det.push(new THREE.TorusGeometry(R + 0.012, 0.028, 8, 48).rotateX(Math.PI / 2).translate(0, y, 0));
    for (const az of [2.4, 4.0]) {
      det.push(new THREE.CylinderGeometry(0.04, 0.04, 22, 8).translate(0, 12, 0));
      const last = det[det.length - 1];
      last.translate(Math.sin(az) * (R + 0.05), 0, Math.cos(az) * (R + 0.05));
    }
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      for (const y of [2.2, 18.5]) {
        const len = 0.4;
        const s = new THREE.CylinderGeometry(0.07, 0.09, len, 8);
        if (dx !== 0) s.rotateZ(Math.PI / 2 * Math.sign(dx)); else s.rotateX(-Math.PI / 2 * Math.sign(dz));
        s.translate(dx * (R + len / 2 - 0.12), y, dz * (R + len / 2 - 0.12));
        det.push(s);
      }
    }
    const detMesh = new THREE.Mesh(mergeGeometries(det), paintMat(2, 2));
    detMesh.castShadow = true; detMesh.name = 'cz7Stage1Details';
    stage1.add(detMesh);
    // 尾段：尾裙 + 底部防热板
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 0.025, 0.45, 40, 1, true).translate(0, -0.22, 0), darkMat);
    const shield = new THREE.Mesh(new THREE.CircleGeometry(R, 40).rotateX(Math.PI / 2).translate(0, -0.36, 0), darkMat);
    skirt.castShadow = true;
    stage1.add(skirt, shield);
    // 发动机：2× YF-100（出口 Ø1.35、长 2.2，横向并排）
    stage1.add(buildEngines(2.2, 0.675, 0.27, [[0.62, 0], [-0.62, 0]]));
    // 贴花：国旗 + 中国载人航天（芯一级上部，θc=45° 与胖五同约定）
    stage1.add(decalPatch(R + 0.006, 13.5, 23.8, Math.PI / 4, 1.1, markingMat));
  }

  /* ================= 级间段 interstage（y 24.5~26.3） ================= */
  const interstage = new THREE.Group(); interstage.name = 'cz7Interstage';
  interstage.position.set(0, 24.5, 0);
  {
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1.8, 48, 1, true).translate(0, 0.9, 0), interMat);
    shell.castShadow = shell.receiveShadow = true;
    const rims = mergeGeometries([
      new THREE.TorusGeometry(R, 0.03, 8, 48).rotateX(Math.PI / 2).translate(0, 0.04, 0),
      new THREE.TorusGeometry(R, 0.03, 8, 48).rotateX(Math.PI / 2).translate(0, 1.76, 0),
      new THREE.RingGeometry(0.8, R, 40).rotateX(-Math.PI / 2).translate(0, 1.8, 0),
    ]);
    interstage.add(shell, new THREE.Mesh(rims, steelMat));
  }

  /* ================= 芯二级 stage2（y 26.3~38.3，4× YF-115） ================= */
  const stage2 = new THREE.Group(); stage2.name = 'cz7Stage2';
  stage2.position.set(0, 26.3, 0);
  {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 12, 48, 1, true).translate(0, 6, 0), paintMat(1, 2));
    body.castShadow = body.receiveShadow = true;
    const topRing = new THREE.Mesh(new THREE.RingGeometry(0.6, R, 40).rotateX(-Math.PI / 2).translate(0, 12, 0), paintMat(1, 0.2));
    stage2.add(body, topRing, decalPatch(R + 0.006, 4.2, 5.4, Math.PI / 4, 0.5, cz7Mat));
    // 4× YF-115 小喷管（出口 Ø0.6、长 1.7，田字布局，伸入级间段）
    stage2.add(buildEngines(1.7, 0.3, 0.12, [[0.52, 0.52], [-0.52, 0.52], [0.52, -0.52], [-0.52, -0.52]]));
  }

  /* ================= 整流罩 fairing（y 38.3~53.1，Ø4.2 锤头罩） ================= */
  const fairing = new THREE.Group(); fairing.name = 'cz7Fairing';
  fairing.position.set(0, 38.3, 0);
  {
    // 剖面（局部 y）：过渡锥 0~1.7（Ø3.35→Ø4.2）+ 圆柱 1.7~9.0 + 钝头锥 9.0~14.8
    const pts = [new THREE.Vector2(1.685, 0), new THREE.Vector2(1.75, 0.35)];
    const N_FLARE = 5;
    for (let i = 1; i <= N_FLARE; i++) {
      const t = i / N_FLARE;
      pts.push(new THREE.Vector2(1.675 + (2.1 - 1.675) * (t * t * (3 - 2 * t)), 0.35 + 1.35 * t));
    }
    pts.push(new THREE.Vector2(2.1, 9.0));
    const FR = 2.1, y0 = 9.0, y1 = 14.8;
    for (let i = 1; i <= 14; i++) {
      const t = i / 14;
      const r = FR * Math.pow(1 - Math.pow(t, 2.6), 0.72);
      pts.push(new THREE.Vector2(Math.max(r, 0.001), y0 + (y1 - y0) * t));
    }
    const fmat = paintMat(0.5, 14.8 / 6); fmat.side = THREE.DoubleSide;
    const shell = new THREE.Mesh(new THREE.LatheGeometry(pts, 56), fmat);
    shell.castShadow = shell.receiveShadow = true;
    fairing.add(shell);
    // 分离缝细条 ×2（±X 侧，仅圆柱段）
    const seamMat = paintMat(0.2, 0.5);
    for (const sx of [1, -1]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.05, 7.3, 0.1), seamMat);
      seam.position.set(sx * 2.1, 5.35, 0);
      fairing.add(seam);
    }
    // CMS 任务徽章：Ø2.0，朝 θc=45°（与芯级涂装同面）
    fairing.add(decalPatch(2.106, 2.9, 4.9, Math.PI / 4, 2.0 / 2.106, badgeMat));
  }

  /* ================= 助推器 ×4（Ø2.25，斜切头锥，单发 YF-100） ================= */
  function buildBooster() {
    const g = new THREE.Group();
    // 筒身 + 斜切头锥一体环带：外壁直上 26.4，内壁自 ~16 起斜收
    const rings = [
      { y: 0, r: 1.16 }, { y: 0.4, r: 1.13 }, { y: 0.8, r: 1.125 }, { y: 16, r: 1.125 },
    ];
    const N = 14;
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      const y = 16 + 10.4 * t;
      const r = Math.max(0.02, 1.125 * Math.pow(1 - Math.pow(t, 2.4), 0.62));
      const ramp = THREE.MathUtils.smoothstep(Math.min(1, t / 0.25), 0, 1);
      rings.push({ y, r, o: 0, s: 0.95 * ramp });
    }
    const body = new THREE.Mesh(ringGeometry(rings, 44, (i, y) => y / 6), paintMat(1, 1));
    body.castShadow = body.receiveShadow = true;
    body.name = 'cz7BoosterBody';
    g.add(body);
    g.add(decalPatch(1.137, 4, 15, Math.PI / 2, 1.2, boosterMarkMat));
    // 发动机：1× YF-100（长七助推器单发，居中）
    g.add(buildEngines(2.0, 0.6, 0.24, [[0, 0]]));
    const shield = new THREE.Mesh(new THREE.CircleGeometry(1.12, 32).rotateX(Math.PI / 2).translate(0, 0.02, 0), darkMat);
    g.add(shield);
    return g;
  }
  const boosters = [];
  const bPos = [[2.8, 0, 0], [0, 2.8, -Math.PI / 2], [-2.8, 0, Math.PI], [0, -2.8, Math.PI / 2]];
  for (let i = 0; i < 4; i++) {
    const b = i === 0 ? buildBooster() : boosters[0].clone();
    b.name = 'cz7Booster' + i;
    b.position.set(bPos[i][0], 0, bPos[i][1]);
    b.rotation.y = bPos[i][2];
    boosters.push(b);
  }

  group.add(stage1, interstage, stage2, fairing, ...boosters);

  /* ================= 展示基座（局部 y −8~0：台面与胖五 MLP 同高，保证同基准对比） ================= */
  const mount = new THREE.Group(); mount.name = 'cz7Mount';
  {
    const padLoader = (file, srgb = true, rx = 1, ry = 1) => {
      const t = loader.load((ctx.padTexPath || texPath) + file);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
      t.anisotropy = 8;
      return t;
    };
    const mountSteel = new THREE.MeshStandardMaterial({
      map: padLoader('steel_rust.webp', true, 1.5, 1.5), roughness: 0.68, metalness: 0.55,
    });
    const concreteMat = new THREE.MeshStandardMaterial({
      map: padLoader('concrete_pad.webp', true, 2.2, 2.2), color: 0xb8bcbe, roughness: 0.9, metalness: 0.04,
    });
    // 4 角柱 + 两层 X 撑
    const geos = [];
    const legs = [[-4.6, -4.6], [4.6, -4.6], [4.6, 4.6], [-4.6, 4.6]];
    for (const [x, z] of legs) {
      const leg = new THREE.BoxGeometry(0.55, 7.6, 0.55);
      leg.translate(x, -8 + 3.8, z);
      geos.push(leg);
    }
    for (let c = 0; c < 4; c++) {
      const [x1, z1] = legs[c], [x2, z2] = legs[(c + 1) % 4];
      for (const [ya, yb] of [[-7.6, -4.2], [-4.2, -0.8]]) {
        const mk = (ax, az, bx, bz, y0, y1) => {
          const len = Math.hypot(bx - ax, y1 - y0, bz - az);
          const gseg = new THREE.BoxGeometry(0.22, len, 0.22);
          const A = new THREE.Vector3(ax, y0, az), B = new THREE.Vector3(bx, y1, bz);
          gseg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
          const mid = A.clone().add(B).multiplyScalar(0.5);
          gseg.translate(mid.x, mid.y, mid.z);
          return gseg;
        };
        geos.push(mk(x1, z1, x2, z2, ya, yb));
        geos.push(mk(x2, z2, x1, z1, ya, yb));
      }
    }
    // 台面方框（11×11，中央开 Ø8 孔容纳尾段与喷管）
    const shape = new THREE.Shape([
      new THREE.Vector2(-5.5, -5.5), new THREE.Vector2(5.5, -5.5),
      new THREE.Vector2(5.5, 5.5), new THREE.Vector2(-5.5, 5.5),
    ]);
    const hole = new THREE.Path();
    hole.absarc(0, 0, 4.0, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const deckGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false });
    deckGeo.rotateX(-Math.PI / 2); // shape Y → world -Z，extrude 深度转为向下
    deckGeo.translate(0, 0, 0);
    geos.push(deckGeo);
    // 台面孔缘支承短柱 ×4（箭体 visual 落点）
    for (const az of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) {
      const post = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      post.translate(Math.sin(az) * 3.6, -0.25, Math.cos(az) * 3.6);
      geos.push(post);
    }
    const mountMesh = new THREE.Mesh(mergeGeometries(geos.map((gg) => (gg.index ? gg.toNonIndexed() : gg))), mountSteel);
    mountMesh.castShadow = mountMesh.receiveShadow = true;
    mountMesh.name = 'cz7MountSteel';
    mount.add(mountMesh);
    // 圆形混凝土基坛（Ø17，厚 0.18，露出地面）
    const padDisc = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 0.18, 48), concreteMat);
    padDisc.position.y = -8 + 0.09;
    padDisc.receiveShadow = true;
    padDisc.name = 'cz7MountPad';
    mount.add(padDisc);
  }
  group.add(mount);

  return group;
}
