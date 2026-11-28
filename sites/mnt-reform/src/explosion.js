import * as THREE from 'three';

export const ASSEMBLIES = {
  chassis: {zh:'主壳体', offset:[0,0,0], anchor:'case_mainbox'},
  bezel: {zh:'键盘面框', offset:[0,108,0], anchor:'case_bezel'},
  keyboard: {zh:'键盘总成', offset:[0,66,0], anchor:'kbd_board'},
  oled: {zh:'OLED 总成', offset:[0,88,0], anchor:'oled_board'},
  trackball: {zh:'轨迹球总成', offset:[0,40,12], anchor:'trackball_board'},
  motherboard: {zh:'主板与计算模块', offset:[0,-45,0], anchor:'mb_board'},
  battery_left: {zh:'左电池组', offset:[-34,-38,28], anchor:'battery_board'},
  battery_right: {zh:'右电池组', offset:[34,-38,28], anchor:'battery2_board'},
  bottom: {zh:'底盖', offset:[0,-105,0], anchor:'case_bottom'},
  screen: {zh:'屏幕与转轴', offset:[0,138,-18], anchor:'screen_back'},
};
const clamp = v => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
export function explosionStages(progress) {
  const value = clamp(progress);
  return {value, structure: clamp(value * 2), components: clamp(value * 2 - 1)};
}
function assemblyOf(name, info) {
  if (info.assembly) return info.assembly;
  if (info.lid) return 'screen';
  if (info.group === 'screen') return 'oled';
  if (info.group === 'keyboard') return 'keyboard';
  if (info.group === 'motherboard') return 'motherboard';
  if (info.group === 'input') return 'trackball';
  if (info.group === 'battery') return name === 'battery2_board' || info.parent === 'battery2_board' ? 'battery_right' : 'battery_left';
  if (name === 'case_bottom' || name.startsWith('foot_')) return 'bottom';
  return name === 'case_bezel' ? 'bezel' : 'chassis';
}
export function buildExplosionPlan(parts) {
  const plan = {};
  for (const [name, info] of Object.entries(parts)) {
    if (info.dynamicCable) continue;
    const assembly = assemblyOf(name, info), def = ASSEMBLIES[assembly];
    if (!def) throw Error('Unknown assembly: ' + assembly);
    const coarse = new THREE.Vector3(...def.offset);
    let detail = new THREE.Vector3();
    if (info.detailOffset) detail.set(...info.detailOffset);
    else if (info.lid) detail.y = -(info.explodeRank - parts.screen_back.explodeRank) * 52;
    else if (name.startsWith('port_cover_')) detail.x = name.endsWith('left') ? -24 : 24;
    else if (name.startsWith('foot_')) detail.y = -10;
    else if (name === 'oled_screen') detail.y = 8;
    else if (info.matClass === 'cell') detail.y = -42;
    else if (info.matClass === 'som') detail.y = -30;
    else if (info.matClass === 'keycap') detail.y = 30;
    else if (name === 'trackball_cup') detail.y = 12;
    else if (name === 'trackball_ball') detail.y = 34;
    else if (name === 'trackball_lid') detail.y = 54;
    else if (name.startsWith('trackball_button_')) detail.y = 36;
    else {
      // Copper and silk are bonded to their PCB. Components detach only in stage two.
      const baseRank = parts[def.anchor].explodeRank;
      detail.y = (info.explodeRank - baseRank) * 40 + (info.compRank || 0) * 44;
    }
    plan[name] = {assembly, coarse, detail};
  }
  return plan;
}
