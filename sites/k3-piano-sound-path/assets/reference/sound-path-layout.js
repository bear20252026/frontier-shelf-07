const HALF_PI=Math.PI/2;
const EPSILON=1e-9;
const numeric=(a,b)=>a.localeCompare(b,undefined,{numeric:true});
const rotate=(x,z,quarterTurns)=>{
 const turn=((quarterTurns%4)+4)%4;
 return turn===0?[x,z]:turn===1?[z,-x]:turn===2?[-x,-z]:[-z,x];
};

// Parts are measured at their original flat endpoint. Packing works only on
// the XZ footprints; it cannot change geometry, thickness, materials or Y.
export function createSoundPathLayout(units,{targetAspect=16/9,gap=.045}={}){
 const byId=new Map(units.map(unit=>[unit.id,unit]));
 if(byId.size!==units.length)throw Error('The flat inventory contains duplicate source IDs.');
 const blocks=[],buckets=new Map();
 const makeUnit=unit=>({id:unit.id,x:0,z:0,turn:0,width:unit.width,depth:unit.depth});
 const separate=unit=>unit.width*unit.depth>.1||Math.max(unit.width,unit.depth)>1.2;
 const bucketFor=unit=>{
  if(unit.id.startsWith('KEY-WOOD-'))return 'keyboard:levers';
  if(unit.id.startsWith('KEY-WHITE-'))return 'keyboard:white-caps';
  if(unit.id.startsWith('KEY-BLACK-'))return 'keyboard:black-caps';
  if(/^D[123]-DAMPER-/.test(unit.id))return 'damper:'+unit.id.slice(0,2);
  if(/^F[123]-/.test(unit.id))return 'unknown:'+unit.id.slice(0,2);
  if(unit.id.startsWith('BANK-'))return 'action:banks';
  if(unit.id.startsWith('BRASS-BRACKET-'))return 'action:brackets';
  if(unit.id.startsWith('WIRE-LOOP-'))return 'strings:loops';
  // Unresolved source regions stay identifiable as source-region clusters.
  // Their prefix is used for ordering, never as an invented mechanical role.
  return unit.layer==='unknown'?'unknown:'+unit.id.split('-')[0]:unit.layer+':accessories';
 };
 for(const unit of units){
  if(!Number.isFinite(unit.width)||!Number.isFinite(unit.depth)||unit.width<=0||unit.depth<=0)throw Error('Invalid flat footprint: '+unit.id);
  if(separate(unit))blocks.push({id:unit.id,width:unit.width,depth:unit.depth,parts:[makeUnit(unit)],layer:unit.layer});
  else{const key=bucketFor(unit);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(unit);}
 }
 const columnsFor=key=>key==='keyboard:levers'?4:key==='keyboard:white-caps'?8:key==='keyboard:black-caps'?9:key.startsWith('damper:')?6:key.startsWith('unknown:F')?27:key==='action:banks'?5:key==='action:brackets'?3:key==='strings:loops'?4:0;
 for(const [key,members]of buckets){
  members.sort((a,b)=>numeric(a.id,b.id));
  const parts=members.map(makeUnit),columns=columnsFor(key),small=key.startsWith('unknown:F'),partGap=small?.009:.016;
  let width=0,depth=0;
  if(columns){
   const columnWidths=Array.from({length:Math.min(columns,parts.length)},(_,column)=>Math.max(...parts.filter((_,i)=>i%columns===column).map(part=>part.width)));
   for(let start=0;start<parts.length;start+=columns){
    const row=parts.slice(start,start+columns),height=Math.max(...row.map(part=>part.depth));let x=0;
    row.forEach((part,i)=>{part.x=x+columnWidths[i]/2;part.z=depth+height/2;x+=columnWidths[i]+partGap;});
    width=Math.max(width,x-partGap);depth+=height+partGap;
   }
   depth-=partGap;
  }else{
   // A shelf keeps miscellaneous shapes in straight rows. Long fragments
   // receive a rigid quarter turn so they lie along the same row direction.
   for(const part of parts)if(part.depth>part.width*1.8){[part.width,part.depth]=[part.depth,part.width];part.turn=1;}
   parts.sort((a,b)=>b.depth-a.depth||numeric(a.id,b.id));
   const area=parts.reduce((sum,part)=>sum+(part.width+partGap)*(part.depth+partGap),0);
   const shelfWidth=Math.max(...parts.map(part=>part.width),Math.sqrt(area*2.2));
   let x=0,rowHeight=0;
   for(const part of parts){
    if(x>0&&x+part.width>shelfWidth+EPSILON){depth+=rowHeight+partGap;x=0;rowHeight=0;}
    part.x=x+part.width/2;part.z=depth+part.depth/2;x+=part.width+partGap;rowHeight=Math.max(rowHeight,part.depth);width=Math.max(width,x-partGap);
   }
   depth+=rowHeight;
  }
  for(const part of parts){part.x-=width/2;part.z-=depth/2;}
  blocks.push({id:key,width,depth,parts,layer:members[0].layer});
 }

 function pack(width,depth,order){
  let free=[{x:0,z:0,width,depth}];const placed=[];
  const sorted=blocks.slice().sort((a,b)=>{
   const area=block=>(block.width+gap)*(block.depth+gap),long=block=>Math.max(block.width,block.depth);
   return order===0?area(b)-area(a)||numeric(a.id,b.id):order===1?long(b)-long(a)||area(b)-area(a):b.width+b.depth-a.width-a.depth||area(b)-area(a);
  });
  for(const block of sorted){
   let best=null;
   for(const rect of free)for(let turn=0;turn<2;turn++){
    const w=(turn?block.depth:block.width)+gap,d=(turn?block.width:block.depth)+gap;
    if(w>rect.width+EPSILON||d>rect.depth+EPSILON)continue;
    const short=Math.min(rect.width-w,rect.depth-d),long=Math.max(rect.width-w,rect.depth-d);
    const score=short*1000+long+(turn?.00001:0);
    if(!best||score<best.score)best={block,x:rect.x,z:rect.z,width:w,depth:d,turn,score};
   }
   if(!best)return null;
   placed.push(best);const next=[];
   for(const rect of free){
    const right=rect.x+rect.width,bottom=rect.z+rect.depth,bestRight=best.x+best.width,bestBottom=best.z+best.depth;
    if(best.x>=right-EPSILON||bestRight<=rect.x+EPSILON||best.z>=bottom-EPSILON||bestBottom<=rect.z+EPSILON){next.push(rect);continue;}
    if(best.x>rect.x+EPSILON)next.push({x:rect.x,z:rect.z,width:best.x-rect.x,depth:rect.depth});
    if(bestRight<right-EPSILON)next.push({x:bestRight,z:rect.z,width:right-bestRight,depth:rect.depth});
    if(best.z>rect.z+EPSILON)next.push({x:rect.x,z:rect.z,width:rect.width,depth:best.z-rect.z});
    if(bestBottom<bottom-EPSILON)next.push({x:rect.x,z:bestBottom,width:rect.width,depth:bottom-bestBottom});
   }
   free=next.filter((rect,i)=>!next.some((other,j)=>i!==j&&other.x<=rect.x+EPSILON&&other.z<=rect.z+EPSILON&&other.x+other.width>=rect.x+rect.width-EPSILON&&other.z+other.depth>=rect.z+rect.depth-EPSILON&&(j<i||other.width>rect.width+EPSILON||other.depth>rect.depth+EPSILON)));
  }
  return placed;
 }

 const blockArea=blocks.reduce((sum,block)=>sum+(block.width+gap)*(block.depth+gap),0);
 let winner=null;
 for(let order=0;order<3;order++){
  let low=Math.sqrt(blockArea/targetAspect),high=low*1.8,best=null;
  for(let pass=0;pass<18;pass++){
   const depth=(low+high)/2,width=depth*targetAspect,placed=pack(width,depth,order);
   if(placed){high=depth;best=placed;}else low=depth;
  }
  if(!best)continue;
  const width=Math.max(...best.map(part=>part.x+part.width))-gap,depth=Math.max(...best.map(part=>part.z+part.depth))-gap;
  const score=width*depth*(1+Math.abs(Math.log(width/depth/targetAspect))*.3);
  if(!winner||score<winner.score)winner={placed:best,width,depth,score};
 }
 if(!winner)throw Error('The piano inventory could not be packed into the landscape panel.');
 const placements=new Map(),clusters=[];
 for(const packed of winner.placed){
  const {block,turn}=packed,centerX=packed.x+(packed.width-gap)/2-winner.width/2,centerZ=packed.z+(packed.depth-gap)/2-winner.depth/2;
  for(const part of block.parts){
   const [x,z]=rotate(part.x,part.z,turn),quarterTurns=(part.turn+turn)%4;
   placements.set(part.id,{x:x+centerX,z:z+centerZ,rotation:quarterTurns*HALF_PI,quarterTurns,cluster:block.id});
  }
  clusters.push({id:block.id,layer:block.layer,units:block.parts.length,center:[centerX,centerZ],width:packed.width-gap,depth:packed.depth-gap,rotation:turn*HALF_PI});
 }
 // Verify the actual unit rectangles, not only their enclosing tray boxes.
 const footprints=units.map(unit=>{const pose=placements.get(unit.id),odd=pose.quarterTurns%2;return{id:unit.id,x:pose.x,z:pose.z,width:odd?unit.depth:unit.width,depth:odd?unit.width:unit.depth};});
 let overlapPairs=0,maxOverlapArea=0;
 for(let i=0;i<footprints.length;i++)for(let j=i+1;j<footprints.length;j++){
  const a=footprints[i],b=footprints[j],x=(a.width+b.width)/2-Math.abs(a.x-b.x),z=(a.depth+b.depth)/2-Math.abs(a.z-b.z);
  if(x>EPSILON&&z>EPSILON){overlapPairs++;maxOverlapArea=Math.max(maxOverlapArea,x*z);}
 }
 if(overlapPairs)throw Error('The landscape inventory contains overlapping footprints.');
 const sourceArea=units.reduce((sum,unit)=>sum+unit.width*unit.depth,0);
 return{placements,stats:{version:1,mode:'landscape-knolling',targetAspect,aspect:winner.width/winner.depth,
  units:units.length,clusters:clusters.length,rotatedUnits:[...placements.values()].filter(pose=>pose.quarterTurns).length,
  bounds:{min:[-winner.width/2,0,-winner.depth/2],max:[winner.width/2,0,winner.depth/2],width:winner.width,depth:winner.depth},
  gap,sourceFootprintArea:sourceArea,occupiedRatio:sourceArea/(winner.width*winner.depth),overlapPairs,maxOverlapArea,
  transforms:'rigid XZ translation and Y rotation; original geometry, scale and height preserved',clusterLayout:clusters}};
}
