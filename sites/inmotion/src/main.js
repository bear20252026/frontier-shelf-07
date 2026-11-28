import * as THREE from '../vendor/three.module.js';
import {createPoster} from './poster.js';

// Native WebGL gallery. Pixels and springs stay outside the DOM render cycle.
const cities = [
  {id:'motion/scarlet',name:'Rhythm',country:'FEEL THE RHYTHM',color:'#e31709',ink:'#fff7e9',line:'Where movement begins.',tags:'SILHOUETTE · VERMILION',description:'An arm lifted toward the light. A silhouette holds its tempo against a field of red.',credit:'Concept artwork',alt:'A female silhouette in black with one arm behind her head against a glowing vermilion red background'},
  {id:'motion/impulse',name:'Impulse',country:'CATCH THE MOMENT',color:'#3864ef',line:'Suspended before flight.',tags:'DANCE · COBALT',description:'A bent knee, a breath held. Cobalt catches the instant before takeoff.',author:'Anya Juárez Tenorio',alt:'Silhouette of one dancer with an arm raised in blue light'},
  {id:'motion/stride',name:'Stride',country:'KEEP MOVING',color:'#ed9b24',line:'To your own rhythm.',tags:'SILHOUETTE · AMBER',description:'One step, warm and deliberate. Time stretches behind a clean profile.',author:'Anya Juárez Tenorio',alt:'One person in profile taking a step against an orange background'},
  {id:'motion/free',name:'Freedom',country:'LET YOUR BODY SPEAK',color:'#de467e',line:'Out of the frame.',tags:'GESTURE · CARMINE',description:'An arm out of reach, then out of the frame. Coral carries the body beyond the familiar.',author:'KoolShooters',alt:'One dancer reaching upward in front of a circle of light on a pink background'},
  {id:'motion/breathe',name:'Breathe',country:'LET THE MOMENT GO',color:'#aec637',line:'Stillness is part of motion.',tags:'MOVEMENT · LIME',description:'A soft arch, an open chest, a longer shadow. Lime leaves space for the unhurried.',author:'cottonbro studio',alt:'One person arching backward with arms outstretched against a bright lime background'},
  {id:'motion/balance',name:'Balance',country:'FIND YOUR BALANCE',color:'#b460e6',line:'Stillness, held.',tags:'POISE · VIOLET',description:'One foot planted, weight barely shifting. Violet keeps the stillness in motion.',author:'Anya Juárez Tenorio',alt:'Silhouette of one person balancing on one leg in violet light'},
];
const $ = id => document.getElementById(id);
const stage=$('stage'), canvas=$('webgl'), count=cities.length;
const reducedQuery=matchMedia('(prefers-reduced-motion: reduce)');
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mod=(x,n)=>((x%n)+n)%n;
let reduced=reducedQuery.matches, selected=-1, pos=0, target=0, velocity=0, bend=0;
let width=1,height=1,cardW=1,cardH=1,stride=1, dragging=false;
let downX=0,downY=0,lastX=0,lastT=0,travel=0,releaseSpeed=0,wheelEnd;
let raf=0,lastFrame=0,renderer,scene,camera,meshes=[],ready=false;
let originFocus=null,isFallback=false,pointerId=null;
let entry=0;
let gallerySpread=0;
const detailDialog=$('detail-dialog');
const poster=createPoster({
  cities,
  sourceRect:centralRect,
  onSelect:freezeGallery,
  onProgress:value=>{
    gallerySpread=value;
    document.documentElement.style.setProperty('--gallery-out',value);
    if(ready&&!isFallback){cancelAnimationFrame(raf);raf=0;lastFrame=performance.now();frame(lastFrame)}
  },
  onClose:()=>{gallerySpread=0;wake()}
});

