import * as THREE from 'three';
import { createSky } from './sky.js';
import { createHeroBg } from './hero-bg.js';
import { createStudioLighting } from './lighting.js';
import { journeyAt } from './journey.js';
import { createTextDissolve } from './dissolve.js';
import { chaptersAt } from './chapters.js';
import { createChapterTransition } from './transition.js';
import { createFallingApple, createFallTitle } from './falling-apple.js';
import { createAppleOrbit } from './apple-orbit.js';
import { createThesisCards } from './thesis-cards.js';
import { createGalleryCards } from './gallery-cards.js';
import { createContact } from './contact.js';

const host = document.querySelector('#scene');
// ── Composition tuning ─────────────────────────────────────────────────────
// Chapter 1 is the hero video: this is its gentle ken-burns push-in, mapped
// from the same journey.focus that used to dolly the camera toward the fruit.
const HERO_ZOOM_PUSH=0.14;
const hero = document.querySelector('#hero-ui');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const textDissolve=createTextDissolve(hero);
const fallUI=document.querySelector('#fall-ui');
const fallCard=document.querySelector('.fall-card');
const thesisCards=createThesisCards(fallUI);
const galleryCards=createGalleryCards(document.querySelector('.gallery-layout'));
const contact=createContact(document.querySelector('#contact'));
let contactExit=0;
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-7,7,4.2,-4.2,0.1,60);
camera.position.set(0,0,16);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false, powerPreference:'high-performance' });
} catch(error) {
  host.setAttribute('aria-label','This 3D scene requires a browser with WebGL support.');
  console.error('WebGL is not available.',error);
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.autoClear = false;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

const sky = createHeroBg();
const fallSky=createSky();
const fallScene=new THREE.Scene();
const fallCamera=camera.clone();
const chapterTransition=createChapterTransition(renderer);
let fallingApple,fallTitle;
const appleOrbit=createAppleOrbit();
const appleRaycaster=new THREE.Raycaster();
const hitPointer=new THREE.Vector2();
let appleDragging=false,dragX=0,dragY=0;
createStudioLighting(renderer,scene);
createStudioLighting(renderer,fallScene);

let targetProgress = 0;
let progress = 0;
let frame = null;
let initialized = false;
let lastTime = performance.now();
let elapsed = 0;
let portrait = false;
const pointer = new THREE.Vector2();
const cameraOffset = new THREE.Vector2();
const neutralPointer = new THREE.Vector2();
let activePointer = null;

function readScroll() { targetProgress=Math.max(0,scrollY/innerHeight); }

function resize() {
  const width=innerWidth, height=innerHeight, aspect=width/height;
  portrait=aspect<0.9;
  const worldHeight=portrait?8.6:8.4;
  const worldWidth=worldHeight*aspect;
  camera.left=-worldWidth/2;camera.right=worldWidth/2;
  camera.top=worldHeight/2;camera.bottom=-worldHeight/2;
  camera.updateProjectionMatrix();
  renderer.setSize(width,height);
  chapterTransition.resize(width,height);
  sky.uniforms.uAspect.value=aspect;
  fallSky.uniforms.uAspect.value=aspect;
  fallCamera.left=camera.left;fallCamera.right=camera.right;fallCamera.top=camera.top;fallCamera.bottom=camera.bottom;
  fallCamera.zoom=1;fallCamera.position.set(0,0,16);fallCamera.updateProjectionMatrix();
  fallTitle?.resize(width,height,worldWidth,worldHeight);
  if(fallingApple)fallingApple.group.scale.setScalar(worldHeight*(portrait?.40:.45)/.979);
  readScroll();
}

function render(now) {
  frame=null;
  if(document.hidden) return;
  frame=requestAnimationFrame(render);
  const dt=Math.min((now-lastTime)/1000,0.05);
  lastTime=now;
  if(!reducedMotion.matches) elapsed+=dt;
  const blend=reducedMotion.matches?1:1-Math.exp(-dt*6.5);
  progress=THREE.MathUtils.lerp(progress,targetProgress,blend);
  const chapter=chaptersAt(progress);
  const cardArrival=thesisCards.update(progress,dt,reducedMotion.matches,innerHeight);
  const galleryTravel=galleryCards.update(progress,dt,reducedMotion.matches,innerHeight,portrait);
  const contactPhase=contact.update(progress-galleryCards.readingScreens(innerHeight),reducedMotion.matches,innerHeight);
  contactExit=contactPhase.exit;
  // The glass harvest card lives on the falling-lemon chapter only: it settles
  // in after the burn and steps aside before the gallery takes the right side.
  if(fallCard){
    const cardIn=THREE.MathUtils.smoothstep(progress,3.35,3.75);
    const cardOut=THREE.MathUtils.smoothstep(progress,5.45,5.85);
    const cardPhase=cardIn*(1-cardOut);
    fallCard.style.opacity=cardPhase.toFixed(4);
    fallCard.style.visibility=cardPhase>0.01?'visible':'hidden';
    fallCard.inert=cardPhase<.95;
    fallCard.setAttribute('aria-hidden',cardPhase<.95?'true':'false');
    fallCard.style.transform=reducedMotion.matches?'none':`translateY(${((1-cardIn)*36+cardOut*28).toFixed(2)}px)`;
  }
  fallTitle?.setTravel(galleryTravel+(reducedMotion.matches?0:contactExit*1.15),contactExit,reducedMotion.matches);
  const p=chapter.opening;
  const journey=journeyAt(p);
  document.documentElement.style.setProperty('--scene-progress',p.toFixed(4));
  textDissolve.update(journey.textDissolve,reducedMotion.matches);
  const titleReveal=THREE.MathUtils.smoothstep(chapter.transition,.4,.92);
  fallUI.style.opacity=titleReveal.toFixed(4);
  const galleryHidden=progress-galleryCards.readingScreens(innerHeight)>=8.35;
  fallUI.style.visibility=chapter.transition>0&&!galleryHidden?'visible':'hidden';
  fallUI.inert=chapter.transition<.95||galleryHidden;
  fallUI.setAttribute('aria-hidden',fallUI.inert?'true':'false');
  cameraOffset.lerp(reducedMotion.matches?neutralPointer:pointer,1-Math.exp(-dt*3.4));
  const tiltX=cameraOffset.x*journey.pointerWeight;
  const tiltY=cameraOffset.y*journey.pointerWeight;
  const windTime=elapsed*1.4;
  // The hero video's breathing cycle counts wall-clock seconds, not wind time.
  sky.uniforms.uTime.value=elapsed;
  sky.uniforms.uPointer.value.set(tiltX,tiltY);
  // Chapter 1 is now pure cinema: the scroll pushes slowly into the grove
  // footage while the DOM hero text does the storytelling.
  sky.uniforms.uZoom.value=1+HERO_ZOOM_PUSH*journey.focus;
  if(camera.zoom!==journey.zoom) {
    camera.zoom=journey.zoom;
    camera.updateProjectionMatrix();
  }
  // Both skies are driven only by the wind clock, never by scroll distance or
  // speed. Updrafts continue at the same rate when the visitor stops scrolling.
  // The cloud noise lattice is periodic, so the unbounded updraft keeps the
  // falling sensation forever without ever emptying the frame.
  fallSky.uniforms.uTime.value=windTime;
  fallSky.uniforms.uFallOffset.value=windTime*.34;
  const orbit=appleOrbit.update(dt,reducedMotion.matches);
  renderer.domElement.tabIndex=chapter.transition>=.98&&contactExit<.01?0:-1;
  renderer.domElement.setAttribute('aria-hidden',contactExit>=1?'true':'false');
  if(fallingApple){
    const worldHeight=fallCamera.top-fallCamera.bottom;
    fallingApple.group.position.set(worldHeight*.015,worldHeight*((portrait?-.06:-.02)-chapter.fall*(portrait?.10:.10)),0);
    // Make room for the readable card sequence on narrow screens.
    fallingApple.group.scale.setScalar(worldHeight*(portrait?.40*(1-cardArrival*.25):.45)/.979*(1-contactExit*.12));
    if(portrait)fallingApple.group.position.y+=worldHeight*cardArrival*.20;
    fallingApple.group.position.y+=worldHeight*(galleryTravel+(reducedMotion.matches?0:contactExit*1.15));
    fallingApple.group.visible=contactExit<(reducedMotion.matches?.5:1);
    fallingApple.group.rotation.set(0,0,0);
    if(!reducedMotion.matches){
      fallingApple.group.position.x+=Math.sin(elapsed*.65)*.07;
      fallingApple.group.position.y+=Math.sin(elapsed*.88)*.045;
      fallingApple.group.rotation.set(Math.sin(elapsed*.63)*.045,Math.sin(elapsed*.48)*.12,Math.sin(elapsed*.73)*.04);
      fallingApple.group.rotation.x-=contactExit*.4;
    }
    fallingApple.pivot.rotation.set(orbit.pitch,orbit.yaw,0,'YXZ');
    fallingApple.update(windTime,reducedMotion.matches);
  }
  camera.updateMatrixWorld();fallCamera.updateMatrixWorld();
  const draw=(background,foreground,view)=>{
    renderer.clear();renderer.render(background.scene,background.camera);renderer.clearDepth();renderer.render(foreground,view);
  };
  if(chapter.transition<=0){renderer.setRenderTarget(null);draw(sky,scene,camera);}
  else if(chapter.transition>=1){renderer.setRenderTarget(null);draw(fallSky,fallScene,fallCamera);}
  else{
    // Composite finished display colours so the video frame and the sky keep
    // exactly the same display exposure on either side of the burn.
    renderer.setRenderTarget(null);draw(sky,scene,camera);chapterTransition.captureFirst();
    draw(fallSky,fallScene,fallCamera);chapterTransition.captureSecond();
    chapterTransition.render(chapter.transition,reducedMotion.matches);
  }
}

function startRendering() {
  if(!initialized || document.hidden || frame!==null) return;
  lastTime=performance.now();
  frame=requestAnimationFrame(render);
}

addEventListener('scroll',readScroll,{passive:true});
addEventListener('resize',resize,{passive:true});
function readPointer(event) {
  pointer.set(event.clientX/innerWidth-0.5,0.5-event.clientY/innerHeight);
  if(event.pointerType!=='touch') {
    thesisCards.setPointer(event.clientX/innerWidth*2-1,event.clientY/innerHeight*2-1);
    galleryCards.setPointer(event.clientX/innerWidth*2-1,event.clientY/innerHeight*2-1);
  }
}
renderer.domElement.addEventListener('pointerdown',event=>{
  if(!event.isPrimary||event.button!==0)return;
  activePointer=event.pointerId;
  renderer.domElement.setPointerCapture?.(event.pointerId);
  readPointer(event);
  if(fallingApple&&chaptersAt(progress).transition>=.98&&contactExit<.01){
    hitPointer.set(event.clientX/innerWidth*2-1,1-event.clientY/innerHeight*2);
    appleRaycaster.setFromCamera(hitPointer,fallCamera);
    appleDragging=appleRaycaster.intersectObject(fallingApple.group,true).length>0;
    dragX=event.clientX;dragY=event.clientY;
  }
});
addEventListener('pointermove',event=>{
  if(event.pointerType==='mouse'||event.pointerId===activePointer) readPointer(event);
  if(event.pointerId===activePointer&&appleDragging){
    appleOrbit.drag(event.clientX-dragX,event.clientY-dragY,innerWidth,innerHeight,event.pointerType!=='touch');
    dragX=event.clientX;dragY=event.clientY;
  }
},{passive:true});
function releasePointer(event) {
  if(event.pointerId!==activePointer) return;
  activePointer=null;
  appleDragging=false;
  if(event.pointerType!=='mouse') pointer.set(0,0);
}
addEventListener('pointerup',releasePointer,{passive:true});
addEventListener('pointercancel',releasePointer,{passive:true});
renderer.domElement.setAttribute('role','img');
renderer.domElement.setAttribute('aria-label','3D lemon. Drag sideways or use arrow keys to rotate.');
renderer.domElement.addEventListener('keydown',event=>{
  if(chaptersAt(progress).transition<.98)return;
  const steps={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if(!steps[event.key])return;
  event.preventDefault();
  const [x,y]=steps[event.key];appleOrbit.drag(x*.035,y*.06,1,1);
});
addEventListener('pointerout',event=>{
  if(!event.relatedTarget)thesisCards.setPointer(0,0);
  if(!event.relatedTarget)galleryCards.setPointer(0,0);
  if(!event.relatedTarget&&activePointer===null) pointer.set(0,0);
});
document.querySelector('.site-nav a[href="#contact"]')?.addEventListener('click',event=>{
  event.preventDefault();
  scrollTo({top:innerHeight*(9.45+galleryCards.readingScreens(innerHeight)),behavior:reducedMotion.matches?'auto':'smooth'});
});
document.addEventListener('visibilitychange',()=>{
  sky.setTabVisible(!document.hidden);
  if(document.hidden) {
    if(frame!==null) cancelAnimationFrame(frame);
    frame=null;
  } else startRendering();
});
resize();
try {
  [fallingApple,fallTitle]=await Promise.all([createFallingApple(),createFallTitle(fallScene)]);
  fallScene.add(fallingApple.group);
  resize();
  progress=targetProgress;
  await renderer.compileAsync(scene,camera);
  await renderer.compileAsync(fallScene,fallCamera);
  host.classList.add('ready');
  initialized=true;
  startRendering();
} catch(error) {
  console.error('The scene could not finish loading.',error);
  host.setAttribute('aria-label','The 3D scene could not be loaded. Refresh the page to try again.');
  host.classList.add('ready');
  initialized=true;
  startRendering();
}

// Footer harvest panel. The original chapter navigation and animation are unchanged.
const harvestDialog=document.querySelector('#harvest-dialog');
document.querySelector('#contact .shop-trigger').addEventListener('click',()=>harvestDialog.showModal());
harvestDialog.querySelector('.dialog-close').addEventListener('click',()=>harvestDialog.close());
harvestDialog.addEventListener('click',event=>{
  if(event.target!==harvestDialog)return;
  const r=harvestDialog.getBoundingClientRect();
  if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)harvestDialog.close();
});
