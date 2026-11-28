import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import {ASSEMBLIES, explosionStages, buildExplosionPlan} from "./explosion.js?v=20260914-stages-b";
import {createKimiScreen} from "./kimi-screen.js";
import {createAssemblyAnimator} from "./assemble.js?v=20260914-hinge-slot";
import {addHardware, createCableRig} from "./hardware.js?v=20260914-hinge-slot";
import {groupKeycaps, matchLegend, LEGEND_SCALE} from "./keylegends.js?v=20260914-keylegends-a";

const Q = new URLSearchParams(location.search);
const app = document.getElementById("app");
addEventListener('unhandledrejection',event=>{
 const loading=document.getElementById('loading');loading.style.display='flex';
 loading.querySelector('strong').textContent='模型暂时未能载入';loading.querySelector('p').textContent='请刷新页面重试';
 console.error(event.reason);
});

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(app.clientWidth, app.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111519);
const _env = new RoomEnvironment();
_env.traverse(o => { if (o.isMesh && o.material && o.material.color) o.material.color.multiplyScalar(0.35); });
scene.environment = Q.get("noenv") === "1" ? null : new THREE.PMREMGenerator(renderer).fromScene(_env, 0.04).texture;

const camera = new THREE.PerspectiveCamera(38, app.clientWidth / app.clientHeight, 1, 8000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const key1 = new THREE.DirectionalLight(0xffffff, 1.1); key1.position.set(300, 500, 200);
const key2 = new THREE.DirectionalLight(0xaFC0ff, 0.4); key2.position.set(-400, 200, -300);
const underLight = new THREE.DirectionalLight(0xffffff, 1.8); underLight.position.set(-100, -400, 120);
scene.add(key1, key2, underLight, new THREE.AmbientLight(0xffffff, .32));

const GROUP_ZH = { case: "外壳", screen: "屏幕", keyboard: "键盘", battery: "电池", motherboard: "主板", input: "输入设备", hinges: "转轴", cables: "排线与线束" };
const initialProgress = Math.max(parseFloat(Q.get("explode") || "0"), Q.has("compExplode") && parseFloat(Q.get("compExplode")) > 0 ? .5 + parseFloat(Q.get("compExplode")) / 2 : 0);

let renderRequired = true;
controls.addEventListener("change", () => { renderRequired = true; });

const state = {
  explode: initialProgress,
  structureExplode: 0,
  compExplode: 0,
  lid: parseFloat(Q.get("lid") || "110"),
  power: Q.get("power") === "on",
  playing: false,
  view: Q.get("view") || (Q.get("cam") === "bottom" ? "wiring" : "whole"),
  speed: 1,
  t: parseFloat(Q.get("t") || "0"),
  filter: Q.get("filter") || null,
  selected: Q.get("select") || null,
};

const pivots = {};   // canon -> Group
const mats = {};     // canon -> material
let parts_map = null;
let explosionPlan = null, cableRig = null;

function applyExplode() {
  renderRequired = true;
  const stages = explosionStages(state.explode);
  state.explode = stages.value;
  state.structureExplode = stages.structure;
  state.compExplode = stages.components;
  hingeGroup.position.copy(HINGE_POS).addScaledVector(new THREE.Vector3(...ASSEMBLIES.screen.offset), stages.structure);
  for (const [canon, entry] of Object.entries(explosionPlan)) {
    const p = pivots[canon], info = parts_map.parts[canon];
    p.position.copy(p.userData.base);
    if (!info.lid) p.position.addScaledVector(entry.coarse, stages.structure);
    p.position.addScaledVector(entry.detail, stages.components);
  }
  cableRig?.update();
  document.getElementById("explode").value = Math.round(stages.value * 100);
  document.getElementById("explodeVal").textContent = Math.round(stages.value * 100) + "%";
  document.getElementById("structureVal").textContent = Math.round(stages.structure * 100) + "%";
  document.getElementById("compVal").textContent = Math.round(stages.components * 100) + "%";
  document.getElementById("stageLabel").textContent = stages.value === 0 ? "已装配" : stages.value <= .5 ? "第一阶段 · 大结构展开" : "第二阶段 · 内部元件展开";
  document.getElementById("structureStep").classList.toggle("active", stages.value > 0 && stages.value <= .5);
  document.getElementById("componentStep").classList.toggle("active", stages.value > .5);
}

function modelBounds(names) {
  scene.updateMatrixWorld(true);
  const box=new THREE.Box3();
  for(const [name,p] of Object.entries(pivots))if(p.visible&&!parts_map.parts[name].dynamicCable&&(!names||names.includes(name)))box.union(new THREE.Box3().setFromObject(p));
  return box;
}
function fitDistance(box,dir,padding=1.14) {
  const center=box.getCenter(new THREE.Vector3()),right=new THREE.Vector3().crossVectors(camera.up,dir).normalize(),up=new THREE.Vector3().crossVectors(dir,right).normalize();
  const tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanH=tanV*camera.aspect;let d=0;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const v=new THREE.Vector3(x,y,z).sub(center),depth=v.dot(dir);
    d=Math.max(d,depth+Math.abs(v.dot(right))/tanH,depth+Math.abs(v.dot(up))/tanV);
  }
  return {center,distance:Math.max(d*padding,30)};
}
function placeCamera(center,dir,distance) {
  controls.target.copy(center);camera.position.copy(center).addScaledVector(dir,distance);
  camera.near=Math.max(.1,distance/200);camera.far=distance*30;camera.updateProjectionMatrix();camera.lookAt(center);controls.update();renderRequired=true;
}
function frameCamera() {
  camera.up.set(0,1,0);let dir=new THREE.Vector3(.85,.6,1).normalize(),names=null;
  if(state.view==='wiring'){dir.set(0,-1,.001);camera.up.set(0,0,-1);}
  else if(state.view==='hinge'){names=Object.keys(pivots).filter(n=>n.startsWith('hinge_'+(Q.get('side')==='right'?'right':'left')+'_'));dir.set(.55,.45,1).normalize();}
  else if(state.view==='screen'){names=['display_panel'];dir.set(0,-1,0).applyQuaternion(hingeGroup.quaternion);}
  else if(Q.get('cam')==='top')dir.set(0,1,.001).normalize();
  else if(Q.get('cam')==='front')dir.set(0,.08,1).normalize();
  const fit=fitDistance(modelBounds(names),dir);placeCamera(fit.center,dir,fit.distance);
}