const vertexShader=`
  uniform vec2 uSize;
  uniform float uBend;
  uniform float uSide;
  varying vec2 vUv;
  varying float vWing;
  varying float vFlare;
  void main() {
    // Extra UV margin leaves room for spectral refraction outside the silhouette.
    vec2 margin=vec2(24.0,36.0);
    vUv=(uv-0.5)*(1.0+2.0*margin/uSize)+0.5;
    float dist=abs(uSide);
    float wing=smoothstep(0.18,0.98,dist);
    float angle=clamp(uSide,-1.0,1.0)*3.14159265;
    float face=cos(angle)+0.42*sin(abs(angle));
    vec2 p=(vUv-0.5)*uSize;
    float localScreenX=(vUv.x-0.5)*face;
    float outward=clamp(0.5+localScreenX*sign(uSide),0.0,1.0);
    // The inner edge stays small; the outer edge unfurls beyond the viewport.
    float flare=smoothstep(0.08,0.98,outward);
    float motionPull=min(abs(uBend),1.3);
    float verticalScale=mix(1.0,0.54+(4.15+motionPull*0.75)*pow(flare,1.72),wing);
    p.x *= face*(1.0+0.38*wing);
    p.y *= verticalScale;
    // Edge lag grows with drag speed; the center settles back to a flat image.
    float y=vUv.y*2.0-1.0;
    p.x += (y*y-0.33)*uBend*uSize.x*0.19;
    p.y += sin(vUv.x*3.14159)*uBend*uSize.y*0.045;
    vWing=wing;
    vFlare=flare;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(p,0.0,1.0);
  }
`;
const fragmentShader=`
  uniform sampler2D uMap;
  uniform vec2 uSize;
  uniform float uBend;
  uniform float uOpacity;
  uniform float uShade;
  uniform float uDpr;
  varying vec2 vUv;
  varying float vWing;
  varying float vFlare;
  float sq(float x) { return x*x; }
  float roundBox(vec2 p, vec2 b, float r) {
    vec2 q=abs(p)-b+r;
    return min(max(q.x,q.y),0.0)+length(max(q,0.0))-r;
  }
  void main() {
    float d=roundBox((vUv-0.5)*uSize,uSize*0.5,9.0);
    // Measure rim thickness after deformation so stretched wings don't become neon tubes.
    float footprint=max(length(vec2(dFdx(d),dFdy(d))),0.001);
    float sd=d/(footprint*uDpr);
    float core=1.0-smoothstep(-.55,.55,sd);
    float shoulder=exp(-sq((vFlare-.40)/.30));
    float curved=vWing*smoothstep(.025,.23,vFlare);
    float glancing=curved*(.24+.76*shoulder);
    float topLight=mix(.76,1.0,smoothstep(.2,.8,vUv.y));
    float light=topLight*.93;
    float filmWidth=5.0+14.0*shoulder;
    float outside=smoothstep(-.05,.65,sd);
    float film=outside*(1.0-smoothstep(1.4,filmWidth,sd))*glancing*.28;
    // A second, nearly transparent lip gives the outer sheet a little thickness.
    float lip=exp(-sq((sd-filmWidth*.68)/2.2))*outside*glancing*.035;
    float cyan=exp(-sq((sd-1.9)/1.25))*outside*glancing*.78;
    float amber=exp(-sq((sd+.9)/1.35))*glancing*.98;
    float alpha=min(1.0,max(core,(film+lip+cyan+amber)*light));
    if(alpha<.002)discard;
    vec2 uv=clamp(vUv,0.001,0.999);
    uv.x += sin(uv.y*7.0)*uBend*.003;
    float drag=abs(uBend);
    float splitAmount=(.0012+.003*shoulder)*curved+drag*.0015;
    vec2 split=vec2(splitAmount,curved*.0005);
    vec3 rgb=vec3(texture2D(uMap,clamp(uv+split,.001,.999)).r,
      texture2D(uMap,uv).g,texture2D(uMap,clamp(uv-split,.001,.999)).b);
    // Short directional samples stretch detail into the wing, leaving the centre sharp.
    float smear=curved*pow(vFlare,.75)*(.022+drag*.018);
    float direction=sign(vUv.x-.5);
    vec2 trailStep=vec2(direction*smear,0.0);
    vec3 trail=texture2D(uMap,clamp(uv+trailStep*.35,.001,.999)).rgb*.45
      +texture2D(uMap,clamp(uv+trailStep*.75,.001,.999)).rgb*.35
      +texture2D(uMap,clamp(uv+trailStep*1.4,.001,.999)).rgb*.20;
    rgb=mix(rgb,trail,curved*(.12+vFlare*.19))*uShade;
    vec3 gold=vec3(1.0,.45,.055),ice=vec3(.12,.65,.91);
    rgb=mix(rgb,gold,clamp(amber*.94,0.0,.92));
    float silk=exp(-sq((sd+1.15)/.6))*glancing*.23;
    rgb=mix(rgb,vec3(1.0,.97,.88),silk);
    vec3 filmColor=vec3(.27,.63,.79);
    vec3 outer=(filmColor*(film+lip)+ice*cyan+gold*amber)/max(film+lip+cyan+amber,.001);
    gl_FragColor=vec4(mix(outer,rgb,core),alpha*uOpacity);
    #include <colorspace_fragment>
  }
`;

