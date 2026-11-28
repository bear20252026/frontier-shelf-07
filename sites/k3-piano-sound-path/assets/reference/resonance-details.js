import * as T from 'three';

function spruceTexture(){
 // Fine, straight growth rings with restrained longitudinal variation.
 // This is authored surface detail, not lighting baked out of a photograph.
 const w=512,h=512,pixels=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const phase=x*.49+Math.sin(y*.012)*.23+Math.sin(x*.008)*1.4;
  const fine=Math.pow((Math.sin(phase)+1)/2,10),slow=Math.sin(x*.035)*.035;
  const v=1-fine*.105+slow+Math.sin(y*.045+x*.086)*.007;
  const i=(y*w+x)*4;pixels[i]=Math.round(228*v);pixels[i+1]=Math.round(195*v);pixels[i+2]=Math.round(143*v);pixels[i+3]=255;
 }
 const texture=new T.DataTexture(pixels,w,h,T.RGBAFormat);texture.colorSpace=T.SRGBColorSpace;
 texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(1.7,.55);texture.anisotropy=4;texture.generateMipmaps=true;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.needsUpdate=true;return texture;
}
function cylinder(a,b,radius,material,radial=10){
 const va=new T.Vector3(...a),vb=new T.Vector3(...b),delta=vb.clone().sub(va);
 const geometry=new T.CylinderGeometry(radius,radius,delta.length(),radial,1);
 geometry.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize()));geometry.translate(...va.add(vb).multiplyScalar(.5).toArray());
 return {geometry,material};
}
export function installResonanceDetails({records,replaceUnit,addDetail}){
 const byId=new Map(records.map(r=>[r.d.id,r]));
 const wood=new T.MeshPhysicalMaterial({color:0xffffff,map:spruceTexture(),roughness:.48,metalness:0,clearcoat:.18,clearcoatRoughness:.4,envMapIntensity:.55});
 for(const id of ['CFX-M03','CFX-R02','CFX-R03']){
  const r=byId.get(id);if(!r)continue;
  for(const m of r.g.children){if(m.userData.pieceData?.material==='wood'){
   const material=wood.clone();if(id!=='CFX-M03')material.color.set(0xd5ab6e);
   m.userData.exteriorBaseMaterial=material;m.material=material.clone();m.userData.privateMaterial=true;
  }}
 }
 const steel=new T.MeshPhysicalMaterial({color:0xb5b8b5,metalness:.88,roughness:.25,envMapIntensity:.95});
 const copper=new T.MeshPhysicalMaterial({color:0xa57c4c,metalness:.84,roughness:.35,envMapIntensity:.8});
 // The existing 72-strand presentation bundle gets a round cross-section.
 // This retains the previous illustrative routing/count, not a factory scale.
 if(byId.has('R-AUTO-2912')){
  const wires=[];
  for(let i=0;i<72;i++){
   const f=i/71,z=-.75+f*1.48,a=[-1.16+f*.25,1.355,z],b=[1.20-f*.50,1.355,.42+f*.32];
   wires.push(cylinder(a,b,i<17?.00105:.00068,i<17?copper:steel,8));
  }
  replaceUnit('R-AUTO-2912',wires);
 }
 for(const r of records.filter(r=>r.d.id.startsWith('WIRE-LOOP-'))){
  const f=(Number(r.d.id.split('-').at(-1))-1)/11;
  replaceUnit(r.d.id,[cylinder([-1.16+f*.25,1.365,-.70+f*1.4],[1.20-f*.50,1.365,.42+f*.32],.0011,copper,10)]);
 }
 // Visible soundboard ribs are structural strips on the underside. Clip
 // their ends against the actual board polygon; keep them with its item.
 const board=byId.get('CFX-M03');
 if(board){
  const matrix=new T.Matrix4().compose(board.p0,board.q0,board.s0),b=board.d.box;
  const outline=board.d.polygon.map(p=>new T.Vector3((p[0]-b[0]-b[2]/2)*.002,0,(p[1]-b[1]-b[3]/2)*.002).applyMatrix4(matrix));
  const ribs=[];
  for(let x=-.91;x<1.19;x+=.23){
   const hits=[];for(let i=0;i<outline.length;i++){const a=outline[i],c=outline[(i+1)%outline.length];if(x>=Math.min(a.x,c.x)&&x<Math.max(a.x,c.x))hits.push(a.z+(c.z-a.z)*(x-a.x)/(c.x-a.x));}
   if(hits.length<2)continue;const lo=Math.min(...hits)+.045,hi=Math.max(...hits)-.045;if(hi-lo<.12)continue;
   ribs.push({geometry:new T.BoxGeometry(.045,.025,hi-lo),position:[x,1.1375,(lo+hi)/2],material:wood});
  }
  addDetail('CFX-M03',ribs);
 }
}
