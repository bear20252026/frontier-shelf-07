import * as THREE from 'three';
import {DURATION,TIMING,FRONT_YAW,filmTime} from './film-motion.js?v=25s-keys';

export async function checkFilm({model,motion,cables,draw,camera}){
  const {root,pivots,map}=model,localBounds={};root.updateMatrixWorld(true);
  for(const [name,p] of Object.entries(pivots))if(!map.parts[name].dynamicCable){
    const box=new THREE.Box3(),inverse=p.matrixWorld.clone().invert();p.traverse(o=>{if(o.isMesh){o.geometry.computeBoundingBox();box.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld)));}});localBounds[name]=box;
  }
  const byPart=Object.fromEntries(motion.units.flatMap(u=>u.names.map(n=>[n,u])));
  const times=[...new Set([...Array.from({length:DURATION*10+1},(_,i)=>i/10),...motion.units.filter(u=>u.flip).flatMap(u=>[u.start+u.duration*.2,u.start+u.duration*.38,u.start+u.duration*.57])])].sort((a,b)=>a-b);
  let minFloor=Infinity,maxFrame=0;const floorIssues=[],frameIssues=[],flipClearances=[];
  const v=new THREE.Vector3();
  for(const t of times){
    draw(t);sceneUpdate();if(times.indexOf(t)%8===0)await new Promise(r=>requestAnimationFrame(r));const shell=localBounds.case_mainbox.clone().applyMatrix4(pivots.case_mainbox.matrixWorld);
    for(const [name,box] of Object.entries(localBounds)){
      const u=byPart[name];if(!u.g.visible||t<u.start+Math.min(filmTime(.06),u.duration*.18))continue;
      const world=box.clone().applyMatrix4(pivots[name].matrixWorld);minFloor=Math.min(minFloor,world.min.y);
      if(world.min.y<-.2)floorIssues.push({t,name,y:world.min.y});
      let extent=0;for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){v.set(x,y,z).applyMatrix4(pivots[name].matrixWorld).project(camera);extent=Math.max(extent,Math.abs(v.x),Math.abs(v.y));}
      maxFrame=Math.max(maxFrame,extent);if(extent>.98)frameIssues.push({t,name,extent});
    }
    for(const u of motion.units.filter(u=>u.flip))if(t>u.start+.16*u.duration&&t<u.start+.58*u.duration){
      const box=new THREE.Box3();for(const n of u.names)box.union(localBounds[n].clone().applyMatrix4(pivots[n].matrixWorld));
      flipClearances.push({t,unit:u.id,clearance:box.min.y-shell.max.y});
    }
  }
  draw(TIMING.closedCheck);let finalError=0;
  for(const [name,p] of Object.entries(pivots))if(!map.parts[name].dynamicCable){const actual=root.worldToLocal(p.getWorldPosition(new THREE.Vector3()));finalError=Math.max(finalError,actual.distanceTo(new THREE.Vector3(...map.parts[name].center)));}
  const closed=Math.abs(motion.hinge.rotation.x)<1e-9;
  draw(DURATION);let endpointError=0;
  for(const e of cables.entries)for(let k=0;k<2;k++){
    const a=e.ends[k],expected=pivots[a.part].localToWorld(a.offset.clone());endpointError=Math.max(endpointError,e.plugs[k].position.distanceTo(expected));
  }
  const openDegrees=-THREE.MathUtils.radToDeg(motion.hinge.rotation.x);
  const frontYawDegrees=THREE.MathUtils.radToDeg(root.rotation.y),frontTurnError=Math.abs(root.rotation.y-FRONT_YAW);
  const viewDirection=camera.getWorldDirection(new THREE.Vector3()).negate();
  const frontFacingError=Math.abs(Math.atan2(viewDirection.x,viewDirection.z)-root.rotation.y);
  const rainUnits=motion.units.filter(u=>u.rain),rainEnd=Math.max(...rainUnits.map(u=>u.start+u.duration));
  let peakAirborne=0,minimumRainTravel=Infinity,maximumRainFinalError=0;
  for(let tick=Math.floor(Math.min(...rainUnits.map(u=>u.start))*100);tick<=Math.ceil(rainEnd*100);tick++){
    const t=tick/100;peakAirborne=Math.max(peakAirborne,rainUnits.filter(u=>t>=u.start+filmTime(.06)&&t<u.start+u.duration).length);
  }
  for(const u of rainUnits){
    draw(u.start);const above=u.g.getWorldPosition(new THREE.Vector3());
    draw(u.start+u.duration);const landed=u.g.getWorldPosition(new THREE.Vector3());
    minimumRainTravel=Math.min(minimumRainTravel,above.y-landed.y);
    maximumRainFinalError=Math.max(maximumRainFinalError,u.g.position.distanceTo(u.base));
  }
  const ordinaryRain=rainUnits.filter(u=>u.id!=='heatsink'),compute=motion.units.find(u=>u.id==='compute'),heatsink=rainUnits.find(u=>u.id==='heatsink');
  const rainChecks={parts:rainUnits.length,peakAirborne,minimumTravel:minimumRainTravel,finalPositionError:maximumRainFinalError,
    staggeredStarts:new Set(ordinaryRain.map(u=>u.start)).size,
    computeAfterRain:compute.start>=Math.max(...ordinaryRain.map(u=>u.start+u.duration)),
    heatsinkAfterCompute:heatsink.start>=compute.start+compute.duration};
  rainChecks.pass=rainChecks.parts===513&&peakAirborne>100&&minimumRainTravel>80&&maximumRainFinalError<1e-8&&rainChecks.staggeredStarts>500&&rainChecks.computeAfterRain&&rainChecks.heatsinkAfterCompute;
  const keyUnits=motion.units.filter(u=>u.names.every(n=>map.parts[n].matClass==='keycap'));
  const keyFirst=Math.min(...keyUnits.map(u=>u.start)),keyLast=Math.max(...keyUnits.map(u=>u.start+u.duration));
  const keycapChecks={parts:keyUnits.length,firstStart:keyFirst,lastLanding:keyLast,totalSeconds:keyLast-keyFirst,minimumFallSeconds:Math.min(...keyUnits.map(u=>u.duration)),settledBeforeFlip:keyLast<TIMING.bottomFlip[0]};
  keycapChecks.pass=keycapChecks.parts===80&&keycapChecks.totalSeconds>=2.4&&keycapChecks.minimumFallSeconds>=.8&&keycapChecks.settledBeforeFlip;
  const flipChecks=motion.units.filter(u=>u.flip).map(u=>{draw(u.start+.1*u.duration);const before=u.g.rotation.x;draw(u.start+u.duration);const after=u.g.rotation.x;return {unit:u.id,beforeDegrees:THREE.MathUtils.radToDeg(before),afterDegrees:THREE.MathUtils.radToDeg(after),pass:Math.abs(before-Math.PI)<1e-8&&Math.abs(after)<1e-8};});
  const minFlipClearance=Math.min(...flipClearances.map(x=>x.clearance));
  const report={pass:keycapChecks.pass&&rainChecks.pass&&frontTurnError<1e-8&&frontFacingError<1e-8&&floorIssues.length===0&&frameIssues.length===0&&minFlipClearance>0&&finalError<.02&&closed&&Math.abs(openDegrees-110)<1e-6&&endpointError<1e-6&&flipChecks.every(c=>c.pass),duration:DURATION,keycapChecks,rainChecks,frontYawDegrees,frontFacingError,sampleCount:times.length,rigidParts:Object.keys(localBounds).length,assemblyUnits:motion.units.length,flipChecks,minFlipClearance,minimumFloorY:minFloor,maxFrameExtent:maxFrame,floorIssues:floorIssues.slice(0,12),frameIssues:frameIssues.slice(0,16),finalRigidError:finalError,closedBeforeOpening:closed,finalLidDegrees:openDegrees,finalCableEndpointError:endpointError,note:'Checks sample geometric bounds, turning clearance, final registration and cable endpoints. They are not a continuous collision solver.'};
  return report;
  function sceneUpdate(){root.parent.updateMatrixWorld(true);camera.updateMatrixWorld(true);}
}