$('counter-total').textContent=String(count).padStart(2,'0');
stage.tabIndex=0;
stage.setAttribute('role','region');
stage.setAttribute('aria-roledescription','carousel');
stage.setAttribute('aria-label','Photo collection. Drag or use the left and right arrow keys.');
canvas.setAttribute('aria-hidden','true');

function updateSelected(index){
  index=mod(index,count);if(selected===index)return;
  selected=index;
  const city=cities[index];
  $('selected-city').textContent=city.name;
  if(!reduced&&ready)$('selected-city').animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:320,easing:'cubic-bezier(.2,.7,.2,1)'});
  stage.dataset.selected=String(index);
  document.querySelectorAll('#frame-picker button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
  $('selected-description').textContent=city.line;
  $('counter-current').textContent=String(index+1).padStart(2,'0');
  stage.setAttribute('aria-label',`${city.name}. ${city.line} Use the left and right arrow keys to change frames.`);
  document.documentElement.style.setProperty('--city-glow',city.color);
  document.documentElement.style.setProperty('--mood-color',city.color);
}
function go(index){
  if(!ready)return;
  const base=Math.round(target/count)*count;
  let dest=base+mod(index,count);
  if(dest-target>count/2)dest-=count;
  if(dest-target<-count/2)dest+=count;
  target=dest;
  if(reduced){pos=target;velocity=0;}
  updateSelected(mod(Math.round(target),count));wake();
  if(isFallback)fallbackScroll(mod(index,count));
}
function step(dir){
  target=Math.round(target)+dir;
  if(reduced){pos=target;velocity=0;}
  updateSelected(mod(Math.round(target),count));wake();
  if(isFallback)fallbackScroll(selected);
}
$('prev').addEventListener('click',()=>step(-1));
$('next').addEventListener('click',()=>step(1));

