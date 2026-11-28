/* Moonshot EV-7 — 几何构造器：带孔壳面、环带扫掠、面罩片、贴片、变径软管 */
(function(){
"use strict";
const __E=window.EV7=window.EV7||{};
const {TAU, lerp, sDir, sPos, sNor, apPoint}=__E;

/* --------------------------------------------------------------- 几何工具 */
function GB(){ this.p=[]; this.n=[]; this.u=[]; this.i=[]; }
GB.prototype.v=function(px,py,pz,nx,ny,nz,uu,vv){
  this.p.push(px,py,pz); this.n.push(nx,ny,nz); this.u.push(uu,vv);
  return this.p.length/3-1;
};
GB.prototype.quad=function(a,b,c,d){ this.i.push(a,b,c,a,c,d); };
GB.prototype.quadN=function(a,b,c,d,rx,ry,rz){   // 依参考法线自动定向
  const p=this.p, ax=p[a*3],ay=p[a*3+1],az=p[a*3+2];
  const bx=p[b*3]-ax,by=p[b*3+1]-ay,bz=p[b*3+2]-az;
  const cx=p[c*3]-ax,cy=p[c*3+1]-ay,cz=p[c*3+2]-az;
  const nx=by*cz-bz*cy, ny=bz*cx-bx*cz, nz=bx*cy-by*cx;
  if(nx*rx+ny*ry+nz*rz>=0) this.quad(a,b,c,d); else this.quad(a,d,c,b);
};
GB.prototype.geo=function(){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(this.u,2));
  g.setIndex(this.i);
  return g;
};

// 壳面：在 (u,v) 网格上采样，keep() 为假的格子跳过（用于挖出面窗开口）
function surfGeo(off,inward,keep,U,V,v0,v1){
  const gb=new GB(), rows=[];
  for(let j=0;j<=V;j++){
    const v=lerp(v0,v1,j/V), row=[];
    for(let i=0;i<=U;i++){
      const u=i/U*TAU, d=sDir(u,v), p=sPos(d,off), n=sNor(d);
      row.push(gb.v(p[0],p[1],p[2], inward?-n[0]:n[0], inward?-n[1]:n[1], inward?-n[2]:n[2], i/U, j/V));
    }
    rows.push(row);
  }
  for(let j=0;j<V;j++)for(let i=0;i<U;i++){
    const u0=i/U*TAU,u1=(i+1)/U*TAU, va=lerp(v0,v1,j/V), vb=lerp(v0,v1,(j+1)/V);
    if(keep && !(keep(u0,va)&&keep(u1,va)&&keep(u0,vb)&&keep(u1,vb)&&keep((u0+u1)/2,(va+vb)/2))) continue;
    const d=sDir((u0+u1)/2,(va+vb)/2), n=sNor(d), s=inward?-1:1;
    gb.quadN(rows[j][i],rows[j][i+1],rows[j+1][i+1],rows[j+1][i], n[0]*s,n[1]*s,n[2]*s);
  }
  return gb.geo();
}

// 环带：沿开口轮廓线扫掠一段剖面（密封框、面罩边框、面部软封等）
function bandGeo(profile,TS,refIdx,ref){
  const K=profile.length, P=[];
  for(let i=0;i<TS;i++){
    const t=i/TS*TAU, row=[];
    for(let k=0;k<K;k++) row.push(sPos(apPoint(t,profile[k][0]),profile[k][1]));
    P.push(row);
  }
  const pos=[],nor=[],uv=[],idx=[];
  for(let i=0;i<TS;i++){
    const ip=(i+1)%TS, im=(i+TS-1)%TS;
    for(let k=0;k<K;k++){
      const kp=Math.min(k+1,K-1), km=Math.max(k-1,0);
      const a=P[i][k];
      const tx=P[ip][k][0]-P[im][k][0], ty=P[ip][k][1]-P[im][k][1], tz=P[ip][k][2]-P[im][k][2];
      const sx=P[i][kp][0]-P[i][km][0], sy=P[i][kp][1]-P[i][km][1], sz=P[i][kp][2]-P[i][km][2];
      let nx=ty*sz-tz*sy, ny=tz*sx-tx*sz, nz=tx*sy-ty*sx;
      const l=Math.hypot(nx,ny,nz)||1; nx/=l; ny/=l; nz/=l;
      pos.push(a[0],a[1],a[2]); nor.push(nx,ny,nz); uv.push(i/TS,k/(K-1));
    }
  }
  let flip=false;
  if(ref){
    const b=refIdx*3;
    if(nor[b]*ref[0]+nor[b+1]*ref[1]+nor[b+2]*ref[2] < 0) flip=true;
  }
  if(flip) for(let q=0;q<nor.length;q++) nor[q]=-nor[q];
  for(let i=0;i<TS;i++){
    const ip=(i+1)%TS;
    for(let k=0;k<K-1;k++){
      const a=i*K+k, b=ip*K+k, c=ip*K+k+1, d=i*K+k+1;
      if(flip) idx.push(a,d,c,a,c,b); else idx.push(a,b,c,a,c,d);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);
  return g;
}

// 面罩片：开口区域的径向参数化，边界精确
function capGeo(off,inward,fMax,TS,RS){
  const gb=new GB(), rows=[];
  for(let j=0;j<=RS;j++){
    const f=fMax*j/RS, row=[];
    for(let i=0;i<TS;i++){
      const t=i/TS*TAU, d=apPoint(t,f), p=sPos(d,off), n=sNor(d);
      row.push(gb.v(p[0],p[1],p[2], inward?-n[0]:n[0], inward?-n[1]:n[1], inward?-n[2]:n[2], (Math.cos(t)*j/RS+1)/2, (Math.sin(t)*j/RS+1)/2));
    }
    rows.push(row);
  }
  for(let j=0;j<RS;j++)for(let i=0;i<TS;i++){
    const i2=(i+1)%TS, d=apPoint((i+.5)/TS*TAU, fMax*(j+.5)/RS), n=sNor(d), s=inward?-1:1;
    gb.quadN(rows[j][i],rows[j][i2],rows[j+1][i2],rows[j+1][i], n[0]*s,n[1]*s,n[2]*s);
  }
  return gb.geo();
}

// 壳面局部贴片（用于标识、格栅）
function patchGeo(uc,vc,du,dv,off,US,VS){
  const gb=new GB(), rows=[];
  for(let j=0;j<=VS;j++){
    const v=vc-dv+2*dv*j/VS, row=[];
    for(let i=0;i<=US;i++){
      const u=uc-du+2*du*i/US, d=sDir(u,v), p=sPos(d,off), n=sNor(d);
      row.push(gb.v(p[0],p[1],p[2],n[0],n[1],n[2], i/US, 1-j/VS));
    }
    rows.push(row);
  }
  for(let j=0;j<VS;j++)for(let i=0;i<US;i++){
    const d=sDir(uc-du+2*du*(i+.5)/US, vc-dv+2*dv*(j+.5)/VS), n=sNor(d);
    gb.quadN(rows[j][i],rows[j][i+1],rows[j+1][i+1],rows[j+1][i],n[0],n[1],n[2]);
  }
  return gb.geo();
}

// 变径扫掠（波纹软管）
function hoseGeo(curve,segs,radFn,rs){
  const fr=curve.computeFrenetFrames(segs,false), gb=new GB(), rows=[];
  for(let i=0;i<=segs;i++){
    const t=i/segs, p=curve.getPointAt(t), N=fr.normals[i], B=fr.binormals[i], r=radFn(t), row=[];
    for(let j=0;j<rs;j++){
      const a=j/rs*TAU, c=Math.cos(a), s=Math.sin(a);
      const nx=N.x*c+B.x*s, ny=N.y*c+B.y*s, nz=N.z*c+B.z*s;
      row.push(gb.v(p.x+nx*r,p.y+ny*r,p.z+nz*r,nx,ny,nz,t,j/rs));
    }
    rows.push(row);
  }
  for(let i=0;i<segs;i++)for(let j=0;j<rs;j++){
    const j2=(j+1)%rs;
    gb.quad(rows[i][j],rows[i][j2],rows[i+1][j2],rows[i+1][j]);
  }
  return gb.geo();
}

Object.assign(__E,{GB, surfGeo, bandGeo, capGeo, patchGeo, hoseGeo});
})();
