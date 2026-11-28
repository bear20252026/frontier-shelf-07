// build/pad.js — B 组：发射场（文昌原型 · 夜景 · 写实 PBR）
// 局部原点 = 世界原点（坪中心、y=0 坪面），直接按世界坐标建模。
// 命名合同：mlp / umbilicalTower(arm1, arm2) / serviceTower / lightningTowers /
//           waterTower / searchlightFixtures / ground / coast
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ================= 基础工具 ================= */

function loadTex(ctx, file, { srgb = true, uv = null, aniso = 8 } = {}) {
  const t = ctx.loader.load(ctx.texPath + file);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; // 颜色图 SRGB；数据图保持默认线性
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (uv) t.repeat.set(uv[0], uv[1]);
  t.anisotropy = aniso;
  return t;
}

function scaleUV(geo, sx, sy) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  return geo;
}

// 两点之间的箱形梁（桁架基本单元），UV 按 uvPeriod 米/周期缩放
function beam(a, b, w, d, uvPeriod = 3) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.BoxGeometry(w, len, d);
  scaleUV(g, Math.max(w, d) / uvPeriod, len / uvPeriod);
  const dir = B.clone().sub(A).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  const mid = A.clone().add(B).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

// 通用桁架塔：4 角柱 + 层间横杆 + 立面斜撑（交错），可带锥度
function trussTower({ cx = 0, cz = 0, w, d, y0, y1, levels, leg = 0.3, brace = 0.15, taper = 1, uvPeriod = 3 }) {
  const geos = [];
  const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  const at = (i, sx, sz) => {
    const t = i / levels, k = 1 - (1 - taper) * t;
    return [cx + sx * (w / 2) * k, y0 + (y1 - y0) * t, cz + sz * (d / 2) * k];
  };
  for (let i = 0; i < levels; i++) {
    for (const [sx, sz] of corners) geos.push(beam(at(i, sx, sz), at(i + 1, sx, sz), leg, leg, uvPeriod));
    for (let c = 0; c < 4; c++) {
      const [sx1, sz1] = corners[c], [sx2, sz2] = corners[(c + 1) % 4];
      geos.push(beam(at(i + 1, sx1, sz1), at(i + 1, sx2, sz2), brace, brace, uvPeriod));
      if (i === 0) geos.push(beam(at(0, sx1, sz1), at(0, sx2, sz2), brace, brace, uvPeriod));
      if ((i + c) % 2 === 0) geos.push(beam(at(i, sx1, sz1), at(i + 1, sx2, sz2), brace, brace, uvPeriod));
      else geos.push(beam(at(i, sx2, sz2), at(i + 1, sx1, sz1), brace, brace, uvPeriod));
    }
  }
  return geos;
}

// 世界 (x,z) 多边形 → 水平面 ShapeGeometry（y 由调用方 translate），孔洞同格式
function flatShapeGeo(points, holes = [], uvScale = 1 / 8) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2); // shape Y → world -Z 取反后正好落在 world Z；法线朝上
  scaleUV(g, uvScale, uvScale);
  return g;
}

function circleHole(cx, cz, r, n = 28) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return pts;
}

/* ================= 资产（贴图 + 材质） ================= */

function makeAssets(ctx) {
  const T = {
    concrete: loadTex(ctx, 'concrete_pad.webp'),
    concreteRough: loadTex(ctx, 'concrete_pad_rough.webp', { srgb: false, uv: [0.37, 0.43] }), // 与 albedo 错周期，破平铺重复感
    scorched: loadTex(ctx, 'concrete_scorched.webp'),
    steelWhite: loadTex(ctx, 'steel_white.webp'),
    steelRust: loadTex(ctx, 'steel_rust.webp'),
    grating: loadTex(ctx, 'grating.webp'),
    asphalt: loadTex(ctx, 'asphalt.webp'),
    grass: loadTex(ctx, 'grass.webp'),
    sand: loadTex(ctx, 'sand_wet.webp'),
    seaNormal: loadTex(ctx, 'sea_normal.webp', { srgb: false }),
    frond: loadTex(ctx, 'palm_frond.webp'),
    bark: loadTex(ctx, 'palm_bark.webp'),
  };
  const M = {
    apron: new THREE.MeshStandardMaterial({ map: T.concrete, color: 0xc4c7c9, roughnessMap: T.concreteRough, roughness: 1.0, metalness: 0.05 }),
    scorched: new THREE.MeshStandardMaterial({ map: T.scorched, roughness: 0.75, metalness: 0.0, side: THREE.DoubleSide }),
    steelWhite: new THREE.MeshStandardMaterial({ map: T.steelWhite, roughness: 0.55, metalness: 0.75 }),
    steelRust: new THREE.MeshStandardMaterial({ map: T.steelRust, roughness: 0.7, metalness: 0.55 }),
    grating: new THREE.MeshStandardMaterial({ map: T.grating, roughness: 0.6, metalness: 0.8 }),
    asphalt: new THREE.MeshStandardMaterial({ map: T.asphalt, roughness: 0.85, metalness: 0.0 }),
    grass: new THREE.MeshStandardMaterial({ map: T.grass, color: 0x55604e, roughness: 1.0, metalness: 0.0 }), // 夜景压暗
    sand: new THREE.MeshStandardMaterial({ map: T.sand, color: 0xa89f8e, roughness: 0.45, metalness: 0.0 }),
    sea: new THREE.MeshStandardMaterial({
      color: 0x0d2733, roughness: 0.08, metalness: 0.55,
      normalMap: T.seaNormal, normalScale: new THREE.Vector2(0.7, 0.7), envMapIntensity: 1.3,
    }),
    bark: new THREE.MeshStandardMaterial({ map: T.bark, roughness: 0.95, metalness: 0.0 }),
    frond: new THREE.MeshStandardMaterial({
      map: T.frond, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, metalness: 0.0, color: 0x9fb08a,
    }),
    beacon: new THREE.MeshStandardMaterial({ color: 0x2a0505, emissive: 0xff1100, emissiveIntensity: 2.2 }),
  };
  return { T, M };
}