function freezeGallery(index=selected){
  clearTimeout(wheelEnd);
  let dest=Math.round(pos/count)*count+index;
  if(dest-pos>count/2)dest-=count;if(dest-pos<-count/2)dest+=count;
  pos=target=dest;velocity=bend=releaseSpeed=0;dragging=false;
  stage.classList.remove('is-dragging');
  if(pointerId!==null&&stage.hasPointerCapture(pointerId))stage.releasePointerCapture(pointerId);
  pointerId=null;updateSelected(index);
  if(isFallback)$('fallback').children[index]?.scrollIntoView({behavior:'instant',block:'nearest',inline:'center'});
  if(ready&&!isFallback){cancelAnimationFrame(raf);raf=0;lastFrame=performance.now();frame(lastFrame);cancelAnimationFrame(raf);raf=0;}
}
function centralRect(){
  if(isFallback){const img=$('fallback').children[selected]?.querySelector('img');return img?.getBoundingClientRect()}
  const r=stage.getBoundingClientRect();return {left:r.left+(width-cardW)/2,top:r.top+(height-cardH)/2,width:cardW,height:cardH};
}
function openCity(index=selected){
  if(index<0||!ready)return;
  poster.open(mod(index,count));
}
$('open-city').addEventListener('click',()=>openCity());
$('about').addEventListener('click',()=>{
  originFocus=document.activeElement;$('about-dialog').showModal();$('about-close').focus();
  cancelAnimationFrame(raf);raf=0;
});
$('about-close').addEventListener('click',()=>$('about-dialog').close());
$('about-dialog').addEventListener('close',()=>{originFocus?.focus({preventScroll:true});wake()});
$('about-dialog').addEventListener('click',e=>{
  const r=$('about-dialog').getBoundingClientRect();
  if(e.target===$('about-dialog')&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))$('about-dialog').close();
});

window.addEventListener('keydown',e=>{
  if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
  if(detailDialog.open)return;
  if(document.querySelector('dialog[open]'))return;
  if(e.key==='ArrowRight'){e.preventDefault();step(1);}
  if(e.key==='ArrowLeft'){e.preventDefault();step(-1);}
  if(e.key==='Home'){e.preventDefault();go(0);}
  if(e.key==='End'){e.preventDefault();go(count-1);}
  if(e.key==='Enter'&&e.target===stage){e.preventDefault();openCity();}
});

function pointerDown(e){
  if(!ready||isFallback||e.button>0||pointerId!==null)return;
  dragging=true;pointerId=e.pointerId;
  downX=lastX=e.clientX;downY=e.clientY;lastT=performance.now();travel=releaseSpeed=0;
  target=pos;velocity=0;
  stage.setPointerCapture(e.pointerId);stage.classList.add('is-dragging');
  wake();
}
function pointerMove(e){
  if(!dragging||e.pointerId!==pointerId)return;
  const now=performance.now(),dx=e.clientX-lastX,dt=Math.max(8,now-lastT)/1000;
  target-=dx/stride;
  releaseSpeed=releaseSpeed*.45+(-dx/stride/dt)*.55;
  travel+=Math.abs(dx);lastX=e.clientX;lastT=now;
  if(reduced)pos=target;
  wake();
}
function pointerUp(e){
  if(!dragging||e.pointerId!==pointerId)return;
  const canceled=e.type==='pointercancel';
  dragging=false;pointerId=null;stage.classList.remove('is-dragging');
  if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);
  if(performance.now()-lastT>130)releaseSpeed=0;
  target=Math.round(target+(canceled?0:clamp(releaseSpeed*.16,-1.35,1.35)));
  if(reduced){pos=target;velocity=0;}
  if(!canceled&&travel<7&&Math.abs(e.clientY-downY)<7){
    const r=stage.getBoundingClientRect(),x=e.clientX-r.left-width/2;
    const visible=meshes.filter(m=>m.visible);
    const hit=visible.find(m=>{
      const distance=Math.abs(m.material.uniforms.uSide.value);
      const halfWidth=cardW*(distance>.8?.65:.5);
      const halfHeight=distance>.8?height*.5:cardH*.5;
      return Math.abs(x-m.position.x)<halfWidth&&Math.abs(e.clientY-r.top-height/2+m.position.y)<halfHeight;
    });
    if(hit){if(hit.userData.index===selected)openCity();else go(hit.userData.index);}
  }
  wake();
}
stage.addEventListener('pointerdown',pointerDown);
stage.addEventListener('pointermove',pointerMove);
stage.addEventListener('pointerup',pointerUp);
stage.addEventListener('pointercancel',pointerUp);
stage.addEventListener('lostpointercapture',()=>{
  if(dragging){dragging=false;pointerId=null;target=Math.round(target);stage.classList.remove('is-dragging');wake();}
});
stage.addEventListener('wheel',e=>{
  if(!ready||isFallback||e.ctrlKey)return;
  e.preventDefault();
  const delta=(Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY)*(e.deltaMode===1?18:1);
  target+=clamp(delta/stride*.7,-.65,.65);
  clearTimeout(wheelEnd);wheelEnd=setTimeout(()=>{target=Math.round(target);wake();},120);
  if(reduced){pos=Math.round(target);velocity=0;}
  wake();
},{passive:false});

