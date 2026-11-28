/* Moonshot EV-7 — 程序化贴图：噪声、绗缝内衬、格栅、标识、铭牌 */
(function(){
"use strict";
const __E=window.EV7=window.EV7||{};

/* ------------------------------------------------------------ 程序化贴图 */
function cv(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}

function noiseTex(){
  const c=cv(256,256), x=c.getContext('2d'), im=x.createImageData(256,256), d=im.data;
  let seed=12345;
  const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff;};
  for(let i=0;i<256*256;i++){
    const g=222+rnd()*33;
    d[i*4]=d[i*4+1]=d[i*4+2]=g; d[i*4+3]=255;
  }
  x.putImageData(im,0,0);
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(7,5);
  return t;
}
function quiltTex(){
  const c=cv(512,512), x=c.getContext('2d');
  x.fillStyle='#8f959c'; x.fillRect(0,0,512,512);
  x.strokeStyle='rgba(40,44,50,.55)'; x.lineWidth=7;
  for(let i=0;i<=8;i++){ x.beginPath(); x.moveTo(0,i*64); x.lineTo(512,i*64); x.stroke(); }
  for(let i=0;i<=8;i++){ x.beginPath(); x.moveTo(i*64,0); x.lineTo(i*64,512); x.stroke(); }
  x.fillStyle='rgba(255,255,255,.10)';
  for(let i=0;i<8;i++)for(let j=0;j<8;j++) x.fillRect(i*64+10,j*64+10,44,20);
  x.fillStyle='rgba(0,0,0,.10)';
  for(let i=0;i<2600;i++) x.fillRect(Math.random()*512,Math.random()*512,2,2);
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(5,4);
  return t;
}
function grilleTex(){
  const c=cv(256,256), x=c.getContext('2d');
  x.fillStyle='#20242a'; x.fillRect(0,0,256,256);
  x.fillStyle='#06080a';
  for(let j=0;j<7;j++) for(let i=0;i<3;i++){
    const w=54,h=13,gx=18+i*76,gy=24+j*32;
    x.beginPath(); x.moveTo(gx+6,gy); x.lineTo(gx+w-6,gy);
    x.quadraticCurveTo(gx+w,gy,gx+w,gy+h/2); x.quadraticCurveTo(gx+w,gy+h,gx+w-6,gy+h);
    x.lineTo(gx+6,gy+h); x.quadraticCurveTo(gx,gy+h,gx,gy+h/2);
    x.quadraticCurveTo(gx,gy,gx+6,gy); x.fill();
  }
  const t=new THREE.CanvasTexture(c); t.encoding=THREE.sRGBEncoding; return t;
}
function markTex(main,sub,size){
  const c=cv(1024,256), x=c.getContext('2d');
  x.clearRect(0,0,1024,256);
  x.fillStyle='rgba(38,42,46,.88)';
  x.font='600 '+(size||92)+'px -apple-system,Segoe UI,Helvetica,Arial,sans-serif';
  x.textBaseline='middle';
  const prev=x.letterSpacing; try{ x.letterSpacing='18px'; }catch(e){}
  x.fillText(main,40,104);
  try{ x.letterSpacing='6px'; }catch(e){}
  x.font='400 40px -apple-system,Segoe UI,Helvetica,Arial,sans-serif';
  x.fillStyle='rgba(38,42,46,.55)';
  x.fillText(sub,44,186);
  try{ x.letterSpacing=prev; }catch(e){}
  const t=new THREE.CanvasTexture(c); t.encoding=THREE.sRGBEncoding; return t;
}
function plateTex(lines){
  const c=cv(512,256), x=c.getContext('2d');
  x.fillStyle='#4a5057'; x.fillRect(0,0,512,256);
  x.fillStyle='rgba(255,255,255,.07)'; x.fillRect(0,0,512,12);
  x.fillStyle='rgba(232,236,240,.82)'; x.textBaseline='middle';
  x.font='500 44px -apple-system,Segoe UI,Helvetica,Arial,sans-serif';
  lines.forEach(function(s,i){ x.fillText(s,28,66+i*66); });
  const t=new THREE.CanvasTexture(c); t.encoding=THREE.sRGBEncoding; return t;
}

Object.assign(__E,{cv, noiseTex, quiltTex, grilleTex, markTex, plateTex});
})();
