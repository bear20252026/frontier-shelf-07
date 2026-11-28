/* Moonshot EV-7 — 标注、相机、交互与主循环 */
(function(){
"use strict";
const __E=window.EV7=window.EV7||{};
if(!window.THREE){
  const el=document.getElementById('lmsg');
  if(el) el.textContent='三维库加载失败，请检查网络后刷新';
  return;
}
const {DEG, LIFT, clamp, lerp, damp, canvas, renderer, scene, camera, root, key, rim, ground, buildEnv, M, G, HY, HZ, EXP, buildShell, buildGasket, buildVisor, buildLiner, buildAir, buildPorts, buildNeck}=__E;

/* ------------------------------------------------------------------ 标注 */
const ANNO=[
  {g:'gasket',  p:[0.34,0.30,0.30], t:'密封框与铰链', s:'压紧唇封，抬起 52°', side:'r'},
  {g:'portR',   p:[0.40,-0.26,-0.24], t:'生命维持接口', s:'供气 / 回气 + 通信', side:'r'},
  {g:'neck',    p:[-0.30,-0.44,0.18], t:'颈环锁定', s:'8 爪卡口，带锁杆', side:'l'},
  {g:'liner',   p:[-0.26,0.06,-0.16], t:'内部衬层', s:'绗缝软垫与耳罩', side:'l', inside:true},
  {g:'air',     p:[0,0.26,0.30], t:'除雾风道', s:'气流沿面罩内表面下行', side:'r', inside:true}
];
const labelWrap=document.getElementById('labels');
ANNO.forEach(function(a){
  const el=document.createElement('div');
  el.className='lb'+(a.side==='r'?' r':'');
  el.innerHTML=a.side==='r'
    ? '<b>'+a.t+'</b><u></u><i></i><s>'+a.s+'</s>'
    : '<i></i><u></u><b>'+a.t+'</b><s>'+a.s+'</s>';
  labelWrap.appendChild(el);
  a.el=el;
  a.obj=new THREE.Object3D();
  a.obj.position.set(a.p[0],a.p[1],a.p[2]);
  G[a.g].add(a.obj);
});

/* ------------------------------------------------------------------ 相机 */
const HEAD=new THREE.Vector3(0,-0.02,-0.02);
const st={
  az:-34*DEG, pol:78*DEG, rad:1.70,
  tAz:-34*DEG, tPol:78*DEG, tRad:1.70,
  inside:0, tInside:0,
  lift:0, tLift:0,
  ex:0, tEx:0,
  fov:38, tFov:38,
  auto:true, idle:0
};
const shots=[
  {az:0,     pol:88,  rad:1.62, in:0, lift:0, ex:0},
  {az:-34,   pol:78,  rad:1.70, in:0, lift:0, ex:0},
  {az:-22,   pol:72,  rad:1.92, in:0, lift:1, ex:0},
  {az:8,     pol:92,  rad:1.20, in:1, lift:0, ex:0},
  {az:142,   pol:104, rad:1.02, in:0, lift:0, ex:0},
  {az:-42,   pol:80,  rad:2.30, in:0, lift:1, ex:1}
];

const tmpV=new THREE.Vector3(), camA=new THREE.Vector3(), camB=new THREE.Vector3(), tgtA=new THREE.Vector3(), tgtB=new THREE.Vector3();
function updateCamera(){
  const sp=Math.sin(st.pol), cp=Math.cos(st.pol);
  camA.set(Math.sin(st.az)*sp, cp, Math.cos(st.az)*sp).multiplyScalar(st.rad);
  tgtA.set(0,0.0,0);
  camB.copy(HEAD);
  tgtB.copy(HEAD).add(tmpV.set(Math.sin(st.az)*sp, cp, Math.cos(st.az)*sp).multiplyScalar(1.0));
  const k=st.inside;
  camera.position.lerpVectors(camA,camB,k);
  tmpV.lerpVectors(tgtA,tgtB,k);
  camera.lookAt(tmpV);
  camera.fov=lerp(38,st.fov,k);
  camera.updateProjectionMatrix();
}

/* ----------------------------------------------------------------- 交互 */
let drag=false,lx=0,ly=0,pinch=0;
function down(x,y){drag=true;lx=x;ly=y;st.auto=false;st.idle=0;canvas.classList.add('dragging');}
function move(x,y){
  if(!drag)return;
  const dx=(x-lx)/innerWidth, dy=(y-ly)/innerHeight;
  lx=x; ly=y;
  st.tAz-=dx*3.4*(st.tInside>.5?-1:1);
  st.tPol=clamp(st.tPol-dy*2.6*(st.tInside>.5?-1:1), 16*DEG, 164*DEG);
  st.idle=0;
}
function up(){drag=false;canvas.classList.remove('dragging');}
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);down(e.clientX,e.clientY);});
canvas.addEventListener('pointermove',e=>move(e.clientX,e.clientY));
canvas.addEventListener('pointerup',up);
canvas.addEventListener('pointercancel',up);
canvas.addEventListener('wheel',e=>{
  e.preventDefault(); st.auto=false; st.idle=0;
  if(st.tInside>.5) st.tFov=clamp(st.tFov*(1+Math.sign(e.deltaY)*0.07),24,76);
  else st.tRad=clamp(st.tRad*(1+Math.sign(e.deltaY)*0.09),0.80,4.2);
},{passive:false});
canvas.addEventListener('touchstart',e=>{
  if(e.touches.length===2){ pinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY); drag=false; }
},{passive:true});
canvas.addEventListener('touchmove',e=>{
  if(e.touches.length===2&&pinch){
    const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
    const r=pinch/d; pinch=d; st.auto=false; st.idle=0;
    if(st.tInside>.5) st.tFov=clamp(st.tFov*r,24,76); else st.tRad=clamp(st.tRad*r,0.80,4.2);
  }
},{passive:true});
canvas.addEventListener('touchend',()=>{pinch=0;});