function resize(){
  const rect=stage.getBoundingClientRect();width=rect.width;height=rect.height;
  cardH=Math.min(height*.75,570);cardW=cardH*.80;
  if(width<600){cardW=Math.min(width*.66,height*.78*.80);cardH=cardW/.80;}
  stride=cardW*(width<600?1.18:1.42);
  if(renderer){
    renderer.setSize(width,height,false);
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.8,Math.sqrt(2600000/(width*height))));
    camera.left=-width/2;camera.right=width/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();
    meshes.forEach(m=>{m.material.uniforms.uSize.value.set(cardW,cardH);m.material.uniforms.uDpr.value=renderer.getPixelRatio()});
    wake();
  }
}
new ResizeObserver(resize).observe(stage);
function wake(){if(ready&&!raf&&!document.hidden&&!isFallback&&!detailDialog.open&&!$('about-dialog').open){lastFrame=performance.now();raf=requestAnimationFrame(frame);}}
function frame(now){
  // Render only during navigation or poster transitions; resting cards are static.
  raf=0;const dt=Math.min(Math.max(0,(now-lastFrame)/1000),.032);lastFrame=now;
  if(!reduced){
    // Critical-ish damping while held; a softer spring after release.
    const k=dragging?180:110,damping=dragging?25:18;
    velocity+=((target-pos)*k-velocity*damping)*dt;
    pos+=velocity*dt;
    bend+=(clamp(-velocity*.18,-1.3,1.3)-bend)*(1-Math.exp(-12*dt));
    entry=Math.min(1,entry+dt*1.6);
  }else{pos=target;velocity=bend=0;entry=1;}
  if(Math.abs(target-pos)<.0001&&Math.abs(velocity)<.0005){pos=target;velocity=0;}
  updateSelected(mod(Math.round(pos),count));
  meshes.forEach((mesh,i)=>{
    const relative=mod(i-pos+count/2,count)-count/2,dist=Math.abs(relative);
    mesh.visible=dist*stride<width/2+cardW*1.1;
    if(!mesh.visible)return;
    mesh.visible=dist<1.65;
    const wing=THREE.MathUtils.smoothstep(dist,.18,.98);
    mesh.scale.setScalar(1);
    mesh.position.set(relative*stride+Math.sign(relative)*width*.55*gallerySpread, -(1-entry)*25, -dist*80);
    mesh.rotation.z=reduced?0:bend*.008/(1+dist);
    mesh.rotation.y=0;
    mesh.rotation.x=0;
    const u=mesh.material.uniforms;
    u.uBend.value=reduced?0:bend;
    u.uSide.value=reduced?0:relative;
    u.uOpacity.value=entry*(1-THREE.MathUtils.smoothstep(dist,1.35,1.65))*(1-gallerySpread);
    u.uShade.value=1-wing*.035;
  });
  renderer.render(scene,camera);
  const unsettled=Math.abs(target-pos)>.0001||Math.abs(velocity)>.0005||Math.abs(bend)>.0005||entry<1;
  if((unsettled||dragging)&&!document.hidden&&!detailDialog.open&&!$('about-dialog').open)raf=requestAnimationFrame(frame);
  stage.dataset.settled=String(!unsettled);
}

