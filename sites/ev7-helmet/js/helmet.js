/* Moonshot EV-7 — 渲染环境、材质与头盔各部件的装配 */
(function(){
"use strict";
const __E=window.EV7=window.EV7||{};
if(!window.THREE){
  const el=document.getElementById('lmsg');
  if(el) el.textContent='三维库加载失败，请检查网络后刷新';
  return;
}
const {TAU, DEG, T_SHELL, F_HOLE, VN, VO, VI, lerp, easeIO, sDir, sPos, sNor, apF, apPoint, GB, surfGeo, bandGeo, capGeo, patchGeo, hoseGeo, cv, noiseTex, quiltTex, grilleTex, markTex, plateTex}=__E;

/* ----------------------------------------------------------------- 场景 */
const canvas=document.getElementById('cv');
const renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,alpha:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000,0);

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(38,1,0.02,60);
const root=new THREE.Group(); scene.add(root);

const key=new THREE.DirectionalLight(0xffffff,1.15);
key.position.set(1.5,2.5,1.9); key.castShadow=true;
key.shadow.mapSize.set(2048,2048);
key.shadow.camera.left=-1.2; key.shadow.camera.right=1.2;
key.shadow.camera.top=1.2; key.shadow.camera.bottom=-1.2;
key.shadow.camera.near=0.5; key.shadow.camera.far=8; key.shadow.bias=-0.0012;
scene.add(key);
const rim=new THREE.DirectionalLight(0xc8d8ff,0.45); rim.position.set(-2.2,0.6,-2.0); scene.add(rim);
const fill=new THREE.DirectionalLight(0xffffff,0.25); fill.position.set(-1.0,-1.4,1.6); scene.add(fill);

const ground=new THREE.Mesh(new THREE.PlaneGeometry(9,9), new THREE.ShadowMaterial({opacity:.42}));
ground.rotation.x=-Math.PI/2; ground.position.y=-0.63; ground.receiveShadow=true; scene.add(ground);

const pmrem=new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
let envRT=null;

function envTexture(dark){
  const c=cv(1024,512), x=c.getContext('2d');
  const g=x.createLinearGradient(0,0,0,512);
  if(dark){ g.addColorStop(0,'#5b6673'); g.addColorStop(.46,'#2d333a'); g.addColorStop(.54,'#191d21'); g.addColorStop(1,'#0b0d0f'); }
  else    { g.addColorStop(0,'#f6f7f8'); g.addColorStop(.46,'#d3d7db'); g.addColorStop(.54,'#a9aeb4'); g.addColorStop(1,'#70757a'); }
  x.fillStyle=g; x.fillRect(0,0,1024,512);
  function box(cx,cy,w,h,a,col){
    x.save(); x.translate(cx,cy); x.scale(w,h);
    const rg=x.createRadialGradient(0,0,0,0,0,1);
    rg.addColorStop(0,col.replace('%A%',a)); rg.addColorStop(.5,col.replace('%A%',a));
    rg.addColorStop(1,col.replace('%A%',0));
    x.fillStyle=rg; x.beginPath(); x.arc(0,0,1,0,TAU); x.fill(); x.restore();
  }
  box(250,120,200,105,dark?1:1,'rgba(255,255,255,%A%)');
  x.save(); x.translate(430,168); x.rotate(-0.22);
  box(0,0,300,17,dark?1:1,'rgba(255,255,255,%A%)');
  x.restore();
  x.save(); x.translate(830,300); x.rotate(0.36);
  box(0,0,190,12,dark?.85:.9,'rgba(226,238,255,%A%)');
  x.restore();
  box(690,96,120,150,dark?.8:.9,'rgba(216,230,255,%A%)');
  box(950,250,140,90,dark?.5:.6,'rgba(255,238,215,%A%)');
  box(470,400,260,70,dark?.22:.45,'rgba(190,205,225,%A%)');
  const t=new THREE.CanvasTexture(c);
  t.mapping=THREE.EquirectangularReflectionMapping;
  t.encoding=THREE.sRGBEncoding;
  return t;
}
function buildEnv(dark){
  const t=envTexture(dark);
  const rt=pmrem.fromEquirectangular(t);
  if(envRT) envRT.dispose();
  envRT=rt; scene.environment=rt.texture; t.dispose();
}

/* ------------------------------------------------------------------ 材质 */
const noise=noiseTex();
const M={
  shell:new THREE.MeshPhysicalMaterial({color:0xdadde1,roughness:.44,metalness:0,clearcoat:.4,clearcoatRoughness:.3,roughnessMap:noise,envMapIntensity:.95}),
  shellIn:new THREE.MeshStandardMaterial({color:0xb9bec4,roughness:.62,metalness:0,side:THREE.DoubleSide,envMapIntensity:.6}),
  alu:new THREE.MeshStandardMaterial({color:0x9298a0,roughness:.30,metalness:1,envMapIntensity:1.1,side:THREE.DoubleSide}),
  aluD:new THREE.MeshStandardMaterial({color:0x4b5057,roughness:.26,metalness:1,envMapIntensity:1.1,side:THREE.DoubleSide}),
  dark:new THREE.MeshStandardMaterial({color:0x25282d,roughness:.35,metalness:1,envMapIntensity:1.0,side:THREE.DoubleSide}),
  rubber:new THREE.MeshStandardMaterial({color:0x121416,roughness:.88,metalness:0,side:THREE.DoubleSide,envMapIntensity:.5}),
  seal:new THREE.MeshStandardMaterial({color:0x1b1e22,roughness:.78,metalness:0,side:THREE.DoubleSide,envMapIntensity:.5}),
  liner:new THREE.MeshStandardMaterial({color:0x767d86,roughness:.92,metalness:0,side:THREE.DoubleSide,envMapIntensity:.35}),
  blue:new THREE.MeshStandardMaterial({color:0x2c6796,roughness:.3,metalness:1,envMapIntensity:1.1}),
  red:new THREE.MeshStandardMaterial({color:0x9c3a2e,roughness:.3,metalness:1,envMapIntensity:1.1}),
  glass:new THREE.MeshPhysicalMaterial({color:0xcfe3e6,roughness:.028,metalness:0,transparent:true,opacity:.17,
        clearcoat:1,clearcoatRoughness:.02,envMapIntensity:2.4,side:THREE.FrontSide,depthWrite:false,premultipliedAlpha:true}),
  glassEdge:new THREE.MeshPhysicalMaterial({color:0x9fc8c2,roughness:.05,metalness:0,transparent:true,opacity:.72,
        clearcoat:1,envMapIntensity:2.0,side:THREE.DoubleSide,depthWrite:false})
};
M.coat=new THREE.ShaderMaterial({
  uniforms:{cA:{value:new THREE.Color(0x7fc6de)},cB:{value:new THREE.Color(0xc3aef0)},k:{value:0.62},base:{value:0.020}},
  vertexShader:'varying vec3 vN;varying vec3 vP;void main(){vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.0);vP=mv.xyz;gl_Position=projectionMatrix*mv;}',
  fragmentShader:'uniform vec3 cA;uniform vec3 cB;uniform float k;uniform float base;varying vec3 vN;varying vec3 vP;void main(){float f=1.0-abs(dot(normalize(vN),normalize(-vP)));float e=pow(f,2.4);vec3 c=mix(cA,cB,pow(f,1.6));gl_FragColor=vec4(c*(e*k+base),1.0);}',
  transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide
});
M.liner.map=quiltTex(); M.liner.map.encoding=THREE.sRGBEncoding;
M.liner.bumpMap=M.liner.map; M.liner.bumpScale=.004;

/* ------------------------------------------------------------------ 组件 */
const G={};
['shell','gasket','visor','liner','seal','air','portL','portR','neck'].forEach(function(k){
  G[k]=new THREE.Group(); root.add(G[k]);
});

const HD=apPoint(55*DEG,1.18), HP=sPos(HD,0.026);
const HX=Math.abs(HP[0]), HY=HP[1], HZ=HP[2];

function mesh(g,m,cast,rec){
  const o=new THREE.Mesh(g,m);
  o.castShadow=!!cast; o.receiveShadow=!!rec;
  return o;
}
function alignY(obj,dir){
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
}
function onShell(obj,ax,ay,off){
  const cy=Math.cos(ay), d=[Math.sin(ax)*cy, Math.sin(ay), Math.cos(ax)*cy];
  const p=sPos(d,off), n=sNor(d);
  obj.position.set(p[0],p[1],p[2]);
  alignY(obj,new THREE.Vector3(n[0],n[1],n[2]));
  return obj;
}

/* 壳体 ---------------------------------------------------------------- */
function buildShell(){
  const keep=(u,v)=>apF(sDir(u,v))>F_HOLE;
  G.shell.add(mesh(surfGeo(0,false,keep,168,108,0,VN),M.shell,true,true));
  G.shell.add(mesh(surfGeo(-T_SHELL,true,keep,168,108,0,VN),M.shellIn,false,false));

  // 下缘封边
  const gb=new GB(), a=[],b=[];
  for(let i=0;i<=160;i++){
    const u=i/160*TAU, d=sDir(u,VN), p0=sPos(d,0), p1=sPos(d,-T_SHELL);
    a.push(gb.v(p0[0],p0[1],p0[2],0,-1,0,i/160,0));
    b.push(gb.v(p1[0],p1[1],p1[2],0,-1,0,i/160,1));
  }
  for(let i=0;i<160;i++) gb.quadN(a[i],a[i+1],b[i+1],b[i],0,-1,0);
  G.shell.add(mesh(gb.geo(),M.aluD,false,false));

  // 侧标识
  const mk=markTex('MOONSHOT','EV-7   SN 0042');
  const mkMat=new THREE.MeshStandardMaterial({map:mk,transparent:true,roughness:.5,metalness:0,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,side:THREE.DoubleSide});
  G.shell.add(mesh(patchGeo(1.95,1.30,0.42,0.105,0.0015,26,10),mkMat,false,false));
  const mk2=mk.clone(); mk2.needsUpdate=true; mk2.wrapS=THREE.RepeatWrapping; mk2.repeat.x=-1; mk2.offset.x=1;
  const mkMat2=mkMat.clone(); mkMat2.map=mk2;
  G.shell.add(mesh(patchGeo(-1.95,1.30,0.42,0.105,0.0015,26,10),mkMat2,false,false));

  // 铰链座与面罩卡扣
  for(const s of [-1,1]){
    const br=mesh(new THREE.BoxGeometry(0.052,0.016,0.082),M.aluD,true,false);
    const d=[s*HD[0],HD[1],HD[2]];
    const p=sPos(d,0.006), n=sNor(d);
    br.position.set(p[0],p[1],p[2]); alignY(br,new THREE.Vector3(n[0],n[1],n[2]));
    G.shell.add(br);
    const cap=mesh(new THREE.CylinderGeometry(0.030,0.030,0.012,28),M.alu,true,false);
    cap.rotation.z=Math.PI/2; cap.position.set(s*(HX+0.014),HY,HZ); G.shell.add(cap);
  }
  for(const t of [262,278]){
    const d=apPoint(t*DEG,1.20), p=sPos(d,0.006), n=sNor(d);
    const c=mesh(new THREE.BoxGeometry(0.030,0.016,0.026),M.aluD,true,false);
    c.position.set(p[0],p[1],p[2]); alignY(c,new THREE.Vector3(n[0],n[1],n[2]));
    G.shell.add(c);
  }
  // 顶部低矮凸台（通信）
  const boss=mesh(new THREE.CylinderGeometry(0.055,0.062,0.020,32),M.aluD,true,false);
  onShell(boss,Math.PI,1.05,-0.004); G.shell.add(boss);
  const bcap=mesh(new THREE.CylinderGeometry(0.040,0.040,0.006,32),M.alu,true,false);
  onShell(bcap,Math.PI,1.05,0.016); G.shell.add(bcap);
}

/* 面窗密封框 ---------------------------------------------------------- */
function buildGasket(){
  const prof=[[1.24,-0.030],[1.22,-0.034],[1.02,-0.034],[0.995,-0.030],[0.995,-0.006],[1.00,0.001],
              [1.005,0.004],[1.03,0.006],[1.06,0.0092],[1.09,0.006],[1.12,0.0042],[1.20,0.0032],[1.24,0.0005]];
  const n=sNor(apPoint(0,1.15));
  G.gasket.add(mesh(bandGeo(prof,220,10,n),M.aluD,true,false));
  const bead=[[1.028,0.0055],[1.042,0.0088],[1.062,0.0098],[1.082,0.0086],[1.094,0.0055]];
  G.gasket.add(mesh(bandGeo(bead,200,2,n),M.seal,false,false));
}

/* 面罩 ---------------------------------------------------------------- */
function buildVisor(){
  const piv=new THREE.Group();
  piv.position.set(0,HY,HZ);
  G.visor.add(piv); G.visor.userData.piv=piv;
  const inner=new THREE.Group();
  inner.position.set(0,-HY,-HZ);
  piv.add(inner);

  const out=mesh(capGeo(VO,false,1.0,200,26),M.glass,false,false); out.renderOrder=12;
  const ins=mesh(capGeo(VI,true,1.0,200,26),M.glass,false,false); ins.renderOrder=11;
  inner.add(ins,out);

  // 玻璃边缘（厚度）
  const eg=new GB(), ea=[],eb=[];
  for(let i=0;i<=200;i++){
    const t=i/200*TAU, d=apPoint(t,1.0), p0=sPos(d,VO), p1=sPos(d,VI), n=sNor(d);
    ea.push(eg.v(p0[0],p0[1],p0[2],n[0],n[1],n[2],i/200,0));
    eb.push(eg.v(p1[0],p1[1],p1[2],n[0],n[1],n[2],i/200,1));
  }
  for(let i=0;i<200;i++) eg.quad(ea[i],ea[i+1],eb[i+1],eb[i]);
  const edge=mesh(eg.geo(),M.glassEdge,false,false); edge.renderOrder=10; inner.add(edge);
  const coat=mesh(capGeo(VO+0.0006,false,1.0,200,26),M.coat,false,false); coat.renderOrder=13; inner.add(coat);

  const frame=[[0.930,0.0320],[0.936,0.0370],[0.958,0.0400],[1.012,0.0400],[1.034,0.0368],[1.042,0.0290],
               [1.043,0.0180],[1.036,0.0125],[1.010,0.0105],[0.965,0.0110],[0.938,0.0155],[0.930,0.0210]];
  inner.add(mesh(bandGeo(frame,220,2,sNor(apPoint(0,1.0))),M.aluD,true,false));

  for(const s of [-1,1]){
    const t=(s>0?55:125)*DEG;
    const a=sPos(apPoint(t,1.05),0.030), b=[s>0?HX:-HX,HY,HZ];
    const A=new THREE.Vector3(a[0],a[1],a[2]), B=new THREE.Vector3(b[0],b[1],b[2]);
    const L=A.distanceTo(B);
    const arm=mesh(new THREE.BoxGeometry(0.028,L+0.02,0.013),M.alu,true,false);
    arm.position.copy(A.clone().add(B).multiplyScalar(.5));
    alignY(arm,B.clone().sub(A));
    inner.add(arm);
    const boss=mesh(new THREE.CylinderGeometry(0.023,0.023,0.036,24),M.aluD,true,false);
    boss.rotation.z=Math.PI/2; boss.position.copy(B); inner.add(boss);
  }
  for(const t of [262,278]){
    const d=apPoint(t*DEG,1.045), p=sPos(d,0.018), n=sNor(d);
    const h=mesh(new THREE.BoxGeometry(0.024,0.026,0.013),M.alu,true,false);
    h.position.set(p[0],p[1],p[2]); alignY(h,new THREE.Vector3(n[0],n[1],n[2]));
    inner.add(h);
  }
}

/* 内衬与面部软封 ------------------------------------------------------ */
function buildLiner(){
  const keep=(u,v)=>apF(sDir(u,v))>1.06;
  G.liner.add(mesh(surfGeo(-(T_SHELL+0.042),true,keep,104,72,0,2.30),M.liner,false,false));
  for(const s of [-1,1]){
    const ear=mesh(new THREE.CylinderGeometry(0.062,0.070,0.020,28),M.rubber,false,false);
    onShell(ear,s*1.45,-0.06,-(T_SHELL+0.048));
    G.liner.add(ear);
    const gr=mesh(new THREE.CylinderGeometry(0.044,0.044,0.006,28),new THREE.MeshStandardMaterial({map:grilleTex(),roughness:.7,metalness:.2,side:THREE.DoubleSide}),false,false);
    onShell(gr,s*1.45,-0.06,-(T_SHELL+0.060));
    G.liner.add(gr);
  }
  const crown=mesh(new THREE.TorusGeometry(0.20,0.026,14,60),M.rubber,false,false);
  crown.rotation.x=Math.PI/2; crown.position.y=0.30; G.liner.add(crown);

  const prof=[[0.935,-0.0135],[0.952,-0.0098],[0.990,-0.0120],[1.020,-0.0200],[1.060,-0.0335],
              [1.120,-0.0475],[1.210,-0.0600],[1.340,-0.0665]];
  const n=sNor(apPoint(0,1.05));
  G.seal.add(mesh(bandGeo(prof,200,3,[-n[0],-n[1],-n[2]]),M.seal,false,false));
}

/* 内部风道与格栅 ------------------------------------------------------ */
function buildAir(){
  const gm=new THREE.MeshStandardMaterial({map:grilleTex(),roughness:.65,metalness:.25,side:THREE.DoubleSide});
  const brow=mesh(patchGeo(0,Math.acos(Math.sin(0.70)),0.72,0.070,-(T_SHELL+0.012),34,8),gm,false,false);
  const chin=mesh(patchGeo(0,Math.acos(Math.sin(-0.84)),0.30,0.055,-(T_SHELL+0.012),22,8),gm,false,false);
  G.air.add(brow,chin);
  for(const s of [-1,1]){
    const pts=[];
    for(let i=0;i<=10;i++){
      const t=i/10;
      const ax=lerp(s*2.25,s*0.90,easeIO(t)), ay=lerp(-0.42,0.63,easeIO(t));
      const cy=Math.cos(ay), d=[Math.sin(ax)*cy,Math.sin(ay),Math.cos(ax)*cy];
      const p=sPos(d,-(T_SHELL+0.014));
      pts.push(new THREE.Vector3(p[0],p[1],p[2]));
    }
    const cu=new THREE.CatmullRomCurve3(pts);
    G.air.add(mesh(hoseGeo(cu,80,()=>0.016,10),M.rubber,false,false));
  }
}

/* 生命维持接口 -------------------------------------------------------- */
function portAssembly(colorMat,label){
  const g=new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.082,0.088,0.026,36),M.aluD,true,false).translateY(0.005));
  for(let i=0;i<6;i++){
    const s=mesh(new THREE.CylinderGeometry(0.0062,0.0062,0.008,10),M.alu,false,false);
    s.position.set(Math.cos(i/6*TAU)*0.070,0.020,Math.sin(i/6*TAU)*0.070); g.add(s);
  }
  g.add(mesh(new THREE.CylinderGeometry(0.046,0.052,0.040,32),M.alu,true,false).translateY(0.036));
  const knurl=mesh(new THREE.CylinderGeometry(0.056,0.056,0.022,26),M.aluD,true,false);
  knurl.material=M.aluD.clone(); knurl.material.flatShading=true; knurl.material.needsUpdate=true;
  knurl.position.y=0.066; g.add(knurl);
  g.add(mesh(new THREE.TorusGeometry(0.050,0.0062,10,36),colorMat,true,false).translateY(0.082).rotateX(Math.PI/2));
  g.add(mesh(new THREE.CylinderGeometry(0.040,0.040,0.010,32),M.dark,true,false).translateY(0.090));
  g.add(mesh(new THREE.CylinderGeometry(0.026,0.026,0.008,28),M.rubber,false,false).translateY(0.094));
  g.add(mesh(new THREE.CylinderGeometry(0.016,0.016,0.004,24),new THREE.MeshStandardMaterial({color:0x050607,roughness:.9}),false,false).translateY(0.097));
  const pl=mesh(new THREE.BoxGeometry(0.088,0.004,0.044),new THREE.MeshStandardMaterial({map:plateTex(label),roughness:.55,metalness:.3}),false,false);
  pl.position.set(0,0.012,0.094); g.add(pl);
  return g;
}
function buildPorts(){
  const L=portAssembly(M.blue,['O₂ 供气','0.4 MPa']);
  onShell(L,-2.25,-0.42,-0.010); G.portL.add(L);
  const R2=portAssembly(M.red,['回气 / 排湿']);
  onShell(R2,2.25,-0.42,-0.010); G.portR.add(R2);

  // 电缆接头 + 波纹软管
  for(const s of [-1,1]){
    const grp=s<0?G.portL:G.portR;
    const con=new THREE.Group();
    con.add(mesh(new THREE.BoxGeometry(0.072,0.030,0.052),M.aluD,true,false).translateY(0.015));
    con.add(mesh(new THREE.CylinderGeometry(0.022,0.024,0.026,24),M.alu,true,false).translateY(0.040));
    onShell(con,s*1.98,-0.66,-0.006); grp.add(con);

    const cy=Math.cos(-0.42), d=[Math.sin(s*2.25)*cy,Math.sin(-0.42),Math.cos(s*2.25)*cy];
    const a=sPos(d,0.095), n=sNor(d);
    const p0=new THREE.Vector3(a[0],a[1],a[2]);
    const p1=p0.clone().add(new THREE.Vector3(n[0],n[1],n[2]).multiplyScalar(0.10));
    const p2=new THREE.Vector3(s*0.30,-0.50,-0.34);
    const p3=new THREE.Vector3(s*0.16,-0.66,-0.24);
    const cu=new THREE.CatmullRomCurve3([p0,p1,p2,p3]);
    grp.add(mesh(hoseGeo(cu,120,t=>0.028+0.0055*Math.sin(t*58),14),M.rubber,true,false));
  }
}

