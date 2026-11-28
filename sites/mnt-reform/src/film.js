import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {loadFilmModel} from './film-model.js?v=1';
import {createFilmMotion,DURATION,ramp,filmTime} from './film-motion.js?v=25s-keys';
import {createCableRig} from './hardware.js?v=film1';

const Q=new URLSearchParams(location.search),stage=document.getElementById('stage');
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
stage.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0xe8e8e4);
const env=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(env,.04).texture;env.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xffffff,0x919889,1.45));
const key=new THREE.DirectionalLight(0xfffcf3,3.4);key.position.set(-280,560,320);key.castShadow=true;
key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-470,right:470,top:520,bottom:-430,near:10,far:1600});
key.shadow.bias=-.0001;key.shadow.normalBias=.14;key.shadow.radius=5;key.target.position.set(0,70,0);scene.add(key,key.target);
const fill=new THREE.DirectionalLight(0xdde6ef,1);fill.position.set(320,240,-300);scene.add(fill);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(10000,10000),new THREE.MeshStandardMaterial({color:0xb9bcb6,roughness:1,metalness:0}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=256;
const sh=shadowCanvas.getContext('2d'),gradient=sh.createRadialGradient(128,128,10,128,128,124);gradient.addColorStop(0,'rgba(20,28,21,.20)');gradient.addColorStop(.5,'rgba(20,28,21,.08)');gradient.addColorStop(1,'rgba(20,28,21,0)');sh.fillStyle=gradient;sh.fillRect(0,0,256,256);
const contact=new THREE.Mesh(new THREE.PlaneGeometry(420,300),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false,toneMapped:false}));contact.rotation.x=-Math.PI/2;contact.position.y=.03;scene.add(contact);
const camera=new THREE.PerspectiveCamera(32,16/9,.5,6000);
const UI=Object.fromEntries(['play','restart','seek','time','chapter','speed','status','export','check','report','download'].map(id=>[id,document.getElementById(id)]));
let time=THREE.MathUtils.clamp(Number(Q.get('at')||0)||0,0,DURATION),playing=Q.get('pause')!=='1',speed=1,recording=false,dirty=true;
let model,motion,cables;
const cameraKeys=[
  [0,[0,80,0],780,[.62,.78,1]], [.65,[0,80,0],780,[.62,.78,1]],
  [1.05,[0,70,-20],720,[.4,1,1]], [2.05,[0,70,-20],720,[.4,1,1]],
  [2.45,[0,80,0],780,[.62,.78,1]], [3.1,[0,80,0],780,[.62,.78,1]],
  [4,[0,85,20],700,[.62,.9,1]], [6.1,[0,85,20],700,[.62,.9,1]],
  [8.15,[0,80,0],780,[.62,.78,1]],
  [8.75,[0,122,0],880,[.62,.72,1]], [10.2,[0,122,0],880,[.62,.72,1]],
  [10.8,[0,25,0],620,[.62,.7,1]], [11.45,[0,25,0],620,[.62,.7,1]],
  [12.25,[0,90,-6],730,[.62,.54,1]], [12.8,[0,86,-6],670,[.62,.47,1]],
  [14,[0,88,-9],620,[.62,.44,1]], [15,[0,88,-9],620,[.62,.44,1]],
].map(([time,...pose])=>[filmTime(time),...pose]);
function moveCamera(t){
  let i=cameraKeys.findIndex(k=>k[0]>=t);if(i<1)i=1;const a=cameraKeys[i-1],b=cameraKeys[i],u=ramp(t,a[0],b[0]);
  const target=new THREE.Vector3(...a[1]).lerp(new THREE.Vector3(...b[1]),u),dir=new THREE.Vector3(...a[3]).lerp(new THREE.Vector3(...b[3]),u).normalize();
  target.applyAxisAngle(new THREE.Vector3(0,1,0),model.root.rotation.y);
  const d=THREE.MathUtils.lerp(a[2],b[2],u);camera.position.copy(target).addScaledVector(dir,d);camera.lookAt(target);camera.updateMatrixWorld(true);
}
function draw(t){
  motion.apply(t);cables.update();moveCamera(t);
  const h=model.root.position.y;contact.material.opacity=ramp(t,0,filmTime(.7))*Math.max(.1,1-(h-6)/180);
  renderer.render(scene,camera);UI.chapter.textContent=motion.chapter();UI.seek.value=t;UI.time.textContent=t.toFixed(1).padStart(4,'0')+' / '+DURATION.toFixed(1);
}
function resize(){if(recording)return;renderer.setSize(stage.clientWidth,stage.clientHeight,false);camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();dirty=true;}
function sync(){UI.play.textContent=playing?'暂停':'播放';}
function seek(t){time=THREE.MathUtils.clamp(t,0,DURATION);playing=false;UI.report.hidden=true;sync();draw(time);}
function canvasBlob(){return new Promise((resolve,reject)=>renderer.domElement.toBlob(b=>b?resolve(b):reject(Error('画面导出失败')),'image/png'));}
async function post(path,body){const r=await fetch(path,{method:'POST',headers:body instanceof Blob?{'Content-Type':'image/png'}:{'Content-Type':'application/json'},body:body instanceof Blob?body:JSON.stringify(body)});if(!r.ok)throw Error(await r.text());return r.json();}
async function record(){
  if(recording)return;const was=time;playing=false;recording=true;sync();for(const e of [UI.play,UI.restart,UI.seek,UI.speed,UI.export,UI.check])e.disabled=true;
  document.getElementById('jump').disabled=true;
  try{
    const width=1920,height=1080,fps=30,total=Math.round(DURATION*fps);
    await post('/__capture/start',{width,height,fps,total});renderer.setPixelRatio(1);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
    for(let f=0;f<total;f++){
      draw(Math.min(f/fps,DURATION));await post('/__capture/frame?index='+f,await canvasBlob());
      UI.status.textContent='正在录制 '+Math.round((f+1)/total*100)+'% · '+(f+1)+' / '+total+' 帧';
      // Yield between frames so pause/resize events and the progress message remain responsive.
      await new Promise(resolve=>requestAnimationFrame(resolve));
    }
    await post('/__capture/finish',{});UI.status.textContent='视频已导出 · 1920 × 1080 · 30 帧/秒';UI.download.hidden=false;
  }catch(e){UI.status.textContent='录制未完成：'+e.message;console.error(e);try{await post('/__capture/abort',{});}catch{}}
  finally{recording=false;for(const e of [UI.play,UI.restart,UI.seek,UI.speed,UI.export,UI.check])e.disabled=false;document.getElementById('jump').disabled=false;renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));resize();seek(was);}
}

