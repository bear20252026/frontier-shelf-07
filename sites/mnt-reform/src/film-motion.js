import * as THREE from 'three';
export const DURATION=25;
// Keep the established cue sheet in sync across parts, cables, camera and UI.
export const filmTime=seconds=>seconds*DURATION/15;
export const FRONT_YAW=Math.atan(.62);
export const TIMING=Object.fromEntries(Object.entries({bottomFlip:[2.45,3.1],returnFlip:[8.15,8.7],lidTurn:[9.85,10.2],lidDrop:[10.25,10.65],closedTurn:[10.85,11.45],lidOpen:[11.6,12.8],boot:[12.9,13.15],kimi:13.4,closedCheck:11.5}).map(([name,value])=>[name,Array.isArray(value)?value.map(filmTime):filmTime(value)]));
export const clamp=x=>Math.max(0,Math.min(1,x));
export const ease=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10);};
export const ramp=(t,a,b)=>ease((t-a)/(b-a));
const Y=new THREE.Vector3(0,1,0);
// Stable variation keeps component rain identical when seeking and exporting.
function randomFor(name,salt=0){let h=(2166136261^salt)>>>0;for(const c of name)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return h/4294967296;}
export const CHAPTERS=[
  [0,'01 / 框架与键盘'],[.88,'02 / 键帽逐排落位'],[2.45,'03 / 翻转安装面'],[3.12,'04 / 主板翻面'],[3.98,'05 / 主板元件雨'],
  [6.18,'06 / 电池与连接'],[7.65,'07 / 合上底盖'],[8.15,'08 / 翻回正面'],[8.75,'09 / 显示屏总成'],[10.85,'10 / 转向正面'],[11.6,'11 / 打开电脑'],[12.9,'12 / 开机'],[13.4,'13 / Kimi 已就绪'],
].map(([time,title])=>[filmTime(time),title]);