/* ================= 地面：坪 / 导流槽 / 路 / 草 / 小品 ================= */

function buildGround(ctx, A) {
  const g = new THREE.Group(); g.name = 'ground';

  // — 混凝土发射坪 180×180，中央开导流槽口（x∈[-30,30], z∈[-5,5]） —
  const apronGeo = flatShapeGeo(
    [[-90, -90], [90, -90], [90, 90], [-90, 90]],
    [[[-30, -5], [30, -5], [30, 5], [-30, 5]]],
    1 / 8 // 混凝土 1 周期 = 8m（spec §5 纹素尺度）
  );
  const apron = new THREE.Mesh(apronGeo, A.M.apron);
  apron.name = 'apron';
  apron.receiveShadow = true;
  g.add(apron);

  // — 导流槽（沿 X 轴穿原点，宽 10、深 -6、长 ~60，两端斜坡收口） —
  const trenchGeos = [];
  const floor = new THREE.PlaneGeometry(48, 10); // 平底段 x∈[-24,24]
  floor.rotateX(-Math.PI / 2); scaleUV(floor, 48 / 8, 10 / 8); floor.translate(0, -6, 0);
  trenchGeos.push(floor);
  // 侧壁（含端部三角收口轮廓）
  const wallProfile = [[-30, 0], [-24, -6], [24, -6], [30, 0]];
  for (const z of [-5, 5]) {
    const wall = new THREE.ShapeGeometry(new THREE.Shape(wallProfile.map(([x, y]) => new THREE.Vector2(x, y))));
    scaleUV(wall, 1 / 8, 1 / 8); wall.translate(0, 0, z);
    trenchGeos.push(wall);
  }
  // 两端斜坡
  for (const s of [1, -1]) {
    const ramp = new THREE.PlaneGeometry(Math.hypot(6, 6), 10);
    scaleUV(ramp, Math.hypot(6, 6) / 8, 10 / 8);
    ramp.rotateX(-Math.PI / 2); ramp.rotateZ(s * Math.PI / 4);
    ramp.translate(s * 27, -3, 0);
    trenchGeos.push(ramp);
  }
  const trench = new THREE.Mesh(mergeGeometries(trenchGeos), A.M.scorched);
  trench.name = 'flameTrench';
  trench.receiveShadow = true;
  g.add(trench);
  // 中段烧灼加重（发黑叠加层）
  const scorch = new THREE.Mesh(
    (() => { const p = new THREE.PlaneGeometry(26, 9.4); p.rotateX(-Math.PI / 2); p.translate(0, -5.94, 0); return p; })(),
    new THREE.MeshStandardMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false, roughness: 1 })
  );
  scorch.name = 'flameTrenchScorch';
  g.add(scorch);
  // 槽内检修工作灯 ×2（暖光小功率点光 + 壁面灯珠，接口规则内：intensity≤50 / distance≤30 / 无阴影）
  const workLightMat = new THREE.MeshStandardMaterial({ color: 0x1a1408, emissive: 0xffc873, emissiveIntensity: 3 });
  for (const lx of [-14, 14]) {
    const lampBox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.12), workLightMat);
    lampBox.position.set(lx, -2.2, -4.9);
    lampBox.name = 'trenchWorkLamp';
    const pl = new THREE.PointLight(0xffc873, 50, 30, 2);
    pl.position.set(lx, -4, 0);
    pl.castShadow = false;
    pl.name = 'trenchWorkLight';
    g.add(lampBox, pl);
  }

  // — 环坪沥青路（南/东/西三条，北侧留給海岸带） —
  const roadGeo = mergeGeometries([
    flatShapeGeo([[-120, -100], [120, -100], [120, -90], [-120, -90]], [], 1 / 8),
    flatShapeGeo([[-100, -90], [-90, -90], [-90, 88], [-100, 88]], [], 1 / 8),
    flatShapeGeo([[90, -90], [100, -90], [100, 88], [90, 88]], [], 1 / 8),
  ]);
  const road = new THREE.Mesh(roadGeo, A.M.asphalt);
  road.position.y = 0.03;
  road.name = 'road';
  road.receiveShadow = true;
  g.add(road);

  // — 草地（夜景深绿近黑，垫在全场底下；北侧到 z≈101 为止让出海岸带，中央开导流槽口） —
  const grassGeo = flatShapeGeo(
    [[-280, -279], [280, -279], [280, 101], [-280, 101]],
    [[[-30, -5], [30, -5], [30, 5], [-30, 5]]],
    1 / 8
  );
  grassGeo.translate(0, -0.06, 0);
  const grass = new THREE.Mesh(grassGeo, A.M.grass);
  grass.name = 'grass';
  grass.receiveShadow = true;
  g.add(grass);

  // — 周边围栏（南/东/西三面，InstancedMesh 柱 + 合并横杆） —
  const fencePosts = [];
  for (let x = -95; x <= 95; x += 4) fencePosts.push([x, -95]);
  for (let z = -95; z <= 88; z += 4) { fencePosts.push([-95, z]); fencePosts.push([95, z]); }
  const postGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6);
  const posts = new THREE.InstancedMesh(postGeo, A.M.steelWhite, fencePosts.length);
  posts.name = 'fencePosts';
  const m4 = new THREE.Matrix4();
  fencePosts.forEach(([x, z], i) => { m4.makeTranslation(x, 0.8, z); posts.setMatrixAt(i, m4); });
  posts.instanceMatrix.needsUpdate = true;
  const railGeos = [];
  for (const y of [0.75, 1.35]) {
    railGeos.push(beam([-95, y, -95], [95, y, -95], 0.06, 0.06));
    railGeos.push(beam([-95, y, -95], [-95, y, 88], 0.06, 0.06));
    railGeos.push(beam([95, y, -95], [95, y, 88], 0.06, 0.06));
  }
  const rails = new THREE.Mesh(mergeGeometries(railGeos), A.M.steelWhite);
  rails.name = 'fenceRails';
  g.add(posts, rails);

  // — 路灯（实例化，emissive 灯头） —
  const lampSpots = [];
  for (const x of [-100, -60, -20, 20, 60, 100]) lampSpots.push({ x, z: -96, ry: 0 });
  for (const z of [-64, -24, 16, 56]) { lampSpots.push({ x: -96, z, ry: Math.PI / 2 }); lampSpots.push({ x: 96, z, ry: -Math.PI / 2 }); }
  const poleGeos = [
    beam([0, 0, 0], [0, 6.5, 0], 0.14, 0.14),
    beam([0, 6.3, 0], [0, 6.45, 1.15], 0.09, 0.09),
  ];
  const poleGeo = mergeGeometries(poleGeos);
  const headGeo = new THREE.BoxGeometry(0.34, 0.16, 0.62); headGeo.translate(0, 6.42, 1.2);
  const lampMat = A.M.steelWhite;
  const headMat = new THREE.MeshStandardMaterial({ color: 0x1a1a14, emissive: 0xffd9a0, emissiveIntensity: 2.6 });
  const poles = new THREE.InstancedMesh(poleGeo, lampMat, lampSpots.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length);
  poles.name = 'streetLampPoles'; heads.name = 'streetLampHeads';
  const q = new THREE.Quaternion(), e = new THREE.Euler(), s1 = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  lampSpots.forEach((L, i) => {
    e.set(0, L.ry, 0); q.setFromEuler(e); p.set(L.x, 0, L.z);
    m4.compose(p, q, s1); poles.setMatrixAt(i, m4); heads.setMatrixAt(i, m4);
  });
  poles.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
  poles.castShadow = true;
  g.add(poles, heads);

  // — 场坪小品：电缆桥架（MLP → 勤务塔）+ 管路墩 —
  const trayGeos = [
    beam([12.5, 0.7, -2], [19.5, 0.7, -4.5], 0.5, 0.25),
    beam([19.5, 0.7, -4.5], [19.5, 0.7, -7.5], 0.5, 0.25),
    beam([12.5, 0.35, -2], [12.5, 0.7, -2], 0.12, 0.12),
    beam([19.5, 0.35, -4.5], [19.5, 0.7, -4.5], 0.12, 0.12),
    beam([19.5, 0.35, -7.5], [19.5, 0.7, -7.5], 0.12, 0.12),
  ];
  const tray = new THREE.Mesh(mergeGeometries(trayGeos), A.M.steelWhite);
  tray.name = 'cableTray'; tray.castShadow = true;
  const pierGeos = [];
  for (let i = 0; i < 6; i++) {
    const b = new THREE.BoxGeometry(0.9, 0.55, 0.9);
    b.translate(-14 + i * 3.2, 0.28, -9.5);
    pierGeos.push(b);
  }
  const piers = new THREE.Mesh(mergeGeometries(pierGeos), A.M.apron);
  piers.name = 'pipePiers'; piers.castShadow = piers.receiveShadow = true;
  g.add(tray, piers);

  return g;
}

