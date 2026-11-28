import * as THREE from 'three';

// A continuous field shared by the fruit, foliage and their shadow passes.
// It is tied to the model in world space, so reversing scroll restores exactly
// the same surface instead of generating a new random fade each frame.
const fieldGLSL=`
  uniform float uDissolve;
  uniform float uDissolveReduced;
  varying vec3 vDissolveWorld;
  float dissolveHash(vec2 p) {
    return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);
  }
  float dissolveNoise(vec2 p) {
    vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(dissolveHash(i),dissolveHash(i+vec2(1,0)),f.x),
      mix(dissolveHash(i+vec2(0,1)),dissolveHash(i+vec2(1,1)),f.x),f.y);
  }
  float dissolveCoverage() {
    if(uDissolve<0.001)return 1.0;
    if(uDissolve>0.999)return 0.0;
    if(uDissolveReduced>0.5)return 1.0-uDissolve;
    vec2 p=vDissolveWorld.xy+vDissolveWorld.z*vec2(0.31,0.17);
    float field=clamp(0.52+p.x*0.045
      +(dissolveNoise(p*1.8+vec2(4.8,9.2))-0.5)*0.58
      +(dissolveNoise(p*5.7)-0.5)*0.13,0.12,0.88);
    return 1.0-smoothstep(field-0.16,field+0.16,uDissolve*1.4-0.2);
  }
`;

export function addOrchardDissolve(material,uniforms,depth=false) {
  const previous=material.onBeforeCompile;
  const previousKey=material.customProgramCacheKey();
  material.onBeforeCompile=function(shader,renderer) {
    previous.call(this,shader,renderer);
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>\nvarying vec3 vDissolveWorld;')
      .replace('#include <project_vertex>',`#include <project_vertex>
        vDissolveWorld=(modelMatrix*vec4(transformed,1.0)).xyz;`);
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>',`#include <common>\n${fieldGLSL}`)
      .replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
        float coverage=dissolveCoverage();
        diffuseColor.a*=coverage;
        if(diffuseColor.a<0.004)discard;`);
    if(!depth)shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      float dissolveGlow=coverage*(1.0-coverage)*2.4;
      outgoingLight+=vec3(1.0,0.78,0.42)*dissolveGlow;
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=>`${previousKey}-mist-dissolve-${depth}`;
  material.transparent=true;
  material.forceSinglePass=true;
  if(depth)material.alphaHash=true;
  material.needsUpdate=true;
}

// The DOM keeps live selectable text. A low-frequency mask and a widening
// blur dissolve the existing lettering; nothing is replaced with a screenshot.
export function createTextDissolve(hero) {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('width','0');svg.setAttribute('height','0');
  svg.setAttribute('aria-hidden','true');
  svg.style.position='absolute';svg.style.pointerEvents='none';
  const gradient=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><linearGradient id="g"><stop stop-color="white" stop-opacity="0"/><stop offset="1" stop-color="white"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/></svg>`;
  svg.innerHTML=`<defs><filter id="text-mist" x="-10%" y="-30%" width="120%" height="160%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.006 0.014" numOctaves="2" seed="12" result="noise"/>
    <feColorMatrix in="noise" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .33 .34 .33 0 0" result="cloud"/>
    <feImage href="data:image/svg+xml,${encodeURIComponent(gradient)}" preserveAspectRatio="none" result="sweep"/>
    <feComposite in="cloud" in2="sweep" operator="arithmetic" k2="0.58" k3="0.42" result="field"/>
    <feComponentTransfer in="field" result="mask"><feFuncA type="linear" slope="7" intercept="1"/></feComponentTransfer>
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G" result="drift"/>
    <feGaussianBlur in="drift" stdDeviation="0" result="mist"/>
    <feComposite in="mist" in2="mask" operator="in"/>
  </filter></defs>`;
  document.body.append(svg);
  const alpha=svg.querySelector('feFuncA');
  const blur=svg.querySelector('feGaussianBlur');
  const drift=svg.querySelector('feDisplacementMap');
  let previous=-1;
  return {update(progress,reduced) {
    const p=THREE.MathUtils.clamp(progress,0,1);
    hero.classList.toggle('is-hidden',p>=0.999);
    hero.inert=p>0.55;
    hero.style.opacity=reduced?String(1-p):'1';
    hero.classList.toggle('is-dissolving',!reduced&&p>0.001&&p<0.999);
    if(Math.abs(p-previous)<0.0004)return;
    previous=p;
    alpha.setAttribute('intercept',(1-p*9).toFixed(4));
    blur.setAttribute('stdDeviation',(p*p*8).toFixed(3));
    drift.setAttribute('scale',(p*p*9).toFixed(3));
  }};
}