function select(canon) {
  renderRequired = true;
  state.selected = canon;
  const info = canon && parts_map.parts[canon];
  document.getElementById("info").style.display = info ? "block" : "none";
  if (info) {
    document.getElementById("infoName").textContent = info.zh;
    document.getElementById("infoGroup").textContent = GROUP_ZH[info.group] || info.group;
    document.getElementById("infoDesc").textContent = info.desc;
    document.getElementById("infoTris").textContent = info.tris.toLocaleString() + " 三角面 · " + canon;
  }
  for (const [k, mm] of Object.entries(mats)) {
    if (k === "display_panel" && state.power) continue;
    for (const m of mm) {
      if (k === canon) m.emissive.setHex(0x2f6fed).multiplyScalar(0.55);
      else if (k !== "display_panel" && k !== "oled_board" && k !== "oled_screen") m.emissive.setHex(0x000000);
    }
  }
}

function applyFilter() {
  renderRequired = true;
  for (const [canon, mm] of Object.entries(mats)) {
    const g = parts_map.parts[canon].group;
    const off = state.filter && g !== state.filter;
    for (const m of mm) { const glass = canon === "case_bottom"; m.transparent = !!off || glass; m.opacity = off ? 0.08 : glass ? 0.28 : 1; m.depthWrite = !off && !glass; }
  }
  document.querySelectorAll("#groups .chip").forEach(ch => ch.classList.toggle("on", ch.dataset.g === state.filter));
}

function applyPower() {
  const pm = mats["display_panel"]?.[0];
  if (pm) {
    pm.emissive.setHex(state.power ? 0xffffff : 0x000000);
    pm.emissiveIntensity = state.power ? 1.05 : 0;
    // 关机时基础色也压黑：液晶屏无背光时只显暗面，贴图不应再被环境光照亮
    pm.color.setHex(state.power ? 0x404040 : 0x010101);
  }
}

function setPower(on) {
  renderRequired = true;
  state.power = on;
  document.getElementById("power").classList.toggle("on", on);
  document.getElementById("power").textContent=on?'关机':'开机';
  document.getElementById("powerDot").classList.toggle('on',on);
  document.getElementById("powerStatus").textContent=on?'Kimi 已就绪':'已关机';
  applyPower();
}

