export function checkStagedAssembly() {
  const a=window.__app,T=window.__THREE, names=Object.keys(a.explosionPlan);
  const world=n=>a.pivots[n].getWorldPosition(new T.Vector3());
  const update=p=>{a.setExplode(p);a.scene.updateMatrixWorld(true);};
  const saved={lid:a.state.lid,explode:a.state.explode};
  const report={};
  try {
    a.setLid(110);update(0);
    const base=Object.fromEntries(names.map(n=>[n,world(n)]));
    let maxDrift=0;
    for(const p of [0,.1,.25,.5]) {
      update(p);
      if(a.state.compExplode!==0)throw Error('Components started before assemblies separated');
      for(const n of names) {
        const anchor=a.assemblies[a.explosionPlan[n].assembly].anchor;
        const original=base[n].clone().sub(base[anchor]),current=world(n).sub(world(anchor));
        maxDrift=Math.max(maxDrift,current.distanceTo(original));
        if(current.distanceTo(original)>1e-6)throw Error('Stage one separates '+n+' from '+anchor);
      }
    }
    const anchors=Object.values(a.assemblies).map(d=>d.anchor), stopped=Object.fromEntries(anchors.map(n=>[n,world(n)]));
    const pairs=[['screen_front','screen_back'],['trackball_ball','trackball_board'],['mb_heatsink','mb_board'],['kbd_J1','kbd_board'],['bat_U1','bat_U1_2']];
    let previous=Object.fromEntries(pairs.map(([n,b])=>[n,world(n).distanceTo(world(b))]));
    for(const p of [.6,.75,1]) {
      update(p);
      for(const n of anchors)if(world(n).distanceTo(stopped[n])>1e-6)throw Error('Assembly keeps moving in stage two: '+n);
      for(const [n,b] of pairs) {
        const d=world(n).distanceTo(world(b));
        if(d<=previous[n])throw Error('Component did not separate in stage two: '+n);previous[n]=d;
      }
    }
    update(.5-1e-6);const before=Object.fromEntries(names.map(n=>[n,world(n)]));update(.5+1e-6);
    const jump=Math.max(...names.map(n=>world(n).distanceTo(before[n])));
    if(jump>.002)throw Error('Discontinuity between stages');
    document.getElementById('structureStep').click();if(a.state.explode!==.5||a.state.compExplode!==0)throw Error('Structure button');
    document.getElementById('componentStep').click();if(a.state.explode!==1||a.state.structureExplode!==1)throw Error('Component button');
    const slider=document.getElementById('explode');slider.value=0;slider.dispatchEvent(new Event('input'));a.scene.updateMatrixWorld(true);
    const returnError=Math.max(...names.map(n=>world(n).distanceTo(base[n])));if(returnError>1e-6)throw Error('Reassembly drift');
    report.stages={pass:true,assemblies:anchors.length,rigid_parts:names.length,max_rigid_drift_mm:maxDrift,boundary_jump_mm:jump,return_error_mm:returnError};
    const angles=[0,45,90,110,135,180],progresses=[0,.25,.5,.6,.75,1];
    const layers=['screen_back','display_panel','screen_front'];
    const screenNames=Object.keys(a.parts_map.parts).filter(n=>a.parts_map.parts[n].lid&&!a.parts_map.parts[n].hingeHardware);
    const chains=[layers,...[-1,1].map(s=>['screen_back','speaker_'+s,'speaker_holder_'+s,'screen_front'])];
    let rays=0,configs=0,cableChecks=0,hingeChecks=0,maxEndpoint=0,maxCoaxial=0;
    for(const angle of angles) {
      a.setLid(angle);let previousDepths,reference;
      for(const p of progresses) {
        update(p);
        const normal=new T.Vector3(0,-1,0).applyQuaternion(a.hingeGroup.quaternion),up=new T.Vector3(0,0,1).applyQuaternion(a.hingeGroup.quaternion);
        const relative=Object.fromEntries(screenNames.map(n=>[n,world(n).sub(world('screen_back'))]));
        if(p===0)reference=relative;
        const depths=Object.fromEntries(screenNames.map(n=>[n,relative[n].dot(normal)]));
        for(const chain of chains)for(let i=1;i<chain.length;i++) {
          const b=chain[i-1],f=chain[i],gap=depths[f]-depths[b];
          if(gap<=0)throw Error('Reversed screen layer '+f);
          if(previousDepths) {
            const last=previousDepths[f]-previousDepths[b];
            if(p<=.5&&Math.abs(gap-last)>1e-6)throw Error('Screen split in stage one');
            if(p>.5&&gap<=last)throw Error('Screen does not separate in stage two');
          }
        }
        for(const n of screenNames) {
          const d=relative[n].clone().sub(reference[n]);d.addScaledVector(normal,-d.dot(normal));
          if(d.length()>1e-6)throw Error('Screen alignment '+n);
        }
        for(const [x,z] of [[0,0],[-90,-50],[-90,50],[90,-50],[90,50]]) {
          const origin=world('display_panel').add(new T.Vector3(x,0,0)).addScaledVector(up,z).addScaledVector(normal,1000);
          const hit=new T.Raycaster(origin,normal.clone().negate()).intersectObjects(screenNames.map(n=>a.pivots[n]),true)[0];
          if(hit?.object.userData.canon!=='display_panel')throw Error('Display occluded: '+hit?.object.userData.canon);rays++;
        }
        for(const e of a.cableRig.entries) {
          if(!e.bodies.every(m=>m.geometry.attributes.position.array.every(Number.isFinite)))throw Error('Invalid cable geometry '+e.spec.name);
          for(const k of [0,1]) {
            const anchor=e.anchors[k===0?0:e.anchors.length-1];
            const expected=a.pivots[anchor.part].localToWorld(anchor.offset.clone());
            const endpoint=e.curve.getPoint(k),plug=e.plugs[k].getWorldPosition(new T.Vector3());
            const error=Math.max(e.exits[k].distanceTo(endpoint),expected.distanceTo(plug));maxEndpoint=Math.max(maxEndpoint,error);
            if(error>1e-6)throw Error('Detached cable '+e.spec.name);cableChecks++;
          }
        }
        for(const [side,sign] of (p===0?[['left',-1],['right',1]]:[])) {
          const points=['base','leaf','pin'].map(kind=>{const n='hinge_'+side+'_'+kind,offset=new T.Vector3(sign*126,32,-102.76).sub(new T.Vector3(...a.parts_map.parts[n].center));return a.pivots[n].localToWorld(offset);});
          // During component explosion the pin slides along X, while all bores stay coaxial.
          for(const q of points.slice(1)) {
            const error=Math.hypot(q.y-points[0].y,q.z-points[0].z);maxCoaxial=Math.max(maxCoaxial,error);
            if(error>1e-6)throw Error('Hinge lost its axis: '+side);hingeChecks++;
          }
        }
        previousDepths=depths;configs++;
      }
    }
    report.screen_layers={pass:true,configurations:configs,visibility_rays:rays,angles,progresses,order_front_to_back:[...layers].reverse()};
    report.cables={pass:true,cables:a.cableRig.entries.length,endpoint_checks:cableChecks,max_endpoint_error_mm:maxEndpoint};
    report.hinges={pass:true,pairs:2,axis_checks:hingeChecks,max_axis_error_mm:maxCoaxial};
    a.select('cable_oled');if(!document.getElementById('infoName').textContent.includes('排线'))throw Error('Cable picking');a.select(null);
    document.querySelector('[data-g="hinges"]').click();if(a.mats.hinge_left_pin[0].opacity!==1||a.mats.kbd_board[0].opacity!==.08)throw Error('Hinge filter');document.querySelector('[data-g="hinges"]').click();
    a.setPower(false);if(a.emissiveOf('display_panel').i!==0)throw Error('Power off');a.setPower(true);
    report.interaction={pass:true,nodes:Object.keys(a.pivots).length,selection:true,filters:true,power:true};
    return report;
  } finally {a.setLid(saved.lid);a.setExplode(saved.explode);a.frameCamera();}
}

export function supplementGeometry() {
  const a=window.__app,T=window.__THREE;
  const out={};
  for(const angle of [0,110]) {
    a.setLid(angle);a.setExplode(0);a.scene.updateMatrixWorld(true);
    out[angle]=Object.entries(a.parts_map.parts).filter(([,p])=>p.supplemental).map(([name,info])=>{
      const chunks=[];
      a.pivots[name].traverse(o=>{if(!o.isMesh)return;const pos=o.geometry.attributes.position,v=new T.Vector3(),vertices=[];
        for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld);vertices.push(...v.toArray().map(x=>Math.round(x*1e6)/1e6));}
        chunks.push({positions:vertices,indices:o.geometry.index?Array.from(o.geometry.index.array):Array.from({length:pos.count},(_,i)=>i),color:o.material.color.toArray(),metalness:o.material.metalness,roughness:o.material.roughness});
      });
      return {name,zh:info.zh,lid:info.lid,cable:!!info.dynamicCable,cad:info.cad||null,source:info.src,desc:info.desc,chunks};
    });
  }
  return out;
}
