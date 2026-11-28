const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,p)=>a+(b-a)*p;
const ease=p=>p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;
const copyRect=r=>({left:r.left,top:r.top,width:r.width,height:r.height});
const mixRect=(a,b,p)=>Object.fromEntries(['left','top','width','height'].map(k=>[k,mix(a[k],b[k],p)]));

export function createPoster({cities,sourceRect,onSelect,onProgress,onClose}){
  const $=id=>document.getElementById(id);
  const dialog=$('detail-dialog'),world=dialog.querySelector('.poster-world'),figure=$('poster-figure');
  const backdrop=dialog.querySelector('.poster-backdrop');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const assets=new Map(),events=new AbortController(),opts={signal:events.signal};
  const words=['from within.','aloft.','onward.','release.','and breathe.','find your center.'];
  let index=0,version=0,tickId=0,scrollId=0,resolveTween=null,reveal=0,journey=0,baseRect=null,origin=null;
  let busy=false,closing=false,focus=null,bodyOverflow='',galleryLocked=false;
  function image(url){return new Promise((resolve,reject)=>{
    const img=new Image();const timer=setTimeout(()=>reject(new Error('Image load timed out')),5000);
    img.onload=()=>{clearTimeout(timer);resolve(img)};img.onerror=()=>{clearTimeout(timer);reject(new Error('Image unavailable'))};img.src=url;
  })}
  function preload(i){
    const city=cities[i],key=city.id.split('/').pop();
    if(!assets.has(key))assets.set(key,Promise.all([
      image(`./assets/${city.id}.jpg`),image(`./assets/motion/masks/${key}.png`),image(`./assets/motion/plates/${key}.jpg`)
    ]).catch(()=>null));
    return assets.get(key);
  }
  function stop(){cancelAnimationFrame(tickId);tickId=0;const r=resolveTween;resolveTween=null;r?.(false)}
  function animate(duration,render){
    stop();if(reduced.matches||duration===0){render(1);return Promise.resolve(true)}
    const start=performance.now();
    return new Promise(resolve=>{resolveTween=resolve;function tick(now){
      const p=clamp((now-start)/duration);render(ease(p));
      if(p<1)tickId=requestAnimationFrame(tick);else{tickId=0;resolveTween=null;resolve(true)}
    }tickId=requestAnimationFrame(tick)});
  }
  function setJourney(value){journey=clamp(value);dialog.style.setProperty('--journey',journey);dialog.dataset.journey=journey.toFixed(3)}
  function setReveal(value){
    reveal=clamp(value);dialog.style.setProperty('--reveal',reveal);dialog.dataset.reveal=reveal.toFixed(3);
    onProgress(galleryLocked?1:reveal);
    if(origin){
      const w=world.clientWidth,h=world.clientHeight;
      const top=mix(origin.top,0,reveal),right=mix(w-origin.left-origin.width,0,reveal);
      const bottom=mix(h-origin.top-origin.height,0,reveal),left=mix(origin.left,0,reveal);
      backdrop.style.clipPath=`inset(${Math.max(0,top)}px ${Math.max(0,right)}px ${Math.max(0,bottom)}px ${Math.max(0,left)}px round ${10*(1-reveal)}px)`;
    }
  }
  function place(rect){
    if(!baseRect)return;
    const dx=rect.left+rect.width/2-baseRect.left-baseRect.width/2;
    const dy=rect.top+rect.height/2-baseRect.top-baseRect.height/2;
    figure.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(${rect.width/baseRect.width},${rect.height/baseRect.height})`;
  }
  function measureFinal(){figure.style.transform='';baseRect=copyRect(figure.getBoundingClientRect());return baseRect}
  function unlock(){busy=false;world.style.opacity='1';dialog.style.backgroundColor='transparent';galleryLocked=false;dialog.dataset.phase='open';dialog.style.overflowY='auto';$('poster-next').disabled=false;$('poster-replay').disabled=false}
  async function open(i){
    if(closing||busy)return;
    busy=true;const ticket=++version,nextIndex=(i+cities.length)%cities.length;
    const city=cities[nextIndex],key=city.id.split('/').pop();
    const wasOpen=dialog.open;
    const loaded=await preload(nextIndex);
    if(ticket!==version)return;
    if(wasOpen){
      dialog.style.backgroundColor=dialog.style.getPropertyValue('--poster-color');
      dialog.dataset.phase='switching';
      const ok=await animate(220,p=>{world.style.opacity=String(1-p);});
      if(!ok||ticket!==version)return;
    }else{focus=document.activeElement;bodyOverflow=document.body.style.overflow;document.body.style.overflow='hidden'}
    index=nextIndex;onSelect(index);
    origin=wasOpen?null:copyRect(sourceRect());galleryLocked=wasOpen;
    dialog.dataset.artwork=key;
    dialog.dataset.phase=wasOpen?'opening-next':'opening';
    dialog.style.setProperty('--poster-color',city.color);
    dialog.style.setProperty('--poster-ink',city.ink||(['impulse','free','balance'].includes(key)?'#faf6e9':'#14231f'));
    $('poster-title').textContent=city.name;
    $('poster-word').textContent=city.word||words[index];
    $('poster-tag').textContent=city.tags;
    $('poster-counter').textContent=`${String(index+1).padStart(2,'0')} / 06`;
    $('poster-line').textContent=city.line;
    $('poster-description').textContent=city.description;
    $('poster-source').textContent='';
    $('poster-original').src=`./assets/${city.id}.jpg`;$('poster-original').alt=city.alt;
    dialog.classList.toggle('has-depth',!!loaded);
    if(loaded){
      const [photo,mask,plate]=loaded;
      $('poster-subject').src=photo.src;
      $('poster-subject').style.maskImage=`url("${mask.src}")`;
      $('poster-subject').style.webkitMaskImage=`url("${mask.src}")`;
      $('poster-plate').src=plate.src;
    }
    dialog.scrollTop=0;setJourney(0);dialog.style.setProperty('--mx',0);dialog.style.setProperty('--my',0);
    world.style.opacity='1';figure.style.visibility='';dialog.style.overflowY='hidden';
    if(!wasOpen)dialog.showModal();
    $('detail-close').focus({preventScroll:true});
    $('poster-next').disabled=true;$('poster-replay').disabled=true;
    const finalRect=measureFinal();
    // Keep the original photograph at its exact gallery position for the first frame.
    const entryRect=origin||{...finalRect,left:finalRect.left+world.clientWidth*.22};
    place(entryRect);setReveal(0);
    const complete=await animate(wasOpen?1100:1450,p=>{
      setReveal(p);place(mixRect(entryRect,finalRect,p));
    });
    if(!complete||ticket!==version||!dialog.open)return;
    figure.style.transform='';backdrop.style.clipPath='';dialog.style.backgroundColor='transparent';galleryLocked=false;unlock();
    preload((index+1)%cities.length);
  }
  async function close(){
    if(!dialog.open||closing)return;
    closing=true;busy=true;galleryLocked=false;const ticket=++version;stop();dialog.style.backgroundColor='transparent';dialog.dataset.phase='closing';
    $('poster-next').disabled=true;$('poster-replay').disabled=true;
    // Remove the scroll zoom before returning the same photograph to the gallery.
    const fromJourney=journey;
    if(fromJourney>.001)await animate(220,p=>setJourney(fromJourney*(1-p)));
    if(ticket!==version||!dialog.open)return;
    dialog.style.overflowY='hidden';dialog.scrollTop=0;setJourney(0);
    dialog.style.setProperty('--mx',0);dialog.style.setProperty('--my',0);
    const current=copyRect(figure.getBoundingClientRect());
    const dest=copyRect(sourceRect());origin=dest;
    const fromReveal=reveal;
    measureFinal();place(current);
    await animate(900,p=>{setReveal(fromReveal*(1-p));place(mixRect(current,dest,p));world.style.opacity='1'});
    if(ticket!==version||!dialog.open)return;
    dialog.close();
  }
  function cleanup(){
    version++;stop();cancelAnimationFrame(scrollId);scrollId=0;
    busy=false;closing=false;galleryLocked=false;figure.style.transform='';world.style.opacity='1';dialog.style.backgroundColor='transparent';
    setJourney(0);setReveal(0);dialog.dataset.phase='closed';
    document.body.style.overflow=bodyOverflow;
    onClose();focus?.focus({preventScroll:true});
  }
  $('detail-close').addEventListener('click',close,opts);
  $('poster-next').addEventListener('click',()=>open(index+1),opts);
  $('poster-replay').addEventListener('click',()=>{
    if(busy||closing)return;const again=index;
    dialog.addEventListener('close',()=>open(again),{once:true});close();
  },opts);
  dialog.addEventListener('cancel',e=>{e.preventDefault();close()},opts);
  dialog.addEventListener('close',cleanup,opts);
  dialog.addEventListener('keydown',e=>{
    if(e.key==='ArrowRight'){e.preventDefault();open(index+1)}
    if(e.key==='ArrowLeft'){e.preventDefault();open(index-1)}
  },opts);
  dialog.addEventListener('scroll',()=>{
    if(busy||closing||scrollId)return;
    scrollId=requestAnimationFrame(()=>{scrollId=0;setJourney(reduced.matches?0:dialog.scrollTop/Math.max(1,dialog.scrollHeight-dialog.clientHeight))});
  },{...opts,passive:true});
  world.addEventListener('pointermove',e=>{
    if(busy||reduced.matches||e.pointerType==='touch')return;
    const r=world.getBoundingClientRect();
    dialog.style.setProperty('--mx',clamp((e.clientX-r.left)/r.width*2-1,-1,1));
    dialog.style.setProperty('--my',clamp((e.clientY-r.top)/r.height*2-1,-1,1));
  },opts);
  world.addEventListener('pointerleave',()=>{dialog.style.setProperty('--mx',0);dialog.style.setProperty('--my',0)},opts);
  window.addEventListener('resize',()=>{
    if(!dialog.open)return;
    // A changing viewport invalidates FLIP geometry; settle to the responsive composition.
    version++;stop();figure.style.transform='';origin=null;setReveal(1);backdrop.style.clipPath='';
    if(closing){dialog.close();return}unlock();
  },opts);
  reduced.addEventListener('change',()=>{
    if(!dialog.open||!reduced.matches)return;
    version++;stop();setJourney(0);setReveal(1);figure.style.transform='';backdrop.style.clipPath='';
    if(closing)dialog.close();else unlock();
  },opts);
  return {open,close,preload,destroy(){version++;stop();cancelAnimationFrame(scrollId);events.abort()}};
}