function applyOled() {
  const k = state.power ? 1 : 0;
  const om = mats["oled_board"]?.[0];
  if (om) {
    om.emissive.setHex(0x37d67a);
    om.emissiveIntensity = 1.6 * k;
  }
  const osm = mats["oled_screen"]?.[0];
  if (osm) {
    osm.emissive.setHex(0xffffff);
    osm.emissiveIntensity = 1.8 * k;
    // OLED 关机转纯黑，开机恢复贴图亮度
    osm.color.setHex(state.power ? 0xdddddd : 0x000000);
  }
}

const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const dt = clock.getDelta();

  if (anim.active) {
    if (anim.playing) anim.t = Math.min(animator.duration,anim.t + Math.min(dt,.1) * state.speed);
    if (anim.t >= animator.duration && anim.playing) { applyAssembly(animator.duration); finishAssembly(); }
    else applyAssembly(anim.t);
  }
  // 屏幕/OLED 动画
  applyPower();
  applyOled();
  controls.update();
  if (renderRequired) { renderer.render(scene, camera); renderRequired = false; }
}

// 加载
const draco = new DRACOLoader().setDecoderPath("./vendor/three/addons/libs/draco/gltf/");
const loader = new GLTFLoader().setDRACOLoader(draco);

const [mapJson, hardwareData, cableData, reliefData] = await Promise.all(["./parts_map.json?v=20260914-hinge-slot", "./hardware.json?v=20260914-hinge-slot", "./cable_routes.json?v=20260914-hinge-slot", "./case_reliefs.json?v=20260914-hinge-slot"].map(url => fetch(url).then(r => { if (!r.ok) throw Error("Load failed: " + url); return r.json(); })));
const gltf = await loader.loadAsync("./" + (mapJson.meta.glb || "skeleton.glb") + "?v=20260914-hinge-slot");
parts_map = mapJson;

const meshes = {};
gltf.scene.updateMatrixWorld(true);
for (const [canon, info] of Object.entries(parts_map.parts)) {
  let node = gltf.scene.getObjectByName(canon);
  if (!node) { console.warn("missing node", canon); continue; }
  const relief=reliefData.parts.find(p=>p.name===canon);
  if(relief){
    let material;node.traverse(o=>{if(o.isMesh&&!material)material=o.material;});
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(relief.positions,3));geometry.setIndex(relief.indices);geometry.computeVertexNormals();
    node.removeFromParent();node=new THREE.Mesh(geometry,material);node.name=canon;gltf.scene.add(node);gltf.scene.updateMatrixWorld(true);
  }
  const under = [];
  node.traverse(o => { if (o.isMesh) { o.userData.canon = canon; under.push(o); } });
  const cloned = under.map(o => { const m = o.material.clone(); o.material = m; return m; });
  mats[canon] = cloned;
  // 以 GLB 实测包围盒中心为 pivot（对节点 TRS 与烘焙几何都稳健）
  const wc = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
  const wp = node.getWorldPosition(new THREE.Vector3());
  const pivot = new THREE.Group();
  pivot.position.copy(wc);
  pivot.add(node);
  node.position.copy(wp).sub(wc);
  pivot.userData.canon = canon;
  pivot.userData.base = wc.clone();
  scene.add(pivot);
  pivots[canon] = pivot;
}

addHardware(hardwareData, scene, pivots, mats, parts_map);

// Rigid lid assembly; all geometry in the GLB is already in its assembled closed pose.
const LID = Object.entries(parts_map.parts).filter(([, info]) => info.lid).map(([name]) => name);
const h = parts_map.meta.lid_hinge;
const HINGE_POS = new THREE.Vector3(h[0], h[2], -h[1]);
const hingeGroup = new THREE.Group();
hingeGroup.position.copy(HINGE_POS);
scene.add(hingeGroup);
for (const c of LID) {
  const p = pivots[c];
  hingeGroup.add(p);
  p.userData.base.sub(HINGE_POS);
  p.position.copy(p.userData.base);
}
function applyLid() {
  renderRequired = true;
  hingeGroup.rotation.x = -state.lid * Math.PI / 180;
  document.getElementById("lid").value = state.lid;
  document.getElementById("lidVal").textContent = Math.round(state.lid) + "°";
  cableRig?.update();
}
function setLid(v) { if(state.lid!==v){state.lid = v; applyLid();} }

