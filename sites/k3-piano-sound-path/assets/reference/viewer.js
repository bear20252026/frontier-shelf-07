import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createInspector} from './inspector.js';
import {createAssembly} from './assembly.js';

const $=id=>document.getElementById(id),errors=[];
addEventListener('error',e=>errors.push(e.message));
const [data,names,notes]=await Promise.all(['outlines.json','item-names.json','system-notes.json'].map(file=>fetch('assets/reference/'+file).then(r=>{if(!r.ok)throw Error(file+' failed to load');return r.json();}))),u=data.unitsPerPixel;
const renderer=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.setClearColor(0xf3f1ed,0);
document.body.insertBefore(renderer.domElement,$('reference').nextSibling);
const scene=new T.Scene(),camera=new T.OrthographicCamera(),controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=false;controls.enableRotate=false;controls.enablePan=true;controls.minZoom=.7;controls.maxZoom=8;
const pmrem=new T.PMREMGenerator(renderer),environment=new RoomEnvironment();
// Tall softbox reflections make the polished curved case readable, while
// the broad, rough reflection on the lid stays matte.
for(const [position,width,height,power] of [[[-4,2.6,-3.5],1.5,4.8,2.4],[[3.5,2.4,4],1.2,4.5,1.6]]){
 const panel=new T.Mesh(new T.PlaneGeometry(width,height),new T.MeshBasicMaterial({color:new T.Color(power,power,power),side:T.DoubleSide}));
 panel.position.set(...position);panel.lookAt(0,1,0);environment.add(panel);
}
environment.rotation.set(Math.PI/2,0,.25);environment.updateMatrixWorld(true);scene.environment=pmrem.fromScene(environment,.03).texture;environment.dispose();pmrem.dispose();
scene.add(new T.HemisphereLight(0xffffff,0xb5ab97,1.2));
const key=new T.DirectionalLight(0xfff9ed,2.4);key.position.set(-3.6,9,-5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);
Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.1,far:25});key.shadow.normalBias=.004;key.shadow.bias=-.00003;key.shadow.radius=4;
scene.add(key);const fill=new T.DirectionalLight(0xf0f4ff,1.05);fill.position.set(7,6,4);scene.add(fill);
const floor=new T.Mesh(new T.PlaneGeometry(100,100),new T.ShadowMaterial({color:0x514b42,opacity:.22}));
floor.rotation.x=-Math.PI/2;floor.position.y=-.004;floor.receiveShadow=true;scene.add(floor);
const root=new T.Group();scene.add(root);const meshes=[],units=[],materialCache=new Map();