const bVisor=document.getElementById('bVisor'), bView=document.getElementById('bView'),
      bAnno=document.getElementById('bAnno'), bSave=document.getElementById('bSave'),
      exr=document.getElementById('exr'), exo=document.getElementById('exo');
let annoOn=true;

function setVisor(v){ st.tLift=v?LIFT:0; bVisor.textContent=v?'放下面罩':'抬起面罩'; bVisor.setAttribute('aria-pressed',v?'true':'false'); }
function setView(v){
  st.tInside=v?1:0;
  bView.textContent=v?'回到外部':'进入内部';
  bView.setAttribute('aria-pressed',v?'true':'false');
  if(v){ st.tFov=52; st.tAz=8*DEG; st.tPol=92*DEG; } else { st.tRad=clamp(st.tRad,1.2,4.2); }
}
function setEx(v){ st.tEx=v; exr.value=Math.round(v*100); exo.textContent=Math.round(v*100)+'%'; }
bVisor.onclick=()=>setVisor(st.tLift===0);
bView.onclick=()=>setView(st.tInside<.5);
bAnno.onclick=()=>{annoOn=!annoOn; bAnno.textContent=annoOn?'隐藏标注':'显示标注'; bAnno.setAttribute('aria-pressed',annoOn?'true':'false');};
exr.oninput=()=>{ setEx(exr.value/100); st.auto=false; };

document.querySelectorAll('#shots button').forEach(function(b){
  b.onclick=function(){
    const s=shots[+b.dataset.shot];
    document.querySelectorAll('#shots button').forEach(x=>x.classList.remove('on'));
    b.classList.add('on');
    st.tAz=s.az*DEG; st.tPol=s.pol*DEG; st.tRad=s.rad;
    setVisor(!!s.lift); setEx(s.ex); setView(!!s.in);
    st.auto=false; st.idle=0;
  };
});
addEventListener('keydown',function(e){
  if(e.target.tagName==='INPUT')return;
  const k=e.key.toLowerCase();
  if(k==='v') setVisor(st.tLift===0);
  else if(k==='i') setView(st.tInside<.5);
  else if(k==='e') setEx(st.tEx>.5?0:1);
});

/* ------------------------------------------------------------- 保存这一帧 */
// 以 2400 px 长边重新渲染当前画面，合成背景后导出 PNG。
// 在 claude.ai 上走平台的下载能力，本地打开时退回浏览器下载。
function grabFrame(done){
  const w=canvas.clientWidth,h=canvas.clientHeight,pr=renderer.getPixelRatio();
  const scale=Math.min(3,Math.max(1,2400/Math.max(w,h)));
  renderer.setPixelRatio(Math.min(3,pr*scale));
  renderer.setSize(w,h,false); updateCamera(); renderer.render(scene,camera);
  const cw=canvas.width, ch=canvas.height;
  const off=document.createElement('canvas'); off.width=cw; off.height=ch;
  const g2=off.getContext('2d');
  const cs=getComputedStyle(document.body);
  g2.save(); g2.translate(cw*0.5,ch*0.34);
  const rr=ch*0.9; g2.scale(cw*1.2/rr,1);
  const grd=g2.createRadialGradient(0,0,0,0,0,rr);
  grd.addColorStop(0,cs.getPropertyValue('--stage-1').trim()||'#1b1f23');
  grd.addColorStop(.68,cs.getPropertyValue('--stage-2').trim()||'#0a0b0d');
  grd.addColorStop(1,cs.getPropertyValue('--stage-2').trim()||'#0a0b0d');
  g2.fillStyle=grd; g2.fillRect(-cw*2,-ch*2,cw*4,ch*4); g2.restore();
  g2.drawImage(canvas,0,0);
  off.toBlob(function(blob){
    renderer.setPixelRatio(pr); renderer.setSize(w,h,false);
    if(blob) done(blob);
  },'image/png');
}
function saveLocally(){
  bSave.hidden=false;
  bSave.onclick=function(){
    grabFrame(function(blob){
      const u=URL.createObjectURL(blob), a=document.createElement('a');
      a.href=u; a.download='moonshot-ev7.png'; a.click();
      setTimeout(function(){URL.revokeObjectURL(u);},4000);
      bSave.textContent='已保存'; setTimeout(function(){bSave.textContent='保存这一帧';},1600);
    });
  };
}
if(window.claude&&claude.use){
  claude.use('downloads').then(function(dl){
    if(!dl){ saveLocally(); return; }
    bSave.hidden=false;
    bSave.onclick=function(){
      grabFrame(function(blob){
        bSave.textContent='保存中…';
        dl.save({filename:'moonshot-ev7.png',data:blob})
          .then(function(){bSave.textContent='已保存';setTimeout(function(){bSave.textContent='保存这一帧';},1600);})
          .catch(function(){bSave.textContent='保存这一帧';});
      });
    };
  }).catch(saveLocally);
}else{ saveLocally(); }