/* ================= 活动发射平台 MLP ================= */

function buildMLP(ctx, A) {
  const g = new THREE.Group(); g.name = 'mlp';
  const steelGeos = [];

  // 4 角粗支撑柱（跨导流槽落到坪面）+ 柱间 X 撑
  const cols = [[-9, -9], [9, -9], [9, 9], [-9, 9]];
  for (const [x, z] of cols) steelGeos.push(beam([x, 0, z], [x, 6.6, z], 2.6, 2.6, 3));
  for (let c = 0; c < 4; c++) {
    const [x1, z1] = cols[c], [x2, z2] = cols[(c + 1) % 4];
    steelGeos.push(beam([x1, 0.4, z1], [x2, 6.4, z2], 0.4, 0.4));
    steelGeos.push(beam([x1, 6.4, z1], [x2, 0.4, z2], 0.4, 0.4));
  }
  // 箱体侧壁（y 6.6 ~ 8.0）
  const wallN = new THREE.BoxGeometry(24, 1.4, 0.5); wallN.translate(0, 7.3, 11.75);
  const wallS = new THREE.BoxGeometry(24, 1.4, 0.5); wallS.translate(0, 7.3, -11.75);
  const wallE = new THREE.BoxGeometry(0.5, 1.4, 24); wallE.translate(11.75, 7.3, 0);
  const wallW = new THREE.BoxGeometry(0.5, 1.4, 24); wallW.translate(-11.75, 7.3, 0);
  for (const wgeo of [wallN, wallS, wallE, wallW]) { scaleUV(wgeo, 24 / 3, 1.4 / 3); steelGeos.push(wgeo); }
  // 牵制释放臂基座 ×4（台面孔边）
  for (const [x, z] of [[3.3, 3.3], [3.3, -3.3], [-3.3, 3.3], [-3.3, -3.3]]) {
    const b = new THREE.BoxGeometry(1.2, 0.9, 1.2); scaleUV(b, 0.4, 0.3); b.translate(x, 8.45, z);
    steelGeos.push(b);
    const post = new THREE.BoxGeometry(0.4, 0.7, 0.4); post.translate(x, 9.2, z);
    steelGeos.push(post);
  }
  const steel = new THREE.Mesh(mergeGeometries(steelGeos), A.M.steelWhite);
  steel.name = 'mlpStructure';
  steel.castShadow = steel.receiveShadow = true;
  g.add(steel);

  // 顶部格栅台面（中央 Ø7 尾焰开口）
  const deckGeo = flatShapeGeo(
    [[-12, -12], [12, -12], [12, 12], [-12, 12]],
    [circleHole(0, 0, 3.5)],
    1 / 1.5 // 格栅 1 周期 ≈ 1.5m
  );
  deckGeo.translate(0, 8.0, 0);
  const deck = new THREE.Mesh(deckGeo, A.M.grating);
  deck.name = 'mlpDeck';
  deck.castShadow = deck.receiveShadow = true;
  g.add(deck);

  // 箱体内底板（带同孔，从下方可见）
  const bottomGeo = flatShapeGeo(
    [[-12, -12], [12, -12], [12, 12], [-12, 12]],
    [circleHole(0, 0, 3.5)],
    1 / 3
  );
  bottomGeo.translate(0, 6.62, 0);
  const bottom = new THREE.Mesh(bottomGeo, A.M.steelWhite);
  bottom.name = 'mlpBottom';
  g.add(bottom);

  // 尾焰导流筒内壁（烧灼）
  const ductGeo = new THREE.CylinderGeometry(3.5, 3.5, 1.38, 32, 1, true);
  scaleUV(ductGeo, (2 * Math.PI * 3.5) / 8, 1.38 / 8);
  const duct = new THREE.Mesh(ductGeo, A.M.scorched);
  duct.position.y = 7.31;
  duct.name = 'flameDuct';
  g.add(duct);

  return g;
}

