/* Moonshot EV-7 — 常量、球面参数化与面窗开口的超椭圆定义 */
(function(){
"use strict";
const __E=window.EV7=window.EV7||{};

/* ---------------------------------------------------------------- 基本量 */
const TAU=Math.PI*2, DEG=Math.PI/180;
const R=0.50, YS=1.07;                 // 壳体半径 / 纵向比例（1 单位 ≈ 320 mm）
const AX=1.06, AY=0.72, AYC=-0.06, NP=2.6;  // 面窗开口：超椭圆半角
const T_SHELL=0.016;                   // 壳体壁厚
const F_HOLE=1.10;                     // 壳体开孔边界（以开口参数计）
const VN=2.36;                         // 壳体下缘极角
const VO=0.0320, VI=0.0210;            // 面罩外/内表面法向偏移
const LIFT=52*DEG;

const clamp=(x,a,b)=>x<a?a:(x>b?b:x);
const lerp=(a,b,t)=>a+(b-a)*t;
const damp=(a,b,l,dt)=>lerp(a,b,1-Math.exp(-l*dt));
const easeIO=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;

function sDir(u,v){const s=Math.sin(v);return [s*Math.sin(u),Math.cos(v),s*Math.cos(u)];}
function sPos(d,off){const r=R+off;return [d[0]*r, d[1]*r*YS, d[2]*r];}
function sNor(d){let x=d[0]/R,y=d[1]/(R*YS),z=d[2]/R;const l=Math.hypot(x,y,z)||1;return [x/l,y/l,z/l];}
function apF(d){
  const ay=Math.asin(clamp(d[1],-1,1)), ax=Math.atan2(d[0],d[2]);
  const u=Math.abs(ax/AX), w=Math.abs((ay-AYC)/AY);
  return Math.pow(Math.pow(u,NP)+Math.pow(w,NP),1/NP);
}
function apPoint(t,f){                 // 开口参数 → 单位方向（精确落在 f 等值线上）
  const c=Math.cos(t), s=Math.sin(t);
  const k=Math.pow(Math.pow(Math.abs(c),NP)+Math.pow(Math.abs(s),NP),1/NP)||1;
  const ax=AX*f*c/k, ay=AYC+AY*f*s/k, cy=Math.cos(ay);
  return [Math.sin(ax)*cy, Math.sin(ay), Math.cos(ax)*cy];
}

Object.assign(__E,{TAU, DEG, R, YS, AX, AY, AYC, NP, T_SHELL, F_HOLE, VN, VO, VI, LIFT, clamp, lerp, damp, easeIO, sDir, sPos, sNor, apF, apPoint});
})();
