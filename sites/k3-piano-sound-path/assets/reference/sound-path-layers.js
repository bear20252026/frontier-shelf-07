import {createAccessoryPoses} from './assembly-accessories.js';
import {actionKeyboardLayout} from './assembly-action.js';

// Semantic views of the existing source units, never a second set of parts.
// A group means a role in this presentation, not a claimed factory assembly.
const LAYER_KEYS=['lids','case','support','keyboard','action','damper','strings','plate','bridges','soundboard','pedals','unknown'];
const EXACT={
  lids:['CFX-M01','CFX-M02','CFX-M08','CFX-M09','CFX-M10','CFX-M11','CFX-M12','X-AUTO-1030','X-AUTO-0973'],
  case:['CFX-M07'],
  support:['CFX-M04','CFX-M05','CFX-M06','B-AUTO-0083','B-AUTO-0071','B-AUTO-0067','B-AUTO-0200','B-AUTO-0199'],
  keyboard:['CFX-KEYFRAME','K-AUTO-1057','K-AUTO-1222','X-AUTO-0712'],
  action:['A-AUTO-3035'],
  strings:['R-AUTO-2912','P-AUTO-4005'],
  plate:['CFX-R01'],
  bridges:['CFX-R02','CFX-R03'],
  soundboard:['CFX-M03'],
  pedals:['CFX-M13','B-AUTO-0064','B-AUTO-0059','B-AUTO-0058','B-AUTO-0207','B-AUTO-0202','B-AUTO-0201']
};

// These are explicit placement relationships in assembly-accessories.js.
// No proximity test, source-region guess, or unconfirmed F-pin role is used.
const EXACT_HOSTS={
  'B-AUTO-0083':'CFX-M04','B-AUTO-0071':'CFX-M05','B-AUTO-0067':'CFX-M06',
  'B-AUTO-0064':'CFX-M13','B-AUTO-0059':'CFX-M13','B-AUTO-0058':'CFX-M13',
  'B-AUTO-0207':'CFX-M13','B-AUTO-0202':'CFX-M13','B-AUTO-0201':'CFX-M13',
  'K-AUTO-1057':'CFX-KEYFRAME','K-AUTO-1222':'CFX-KEYFRAME','X-AUTO-0712':'CFX-KEYFRAME',
  'C-AUTO-1065':'CFX-M07','C-AUTO-1137':'CFX-M07',
  'C-AUTO-1147':'CFX-M11','C-AUTO-1149':'CFX-M11',
  'M-AUTO-0577':'CFX-M12','M-AUTO-0578':'CFX-M12',
  'P-AUTO-4005':'R-AUTO-2912','R-AUTO-1153':'R-AUTO-2912'
};
const LABELS={
  lids:'Lid & music desk',case:'Case & keybed',support:'Legs & support',keyboard:'Keys & key frame',
  action:'Action',damper:'Dampers',strings:'Strings',plate:'Cast-iron plate',
  bridges:'Bridges',soundboard:'Soundboard',pedals:'Pedals & linkages',unknown:'Unconfirmed fittings'
};

const dataFor=r=>r?.d||r?.g?.userData||r?.userData||r||{};
const idFor=r=>typeof r==='string'?r:dataFor(r).id;
const numeric=(a,b)=>a.localeCompare(b,undefined,{numeric:true});

/**
 * @param {object} T Three.js namespace supplied by the existing viewer.
 * @param {Array} records The existing assembly.records (no mutation).
 * @returns {{groups:Map,layerFor:Function,datum:object,chapters:Array}}
 * groups: Map<layer key, original record[]>; layerFor accepts a record or ID.
 * Call at the assembled endpoint for measured visible bounds. Classification
 * itself is independent of current mesh visibility and assembly progress.
 */
