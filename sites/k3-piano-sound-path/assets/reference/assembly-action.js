/* Photo-outline action assembly poses. Visible photo edges stay untouched.
 * Coordinate convention: X front-to-tail; Y up; Z bass-to-treble.
 * These are coherent presentation poses, not certified CFX manufacturing CAD.
 */
export function actionKeyboardLayout(){
  const width=1.76,whitePitch=width/52,blackPC=new Set([1,3,6,8,10]);let whiteIndex=0;
  const notes=Array.from({length:88},(_,index)=>{
    const black=blackPC.has((index+21)%12),z=-width/2+(whiteIndex+(black?0:.5))*whitePitch;
    const result={index,midi:index+21,black,z,whiteIndex,tailZ:-.87+index*.02};if(!black)whiteIndex++;return result;
  });
  return {width,whitePitch,notes,whites:notes.filter(n=>!n.black),blacks:notes.filter(n=>n.black),sectionCounts:[20,15,18,18,17]};
}

// One photographed damper per routed presentation strand; the strand count is
// illustrative. This shared datum keeps every felt pad on the visible wire.
export function actionDamperLayout(index){
  const f=index/71,a=[-1.16+f*.25,1.355,-.75+f*1.48],b=[1.20-f*.50,1.355,.42+f*.32],t=.065;
  return {index,strand:index,a,b,head:a.map((v,i)=>v+(b[i]-v)*t),wireRadius:index<17?.00105:.00068};
}

