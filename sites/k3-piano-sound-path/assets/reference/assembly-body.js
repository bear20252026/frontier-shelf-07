// Photograph-inferred assembly poses for the retained shallow photo solids.
// Returned negative planar scale is intentional orientation metadata. During
// animation, factor it into a PI rotation + local-Y reversal, rather than lerp
// a signed scale through zero. No factory mating-fit claim is made here.
export function createBodyPoses(T,units){
 const map=new Map(),byId=new Map(units.map(g=>[g.userData?.id||g.id,g]));
 const d=id=>{const g=byId.get(id);return g?.userData?.box?g.userData:g;};
 const center=id=>{const b=d(id)?.box;return b?[b[0]+b[2]/2,b[1]+b[3]/2]:null;};
 const extent=id=>{const b=d(id)?.box;return b?[b[2]*.002,b[3]*.002]:null;};
 const put=(id,position,rotation,scale,stage)=>{if(byId.has(id))map.set(id,{position,rotation,scale,stage});};
 const rotation=(yaw,pitch)=>new T.Euler().setFromQuaternion(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),pitch)),'XYZ').toArray().slice(0,3);
 const fit=(id,x0,x1,z0,z1,y,stage,mirrorX=false,mirrorZ=false)=>{
  const e=extent(id);if(!e)return;
  put(id,[(x0+x1)/2,y,(z0+z1)/2],[0,0,0],[(x1-x0)/e[0]*(mirrorX?-1:1),1,(z1-z0)/e[1]*(mirrorZ?-1:1)],stage);
 };

 // Main lid has its wide/front edge at photo-left and straight spine at the
 // bottom of the photo. Place that spine at world +Z, and open about world X.
 const lid=extent('CFX-M01'),lidAngle=34*Math.PI/180,lidX=[-1.38,1.46],lidZ=[-.94,.94],hingeY=1.47;
 if(lid){const hz=(lidZ[1]-lidZ[0])/2;
  // The assembled replacement keeps this full rim registration and clips its
  // front at X=-1.035. Never shrink the entire main lid away from the rim.
  put('CFX-M01',[(lidX[0]+lidX[1])/2,hingeY+Math.sin(lidAngle)*hz,lidZ[1]-Math.cos(lidAngle)*hz],[lidAngle,0,0],[(lidX[1]-lidX[0])/lid[0],1,(lidZ[1]-lidZ[0])/lid[1]],.05);
 }
 // The front leaf is folded back onto the open main lid. A horizontal front
 // leaf cannot meet a lid tilted around the perpendicular X-axis.
 const front=extent('CFX-M02');if(front){const top=.043,hz=.94;
  put('CFX-M02',[-.855,hingeY+Math.sin(lidAngle)*hz+Math.cos(lidAngle)*top,.94-Math.cos(lidAngle)*hz+Math.sin(lidAngle)*top],[lidAngle,0,0],[.356/front[0],1,1.86/front[1]],.09);
 }

 // Plate photo: wide at left, straight spine above => mirror photograph Z.
 fit('CFX-R01',-1.25,1.38,-.79,.85,1.29,.48,false,true);
 // Soundboard photo: wide at RIGHT, straight spine below => mirror X only.
 // A different mirror than the plate is necessary; see cross-section audit.
 fit('CFX-M03',-1.27,1.38,-.84,.86,1.15,.63,true,false);
 const board=map.get('CFX-M03'),bc=center('CFX-M03');
 if(board&&bc)for(const id of ['CFX-R02','CFX-R03']){
  const c=center(id);if(!c)continue;
  put(id,[board.position[0]+(c[0]-bc[0])*.002*board.scale[0],board.position[1],board.position[2]+(c[1]-bc[1])*.002*board.scale[2]],[0,0,0],[...board.scale],.60);
 }

 // Keyframe is already oriented with its note direction on photo/world Z.
 fit('CFX-KEYFRAME',-1.72,-1.04,-.86,.86,1.035,.28);
 // Fold the key cover upright behind the keys; its local X becomes height.
 const cover=extent('CFX-M11');if(cover)put('CFX-M11',[-1.358,1.285,0],[0,0,Math.PI/2],[.316/cover[0],1,1.77/cover[1]],.18);

 // The music desk faces the player at -X, leaning back 14 degrees.
 const desk=extent('CFX-M08'),deskRot=rotation(-Math.PI/2,Math.PI/2-.245);
 if(desk)put('CFX-M08',[-1.183,1.648,0],deskRot,[1.12/desk[0],1,.39/desk[1]],.12);
 fit('CFX-M09',-1.315,-1.055,-.89,-.61,1.435,.14);
 fit('CFX-M10',-1.315,-1.055,.61,.89,1.435,.14);
 const rail=extent('CFX-M12');if(rail)put('CFX-M12',[-1.235,1.447,0],[0,-Math.PI/2,0],[1.27/rail[0],1,1],.15);

 // Side silhouettes stand vertically; photograph-down maps to world-down.
 // Feet remain at Y=.20. Front leg mounts meet the keybed underside; the
 // rear mount meets the lower case bearer, not the soundboard itself.
 const upright=rotation(-Math.PI/2,Math.PI/2);
 for(const [id,x,z] of [['CFX-M04',-1.20,-.78],['CFX-M05',-1.20,.78],['CFX-M06',1.05,.38]]){
  const e=extent(id),top=id==='CFX-M06'?1.12:1.005,height=top-.20;
  if(e)put(id,[x,(top+.20)/2,z],[...upright],[.30/e[0],1.2,height/e[1]],.88);
 }
 const lyre=extent('CFX-M13');if(lyre)put('CFX-M13',[-.95,.58,0],[...upright],[.43/lyre[0],1,.90/lyre[1]],.85);

 // The long photographed rim needs bending, not a rigid pose masquerading as
 // a curved case. Root bends this same unit along rimGuide, with identity pose.
 put('CFX-M07',[0,0,0],[0,0,0],[1,1,1],.77);
 if(d('CFX-M01')&&lid){const c=center('CFX-M01'),sx=(lidX[1]-lidX[0])/lid[0],sz=(lidZ[1]-lidZ[0])/lid[1];
  map.rimGuide=d('CFX-M01').polygon.map(([x,y])=>[(lidX[0]+lidX[1])/2+(x-c[0])*.002*sx,1.29,(lidZ[0]+lidZ[1])/2+(y-c[1])*.002*sz]);
 }
 map.rimDeformationRequired=true;
 map.rimBottom=1.12;map.rimTop=1.45;
 map.spine={axis:'X',z:.94,lidHingeY:hingeY};
 map.detailDatum={lidFrontX:-1.035,lidAngle,keybedTop:1.035,keybedBottom:.98,keyTailX:-1.395,fallboardLipX:-1.383,legBottom:.20,frontLegTop:1.005,rearLegTop:1.12};
 map.provenance='Photo-inferred assembly; hidden thicknesses and mating fits are schematic.';
 return map;
}
