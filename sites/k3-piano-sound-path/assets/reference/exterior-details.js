import * as T from 'three';
import {installBodyDetails} from './body-details.js';
import {installActionDetails} from './action-details.js';
import {installAccessoryDetails} from './accessory-details.js';
import {installResonanceDetails} from './resonance-details.js';

const clamp=T.MathUtils.clamp;
const smooth=(a,b,x)=>{const f=clamp((x-a)/(b-a),0,1);return f*f*(3-2*f);};

/** Assembly detail surfaces belong to existing selectable photo units.
 * Author geometry in assembled world space. The inverse assembly pose bakes
 * it into its host's local coordinates; the host keeps its existing staged
 * transform. Only the late photographic-layout transition restores the
 * exact original source silhouette. No extra item or replacement piano.
 */
export function createExteriorDetails({records,meshes,scene}){
 const byId=new Map(records.map(r=>[r.d.id,r])),managed=[];
 function add(id,definitions,replace){
  const r=byId.get(id);if(!r)throw new Error('Unknown detail host: '+id);
  const originals=r.g.children.filter(m=>m.isMesh&&!m.userData.exteriorDetail);
  if(replace)for(const mesh of originals){
   if(!mesh.userData.exteriorOriginal){mesh.material=mesh.material.clone();mesh.userData.privateMaterial=true;mesh.userData.exteriorOriginal=true;}
   if(mesh.userData.assemblySupplement)mesh.userData.exteriorRetired=true;
  }
  const inverse=new T.Matrix4().compose(r.p0,r.q0,r.s0).invert(),created=[];
  for(const def of definitions){
   if(!def.geometry||!def.material)throw new Error('Invalid detail surface for '+id);
   const pos=def.position instanceof T.Vector3?def.position:new T.Vector3(...(def.position||[0,0,0]));
   const rotation=def.rotation||[0,0,0];
   const q=def.quaternion instanceof T.Quaternion?def.quaternion:new T.Quaternion().setFromEuler(new T.Euler(...rotation));
   const scale=new T.Vector3(...(def.scale||[1,1,1]));
   const matrix=new T.Matrix4().compose(pos,q,scale);
   const geometry=def.geometry.clone().applyMatrix4(matrix).applyMatrix4(inverse);
   geometry.computeBoundingBox();geometry.computeBoundingSphere();
   const mat=def.material.clone(),mesh=new T.Mesh(geometry,mat);
   mesh.castShadow=def.castShadow!==false;mesh.receiveShadow=def.receiveShadow!==false;
   mesh.userData={...r.d,unit:r.g,pieceData:{...r.d,material:def.materialKind||r.d.material},
    exteriorDetail:true,exteriorBaseMaterial:mat.clone(),privateMaterial:true,assemblyOpacity:1,detailName:def.name||id};
   r.g.add(mesh);meshes.push(mesh);created.push(mesh);
  }
  managed.push({r,originals:replace?originals:[],details:created,replace});
  return created;
 }
 const ctx={T,records,meshes,scene,byId,replaceUnit:(id,defs)=>add(id,defs,true),addDetail:(id,defs)=>add(id,defs,false)};
 const diagnostics={body:installBodyDetails(ctx),action:installActionDetails(ctx),accessories:installAccessoryDetails(ctx),resonance:installResonanceDetails(ctx)};
 function opacity(mesh,value){
  mesh.visible=value>.001;mesh.userData.assemblyOpacity=value;
  mesh.material.opacity=value;mesh.material.transparent=value<.999;
  // Opaque endpoints retain normal depth writes. During handover, both
  // versions are coplanar in places, so blend without depth contention.
  mesh.material.depthWrite=value>.999;
 }
 function update(progress){
  for(const entry of managed){
   const b=smooth(.47+entry.r.stage*.07,.90+entry.r.stage*.09,progress);
   const handover=smooth(.08,.84,b);
   for(const mesh of entry.originals)opacity(mesh,mesh.userData.exteriorRetired?0:handover);
   for(const mesh of entry.details)opacity(mesh,1-handover);
  }
 }
 return {update,managed,byId,diagnostics};
}