/* ------------------------------------------------------------- 主题与尺寸 */
const mq=matchMedia('(prefers-color-scheme: dark)');
function themeDark(){ return document.documentElement.dataset.theme ? document.documentElement.dataset.theme==='dark' : mq.matches; }
function applyTheme(){
  const d=themeDark();
  buildEnv(d);
  ground.material.opacity=d?.42:.22;
  renderer.toneMappingExposure=d?1.05:1.14;
  rim.intensity=d?.45:.30;
  M.shell.color.setHex(d?0xdadde1:0xe6e8ea);
  M.glass.opacity=d?.17:.21;
}
mq.addEventListener?mq.addEventListener('change',applyTheme):mq.addListener(applyTheme);

function resize(){
  const w=innerWidth,h=innerHeight;
  camera.aspect=w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h,false);
}
addEventListener('resize',resize);

/* ------------------------------------------------------------------ 主循环 */
const ndc=new THREE.Vector3(), wp=new THREE.Vector3(), cdir=new THREE.Vector3();
let last=performance.now();
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

function frame(now){
  const dt=Math.min(0.05,(now-last)/1000); last=now;
  st.idle+=dt;
  if(!reduced && !drag && st.idle>5 && st.tInside<.5) st.auto=true;
  if(st.auto && st.tInside<.5) st.tAz+=dt*0.09;

  st.az=damp(st.az,st.tAz,7,dt);
  st.pol=damp(st.pol,st.tPol,7,dt);
  st.rad=damp(st.rad,st.tRad,6,dt);
  st.fov=damp(st.fov,st.tFov,6,dt);
  st.inside=damp(st.inside,st.tInside,4.2,dt);
  st.lift=damp(st.lift,st.tLift,6.5,dt);
  st.ex=damp(st.ex,st.tEx,6,dt);

  const piv=G.visor.userData.piv;
  if(piv){
    const f=st.lift/LIFT;
    piv.rotation.x=-st.lift;
    piv.position.set(0,HY+0.012*f,HZ+0.016*f);
  }
  for(let i=0;i<EXP.length;i++){
    const v=EXP[i][1];
    G[EXP[i][0]].position.set(v[0]*st.ex,v[1]*st.ex,v[2]*st.ex);
  }

  updateCamera();
  root.updateMatrixWorld(true);
  cdir.copy(camera.position).normalize();

  const showL=annoOn&&st.ex<0.85;
  for(let i=0;i<ANNO.length;i++){
    const a=ANNO[i];
    if(!showL||(!!a.inside)!==(st.inside>.5)){ a.el.classList.remove('vis'); continue; }
    a.obj.getWorldPosition(wp);
    ndc.copy(wp).project(camera);
    const on=ndc.z<1 && Math.abs(ndc.x)<0.95 && Math.abs(ndc.y)<0.92 &&
             (a.inside ? true : wp.clone().normalize().dot(cdir)>-0.15);
    a.el.classList.toggle('vis',on);
    if(on){
      a.el.style.left=((ndc.x*0.5+0.5)*innerWidth)+'px';
      a.el.style.top=((-ndc.y*0.5+0.5)*innerHeight)+'px';
    }
  }
  renderer.render(scene,camera);
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ 启动 */
const bari=document.getElementById('bari'), lmsg=document.getElementById('lmsg');
const steps=[
  ['正在构建外壳与面窗开口', buildShell],
  ['正在装配密封框', buildGasket],
  ['正在成型面罩与镀膜', buildVisor],
  ['正在铺设内部衬层', buildLiner],
  ['正在连接除雾风道', buildAir],
  ['正在安装生命维持接口', buildPorts],
  ['正在锁定颈环', buildNeck]
];
let si=0;
function step(){
  if(si<steps.length){
    lmsg.textContent=steps[si][0];
    bari.style.transform='scaleX('+((si+1)/(steps.length+1))+')';
    try{ steps[si][1](); }catch(err){ console.error(err); }
    si++;
    requestAnimationFrame(step);
    return;
  }
  bari.style.transform='scaleX(1)';
  applyTheme();
  resize();
  const l=document.getElementById('loader');
  setTimeout(function(){ l.classList.add('gone'); setTimeout(()=>l.remove(),700); },160);
  requestAnimationFrame(frame);
  setTimeout(function(){ const h=document.getElementById('hint'); if(h) h.style.opacity='0'; },9000);
}
requestAnimationFrame(step);
})();