function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();const timer=setTimeout(()=>reject(new Error(`Image timed out: ${src}`)),10000);img.onload=()=>{clearTimeout(timer);resolve(img)};img.onerror=()=>{clearTimeout(timer);reject(new Error(`Image failed: ${src}`))};img.src=src;});}
function makeTexture(img,city,i){
  const c=document.createElement('canvas');c.width=960;c.height=1200;
  const ctx=c.getContext('2d'),scale=Math.max(c.width/img.width,c.height/img.height);
  const sw=c.width/scale,sh=c.height/scale;
  ctx.drawImage(img,(img.width-sw)/2,(img.height-sh)/2,sw,sh,0,0,c.width,c.height);
  // Keep photographs unlettered: captions stay upright in the gallery chrome.
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),4);return texture;
}
function fallbackScroll(i){$('fallback').children[i]?.scrollIntoView({behavior:reduced?'instant':'smooth',block:'nearest',inline:'center'});}
function fallback(message){
  isFallback=true;ready=true;canvas.hidden=true;$('loading').hidden=true;
  const container=$('fallback');container.hidden=false;container.replaceChildren();
  cities.forEach((city,i)=>{
    const b=document.createElement('button');b.className='fallback-card';b.type='button';
    b.innerHTML=`<img src="./assets/${city.id}.jpg" alt="${city.alt}">`;
    b.setAttribute('aria-label',`View frame: ${city.name}`);
    b.addEventListener('click',()=>{target=pos=i;velocity=0;updateSelected(i);openCity();});container.append(b);
  });
  const observer=new IntersectionObserver(entries=>{
    for(const item of entries)if(item.intersectionRatio>.70){
      const i=Array.from(container.children).indexOf(item.target);
      if(i>=0){target=pos=i;velocity=0;updateSelected(i);}
    }
  },{root:container,threshold:[.7]});
  Array.from(container.children).forEach(c=>observer.observe(c));
  stage.setAttribute('aria-label',message);updateSelected(0);
  document.body.dataset.ready='true';
}
async function init(){
  try{
    renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.setClearColor(0x0b0d10,0);
    scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,3000);camera.position.z=1000;
    resize();
    await Promise.race([
      Promise.all([document.fonts.load('700 94px Manrope'),document.fonts.load('400 26px Manrope')]),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('Fonts timed out')),10000))
    ]);
    const images=await Promise.all(cities.map(c=>loadImage(`./assets/${c.id}.jpg`)));
    const geometry=new THREE.PlaneGeometry(1,1,80,96);
    meshes=images.map((img,i)=>{
      const material=new THREE.ShaderMaterial({vertexShader,fragmentShader,transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{
        uMap:{value:makeTexture(img,cities[i],i)},uSize:{value:new THREE.Vector2(cardW,cardH)},uBend:{value:0},uSide:{value:0},uOpacity:{value:0},uShade:{value:1},uDpr:{value:renderer.getPixelRatio()}
      }});
      const mesh=new THREE.Mesh(geometry,material);mesh.userData.index=i;mesh.frustumCulled=false;scene.add(mesh);return mesh;
    });
    ready=true;updateSelected(0);$('loading').hidden=true;document.body.dataset.ready='true';wake();
    poster.preload(0);
  }catch{fallback('Photo collection. Animated effects are unavailable in this browser.');}
}
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(raf);raf=0;fallback('Graphics are temporarily unavailable. Showing the photo collection.');});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else wake();});
reducedQuery.addEventListener('change',e=>{reduced=e.matches;target=Math.round(target);wake();});
window.addEventListener('pagehide',e=>{cancelAnimationFrame(raf);raf=0;clearTimeout(wheelEnd);if(!e.persisted)poster.destroy();});
window.addEventListener('pageshow',e=>{if(e.persisted)wake()});

cities.forEach((city,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',`Select ${city.name}`);b.setAttribute('aria-pressed',String(i===0));b.title=city.name;b.style.setProperty('--frame-color',city.color);b.addEventListener('click',()=>go(i));$('frame-picker').append(b)});
updateSelected(0);init();