/* ================= 脐带塔（MLP 上 −X 侧）+ 摆杆 ================= */

function buildUmbilicalArm(A, len, connectorH) {
  // 摆杆：以塔柱侧（局部原点）为 pivot，沿 +X 伸向火箭；发射序列绕 pivot.rotation.y 摆开
  const geos = [];
  const h = 0.45; // 半高
  for (const [sy, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
    geos.push(beam([0, sy * h, sz * h], [len, sy * h * 0.55, sz * h * 0.55], 0.14, 0.14));
  }
  for (let i = 1; i <= 4; i++) {
    const x = (len * i) / 4, k = 1 - 0.45 * (i / 4);
    geos.push(beam([x, h * k, -h * k], [x, h * k, h * k], 0.08, 0.08));
    geos.push(beam([x, -h * k, -h * k], [x, -h * k, h * k], 0.08, 0.08));
    geos.push(beam([x, -h * k, -h * k], [x, h * k, -h * k], 0.08, 0.08));
    geos.push(beam([x, -h * k, h * k], [x, h * k, h * k], 0.08, 0.08));
  }
  // 端部脐带接头盒
  const box = new THREE.BoxGeometry(1.0, connectorH, 1.0); scaleUV(box, 0.35, 0.35); box.translate(len + 0.4, 0, 0);
  geos.push(box);
  // 脐带软管
  const hose = new THREE.CylinderGeometry(0.09, 0.09, len * 0.92, 8);
  scaleUV(hose, 0.1, len / 3);
  hose.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, -0.06).normalize()));
  hose.translate(len * 0.48, -h - 0.12, 0.1);
  geos.push(hose);
  const arm = new THREE.Mesh(mergeGeometries(geos), A.M.steelWhite);
  arm.castShadow = true;
  return arm;
}

function buildUmbilicalTower(ctx, A) {
  const g = new THREE.Group(); g.name = 'umbilicalTower';

  const geos = trussTower({ cx: -9, cz: 0, w: 3, d: 3, y0: 8, y1: 55, levels: 11, leg: 0.3, brace: 0.14 });
  // 塔顶小平台 + 爬梯
  const top = new THREE.BoxGeometry(3.6, 0.18, 3.6); scaleUV(top, 2.4, 2.4); top.translate(-9, 55.1, 0);
  const platMat = A.M.grating;
  const topMesh = new THREE.Mesh(top, platMat);
  topMesh.castShadow = true;
  // 层间格栅小平台
  const platGeos = [];
  for (const y of [16.5, 25.2, 33.9, 42.6, 51.3]) {
    const p = new THREE.BoxGeometry(3.4, 0.12, 3.4); scaleUV(p, 2.2, 2.2); p.translate(-9, y, 0);
    platGeos.push(p);
  }
  const plats = new THREE.Mesh(mergeGeometries(platGeos), platMat);
  plats.castShadow = true;
  // 爬梯（−X 面）
  const ladderGeos = [
    beam([-10.7, 8, -0.3], [-10.7, 55, -0.3], 0.06, 0.06),
    beam([-10.7, 8, 0.3], [-10.7, 55, 0.3], 0.06, 0.06),
  ];
  for (let y = 8.4; y < 55; y += 0.36) ladderGeos.push(beam([-10.7, y, -0.3], [-10.7, y, 0.3], 0.04, 0.04));
  const truss = new THREE.Mesh(mergeGeometries([...geos, ...ladderGeos]), A.M.steelWhite);
  truss.name = 'umbilicalTruss';
  truss.castShadow = truss.receiveShadow = true;
  g.add(truss, topMesh, plats);

  // 摆杆 ×2（pivot 在塔柱侧，世界 y≈28 / y≈44，端部伸向原点）
  const arm1 = new THREE.Group(); arm1.name = 'arm1';
  arm1.position.set(-7.5, 28, 0);
  arm1.add(buildUmbilicalArm(A, 6, 1.3));
  const arm2 = new THREE.Group(); arm2.name = 'arm2';
  arm2.position.set(-7.5, 44, 0);
  arm2.add(buildUmbilicalArm(A, 6, 1.0));
  g.add(arm1, arm2);

  return g;
}

