/** Visible CFX body construction for the assembled endpoint.
 * The source photograph remains the p=1 contract. Every definition below is
 * in p=0 world coordinates; the assembly installer owns attachment and fades.
 * The original eight music-desk openings and the CFX6 rim are retained.
 */
export function installBodyDetails({T,records,meshes,replaceUnit,addDetail}){
 const byId=new Map(records.map(r=>[r.d.id,r])),replaced=[],added=[];
 const material=(name,parameters)=>{const m=new T.MeshPhysicalMaterial(parameters);m.name=name;return m;};
 const lacquer=material('cfx-polished-case',{color:0x080a0b,roughness:.21,metalness:.02,clearcoat:.72,clearcoatRoughness:.095,envMapIntensity:.7});
 const lidMat=material('cfx-matte-lid',{color:0x090a0c,roughness:.58,metalness:0,specularIntensity:.55,clearcoat:.06,clearcoatRoughness:.50,envMapIntensity:.33});
 const inside=material('cfx-structural-black',{color:0x171715,roughness:.52,metalness:0,envMapIntensity:.42});
 const brass=material('cfx-hinge-brass',{color:0xb9994f,roughness:.27,metalness:.84,envMapIntensity:.78});
 const screw=material('cfx-black-fastener',{color:0x242421,roughness:.31,metalness:.68,envMapIntensity:.55});
 const replace=(id,defs)=>{if(byId.has(id)){replaceUnit(id,defs);replaced.push(id);}};
 const add=(id,defs)=>{if(byId.has(id)&&defs.length){addDetail(id,defs);added.push({id,count:defs.length});}};
 const def=(geometry,mat=lacquer)=>({geometry,material:mat});
 // ExtrudeGeometry duplicates the vertices of each curve segment. Adding
 // segments alone leaves a separate flat normal on every strip, which makes
 // a continuous polished surface reflect the light as a staircase. Average
 // coincident normals within a 60-degree crease while retaining hard seams.
 // Keep the broad planar end caps flat: bending those vertex normals would
 // make an eight-hole wooden desk look upholstered despite a tiny bevel.
 const smooth=geo=>{
  const p=geo.attributes.position,n=geo.attributes.normal,groups=new Map(),scale=1e6,weights=new Float64Array(p.count),caps=new Uint8Array(p.count);
  const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),index=geo.index;
  for(let i=0;i<(index?.count||p.count);i+=3){
   const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);
   a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]);c.fromBufferAttribute(p,ids[2]);
   const area=b.sub(a).cross(c.sub(a)).length();for(const id of ids)weights[id]+=Math.max(area,1e-12);
  }
  for(const group of geo.groups)if(group.materialIndex===0)for(let i=group.start;i<group.start+group.count;i++)caps[index?index.getX(i):i]=1;
  for(let i=0;i<p.count;i++){
   const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*scale)).join(',');
   if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);
  }
  const out=new Float32Array(n.array),v=new T.Vector3(),sum=new T.Vector3();
  for(const entries of groups.values()){
   const normals=new Map();for(const i of entries){v.fromBufferAttribute(n,i);const key=v.toArray().map(q=>Math.round(q*scale)).join(',');if(!normals.has(key))normals.set(key,{normal:v.clone(),weight:0});normals.get(key).weight+=weights[i];}
   for(const i of entries){if(caps[i])continue;v.fromBufferAttribute(n,i);sum.set(0,0,0);for(const other of normals.values())if(v.dot(other.normal)>.5)sum.addScaledVector(other.normal,other.weight);sum.normalize().toArray(out,i*3);}
  }
  geo.setAttribute('normal',new T.BufferAttribute(out,3));return geo;
 };
 const box=(x,y,z,w,h,d,b=.003)=>{
  b=Math.min(b,w/5,h/5,d/5);const shape=new T.Shape(),hw=w/2-b,hh=h/2-b;
  shape.moveTo(-hw,-hh);shape.lineTo(hw,-hh);shape.lineTo(hw,hh);shape.lineTo(-hw,hh);shape.closePath();
  return smooth(new T.ExtrudeGeometry(shape,{depth:d-2*b,bevelEnabled:true,bevelSize:b,bevelThickness:b,bevelSegments:4,steps:1})
   .translate(x,y,z-d/2+b));
 };
 const extrudeXZ=(points,y,depth,bevel=.0025)=>{
  const shape=new T.Shape();points.forEach(([x,z],i)=>shape[i?'lineTo':'moveTo'](x,-z));shape.closePath();
  return smooth(new T.ExtrudeGeometry(shape,{depth,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:5,steps:1})
   .rotateX(-Math.PI/2).translate(0,y,0));
 };
 const lineCylinder=(a,b,r,segments=16)=>{
  const va=new T.Vector3(...a),vb=new T.Vector3(...b),delta=vb.clone().sub(va);
  return new T.CylinderGeometry(r,r,delta.length(),segments,1,false)
   .applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize()))
   .translate(...va.add(vb).multiplyScalar(.5).toArray());
 };
 const main=byId.get('CFX-M01');if(!main)return {replaced,added};
 const src=main.d,bb=src.box,cx=bb[0]+bb[2]/2,cz=bb[1]+bb[3]/2;
 // This is the same full-length registration as createBodyPoses.rimGuide.
 const rim=src.polygon.map(([x,z])=>[.04+(x-cx)*2.84/bb[2],(z-cz)*1.88/bb[3]])
  .map(([x,z])=>[x,z>.90?.94:z]);
 const section=x=>{const zs=[];for(let i=0;i<rim.length;i++){
  const a=rim[i],b=rim[(i+1)%rim.length];if(x>=Math.min(a[0],b[0])&&x<Math.max(a[0],b[0]))zs.push(a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]));
 }return zs.length?[Math.min(...zs),Math.max(...zs)]:[-.9,.94];};
 const clipX=(poly,minX)=>{const out=[];for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],ia=a[0]>=minX,ib=b[0]>=minX;
  if(ia)out.push(a);if(ia!==ib){const f=(minX-a[0])/(b[0]-a[0]);out.push([minX,a[1]+(b[1]-a[1])*f]);}
 }return out;};
 const clipPlane=(poly,axis,value,greater)=>{const out=[];for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],ia=greater?a[axis]>=value:a[axis]<=value,ib=greater?b[axis]>=value:b[axis]<=value;
  if(ia)out.push(a);if(ia!==ib){const f=(value-a[axis])/(b[axis]-a[axis]);out.push(a.map((v,k)=>v+(b[k]-v)*f));}
 }return out;};
 const angle=new T.Euler().setFromQuaternion(main.q0).x,hingeY=1.47,hingeZ=.94,lidFront=-1.035;
 const lidTransform=new T.Matrix4().makeTranslation(0,hingeY,hingeZ)
  .multiply(new T.Matrix4().makeRotationX(angle)).multiply(new T.Matrix4().makeTranslation(0,0,-hingeZ));
 const onLid=geo=>geo.applyMatrix4(lidTransform);

 // Main lid is clipped at the actual front-leaf hinge, rather than scaled
 // shorter. Its curved edge therefore continues to follow the case below.
 replace('CFX-M01',[def(onLid(extrudeXZ(clipX(rim,lidFront),0,.032)),lidMat)]);
 const leaf=[[-1.032,-.92],[-.677,-.92],[-.677,.934],[-1.032,.934]];
 replace('CFX-M02',[def(onLid(extrudeXZ(leaf,.043,.020,.002)),lidMat)]);
 add('CFX-M02',[def(onLid(lineCylinder([lidFront,.036,-.914],[lidFront,.036,.934],.0035)),screw)]);

 // Low-profile, photographed-style reinforcing battens on the underside.
 const underside=[];
 for(const x of [-.88,.14]){
  const [near,far]=section(x),z0=near+.08,z1=far-.105;
  underside.push(def(onLid(box(x,-.009,(z0+z1)/2,.028,.014,z1-z0,.002)),inside));
  for(const z of [z0+.025,z1-.025])underside.push(def(onLid(lineCylinder([x,-.017,z],[x,-.014,z],.0027,12)),screw));
 }
 add('CFX-M01',underside);

 // Three compact hinges have a case leaf, a lid leaf, an axial pin and small
 // screw heads. Hardware follows its owning part during the layered reveal.
 const caseHinges=[],lidHinges=[];
 for(const x of [-.84,.20,1.12]){
  caseHinges.push(def(box(x,1.449,.929,.080,.007,.057,.0015),brass));
  lidHinges.push(def(onLid(box(x,-.005,.916,.080,.005,.047,.001)),brass));
  lidHinges.push(def(lineCylinder([x-.043,1.467,.94],[x+.043,1.467,.94],.005,20),brass));
  for(const dx of [-.025,.025]){
   caseHinges.push(def(lineCylinder([x+dx,1.452,.913],[x+dx,1.454,.913],.0027,12),brass));
   lidHinges.push(def(onLid(lineCylinder([x+dx,-.008,.902],[x+dx,-.005,.902],.0027,12)),brass));
  }
 }
 add('CFX-M01',lidHinges);

 // A continuous shell with a genuinely open keyboard edge. Separate vertex
 // strips keep top/bottom edges crisp while smoothing the outside bend.
 const wall=(poly,thickness,bottom,top)=>{
  const n=poly.length,area=poly.reduce((s,p,i)=>s+p[0]*poly[(i+1)%n][1]-poly[(i+1)%n][0]*p[1],0),sign=area>0?1:-1;
  const inward=[];
  for(let i=0;i<n;i++){
   const p=poly[i],a=poly[(i+n-1)%n],b=poly[(i+1)%n],u=new T.Vector2(p[0]-a[0],p[1]-a[1]).normalize(),v=new T.Vector2(b[0]-p[0],b[1]-p[1]).normalize();
   const na=new T.Vector2(-u.y*sign,u.x*sign),nb=new T.Vector2(-v.y*sign,v.x*sign),normal=na.add(nb).normalize();
   const amount=Math.min(thickness*2.3,thickness/Math.max(.45,normal.dot(new T.Vector2(-v.y*sign,v.x*sign))));
   inward.push([p[0]+normal.x*amount,p[1]+normal.y*amount]);
  }
  const position=[],indices=[];
  for(let surface=0;surface<4;surface++)for(let i=0;i<n;i++){
   const p=poly[i],q=inward[i];
   const pairs=surface===0?[[p[0],bottom,p[1]],[p[0],top,p[1]]]:surface===1?[[q[0],top,q[1]],[q[0],bottom,q[1]]]:surface===2?[[p[0],top,p[1]],[q[0],top,q[1]]]:[[q[0],bottom,q[1]],[p[0],bottom,p[1]]];
   for(const v of pairs)position.push(...v);
  }
  const minX=Math.min(...poly.map(p=>p[0]));
  for(let i=0;i<n;i++){
   const j=(i+1)%n;if(poly[i][0]<minX+.025&&poly[j][0]<minX+.025)continue;
   for(let surface=0;surface<4;surface++){
    const k=surface*n*2,a=k+i*2,b=k+j*2,c=b+1,d=a+1;
    if(sign>0)indices.push(a,c,b,a,d,c);else indices.push(a,b,c,a,c,d);
   }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(position,3));g.setIndex(indices);g.computeVertexNormals();return g;
 };
 const shell=[def(wall(rim,.055,1.080,1.447))];
 // Player-facing cheek blocks: flat along the keys, rounding only into the
 // raised rim behind the keyboard. They sit outside the 1.76-wide key bank.
 for(const z of [-.91,.91]){
  const s=new T.Shape();s.moveTo(-1.755,.99);s.lineTo(-1.755,1.137);
  s.quadraticCurveTo(-1.755,1.15,-1.731,1.15);s.lineTo(-1.411,1.15);
  s.bezierCurveTo(-1.368,1.15,-1.367,1.359,-1.300,1.421);
  s.quadraticCurveTo(-1.281,1.442,-1.238,1.442);s.lineTo(-1.070,1.442);s.lineTo(-1.045,.99);s.closePath();
  const geo=smooth(new T.ExtrudeGeometry(s,{depth:.052,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:5,curveSegments:32,steps:1}).translate(0,0,z-.026));
  shell.push(def(geo));
 }
 // Keybed, front apron, action support and the underbody bearers are related
 // load surfaces. The keyframe sits on 1.035; action feet sit on 1.060.
 const bedOutline=clipPlane(rim,0,-1.0,false).map(([x,z])=>[x< -1.33?-1.755:x,z]);
 shell.push(def(extrudeXZ(bedOutline,.98,.055,.001),inside));
 shell.push(def(box(-1.729,1.062,0,.050,.063,1.818,.003)));
 const supportOutline=clipPlane(clipPlane(clipPlane(clipPlane(rim,0,-1.12,true),0,-.88,false),1,-.86,true),1,.86,false);
 shell.push(def(extrudeXZ(supportOutline,1.030,.030,0),inside));
 shell.push(def(box(-.98,1.0625,0,.20,.065,.46,.003),inside));
 shell.push(def(box(-.12,1.090,.68,2.18,.060,.11,.004),inside));
 shell.push(def(box(.57,1.09,.38,1.05,.06,.11,.004),inside));
 shell.push(def(box(1.05,1.09,.38,.28,.06,.36,.004),inside));
 shell.push(...caseHinges);
 replace('CFX-M07',shell);

 // The fallboard rolls back in a continuous section. Its lower lip is just
 // behind the actual white-key tail; it no longer stands inside the action.
 const fall=new T.Shape();fall.moveTo(-1.383,1.126);fall.lineTo(-1.377,1.263);
 fall.bezierCurveTo(-1.370,1.346,-1.349,1.409,-1.310,1.437);
 fall.quadraticCurveTo(-1.300,1.447,-1.286,1.447);fall.lineTo(-1.266,1.447);
 fall.bezierCurveTo(-1.302,1.409,-1.344,1.300,-1.354,1.126);fall.closePath();
 replace('CFX-M11',[def(smooth(new T.ExtrudeGeometry(fall,{depth:1.766,bevelEnabled:true,bevelSize:.0015,bevelThickness:.0015,bevelSegments:5,curveSegments:64,steps:1}).translate(0,0,-.883)))]);

 // Reuse the actual music-desk polygon and all eight openings, but give its
 // perimeter a finer radius and place the lowest edge directly in its shoe.
 const desk=byId.get('CFX-M08');if(desk){
  const d=desk.d,b=d.box,path=(points,isShape)=>{const p=isShape?new T.Shape():new T.Path();points.forEach(([x,z],i)=>p[i?'lineTo':'moveTo']((x-b[0]-b[2]/2)*.002,-(z-b[1]-b[3]/2)*.002));p.closePath();return p;};
  const shape=path(d.polygon,true);for(const hole of d.holes||[])shape.holes.push(path(hole,false));
  const geo=smooth(new T.ExtrudeGeometry(shape,{depth:.020,bevelEnabled:true,bevelSize:.0015,bevelThickness:.0015,bevelSegments:5,steps:1})
   .rotateX(-Math.PI/2).applyMatrix4(new T.Matrix4().compose(desk.p0,desk.q0,desk.s0)));
  geo.computeBoundingBox();geo.translate(0,1.459-geo.boundingBox.min.y,0);
  replace('CFX-M08',[def(geo)]);
 }
 replace('CFX-M12',[def(box(-1.235,1.447,0,.092,.032,1.29,.0025))]);
 for(const [id,z] of [['CFX-M09',-.75],['CFX-M10',.75]])replace(id,[def(box(-1.185,1.443,z,.26,.016,.28,.002))]);
 const deskFeet=[];for(const z of [-.425,.425]){
  deskFeet.push(def(box(-1.231,1.464,z,.044,.018,.082,.002),inside));
  deskFeet.push(def(lineCylinder([-1.231,1.47,z-.039],[-1.231,1.47,z+.039],.0035,14),brass));
 }add('CFX-M08',deskFeet);

 // Rounded rectangular rings form a real tapered leg in both axes. The
 // mounts end in load-bearing blocks; there are still exactly three legs.
 const roundedRing=(wx,wz,r)=>{const points=[];
  for(const [sx,sz,start] of [[1,1,0],[-1,1,Math.PI/2],[-1,-1,Math.PI],[1,-1,3*Math.PI/2]])
   for(let j=0;j<=3;j++){const a=start+j*Math.PI/6;points.push([sx*(wx/2-r)+Math.cos(a)*r,sz*(wz/2-r)+Math.sin(a)*r]);}
  return points;
 };
 const legGeo=(x,z,top)=>{
  const levels=[[.20,.103,.079],[.255,.110,.086],[top-.21,.126,.119],[top-.09,.144,.183],[top-.025,.179,.290],[top,.194,.310]],positions=[],indices=[];
  const rings=levels.map(([y,wx,wz])=>roundedRing(wx,wz,Math.min(.010,wx*.08)).map(p=>[x+p[0],y,z+p[1]])),n=rings[0].length;
  for(const ring of rings)for(const p of ring)positions.push(...p);
  for(let k=0;k<rings.length-1;k++)for(let i=0;i<n;i++){const j=(i+1)%n,a=k*n+i,b=k*n+j,c=(k+1)*n+j,d=(k+1)*n+i;indices.push(a,c,b,a,d,c);}
  for(const k of [0,rings.length-1]){const start=positions.length/3;positions.push(x,levels[k][0],z);for(const p of rings[k])positions.push(...p);for(let i=0;i<n;i++){const a=start+1+i,b=start+1+(i+1)%n;if(k===0)indices.push(start,a,b);else indices.push(start,b,a);}}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();return geo;
 };
 for(const [id,x,z,top] of [['CFX-M04',-1.20,-.78,1.005],['CFX-M05',-1.20,.78,1.005],['CFX-M06',1.05,.38,1.12]]){
  replace(id,[def(legGeo(x,z,top)),def(box(x,top-.0175,z,.212,.035,.314,.004)),def(box(x,.209,z,.109,.018,.085,.002),inside)]);
 }
 return {replaced,added,datum:{keybedTop:1.035,actionSupportTop:1.060,lidFrontX:lidFront,lidHinge:[0,hingeY,hingeZ],lidAngleDegrees:Math.round(angle*180/Math.PI),legBottom:.20,frontLegTop:1.005,rearLegTop:1.12},materials:[lacquer,lidMat,inside,brass,screw].map(m=>m.name)};
}
