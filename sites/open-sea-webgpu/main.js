// OPEN SEA — realtime ocean rendered with Three.js WebGPU + TSL node shaders.
// Ocean: summed Gerstner waves for the swell, FBM gradient noise for the
// micro-surface, fresnel sky reflection, sun specular + glitter, crest foam.
// Sky: analytic gradient dome with sun disk, glow and a drifting cloud band.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import {
  Fn, pass, uniform, float, vec2, vec3, vec4,
  sin, cos, dot, cross, normalize, mix, pow, max, clamp,
  fract, floor, smoothstep, distance, reflect,
  positionLocal, positionWorld, cameraPosition
} from 'three/tsl';

const loader = document.getElementById('loader');
const loaderMsg = document.getElementById('loader-msg');

boot();

async function boot() {
  if (!navigator.gpu) {
    return showError('WEBGPU UNAVAILABLE', [
      'This experience needs a WebGPU-capable browser.',
      'Use Chrome or Edge 113+ on desktop.',
      'On macOS: update Chrome — WebGPU ships enabled by default.'
    ]);
  }

  try {
    await init();
  } catch (err) {
    console.error(err);
    showError('INITIALIZATION FAILED', [
      String(err && err.message ? err.message : err),
      'Try a recent Chrome or Edge with hardware acceleration enabled.'
    ]);
  }
}

