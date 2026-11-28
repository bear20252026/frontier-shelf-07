import * as THREE from 'three';
import {toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';

export function addHardware(data, scene, pivots, mats, partsMap) {
  for (const h of data.hardware) {
    let geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(h.positions, 3));
    geometry.setIndex(h.indices); geometry = toCreasedNormals(geometry, Math.PI / 5); geometry.computeBoundingBox();
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    const material = new THREE.MeshStandardMaterial({color: h.matClass === 'fastener' ? 0xadb3bc : 0x747b86, metalness:.78, roughness:.34});
    const mesh = new THREE.Mesh(geometry, material); mesh.position.copy(center).negate(); mesh.userData.canon = h.name;
    const pivot = new THREE.Group(); pivot.add(mesh); pivot.position.copy(center);
    pivot.userData = {canon:h.name, base:center.clone()}; scene.add(pivot);
    pivots[h.name] = pivot; mats[h.name] = [material];
    const {positions, indices, ...info} = h;
    partsMap.parts[h.name] = {...info, src:h.source, tris:h.indices.length / 3, center:center.toArray(), supplemental:true};
  }
}

// Rounded polylines stay inside their control-point hull; no Catmull–Rom overshoot.
export function cableCurve(points, radius=.65) {
  const path=new THREE.CurvePath();let previous=points[0];
  for(let i=1;i<points.length-1;i++) {
    const p=points[i],before=points[i-1],after=points[i+1];
    const r=Math.min(radius,p.distanceTo(before)*.3,p.distanceTo(after)*.3);
    if(r<1e-5)continue;
    const a=p.clone().lerp(before,r/p.distanceTo(before));
    const b=p.clone().lerp(after,r/p.distanceTo(after));
    if(a.distanceTo(previous)>1e-5)path.add(new THREE.LineCurve3(previous,a));
    path.add(new THREE.QuadraticBezierCurve3(a,p,b));previous=b;
  }
  if(previous.distanceTo(points.at(-1))>1e-5)path.add(new THREE.LineCurve3(previous,points.at(-1)));
  return path;
}

function frame(direction,up) {
  const z=direction.clone().normalize(),x=new THREE.Vector3().crossVectors(up,z).normalize();
  if(x.lengthSq()<.01)x.set(1,0,0);
  const y=new THREE.Vector3().crossVectors(z,x).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
}

