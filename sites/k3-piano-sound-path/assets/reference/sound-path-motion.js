// Reversible teaching choreography, using the assembled world coordinates.
export const SOUND_LAYERS=['lids','case','support','keyboard','action','damper','strings','plate','bridges','soundboard','pedals','unknown'];
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10);};
const lerp=(a,b,t)=>a+(b-a)*t;
const phase=(a,b,t)=>ease((t-a)/(b-a));
const add=(a,b)=>a.map((x,i)=>x+b[i]);

// The cut is a temporary introduction. Rejoin both sides before the first
// functional layer moves, then preserve the complete instrument at every stop.
export function soundPathSectionAmount(time){
 const t=Math.max(0,Math.min(7,time));
 return phase(0,.9,t)*(1-phase(1,1.4,t));
}
// 01 opens the specimen; the first 40% of 01 -> 02 closes it again. The full
// key tray then moves forward. Chapters 02 -> 06 move both halves together;
// 06 -> 07 is handed to the original photographic-layout transition.
export function soundPathPose(time){
 const t=Math.max(0,Math.min(6,time));
 const open=soundPathSectionAmount(t);
 const keyboard=phase(1.42,1.92,t),actionOut=phase(2.03,2.40,t),actionUp=phase(2.43,2.90,t);
 const plateOut=phase(3.04,3.46,t),plateUp=phase(3.49,3.92,t);
 const stringsOut=phase(4.02,4.25,t),stringsUp=phase(4.28,4.49,t);
 const bridgesOut=phase(4.40,4.67,t),bridgesUp=phase(4.70,4.94,t);
 const soundboardOut=phase(4.16,4.82,t);
 const damperOut=phase(5.04,5.43,t),damperUp=phase(5.46,5.90,t),pedals=phase(5.10,5.85,t);
 const offsets={
   // The existing open lid, folded front leaf and both props remain at their
   // assembled anchors. Moving this group would detach the prop from the rim.
   lids:[0,0,0],case:[0,0,0],support:[0,0,0],
   keyboard:[-1.00*keyboard,0,0],action:[-.55*actionOut,.58*actionUp,0],
   // First clear the lid's footprint, then lift. This teaching route passes
   // through the transparent shell, rather than driving a layer through the
   // retained lid or its prop. It is an explanatory view, not a service order.
   damper:[-.72*damperOut,.82*damperUp,0],strings:[0,.57*stringsUp,-2.0*stringsOut],
   plate:[0,.98*plateUp,-2.0*plateOut],bridges:[0,.30*bridgesUp,-2.0*bridgesOut],
   soundboard:[0,-.28*soundboardOut,-1.10*soundboardOut],pedals:[-.34*pedals,0,0],unknown:[0,0,0]
 };
 const opacityStops=[
  {lids:1,case:1,support:1,keyboard:1,action:1,damper:1,strings:1,plate:1,bridges:1,soundboard:1,pedals:1,unknown:1},
  {lids:.68,case:1,support:1,keyboard:1,action:1,damper:1,strings:1,plate:1,bridges:1,soundboard:1,pedals:1,unknown:.1},
  {lids:.62,case:.24,support:.30,keyboard:1,action:.55,damper:.12,strings:.20,plate:.12,bridges:.18,soundboard:.22,pedals:.12,unknown:0},
  {lids:.52,case:.22,support:.28,keyboard:.45,action:1,damper:.2,strings:.3,plate:.08,bridges:.12,soundboard:.15,pedals:.08,unknown:0},
  {lids:.62,case:.24,support:.30,keyboard:.10,action:.18,damper:.15,strings:1,plate:.62,bridges:.7,soundboard:.75,pedals:.08,unknown:0},
  {lids:.50,case:.24,support:.30,keyboard:.08,action:.12,damper:.09,strings:.75,plate:.16,bridges:1,soundboard:1,pedals:.08,unknown:0},
  {lids:.62,case:.24,support:.32,keyboard:.12,action:.18,damper:1,strings:.35,plate:.12,bridges:.15,soundboard:.20,pedals:1,unknown:0}
 ];
 const i=Math.min(5,Math.floor(t)),u=ease(t-i),op={};
 for(const layer of SOUND_LAYERS){
  const opacity=lerp(opacityStops[i][layer],opacityStops[i+1][layer],u);
  const negAlpha=lerp(1,.24,open);
  op[layer]={
   positive:{position:add([.03*open,0,.46*open],offsets[layer]),opacity},
   negative:{position:add([-.12*open,0,-1.12*open],offsets[layer]),opacity:opacity*negAlpha}
  };
 }
 return op;
}
// Camera and target travel together. X is front-to-tail; Z is across keys.
const VIEWS=[
 {eye:[-4.8,3.35,-6.3],target:[-.10,1.07,0],height:4.0,minWidth:4.6},
 // Stay on the open side of the raised lid while changing azimuth and
 // elevation. The stage fitter controls scale; these vectors direct the gaze.
 {eye:[-3.8,2.45,-6.1],target:[-.25,1.35,0],height:3.7,minWidth:5.4},
 {eye:[-7.0,2.8,-2.5],target:[-.5,1.3,-.1],height:3.8,minWidth:5.4},
 {eye:[-5.8,3.2,-4.8],target:[-.5,1.4,-.2],height:3.8,minWidth:5.4},
 {eye:[-3.4,6.8,-5.8],target:[-.35,1.45,-.8],height:4.0,minWidth:5.8},
 {eye:[1.6,5.7,-6.8],target:[-.15,1.15,-1.0],height:4.0,minWidth:5.8},
 {eye:[-4.6,2.9,-6.0],target:[-.45,1.25,-.9],height:4.0,minWidth:5.8},
 {eye:[0,12,.0001],target:[0,0,0],height:9.5,minWidth:9.011}
];
// The layout interpolates between these chapter sides and can hide copy
// during a side change. Null reserves the complete stage for the final atlas.
export function soundPathNarrativeSide(time){
 return ['left','left','right','right','left','right','left',null][Math.max(0,Math.min(7,Math.round(time)))];
}
export function soundPathView(time){
 const t=Math.max(0,Math.min(7,time)),i=Math.min(6,Math.floor(t)),u=ease(t-i),a=VIEWS[i],b=VIEWS[i+1];
 return{eye:a.eye.map((v,j)=>lerp(v,b.eye[j],u)),target:a.target.map((v,j)=>lerp(v,b.target[j],u)),height:lerp(a.height,b.height,u),minWidth:lerp(a.minWidth,b.minWidth,u)};
}
export const SOUND_LABELS=[
 {layer:'keyboard',name:'Keys · Transfer motion',anchor:[-1.63,1.125,.13]},
 {layer:'action',name:'Action · Drive the hammers',anchor:[-1.205,1.34,.13]},
 {layer:'plate',name:'Cast-iron plate · Carry tension',anchor:[.35,1.32,.24]},
 {layer:'strings',name:'Strings · Produce vibration',anchor:[.12,1.358,.34]},
 {layer:'bridges',name:'Bridges · Transfer vibration',anchor:[.28,1.215,.24]},
 {layer:'soundboard',name:'Soundboard · Move air',anchor:[.75,1.18,.25]},
 {layer:'damper',name:'Dampers · Control sustain',anchor:[-1.0,1.38,.22]},
 {layer:'pedals',name:'Right pedal · Sustain',anchor:[-1.05,.16,.13]}
];