cableRig = createCableRig(cableData, scene, pivots, mats, parts_map);
explosionPlan = buildExplosionPlan(parts_map.parts);

// 组装动画：从 100% 展开姿态按总成时序飞入装配，最后合盖→开盖→开机
const animator = createAssemblyAnimator({
  parts: parts_map.parts, plan: explosionPlan, pivots, mats,
  hingeGroup, hingePos: HINGE_POS, cableRig, setLid, setPower,
});
const anim = {active: false, playing: false, t: 0};
let camOrbit=null;
function syncPlayback() {
  document.getElementById('play').disabled=!anim.active;
  document.getElementById('play').textContent=anim.playing?'暂停':'继续';
  document.getElementById('play').classList.toggle('on',anim.playing);
  document.getElementById('assemble').textContent=anim.active||anim.t>0?'重新播放':'播放组装';
}
function setControlsEnabled(on) {
  for(const id of ['explode','lid','structureStep','componentStep','power','clearFilter'])document.getElementById(id).disabled=!on;
  document.querySelectorAll('#groups button').forEach(b=>b.disabled=!on);
  controls.enabled=on;
}
function animationDirection(t) {
  return new THREE.Vector3(.8,.58,1).normalize().applyAxisAngle(new THREE.Vector3(0,1,0),t*-.15);
}
function buildAnimationFrames() {
  camera.up.set(0,1,0);
  return [0,1.8,3.6,5.5,7.2,8.6,9.6].map(t=>{
    animator.apply(t);const box=modelBounds();const fit=fitDistance(box,animationDirection(t),1.18);
    return {t,...fit};
  });
}
function applyAssembly(t) {
  animator.apply(t);state.t=t;
  if(camOrbit){
    let i=camOrbit.findIndex(k=>k.t>=t);if(i<1)i=1;
    const a=camOrbit[i-1],b=camOrbit[i],f=THREE.MathUtils.clamp((t-a.t)/(b.t-a.t),0,1),u=f*f*(3-2*f);
    const center=a.center.clone().lerp(b.center,u),distance=THREE.MathUtils.lerp(a.distance,b.distance,u);
    placeCamera(center,animationDirection(t),distance);
  }
  if(t>animator.firstCableT)cableRig.update();
  document.getElementById('assembleProg').textContent=t.toFixed(1)+' / '+animator.duration.toFixed(1)+' 秒';
  document.getElementById('timeline').value=t;
  document.getElementById('stageLabel').textContent='按装配顺序归位中';
  renderRequired=true;
}
function restoreVisibility() {
  for(const [name,p] of Object.entries(pivots))if(!parts_map.parts[name].dynamicCable)p.visible=true;
}
function startAssembly(t0=0,autoplay=true) {
  anim.active=true;anim.playing=autoplay;anim.t=THREE.MathUtils.clamp(Number.isFinite(t0)?t0:0,0,animator.duration);
  controls.enableDamping=false;controls.update();state.filter=null;state.view='whole';restoreVisibility();applyFilter();select(null);setControlsEnabled(false);
  document.querySelectorAll('.topbar nav button').forEach(b=>b.classList.toggle('active',b.id==='viewWhole'));
  camOrbit=buildAnimationFrames();applyAssembly(anim.t);syncPlayback();
}
function finishAssembly() {
  animator.apply(animator.duration);anim.active=false;anim.playing=false;anim.t=animator.duration;
  camOrbit=null;controls.enableDamping=true;setControlsEnabled(true);state.lid=110;applyLid();setPower(true);state.explode=0;applyExplode();
  for(const e of cableRig.entries)e.group.visible=true;
  applyFilter();document.getElementById('assembleProg').textContent='组装完成 · Kimi 已就绪';
  document.getElementById('timeline').value=animator.duration;syncPlayback();
}
function switchView(view) {
  if(anim.active)finishAssembly();state.view=view;state.filter=view==='wiring'?'cables':null;
  restoreVisibility();state.explode=0;applyExplode();state.lid=110;applyLid();select(null);
  if(view==='wiring'){pivots.case_bottom.visible=false;for(const n of LID)pivots[n].visible=false;}
  if(view==='screen')setPower(true);
  applyFilter();frameCamera();
  for(const [id,v] of Object.entries({viewWhole:'whole',viewWiring:'wiring',viewHinge:'hinge',viewScreen:'screen'}))document.getElementById(id).classList.toggle('active',v===view);
}

