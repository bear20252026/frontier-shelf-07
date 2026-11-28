import {createBodyPoses} from './assembly-body.js';

// These assembly-only surfaces belong to the original photographed units.
// CFX6 has a single broad brass caster and an open lyre: do not substitute
// the later CFX's double caster or its closed pedal back panel.
export function accessoryLayout(T, units) {
  const body=createBodyPoses(T,units),guide=body.rimGuide||[];
  const section=x=>{
    const points=[];
    for(let i=0;i<guide.length;i++){
      const a=guide[i],b=guide[(i+1)%guide.length];
      if(x>=Math.min(a[0],b[0])&&x<Math.max(a[0],b[0])){
        const t=(x-a[0])/(b[0]-a[0]);points.push(a[2]+(b[2]-a[2])*t);
      }
    }
    return Math.min(...points);
  };
  const x=.10,edge=section(x),angle=body.detailDatum?.lidAngle??body.spine?.lidAngle??20*Math.PI/180,hingeY=body.spine?.lidHingeY??1.47,hingeZ=body.spine?.z??.94;
  const closedZ=edge+.035,normal=new T.Vector3(0,Math.cos(angle),Math.sin(angle));
  const seat=new T.Vector3(x,hingeY-Math.sin(angle)*(closedZ-hingeZ),hingeZ+Math.cos(angle)*(closedZ-hingeZ));
  const lower=new T.Vector3(x,body.rimTop+.020,edge+.005),upper=seat.clone().addScaledVector(normal,-.017);
  const stowA=new T.Vector3(x+.027,body.rimTop+.016,section(x+.027)+.008),stowB=new T.Vector3(x+.255,body.rimTop+.016,section(x+.255)+.008);
  const lyre=body.get('CFX-M13'),lyreBottom=(lyre?.position[1]??.58)-.45;
  return {
    prop:{lower,upper,seat,normal,edge,angle,stowA,stowB},
    feet:[[-1.20,-.78],[-1.20,.78],[1.05,.38]],floor:-.004,legBottom:.20,
    lyreBottom,pedalZ:[-.078,0,.078],pedalIds:['B-AUTO-0064','B-AUTO-0059','B-AUTO-0058'],
    rodIds:['B-AUTO-0207','B-AUTO-0202','B-AUTO-0201'],braceIds:['B-AUTO-0200','B-AUTO-0199']
  };
}