/* 颈环 ---------------------------------------------------------------- */
function buildNeck(){
  const pts=[[0.3585,-0.370],[0.3640,-0.392],[0.3640,-0.418],[0.3530,-0.430],[0.3585,-0.444],
             [0.3585,-0.470],[0.3300,-0.470],[0.3300,-0.402],[0.3460,-0.376],[0.3585,-0.370]]
    .map(p=>new THREE.Vector2(p[0],p[1]));
  const lathe=new THREE.LatheGeometry(pts,96);
  const ring=mesh(lathe,M.alu,true,true); G.neck.add(ring);
  for(let i=0;i<8;i++){
    const a=i/8*TAU;
    const lug=mesh(new THREE.BoxGeometry(0.044,0.016,0.020),M.aluD,true,false);
    lug.position.set(Math.sin(a)*0.368,-0.412,Math.cos(a)*0.368);
    lug.rotation.y=a; G.neck.add(lug);
  }
  const lever=mesh(new THREE.BoxGeometry(0.100,0.014,0.022),M.aluD,true,false);
  lever.position.set(0.20,-0.436,0.300); lever.rotation.y=-0.62; G.neck.add(lever);
  const tip=mesh(new THREE.CylinderGeometry(0.013,0.013,0.020,20),M.red,true,false);
  tip.position.set(0.246,-0.436,0.268); G.neck.add(tip);
  const band=mesh(new THREE.TorusGeometry(0.3545,0.0055,10,96),M.seal,false,false);
  band.rotation.x=Math.PI/2; band.position.y=-0.4305; G.neck.add(band);
}

/* ------------------------------------------------------------- 分解方向 */
const EXP=[
  ['visor',[0,0.10,0.46]], ['gasket',[0,0.03,0.24]], ['seal',[0,-0.04,-0.20]],
  ['liner',[0,-0.02,-0.46]], ['air',[0,0.46,-0.12]],
  ['portL',[-0.42,-0.12,-0.16]], ['portR',[0.42,-0.12,-0.16]], ['neck',[0,-0.42,0]]
];

Object.assign(__E,{canvas, renderer, scene, camera, root, key, rim, fill, ground, pmrem, envTexture, buildEnv, M, G, HX, HY, HZ, mesh, alignY, onShell, EXP, buildShell, buildGasket, buildVisor, buildLiner, buildAir, buildPorts, buildNeck});
})();
