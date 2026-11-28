import * as T from 'three';
import {createBodyPoses} from './assembly-body.js';
import {createActionPoses} from './assembly-action.js';
import {createAccessoryPoses} from './assembly-accessories.js';
import {createExteriorDetails} from './exterior-details.js';

const ease=x=>{x=T.MathUtils.clamp(x,0,1);return x*x*(3-2*x);},seg=(a,b,x)=>ease((x-a)/(b-a));
const V=a=>new T.Vector3(...a),Q=a=>new T.Quaternion().setFromEuler(new T.Euler(...a));
export function createAssembly({units,names,meshes,camera,controls,scene,markDirty}){
 const body=createBodyPoses(T,units),action=createActionPoses(T,units),accessories=createAccessoryPoses(T,units,names),labels=new Map(names.items.map(d=>[d.id,d]));
 const poses=new Map([...accessories,...action,...body]),records=[],fallback=[];
 // Split the photographed long strip into narrow longitudinal bands before
 // bending. A single spanning triangle cannot follow the curved case wall.
 const rimGroup=units.find(g=>g.userData.id==='CFX-M07');
 for(const mesh of rimGroup?.children||[]){
  const source=mesh.geometry,arr=source.attributes.position.array;source.computeBoundingBox();
  const lo=source.boundingBox.min.x,hi=source.boundingBox.max.x,step=(hi-lo)/64,out=[];
  const clip=(poly,x,above)=>{const result=[];for(let i=0;i<poly.length;i++){
   const a=poly[i],b=poly[(i+1)%poly.length],ia=above?a[0]>=x:a[0]<=x,ib=above?b[0]>=x:b[0]<=x;
   if(ia)result.push(a);if(ia!==ib){const t=(x-a[0])/(b[0]-a[0]);result.push(a.map((v,j)=>v+(b[j]-v)*t));}
  }return result;};
  for(let i=0;i<arr.length;i+=9){const tri=[Array.from(arr.slice(i,i+3)),Array.from(arr.slice(i+3,i+6)),Array.from(arr.slice(i+6,i+9))];
   const first=Math.max(0,Math.floor((Math.min(...tri.map(v=>v[0]))-lo)/step)),last=Math.min(63,Math.floor((Math.max(...tri.map(v=>v[0]))-lo)/step));
   for(let j=first;j<=last;j++){const poly=clip(clip(tri,lo+j*step,true),lo+(j+1)*step,false);for(let k=1;k<poly.length-1;k++)out.push(...poly[0],...poly[k],...poly[k+1]);}
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(out,3));geo.computeVertexNormals();mesh.geometry=geo;source.dispose();
 }
 for(const g of units)if(g.userData.id==='R-AUTO-2912'||g.userData.id.startsWith('WIRE-LOOP-'))poses.set(g.userData.id,{position:[0,1.3,0],rotation:[0,0,0],scale:[1,1,1],accuracy:'deformed-photo-unit'});
 const systemStage={case:.05,keyboard:.18,action:.32,damper:.46,strings:.57,resonance:.70,pedal:.82,hardware:.44};
 const shifts={case:[.10,1.05,.18],keyboard:[-1.05,.12,0],action:[-.42,.65,0],damper:[.06,1.13,0],strings:[.30,.84,0],resonance:[.50,.37,0],pedal:[0,.06,0],hardware:[.10,.65,0]};
 for(const g of units){
  const d=g.userData,meta=labels.get(d.id),system=meta?.system||'hardware';let pose=poses.get(d.id);
  if(!pose){fallback.push(d.id);const n=fallback.length-1;pose={position:[-.65+(n%9)*.14,1.18,Math.floor(n/9)*.035-.3],rotation:[0,0,0],scale:[.16,.5,.16],accuracy:'approx'};}
  let q0=Q(pose.rotation),s0=V(pose.scale),flipY=false;
  // Factor a planar reflection into a physical half-turn, never through a
  // zero planar scale. Only the shallow cross-section reverses during unfold.
  if(s0.x<0){q0.multiply(Q([0,0,Math.PI]));s0.x*=-1;flipY=!flipY;}
  if(s0.z<0){q0.multiply(Q([Math.PI,0,0]));s0.z*=-1;flipY=!flipY;}
  const p0=V(pose.position),pk=g.position.clone(),qk=g.quaternion.clone(),sk=g.scale.clone(),offset=V(shifts[system]);
  if(d.id==='CFX-M01')offset.set(.15,1.10,.45);
  if(d.id==='CFX-M02')offset.set(-.35,.65,.45);
  if(d.id==='CFX-M07')offset.set(.15,.35,.68);
  if(/^CFX-M0[456]$/.test(d.id)){offset.set(p0.x<0?-.3:.4,0,p0.z<0?-.55:.55);}
  const r={g,d,p0,q0,s0,pk,qk,sk,pe:p0.clone().add(offset),system,stage:systemStage[system],deforms:[]};
  for(const mesh of g.children){
   const flat=new Float32Array(mesh.geometry.attributes.position.array),assembled=new Float32Array(flat),baseY=mesh.position.y;
   if(flipY){for(let i=1;i<assembled.length;i+=3)assembled[i]*=-1;r.deforms.push({mesh,flat,assembled,baseY,assembledY:-baseY});}
  }
  records.push(r);
 }
 const byId=new Map(records.map(r=>[r.d.id,r]));
 // The long visible case strip becomes a curved vertical rim, using the very
 // same vertices. The keyboard/front edge remains open.
 const rim=byId.get('CFX-M07');
 if(rim&&body.rimGuide){
  const guide=body.rimGuide.map(p=>V(p)),minX=Math.min(...guide.map(p=>p.x));
  const segments=[];let length=0;
  for(let i=0;i<guide.length;i++){
   const a=guide[i],b=guide[(i+1)%guide.length];if(a.x<minX+.02&&b.x<minX+.02)continue;
   const len=a.distanceTo(b);segments.push({a,b,start:length,len});length+=len;
  }
  const sample=t=>{const s=T.MathUtils.clamp(t,0,.999999)*length,edge=segments.find(e=>s<=e.start+e.len)||segments.at(-1),v=edge.b.clone().sub(edge.a).normalize();return {p:edge.a.clone().lerp(edge.b,(s-edge.start)/edge.len),normal:new T.Vector3(v.z,0,-v.x)};};
  for(const mesh of rim.g.children){
   const flat=new Float32Array(mesh.geometry.attributes.position.array),assembled=new Float32Array(flat);mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox,size=box.getSize(new T.Vector3());
   for(let i=0;i<flat.length;i+=3){const f=sample((flat[i]-box.min.x)/size.x),thickness=(flat[i+1]/.1-.5)*.055;assembled[i]=f.p.x+f.normal.x*thickness;assembled[i+1]=body.rimTop-(flat[i+2]-box.min.z)/size.z*(body.rimTop-body.rimBottom);assembled[i+2]=f.p.z+f.normal.z*thickness;}
   rim.deforms.push({mesh,flat,assembled,baseY:mesh.position.y,assembledY:0});
  }
 }
 // The plate and case were photographed independently. Fit the plate's
 // cross-sections inside the case rather than allowing its knee to protrude.
 const rimPoints=body.rimGuide||[];
 const section=(polygon,x)=>{const zs=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length];if(x>=Math.min(a[0],b[0])&&x<Math.max(a[0],b[0]))zs.push(T.MathUtils.lerp(a[2],b[2],(x-a[0])/(b[0]-a[0])));}return zs.length>1?[Math.min(...zs),Math.max(...zs)]:null;};
 const plate=byId.get('CFX-R01');
 if(plate){
  const matrix=new T.Matrix4().compose(plate.p0,plate.q0,plate.s0),inverse=matrix.clone().invert(),box=plate.d.box;
  const outline=plate.d.polygon.map(p=>new T.Vector3((p[0]-box[0]-box[2]/2)*.002,0,(p[1]-box[1]-box[3]/2)*.002).applyMatrix4(matrix).toArray());
  for(const d of plate.deforms){const v=new T.Vector3();for(let i=0;i<d.assembled.length;i+=3){v.fromArray(d.assembled,i).applyMatrix4(matrix);const outer=section(outline,v.x),inner=section(rimPoints,v.x);if(outer&&inner&&outer[1]-outer[0]>.01){const lo=Math.max(outer[0],inner[0]+.055),hi=Math.min(outer[1],inner[1]-.045);v.z=T.MathUtils.lerp(lo,hi,(v.z-outer[0])/(outer[1]-outer[0]));}v.applyMatrix4(inverse).toArray(d.assembled,i);}}
 }
 // Small inferred fixtures follow the curved side, not a rectangular proxy.
 for(const r of records){const pose=poses.get(r.d.id);if(!r.d.id.includes('-AUTO-')||pose?.host||r.p0.y<1.05||!['case','hardware','strings'].includes(r.system)||['X-AUTO-1030','X-AUTO-0973','R-AUTO-2912'].includes(r.d.id))continue;const limits=section(rimPoints,r.p0.x);if(limits){const delta=T.MathUtils.clamp(r.p0.z,limits[0]+.045,limits[1]-.045)-r.p0.z;r.p0.z+=delta;r.pe.z+=delta;}}
 // Photo-visible coils unroll to twelve thin string ribbons. They remain the
 // same addressable items; these are illustrative, not twelve claimed strings.
 for(const r of records.filter(r=>r.d.id.startsWith('WIRE-LOOP-'))){
  const n=Number(r.d.id.split('-').at(-1))-1;r.p0.set(0,0,0);r.q0.identity();r.s0.set(1,1,1);r.pe.copy(r.p0).add(V(shifts.strings));
  for(const mesh of r.g.children){
   const flat=new Float32Array(mesh.geometry.attributes.position.array),assembled=new Float32Array(flat);let rad=0;for(let i=0;i<flat.length;i+=3)rad+=Math.hypot(flat[i],flat[i+2]);rad/=flat.length/3;
   for(let i=0;i<flat.length;i+=3){const t=(Math.atan2(flat[i+2],flat[i])/Math.PI+1)/2,f=n/11;assembled[i]=T.MathUtils.lerp(-1.16+f*.25,1.20-f*.50,t);assembled[i+1]=1.365+flat[i+1]*.3;assembled[i+2]=T.MathUtils.lerp(-.70+f*1.4,.42+f*.32,t)+(Math.hypot(flat[i],flat[i+2])-rad)*.18;}
   r.deforms.push({mesh,flat,assembled,baseY:mesh.position.y,assembledY:0});
  }
 }
 // A photographed bundle is one item. Add a light strand representation for
 // its assembled state, preserving its original flat silhouette at p=1.
 const bundle=byId.get('R-AUTO-2912');let wireExtra=null;
 if(bundle){
  for(const m of bundle.g.children)m.material=m.material.clone();
  bundle.p0.set(0,0,0);bundle.q0.identity();bundle.s0.set(1,1,1);bundle.pe.copy(V(shifts.strings));
  const verts=[],flat=[],n=72,b=bundle.d.box;
  for(let i=0;i<n;i++){
   const f=i/(n-1),z=-.75+f*1.48,a=[-1.16+f*.25,1.355,z],endX=1.20-f*.50,c=[endX,1.355,.42+f*.32];
   for(const [t,side] of [[0,-1],[1,-1],[1,1],[0,-1],[1,1],[0,1]]){
    verts.push(T.MathUtils.lerp(a[0],c[0],t),1.355,T.MathUtils.lerp(a[2],c[2],t)+side*.0008);
    flat.push((f-.5)*b[2]*.002, .011,(t-.5)*b[3]*.002+side*.0008);
   }
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(flat,3));geo.computeVertexNormals();
  wireExtra=new T.Mesh(geo,new T.MeshStandardMaterial({color:0xa48f71,metalness:.7,roughness:.4,side:T.DoubleSide,transparent:true}));wireExtra.userData={...bundle.d,pieceData:{...bundle.d,color:'#a48f71',material:'steel'},unit:bundle.g,assemblySupplement:true};
  bundle.g.add(wireExtra);meshes.push(wireExtra);bundle.deforms.push({mesh:wireExtra,flat:new Float32Array(flat),assembled:new Float32Array(verts),baseY:0,assembledY:0});
 }
 const exterior=createExteriorDetails({records,meshes,scene});
 let progress=0,playing=false,startProgress=0,direction=1,holdUntil=0,enabled=false;
 function view(p){
  const second=seg(.46,1,p),first=seg(0,.46,p),aspect=innerWidth/innerHeight;
  const target=new T.Vector3(-.10,1.05,0).lerp(new T.Vector3(0,1.3,0),first).lerp(new T.Vector3(),second);
  // Look beneath the open lid instead of aligning the camera with its plane.
  const offset=new T.Vector3(-4.7,2.20,-6.3).lerp(new T.Vector3(-5.3,4.8,-5.7),first).lerp(new T.Vector3(0,18,.0001),second);
  const finalH=Math.max(4002*.002,4096*.002/aspect)*1.10,h=T.MathUtils.lerp(T.MathUtils.lerp(Math.max(3.9,4.1/aspect),Math.max(6.6,5.4/aspect),first),finalH,second);
  camera.left=-h*aspect/2;camera.right=h*aspect/2;camera.top=h/2;camera.bottom=-h/2;camera.zoom=1;camera.near=.01;camera.far=100;
  camera.position.copy(target).add(offset);camera.up.set(0,1,0);camera.lookAt(target);camera.updateProjectionMatrix();controls.target.copy(target);controls.update();
 }
 function setProgress(p,moveCamera=true){
  progress=T.MathUtils.clamp(p,0,1);
  for(const r of records){
   const a=seg(.02+r.stage*.14,.38+r.stage*.1,progress),b=seg(.47+r.stage*.07,.90+r.stage*.09,progress);
   r.g.position.copy(r.p0).lerp(r.pe,a).lerp(r.pk,b);r.g.quaternion.copy(r.q0).slerp(r.qk,b);r.g.scale.copy(r.s0).lerp(r.sk,b);
   for(const d of r.deforms){
    const attr=d.mesh.geometry.attributes.position;
    for(let i=0;i<d.flat.length;i++)attr.array[i]=d.assembled[i]*(1-b)+d.flat[i]*b;
    attr.needsUpdate=true;d.mesh.geometry.computeVertexNormals();d.mesh.geometry.computeBoundingSphere();d.mesh.geometry.computeBoundingBox();d.mesh.position.y=T.MathUtils.lerp(d.assembledY,d.baseY,b);
   }
   if(r===bundle){for(const m of r.g.children){m.material.transparent=true;m.material.opacity=m===wireExtra?1-b:b;m.userData.assemblyOpacity=m.material.opacity;m.visible=m.material.opacity>.001;}}
  }
  exterior.update(progress);
  scene.updateMatrixWorld(true);
  if(progress>0&&progress<1){const box=new T.Box3();for(const r of records){let low=Infinity;for(const mesh of r.g.children){if(!mesh.visible)continue;if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);low=Math.min(low,box.min.y);}if(low<.004){r.g.position.y+=.004-low;r.g.updateMatrixWorld(true);}}}
  if(moveCamera)view(progress);markDirty();
  const slider=document.getElementById('assemblyProgress');if(slider)slider.value=String(Math.round(progress*1000));
  const label=document.getElementById('assemblyStage');if(label)label.textContent=progress<.02?'Assembled':progress<.47?'Spreading layers':progress<.999?'Arranging exploded view':'Flat exploded view';
 }
 function play(nextDirection=1){enabled=true;direction=nextDirection;if(direction>0&&progress>.998)setProgress(0);if(direction<0&&progress<.002)setProgress(1);playing=true;startProgress=progress;holdUntil=performance.now()+600;document.getElementById('assemblyPlay').textContent='Pause';}
 function pause(){playing=false;document.getElementById('assemblyPlay').textContent='Play Disassembly';}
 function tick(now){if(!enabled||!playing||now<holdUntil)return;setProgress(startProgress+direction*(now-holdUntil)/36000);if(progress>=1||progress<=0)pause();}
 function setEnabled(value){enabled=value;if(!value)pause();}
 return {setProgress,setEnabled,play,pause,tick,view,records,poses,fallback,exterior,get progress(){return progress;},get playing(){return playing;},get enabled(){return enabled;}};
}