export function createFilmMotion(model){
  const {root,pivots,map,power}=model,units=[],assigned=new Set();
  const lidCenter=new THREE.Vector3(0,40,-.12),hingePosition=new THREE.Vector3(0,32,-102.76);
  const lidStage=new THREE.Group();lidStage.position.copy(lidCenter);root.add(lidStage);
  const hinge=new THREE.Group();hinge.position.copy(hingePosition).sub(lidCenter);lidStage.add(hinge);
  const take=fn=>Object.entries(map.parts).filter(([n,i])=>!assigned.has(n)&&fn(n,i)).map(([n])=>n);
  function unit(id,names,start,duration,options={}){
    start=filmTime(start);duration=filmTime(duration);
    if(!names.length)throw Error('Empty film unit '+id);
    const center=options.anchor?new THREE.Vector3(...map.parts[options.anchor].center):new THREE.Box3().setFromObject(pivots[names[0]]).getCenter(new THREE.Vector3());
    const parent=options.lid?hinge:root,g=new THREE.Group();root.updateMatrixWorld(true);g.position.copy(parent.worldToLocal(center.clone()));parent.add(g);root.updateMatrixWorld(true);
    for(const n of names){if(assigned.has(n))throw Error('Duplicate '+n);assigned.add(n);g.attach(pivots[n]);}
    const materials=[...new Set(names.flatMap(n=>model.mats[n]))].map(m=>({m,opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite}));
    const u={id,names,start,duration,g,base:g.position.clone(),flip:!!options.flip,rain:!!options.rain,direction:options.direction??1,height:options.height??105,spin:options.spin??0,materials};units.push(u);return u;
  }
  unit('frame',['case_mainbox'],0,.3,{height:60});
  unit('ports',take(n=>n.startsWith('port_cover_')),.12,.28,{height:55});
  unit('keyboard',take((n,i)=>n==='kbd_board'||i.parent==='kbd_board'&&i.matClass!=='keycap'),.28,.59,{anchor:'kbd_board',flip:true,height:130});
  const keys=take((n,i)=>i.matClass==='keycap').sort((a,b)=>map.parts[a].center[2]-map.parts[b].center[2]);
  // Some wide keycaps have centres offset by 0.1 mm; cluster by physical row.
  const keyRows=[];
  for(const name of keys){
    const z=map.parts[name].center[2];let row=keyRows.find(r=>Math.abs(r.z-z)<1);
    if(!row){row={z,names:[]};keyRows.push(row);}row.names.push(name);
  }
  keyRows.forEach((row,r)=>row.names.sort((a,b)=>map.parts[a].center[0]-map.parts[b].center[0]).forEach((name,c)=>{
    unit(name,[name],.88+r*.17+c*.017,.5,{height:80});
  }));
  unit('trackball',take((n,i)=>n==='trackball_board'||n==='trackball_cup'||i.parent==='trackball_board'),1.15,.48,{anchor:'trackball_board',flip:true,height:95});
  unit('ball',['trackball_ball'],1.64,.22,{height:80});
  unit('trackball-ring',['trackball_lid'],1.76,.22,{height:75});
  take(n=>n.startsWith('trackball_button_')).forEach((n,i)=>unit(n,[n],1.73+i*.027,.21,{height:65}));
  unit('oled',take((n,i)=>n==='oled_board'||n==='oled_screen'||i.parent==='oled_board'),1.79,.4,{anchor:'oled_board',flip:true,height:105});
  unit('bezel',['case_bezel'],2.18,.25,{height:95});
  for(const side of ['left','right']){
    unit(side+'-hinge-base',take((n,i)=>n.startsWith('hinge_'+side+'_')&&!i.lid&&i.matClass!=='fastener'),2.09+(side==='right'?.04:0),.22,{height:65});
    unit(side+'-base-screws',take((n,i)=>n.startsWith('hinge_'+side+'_')&&!i.lid&&i.matClass==='fastener'),2.28+(side==='right'?.03:0),.12,{height:25,spin:Math.PI*2});
  }
  // Copper and silkscreen remain bonded; each physical component gets its own falling unit.
  unit('motherboard',take((n,i)=>n==='mb_board'||i.parent==='mb_board'&&['copper','silk'].includes(i.matClass)),3.12,.8,{anchor:'mb_board',flip:true,direction:-1,height:140});
  for(const name of take((n,i)=>i.parent==='mb_board'&&i.matClass!=='som'&&n!=='mb_heatsink')){
    const start=3.98+randomFor(name)*1.02,duration=.42+randomFor(name,9176)*.28;
    unit(name,[name],start,duration,{rain:true,direction:-1,height:85+randomFor(name,4103)*105});
  }
  // The module covers part of the mainboard, so it follows the rain; the heat sink follows it.
  unit('compute',take((n,i)=>i.matClass==='som'),5.71,.36,{flip:true,direction:-1,height:80});
  unit('heatsink',['mb_heatsink'],6.08,.34,{rain:true,direction:-1,height:85});
  for(const [idx,name] of ['battery_board','battery2_board'].entries())unit(name,take((n,i)=>n===name||i.parent===name&&i.matClass!=='cell'),6.18+idx*.1,.48,{anchor:name,flip:true,direction:-1,height:100});
  take((n,i)=>i.matClass==='cell').sort((a,b)=>map.parts[a].center[0]-map.parts[b].center[0]).forEach((n,i)=>unit(n,[n],6.78+i*.072,.36,{direction:-1,height:85}));
  unit('bottom',['case_bottom'],7.65,.28,{direction:-1,height:110});
  take(n=>n.startsWith('foot_')).forEach((n,i)=>unit(n,[n],7.86+i*.025,.15,{direction:-1,height:35}));
  unit('display-back',['screen_back'],8.75,.22,{lid:true,height:0});
  unit('display-panel',['display_panel'],8.99,.22,{lid:true,direction:-1,height:75});
  take(n=>n.startsWith('speaker_holder_')).forEach((n,i)=>unit(n,[n],9.11+i*.045,.2,{lid:true,direction:-1,height:50}));
  take(n=>n==='speaker_1'||n==='speaker_-1').forEach((n,i)=>unit(n,[n],9.28+i*.035,.19,{lid:true,direction:-1,height:45}));
  unit('display-front',['screen_front'],9.47,.23,{lid:true,direction:-1,height:70});
  for(const side of ['left','right']){
    unit(side+'-hinge-leaf',take((n,i)=>n.startsWith('hinge_'+side+'_')&&i.lid&&i.matClass!=='fastener'),9.54+(side==='right'?.04:0),.2,{lid:true,direction:-1,height:45});
    unit(side+'-leaf-screws',take((n,i)=>n.startsWith('hinge_'+side+'_')&&i.lid&&i.matClass==='fastener'),9.7+(side==='right'?.03:0),.12,{lid:true,direction:-1,height:20,spin:Math.PI*2});
  }
  const missing=Object.keys(map.parts).filter(n=>!assigned.has(n));if(missing.length)throw Error('Unscheduled parts: '+missing.join(','));
  let t=0;
  function bodyPose(time){
    let rx=0,y=6;
    if(time>=TIMING.bottomFlip[0]&&time<TIMING.bottomFlip[1]){const u=ramp(time,...TIMING.bottomFlip);rx=Math.PI*u;y=THREE.MathUtils.lerp(6,42,u)+115*Math.sin(Math.PI*u);}
    else if(time>=TIMING.bottomFlip[1]&&time<TIMING.returnFlip[0]){rx=Math.PI;y=42;}
    else if(time>=TIMING.returnFlip[0]&&time<TIMING.returnFlip[1]){const u=ramp(time,...TIMING.returnFlip);rx=Math.PI*(1-u);y=THREE.MathUtils.lerp(42,6,u)+115*Math.sin(Math.PI*u);}
    const yaw=FRONT_YAW*ramp(time,...TIMING.closedTurn);root.rotation.set(rx,yaw,0,'YXZ');root.position.set(0,y,0);
  }
  function apply(time){
    t=Math.max(0,Math.min(DURATION,time));bodyPose(t);
    for(const u of units){
      const p=clamp((t-u.start)/u.duration);u.g.visible=t>=u.start;
      const fall=u.rain?p*p:u.flip?ramp(p,.59,1):ease(p),turn=u.flip?Math.PI*(1-ramp(p,.16,.58)):0;
      u.g.position.copy(u.base).addScaledVector(Y,u.direction*u.height*(1-fall));u.g.rotation.set(turn,u.spin*(1-ease(p)),0);
      const opacity=ramp(t,u.start,u.start+Math.min(filmTime(.06),u.duration*.18));
      for(const a of u.materials){const transparent=opacity<1||a.transparent;if(a.m.transparent!==transparent){a.m.transparent=transparent;a.m.needsUpdate=true;}a.m.opacity=a.opacity*opacity;a.m.depthWrite=opacity<1?false:a.depthWrite;}
    }
    const lift=180*(1-ramp(t,...TIMING.lidDrop));lidStage.position.copy(lidCenter).addScaledVector(Y,lift);
    lidStage.rotation.x=Math.PI*(1-ramp(t,...TIMING.lidTurn));hinge.rotation.x=-THREE.MathUtils.degToRad(110)*ramp(t,...TIMING.lidOpen);
    power(t>=TIMING.kimi?'kimi':'boot',ramp(t,...TIMING.boot));root.updateMatrixWorld(true);
  }
  function cablePose(spec){
    const late=spec.ends.some(e=>map.parts[e.part].lid);
    const n=model.cableData.cables.indexOf(spec),start=filmTime(late?10.65+n*.002:7.25+n*.014);
    return {visible:t>=start,insert:[3*(1-ramp(t,start,start+filmTime(.13))),3*(1-ramp(t,start+filmTime(.03),start+filmTime(.19)))],lift:late?0:2.5*(1-ramp(t,start,start+filmTime(.19)))};
  }
  return {apply,units,root,hinge,lidStage,cablePose,get t(){return t;},chapter:()=>CHAPTERS.filter(c=>t>=c[0]).at(-1)[1]};
}