export function createSoundPathLayers(T,records){
  const byId=new Map(records.map(r=>[idFor(r),r]));
  const groups=new Map(LAYER_KEYS.map(key=>[key,[]]));
  const exact=new Map(Object.entries(EXACT).flatMap(([key,ids])=>ids.map(id=>[id,key])));
  const units=records.map(dataFor);
  // assembly.js currently retains p0/q0/s0 but not pose.host on each record.
  // Reuse its deterministic pose factory to recover only that metadata.
  const names={items:records.map(r=>({...dataFor(r),system:r.system||dataFor(r).system}))};
  const accessoryPoses=createAccessoryPoses(T,units,names);
  const hostBindings=new Map(),hostBasis=new Map(),classification=new Map();
  for(const r of records){
    const id=idFor(r),d=dataFor(r);
    const poseHost=r.pose?.host||r.assemblyPose?.host||r.host||d.host||accessoryPoses.get(id)?.host;
    const host=poseHost||EXACT_HOSTS[id];
    if(host&&host!==id&&byId.has(host)){
      hostBindings.set(id,host);hostBasis.set(id,poseHost?'existing-pose-host':'explicit-placement-id');
    }
  }
  function direct(id){
    if(exact.has(id))return exact.get(id);
    if(/^KEY-(?:WOOD|WHITE|BLACK)-/.test(id))return 'keyboard';
    if(/^BANK-[WH]-[1-5]$/.test(id)||/^BRASS-BRACKET-[1-6]-/.test(id))return 'action';
    // These banks stay beside the action but are never called jacks, dampers,
    // or repetition levers: their precise identities remain unconfirmed.
    if(/^BANK-D-[1-4]$/.test(id))return 'action';
    if(/^D[123]-DAMPER-\d+$/.test(id))return 'damper';
    if(/^WIRE-LOOP-\d+$/.test(id))return 'strings';
    return null;
  }
  const layerById=new Map();
  function resolve(id,visited=new Set()){
    if(layerById.has(id))return layerById.get(id);
    if(visited.has(id)||!byId.has(id))return 'unknown';
    visited.add(id);
    const host=hostBindings.get(id),base=direct(id);
    // A recorded surface fragment inherits its host's entire presentation
    // motion. An explicit core unit retains its own functional membership.
    const key=base||(host?resolve(host,visited):'unknown');
    layerById.set(id,key);
    classification.set(id,{layer:key,host:host||null,basis:base?'exact-id-or-identified-prefix':host?hostBasis.get(id):'unresolved'});
    return key;
  }
  for(const r of records)groups.get(resolve(idFor(r))).push(r);
  const layerFor=r=>layerById.get(idFor(r))||'unknown';
  const idsFor=key=>groups.get(key).map(idFor);
  const present=ids=>ids.filter(id=>byId.has(id));
  const ancillaryIds=present([
    'BANK-D-1','BANK-D-2','BANK-D-3','BANK-D-4','A-AUTO-3035',
    'P-AUTO-4005','R-AUTO-1153','K-AUTO-1057','K-AUTO-1222','X-AUTO-0712',
    ...hostBindings.keys()
  ]);
  const ancillary=new Set(ancillaryIds);

  // These bounds are measured from visible source/detail meshes. They are
  // useful for camera fitting; none of their extrema are used to invent hosts.
  function visibleBounds(rs){
    const box=new T.Box3(),scratch=new T.Box3();
    for(const r of rs){
      const g=r.g||r;
      if(!g?.traverse)continue;
      g.updateWorldMatrix?.(true,true);
      g.traverse(m=>{
        if(!m.isMesh||!m.visible||!m.geometry)return;
        for(let p=m.parent;p&&p!==g.parent;p=p.parent)if(!p.visible)return;
        const materials=Array.isArray(m.material)?m.material:[m.material];
        if(materials.every(mat=>!mat||(mat.opacity??1)<=.001))return;
        if(!m.geometry.boundingBox)m.geometry.computeBoundingBox();
        if(m.geometry.boundingBox){
          scratch.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
          box.union(scratch);
        }
      });
    }
    return box.isEmpty()?null:{min:box.min.toArray(),max:box.max.toArray(),center:box.getCenter(new T.Vector3()).toArray()};
  }
  const boundsByLayer=Object.fromEntries([...groups].map(([key,rs])=>[key,visibleBounds(rs)]));
  const layout=actionKeyboardLayout(),note=layout.notes.find(n=>n.midi===60),index=note.index;
  const orderedKeys=records.map(idFor).filter(id=>id.startsWith('KEY-WOOD-')).sort(numeric);
  const whiteIndex=layout.whites.findIndex(n=>n.index===index),keyCap='KEY-WHITE-'+String(whiteIndex+1).padStart(2,'0');
  let bankIndex=0,offset=0;for(let i=0;i<layout.sectionCounts.length;i++)if(index>=offset){bankIndex=i;offset+=layout.sectionCounts[i];}else break;

  // Camera values are framing suggestions in the actual assembly axes:
  // X = keyboard to tail, Y = up, Z = bass to treble. The section cut is Z=0.
  // Keep the +Z half; observe its exposed cut face from -Z. A whole-piano
  // frame needs >=3.4/aspect world units of height to avoid tail cropping.
  const camera=(position,target,height,minWidth)=>({position,target,height,minWidth});
  const views={
    whole:camera([-4.8,3.35,-6.3],[-.10,1.1,0],3.7,4.5),
    section:camera([-3.30,2.30,-5.0],[-.25,1.18,.10],2.8,4.1),
    keyboard:camera([-3.8,2.15,-3.0],[-1.84,1.13,.17],1.50,2.9),
    action:camera([-3.50,3.00,-3.30],[-1.46,1.89,.15],1.35,2.5),
    plate:camera([-3.60,4.30,-5.3],[.02,1.98,.12],3.20,4.2),
    resonance:camera([-2.75,3.50,-5.0],[.04,1.54,.12],2.65,4.0),
    controls:camera([-3.50,2.70,-4.6],[-.88,1.21,.15],2.40,3.5),
    layers:camera([-4.30,6.7,-6.4],[-.37,1.97,.18],5.1,5.6)
  };
  const datum={
    labels:LABELS,layerOrder:LAYER_KEYS.slice(),
    count:records.length,counts:Object.fromEntries([...groups].map(([key,rs])=>[key,rs.length])),
    idsByLayer:Object.fromEntries(LAYER_KEYS.map(key=>[key,idsFor(key)])),
    hostBindings,classification,ancillaryIds:[...ancillary],
    explainedIds:records.map(idFor).filter(id=>layerFor(id)!=='unknown'&&!ancillary.has(id)),
    unknownIds:idsFor('unknown'),boundsByLayer,views,
    cut:{axis:'z',value:0,keepHalf:'positive',viewFrom:'negative',source:'assembly coordinate convention'},
    heights:{keybed:1.035,keyLever:[1.074,1.102],whiteKeyTop:1.124,blackKeyTop:1.159,
      wippen:[1.179,1.196],hammerCentre:1.322,strings:[1.355,1.365],
      damperContact:1.355,damperHeadTop:1.379,soundboardBase:1.15,soundboardRibBottom:1.125,
      plateBase:1.29,rim:[1.12,1.45],lidHinge:1.47},
    representativeNote:{name:'C4',midi:60,index,keyWood:orderedKeys[index],keyCap,
      wippenBank:'BANK-W-'+(bankIndex+1),hammerBank:'BANK-H-'+(bankIndex+1),
      frontZ:note.z,tailZ:note.tailZ,
      wippenPivot:[-1.266,1.190,note.tailZ],hammerPivot:[-1.253,1.285,note.tailZ],
      independentlyRigged:false,
      note:'Banks are material-merged. These coordinates identify current static geometry, not a solved action rig.'},
    sharedAttachments:[
      {id:'X-AUTO-1030',ends:['CFX-M07','CFX-M01'],note:'Long prop spans rim and lid; stage away with lid before separating these hosts.'},
      {id:'X-AUTO-0973',ends:['CFX-M07'],note:'Short prop is stowed on the rim; remove in the access chapter.'},
      {id:'B-AUTO-0200',ends:['CFX-M13','CFX-M07'],note:'Rear lyre brace; structural support, not a fourth pedal linkage.'},
      {id:'B-AUTO-0199',ends:['CFX-M13','CFX-M07'],note:'Rear lyre brace; structural support, not a fifth pedal linkage.'}
    ],
    policy:{
      unknown:'Keep at assembly location in the overview. Fade with the removed half or keep hidden during functional chapters; restore for the source inventory. Never scatter or relabel.',
      ancillary:'Follow the documented host or whole semantic layer without an independent motion or mechanism label.',
      scale:'All heights and camera positions are current scene units, not claimed factory dimensions.',
      stringCount:'72 straight presentation strands plus 12 photographed coils are not a CFX factory string count.',
      boundary:'case contains the rim, keybed and underbody bearer surfaces under one source ID; split meshes geometrically, not by an invented extra unit.'
    }
  };
  const base={context:['case','support'],hide:['unknown'],emphasize:[],view:'whole'};
  const chapter=(id,title,summary,options)=>({id,title,summary,...base,...options});
  const chapters=[
    chapter('whole','One piano','Start with the complete piano, then follow the section to trace the path of sound.',{context:LAYER_KEYS.filter(k=>k!=='unknown'),hide:[],view:'whole'}),
    chapter('section','Opening the section','The near half of the piano moves aside, keeping the true cut face on the far half.',{context:['case','support','keyboard','action','damper','strings','plate','bridges','soundboard','pedals'],hide:['lids','unknown'],view:'section'}),
    chapter('keyboard','The finger’s motion','Long wooden keys carry motion from the front of the keyboard to the rear.',{emphasize:['keyboard'],context:['case','action'],hide:['lids','unknown'],view:'keyboard',move:{keyboard:[-1,0,0]}}),
    chapter('action','Power for the hammers','Wippens and hammers form the action; this chapter shows its structural layers.',{emphasize:['action'],context:['keyboard','strings'],hide:['lids','unknown'],view:'action',move:{action:[-.3,.65,0]}}),
    chapter('plate','Carrying the tension','The cast-iron plate lifts away to reveal the string field it supports.',{emphasize:['plate','strings'],context:['case','bridges','soundboard'],hide:['lids','unknown'],view:'plate',move:{plate:[0,1.4,0]}}),
    chapter('resonance','Sound into the room','Bridges pass string vibration to the soundboard; its broad surface moves the air.',{emphasize:['strings','bridges','soundboard'],context:['plate'],hide:['lids','unknown'],view:'resonance'}),
    chapter('controls','Controlling the sustain','The right pedal lifts the dampers through linkages, letting strings ring after the key is released.',{emphasize:['damper','pedals'],context:['strings','soundboard','support'],hide:['lids','unknown'],view:'controls'}),
    chapter('layers','Every layer has its role','From keys to soundboard, see the systems with different duties inside one section.',{emphasize:['keyboard','action','strings','bridges','soundboard'],context:['plate','damper','pedals','case','support'],hide:['lids','unknown'],view:'layers'})
  ];
  return {groups,layerFor,datum,chapters};
}