try{
  model=await loadFilmModel(scene);model.cableData=await fetch('./cable_routes.json?v=hinge-slot').then(r=>r.json());
  motion=createFilmMotion(model);cables=createCableRig(model.cableData,scene,model.pivots,model.mats,model.map,{pose:motion.cablePose});
  for(const e of cables.entries)e.group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  document.getElementById('loading').hidden=true;resize();draw(time);sync();
  UI.play.onclick=()=>{if(time>=DURATION)time=0;playing=!playing;sync();dirty=true;};
  UI.restart.onclick=()=>{time=0;playing=true;sync();dirty=true;};UI.seek.oninput=e=>seek(+e.target.value);
  UI.speed.onclick=()=>{speed=speed===1?.5:speed===.5?2:1;UI.speed.textContent=speed+'×';};
  UI.export.onclick=record;UI.check.hidden=Q.get('qa')!=='1';
  const jump=document.getElementById('jump');jump.hidden=Q.get('qa')!=='1';jump.oninput=()=>{if(jump.value!=='')seek(+jump.value);};
  UI.check.onclick=async()=>{
    playing=false;sync();UI.status.textContent='正在检查动画…';UI.check.disabled=true;
    try{const {checkFilm}=await import('./film-checks.js?v=25s-keys');const result=await checkFilm({model,motion,cables,draw,camera});
      UI.report.hidden=false;UI.report.textContent=JSON.stringify(result,null,2);UI.status.textContent=result.pass?'动画检查通过':'检查发现需要修正的画面';
      if(Q.get('capture')==='1')await post('/__capture/report',result);
    }catch(e){UI.report.hidden=false;UI.report.textContent=e.stack;UI.status.textContent='检查失败';}finally{UI.check.disabled=false;draw(time);}
  };
  if(Q.get('capture')==='1')UI.export.hidden=false;
  if(Q.get('video')==='1')UI.download.hidden=false;
  addEventListener('resize',resize);
  let last=performance.now();function tick(now){requestAnimationFrame(tick);const dt=Math.min((now-last)/1000,.1);last=now;if(recording)return;
    if(playing){time=Math.min(time+dt*speed,DURATION);dirty=true;if(time>=DURATION){playing=false;sync();}}
    if(dirty){draw(time);dirty=false;}}
  requestAnimationFrame(tick);
}catch(e){document.getElementById('loading').textContent='载入失败：'+e.message;console.error(e);}
