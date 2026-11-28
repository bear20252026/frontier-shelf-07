import {splitMeshAtZ} from './section-geometry.js';
import {createSoundPathLayers} from './sound-path-layers.js';
import {createFlatTransition} from './sound-path-flat.js';
import {createTeachingMaterials} from './sound-path-materials.js';
import {createTeachingCamera} from './sound-path-camera.js';
import {COPY,applyLanguage} from './sound-path-copy.js';
import {SOUND_LAYERS,soundPathPose,soundPathView,soundPathSectionAmount,SOUND_LABELS} from './sound-path-motion.js';

const frame=document.getElementById('scene'),$=id=>document.getElementById(id);
const query=new URLSearchParams(location.search),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let language=query.get('lang')==='zh'?'zh':'en';
const words=()=>COPY[language].ui;
const waitFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
const materialList=mesh=>Array.isArray(mesh.material)?mesh.material:[mesh.material];
let T,api,semantic,root,flat,teachingMaterials,framing,ready=false,initialized=false,playing=false,motion=null;
let time=0,destination=0,shownChapter=-1,holdUntil=0,dirty=true,lastStamp=0;
const groups=new Map(),materials=new Map(),meshList=[],labels=[];
const stats={sourceUnits:0,sourceMeshes:0,outputMeshes:0,triangles:0,caps:0,openContours:0};

