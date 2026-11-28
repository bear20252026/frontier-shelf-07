const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};

export function contactAt(scroll) {
  return {exit:smooth((scroll-7.25)/.95),apples:smooth((scroll-8.10)/1.10)};
}

export function contactPose(scroll,index,reduced=false) {
  // Three reveals now (title, email, footer): a .12 stagger gives the short
  // sequence room to breathe and lands the last one at 8.94 screens, inside
  // the 9.55 scroll range.
  const progress=clamp((scroll-7.85-index*.12)/.85);
  const arrival=1-Math.pow(1-progress,4);
  return {
    progress,opacity:smooth(progress/.38),
    y:reduced?0:(1-arrival)*.48,
    rotateX:reduced?0:(1-smooth(progress))*32,
    rotateZ:reduced?0:(1-smooth(progress))*[-3,2,-2][index],
    scale:reduced?1:.86+arrival*.14,
    blur:reduced?0:(1-arrival)*5,
  };
}

export function createContact(root) {
  const items=[...root.querySelectorAll('.contact-reveal')];
  const lemons=root.querySelector('.contact-lemons');
  return {update(scroll,reduced,height) {
    const phase=contactAt(scroll);
    const active=scroll>7.85;
    root.style.visibility=active?'visible':'hidden';
    root.inert=!active;
    root.setAttribute('aria-hidden',active?'false':'true');
    for(const [index,item] of items.entries()) {
      const pose=contactPose(scroll,index,reduced);
      item.style.opacity=pose.opacity.toFixed(4);
      item.style.visibility=pose.opacity>0?'visible':'hidden';
      item.inert=pose.opacity<.95;
      item.setAttribute('aria-hidden',pose.opacity<.95?'true':'false');
      item.style.transform=`translate3d(0,${(pose.y*height).toFixed(2)}px,0) rotateX(${pose.rotateX.toFixed(2)}deg) rotateZ(${pose.rotateZ.toFixed(2)}deg) scale(${pose.scale.toFixed(4)})`;
      item.style.filter=pose.blur<.01?'none':`blur(${pose.blur.toFixed(2)}px)`;
      item.style.willChange=pose.progress>0&&pose.progress<1?'transform, opacity':'auto';
    }
    lemons.style.transform=reduced?'none':`translateY(${((1-phase.apples)*100).toFixed(3)}%)`;
    lemons.style.opacity=(reduced?phase.apples:1).toFixed(4);
    lemons.style.visibility=phase.apples>0?'visible':'hidden';
    return phase;
  }};
}
