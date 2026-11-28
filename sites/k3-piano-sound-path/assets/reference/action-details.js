import {actionKeyboardLayout,actionDamperLayout} from './assembly-action.js';

// Assembly-only finish and connections inferred from the retained CFX6 photo
// and Yamaha's keyboard/action close-ups. Original selectable photo units and
// their polygons remain the exact flat endpoint; these are not factory CAD.
export function installActionDetails({T,records,replaceUnit,addDetail}){
  const layout=actionKeyboardLayout(),{notes,whites,blacks,whitePitch,sectionCounts}=layout;
  const byId=new Map(records.map(r=>[r.d.id,r]));
  const byPrefix=p=>records.filter(r=>r.d.id.startsWith(p)).sort((a,b)=>a.d.id.localeCompare(b.d.id,undefined,{numeric:true}));
  const white=new T.MeshPhysicalMaterial({color:0xf4f1e8,roughness:.23,clearcoat:.38,clearcoatRoughness:.19,envMapIntensity:.52});
  const black=new T.MeshPhysicalMaterial({color:0x111516,roughness:.25,clearcoat:.4,clearcoatRoughness:.21,envMapIntensity:.56});
  const wood=new T.MeshStandardMaterial({color:0xdfb98e,roughness:.56});
  const lightWood=new T.MeshStandardMaterial({color:0xd8ae87,roughness:.62});
  const brass=new T.MeshStandardMaterial({color:0xb6a060,metalness:.78,roughness:.34,envMapIntensity:.64});
  const steel=new T.MeshStandardMaterial({color:0x96978d,metalness:.82,roughness:.36,envMapIntensity:.5});
  const felt=new T.MeshStandardMaterial({color:0xe7dfca,roughness:.95});
  const redFelt=new T.MeshStandardMaterial({color:0x8d2636,roughness:.97});
  const V=a=>new T.Vector3(...a);
  const def=(geometry,material,name)=>({geometry,material,name});
  const box=(x,y,z,w,h,d,m,name)=>def(new T.BoxGeometry(w,h,d).translate(x,y,z),m,name);
  const solidXZ=(points,bottom,top,m,name,bevel=.0006)=>{
    const clean=points.filter((p,i)=>!i||p[0]!==points[i-1][0]||p[1]!==points[i-1][1]);
    const shape=new T.Shape();clean.forEach(([x,z],i)=>shape[i?'lineTo':'moveTo'](x,-z));shape.closePath();
    const g=new T.ExtrudeGeometry(shape,{depth:top-bottom-2*bevel,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:3,curveSegments:6,steps:1}).rotateX(-Math.PI/2).translate(0,bottom+bevel,0);
    return def(g,m,name);
  };
  const cylinder=(a,b,r,m,name,segments=12)=>{
    const start=V(a),end=V(b),direction=end.clone().sub(start),g=new T.CylinderGeometry(r,r,direction.length(),segments);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(V([0,1,0]),direction.normalize()));g.translate(...start.add(end).multiplyScalar(.5).toArray());return def(g,m,name);
  };
  const mergeByMaterial=parts=>{
    const groups=new Map();for(const part of parts){const a=groups.get(part.material)||[];a.push(part);groups.set(part.material,a);}
    return [...groups].map(([material,defs])=>{
      if(defs.length===1)return defs[0];
      const count=defs.reduce((n,d)=>n+d.geometry.attributes.position.count,0),position=new Float32Array(count*3),normal=new Float32Array(count*3),indices=[];
      let offset=0;for(const d of defs){const g=d.geometry,p=g.attributes.position;position.set(p.array,offset*3);normal.set(g.attributes.normal.array,offset*3);for(let i=0;i<(g.index?.count??p.count);i++)indices.push(offset+(g.index?g.index.getX(i):i));offset+=p.count;}
      const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(position,3));g.setAttribute('normal',new T.BufferAttribute(normal,3));g.setIndex(indices);
      return def(g,material,'connected-bank-'+defs[0].name);
    });
  };
  // A longitudinal loft uses explicit shoulder chamfers. Unlike a box with a
  // colour change it has a narrowed top, sloped sides and a rising front face.
  const blackGeometry=z=>{
    const stations=[[-1.586,.00865,.00755,1.1290],[-1.584,.00915,.00775,1.1320],[-1.567,.00915,.00755,1.1568],[-1.563,.0091,.00755,1.1588],[-1.401,.00845,.00705,1.1590],[-1.395,.00825,.00690,1.1580]];
    const positions=[],indices=[],bottom=1.1188;
    for(const [x,base,top,y] of stations){
      const shoulder=.00125;
      for(const [dy,dz] of [[bottom,-base+.00045],[bottom,base-.00045],[bottom+.00045,base],[y-.0025,top+shoulder],[y-.00045,top],[y,top-.00045],[y,-top+.00045],[y-.00045,-top],[y-.0025,-top-shoulder],[bottom+.00045,-base]])positions.push(x,dy,z+dz);
    }
    const ring=10;
    for(let i=0;i<stations.length-1;i++)for(let j=0;j<ring;j++){const a=i*ring+j,b=i*ring+(j+1)%ring,c=b+ring,d=a+ring;indices.push(a,c,b,a,d,c);}
    for(let j=1;j<ring-1;j++){indices.push(0,j,j+1);const a=(stations.length-1)*ring;indices.push(a,a+j+1,a+j);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
  };
  const keyDiagnostics=[];
  byPrefix('KEY-WHITE-').forEach((r,i)=>{
    const n=whites[i],w=whitePitch-.0018,b=.00055;
    const leftBlack=notes[n.index-1]?.black,rightBlack=notes[n.index+1]?.black;
    const lo=n.z-w/2,hi=n.z+w/2;
    const rearLo=leftBlack?n.z-whitePitch/2+.0099:lo;
    const rearHi=rightBlack?n.z+whitePitch/2-.0099:hi;
    const outline=[[-1.700+b,lo+b],[-1.591-b,lo+b],[-1.591-b,rearLo+b],[-1.395-b,rearLo+b],[-1.395-b,rearHi-b],[-1.591-b,rearHi-b],[-1.591-b,hi-b],[-1.700+b,hi-b]];
    const parts=[solidXZ(outline,1.102,1.124,white,'white-key-cap',b)];
    parts.push(solidXZ([[-1.700+b,lo+b],[-1.693-b,lo+b],[-1.693-b,hi-b],[-1.700+b,hi-b]],1.088,1.105,white,'individual-white-front-lip',b));
    replaceUnit(r.d.id,parts);keyDiagnostics.push({id:r.d.id,midi:n.midi,kind:'white',z:n.z,width:w,frontX:-1.700,rearX:-1.395,topY:1.124});
  });
  byPrefix('KEY-BLACK-').forEach((r,i)=>{
    const n=blacks[i];replaceUnit(r.d.id,[def(blackGeometry(n.z),black,'tapered-black-key')]);
    keyDiagnostics.push({id:r.d.id,midi:n.midi,kind:'black',z:n.z,width:.0183,topWidth:.0151,frontX:-1.586,rearX:-1.395,topY:1.159});
  });
  // Each original key lever fans from its correct diatonic keyboard centre to
  // its chromatic action centre. A0 and C8 remain the two ends of the 88 notes.
  byPrefix('KEY-WOOD-').forEach((r,i)=>{
    const n=notes[i],fw=n.black?.0136:whitePitch-.0032,tw=.0130,b=.00035,front=n.black?-1.583:-1.693,shoulder=n.black?-1.581:-1.595,neck=n.black?-1.578:-1.592;
    const points=[[front,n.z-fw/2],[shoulder,n.z-fw/2],[neck,n.z-.0065],[-1.397,n.z-.0065],[-1.337,n.tailZ-tw/2],[-1.085,n.tailZ-tw/2],[-1.085,n.tailZ+tw/2],[-1.337,n.tailZ+tw/2],[-1.397,n.z+.0065],[neck,n.z+.0065],[shoulder,n.z+fw/2],[front,n.z+fw/2]];
    const parts=[solidXZ(points,1.074,1.102,wood,'continuous-key-lever',b)];
    if(n.black)parts.push(box(-1.489,1.1105,n.z,.200,.017,.0130,wood,'black-key-riser'));
    // Capstan head meets the underside of its individual wippen lever.
    parts.push(cylinder([-1.193,1.102,n.tailZ],[-1.193,1.177,n.tailZ],.0023,brass,'key-capstan'));
    parts.push(cylinder([-1.193,1.173,n.tailZ],[-1.193,1.180,n.tailZ],.0044,brass,'capstan-head'));
    replaceUnit(r.d.id,mergeByMaterial(parts));
  });

  const bounds=[-.89,-.48,-.18,.18,.54,.89];
  // Source bracket side profiles get usable thickness; their foot extensions
  // touch the keybed at 1.035 and leave the curved rim's tail entirely free.
  byPrefix('BRASS-BRACKET-').forEach((r,i)=>{
    const d=r.d,poly=d.polygon,xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]);
    const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),z=bounds[i],thickness=i===0||i===5?.009:.004;
    const inner=i>0&&i<5,footBottom=inner?1.0721:1.035,footTop=inner?1.079:1.060;
    const shape=new T.Shape();poly.forEach(([x,y],j)=>shape[j?'lineTo':'moveTo'](-1.297+(x-x0)/(x1-x0)*.211,footTop+(y1-y)/(y1-y0)*(1.307-footTop)));shape.closePath();
    const g=new T.ExtrudeGeometry(shape,{depth:thickness-.0006,bevelEnabled:true,bevelSize:.0003,bevelThickness:.0003,bevelSegments:2,steps:1}).translate(0,0,z-thickness/2+.0003);
    const parts=[def(g,brass,'photo-profile-action-bracket'),box(-1.19,(footBottom+footTop)/2,z,.210,footTop-footBottom,thickness,lightWood,inner?'bracket-keyframe-foot':'bracket-keybed-foot')];
    parts.push(cylinder([-1.256,1.280,z-thickness],[-1.256,1.280,z+thickness],.0045,steel,'bracket-rail-fastener'));
    parts.push(cylinder([-1.126,1.102,z],[-1.126,1.228,z],thickness/2,brass,'rear-action-rail-post'));
    replaceUnit(d.id,parts);
  });
  let noteOffset=0;
  byPrefix('BANK-W-').forEach((r,section)=>{
    const count=sectionCounts[section],ns=notes.slice(noteOffset,noteOffset+count),z0=bounds[section],z1=bounds[section+1],parts=[];noteOffset+=count;
    parts.push(box(-1.269,1.184,(z0+z1)/2,.023,.021,z1-z0,lightWood,'wippen-flange-rail'));
    parts.push(box(-1.266,1.197,(z0+z1)/2,.025,.004,z1-z0,redFelt,'wippen-rail-felt'));
    for(const n of ns){
      const z=n.tailZ;
      parts.push(solidXZ([[-1.270,z-.0054],[-1.128,z-.0054],[-1.118,z-.0039],[-1.118,z+.0039],[-1.128,z+.0054],[-1.270,z+.0054]],1.179,1.196,lightWood,'individual-wippen',.0003));
      parts.push(cylinder([-1.179,1.196,z],[-1.229,1.276,z],.0023,lightWood,'jack'));
      parts.push(cylinder([-1.251,1.195,z],[-1.229,1.268,z],.0027,lightWood,'repetition-lever'));
      parts.push(cylinder([-1.266,1.190,z-.0068],[-1.266,1.190,z+.0068],.0015,steel,'wippen-centre-pin',8));
    }
    replaceUnit(r.d.id,mergeByMaterial(parts));
  });
  noteOffset=0;
  byPrefix('BANK-H-').forEach((r,section)=>{
    const count=sectionCounts[section],ns=notes.slice(noteOffset,noteOffset+count),z0=bounds[section],z1=bounds[section+1],parts=[];noteOffset+=count;
    parts.push(box(-1.260,1.280,(z0+z1)/2,.020,.021,z1-z0,steel,'hammer-flange-rail'));
    parts.push(box(-1.252,1.287,(z0+z1)/2,.007,.017,z1-z0,lightWood,'hammer-wood-flanges'));
    for(const n of ns){
      const z=n.tailZ,headX=-1.123+(n.index/87)*.004,headY=1.322,h=.049-(n.index/87)*.006;
      parts.push(cylinder([-1.253,1.285,z],[headX,headY-.009,z],.0028,wood,'hammer-shank'));
      parts.push(cylinder([-1.230,1.280,z-.0040],[-1.230,1.280,z+.0040],.0068,felt,'hammer-knuckle'));
      // Felt is a rounded, closed cross-section rather than a horizontal slab.
      const s=new T.Shape(),half=.0145,base=headY-h/2,top=headY+h/2;
      s.moveTo(headX-half,base+.009);s.lineTo(headX-half,top-.015);s.bezierCurveTo(headX-half,top+.003,headX+half,top+.003,headX+half,top-.015);s.lineTo(headX+half,base+.009);s.quadraticCurveTo(headX,base-.005,headX-half,base+.009);s.closePath();
      const g=new T.ExtrudeGeometry(s,{depth:.0116,bevelEnabled:true,bevelSize:.0006,bevelThickness:.0006,bevelSegments:3,curveSegments:8,steps:1}).translate(0,0,z-.0058);
      parts.push(def(g,felt,'rounded-hammer-felt'));
      parts.push(cylinder([headX,headY-.019,z-.0048],[headX,headY+.004,z-.0048],.0034,wood,'hammer-core'));
    }
    replaceUnit(r.d.id,mergeByMaterial(parts));
  });
  // Four photographed black/red banks keep their traced small parts. Their
  // narrower rear rail clears the jack paths and meets the bracket posts.
  byPrefix('BANK-D-').forEach(r=>{
    const p=r.p0,z=p.z,span=r.d.box[3]*.002*r.s0.z;
    addDetail(r.d.id,[box(-1.125,1.228,z,.032,.012,span,lightWood,'black-red-bank-underrail')]);
  });
  // The original side-view dampers were standing above the strings as broad
  // grey fins. Give each one a felt underside, dark wooden head and fine
  // vertical wire. Its head follows its strand's direction and tangent plane.
  const dampers=['D1-DAMPER-','D2-DAMPER-','D3-DAMPER-'].flatMap(byPrefix),damperDiagnostics=[];
  dampers.forEach((r,i)=>{
    const route=actionDamperLayout(i),[x,,z]=route.head,dx=route.b[0]-route.a[0],dz=route.b[2]-route.a[2],length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length,nx=-uz,nz=ux;
    const f=i/70,halfLength=(.064-.017*f)/2,halfWidth=(.0125-.0025*f)/2,round=.0022;
    const footprint=(hl,hw)=>[[-hl+round,-hw],[hl-round,-hw],[hl,-hw+round],[hl,hw-round],[hl-round,hw],[-hl+round,hw],[-hl,hw-round],[-hl,-hw+round]].map(([u,v])=>[x+ux*u+nx*v,z+uz*u+nz*v]);
    const contact=1.355+route.wireRadius,parts=[];
    parts.push(solidXZ(footprint(halfLength,halfWidth),1.367,1.379,black,'damper-wood-head',.0004));
    parts.push(solidXZ(footprint(halfLength-.002,halfWidth-.0008),contact,1.368,felt,'damper-contact-felt',0));
    // The wire rises beside the felt's centreline and enters its wooden head.
    const stemX=x+nx*(halfWidth-.0008),stemZ=z+nz*(halfWidth-.0008);
    parts.push(cylinder([stemX,1.230,stemZ],[stemX,1.373,stemZ],.00115,steel,'vertical-damper-wire'));
    const anchorZ=notes[i].tailZ;
    parts.push(cylinder([-1.125,1.231,anchorZ],[stemX,1.231,stemZ],.0024,lightWood,'damper-underlever'));
    parts.push(cylinder([stemX,1.228,stemZ],[stemX,1.240,stemZ],.0034,brass,'damper-wire-socket'));
    replaceUnit(r.d.id,mergeByMaterial(parts));
    damperDiagnostics.push({id:r.d.id,strand:i,head:[x,1.373,z],feltContactY:contact,wireTopY:1.355+route.wireRadius,headTopY:1.379});
  });
  if(byId.has('P-AUTO-4005')){
    const a=[-1.16,-.75],b=[-.91,.73],len=Math.hypot(b[0]-a[0],b[1]-a[1]),nx=-(b[1]-a[1])/len*.008,nz=(b[0]-a[0])/len*.008;
    replaceUnit('P-AUTO-4005',[solidXZ([[a[0]+nx,a[1]+nz],[b[0]+nx,b[1]+nz],[b[0]-nx,b[1]-nz],[a[0]-nx,a[1]-nz]],1.350,1.354,redFelt,'string-start-felt-strip',0)]);
  }
  return {keys:keyDiagnostics,keyCount:notes.length,whiteCount:whites.length,blackCount:blacks.length,bracketZ:bounds,actionX:[-1.298,-1.085],bracketFootY:[1.035,1.0721,1.0721,1.0721,1.0721,1.035],dampers:damperDiagnostics,sourceFlatPreserved:true};
}
