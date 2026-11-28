const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
const materials=mesh=>Array.isArray(mesh.material)?mesh.material:[mesh.material];

/** Preserve readable solid details while large surfaces become context.
 * Construct with api.THREE after splitting, before changing material opacity.
 * apply(time, poses) runs after the main layer alpha and before flat.apply.
 * The original PBR color, textures, roughness and metalness stay untouched.
 *
 * For the 6 -> 7 handover, apply adds materialOpacity Maps to both pose sides.
 * They map ORIGINAL mesh UUIDs (sectionSource) to per-material alpha arrays.
 * Flat's section fade and full-piece opening fade must consume those Maps;
 * falling back to pose.opacity would briefly flatten details at chapter 6.
 * Everything is recomputed from time/poses, including backward slider jumps.
 */
export function createTeachingMaterials(T,groups){
 const items=[],sources=new Map(),edges=[];
 const stats={meshes:0,slenderMeshes:0,detailMeshes:0,broadSurfaces:0,edgeObjects:0,edgeSegments:0,edgeBuildMS:0};
 for(const [layer,pair]of groups)for(const side of ['negative','positive'])for(const mesh of pair[side].children){
  if(!mesh.isMesh)continue;
  const original=mesh.userData.sectionSource||mesh.uuid,key=layer+':'+original;
  if(!sources.has(key))sources.set(key,{bounds:new T.Box3(),meshes:[]});
  if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
  const source=sources.get(key);source.bounds.union(mesh.geometry.boundingBox);source.meshes.push(mesh);
  items.push({layer,side,mesh,source,original,materials:materials(mesh)});stats.meshes++;
 }
 const geometricDetails=/wire|shank|capstan|socket|underlever|key-lever|key-riser|key-cap|front-lip|tapered-black-key|hammer|wippen|flange|spring|pedal|rod|brace|hinge|pin|screw/i;
 const retainedCover=new Set(['CFX-M01','CFX-M02','X-AUTO-1030']);
 const retainedFeet=new Set(['CFX-M04','CFX-M05','CFX-M06','B-AUTO-0083','B-AUTO-0071','B-AUTO-0067']);
 for(const item of items){
  const dimensions=item.source.bounds.getSize(new T.Vector3()).toArray().sort((a,b)=>a-b),largest=dimensions[2],middle=dimensions[1];
  item.slender=largest>.025&&middle<.075&&largest/Math.max(middle,.00001)>3.4;
  item.compact=largest<.09;
  item.broad=middle>.22&&largest>.40;
  item.retainedCover=retainedCover.has(item.mesh.userData.soundPathSource);
  item.retainedFoot=retainedFeet.has(item.mesh.userData.soundPathSource);
  item.detail=geometricDetails.test(item.mesh.userData.detailName||'')||['keyboard','action','damper','strings','pedals'].includes(item.layer)&&!item.broad;
  if(item.slender)stats.slenderMeshes++;if(item.detail)stats.detailMeshes++;if(item.broad)stats.broadSurfaces++;
 }
 // Derive a small number of real crease/boundary edges. The line geometry is
 // a child of its source mesh, so source transforms/visibility remain exact.
 // No extra wireframe is generated for the dense action or photographed pins.
 const started=performance.now(),budget={case:8,support:8,lids:8},candidates=items.filter(item=>
  Object.hasOwn(budget,item.layer)&&item.broad&&!item.mesh.userData.sectionCap&&item.mesh.geometry.attributes.position.count<60000
 ).sort((a,b)=>b.source.bounds.getSize(new T.Vector3()).lengthSq()-a.source.bounds.getSize(new T.Vector3()).lengthSq());
 for(const item of candidates){
  if(!budget[item.layer])continue;
  const geometry=new T.EdgesGeometry(item.mesh.geometry,34),segments=geometry.attributes.position.count/2;
  if(!segments||segments>3200){geometry.dispose();continue;}
  const color=new T.Color(0x34383c),material=new T.LineBasicMaterial({color,transparent:true,opacity:0,depthTest:true,depthWrite:false,toneMapped:true});
  const line=new T.LineSegments(geometry,material);line.name='teaching-structural-edges';line.visible=false;
  line.userData.soundPathStructuralEdge=true;line.renderOrder=item.mesh.renderOrder+1;line.frustumCulled=item.mesh.frustumCulled;
  item.mesh.add(line);edges.push({...item,line,edgeMaterial:material});budget[item.layer]--;stats.edgeObjects++;stats.edgeSegments+=segments;
 }
 stats.edgeBuildMS=performance.now()-started;
 function alphaFor(item,base,time){
  // Explicitly removed layers remain removed. This module cannot make the
  // supporting stick or lid visible if choreography has hidden their layer.
  if(base<=.006||base>=.999||item.mesh.userData.sectionCap||item.layer==='unknown')return base;
  const emphasis=smooth((Math.min(time,6)-1.35)/.65);
  if(!emphasis)return base;
  // Wide plates/rims retain their low-coverage role. Keys, rods and strings
  // preserve enough body color and specular response to remain legible.
  let anchor=base;
  // A diagonal string bundle spans a wide axis-aligned box even though its
  // individual surfaces are round filaments. Its semantic role takes priority
  // over the broad-box heuristic used for wooden or iron plates.
  // Keep the supported lid as a real object. Its black surfaces cannot read
  // as lacquer if the entire piece blends with the bright background.
  // These exact sources are the main lid, front leaf and active long prop;
  // unrelated lid-layer accessories retain their normal contextual alpha.
  if(item.retainedCover)anchor=1;
  else if(item.retainedFoot)anchor=.88;
  else if(item.layer==='strings')anchor=.96;
  else if(!item.broad){
   if(item.slender)anchor=.96;
   else if(item.detail)anchor=.90;
   else if(item.compact)anchor=.76;
  }
  const presence=smooth(base/.12),desired=Math.max(base,anchor*presence);
  return base+(desired-base)*emphasis;
 }
 function setAlpha(material,alpha){
  const transparent=alpha<.998;
  if(material.transparent!==transparent){material.transparent=transparent;material.needsUpdate=true;}
  // Near-solid rods should occlude their own back surfaces. Broad ghost
  // boards remain below this threshold and cannot obscure the mechanism.
  material.opacity=alpha;material.depthWrite=alpha>=.94;material.depthTest=true;
 }
 function apply(time,poses){
  for(const [layer,pair]of groups)for(const side of ['negative','positive'])poses[layer][side].materialOpacity=new Map();
  for(const item of items){
   const pose=poses[item.layer][item.side],alpha=alphaFor(item,pose.opacity,time);
   for(const material of item.materials)setAlpha(material,alpha);
   item.mesh.castShadow=alpha>.8&&!!item.mesh.userData.soundPathCastShadow;
   // Caps are separate drawables and may have a single dedicated material;
   // store original-surface arrays only for the complete-piece handover.
   if(!item.mesh.userData.sectionCap)pose.materialOpacity.set(item.original,item.materials.map(()=>alpha));
  }
  const intro=smooth((Math.min(time,6)-1.35)/.65),flatFade=1-smooth((time-6)/.12);
  for(const item of edges){
   const base=alphaFor(item,poses[item.layer][item.side].opacity,time),ghost=smooth((.85-base)/.60)*smooth(base/.08);
   const alpha=.26*intro*ghost*flatFade;item.edgeMaterial.opacity=alpha;item.line.visible=alpha>.008;
  }
  return poses;
 }
 function dispose(){for(const {line,edgeMaterial}of edges){line.removeFromParent();line.geometry.dispose();edgeMaterial.dispose();}}
 return{apply,dispose,stats};
}
