import {createSoundPathLayout} from './sound-path-layout.js';

const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const t=clamp(value);return t*t*t*(t*(t*6-15)+10);};
const materials=mesh=>Array.isArray(mesh.material)?mesh.material:[mesh.material];

/** Continue from the teaching layers to a landscape inventory of photo parts.
 * T must be api.THREE: every renderable object belongs to the viewer's realm.
 * Call apply(time, poses) after the teaching groups receive their poses.
 * The two section halves must be reunited at chapter 6; only their layer
 * offsets differ. Nothing moves through the assembled piano on the way out.
 */
export function createFlatTransition(T,api,sectionRoot,groups){
 const {assembly,scene}=api,records=assembly.records;
 if(T!==api.THREE)throw Error('Flat transition must use the viewer Three instance.');
 if(Math.abs(assembly.progress)>.000001||assembly.playing)throw Error('Build the flat transition from the paused assembled endpoint.');
 const layers=new Map();
 for(const [layer,pair]of groups)for(const side of ['negative','positive'])for(const mesh of pair[side].children){
  if(mesh.userData.soundPathSource)layers.set(mesh.userData.soundPathSource,layer);
 }
 const poseOf=object=>({position:object.position.clone(),quaternion:object.quaternion.clone(),scale:object.scale.clone(),visible:object.visible});
 const materialState=material=>({opacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite});
 const startRecords=records.map(record=>({record,pose:poseOf(record.g),meshes:record.g.children.filter(mesh=>mesh.isMesh).map(mesh=>({
  mesh,pose:poseOf(mesh),positions:mesh.geometry.attributes.position.array.slice(),
  normals:mesh.geometry.attributes.normal?.array.slice(),
  box:mesh.geometry.boundingBox?.clone()??null,sphere:mesh.geometry.boundingSphere?.clone()??null,
  materials:materials(mesh).map(materialState),assemblyOpacity:mesh.userData.assemblyOpacity,
  hadAssemblyOpacity:Object.hasOwn(mesh.userData,'assemblyOpacity')
 }))}));
 const originalProgress=assembly.progress;
 let flatRecords;
 try{
  assembly.setProgress(1,false);scene.updateMatrixWorld(true);
  flatRecords=startRecords.map(start=>{
   const bounds=new T.Box3();
   const meshes=start.meshes.map(({mesh})=>{
    if(mesh.visible&&materials(mesh).some(material=>material.opacity>.001)){
     mesh.geometry.computeBoundingBox();bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
    }
    return{pose:poseOf(mesh),positions:mesh.geometry.attributes.position.array.slice(),normals:mesh.geometry.attributes.normal?.array.slice(),materials:materials(mesh).map(materialState)};
   });
   return{pose:poseOf(start.record.g),meshes,bounds};
  });
 }finally{
  assembly.setProgress(originalProgress,false);
  // Preserve the exact source state, including hidden originals and material
  // handovers. The sampling above is synchronous and is never rendered.
  for(const start of startRecords){
   start.record.g.position.copy(start.pose.position);start.record.g.quaternion.copy(start.pose.quaternion);start.record.g.scale.copy(start.pose.scale);start.record.g.visible=start.pose.visible;
   for(const item of start.meshes){
    const {mesh}=item;mesh.position.copy(item.pose.position);mesh.quaternion.copy(item.pose.quaternion);mesh.scale.copy(item.pose.scale);mesh.visible=item.pose.visible;
    mesh.geometry.attributes.position.array.set(item.positions);mesh.geometry.attributes.position.needsUpdate=true;
    if(item.normals){mesh.geometry.attributes.normal.array.set(item.normals);mesh.geometry.attributes.normal.needsUpdate=true;}
    mesh.geometry.boundingBox=item.box;mesh.geometry.boundingSphere=item.sphere;
    materials(mesh).forEach((material,i)=>Object.assign(material,item.materials[i]));
    if(item.hadAssemblyOpacity)mesh.userData.assemblyOpacity=item.assemblyOpacity;else delete mesh.userData.assemblyOpacity;
   }
  }
  scene.updateMatrixWorld(true);
 }
 const layout=createSoundPathLayout(startRecords.map((start,i)=>{
  const bounds=flatRecords[i].bounds;return{id:start.record.d.id,layer:layers.get(start.record.d.id)||'unknown',width:bounds.max.x-bounds.min.x,depth:bounds.max.z-bounds.min.z};
 }));
 const rotationAxis=new T.Vector3(0,1,0);
 for(let i=0;i<flatRecords.length;i++){
  const end=flatRecords[i],placement=layout.placements.get(startRecords[i].record.d.id),center=end.bounds.getCenter(new T.Vector3());
  const x=end.pose.position.x-center.x,z=end.pose.position.z-center.z,c=Math.cos(placement.rotation),s=Math.sin(placement.rotation);
  end.pose.position.set(placement.x+c*x+s*z,end.pose.position.y,placement.z-s*x+c*z);
  end.pose.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(rotationAxis,placement.rotation));
 }
 layout.stats.bounds.min[1]=Math.min(...flatRecords.map(end=>end.bounds.min.y));layout.stats.bounds.max[1]=Math.max(...flatRecords.map(end=>end.bounds.max.y));
 layout.stats.bounds.center=layout.stats.bounds.min.map((value,i)=>(value+layout.stats.bounds.max[i])/2);
 const displayRoot=new T.Group();displayRoot.name='sound-path-original-flat';displayRoot.visible=false;scene.add(displayRoot);
 const items=[],stats={units:records.length,meshes:0,morphingMeshes:0,finalVisibleMeshes:0,layout:layout.stats};
 const different=(a,b)=>a.length!==b.length||a.some((value,i)=>value!==b[i]);
 for(let i=0;i<startRecords.length;i++){
  const start=startRecords[i],end=flatRecords[i],group=new T.Group(),layer=layers.get(start.record.d.id)||'unknown';
  group.name=start.record.d.id;group.userData.soundPathSource=start.record.d.id;group.userData.soundPathLayer=layer;
  group.userData.soundPathLayoutCluster=layout.placements.get(start.record.d.id).cluster;displayRoot.add(group);
  const children=[];
  for(let j=0;j<start.meshes.length;j++){
   const before=start.meshes[j],after=end.meshes[j],source=before.mesh;
   if(before.positions.length!==after.positions.length)throw Error('Source topology changed for '+start.record.d.id);
   const geometry=source.geometry.clone(),cloned=materials(source).map(material=>material.clone());
   const mesh=new T.Mesh(geometry,Array.isArray(source.material)?cloned:cloned[0]);
   mesh.name=source.name;mesh.userData={soundPathSource:start.record.d.id,soundPathLayer:layer,soundPathFlat:true,sourceUUID:source.uuid};
   mesh.castShadow=source.castShadow;mesh.receiveShadow=source.receiveShadow;mesh.renderOrder=source.renderOrder;mesh.layers.mask=source.layers.mask;
   const morph=different(before.positions,after.positions);if(morph)stats.morphingMeshes++;
   group.add(mesh);stats.meshes++;if(after.pose.visible&&after.materials.some(material=>material.opacity>.001))stats.finalVisibleMeshes++;
   children.push({mesh,before,after,morph,materials:cloned,castShadow:source.castShadow});
  }
  items.push({group,layer,start,end,children});
 }
 const setOpacity=(material,alpha,endpoint)=>{
  const transparent=endpoint?endpoint.transparent:alpha<.998;
  if(material.transparent!==transparent){material.transparent=transparent;material.needsUpdate=true;}
  material.opacity=alpha;material.depthWrite=endpoint?endpoint.depthWrite:alpha>=.94;
 };
 const place=(object,before,after,t)=>{
  object.position.copy(before.position).lerp(after.position,t);object.quaternion.copy(before.quaternion).slerp(after.quaternion,t);object.scale.copy(before.scale).lerp(after.scale,t);
 };
 const clearanceBox=new T.Box3();
 let active=false,lastMorph=-1;
 function sectionOpacity(poses,multiplier){
  for(const [layer,pair]of groups)for(const side of ['negative','positive']){
   const pose=poses[layer][side],alpha=pose.opacity*multiplier;pair[side].visible=alpha>.00001;
   for(const mesh of pair[side].children){
    const profile=mesh.userData.sectionCap?null:pose.materialOpacity?.get(mesh.userData.sectionSource);
    let maxAlpha=0;
    materials(mesh).forEach((material,i)=>{const value=(profile?.[i]??pose.opacity)*multiplier;setOpacity(material,value);maxAlpha=Math.max(maxAlpha,value);});
    mesh.castShadow=maxAlpha>.8&&!!mesh.userData.soundPathCastShadow;
   }
  }
 }
 function apply(time,poses){
  if(time<=6){
   displayRoot.visible=false;sectionRoot.visible=true;
   if(active)sectionOpacity(poses,1);
   active=false;return;
  }
  const progress=clamp(time-6),handover=smooth(progress/.12),travel=smooth((progress-.10)/.90);
  active=true;displayRoot.visible=true;sectionRoot.visible=handover<1;
  if(sectionRoot.visible)sectionOpacity(poses,1-handover);
  for(const item of items){
   const {group,layer,start,end,children}=item,pose=poses[layer].positive;
   // Chapter-6 layers remain fixed while the photographic pieces leave them.
   // Callers keep their chapter-6 offsets through the final camera transition.
   group.position.copy(start.pose.position).add(new T.Vector3(...pose.position)).lerp(end.pose.position,travel);
   group.quaternion.copy(start.pose.quaternion).slerp(end.pose.quaternion,travel);group.scale.copy(start.pose.scale).lerp(end.pose.scale,travel);
   for(const child of children){
    const {mesh,before,after}=child;place(mesh,before.pose,after.pose,travel);
    if(child.morph&&travel!==lastMorph){
     const position=mesh.geometry.attributes.position,normal=mesh.geometry.attributes.normal;
     if(travel===0||travel===1)position.array.set(travel===0?before.positions:after.positions);
     else for(let k=0;k<position.array.length;k++)position.array[k]=before.positions[k]+(after.positions[k]-before.positions[k])*travel;
     position.needsUpdate=true;
     if(normal&&before.normals&&after.normals){
      if(travel===0||travel===1)normal.array.set(travel===0?before.normals:after.normals);
      else for(let k=0;k<normal.array.length;k+=3){
       const x=before.normals[k]+(after.normals[k]-before.normals[k])*travel,y=before.normals[k+1]+(after.normals[k+1]-before.normals[k+1])*travel,z=before.normals[k+2]+(after.normals[k+2]-before.normals[k+2])*travel,length=Math.hypot(x,y,z)||1;
       normal.array[k]=x/length;normal.array[k+1]=y/length;normal.array[k+2]=z/length;
      }
      normal.needsUpdate=true;
     }
     mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
    }
    let maxAlpha=0;
    child.materials.forEach((material,i)=>{
     // Most narrow parts belong wholly to one section half. Chapter 6 has
     // reunited both halves, so a complete piece can use either side's
     // profile; requiring only the positive Map would flatten half the keys.
     const profile=pose.materialOpacity?.get(before.mesh.uuid)??poses[layer].negative.materialOpacity?.get(before.mesh.uuid);
     const opening=before.pose.visible&&before.materials[i].opacity>.001?(profile?.[i]??pose.opacity):0;
     const final=after.pose.visible?after.materials[i].opacity:0,alpha=(opening+(final-opening)*travel)*handover;
     maxAlpha=Math.max(maxAlpha,alpha);setOpacity(material,alpha,progress===1?after.materials[i]:null);
    });
    mesh.visible=maxAlpha>.00001;mesh.castShadow=child.castShadow&&maxAlpha>.8;
   }
   // Long covers rotate from vertical teaching layers into a horizontal
   // photo layout. Keep that sweep above the same floor as the old assembly.
   if(travel>0&&travel<1){
    group.updateMatrixWorld(true);let low=Infinity;
    for(const {mesh}of children){
     if(!mesh.visible)continue;if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
     clearanceBox.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);low=Math.min(low,clearanceBox.min.y);
    }
    // The scene's shadow receiver is at y=-.004. Using that same height
    // avoids an 8 mm pop when a source foot already rests on the receiver.
    if(low<-.004){group.position.y+=-.004-low;group.updateMatrixWorld(true);}
   }
  }
  lastMorph=travel;displayRoot.updateMatrixWorld(true);
 }
 function dispose(){
  displayRoot.removeFromParent();for(const item of items)for(const child of item.children){child.mesh.geometry.dispose();for(const material of child.materials)material.dispose();}
 }
 return{apply,dispose,root:displayRoot,stats};
}