async function init() {
  // ---------------------------------------------------------------- uniforms

  const uTime = uniform(0);
  const uSea = uniform(0.925);
  const uSunDir = uniform(new THREE.Vector3(0, 0.4, -1));
  const uSunColor = uniform(new THREE.Color(1, 1, 1));
  const uHorizon = uniform(new THREE.Color(0.5, 0.7, 0.85));
  const uZenith = uniform(new THREE.Color(0.1, 0.25, 0.5));
  const uDeep = uniform(new THREE.Color(0.02, 0.09, 0.11));
  const uShallow = uniform(new THREE.Color(0.06, 0.3, 0.35));

  // ------------------------------------------------------------------- waves
  // Gerstner wave set, constants precomputed on the CPU.

  const WAVE_DEFS = [
    { dir: [1.0, 0.0], length: 60.0, steepness: 0.12 },
    { dir: [0.6, 0.8], length: 31.0, steepness: 0.12 },
    { dir: [-0.7, 0.7], length: 18.0, steepness: 0.09 },
    { dir: [0.3, -0.95], length: 9.5, steepness: 0.07 },
    { dir: [-0.35, -0.94], length: 5.0, steepness: 0.05 }
  ];

  const WAVES = WAVE_DEFS.map((w) => {
    const inv = 1 / Math.hypot(w.dir[0], w.dir[1]);
    const k = (2 * Math.PI) / w.length;
    return {
      dx: w.dir[0] * inv,
      dz: w.dir[1] * inv,
      k,
      c: Math.sqrt(9.8 * k),
      steep: w.steepness
    };
  });

  // Displaced surface position from the undisturbed grid coordinate.
  const wavePosition = Fn(([xz, time, sea]) => {
    const pos = vec3(xz.x, 0.0, xz.y).toVar();
    for (const w of WAVES) {
      const steep = float(w.steep).mul(sea);
      const a = steep.div(w.k);
      const f = float(w.k).mul(dot(vec2(w.dx, w.dz), xz).sub(time.mul(w.c)));
      pos.assign(pos.add(vec3(
        a.mul(w.dx).mul(cos(f)),
        a.mul(sin(f)),
        a.mul(w.dz).mul(cos(f))
      )));
    }
    return pos;
  });

  // Analytic normal from accumulated tangents / binormals.
  const waveNormal = Fn(([xz, time, sea]) => {
    const tangent = vec3(1.0, 0.0, 0.0).toVar();
    const binormal = vec3(0.0, 0.0, 1.0).toVar();
    for (const w of WAVES) {
      const steep = float(w.steep).mul(sea);
      const f = float(w.k).mul(dot(vec2(w.dx, w.dz), xz).sub(time.mul(w.c)));
      const sF = sin(f);
      const cF = cos(f);
      tangent.assign(tangent.add(vec3(
        float(-w.dx * w.dx).mul(steep).mul(sF),
        float(w.dx).mul(steep).mul(cF),
        float(-w.dx * w.dz).mul(steep).mul(sF)
      )));
      binormal.assign(binormal.add(vec3(
        float(-w.dx * w.dz).mul(steep).mul(sF),
        float(w.dz).mul(steep).mul(cF),
        float(-w.dz * w.dz).mul(steep).mul(sF)
      )));
    }
    return normalize(cross(binormal, tangent));
  });

  // Signed crest height — drives foam and water tint.
  const waveCrest = Fn(([xz, time, sea]) => {
    const h = float(0.0).toVar();
    for (const w of WAVES) {
      const steep = float(w.steep).mul(sea);
      const a = steep.div(w.k);
      const f = float(w.k).mul(dot(vec2(w.dx, w.dz), xz).sub(time.mul(w.c)));
      h.assign(h.add(a.mul(sin(f))));
    }
    return h;
  });

  // -------------------------------------------------------------- noise / fbm

  const hash2 = Fn(([p]) => {
    const k = vec2(
      dot(p, vec2(127.1, 311.7)),
      dot(p, vec2(269.5, 183.3))
    );
    return fract(sin(k).mul(43758.5453)).mul(2.0).sub(1.0);
  });

  const gradNoise = Fn(([p]) => {
    const i = floor(p);
    const f = fract(p);
    const u = f.mul(f).mul(f).mul(f.mul(f.mul(6.0).sub(15.0)).add(10.0));
    const va = dot(hash2(i), f);
    const vb = dot(hash2(i.add(vec2(1.0, 0.0))), f.sub(vec2(1.0, 0.0)));
    const vc = dot(hash2(i.add(vec2(0.0, 1.0))), f.sub(vec2(0.0, 1.0)));
    const vd = dot(hash2(i.add(vec2(1.0, 1.0))), f.sub(vec2(1.0, 1.0)));
    return mix(mix(va, vb, u.x), mix(vc, vd, u.x), u.y);
  });

  const fbm = Fn(([p]) => {
    const a = gradNoise(p);
    const b = gradNoise(p.mul(2.04).add(vec2(17.3, 9.1))).mul(0.5);
    const c = gradNoise(p.mul(4.11).add(vec2(42.7, 28.6))).mul(0.25);
    return a.add(b).add(c);
  });

  // Animated micro-surface height field for detail normals.
  const detailH = Fn(([xz, time]) => {
    const driftA = vec2(time.mul(0.55), time.mul(0.32));
    const driftB = vec2(time.mul(-0.4), time.mul(0.5));
    return fbm(xz.mul(0.85).add(driftA)).add(fbm(xz.mul(2.1).add(driftB)).mul(0.45));
  });

  // --------------------------------------------------------------------- sky
  // Shared analytic sky: gradient + haze + sun glow + disk. Used by the dome
  // and sampled by the water for reflections.

  const skyColor = Fn(([dir]) => {
    const d = normalize(dir);
    const up = clamp(d.y, -0.15, 1.0);
    const grad = pow(max(up, 0.0), 0.42);
    const col = mix(uHorizon, uZenith, grad).toVar();
    // haze below the horizon
    col.assign(mix(col, uDeep.mul(1.4).add(uHorizon.mul(0.25)), smoothstep(0.0, -0.15, d.y)));
    const s = max(dot(d, uSunDir), 0.0);
    // wide atmospheric glow around the sun
    col.assign(col.add(uSunColor.mul(pow(s, 10.0).mul(0.18))));
    // sun disk
    col.assign(col.add(uSunColor.mul(smoothstep(0.9994, 0.9998, s).mul(30.0))));
    return col;
  });

  // ------------------------------------------------------------------ ocean

  const oceanMat = new THREE.MeshBasicNodeMaterial();

  oceanMat.positionNode = wavePosition(positionLocal.xz, uTime, uSea);

  oceanMat.colorNode = Fn(() => {
    const P = positionWorld;
    const xz = P.xz;

    // broad swell normal + finite-difference micro detail
    const N0 = waveNormal(xz, uTime, uSea);
    const e = 0.1;
    const h0 = detailH(xz, uTime);
    const hx = detailH(xz.add(vec2(e, 0.0)), uTime);
    const hz = detailH(xz.add(vec2(0.0, e)), uTime);
    const detailAmp = float(1.5).mul(uSea.mul(0.6).add(0.4));
    const N = normalize(N0.add(vec3(h0.sub(hx), 0.0, h0.sub(hz)).mul(detailAmp)));

    const V = normalize(cameraPosition.sub(P));
    const crest = waveCrest(xz, uTime, uSea);

    // base water body — deeper in the troughs, brighter at the crests
    const base = mix(uDeep, uShallow, clamp(crest.mul(0.35).add(0.45), 0.0, 1.0));

    // fresnel sky reflection (reflection clamped above the horizon)
    const refl = reflect(V.negate(), N);
    const reflDir = normalize(vec3(refl.x, max(refl.y, 0.04), refl.z));
    const sky = skyColor(reflDir);
    const ndv = max(dot(N, V), 0.0);
    const fres = pow(float(1.0).sub(ndv), 5.0).mul(0.98).add(0.02);

    // subsurface glow through backlit crests
    const sss = pow(max(dot(V, uSunDir), 0.0), 3.0).mul(max(crest, 0.0)).mul(0.18);

    const col = mix(base.add(uShallow.mul(uSunColor).mul(sss)), sky, fres).toVar();

    // sun specular — a broad sheen plus noise-modulated glitter
    const H = normalize(uSunDir.add(V));
    const ndh = max(dot(N, H), 0.0);
    const glitter = fbm(xz.mul(2.6).add(vec2(uTime.mul(0.6), uTime.mul(0.35)))).mul(0.5).add(0.5);
    const spec = pow(ndh, 500.0).mul(glitter.mul(3.0).add(0.4)).add(pow(ndh, 48.0).mul(0.12));
    col.assign(col.add(uSunColor.mul(spec)));

    // foam on the highest crests, broken up by noise
    const foamTex = smoothstep(0.5, 0.95, fbm(xz.mul(1.1).add(vec2(uTime.mul(0.22), uTime.mul(0.14)))).mul(0.5).add(0.5));
    const foam = smoothstep(1.0, 2.0, crest).mul(foamTex);
    col.assign(mix(col, vec3(0.82, 0.88, 0.9), foam.mul(0.85)));

    // fade into the horizon haze — hides the edge of the mesh
    const dist = distance(P, cameraPosition);
    const fade = smoothstep(150.0, 290.0, dist);
    col.assign(mix(col, uHorizon, fade));

    return vec4(col, 1.0);
  })();

  const oceanGeo = new THREE.PlaneGeometry(420, 420, 440, 440);
  oceanGeo.rotateX(-Math.PI / 2);
  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.frustumCulled = false;

  // ---------------------------------------------------------------- sky dome

  const skyMat = new THREE.MeshBasicNodeMaterial();
  skyMat.side = THREE.BackSide;
  skyMat.depthWrite = false;

  skyMat.colorNode = Fn(() => {
    const dir = normalize(positionWorld.sub(cameraPosition));
    const col = skyColor(dir).toVar();
    // slow drifting cloud band near the horizon
    const band = smoothstep(0.03, 0.16, dir.y).mul(smoothstep(0.6, 0.22, dir.y));
    const cuv = dir.xz.div(dir.y.add(0.18)).mul(0.55).add(vec2(uTime.mul(0.006), uTime.mul(0.003)));
    const cl = fbm(cuv).mul(0.5).add(0.5);
    const clouds = smoothstep(0.62, 0.95, cl).mul(band);
    const cloudCol = mix(vec3(0.92, 0.9, 0.87), uSunColor.mul(0.5), 0.3);
    col.assign(mix(col, cloudCol, clouds.mul(0.6)));
    return vec4(col, 1.0);
  })();

  const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), skyMat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;

  // -------------------------------------------------------------- scene setup

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070a);
  scene.add(ocean);
  scene.add(sky);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 8000);
  camera.position.set(0, 5.5, 17);

  const renderer = new THREE.WebGPURenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.body.appendChild(renderer.domElement);
  await renderer.init();

  // bloom over the tonemapped chain (applied by PostProcessing at output)
  const postProcessing = new THREE.PostProcessing(renderer);
  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode('output');
  postProcessing.outputNode = sceneColor.add(bloom(sceneColor, 0.4, 0.3, 0.9));

  // ---------------------------------------------------------------- controls

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 4;
  controls.maxDistance = 120;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.target.set(0, 1.5, 0);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.25;
  controls.update();

  // ------------------------------------------------------------- time of day

  const DAY = {
    zenith: [0.07, 0.2, 0.42], horizon: [0.52, 0.68, 0.82],
    sun: [1.0, 0.93, 0.8], sunI: 1.6,
    deep: [0.015, 0.09, 0.11], shallow: [0.06, 0.32, 0.36]
  };
  const DUSK = {
    zenith: [0.03, 0.05, 0.16], horizon: [0.85, 0.36, 0.16],
    sun: [1.0, 0.42, 0.14], sunI: 2.6,
    deep: [0.02, 0.045, 0.075], shallow: [0.09, 0.15, 0.2]
  };

  const lerp3 = (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
  const smooth01 = (lo, hi, x) => {
    const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
  };

  const todVal = document.getElementById('tod-val');
  const TOD_LABELS = [
    [0.12, 'DUSK'], [0.3, 'GOLDEN HOUR'], [0.62, 'AFTERNOON'], [1.01, 'MIDDAY']
  ];

  function updateTimeOfDay(t) {
    const elevation = THREE.MathUtils.lerp(-0.05, 0.62, t);
    const azimuth = THREE.MathUtils.lerp(-0.9, 0.9, t);
    uSunDir.value.set(
      Math.cos(elevation) * Math.sin(azimuth),
      Math.sin(elevation),
      -Math.cos(elevation) * Math.cos(azimuth)
    );
    const w = smooth01(0.0, 0.42, elevation);
    uHorizon.value.setRGB(...lerp3(DUSK.horizon, DAY.horizon, w));
    uZenith.value.setRGB(...lerp3(DUSK.zenith, DAY.zenith, w));
    uDeep.value.setRGB(...lerp3(DUSK.deep, DAY.deep, w));
    uShallow.value.setRGB(...lerp3(DUSK.shallow, DAY.shallow, w));
    const sun = lerp3(DUSK.sun, DAY.sun, w);
    const sunI = THREE.MathUtils.lerp(DUSK.sunI, DAY.sunI, w);
    uSunColor.value.setRGB(sun[0] * sunI, sun[1] * sunI, sun[2] * sunI);
    todVal.textContent = TOD_LABELS.find(([limit]) => t < limit)[1];
  }

  // --------------------------------------------------------------------- UI

  const seaSlider = document.getElementById('sea');
  const seaVal = document.getElementById('sea-val');
  const todSlider = document.getElementById('tod');
  const driftBtn = document.getElementById('drift');
  const fpsEl = document.getElementById('fps');

  seaSlider.addEventListener('input', () => {
    uSea.value = 0.25 + (seaSlider.value / 100) * 1.5;
    seaVal.textContent = seaSlider.value;
  });
  todSlider.addEventListener('input', () => updateTimeOfDay(todSlider.value / 100));
  driftBtn.addEventListener('click', () => {
    controls.autoRotate = !controls.autoRotate;
    driftBtn.classList.toggle('active', controls.autoRotate);
  });

  updateTimeOfDay(todSlider.value / 100);
  uSea.value = 0.25 + (seaSlider.value / 100) * 1.5;

  // ------------------------------------------------------------------- loop

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let last = performance.now();
  let fpsAccum = 0;
  let fpsFrames = 0;
  let revealed = false;

  function frame() {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    uTime.value += dt;
    controls.update();
    postProcessing.render();

    fpsAccum += dt;
    fpsFrames++;
    if (fpsAccum >= 0.5) {
      fpsEl.textContent = Math.round(fpsFrames / fpsAccum) + ' FPS';
      fpsAccum = 0;
      fpsFrames = 0;
    }

    if (!revealed) {
      revealed = true;
      document.getElementById('ui').classList.add('ready');
      loader.classList.add('hidden');
    }
  }

  renderer.setAnimationLoop(frame);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      renderer.setAnimationLoop(null);
    } else {
      last = performance.now();
      renderer.setAnimationLoop(frame);
    }
  });
}

function showError(title, lines) {
  loader.classList.add('error');
  loader.classList.remove('hidden');
  loader.querySelector('h1').textContent = title;
  loaderMsg.innerHTML = lines.join('<br>');
}
