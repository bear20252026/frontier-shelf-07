import {createBodyPoses} from './assembly-body.js';
import {accessoryLayout} from './accessory-details.js';
/** Approximate assembly transforms for the photographed accessory units.
 * Keeps all source units; does not create meshes, change visibility or claim CAD fit.
 * Unit local geometry: photo horizontal = x, photo vertical = z, depth = +y.
 */
export function createAccessoryPoses(T, units, names) {
  const entries = Array.isArray(names) ? names : (names?.items || []);
  const lookup = names instanceof Map ? names : new Map(entries.map(d => [d.id, d]));
  const poses = new Map(), ordinal = new Map(), U = .002, PI = Math.PI;
  const bodyPoses=createBodyPoses(T,units),layout=accessoryLayout(T,units);
  const hostIds={board:'CFX-M03',mainLid:'CFX-M01',frontLid:'CFX-M02',music:'CFX-M08',musicBase:'CFX-M12',legLeft:'CFX-M04',legMid:'CFX-M05',legRear:'CFX-M06',lyre:'CFX-M13'};
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const stages = {case:.18,pedal:.28,keyboard:.45,action:.55,damper:.62,strings:.72,resonance:.8,hardware:.5};
  // Shared with body reconstruction: supports sit above the caster crown.
  const feet = layout.feet.map(([x,z])=>[x,.105,z]);
  const hosts = {
    board:{box:[2351,657,1238,844],position:[.10,1.145,0],rotation:[0,-PI/2,0],width:1.72,height:2.45},
    mainLid:{box:[2142,1500,1252,967],position:[.10,1.46,0],rotation:[0,-PI/2,0],width:1.83,height:2.60},
    frontLid:{box:[1770,1500,337,962],position:[-1.31,1.46,0],rotation:[0,-PI/2,0],width:.42,height:1.83},
    music:{box:[642,2624,540,151],position:[-1.00,1.48,0],rotation:[.95,PI/2,0],width:1.25,height:.32},
    musicBase:{box:[624,2928,581,51],position:[-1.17,1.40,0],rotation:[0,PI/2,0],width:1.40,height:.07},
    legLeft:{box:[1725,3068,286,314],position:[-1.20,.64,-.78],rotation:[PI/2,0,0],width:.24,height:.89},
    legMid:{box:[2178,3064,291,318],position:[-1.20,.64,.78],rotation:[PI/2,0,0],width:.24,height:.89},
    legRear:{box:[3034,3064,305,314],position:[1.05,.64,.38],rotation:[PI/2,0,0],width:.24,height:.89},
    lyre:{box:[778,3068,304,319],position:[-.95,.58,0],rotation:[PI/2,PI/2,0],width:.43,height:.90}
  };
  const put = (id, position, rotation, scale, system, attachment, extra={}) => poses.set(id, {
    position, rotation, scale, stage:stages[system] ?? .5,
    accuracy:'approx', attachment, ...extra
  });
  const sized = (d, position, rotation, width, height, system, attachment, depthScale=1) => {
    const b=d.box; put(d.id,position,rotation,[width/Math.max(b[2]*U,.001),depthScale,height/Math.max(b[3]*U,.001)],system,attachment);
  };
  const surface = (d,host,system,offsetY=0) => {
    const h=hosts[host],b=d.box,[x,y,w,hh]=h.box;
    const parent=bodyPoses.get(hostIds[host]);
    const sx=parent?.scale[0]??h.width/(w*U),sz=parent?.scale[2]??h.height/(hh*U);
    const rotation=parent?.rotation||h.rotation,position=parent?.position||h.position;
    const p=new T.Vector3((b[0]+b[2]/2-x-w/2)*U*sx,offsetY,(b[1]+b[3]/2-y-hh/2)*U*sz)
      .applyEuler(new T.Euler(...rotation,'XYZ')).add(new T.Vector3(...position));
    put(d.id,p.toArray(),rotation.slice(),[sx,.15,sz],system,'Attached surface · '+host,{host:hostIds[host],classification:'surface-fragment'});
  };
  const special = {
    'B-AUTO-0064': d=>sized(d,[-1.082,layout.lyreBottom+.04,-.078],[0,-PI/2,0],.066,.33,'pedal','Left pedal; rod end connects into the rear arm and frame mounts'),
    'B-AUTO-0059': d=>sized(d,[-1.082,layout.lyreBottom+.04,0],[0,-PI/2,0],.066,.33,'pedal','Middle pedal; passes through the red-felt slot in the bottom beam'),
    'B-AUTO-0058': d=>sized(d,[-1.082,layout.lyreBottom+.04,.078],[0,-PI/2,0],.066,.33,'pedal','Right pedal; rod end connects into the rear arm and frame mounts'),
    'B-AUTO-0083': d=>sized(d,feet[0],[PI/2,0,0],.15,.18,'pedal','Caster at the base of the front-left leg',2),
    'B-AUTO-0071': d=>sized(d,feet[1],[PI/2,0,0],.15,.18,'pedal','Caster at the base of the front-right leg',2),
    'B-AUTO-0067': d=>sized(d,feet[2],[PI/2,0,0],.15,.18,'pedal','Caster at the base of the rear leg',2),
    'X-AUTO-1030': d=>{
      const {lower,upper}=layout.prop,delta=upper.clone().sub(lower),q=new T.Quaternion().setFromUnitVectors(new T.Vector3(1,0,0),delta.clone().normalize());
      sized(d,lower.clone().add(upper).multiplyScalar(.5).toArray(),new T.Euler().setFromQuaternion(q).toArray().slice(0,3),delta.length(),.031,'case','Long lid prop; driven by the curved-rim base and the bearing point under the main lid');
    },
    'X-AUTO-0973': d=>{
      const {stowA,stowB}=layout.prop,delta=stowB.clone().sub(stowA),q=new T.Quaternion().setFromUnitVectors(new T.Vector3(1,0,0),delta.clone().normalize());
      sized(d,stowA.clone().add(stowB).multiplyScalar(.5).toArray(),new T.Euler().setFromQuaternion(q).toArray().slice(0,3),delta.length(),.019,'case','Short lid prop; folds flat along the curved rim, ends meeting the base and clamp');
    },
    'P-AUTO-4005': d=>sized(d,[-.90,1.306,0],[0,0,0],.018,1.66,'strings','Red strip surface along the front edge of the cast-iron plate'),
    'R-AUTO-1153': d=>sized(d,[-.98,1.27,0],[0,0,0],.018,1.66,'strings','Slim connecting strip along the front edge of the string field'),
    'K-AUTO-1057': d=>sized(d,[-1.24,1.09,0],[0,0,0],.025,1.54,'keyboard','Thin surface adjacent to the long key tails'),
    'K-AUTO-1222': d=>sized(d,[-1.17,1.064,0],[0,PI/2,0],.43,.018,'keyboard','Cross rail adjacent to the key frame'),
    'C-AUTO-1065': d=>sized(d,[-1.715,1.075,0],[0,0,0],.018,1.68,'case','Decorative trim along the keyboard front edge'),
    'C-AUTO-1137': d=>sized(d,[-1.703,1.088,0],[0,0,0],.035,1.68,'case','Strip surface along the keyboard front edge'),
    'C-AUTO-1147': d=>sized(d,[-1.193,1.30,0],[0,0,PI/2],.028,1.68,'case','Connecting strip behind the keyboard cover'),
    'C-AUTO-1149': d=>sized(d,[-1.193,1.414,-.41],[0,0,PI/2],.012,.70,'case','Slim edge piece near the keyboard cover'),
    'X-AUTO-0712': d=>sized(d,[-1.53,.98,0],[0,PI/2,0],.30,.055,'keyboard','Curved fitting at the front of the key frame'),
    'M-AUTO-0577': d=>sized(d,[-1.03,1.431,-.61],[0,0,0],.24,.027,'case','Left edge strip of the music desk'),
    'M-AUTO-0578': d=>sized(d,[-1.03,1.431,.61],[0,0,0],.24,.027,'case','Right edge strip of the music desk')
  };
  const rods=['B-AUTO-0207','B-AUTO-0202','B-AUTO-0201','B-AUTO-0200','B-AUTO-0199'];
  // Endpoints are shared with the curved pedals and the underside support beam.
  rods.forEach((id,i)=>special[id]=d=>{
    const a=i<3?new T.Vector3(-.924,layout.lyreBottom+.092,layout.pedalZ[i]):new T.Vector3(-.949,layout.lyreBottom+.13,(i===3?-1:1)*.113);
    const b=i<3?new T.Vector3(-.934,1.036,layout.pedalZ[i]):new T.Vector3(-.49,1.078,(i===3?-1:1)*.22);
    const delta=b.clone().sub(a),q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),delta.clone().normalize());
    sized(d,a.clone().add(b).multiplyScalar(.5).toArray(),new T.Euler().setFromQuaternion(q).toArray().slice(0,3),.010,delta.length(),'pedal',i<3?'Linkage rod from the pedal rear arm to the keybed bearer beam':'Diagonal brace behind the pedal lyre; mounting seats at both ends');
  });
  const attached = {
    'S-AUTO-1707':'board','S-AUTO-2540':'board','X-AUTO-0869':'mainLid',
    'C-AUTO-1017':'frontLid','C-AUTO-0888':'frontLid','C-AUTO-0821':'frontLid',
    'M-AUTO-0583':'music','M-AUTO-0365':'musicBase',
    'B-AUTO-0305':'legRear','B-AUTO-0329':'legMid','B-AUTO-0330':'legRear','B-AUTO-0304':'lyre'
  };
  for (const unit of units) {
    const raw=unit.userData?.id ? unit.userData : unit;
    if (!raw?.id || !/-AUTO-/.test(raw.id) || raw.id==='R-AUTO-2912' || /^F-/.test(raw.id)) continue;
    const name=lookup.get(raw.id),d={...raw,box:name?.sourceBox||raw.box},b=d.box;
    if (!b || b.length!==4) continue;
    const system=name?.system||({A:'action',B:'pedal',C:'case',K:'keyboard',P:'strings',S:'resonance',R:'hardware',M:'case'}[raw.region]||'hardware');
    if(special[d.id]){special[d.id](d);continue;}
    if(attached[d.id]){surface(d,attached[d.id],system,-.003);continue;}
    const n=ordinal.get(system)||0;ordinal.set(system,n+1);
    const cx=b[0]+b[2]/2,cy=b[1]+b[3]/2,sz=Math.max(b[2],b[3])*U;
    // Photo-colocated action rails keep their relative section positions.
    if(system==='action' && b[3]>90) {
      const lane=clamp((cx-920)/240,0,1);
      sized(d,[-1.09+lane*.23,1.215+lane*.04,clamp((cy-665)/700*1.55,-.8,.8)],
        [0,0,0],clamp(b[2]*U*.72,.009,.05),clamp(b[3]/700*1.55,.06,1.55),system,'Transverse action mounting rail · segmented as photographed');continue;
    }
    // Remaining large edge/shadow candidates become bounded attached surfaces,
    // never an enormous freestanding board intersecting the assembled case.
    if(sz>.55){
      const p=system==='pedal'?[-.85,.88,((n%5)-2)*.06]:[-.80+(n%4)*.35,1.08,((n%3)-1)*.52];
      sized(d,p,[0,0,0],clamp(b[2]*U*.25,.008,.42),clamp(b[3]*U*.25,.008,.42),system,'Unconfirmed large edge sheet · attached to a structural surface',.15);continue;
    }
    let p,rot=[0,0,0];
    if(system==='pedal'){
      // Keep the photographed minor fixtures at the lyre's actual mounting
      // planes. They no longer form an arbitrary freestanding stack inside
      // the open window; their precise factory roles remain unclassified.
      const col=n%9,row=Math.floor(n/9),top=row%2;
      p=[-.986+(Math.floor(row/2)%2)*.020,top?1.020:layout.lyreBottom+.071,(col-4)*(top?.043:.025)];
      if(b[3]>b[2]*2)rot=[PI/2,0,0];
    }else if(system==='action'||system==='keyboard'){
      p=[-1.15+(Math.floor(n/18)%3)*.11,system==='keyboard'?1.07:1.22,-.76+(n%18)*.089];
    }else if(system==='strings'){
      p=[-.82+(Math.floor(n/14)%4)*.47,1.31,-.77+(n%14)*.117];
    }else if(system==='resonance'){
      p=[-.72+(Math.floor(n/12)%4)*.46,1.12,-.64+(n%12)*.116];
    }else if(system==='case'){
      p=[-.94+(Math.floor(n/12)%5)*.39,1.385,(n%2?1:-1)*(.78-(n%6)*.007)];
    }else{
      // Unknown fixtures are placed at frame support sites, not given invented roles.
      p=[-.81+(Math.floor(n/16)%4)*.47,1.265,-.72+(n%16)*.096];
    }
    const factor=Math.min(.7,.085/Math.max(sz,.001));
    put(d.id,p,rot,[factor,.75,factor],system,'Placed at a support or connection point of its system; role unconfirmed');
  }
  return poses;
}