export function installAccessoryDetails({T,records,replaceUnit,addDetail}) {
  const byId=new Map(records.map(r=>[r.d.id,r])),layout=accessoryLayout(T,records.map(r=>r.d));
  const V=a=>a instanceof T.Vector3?a.clone():new T.Vector3(...a);
  const brass=new T.MeshPhysicalMaterial({color:0xc6a35d,metalness:.9,roughness:.24,clearcoat:.16,envMapIntensity:.72});
  const wheelBrass=new T.MeshPhysicalMaterial({color:0xc8a35a,metalness:.84,roughness:.34,envMapIntensity:1.15});
  const steel=new T.MeshStandardMaterial({color:0x96968a,metalness:.86,roughness:.28,envMapIntensity:.6});
  const dark=new T.MeshPhysicalMaterial({color:0x121617,metalness:.04,roughness:.23,clearcoat:.55,clearcoatRoughness:.17,envMapIntensity:.42});
  const felt=new T.MeshStandardMaterial({color:0x96243b,roughness:.92});
  const diagnostics={provenance:'CFX6 photographed caster/lyre and official CFX assembly connection references',casters:[],pedals:[],props:{}};
  const definition=(geometry,material)=>({geometry,material});
  const box=(w,h,d,p,m=dark,bevel=.002)=>{
    const s=new T.Shape(),hw=w/2,hh=h/2,b=Math.min(bevel,w/5,h/5,d/5);
    s.moveTo(-hw+b,-hh);s.lineTo(hw-b,-hh);s.quadraticCurveTo(hw,-hh,hw,-hh+b);
    s.lineTo(hw,hh-b);s.quadraticCurveTo(hw,hh,hw-b,hh);s.lineTo(-hw+b,hh);s.quadraticCurveTo(-hw,hh,-hw,hh-b);
    s.lineTo(-hw,-hh+b);s.quadraticCurveTo(-hw,-hh,-hw+b,-hh);
    const g=new T.ExtrudeGeometry(s,{depth:d-2*b,bevelEnabled:b>0,bevelSize:b,bevelThickness:b,bevelSegments:2,curveSegments:4,steps:1});
    g.translate(p[0],p[1],p[2]-d/2+b);return definition(g,m);
  };
  const cylinder=(a,b,r,m=brass,rt=r,segments=24)=>{
    const p=V(a),q=V(b),delta=q.clone().sub(p),g=new T.CylinderGeometry(rt,r,delta.length(),segments,1);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize()));
    g.translate(...p.add(q).multiplyScalar(.5).toArray());return definition(g,m);
  };
  const capsule=(a,b,width,depth,m=dark)=>{
    const p=V(a),q=V(b),length=p.distanceTo(q),shape=new T.Shape(),r=width/2;
    shape.moveTo(-r,-length/2+r);shape.lineTo(-r,length/2-r);shape.absarc(0,length/2-r,r,Math.PI,0,true);
    shape.lineTo(r,-length/2+r);shape.absarc(0,-length/2+r,r,0,-Math.PI,true);
    const bevel=Math.min(.0025,depth*.18),g=new T.ExtrudeGeometry(shape,{depth:depth-2*bevel,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:2,curveSegments:8,steps:1});
    g.translate(0,0,-depth/2+bevel);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),q.clone().sub(p).normalize()));g.translate(...p.add(q).multiplyScalar(.5).toArray());return definition(g,m);
  };
  const register=(method,id,parts)=>{if(byId.has(id)&&parts.length)method(id,parts);};

  // A real, broad single wheel carries each foot. Axle, fork, swivel plate,
  // stem and brake screw have explicit shared centres, not nearby silhouettes.
  const casterIds=['B-AUTO-0083','B-AUTO-0071','B-AUTO-0067'];
  layout.feet.forEach(([x,z],i)=>{
    const parts=[],radius=.063,axle=[x-.027,layout.floor+radius,z],stemTop=layout.legBottom+.014;
    const profile=[[0,-.019],[.026,-.022],[.047,-.020],[.057,-.017],[radius,-.010],[radius,.010],[.057,.017],[.047,.020],[.026,.022],[0,.019]].map(([r,y])=>new T.Vector2(r,y));
    const wheel=new T.LatheGeometry(profile,64).rotateX(Math.PI/2).translate(...axle);parts.push(definition(wheel,wheelBrass));
    // Face rings leave a readable rolled edge and a recessed central disk.
    for(const side of [-1,1]){
      const face=new T.TorusGeometry(.0565,.0017,8,64).translate(axle[0],axle[1],z+side*.0185);parts.push(definition(face,brass));
      const forkA=[x,.143,z+side*.029],forkB=[axle[0],axle[1],z+side*.029];
      parts.push(capsule(forkA,forkB,.031,.010,brass));
      parts.push(cylinder([axle[0],axle[1],z+side*.035],[axle[0],axle[1],z+side*.041],.013,brass));
    }
    parts.push(cylinder([axle[0],axle[1],z-.044],[axle[0],axle[1],z+.044],.006,steel));
    parts.push(cylinder([x,.138,z],[x,.153,z],.027,brass));
    parts.push(cylinder([x,.153,z],[x,.162,z],.038,brass));
    parts.push(cylinder([x,.162,z],[x,stemTop,z],.015,brass));
    parts.push(cylinder([x,.190,z],[x,.201,z],.021,brass));
    // Brake shoe touches the rear wheel rim; its screw has an actual fork mount.
    const brakeA=[x+.007,.136,z],brakeB=[axle[0]-.048,.109,z];
    parts.push(cylinder(brakeA,brakeB,.004,steel));
    parts.push(box(.020,.008,.029,brakeB,brass));
    parts.push(cylinder([x+.009,.139,z-.018],[x+.009,.139,z+.018],.003,brass));
    register(replaceUnit,casterIds[i],parts);
    diagnostics.casters.push({id:casterIds[i],axle,shaft:[x,stemTop,z],wheelRadius:radius,lowestY:layout.floor,legEngagement:stemTop-layout.legBottom});
  });

  const {lower,upper,seat,normal,angle}=layout.prop;
  register(replaceUnit,'X-AUTO-1030',[capsule(lower,upper,.031,.020,dark)]);
  const hingePlate=box(.078,.010,.050,[lower.x,lower.y-.015,lower.z],brass);
  register(addDetail,'CFX-M07',[hingePlate,cylinder([lower.x-.024,lower.y,lower.z],[lower.x+.024,lower.y,lower.z],.007,brass)]);
  // Receiver is attached to the lid item and shares the lid's underside plane.
  const cup=new T.CylinderGeometry(.023,.018,.015,24).rotateX(angle);
  const cupCenter=seat.clone().addScaledVector(normal,-.008);cup.translate(...cupCenter.toArray());
  register(addDetail,'CFX-M01',[definition(cup,dark)]);
  const {stowA,stowB}=layout.prop;
  register(replaceUnit,'X-AUTO-0973',[capsule(stowA,stowB,.019,.012,dark),cylinder(stowA.clone().add(new T.Vector3(0,-.008,0)),stowA.clone().add(new T.Vector3(0,.008,0)),.006,brass)]);
  register(addDetail,'CFX-M07',[box(.025,.010,.026,[stowB.x,stowB.y-.010,stowB.z],dark)]);
  diagnostics.props={lower:lower.toArray(),upper:upper.toArray(),lidUndersideSeat:seat.toArray(),length:lower.distanceTo(upper),rimEdge:layout.prop.edge,cupDepth:.015};

  // The original open lyre outline gets real depth and three open-bottom pedal
  // exits. Its photographed hole remains open all the way through the frame.
  const lyre=byId.get('CFX-M13'),bottom=layout.lyreBottom;
  if(lyre){
    const d=lyre.d,[bx,by,bw,bh]=d.box,cx=bx+bw/2,cy=by+bh/2;
    const px=z=>cx+z/(lyre.s0.x*.002),bottomSource=Math.max(...d.polygon.map(p=>p[1]));
    const slotTop=bottomSource-.085/(lyre.s0.z*.002),poly=[];
    d.polygon.forEach((a,i)=>{
      const b=d.polygon[(i+1)%d.polygon.length];poly.push(a);
      if(Math.abs(a[1]-bottomSource)<.01&&Math.abs(b[1]-bottomSource)<.01&&a[0]>b[0]){
        for(const z of [...layout.pedalZ].reverse()){
          poly.push([px(z+.017),bottomSource],[px(z+.017),slotTop],[px(z-.017),slotTop],[px(z-.017),bottomSource]);
        }
      }
    });
    const path=(points,shape=false)=>{const p=shape?new T.Shape():new T.Path();points.forEach(([x,y],i)=>p[i?'lineTo':'moveTo']((x-cx)*.002,-(y-cy)*.002));p.closePath();return p;};
    const shape=path(poly,true);for(const hole of d.holes||[])shape.holes.push(path(hole));
    const geo=new T.ExtrudeGeometry(shape,{depth:.082,bevelEnabled:true,bevelSize:.002,bevelThickness:.002,bevelSegments:3,curveSegments:8,steps:1}).rotateX(-Math.PI/2);
    geo.applyMatrix4(new T.Matrix4().compose(lyre.p0,lyre.q0,lyre.s0));
    const frame=[definition(geo,dark),box(.23,.030,.45,[-.966,1.022,0],dark)];
    for(const z of layout.pedalZ){
      const front=lyre.p0.x-.085;
      frame.push(box(.006,.083,.003,[front,bottom+.043,z-.019],felt,.0005));
      frame.push(box(.006,.083,.003,[front,bottom+.043,z+.019],felt,.0005));
      frame.push(box(.006,.003,.041,[front,bottom+.085,z],felt,.0005));
    }
    register(replaceUnit,'CFX-M13',frame);
  }

  // Smooth pedal loft: a raised narrow rear arm flows into the convex toe.
  // The two outside palms turn outward, as in the retained CFX6 photograph.
  const pedalGeometry=(z,side)=>{
    const controls=[[-.914,.020,.064,.0],[-.952,.022,.038,.0],[-1.008,.024,.022,.0],[-1.047,.029,.005,.0],[-1.090,.042,-.007,.003],[-1.130,.065,-.015,.008],[-1.167,.080,-.021,.012],[-1.197,.078,-.025,.013],[-1.215,.054,-.031,.014],[-1.223,.003,-.036,.014]];
    const stations=[],catmull=(a,b,c,d,t)=>.5*(2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
    for(let i=0;i<controls.length-1;i++)for(let k=0;k<6;k++){
      const a=controls[Math.max(0,i-1)],b=controls[i],c=controls[i+1],d=controls[Math.min(controls.length-1,i+2)],p=b.map((v,j)=>catmull(a[j],v,c[j],d[j],k/6));
      p[1]=Math.max(.003,p[1]);stations.push(p);
    }
    stations.push(controls.at(-1));
    const rings=24,verts=[],indices=[];
    for(const [x,w,dy,turn] of stations){
      const y=bottom+.028+dy;
      for(let j=0;j<rings;j++){
        const theta=j/rings*Math.PI*2,sz=Math.cos(theta),vertical=Math.sin(theta),thickness=vertical>=0?.008:.009;
        verts.push(x,y+vertical*thickness,z+side*turn+sz*w/2);
      }
    }
    for(let i=0;i<stations.length-1;i++)for(let j=0;j<rings;j++){const a=i*rings+j,b=i*rings+(j+1)%rings,c=b+rings,d=a+rings;indices.push(a,c,b,a,d,c);}
    const back=verts.length/3;verts.push(stations[0][0],bottom+.028+stations[0][2],z);
    const end=verts.length/3,last=stations.at(-1);verts.push(last[0],bottom+.028+last[2],z+side*last[3]);
    for(let j=0;j<rings;j++){indices.push(back,(j+1)%rings,j);const n=(stations.length-1)*rings;indices.push(end,n+j,n+(j+1)%rings);}
    // Stations run toward -X, so reverse the ring winding for outward faces.
    for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));g.setIndex(indices);g.computeVertexNormals();return g;
  };
  layout.pedalIds.forEach((id,i)=>{
    const z=layout.pedalZ[i],side=i-1,rear=[-.924,bottom+.092,z],rodTop=[-.934,1.036,z],parts=[definition(pedalGeometry(z,side),brass)];
    const pivot=[-1.007,bottom+.055,z];
    parts.push(cylinder([pivot[0],pivot[1],z-.026],[pivot[0],pivot[1],z+.026],.005,steel));
    parts.push(box(.022,.025,.014,[pivot[0],pivot[1]-.006,z-.030],brass));
    parts.push(box(.022,.025,.014,[pivot[0],pivot[1]-.006,z+.030],brass));
    register(replaceUnit,id,parts);
    const rod=[cylinder(rear,rodTop,.0048,brass),cylinder([rear[0],rear[1]-.009,z],[rear[0],rear[1]+.010,z],.009,brass),box(.036,.018,.027,[rodTop[0],rodTop[1]-.006,z],steel)];
    register(replaceUnit,layout.rodIds[i],rod);
    diagnostics.pedals.push({id,rodId:layout.rodIds[i],rear,rodTop,pivot,lowestToeY:bottom+.028-.036-.009,slotY:[bottom,bottom+.085]});
  });
  layout.braceIds.forEach((id,i)=>{
    const s=i?1:-1,a=[-.949,bottom+.13,s*.113],b=[-.49,1.078,s*.22];
    register(replaceUnit,id,[cylinder(a,b,.006,steel),box(.033,.022,.036,a,dark),box(.055,.024,.048,b,dark)]);
  });

  return diagnostics;
}