/* ================= 勤务塔（固定式，回转平台已打开） ================= */

function buildServiceTower(ctx, A) {
  const g = new THREE.Group(); g.name = 'serviceTower';
  const CX = 26, CZ = -6; // 中心

  const whiteGeos = trussTower({ cx: CX, cz: CZ, w: 12, d: 12, y0: 0, y1: 78, levels: 15, leg: 0.5, brace: 0.22 });
  // 斜爬梯（南面两列：导轨 + 横档）
  const ladZ = CZ - 6.35;
  for (const lx of [CX - 2.5, CX + 2.5]) {
    whiteGeos.push(beam([lx - 0.3, 0, ladZ], [lx - 0.3, 78, ladZ], 0.07, 0.07));
    whiteGeos.push(beam([lx + 0.3, 0, ladZ], [lx + 0.3, 78, ladZ], 0.07, 0.07));
    for (let y = 0.5; y < 78; y += 0.38) whiteGeos.push(beam([lx - 0.3, y, ladZ], [lx + 0.3, y, ladZ], 0.04, 0.04));
  }
  // 电梯井框架（东面外侧）
  const shX = CX + 6 + 1.25;
  for (const [sy, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
    whiteGeos.push(beam([shX + sz * 1.2, 0, CZ + sy * 1.2], [shX + sz * 1.2, 74, CZ + sy * 1.2], 0.16, 0.16));
  }
  for (let y = 6; y <= 74; y += 6.8) {
    whiteGeos.push(beam([shX - 1.2, y, CZ - 1.2], [shX + 1.2, y, CZ - 1.2], 0.1, 0.1));
    whiteGeos.push(beam([shX - 1.2, y, CZ + 1.2], [shX + 1.2, y, CZ + 1.2], 0.1, 0.1));
    whiteGeos.push(beam([shX - 1.2, y, CZ - 1.2], [shX - 1.2, y, CZ + 1.2], 0.1, 0.1));
    whiteGeos.push(beam([shX + 1.2, y, CZ - 1.2], [shX + 1.2, y, CZ + 1.2], 0.1, 0.1));
  }
  const truss = new THREE.Mesh(mergeGeometries(whiteGeos), A.M.steelWhite);
  truss.name = 'serviceTruss';
  truss.castShadow = truss.receiveShadow = true;
  g.add(truss);

  // 电梯玻璃井道
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 74, 2.3),
    new THREE.MeshStandardMaterial({ color: 0x9fc4d8, transparent: true, opacity: 0.22, roughness: 0.08, metalness: 0.3, depthWrite: false })
  );
  glass.position.set(shX, 37, CZ);
  glass.name = 'elevatorShaft';
  g.add(glass);

  // 层间格栅平台（每隔一层）
  const platGeos = [];
  for (let i = 1; i <= 15; i += 2) {
    const y = (78 / 15) * i;
    const p = new THREE.BoxGeometry(12, 0.14, 12); scaleUV(p, 12 / 1.5, 12 / 1.5); p.translate(CX, y, CZ);
    platGeos.push(p);
  }
  const plats = new THREE.Mesh(mergeGeometries(platGeos), A.M.grating);
  plats.name = 'servicePlatforms';
  plats.castShadow = plats.receiveShadow = true;
  g.add(plats);

  // 回转平台 ×3（橙/锈色桁架，y≈25/40/55；pivot 在西面中央，打开位 = rotation.y=-90° 贴西立面）
  for (const [idx, y] of [[1, 25], [2, 40], [3, 55]]) {
    const plat = new THREE.Group();
    plat.name = 'rotPlatform' + idx;
    plat.position.set(CX - 6, y, CZ);
    plat.rotation.y = -Math.PI / 2 + (idx - 2) * 0.09; // 打开位（闭合朝 −X 指向火箭，已旋离贴塔身）
    const pGeos = [];
    const L = 8, W = 3;
    for (const [sy, sz] of [[0, 1], [0, -1]]) {
      pGeos.push(beam([0, 0, sz * W / 2], [-L, 0, sz * W / 2], 0.22, 0.22));
      pGeos.push(beam([0, -1.2, sz * W / 2], [-L, 0, sz * W / 2], 0.12, 0.12));
    }
    for (let i = 0; i <= 4; i++) {
      const x = (-L * i) / 4;
      pGeos.push(beam([x, 0, -W / 2], [x, 0, W / 2], 0.12, 0.12));
    }
    const dk = new THREE.BoxGeometry(L, 0.12, W); scaleUV(dk, L / 1.5, W / 1.5); dk.translate(-L / 2, 0.08, 0);
    const dkMesh = new THREE.Mesh(dk, A.M.grating);
    // 端部护栏
    for (const sz of [-1, 1]) pGeos.push(beam([-L, 0, sz * W / 2], [-L, 1.1, sz * W / 2], 0.07, 0.07));
    pGeos.push(beam([-L, 1.1, -W / 2], [-L, 1.1, W / 2], 0.07, 0.07));
    const trussMesh = new THREE.Mesh(mergeGeometries(pGeos), A.M.steelRust);
    trussMesh.castShadow = dkMesh.castShadow = true;
    plat.add(trussMesh, dkMesh);
    g.add(plat);
  }

  // 顶部吊车梁（锤头式，锈色）+ 司机室
  const craneGeos = [];
  for (const [sy, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
    craneGeos.push(beam([CX - 4, 78 + sy * 0.75, CZ + sz * 0.75], [CX + 12, 78 + sy * 0.75, CZ + sz * 0.75], 0.2, 0.2));
  }
  for (let i = 0; i <= 4; i++) {
    const x = CX - 4 + i * 4;
    craneGeos.push(beam([x, 78 - 0.75, CZ - 0.75], [x, 78 + 0.75, CZ + 0.75], 0.12, 0.12));
    if (i < 4) craneGeos.push(beam([x, 78 - 0.75, CZ - 0.75], [x + 4, 78 + 0.75, CZ - 0.75], 0.1, 0.1));
  }
  const cab = new THREE.BoxGeometry(2.2, 2.2, 2.2); scaleUV(cab, 0.7, 0.7); cab.translate(CX - 3, 79.2, CZ + 1.6);
  craneGeos.push(cab);
  const crane = new THREE.Mesh(mergeGeometries(craneGeos), A.M.steelRust);
  crane.name = 'crane';
  crane.castShadow = true;
  g.add(crane);

  // 塔顶红色障碍灯（常亮 emissive，闪烁由主 agent 驱动）
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), A.M.beacon);
  beacon.position.set(CX, 79.6, CZ);
  beacon.name = 'beaconService';
  g.add(beacon);

  return g;
}