export function createActionPoses(T, units) {
  const pixel=.002, poses=new Map();
  const data=units.map(unit=>unit.userData?.id?unit.userData:(unit.data?.id?unit.data:unit));
  const byPrefix=prefix=>data.filter(d=>d.id.startsWith(prefix)).sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
  const vec=a=>new T.Vector3(...a);
  const local=(d,p)=>new T.Vector3((p[0]-d.box[0]-d.box[2]/2)*pixel,0,(p[1]-d.box[1]-d.box[3]/2)*pixel);
  const area=poly=>Math.abs(poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;
  const commit=(d,position,rotation,scale,stage,extra={})=>poses.set(d.id,{position,rotation,scale,stage,...extra});
  const {width,whitePitch,notes,whites,blacks,sectionCounts}=actionKeyboardLayout();
  function ends(d){
    const xs=d.polygon.map(p=>p[0]),left=Math.min(...xs),right=Math.max(...xs);
    const mean=pts=>pts.reduce((sum,p)=>sum+p[1],0)/pts.length;
    return {a:[left,mean(d.polygon.filter(p=>p[0]<=left+1))],b:[right,mean(d.polygon.filter(p=>p[0]>=right-1))],span:right-left};
  }
  // Solve each photographed strip's scale, yaw and anchor together. Using only
  // its rectangular box would retain the fan tilt and scatter the keyboard.
  function alignLong(d,startX,length,z,y,targetWidth,stage,role){
    const e=ends(d),a=local(d,e.a),b=local(d,e.b),dx=b.x-a.x,dz=b.z-a.z;
    const visibleWidth=Math.max(.5,area(d.polygon)/e.span)*pixel;
    const sz=targetWidth/visibleWidth;
    const sx=Math.sqrt(Math.max(length*length-(sz*dz)*(sz*dz),length*length*.8))/Math.abs(dx);
    const yaw=Math.atan2(sz*dz,sx*dx),q=new T.Quaternion().setFromEuler(new T.Euler(0,yaw,0));
    const scale=[sx,1,sz],front=a.clone().multiply(vec(scale)).applyQuaternion(q);
    commit(d,[startX-front.x,y,z-front.z],[0,yaw,0],scale,stage,{assemblyRole:role});
  }
  byPrefix('KEY-WOOD-').forEach((d,i)=>alignLong(d,-1.695,.610,notes[i].z,1.075,.0145,.20,'wood-key'));
  byPrefix('KEY-WHITE-').forEach((d,i)=>alignLong(d,-1.70,.305,whites[i].z,1.102,whitePitch-.0015,.20,'white-key-surface'));
  byPrefix('KEY-BLACK-').forEach((d,i)=>alignLong(d,-1.586,.198,blacks[i].z,1.124,.0185,.20,'black-key-surface'));

  // The five source banks correspond to the photographed 20/15/18/18/17 key
  // sections. They keep their own visible contours, but close the photo gaps.
  function bank(prefix,x,y,depth,stage,counts){
    const ds=byPrefix(prefix),total=counts.reduce((a,b)=>a+b,0);let offset=0;
    ds.forEach((d,i)=>{
      const span=width*counts[i]/total,z=-width/2+offset+span/2;offset+=span;
      commit(d,[x,y,z],[0,0,0],[depth/(d.box[2]*pixel),1.2,(span-.004)/(d.box[3]*pixel)],stage,{assemblyRole:prefix.slice(0,-1).toLowerCase()});
    });
  }
  bank('BANK-W-',-1.187,1.185,.210,.35,sectionCounts);
  bank('BANK-H-',-1.188,1.292,.210,.50,sectionCounts);
  const damperBanks=byPrefix('BANK-D-');
  bank('BANK-D-',-1.125,1.235,.032,.60,damperBanks.map(d=>d.box[3]));
  const bracketZ=[-.89,-.48,-.18,.18,.54,.89];
  byPrefix('BRASS-BRACKET-').forEach((d,i)=>{
    commit(d,[-1.1915,1.186,bracketZ[i]],[Math.PI/2,0,0],[.213/(d.box[2]*pixel),.22,.252/(d.box[3]*pixel)],.35,{assemblyRole:'upright-action-bracket'});
  });

  // A photographed damper is a side view: its long wire (local X) becomes Y,
  // its felt-head length (local Z) becomes X, and shallow depth becomes Z.
  const basis=new T.Matrix4().set(0,0,1,0,1,0,0,0,0,1,0,0,0,0,0,1);
  const damperQ=new T.Quaternion().setFromRotationMatrix(basis),damperEuler=new T.Euler().setFromQuaternion(damperQ);
  const dampers=['D1-DAMPER-','D2-DAMPER-','D3-DAMPER-'].flatMap(byPrefix);
  dampers.forEach((d,i)=>{
    const felt=d.pieces?.find(p=>p.id==='felt')?.polygon||d.polygon;
    const xx=felt.map(p=>p[0]),zz=felt.map(p=>p[1]);
    const headPixel=[(Math.min(...xx)+Math.max(...xx))/2,(Math.min(...zz)+Math.max(...zz))/2];
    const head=local(d,headPixel),scale=[.22/(d.box[2]*pixel),1.1,.077/(d.box[3]*pixel)];
    const transformed=head.multiply(vec(scale)).applyQuaternion(damperQ);
    const route=actionDamperLayout(i),target=vec([route.head[0],1.366,route.head[2]]);
    commit(d,target.sub(transformed).toArray(),[damperEuler.x,damperEuler.y,damperEuler.z],scale,.60,{assemblyRole:'upright-damper-wire-head',noteIndex:i});
  });
  const feltStrip=data.find(d=>d.id==='P-AUTO-4005');
  if(feltStrip)commit(feltStrip,[-1.035,1.349,-.01],[0,Math.atan2(.25,1.48),0],[.016/(feltStrip.box[2]*pixel),.45,Math.hypot(.25,1.48)/(feltStrip.box[3]*pixel)],.67,{assemblyRole:'string-start-felt-rail'});

  // Keep every photographed pin profile and its still-unconfirmed identity.
  // Their earlier long diagonal rows crossed the speaking strings. Three
  // short rows now stay on the front mounting strip, close to string starts.
  for(let row=1;row<=3;row++)byPrefix('F'+row+'-').forEach((d,i)=>{
    const h=d.box[3]*pixel;
    commit(d,[-1.225+.25*i/80+(row-1)*.014,1.340,-.75+i*1.48/80+(row-2)*.002],[-Math.PI/2,0,0],[1,1,.040/h],.67,{assemblyRole:'illustrative-front-pin-row',row,column:i,identification:'photo pin; exact purpose unconfirmed'});
  });
  const strip=data.find(d=>d.id==='A-AUTO-3035');
  if(strip)commit(strip,[-1.112,1.211,-.525],[0,0,0],[.017/(strip.box[2]*pixel),1,.429/(strip.box[3]*pixel)],.35,{assemblyRole:'photo-wood-strip-on-rear-action-rail',identification:'photo strip; exact purpose unconfirmed'});
  poses.diagnostics={mapped:poses.size,keyNotes:88,whiteKeys:52,blackKeys:36,bankSections:14,brackets:6,damperAssemblies:71,pins:243,
    unmappedWireLoops:byPrefix('WIRE-LOOP-').map(d=>d.id),
    wireNote:'A rigid transform cannot straighten the 12 photographed coils. Preserve pK and use a reversible per-vertex arc-length morph or a cross-faded straight-wire mesh for the assembled endpoint; do not hide the rings inside the case.',
    coordinateConvention:'Photo-local XZ geometry, .002 scene units per image pixel; every returned scale applies before Euler XYZ rotation.'};
  return poses;
}
