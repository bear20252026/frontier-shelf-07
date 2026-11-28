const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};

export function thesisPose(scroll,index,pointer={x:0,y:0},reduced=false) {
  const progress=clamp((scroll-3.70-index*.10)/.72);
  const arrival=1-Math.pow(1-progress,4);
  const turn=smooth(progress);
  const departure=clamp((scroll-5.02-index*.10)/.78);
  const lift=smooth(departure);
  const interactive=smooth((progress-.85)/.15)*(1-lift);
  const tiltX=clamp(pointer.x,-1,1)*interactive;
  const tiltY=clamp(pointer.y,-1,1)*interactive;
  return {
    progress,arrival,departure,opacity:smooth(progress/.38)*(1-smooth((departure-.25)/.75)),
    y:reduced?0:(1-arrival)*.48-lift*1.1,
    x:reduced?0:(1-arrival)*[-32,12,36][index]+lift*[-28,10,30][index],
    scale:reduced?1:.86+arrival*.14-lift*.12,
    rotateX:reduced?0:(1-turn)*32-lift*32-tiltY*[9,10,9][index],
    rotateY:reduced?0:(1-turn)*[14,-8,-14][index]+lift*[-12,8,14][index]+tiltX*[11,12,13][index],
    rotateZ:reduced?0:[7,-8,9][index]+(1-turn)*[-9,6,10][index]+lift*[-9,6,10][index]+tiltX*1.2,
    blur:reduced?0:(1-arrival)*5+lift*5,
  };
}

export function createThesisCards(root) {
  const cards=[...root.querySelectorAll('.thesis-card')];
  const target={x:0,y:0},pointer={x:0,y:0};
  return {
    setPointer(x,y) {
      target.x=clamp(x,-1,1);target.y=clamp(y,-1,1);
    },
    update(scroll,dt,reduced,height) {
    const blend=1-Math.exp(-dt*8);
    pointer.x=reduced?0:pointer.x+(target.x-pointer.x)*blend;
    pointer.y=reduced?0:pointer.y+(target.y-pointer.y)*blend;
    const moving=Math.abs(target.x-pointer.x)+Math.abs(target.y-pointer.y)>.001;
    for(const [index,card] of cards.entries()) {
      const pose=thesisPose(scroll,index,pointer,reduced);
      card.style.opacity=pose.opacity.toFixed(4);
      card.style.visibility=pose.opacity>0?'visible':'hidden';
      card.setAttribute('aria-hidden',pose.opacity<.95?'true':'false');
      card.style.transform=`translate3d(${pose.x.toFixed(2)}px,${(pose.y*height).toFixed(2)}px,0) rotateX(${pose.rotateX.toFixed(2)}deg) rotateY(${pose.rotateY.toFixed(2)}deg) rotateZ(${pose.rotateZ.toFixed(2)}deg) scale(${pose.scale.toFixed(4)})`;
      card.style.filter=pose.blur<.01?'none':`blur(${pose.blur.toFixed(2)}px)`;
      card.style.willChange=pose.opacity>0&&(pose.progress<1||pose.departure>0||(!reduced&&moving))?'transform, opacity':'auto';
    }
    return thesisPose(scroll,0).arrival;
  }};
}