// 子系统筛选
const groupsBox = document.getElementById("groups");
const allGroups = [...new Set(Object.values(parts_map.parts).map(p => p.group))];
for (const g of allGroups) {
  const b = document.createElement("button");
  b.className = "chip"; b.dataset.g = g; b.textContent = GROUP_ZH[g] || g;
  b.onclick = () => { state.filter = state.filter === g ? null : g; applyFilter(); };
  groupsBox.appendChild(b);
}

// 贴图
const texLoader = new THREE.TextureLoader();
const texSRGB = p => { const t = texLoader.load(p, () => { renderRequired = true; }); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return t; };
const texDesktop = createKimiScreen();
const texOled = texSRGB("./textures/oled.png");
const texBrush = texLoader.load("./textures/brushed.png", () => { renderRequired = true; });
texBrush.wrapS = texBrush.wrapT = THREE.RepeatWrapping;
{
  const pm = mats["display_panel"]?.[0];
  if (pm) { pm.roughness=1;pm.metalness=0;pm.envMapIntensity=0; pm.map = texDesktop; pm.emissiveMap = texDesktop; pm.color.setHex(0xffffff); pm.needsUpdate = true; }
  const osm = mats["oled_screen"]?.[0];
  if (osm) { osm.map = texOled; osm.emissiveMap = texOled; osm.color.setHex(0xdddddd); osm.needsUpdate = true; }
  for (const [canon, info] of Object.entries(parts_map.parts)) {
    if (info.matClass === "alu" && mats[canon]) {
      for (const m of mats[canon]) {
        m.bumpMap = texBrush; m.bumpScale = 0.05;
        m.roughnessMap = texBrush;
        m.roughness = Math.max(m.roughness, 0.65);
        m.metalness = 0.9;
        m.envMapIntensity = 0.15;
        m.needsUpdate = true;
      }
    }
  }
}
// 键帽字符：每个键帽独立对中——键帽中心映射到图集对应字符块中心，UV 固化在顶点属性上，爆炸时随键帽移动
{
  const texKeys = texSRGB("./textures/keycaps_us.png");
  const keycapRows = groupKeycaps(parts_map);
  const w = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  for (const [canon, info] of Object.entries(parts_map.parts)) {
    if (info.matClass !== "keycap") continue;
    const pivot = pivots[canon];
    if (!pivot) continue;
    const [lcx, lcy] = matchLegend(keycapRows, canon, info.center);
    const kcx = info.center[0], kcz = info.center[2];
    pivot.updateMatrixWorld(true);
    pivot.traverse(o => {
      if (!o.isMesh) return;
      o.geometry = o.geometry.clone();
      const pos = o.geometry.attributes.position;
      const uv = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        w.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        uv[i * 2] = (lcx + (w.x - kcx) * LEGEND_SCALE) / 3000;
        uv[i * 2 + 1] = (lcy + (w.z - kcz) * LEGEND_SCALE) / 2122;
      }
      o.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    });
    for (const m of mats[canon] || []) { m.map = texKeys; m.color.setHex(0xffffff); m.needsUpdate = true; }
  }
}

