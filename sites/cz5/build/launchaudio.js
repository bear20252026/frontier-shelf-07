// 发射音效引擎 — 全程序化 Web Audio 合成（零音频素材、零外部文件）
// 设计：点火爆鸣（碎噪）→ 棕噪主轰鸣（低通随高度拉开）→ 分离三次闷响 → 高空衰减成远处嘶声
// 全部由 launchT 驱动（每帧 update(t) 设置增益/滤波包络），与画面同一时间轴。
import * as THREE from 'three'; // 仅用其 MathUtils.clamp

const { clamp } = THREE.MathUtils;

// 棕噪声循环缓冲（种子固定 → 各浏览器一致；尾部交叉淡化无缝循环）
function makeBrownNoiseBuffer(ctx, seconds = 5, seed = 20260830) {
  let a = seed;
  const rand = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const sr = ctx.sampleRate, n = Math.floor(seconds * sr);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = rand() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.2;
  }
  const fade = Math.floor(sr * 0.25); // 尾→头交叉淡化，循环无咔哒
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[i] = d[i] * k + d[n - fade + i] * (1 - k);
  }
  return buf;
}

function makeWhiteNoiseBuffer(ctx, seconds = 2, seed = 777) {
  let a = seed;
  const rand = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const sr = ctx.sampleRate, n = Math.floor(seconds * sr);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = rand() * 2 - 1;
  return buf;
}

// 包络辅助
const ramp = (x, d = 1) => clamp(x / d, 0, 1);
const pulse = (t, t0, a, b) => ramp(t - t0, a) * (1 - ramp(t - (t0 + a), b)); // 上升 a 秒、下降 b 秒

export function createLaunchAudio() {
  let ctx = null, master = null, comp = null;
  let roarSrc = null, crackleSrc = null;
  let roarLow = null, roarGain = null, crackleHigh = null, crackleGain = null, subOsc = null, subGain = null;
  let started = false, muted = false, t0 = 0;

  function ensureCtx() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 22; comp.ratio.value = 8;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(comp).connect(ctx.destination);

    // 主轰鸣：棕噪 → 低通 → 增益
    roarSrc = ctx.createBufferSource();
    roarSrc.buffer = makeBrownNoiseBuffer(ctx);
    roarSrc.loop = true;
    roarLow = ctx.createBiquadFilter(); roarLow.type = 'lowpass'; roarLow.frequency.value = 320; roarLow.Q.value = 0.4;
    roarGain = ctx.createGain(); roarGain.gain.value = 0;
    roarSrc.connect(roarLow).connect(roarGain).connect(master);

    // 点火碎噪：白噪 → 高通 → 增益（短促爆发）
    crackleSrc = ctx.createBufferSource();
    crackleSrc.buffer = makeWhiteNoiseBuffer(ctx);
    crackleSrc.loop = true;
    crackleHigh = ctx.createBiquadFilter(); crackleHigh.type = 'highpass'; crackleHigh.frequency.value = 1800;
    crackleGain = ctx.createGain(); crackleGain.gain.value = 0;
    crackleSrc.connect(crackleHigh).connect(crackleGain).connect(master);

    // 次低频托底（体感低频，随轰鸣）
    subOsc = ctx.createOscillator(); subOsc.type = 'sine'; subOsc.frequency.value = 46;
    subGain = ctx.createGain(); subGain.gain.value = 0;
    subOsc.connect(subGain).connect(master);
  }

  // 分离闷响：噪声短促 + 正弦下坠（一次性调度）
  function thump(when, level = 1) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, when);
    o.frequency.exponentialRampToValueAtTime(38, when + 0.35);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, when);
    og.gain.exponentialRampToValueAtTime(0.5 * level, when + 0.02);
    og.gain.exponentialRampToValueAtTime(0.0001, when + 0.5);
    o.connect(og).connect(master);
    const n = ctx.createBufferSource(); n.buffer = crackleSrc.buffer;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 700; nf.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, when);
    ng.gain.exponentialRampToValueAtTime(0.35 * level, when + 0.015);
    ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.4);
    n.connect(nf).connect(ng).connect(master);
    o.start(when); o.stop(when + 0.6);
    n.start(when); n.stop(when + 0.5);
  }

  return {
    /** 点火按钮按下（用户手势内调用，满足 autoplay 策略） */
    start(launchT0, milestones) {
      ensureCtx();
      if (ctx.state === 'suspended') ctx.resume();
      if (!started) {
        started = true;
        t0 = ctx.currentTime - launchT0;
        roarSrc.start();
        crackleSrc.start();
        subOsc.start();
        // 三次分离闷响按里程碑一次性排程
        thump(t0 + milestones.T_BSEP, 1.0);
        thump(t0 + milestones.T_FAIRING, 0.55);
        thump(t0 + milestones.T_S1SEP, 0.85);
      }
    },
    /** 每帧驱动包络：t = 序列时间（秒） */
    update(t) {
      if (!started || !ctx) return;
      const ct = ctx.currentTime;
      const T = 3, L = 4.6, B = 13, S1 = 19; // 与 LAUNCH 常量一致
      // 倒计时阶段：极低环境底噪
      const pre = 0.015 * (1 - ramp(t - T, 0.4));
      // 点火爆鸣：t=3 起 1.4s 衰减的碎噪
      const crk = 0.85 * pulse(t - T, 0.06, 1.35);
      // 主轰鸣：点火 1.1s 建立，离台后滤波拉开；助推器分离后功率微降；芯一级分离后快速远去
      const build = ramp(t - T, 1.1);
      const pCut = 1 - 0.22 * pulse(t - B, 0.15, 1.2);
      const far = 1 - 0.82 * ramp(t - S1, 2.2);
      const flick = 1 + 0.06 * Math.sin(t * 23.7) + 0.04 * Math.sin(t * 41.3 + 1.1); // 火焰闪烁（确定性）
      const roar = clamp(pre + build * pCut * far * flick, 0, 1.15);
      const lpFreq = 320 + 2100 * ramp(t - L, 6) - 1900 * ramp(t - S1, 2.5);
      roarGain.gain.setTargetAtTime(0.9 * roar, ct, 0.06);
      roarLow.frequency.setTargetAtTime(clamp(lpFreq, 220, 2600), ct, 0.12);
      crackleGain.gain.setTargetAtTime(crk, ct, 0.03);
      subGain.gain.setTargetAtTime(0.22 * build * far, ct, 0.1);
    },
    /** 重置/切板块：快速淡出并挂起 */
    stop() {
      if (!ctx || !started) return;
      const c = ctx, rs = roarSrc, cs = crackleSrc, so = subOsc, mg = master;
      mg.gain.setTargetAtTime(0, c.currentTime, 0.08);
      started = false;
      setTimeout(() => {
        try { rs.stop(); cs.stop(); so.stop(); } catch (e) { /* 已停 */ }
        c.close();
        if (ctx === c) ctx = null;
      }, 350);
    },
    setMuted(m) {
      muted = m;
      if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.05);
    },
    get muted() { return muted; },
    get running() { return started; },
  };
}