/* ================= 避雷塔 ×3 ================= */

function buildLightningTowers(ctx, A) {
  const g = new THREE.Group(); g.name = 'lightningTowers';
  const geos = trussTower({ cx: 0, cz: 0, w: 3.5, d: 3.5, y0: 0, y1: 93, levels: 19, leg: 0.26, brace: 0.12, taper: 0.32 });
  // 接闪尖
  const spike = new THREE.CylinderGeometry(0.02, 0.1, 4, 6);
  spike.translate(0, 93 + 2, 0);
  geos.push(spike);
  const geo = mergeGeometries(geos);
  const mat = new THREE.MeshStandardMaterial({ map: A.T.steelWhite, color: 0xb9bec4, roughness: 0.6, metalness: 0.7 });

  const spots = [
    { p: [-65, 0, 55], s: 1.0 },
    { p: [-60, 0, -70], s: 0.96 },
    { p: [55, 0, 75], s: 1.03 },
  ];
  const beaconGeos = [];
  spots.forEach((sp, i) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...sp.p);
    mesh.scale.setScalar(sp.s);
    mesh.name = 'lightningTower' + i;
    mesh.castShadow = true;
    g.add(mesh);
    const b = new THREE.SphereGeometry(0.45, 10, 8);
    b.translate(sp.p[0], 93 * sp.s + 0.3, sp.p[2]);
    beaconGeos.push(b);
  });
  const beacons = new THREE.Mesh(mergeGeometries(beaconGeos), A.M.beacon);
  beacons.name = 'beaconLightning';
  g.add(beacons);
  return g;
}

/* ================= 水塔 ================= */

function buildWaterTower(ctx, A) {
  const g = new THREE.Group(); g.name = 'waterTower';
  const CX = -38, CZ = -42;
  const geos = [];
  // 4 柱 + X 撑（两节）
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
    geos.push(beam([CX + sx * 3, 0, CZ + sz * 3], [CX + sx * 2.2, 25, CZ + sz * 2.2], 0.45, 0.45));
  }
  const lv = (t, sx, sz) => [CX + sx * (3 - 0.8 * t), 25 * t, CZ + sz * (3 - 0.8 * t)];
  const cs = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  for (let c = 0; c < 4; c++) {
    const [a, b] = [cs[c], cs[(c + 1) % 4]];
    geos.push(beam(lv(0.05, ...a), lv(0.5, ...b), 0.14, 0.14));
    geos.push(beam(lv(0.05, ...b), lv(0.5, ...a), 0.14, 0.14));
    geos.push(beam(lv(0.5, ...a), lv(0.95, ...b), 0.14, 0.14));
    geos.push(beam(lv(0.5, ...b), lv(0.95, ...a), 0.14, 0.14));
    geos.push(beam(lv(0.5, ...a), lv(0.5, ...b), 0.14, 0.14));
  }
  const legs = new THREE.Mesh(mergeGeometries(geos), A.M.steelWhite);
  legs.name = 'waterTowerLegs';
  legs.castShadow = true;
  g.add(legs);

  // Ø10×6 水箱 + 锥顶 + 锥底
  const tankGeos = [];
  const tank = new THREE.CylinderGeometry(5, 5, 6, 28);
  scaleUV(tank, (2 * Math.PI * 5) / 8, 6 / 8); tank.translate(0, 28, 0);
  const roof = new THREE.CylinderGeometry(0.4, 5.15, 1.6, 28); roof.translate(0, 31.8, 0);
  const cone = new THREE.CylinderGeometry(5, 3.2, 1.6, 28); cone.translate(0, 24.2, 0);
  tankGeos.push(tank, roof, cone);
  const tankMesh = new THREE.Mesh(mergeGeometries(tankGeos), A.M.steelWhite);
  tankMesh.position.set(CX, 0, CZ);
  tankMesh.name = 'waterTank';
  tankMesh.castShadow = true;
  g.add(tankMesh);

  return g;
}

/* ================= 探照灯设施 ×4 ================= */

function makeLampFaceTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const ctx2 = c.getContext('2d');
  ctx2.fillStyle = '#0b0b0d'; ctx2.fillRect(0, 0, 256, 160);
  for (let r = 0; r < 2; r++) for (let col = 0; col < 3; col++) {
    const x = 44 + col * 84, y = 42 + r * 76;
    const grad = ctx2.createRadialGradient(x, y, 2, x, y, 30);
    grad.addColorStop(0, '#fff6e0'); grad.addColorStop(0.45, '#ffd9a0'); grad.addColorStop(1, '#3a2c18');
    ctx2.fillStyle = grad;
    ctx2.beginPath(); ctx2.arc(x, y, 30, 0, Math.PI * 2); ctx2.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildSearchlights(ctx, A) {
  const g = new THREE.Group(); g.name = 'searchlightFixtures';
  const elev = Math.atan2(30 - 9.8, Math.hypot(25, 22)); // 灯头仰角 ≈ 31°（指向 (0,30,0)）

  // 灯架桁架（10m）+ 顶部灯头框，几何只建一次
  const geos = trussTower({ w: 0.9, d: 0.9, y0: 0, y1: 9, levels: 4, leg: 0.1, brace: 0.06 });
  const base = new THREE.BoxGeometry(1.6, 0.4, 1.6); base.translate(0, 0.2, 0);
  geos.push(base);
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-elev, 0, 0));
  const headParts = [];
  const frame = new THREE.BoxGeometry(1.9, 1.35, 0.55); scaleUV(frame, 0.6, 0.45);
  headParts.push(frame);
  const yoke = new THREE.BoxGeometry(0.18, 1.1, 0.18); yoke.translate(0, -1.0, -0.1);
  headParts.push(yoke);
  for (const hp of headParts) {
    hp.applyQuaternion(tilt);
    hp.translate(0, 9.8, 0);
    geos.push(hp);
  }
  const structGeo = mergeGeometries(geos);

  // 灯面（emissive，2×3 灯珠）
  const faceTex = makeLampFaceTexture();
  const faceGeo = new THREE.PlaneGeometry(1.7, 1.15);
  faceGeo.applyQuaternion(tilt);
  faceGeo.translate(0, 9.8, 0);
  faceGeo.translate(0, Math.sin(elev) * 0.3, Math.cos(elev) * 0.3); // 推出灯框前面（灯面朝向 = 主光方向）
  const faceMat = new THREE.MeshStandardMaterial({
    map: faceTex, emissive: 0xfff2df, emissiveIntensity: 2.2, emissiveMap: faceTex, roughness: 0.4,
  });

  const spots = [[25, 22], [25, -22], [-25, 22], [-25, -22]];
  // 4 座烘焙成 2 个 mesh（结构 1 + 灯面 1），省 drawcall
  const structGeos = [], faceGeos = [];
  const rotM = new THREE.Matrix4();
  for (const [x, z] of spots) {
    const ry = Math.atan2(-x, -z); // 面向场心
    rotM.makeRotationY(ry).setPosition(x, 0, z);
    structGeos.push(structGeo.clone().applyMatrix4(rotM));
    faceGeos.push(faceGeo.clone().applyMatrix4(rotM));
  }
  const structs = new THREE.Mesh(mergeGeometries(structGeos), A.M.steelWhite);
  structs.name = 'searchlightStructures';
  structs.castShadow = true;
  const faces = new THREE.Mesh(mergeGeometries(faceGeos), faceMat);
  faces.name = 'searchlightFaces';
  g.add(structs, faces);
  return g;
}

/* ================= 海岸：椰林 + 沙滩 + 海 ================= */