// 事件
document.getElementById("explode").oninput = e => { state.explode = e.target.value / 100; applyExplode(); frameCamera(); };
document.getElementById("structureStep").onclick = () => { state.explode = .5; applyExplode(); frameCamera(); };
document.getElementById("componentStep").onclick = () => { state.explode = 1; applyExplode(); frameCamera(); };
document.getElementById("lid").oninput = e => { state.lid = +e.target.value; applyLid(); };
document.getElementById("power").onclick = () => setPower(!state.power);
document.getElementById('play').onclick=()=>{if(anim.active){anim.playing=!anim.playing;syncPlayback();}};
document.getElementById('assemble').onclick=()=>startAssembly(0,true);
document.getElementById('timeline').oninput=e=>{const t=+e.target.value;if(!anim.active)startAssembly(t,false);else{anim.t=t;anim.playing=false;applyAssembly(t);syncPlayback();}};
for(const [id,view] of Object.entries({viewWhole:'whole',viewWiring:'wiring',viewHinge:'hinge',viewScreen:'screen'}))document.getElementById(id).onclick=()=>switchView(view);
document.getElementById('reset').onclick=()=>{if(anim.active)applyAssembly(anim.t);else frameCamera();};
document.getElementById('clearFilter').onclick=()=>{state.filter=null;applyFilter();};
document.getElementById('closeInfo').onclick=()=>select(null);
const SPEEDS = [.25,.5,1,2];
document.getElementById("speed").onclick = e => {
  state.speed = SPEEDS[(SPEEDS.indexOf(state.speed) + 1) % SPEEDS.length];
  e.target.textContent = state.speed + "×";
};

let downAt = null;
renderer.domElement.addEventListener("pointerdown", e => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener("pointerup", e => {
  if (anim.active || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return;
  const r = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, camera);
  const hit = rc.intersectObjects(Object.entries(pivots).filter(([name,p])=>p.visible&&(!state.filter||parts_map.parts[name].group===state.filter)).map(([,p])=>p), true)[0];
  select(hit ? hit.object.userData.canon : null);
});

addEventListener("resize", () => {
  renderRequired = true;
  camera.aspect = app.clientWidth / app.clientHeight; camera.updateProjectionMatrix();
  renderer.setSize(app.clientWidth, app.clientHeight);
  if(anim.active){camOrbit=buildAnimationFrames();applyAssembly(anim.t);}else frameCamera();
});

// 初始状态 + URL 参数
const hideList = (Q.get("hide") || "").split(",").filter(Boolean);
for (const h of hideList) if (pivots[h]) pivots[h].visible = false;
if (Q.get("cam") === "bottom") for (const c of LID) pivots[c].visible = false;
document.getElementById("lid").value = state.lid;
syncPlayback();
applyLid();
applyExplode();
setPower(state.power);
applyFilter();
if (state.selected) select(state.selected);
if(Q.get('view'))switchView(state.view);else frameCamera();
document.getElementById('partCount').textContent=Object.keys(parts_map.parts).length;
document.getElementById('loading').style.display='none';
if (Q.has("assemble")) startAssembly(parseFloat(Q.get("at") || "0"), Q.get("pause") !== "1" && !Q.has("at"));
tick();

// 自检钩子
window.__THREE = THREE;
window.__app = {
  state, pivots, mats, parts_map, scene, camera, controls, renderer, hingeGroup, frameCamera, switchView,
  explosionPlan, cableRig, assemblies: ASSEMBLIES,
  setLid: v => { state.lid = v; applyLid(); },
  setExplode: v => { state.explode = v; applyExplode(); },
  setPower, setT: t => { state.t = t; applyOled(); }, select,
  assembly: {
    get t() { return anim.t; },
    get active() { return anim.active; },
    get playing() { return anim.playing; },
    duration: animator.duration,
    timing: Object.fromEntries(Object.entries(animator.timing).map(([k, v]) => [k, {assembly: v.assembly, start: v.start, dur: v.dur, off: v.off.toArray()}])),
    cables: animator.cableTiming,
    lidOpen: animator.lidOpen, powerOn: animator.powerOn,
    setT: v => { if (!anim.active) startAssembly(v, false); else { anim.t = v; anim.playing = false; applyAssembly(v);syncPlayback(); } },
    start: () => startAssembly(0, true),
    stop: () => finishAssembly(),
  },
  emissiveOf: canon => mats[canon]?.[0] ? { hex: mats[canon][0].emissive.getHex(), i: mats[canon][0].emissiveIntensity } : null,
  positions: () => Object.fromEntries(Object.entries(pivots).map(([k, p]) => [k, p.position.toArray()])),
};
console.log("APP_READY");

// Explicit diagnostic page only; the normal viewer does not expose test controls.
if (Q.get('qa') === '1') {
  const checks = await import('./assembly_checks.js');
  window.runAssemblyChecks = () => checks.checkStagedAssembly();
  window.exportSupplementGeometry = () => checks.supplementGeometry();
  const {mountRefineChecks}=await import('./refine_checks.js');mountRefineChecks();
}
