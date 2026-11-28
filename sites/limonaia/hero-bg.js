import * as THREE from 'three';

// Chapter-1 backdrop: a looping clip of dewy lemons and blossoms, fitted like
// background-size:cover with a gentle scroll-driven ken-burns zoom plus a slow
// breathing cycle. Same interface as createSky() so the scene orchestrator's
// draw/transition paths stay untouched.
//
// Colour path (three r180): video textures are uploaded with a forced linear
// transfer (WebGLTextures passes texture.isVideoTexture into getInternalFormat,
// so no SRGB8_ALPHA8 hardware decode). Built-in materials compensate with a
// DECODE_VIDEO_TEXTURE define; a custom ShaderMaterial gets RAW sRGB bytes in
// the sampler. We therefore output those bytes un-encoded — the canvas is
// display-referred, toneMapped is false, and the burn transition composites
// raw framebuffer copies the same way. Encoding again here would double the
// transfer and wash the frame out.
const GRADE_BLACK_POINT=0.015;   // deepens blacks, kills the residual haze
const GRADE_CONTRAST=1.12;       // around the mid-gray pivot
const GRADE_PIVOT=0.45;
const GRADE_SATURATION=1.10;
const UNSHARP_AMOUNT=0.30;       // 5-tap cross; subtle, no halos
const BREATH_AMPLITUDE=0.013;    // ±1.3% zoom
const BREATH_RATE=2*Math.PI/7;   // one breath every 7 s

export function createHeroBg() {
  const video=document.createElement('video');
  video.muted=true;
  video.loop=true;
  video.playsInline=true;
  video.autoplay=true;
  video.preload='auto';
  video.src='./assets/hero-video.mp4';
  // Offscreen texture source: kept decodable (not display:none) but invisible.
  video.style.cssText='position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
  video.setAttribute('role','img');
  video.setAttribute('aria-label','Dew-covered lemons hanging among blossoms — a morning in the grove.');
  document.body.append(video);
  const texture=new THREE.VideoTexture(video);
  texture.colorSpace=THREE.SRGBColorSpace;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const uniforms={
    uMap: { value: texture },
    uTime: { value: 0 },          // wall-clock seconds; drives the breath
    uAspect: { value: 1 },
    uImgAspect: { value: 752/416 }, // refined once metadata lands
    uZoom: { value: 1 },
    uBreathAmp: { value: reduced?0:BREATH_AMPLITUDE },
    uResolution: { value: new THREE.Vector2(752,416) },
    uPointer: { value: new THREE.Vector2() },
  };
  video.addEventListener('loadedmetadata',()=>{
    if(video.videoWidth&&video.videoHeight){
      uniforms.uImgAspect.value=video.videoWidth/video.videoHeight;
      uniforms.uResolution.value.set(video.videoWidth,video.videoHeight);
    }
  });
  const wantsToPlay=!reduced;
  const tryPlay=()=>{ video.play().catch(()=>{}); };
  if(reduced) {
    // Reduced motion: hold the first frame as a still photograph, breath frozen.
    video.autoplay=false;
    video.pause();
  } else {
    tryPlay();
    // Muted autoplay is normally allowed; this is the belt-and-braces unlock.
    addEventListener('pointerdown',tryPlay,{once:true});
  }
  const material = new THREE.ShaderMaterial({
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    uniforms,
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D uMap;
      uniform float uAspect;
      uniform float uImgAspect;
      uniform float uZoom;
      uniform float uBreathAmp;
      uniform float uTime;
      uniform vec2 uPointer;
      uniform vec2 uResolution;
      void main() {
        // Cover fit: sample the full frame on the tighter axis and crop the
        // overflow axis symmetrically, exactly like background-size:cover.
        vec2 scale = uAspect>uImgAspect
          ? vec2(1.0,uImgAspect/uAspect)   // wide screen: crop top/bottom
          : vec2(uAspect/uImgAspect,1.0);  // tall screen: crop the sides
        vec2 uv=(vUv-0.5)*scale+0.5;
        // Ken-burns push-in (scroll) with a 7-second breathing cycle on top.
        float zoom=uZoom*(1.0+uBreathAmp*sin(uTime*${BREATH_RATE.toFixed(7)}));
        uv=(uv-0.5)/zoom+0.5;
        // A whisper of counter-parallax against the foreground pointer tilt.
        uv-=uPointer*0.015;
        uv=clamp(uv,0.0,1.0);
        // Gentle unsharp mask restores edge bite after the fullscreen upscale.
        vec2 texel=1.0/uResolution;
        vec3 c=texture2D(uMap,uv).rgb*(1.0+4.0*${UNSHARP_AMOUNT.toFixed(2)});
        c-=texture2D(uMap,uv+vec2(texel.x,0.0)).rgb*${UNSHARP_AMOUNT.toFixed(2)};
        c-=texture2D(uMap,uv-vec2(texel.x,0.0)).rgb*${UNSHARP_AMOUNT.toFixed(2)};
        c-=texture2D(uMap,uv+vec2(0.0,texel.y)).rgb*${UNSHARP_AMOUNT.toFixed(2)};
        c-=texture2D(uMap,uv-vec2(0.0,texel.y)).rgb*${UNSHARP_AMOUNT.toFixed(2)};
        // HD grade on the display-referred signal: deepen the black point,
        // then mild contrast around mid-gray, then a touch of saturation.
        c=max(c-${GRADE_BLACK_POINT.toFixed(3)},0.0);
        c=(c-${GRADE_PIVOT.toFixed(2)})*${GRADE_CONTRAST.toFixed(2)}+${GRADE_PIVOT.toFixed(2)};
        float luma=dot(c,vec3(0.2126,0.7152,0.0722));
        c=mix(vec3(luma),c,${GRADE_SATURATION.toFixed(2)});
        // Raw sRGB out, true to the source file; no transfer re-encode.
        gl_FragColor=vec4(clamp(c,0.0,1.0),1.0);
      }`,
  });
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { scene, camera: new THREE.Camera(), uniforms, video,
    // Tab visibility: pause off-screen, resume only if playback is wanted.
    setTabVisible(visible) {
      if(reduced)return;
      if(visible) { if(wantsToPlay)tryPlay(); }
      else video.pause();
    } };
}
