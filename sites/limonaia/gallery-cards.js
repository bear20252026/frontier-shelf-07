const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};

// The same buoyant entrance as the thesis cards, with a quieter resting pose.
export function galleryPose(scroll,index,pointer={x:0,y:0},reduced=false,departureScroll=scroll) {
  const progress=clamp((scroll-5.70-index*.10)/.80);
  const arrival=1-Math.pow(1-progress,4);
  const turn=smooth(progress);
  const departure=clamp((departureScroll-7.25-index*.10)/.80);
  const lift=smooth(departure);
  const interactive=smooth((progress-.85)/.15)*(1-lift);
  return {
    progress,departure,opacity:smooth(progress/.38)*(1-smooth((departure-.25)/.75)),
    y:reduced?0:(1-arrival)*.48-lift*1.1,
    x:reduced?0:(1-arrival)*[-32,12,28,36][index],
    scale:reduced?1:.86+arrival*.14-lift*.12,
    rotateX:reduced?0:(1-turn)*32-lift*32-clamp(pointer.y,-1,1)*interactive*3,
    rotateY:reduced?0:(1-turn)*[14,-8,-12,-14][index]+lift*[-12,8,12,14][index]+clamp(pointer.x,-1,1)*interactive*4,
    rotateZ:reduced?0:(1-turn)*[-9,3,6,10][index]+lift*[-9,3,6,10][index],
    blur:reduced?0:(1-arrival)*5+lift*5,
  };
}

export function createGalleryCards(root) {
  const cards=[...root.querySelectorAll('.gallery-item')];
  const target={x:0,y:0},pointer={x:0,y:0};
  let lastOverflow=-1;
  return {
    readingScreens(height) {return Math.max(0,lastOverflow)/height;},
    setPointer(x,y) {target.x=clamp(x,-1,1);target.y=clamp(y,-1,1);},
    update(scroll,dt,reduced,height,portrait) {
      const blend=1-Math.exp(-dt*8);
      pointer.x=reduced?0:pointer.x+(target.x-pointer.x)*blend;
      pointer.y=reduced?0:pointer.y+(target.y-pointer.y)*blend;
      const moving=Math.abs(target.x-pointer.x)+Math.abs(target.y-pointer.y)>.001;
      // On phones the editorial content reads vertically, with real scroll room.
      const overflow=portrait?Math.max(0,root.offsetHeight-height*.37):0;
      if(overflow!==lastOverflow) {
        document.documentElement.style.setProperty('--gallery-overflow',`${Math.ceil(overflow)}px`);
        lastOverflow=overflow;
      }
      const travel=portrait?clamp((scroll-6.80)*height,0,overflow):0;
      root.style.transform=travel?`translateY(${-travel.toFixed(2)}px)`:'none';
      for(const [index,card] of cards.entries()) {
        const pose=galleryPose(scroll,index,pointer,reduced,scroll-overflow/height);
        card.style.opacity=pose.opacity.toFixed(4);
        card.style.visibility=pose.opacity>0?'visible':'hidden';
        card.setAttribute('aria-hidden',pose.opacity<.95?'true':'false');
        card.style.transform=`translate3d(${pose.x.toFixed(2)}px,${(pose.y*height).toFixed(2)}px,0) rotateX(${pose.rotateX.toFixed(2)}deg) rotateY(${pose.rotateY.toFixed(2)}deg) rotateZ(${pose.rotateZ.toFixed(2)}deg) scale(${pose.scale.toFixed(4)})`;
        card.style.filter=pose.blur<.01?'none':`blur(${pose.blur.toFixed(2)}px)`;
        card.style.willChange=pose.opacity>0&&(pose.progress<1||pose.departure>0||(!reduced&&moving))?'transform, opacity':'auto';
      }
      return travel/height;
    },
  };
}
