import * as THREE from 'three';

// A dedicated HDR reflection environment gives the gold broad studio highlights
// and deep shaded areas while the visible background remains open sky.
export function createStudioLighting(renderer,scene) {
  scene.add(new THREE.HemisphereLight(0xd5e6ec,0x756d50,0.55));
  const key=new THREE.DirectionalLight(0xffead0,4.0);
  key.position.set(0.3,5.7,6);key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);
  Object.assign(key.shadow.camera,{left:-6,right:3,top:5,bottom:-3,near:0.5,far:20});
  key.shadow.normalBias=0.014;key.shadow.bias=-0.00012;key.shadow.radius=2;
  key.target.position.set(-1.7,1.0,0);scene.add(key,key.target);
  const rim=new THREE.DirectionalLight(0xffedc9,1.7);
  rim.position.set(-4.5,4,-3);scene.add(rim);
  const fill=new THREE.DirectionalLight(0xcde2ec,0.32);
  fill.position.set(-5,0.8,5);scene.add(fill);

  const width=512,height=256,data=new Float32Array(width*height*4);
  const softBox=(u,v,cx,cy,sx,sy)=>{
    const dx=Math.min(Math.abs(u-cx),1-Math.abs(u-cx))/sx,dy=Math.abs(v-cy)/sy;
    return Math.exp(-(dx**8+dy**8));
  };
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const u=x/width,v=y/height;
    const main=softBox(u,v,0.63,0.68,0.083,0.17)*7.5;
    const side=softBox(u,v,0.89,0.53,0.032,0.24)*2.8;
    const overhead=softBox(u,v,0.42,0.85,0.18,0.022)*3.2;
    const cool=softBox(u,v,0.12,0.50,0.10,0.19)*0.50;
    const haze=Math.max(0,1-Math.abs(v-0.45)*2)*0.075;
    const i=(y*width+x)*4;
    data[i]=0.025+haze+main+side*0.86+overhead+cool*0.64;
    data[i+1]=0.031+haze+main*0.96+side*0.94+overhead*0.94+cool*0.84;
    data[i+2]=0.043+haze+main*0.86+side+overhead*0.81+cool;
    data[i+3]=1;
  }
  const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.FloatType);
  texture.mapping=THREE.EquirectangularReflectionMapping;texture.needsUpdate=true;
  const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromEquirectangular(texture);
  scene.environment=environment.texture;scene.environmentIntensity=0.7;
  texture.dispose();pmrem.dispose();return {environment,key};
}