function ribbonGeometry(curve,width,startSide,endSide,segments=120) {
  const positions=[],indices=[],frames=[];let side=startSide.clone();
  for(let i=0;i<=segments;i++) {
    const tangent=curve.getTangent(i/segments).normalize();
    side.addScaledVector(tangent,-side.dot(tangent));
    if(side.lengthSq()<.0001)side.set(0,0,1).addScaledVector(tangent,-tangent.z);
    if(side.lengthSq()<.0001)side.set(0,1,0).addScaledVector(tangent,-tangent.y);
    side.normalize();frames.push({side:side.clone(),tangent,center:curve.getPoint(i/segments)});
  }
  const last=frames.at(-1),target=endSide.clone().addScaledVector(last.tangent,-endSide.dot(last.tangent)).normalize();
  // A ribbon's transverse axis has no sign; choose the smaller twist.
  if(target.dot(last.side)<0)target.negate();
  const twist=Math.atan2(new THREE.Vector3().crossVectors(last.side,target).dot(last.tangent),last.side.dot(target));
  frames.forEach((f,i)=>{
    const side=f.side.applyAxisAngle(f.tangent,twist*i/segments),normal=new THREE.Vector3().crossVectors(f.tangent,side).normalize();
    for(const [s,n] of [[-1,-1],[1,-1],[1,1],[-1,1]])positions.push(...f.center.clone().addScaledVector(side,s*width/2).addScaledVector(normal,n*.075).toArray());
    if(i<segments)for(let k=0;k<4;k++){const a=i*4+k,b=i*4+(k+1)%4,c=(i+1)*4+(k+1)%4,d=(i+1)*4+k;indices.push(a,b,c,a,c,d);}
  });
  indices.push(0,2,1,0,3,2,segments*4,segments*4+1,segments*4+2,segments*4,segments*4+2,segments*4+3);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

export function createCableRig(data,scene,pivots,mats,partsMap,options={}) {
  const entries=[];
  for(const spec of data.cables) {
    const anchor=a=>{
      if(!pivots[a.part])throw Error('Missing cable endpoint: '+a.part);
      return {...a,offset:new THREE.Vector3(...a.point).sub(new THREE.Vector3(...partsMap.parts[a.part].center))};
    };
    const anchors=spec.route.map(anchor),ends=spec.ends.map(anchor);
    const group=new THREE.Group();group.userData={canon:spec.name,base:new THREE.Vector3()};scene.add(group);pivots[spec.name]=group;
    const bodyMat=new THREE.MeshStandardMaterial({color:spec.color,metalness:.05,roughness:.57,side:THREE.DoubleSide});
    const plugMat=new THREE.MeshStandardMaterial({color:spec.kind==='ribbon'?0x4b8ea6:0xb5b2a3,metalness:.08,roughness:.54});
    const socketMat=new THREE.MeshStandardMaterial({color:0x242831,metalness:.25,roughness:.45});
    const contactMat=new THREE.MeshStandardMaterial({color:0xc7a46a,metalness:.68,roughness:.3});
    const materials=[bodyMat,plugMat,socketMat,contactMat];
    function box(parent,size,position,mat){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);m.position.set(...position);m.userData.canon=spec.name;parent.add(m);return m;}
    const bodies=Array.from({length:spec.kind==='ribbon'?1:spec.count},()=>{const m=new THREE.Mesh(new THREE.BufferGeometry(),bodyMat);m.userData.canon=spec.name;group.add(m);return m;});
    const receivers=[];
    const plugs=ends.map(end=>{
      const p=new THREE.Group(),[w,h,d]=end.size;group.add(p);
      box(p,[w,h,d],[0,0,d/2],plugMat);
      if(end.style==='housing')box(p,[w*.7,h+.18,.55],[0,0,d*.65],plugMat);
      if(end.style==='header')box(p,[w+.6,h+.2,1],[0,0,d-.5],socketMat);
      if(end.style==='fpc')box(p,[w,.06,.6],[0,-h/2,.35],contactMat);
      if(end.receiver){
        // Visible receiver on models whose original CAD omits the terminal.
        const receiver=options.pose?new THREE.Group():p;
        if(options.pose)group.add(receiver);
        receivers.push(receiver);
        box(receiver,[w+1.2,h+.65,.8],[0,0,-.35],socketMat);
        box(receiver,[w,h+.1,.08],[0,0,.07],contactMat);
      }else receivers.push(null);
      return p;
    });
    mats[spec.name]=materials;
    partsMap.parts[spec.name]={zh:spec.zh,desc:spec.desc+' '+spec.connector,src:spec.source,group:'cables',matClass:'cable',dynamicCable:true,supplemental:true,explodeRank:0,lid:false,center:[0,0,0],tris:0};
    entries.push({spec,anchors,ends,group,bodies,plugs,receivers});
  }
  function update() {
    scene.updateMatrixWorld(true);
    for(const e of entries) {
      const pose=options.pose?.(e.spec)||{};
      if(options.pose){e.group.visible=pose.visible!==false;if(!e.group.visible)continue;}
      const anchors=e.anchors.map(a=>pivots[a.part].localToWorld(a.offset.clone()));
      if(pose.lift)for(const a of anchors.slice(1,-1))a.y+=pose.lift;
      const endFrames=e.ends.map(a=>{
        const q=pivots[a.part].getWorldQuaternion(new THREE.Quaternion());
        const outward=new THREE.Vector3(...a.direction).applyQuaternion(q),up=new THREE.Vector3(...a.up).applyQuaternion(q);
        return {position:pivots[a.part].localToWorld(a.offset.clone()),outward,quaternion:frame(outward,up)};
      });
      endFrames.forEach((f,k)=>{
        if(options.pose&&e.receivers[k]){e.receivers[k].position.copy(f.position);e.receivers[k].quaternion.copy(f.quaternion);}
        if(pose.insert?.[k])f.position.addScaledVector(f.outward,pose.insert[k]);
      });
      const key=anchors.flatMap(p=>p.toArray()).concat(endFrames.flatMap(f=>[...f.position.toArray(),...f.quaternion.toArray()])).map(v=>v.toFixed(5)).join(',');
      if(e.cache===key)continue;e.cache=key;
      const exits=endFrames.map((f,k)=>f.position.clone().addScaledVector(f.outward,e.ends[k].size[2]));
      const leads=endFrames.map((f,k)=>exits[k].clone().addScaledVector(f.outward,e.ends[k].lead??(e.spec.kind==='ribbon'?.6:1.1)));
      const points=[exits[0],leads[0],...anchors.slice(1,-1),leads[1],exits[1]];
      const curve=cableCurve(points,e.spec.cornerRadius),segments=Math.max(48,Math.min(220,Math.ceil(curve.getLength()*1.5)));
      const sides=endFrames.map(f=>new THREE.Vector3(1,0,0).applyQuaternion(f.quaternion));
      for(let k=0;k<e.bodies.length;k++) {
        let geometry;
        if(e.spec.kind==='ribbon')geometry=ribbonGeometry(curve,e.spec.width,sides[0],sides[1],segments);
        else {
          const phase=k/e.bodies.length*Math.PI*2,spread=e.spec.spread??(e.bodies.length<=2?.19:.35);
          const offsets=Array.from({length:segments+1},(_,i)=>{
            const tangent=curve.getTangent(i/segments),side=sides[0].clone().addScaledVector(tangent,-sides[0].dot(tangent));
            if(side.lengthSq()<.01)side.set(0,0,1).addScaledVector(tangent,-tangent.z);
            side.normalize();const normal=new THREE.Vector3().crossVectors(tangent,side).normalize();
            return curve.getPoint(i/segments).addScaledVector(side,Math.cos(phase)*spread).addScaledVector(normal,Math.sin(phase)*spread);
          });
          const strand=new THREE.CurvePath();for(let i=1;i<offsets.length;i++)strand.add(new THREE.LineCurve3(offsets[i-1],offsets[i]));
          geometry=new THREE.TubeGeometry(strand,segments,e.spec.radius,6,false);
        }
        e.bodies[k].geometry.dispose();e.bodies[k].geometry=geometry;
      }
      endFrames.forEach((f,k)=>{e.plugs[k].position.copy(f.position);e.plugs[k].quaternion.copy(f.quaternion);});
      e.points=points;e.curve=curve;e.endFrames=endFrames;e.exits=exits;
      let tris=0;e.group.traverse(o=>{if(o.isMesh)tris+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});
      partsMap.parts[e.spec.name].tris=tris;
    }
    scene.updateMatrixWorld(true);
  }
  return {entries,update};
}
