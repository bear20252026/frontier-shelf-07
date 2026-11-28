// Fit the product into a reserved stage. Text and transport never share
// its projected bounds, even while scrubbing between chapters.
export const NARRATIVE_SIDES=['left','left','right','right','left','right','left','left'];
export function soundPathStage(width,height,time=0){
 const mobile=width<760,flat=Math.max(0,Math.min(1,(time-6)/.8));
 const blend=flat*flat*(3-2*flat);
 const chapter=Math.min(6,Math.floor(time)),u=Math.max(0,Math.min(1,time-chapter)),ease=u*u*u*(u*(u*6-15)+10);
 const a=NARRATIVE_SIDES[chapter]==='right'?1:0,b=NARRATIVE_SIDES[chapter+1]==='right'?1:0,side=a+(b-a)*ease;
 const reserve=314,narrativeSide=NARRATIVE_SIDES[Math.max(0,Math.min(7,Math.round(time)))];
 const left=mobile?24:((reserve+(26-reserve)*side)*(1-blend)+26*blend);
 const top=mobile?220*(1-blend)+64*blend:64;
 const right=mobile?24:((26+(reserve-26)*side)*(1-blend)+26*blend),bottom=mobile?170:108;
 return{x:left,y:top,width:Math.max(80,width-left-right),height:Math.max(100,height-top-bottom),narrativeSide};
}
// Exact silhouette support queries, accelerated by a spatial tree. Projecting
// eight corners of a large part's box reserves space for corners that are not
// on the instrument. The tree uses the real vertices and safely prunes boxes
// whose furthest possible point cannot improve the current silhouette edge.
function silhouetteTree(points){
 const build=pts=>{
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const p of pts)for(let a=0;a<3;a++){lo[a]=Math.min(lo[a],p[a]);hi[a]=Math.max(hi[a],p[a]);}
  if(pts.length<=32)return{lo,hi,points:pts};
  let axis=0;for(let a=1;a<3;a++)if(hi[a]-lo[a]>hi[axis]-lo[axis])axis=a;
  pts.sort((a,b)=>a[axis]-b[axis]);const middle=pts.length>>1;
  return{lo,hi,children:[build(pts.slice(0,middle)),build(pts.slice(middle))]};
 };
 const root=build(points);
 return direction=>{
  let best=-Infinity;
  const bound=n=>direction.reduce((s,d,a)=>s+d*(d>=0?n.hi[a]:n.lo[a]),0);
  const visit=n=>{
   if(bound(n)<=best)return;
   if(n.points){for(const p of n.points)best=Math.max(best,p[0]*direction[0]+p[1]*direction[1]+p[2]*direction[2]);return;}
   const [a,b]=n.children;const first=bound(a)>=bound(b);visit(first?a:b);visit(first?b:a);
  };
  visit(root);return best;
 };
}
export function createTeachingCamera(T,api,groups,flat){
 const v=new T.Vector3(),viewBounds=new T.Box3(),section=[],silhouettes=[],projectedMatrix=new T.Matrix4();
 const include=(bounds,matrix)=>{
  for(const x of[bounds.min.x,bounds.max.x])for(const y of[bounds.min.y,bounds.max.y])for(const z of[bounds.min.z,bounds.max.z]){
   v.set(x,y,z).applyMatrix4(matrix).applyMatrix4(api.camera.matrixWorldInverse);viewBounds.expandByPoint(v);
  }
 };
 for(const[layer,pair]of groups)for(const side of['negative','positive']){
  if(layer==='unknown')continue;
  const unique=new Map();
  for(const m of pair[side].children)if(m.isMesh&&!m.userData.sectionCap){
   if(!m.geometry.boundingBox)m.geometry.computeBoundingBox();section.push({mesh:m,group:pair[side],bounds:m.geometry.boundingBox});
   const attr=m.geometry.attributes.position;
   for(let i=0;i<attr.count;i++){
    const p=[attr.getX(i),attr.getY(i),attr.getZ(i)];unique.set(p.join(','),p);
   }
  }
  if(unique.size)silhouettes.push({group:pair[side],support:silhouetteTree([...unique.values()])});
 }
 function sectionBounds(){
  for(const {group,support}of silhouettes){
   group.updateMatrixWorld(true);projectedMatrix.multiplyMatrices(api.camera.matrixWorldInverse,group.matrixWorld);
   const m=projectedMatrix.elements,x=[m[0],m[4],m[8]],y=[m[1],m[5],m[9]];
   const xMax=support(x)+m[12],xMin=-support(x.map(v=>-v))+m[12];
   const yMax=support(y)+m[13],yMin=-support(y.map(v=>-v))+m[13];
   viewBounds.expandByPoint(v.set(xMin,yMin,-1));viewBounds.expandByPoint(v.set(xMax,yMax,-1));
  }
 }
 function apply(time,view,width,height){
  const cam=api.camera,stage=soundPathStage(width,height,time);
  cam.position.set(...view.eye);cam.up.set(0,1,0);cam.lookAt(...view.target);cam.updateMatrixWorld(true);
  viewBounds.makeEmpty();
  for(const item of section)item.group.updateMatrixWorld(true);
  if(time<=6){sectionBounds();}
  else{
   flat.root.updateMatrixWorld(true);
   for(const group of flat.root.children)for(const mesh of group.children){
    if(!mesh.isMesh)continue;
    const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    if(!mesh.visible||Math.max(...mats.map(m=>m.opacity))<.004)continue;
    if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();include(mesh.geometry.boundingBox,mesh.matrixWorld);
   }
   // New complete meshes fade in from zero during the handover. Blend their
   // framing with the still-present section so an empty fade never resets
   // the camera to a fallback box or causes a visible zoom jump.
   if(time<6.3){
    const flatBounds=viewBounds.clone();viewBounds.makeEmpty();
    sectionBounds();
    if(!flatBounds.isEmpty()){
     let u=Math.max(0,Math.min(1,(time-6.06)/.24));u=u*u*(3-2*u);
     viewBounds.min.lerp(flatBounds.min,u);viewBounds.max.lerp(flatBounds.max,u);
    }
   }
  }
  if(viewBounds.isEmpty())viewBounds.set(new T.Vector3(-2,-2,-2),new T.Vector3(2,2,2));
  const span=viewBounds.getSize(v),scale=Math.min(stage.width/(Math.max(span.x,.01)*1.018),stage.height/(Math.max(span.y,.01)*1.018));
  const cx=(viewBounds.min.x+viewBounds.max.x)/2,cy=(viewBounds.min.y+viewBounds.max.y)/2;
  cam.left=cx-(stage.x+stage.width/2)/scale;cam.right=cam.left+width/scale;
  cam.top=cy+(stage.y+stage.height/2)/scale;cam.bottom=cam.top-height/scale;
  cam.zoom=1;cam.near=.01;cam.far=100;cam.updateProjectionMatrix();
  return stage;
 }
 return{apply};
}