// 单片椰叶（带下垂弧度的平面，基部在原点、沿 +X 伸展）
function frondGeo(len = 3.4, wid = 1.5, droop = 1.0) {
  const geo = new THREE.PlaneGeometry(len, wid, 5, 1);
  for (let i = 0; i < geo.attributes.position.count; i++) {
    const x = geo.attributes.position.getX(i) + len / 2; // 0..len
    const k = x / len;
    geo.attributes.position.setY(i, geo.attributes.position.getY(i) * (1 - k * 0.55)); // 端部收窄
    geo.attributes.position.setZ(i, -droop * k * k * 1.1); // 下垂
    geo.attributes.position.setX(i, x);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildNearPalm(A, rand, height, bend) {
  const g = new THREE.Group();
  // 弯树干（7 段渐弯）
  const segs = 7, segLen = height / segs;
  const bendYaw = rand() * Math.PI * 2;
  const dir = new THREE.Vector3(0, 1, 0);
  const pt = new THREE.Vector3(0, 0, 0);
  const trunkGeos = [];
  for (let i = 0; i < segs; i++) {
    const tilt = bend * (i / segs) * 0.35;
    dir.set(Math.cos(bendYaw) * tilt, 1, Math.sin(bendYaw) * tilt).normalize();
    const next = pt.clone().addScaledVector(dir, segLen);
    const r0 = 0.24 - (i / segs) * 0.1, r1 = 0.24 - ((i + 1) / segs) * 0.1;
    const cyl = new THREE.CylinderGeometry(r1, r0, segLen * 1.06, 7);
    scaleUV(cyl, (2 * Math.PI * r0) / 1.5, segLen / 1.5);
    cyl.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    const mid = pt.clone().add(next).multiplyScalar(0.5);
    cyl.translate(mid.x, mid.y, mid.z);
    trunkGeos.push(cyl);
    pt.copy(next);
  }
  const trunk = new THREE.Mesh(mergeGeometries(trunkGeos), A.M.bark);
  trunk.castShadow = true;
  g.add(trunk);
  // 树冠：9 片叶
  const crownGeos = [];
  for (let i = 0; i < 9; i++) {
    const f = frondGeo(3.2 + rand() * 0.9, 1.4, 0.9 + rand() * 0.5);
    const m = new THREE.Matrix4().makeRotationY((i / 9) * Math.PI * 2 + rand() * 0.5);
    const m2 = new THREE.Matrix4().makeRotationZ(-0.15 - rand() * 0.55);
    f.applyMatrix4(m2); f.applyMatrix4(m);
    f.translate(pt.x, pt.y + 0.15, pt.z);
    crownGeos.push(f);
  }
  const crown = new THREE.Mesh(mergeGeometries(crownGeos), A.M.frond);
  crown.castShadow = true;
  g.add(crown);
  return g;
}

function buildCoast(ctx, A) {
  const g = new THREE.Group(); g.name = 'coast';
  const rand = ctx.rand;

  // — 沙滩带（湿沙浅色反光，z≈100~133） —
  const sandGeo = flatShapeGeo([[-260, 100], [260, 100], [260, 133], [-260, 133]], [], 1 / 8);
  const sand = new THREE.Mesh(sandGeo, A.M.sand);
  sand.position.y = 0.015;
  sand.name = 'beach';
  sand.receiveShadow = true;
  g.add(sand);

  // — 海面（z 130 → 630，法线波纹 + 低粗糙度映余晖 + 深青） —
  const seaGeo = new THREE.PlaneGeometry(900, 500, 1, 1);
  seaGeo.rotateX(-Math.PI / 2); scaleUV(seaGeo, 900 / 15, 500 / 15);
  const sea = new THREE.Mesh(seaGeo, A.M.sea);
  sea.position.set(0, -0.4, 380);
  sea.name = 'sea';
  sea.receiveShadow = true;
  g.add(sea);

  // — 椰林 ~40 棵：近景（|x|<40）6 棵全 3D（烘焙成 2 个 mesh 省 drawcall），远景实例化 —
  const nearTrunkGeos = [], nearCrownGeos = [];
  for (let i = 0; i < 6; i++) {
    const x = -36 + i * 14 + (rand() - 0.5) * 6, z = 96 + rand() * 22;
    const palm = buildNearPalm(A, rand, 6.5 + rand() * 3.2, 0.5 + rand() * 0.8);
    palm.position.set(x, 0, z);
    palm.rotation.y = rand() * Math.PI * 2;
    palm.updateMatrixWorld(true);
    palm.children[0].geometry = palm.children[0].geometry.clone().applyMatrix4(palm.matrixWorld);
    palm.children[1].geometry = palm.children[1].geometry.clone().applyMatrix4(palm.matrixWorld);
    nearTrunkGeos.push(palm.children[0].geometry);
    nearCrownGeos.push(palm.children[1].geometry);
  }
  const nearTrunks = new THREE.Mesh(mergeGeometries(nearTrunkGeos), A.M.bark);
  nearTrunks.name = 'palmNearTrunks';
  const nearCrowns = new THREE.Mesh(mergeGeometries(nearCrownGeos), A.M.frond);
  nearCrowns.name = 'palmNearCrowns';
  nearTrunks.castShadow = nearCrowns.castShadow = true;
  g.add(nearTrunks, nearCrowns);

  // 远景：实例化弯树干 + 实例化树冠（变体靠 yaw/scale）
  const farCount = 34;
  const farTrunkGeo = (() => {
    const geos = [];
    const segs = 5, h = 8;
    const dir = new THREE.Vector3(0.16, 1, 0).normalize();
    const pt = new THREE.Vector3();
    for (let i = 0; i < segs; i++) {
      const next = pt.clone().addScaledVector(dir, h / segs);
      const cyl = new THREE.CylinderGeometry(0.22 - (i + 1) / segs * 0.08, 0.22 - i / segs * 0.08, h / segs * 1.06, 5);
      scaleUV(cyl, 0.3, h / segs / 1.5);
      cyl.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
      const mid = pt.clone().add(next).multiplyScalar(0.5);
      cyl.translate(mid.x, mid.y, mid.z);
      geos.push(cyl);
      pt.copy(next);
    }
    return mergeGeometries(geos);
  })();
  const trunkTop = new THREE.Vector3(0.16, 1, 0).normalize().multiplyScalar(8);
  const farCrownGeo = (() => {
    const geos = [];
    for (let i = 0; i < 8; i++) {
      const f = frondGeo(3.1, 1.35, 1.05);
      f.applyMatrix4(new THREE.Matrix4().makeRotationZ(-0.25 - (i % 3) * 0.2));
      f.applyMatrix4(new THREE.Matrix4().makeRotationY((i / 8) * Math.PI * 2));
      f.translate(trunkTop.x, trunkTop.y + 0.1, trunkTop.z);
      geos.push(f);
    }
    return mergeGeometries(geos);
  })();
  const farTrunks = new THREE.InstancedMesh(farTrunkGeo, A.M.bark, farCount);
  const farCrowns = new THREE.InstancedMesh(farCrownGeo, A.M.frond, farCount);
  farTrunks.name = 'palmFarTrunks'; farCrowns.name = 'palmFarCrowns';
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  let placed = 0;
  while (placed < farCount) {
    const x = -150 + rand() * 300;
    const z = 92 + rand() * 46;
    if (Math.abs(x) < 42 && z < 128) continue; // 近景带留给全 3D 树
    const k = 0.7 + rand() * 0.6;
    p.set(x, 0, z); q.setFromEuler(new THREE.Euler(0, rand() * Math.PI * 2, 0)); s.set(k, k * (0.9 + rand() * 0.25), k);
    m4.compose(p, q, s);
    farTrunks.setMatrixAt(placed, m4); farCrowns.setMatrixAt(placed, m4);
    placed++;
  }
  farTrunks.instanceMatrix.needsUpdate = farCrowns.instanceMatrix.needsUpdate = true;
  farTrunks.frustumCulled = farCrowns.frustumCulled = false;
  farTrunks.castShadow = farCrowns.castShadow = true;
  g.add(farTrunks, farCrowns);

  return g;
}

/* ================= 总装 ================= */

export function buildPad(ctx) {
  const A = makeAssets(ctx);
  const pad = new THREE.Group();
  pad.name = 'pad';
  pad.add(
    buildGround(ctx, A),
    buildMLP(ctx, A),
    buildUmbilicalTower(ctx, A),
    buildServiceTower(ctx, A),
    buildLightningTowers(ctx, A),
    buildWaterTower(ctx, A),
    buildSearchlights(ctx, A),
    buildCoast(ctx, A),
  );
  return pad;
}