function addMesh(layer,side,mesh,source){
 mesh.userData.soundPathSource=source;mesh.userData.soundPathCastShadow=mesh.castShadow;groups.get(layer)[side].add(mesh);
 const list=materials.get(layer)[side];materialList(mesh).forEach(m=>list.push(m));
 meshList.push(mesh);stats.outputMeshes++;if(mesh.userData.sectionCap)stats.caps++;
}
function build(){
 api=frame.contentWindow.__REFERENCE;
 // All renderable objects and typed buffers must be created by the iframe's
 // Three module. A second realm fails WebGLAttributes' typed-array checks and
 // also creates overlapping renderer cache IDs.
 T=api.THREE;if(!T?.Group)throw Error(words().versionError);
 api.assembly.pause();api.assembly.setProgress(0,false);api.scene.updateMatrixWorld(true);
 semantic=createSoundPathLayers(T,api.assembly.records);stats.sourceUnits=api.assembly.records.length;
 root=new T.Group();root.name='sound-path-section';api.scene.add(root);
 for(const layer of SOUND_LAYERS){
  const pair={negative:new T.Group(),positive:new T.Group()};
  for(const side of ['negative','positive']){pair[side].name=layer+'-'+side;root.add(pair[side]);}
  groups.set(layer,pair);materials.set(layer,{negative:[],positive:[],alpha:{negative:-1,positive:-1}});
 }
 for(const record of api.assembly.records){
  const layer=semantic.layerFor(record);
  for(const mesh of record.g.children){
   if(!mesh.isMesh||!mesh.visible||!mesh.geometry?.attributes?.position||materialList(mesh).every(m=>(m?.opacity??1)<=.001))continue;
   const halves=splitMeshAtZ(T,mesh,0);
   stats.sourceMeshes++;stats.triangles+=halves.stats.sourceTriangles;stats.openContours+=halves.stats.openContours;
   for(const side of ['negative','positive'])for(const part of halves[side])addMesh(layer,side,part,record.d.id);
  }
  record.g.visible=false;
 }
 flat=createFlatTransition(T,api,root,groups);
 teachingMaterials=createTeachingMaterials(T,groups);
 framing=createTeachingCamera(T,api,groups,flat);
 const style=frame.contentDocument.createElement('style');style.textContent='html,body{background:#fafafa!important}header,#assemblyBar,#region,#info,#part,#catalog{display:none!important}';frame.contentDocument.head.append(style);
 api.renderer.setClearColor?.(0xfafafa,1);
 api.renderer.setPixelRatio?.(Math.min(2,Math.max(1.5,devicePixelRatio||1)));
 api.scene.traverse?.(object=>{if(object.material?.isShadowMaterial){object.material.opacity=.10;object.material.color.set(0x69727a);}});
 frame.style.pointerEvents='none';
 language=applyLanguage(document,language);
 ready=true;time=clamp(Number(query.get('chapter')||0),0,7);destination=Math.round(time);updateCopy(destination);apply(time);
 window.__SOUND_PATH={ready:true,stats,semantic,groups,flat,teachingMaterials,framing,scene:api.scene,renderer:api.renderer,camera:api.camera,get time(){return time;},get moving(){return !!motion;},get chapter(){return destination;}};
 render();if(ready){$('loading').hidden=true;document.getElementById('poster')?.classList.add('is-hidden');}
}
function fail(error){
 ready=false;playing=false;motion=null;dirty=false;
 if(window.__SOUND_PATH){window.__SOUND_PATH.ready=false;window.__SOUND_PATH.error=error.message;}
 $('loading').hidden=false;$('loading').textContent=words().renderError;
 console.error(words().renderLogLabel,error);
}
function render(){
 try{api.renderer.render(api.scene,api.camera);dirty=false;}catch(error){fail(error);}
}
function setAlpha(layer,side,alpha,force=false){
 const collection=materials.get(layer),group=groups.get(layer)[side];group.visible=alpha>.006;
 if(!force&&Math.abs(collection.alpha[side]-alpha)<.0003)return;
 collection.alpha[side]=alpha;
 for(const mesh of group.children)mesh.castShadow=alpha>.8&&mesh.userData.soundPathCastShadow;
 for(const mat of collection[side]){
  const transparent=alpha<.998;if(mat.transparent!==transparent){mat.transparent=transparent;mat.needsUpdate=true;}
  mat.opacity=alpha;mat.depthWrite=!transparent;
 }
}
function apply(t){
 const poses=soundPathPose(t),atChapter=Number.isInteger(t);
 for(const layer of SOUND_LAYERS)for(const side of ['negative','positive']){
  const p=poses[layer][side],group=groups.get(layer)[side];group.position.set(...p.position);setAlpha(layer,side,p.opacity,atChapter);
 }
 for(const mesh of meshList)if(mesh.userData.sectionCap)mesh.visible=soundPathSectionAmount(t)>.015;
 teachingMaterials.apply(t,poses);
 flat.apply(t,poses);
 const stage=framing.apply(t,soundPathView(t),innerWidth,innerHeight);
 frame.style.clipPath=`inset(${stage.y}px ${innerWidth-stage.x-stage.width}px ${innerHeight-stage.y-stage.height}px ${stage.x}px)`;
 document.body.classList.toggle('narrative-right',stage.narrativeSide==='right');
 root.updateMatrixWorld(true);updateLabels(t,poses);dirty=true;
}
function updateLabels(t,poses){
 const step=Math.round(t),visible={0:[],1:['keyboard','action','strings','soundboard'],2:['keyboard'],3:['action'],4:['plate','strings'],5:['bridges','soundboard'],6:['damper','pedals'],7:[]};
 for(const item of labels){
  const on=t<=6&&visible[step]?.includes(item.layer)&&Math.abs(t-step)<.2;
  item.el.hidden=!on;if(!on)continue;
  const p=new T.Vector3(...item.anchor).add(new T.Vector3(...poses[item.layer].positive.position)).project(api.camera);
  item.el.style.left=(p.x+1)*innerWidth/2+'px';item.el.style.top=(1-p.y)*innerHeight/2+'px';
 }
}
function updateCopy(chapter){
 if(chapter!==shownChapter){
  shownChapter=chapter;
  const button=document.querySelector('#chapters button[data-chapter="'+chapter+'"]');
  if(button){$('chapterTitle').textContent=button.dataset.title;$('chapterDescription').textContent=button.dataset.description;}
  if($('chapterParts'))$('chapterParts').textContent=COPY[language].chapters[chapter].parts.join(' · ');
  for(const b of document.querySelectorAll('#chapters button')){const on=Number(b.dataset.chapter)===chapter;b.classList.toggle('active',on);if(on)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');}
 }
 const returning=playing&&motion?.target===0;
 $('chapterCount').textContent=String(chapter).padStart(2,'0')+' / 07'+(returning?' · '+words().returning:'');
 $('prev').disabled=time<=.0001;$('next').disabled=time>=6.9999;
 const running=playing||!!motion;
 const slider=$('chapterSlider');
 if(slider){slider.value=String(time);slider.style.setProperty('--progress',(time/7*100)+'%');slider.setAttribute('aria-valuetext',String(chapter+1)+' / 8 · '+$('chapterTitle').textContent);}
 document.body.classList.toggle('flat-view',time>6.65);
 document.body.classList.toggle('narrative-hidden',!!motion||Math.abs(time-Math.round(time))>.13);
 const ui=words();
 $('play').textContent=running?ui.pause:time>=6.9999?ui.replay:time<=.0001?ui.start:ui.continue;$('play').setAttribute('aria-pressed',String(running));$('play').setAttribute('aria-label',returning?ui.pauseReturnAria:running?ui.pauseAria:time>=6.9999?ui.replayAria:time<=.0001?ui.startAria:ui.continueAria);
}
function syncCopyToTime(){updateCopy(clamp(Math.round(time),0,7));}
function stop(){playing=false;motion=null;syncCopyToTime();}
function stepLayer(direction){travel(direction>0?Math.floor(time+.0001)+1:Math.ceil(time-.0001)-1);}
function scrub(){
 if(!ready)return;playing=false;motion=null;
 time=clamp(Number($('chapterSlider').value)||0,0,7);destination=Math.ceil(time);
 apply(time);syncCopyToTime();
}
function settleSlider(){
 if(!ready)return;const nearest=Math.round(time);
 if(Math.abs(time-nearest)<.12)travel(nearest);else{destination=Math.ceil(time);syncCopyToTime();}
}
function travel(chapter,manual=true){
 if(!ready)return;if(manual)playing=false;
 const target=clamp(Math.round(chapter),0,7);destination=target;
 if(Math.abs(target-time)<.0001){motion=null;syncCopyToTime();return;}
 motion={target};syncCopyToTime();dirty=true;
}
function togglePlay(){
 if(playing||motion){stop();return;}
 playing=true;syncCopyToTime();
 if(time>=6.999){destination=0;travel(0,false);return;}
 if(Math.abs(time-destination)>.001){travel(destination,false);return;}
 holdUntil=performance.now()+900;
}
function bind(){
 $('languageToggle')?.addEventListener('click',()=>{language=applyLanguage(document,language==='en'?'zh':'en');shownChapter=-1;syncCopyToTime();});
 $('next').onclick=()=>stepLayer(1);$('prev').onclick=()=>stepLayer(-1);$('play').onclick=togglePlay;
 for(const b of document.querySelectorAll('#chapters button'))b.onclick=()=>travel(Number(b.dataset.chapter));
 const slider=$('chapterSlider');
 slider?.addEventListener('pointerdown',()=>{if(ready)stop();});
 slider?.addEventListener('input',scrub);slider?.addEventListener('change',settleSlider);
 addEventListener('keydown',e=>{
  if(e.target===slider)return;
  if(e.key==='ArrowRight'){e.preventDefault();stepLayer(1);}else if(e.key==='ArrowLeft'){e.preventDefault();stepLayer(-1);}else if(e.code==='Space'){e.preventDefault();togglePlay();}else if(e.key==='Home'){e.preventDefault();travel(0);}else if(e.key==='End'){e.preventDefault();travel(7);}
 });
 addEventListener('resize',()=>{if(ready)requestAnimationFrame(()=>apply(time));});
}
function tick(now){
 requestAnimationFrame(tick);const dt=Math.min(.06,(now-lastStamp)/1000||0);lastStamp=now;
 if(!ready)return;
 if(motion){
  const diff=motion.target-time,step=dt/2.8;
  if(Math.abs(diff)<=step){time=motion.target;motion=null;holdUntil=now+5200;if(time===7)playing=false;syncCopyToTime();}
  else time+=Math.sign(diff)*step;
  apply(time);syncCopyToTime();
 }else if(playing&&now>=holdUntil){travel(Math.min(7,Math.floor(time)+1),false);}
 if(dirty)render();
}
async function initialize(){
 if(initialized)return;initialized=true;
 try{
  const start=performance.now();
  while(!frame.contentWindow.__REFERENCE?.ready){if(performance.now()-start>30000)throw Error(words().loadTimeout);await waitFrame();}
  build();if(!ready)return;bind();
  // freeze belongs to the embedded reference viewer. Only an explicit teaching
  // playback opt-out should hold this page on the opening piano.
  const autoplay=query.get('autoplay');
  if(autoplay!=='0'&&(autoplay==='1'||!matchMedia('(prefers-reduced-motion: reduce)').matches)){playing=true;holdUntil=performance.now()+850;updateCopy(destination);}
 }catch(error){fail(error);}
}
frame.addEventListener('load',initialize);initialize();requestAnimationFrame(tick);
