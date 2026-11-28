import * as THREE from 'three';
import {ASSEMBLIES} from './explosion.js?v=20260914-stages-b';

const clamp01 = v => Math.max(0, Math.min(1, v));
const easeOutCubic = x => 1 - Math.pow(1 - x, 3);
const easeInOutCubic = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

// 总装顺序按 DIY 手册关系：主壳体 → 主板 → 左右电池 → 键盘 → 轨迹球 → OLED → 面框 → 屏幕与转轴 → 底盖
const ASSEMBLY_START = {
  chassis: 0, motherboard: .9, battery_left: 1.8, battery_right: 1.8,
  keyboard: 2.7, trackball: 3.6, oled: 4.1, bezel: 4.7, screen: 5.5, bottom: 6.4,
};
const FLY_WINDOW = {keyboard: 1.3, motherboard: 1.2}; // 键帽雨、主板元件波需要更长的错落窗口
const DEFAULT_WINDOW = .9;
const PART_DUR = .55;
const CABLE_FADE = .6;
const LID_OPEN = {start: 7.2, dur: 1.4, to: 110};
const POWER_ON = 8.8;

export function createAssemblyAnimator({parts, plan, pivots, mats, hingeGroup, hingePos, cableRig, setLid, setPower}) {
  const byAssembly = {};
  for (const [name, info] of Object.entries(parts)) {
    if (info.dynamicCable) continue;
    const entry = plan[name];
    if (!entry) continue;
    (byAssembly[entry.assembly] ||= []).push([name, info]);
  }
  const timing = {};
  for (const [assembly, list] of Object.entries(byAssembly)) {
    // 每总成内按展开层级排序：锚件/PCB 先落位，元件随后（键帽形成下落波）
    list.sort((a, b) => (a[1].explodeRank - b[1].explodeRank) || ((a[1].compRank || 0) - (b[1].compRank || 0)));
    const n = list.length, win = FLY_WINDOW[assembly] ?? DEFAULT_WINDOW, t0 = ASSEMBLY_START[assembly] ?? 0;
    list.forEach(([name, info], i) => {
      const entry = plan[name];
      // 屏幕侧零件的结构层偏移由转轴组承担，这里只保留 detail 层
      const off = info.lid ? entry.detail.clone() : entry.coarse.clone().add(entry.detail);
      timing[name] = {assembly, start: t0 + (n === 1 ? 0 : i / (n - 1) * win), dur: PART_DUR, off};
    });
  }
  const cableTiming = cableRig.entries.map(e => {
    let land = 0;
    for (const a of e.anchors) { const tm = timing[a.part]; if (tm) land = Math.max(land, tm.start + tm.dur); }
    return {entry: e, appear: land + .15};
  });
  const firstCableT = Math.min(...cableTiming.map(c => c.appear));
  const screenOff = new THREE.Vector3(...ASSEMBLIES.screen.offset);
  const hingeTm = timing['screen_back'] || {start: ASSEMBLY_START.screen, dur: PART_DUR};
  const duration = Math.max(POWER_ON + .8, LID_OPEN.start + LID_OPEN.dur + .4);


  function apply(t) {
    const eHinge = 1 - easeOutCubic(clamp01((t - hingeTm.start) / hingeTm.dur));
    hingeGroup.position.copy(hingePos).addScaledVector(screenOff, eHinge);
    for (const [name, tm] of Object.entries(timing)) {
      const p = pivots[name];
      if (!p) continue;
      const e = 1 - easeOutCubic(clamp01((t - tm.start) / tm.dur));
      p.position.copy(p.userData.base).addScaledVector(tm.off, e);
    }
    const lid = t <= LID_OPEN.start ? 0 : t >= LID_OPEN.start + LID_OPEN.dur ? LID_OPEN.to : LID_OPEN.to * easeInOutCubic((t - LID_OPEN.start) / LID_OPEN.dur);
    setLid(lid);
    setPower(t >= POWER_ON);
    for (const {entry, appear} of cableTiming) {
      const op = clamp01((t - appear) / CABLE_FADE);
      entry.group.visible = op > .001;
      for (const m of mats[entry.spec.name]) { m.transparent = true; m.opacity = op; }
    }
  }
  return {
    apply, duration, firstCableT, timing,
    lidOpen: LID_OPEN, powerOn: POWER_ON, cableFade: CABLE_FADE,
    cableTiming: cableTiming.map(c => ({name: c.entry.spec.name, appear: c.appear})),
  };
}