function finish(d){
 const c=new T.Color(d.color||'#8b8980'),key=d.id||'',name=d.material||'';
 if(name==='black')return {color:0x090b0c,metalness:.04,roughness:.36,clearcoat:.3,clearcoatRoughness:.3,envMapIntensity:.30};
 if(name==='plate')return {color:d.color||0xc17e35,metalness:.45,roughness:.44,clearcoat:.2,envMapIntensity:.6};
 if(name==='brass')return {color:d.color||0xc29542,metalness:.78,roughness:.28,envMapIntensity:.85};
 if(/felt|毡/.test(name))return {color:d.color||0xaaa69e,metalness:0,roughness:.93};
 if(name==='steel'||/WIRE-|PIN-/.test(key))return {color:d.color||0x929591,metalness:.80,roughness:.32};
 if(/WHITE/.test(key))return {color:0xeee7d5,metalness:.01,roughness:.32,clearcoat:.25};
 if(/BLACK/.test(key))return {color:0x111713,metalness:.02,roughness:.29,clearcoat:.4};
 if(name==='wood'||/WOOD/.test(key))return {color:key==='CFX-M03'?0xe1ae47:(d.color||0xd7b789),metalness:0,roughness:.57,clearcoat:.16};
 const hi=Math.max(c.r,c.g,c.b),lo=Math.min(c.r,c.g,c.b);
 if(hi<.035)return {color:0x141819,metalness:.18,roughness:.4,clearcoat:.3};
 if(c.r>c.g*1.45&&c.r>c.b*1.5)return {color:c,metalness:.04,roughness:.80};
 if(c.r>c.b*1.25&&c.g>c.b*1.06)return {color:c,metalness:.10,roughness:.51};
 return {color:c,metalness:.55,roughness:.43};
}
function material(d,flat=false){
 const f=flat?{color:d.color||'#aaa69e'}:finish(d),k=(flat?'flat:':'solid:')+JSON.stringify(f);
 if(!materialCache.has(k))materialCache.set(k,flat?new T.MeshBasicMaterial(f):new T.MeshPhysicalMaterial({envMapIntensity:.5,...f}));
 return materialCache.get(k);
}
function path(points,cx,cy,shape=false){
 const p=shape?new T.Shape():new T.Path();
 points.forEach(([x,y],i)=>p[i?'lineTo':'moveTo']((x-cx)*u,-(y-cy)*u));p.closePath();return p;
}
for(const d of data.items){
 try{
  const [x,y,w,h]=d.box,cx=x+w/2,cy=y+h/2,group=new T.Group();
  group.position.set((cx-data.width/2)*u,.007,(cy-data.height/2)*u);group.userData=d;root.add(group);units.push(group);
  for(const piece of d.pieces||[d]){
   const q={...d,...piece,id:d.id},shape=path(q.polygon,cx,cy,true);
   for(const hole of q.holes||[])if(hole.length>=3)shape.holes.push(path(hole,cx,cy));
   const major=d.review==='reviewed-major-outline',minSize=Math.min(w,h)*u;
   const bevel=major?Math.min(.003,minSize*.03):Math.min(.001,minSize*.013);
   let depth=q.thickness||.012;
   if(d.id==='CFX-M03')depth=.035;
   if(d.id==='CFX-M07')depth=.10;
   if(['CFX-M01','CFX-M02'].includes(d.id))depth=.045;
   const geo=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:bevel>.0001,bevelSize:bevel,bevelThickness:bevel,bevelSegments:2,steps:1,curveSegments:5}).rotateX(-Math.PI/2);
   const mesh=new T.Mesh(geo,material(q));mesh.position.y=q.baseHeight||0;mesh.userData={...d,pieceData:q,unit:group};mesh.castShadow=true;mesh.receiveShadow=true;
   group.add(mesh);meshes.push(mesh);
  }
 }catch(e){errors.push(d.id+': '+e.message);}
}
const selectedMaterial=new T.MeshStandardMaterial({color:0x923a47,roughness:.48,metalness:.12});
const ray=new T.Raycaster(),pointer=new T.Vector2();
let mode='assembly',selected=null,hovered=null,dirty=true,down=null;
const assembly=createAssembly({units,names,meshes,camera,controls,scene,markDirty:()=>{dirty=true;}});
const inspector=createInspector({names,notes,onSelect:id=>chooseItem(id,true),onClose:()=>clearSelection()});
const isFlat=()=>mode==='outline'||mode==='overlay';
function paint(group,highlight){for(const m of group.children){
 const next=highlight?selectedMaterial:(!isFlat()&&m.userData.exteriorBaseMaterial?m.userData.exteriorBaseMaterial:material(m.userData.pieceData,isFlat()));
 if(group.userData.id==='R-AUTO-2912'||m.userData.exteriorOriginal||m.userData.exteriorDetail||m.userData.exteriorBaseMaterial){if(m.userData.privateMaterial)m.material.dispose();m.material=next.clone();m.userData.privateMaterial=true;m.material.opacity=m.userData.assemblyOpacity??1;m.material.transparent=m.material.opacity<.999;m.material.depthWrite=m.material.opacity>.999;}else m.material=next;
}}
function fit(){
 if(mode==='assembly'||mode==='solid'){assembly.view(assembly.progress);dirty=true;return;}
 const aspect=innerWidth/innerHeight,h=Math.max(data.height*u,data.width*u/aspect)*1.10;
 camera.left=-h*aspect/2;camera.right=h*aspect/2;camera.top=h/2;camera.bottom=-h/2;camera.near=.01;camera.far=100;camera.zoom=1;
 camera.up.set(0,1,0);camera.position.set(0,mode==='solid'?11:18,mode==='solid'?8:.0001);camera.lookAt(0,0,0);camera.updateProjectionMatrix();controls.target.set(0,0,0);controls.update();syncPhoto();dirty=true;
}
function syncPhoto(){
 const h=(camera.top-camera.bottom)/camera.zoom,f=innerHeight/h,w=data.width*u*f,hh=data.height*u*f;
 $('reference').style.cssText=`width:${w}px;height:${hh}px;left:${(innerWidth-w)/2}px;top:${(innerHeight-hh)/2}px;display:${mode==='photo'||mode==='overlay'?'block':'none'};opacity:${mode==='overlay'?.65:1}`;
}
function setMode(next){
 const preserveView=next==='solid'&&['assembly','solid'].includes(mode);
 mode=next;controls.enableRotate=mode==='solid'||mode==='assembly';controls.enablePan=['model','outline','solid','assembly'].includes(mode);controls.enableZoom=controls.enablePan;
 renderer.domElement.style.opacity=mode==='photo'?0:mode==='overlay'?.46:1;floor.visible=['model','solid','assembly'].includes(mode);
 renderer.toneMapping=isFlat()?T.NoToneMapping:T.ACESFilmicToneMapping;
 for(const g of units)paint(g,g===selected||g===hovered);
 assembly.setEnabled(mode==='assembly'||mode==='solid');
 if(mode==='solid')assembly.pause();
 if(!['assembly','solid'].includes(mode))assembly.setProgress(1,false);
 document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));if(!preserveView)fit();dirty=true;
 $('region').textContent=mode==='assembly'?'Assembled → spread layers → photographed flat lay · drag the progress slider below':mode==='solid'?'3D view · drag to orbit · scroll to zoom · right-drag to pan':'Click a part to see its name and role · positions match the source photo';
}
function highlight(group){
 if(hovered&&hovered!==selected)paint(hovered,false);hovered=group;if(group)paint(group,true);
 inspector.show((selected||group)?.userData.id,!!selected);dirty=true;
}
function clearSelection(){if(selected)paint(selected,false);selected=null;highlight(null);}
function chooseItem(id,focus=false){
 assembly.pause();
 const group=units.find(g=>g.userData.id===id);if(!group)return;
 if(mode==='photo'||mode==='overlay')setMode('model');
 if(selected)paint(selected,false);selected=group;highlight(group);
 if(focus){
  const offset=camera.position.clone().sub(controls.target),bounds=new T.Box3().setFromObject(group,true),target=bounds.getCenter(new T.Vector3());
  controls.target.copy(target);camera.position.copy(target).add(offset);camera.lookAt(target);
  camera.zoom=Math.min(6,Math.max(1.6,(camera.top-camera.bottom)*.55/Math.max(...bounds.getSize(new T.Vector3()).toArray())));
  camera.updateProjectionMatrix();controls.update();dirty=true;
 }
}
function hit(e){pointer.set(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2);ray.setFromCamera(pointer,camera);return ray.intersectObjects(meshes,false).find(h=>h.object.visible&&h.object.material.opacity>.01)?.object.userData.unit||null;}
renderer.domElement.addEventListener('pointermove',e=>{if(!e.buttons&&mode!=='photo')highlight(hit(e));});
renderer.domElement.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);
renderer.domElement.addEventListener('pointerup',e=>{
 if(mode==='photo'||e.button!==0||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>6)return;
 const group=hit(e);if(selected)paint(selected,false);selected=selected===group?null:group;highlight(group);
});
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
$('reset').onclick=()=>{clearSelection();inspector.reset();assembly.pause();setMode('assembly');assembly.setProgress(0);};
addEventListener('keydown',e=>{if(e.key==='Escape')$('reset').click();});
controls.addEventListener('start',()=>assembly.pause());
$('assemblyProgress').addEventListener('input',e=>{assembly.pause();if(mode!=='assembly')setMode('assembly');assembly.setProgress(Number(e.target.value)/1000);});
$('assemblyPlay').onclick=()=>{if(mode!=='assembly')setMode('assembly');assembly.playing?assembly.pause():assembly.play();};
$('assembleNow').onclick=()=>{assembly.pause();setMode('assembly');if(assembly.progress>.001)assembly.play(-1);else assembly.setProgress(0);};
$('explodeNow').onclick=()=>{assembly.pause();setMode('assembly');assembly.setProgress(1);};
document.querySelector('[data-mode="assembly"]').onclick=()=>{assembly.pause();setMode('assembly');assembly.setProgress(0);};
controls.addEventListener('change',()=>{syncPhoto();dirty=true;});addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);fit();});
$('counts').textContent=`${units.length} modeled units · names and system notes included`;
$('loading').style.display='none';
window.__REFERENCE={ready:true,THREE:T,data,names,notes,meshes,units,scene,camera,renderer,setMode,chooseItem,assembly,errors};
const query=new URLSearchParams(location.search);setMode(query.get('mode')||'assembly');
if(mode==='assembly'){assembly.setProgress(Number(query.get('p')||0));if(!query.has('freeze'))assembly.play();}
inspector.show(null);
function frame(now){requestAnimationFrame(frame);assembly.tick(now||performance.now());if(dirty){renderer.render(scene,camera);dirty=false;}window.__REFERENCE.mode=mode;window.__REFERENCE.selected=selected?.userData.id||null;}
frame();
