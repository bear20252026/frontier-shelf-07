import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { createLeafMotion } from './leaf-motion.js';

export function mountFallingApple(model) {
  const group=new THREE.Group();group.name='Falling lemon — second chapter';
  // Orbit about the fruit's centre, preserving the original resting layout.
  const pivot=new THREE.Group();pivot.position.y=.40;
  model.position.y-=.40;pivot.add(model);group.add(pivot);
  const shared={uLeafTime:{value:0},uLeafStrength:{value:1}};
  const leaves=[];
  model.traverse(mesh=>{
    if(!mesh.isMesh)return;
    mesh.castShadow=true;mesh.receiveShadow=true;
    mesh.material=mesh.material.clone();mesh.material.vertexColors=false;
    mesh.material.side=THREE.DoubleSide;mesh.material.envMapIntensity=.85;
    if(mesh.userData.leafRig){
      mesh.geometry.computeBoundingSphere();mesh.geometry.boundingSphere.radius+=.12;
      leaves.push(createLeafMotion(mesh,shared));
    }
  });
  if(!leaves.length)throw new Error('The falling lemon is missing its pinned foliage.');
  return {group,pivot,leaves,update(time,reduced){
    shared.uLeafTime.value=time;shared.uLeafStrength.value=reduced?0:1;
    for(const leaf of leaves)leaf.update(time,reduced,reduced?0:1.15);
  }};
}
export async function createFallingApple(){
  const draco=new DRACOLoader().setDecoderPath('./vendor/draco/').setWorkerLimit(1);
  try{return mountFallingApple((await new GLTFLoader().setDRACOLoader(draco).loadAsync('./assets/lemon-falling.glb')).scene);}
  finally{draco.dispose();}
}

// Real site fonts rendered onto a plane inside the 3D scene, so the drifting
// clouds stay in front of the lettering's depth plane.
export async function createFallTitle(scene){
  await Promise.all([document.fonts.load('400 120px "Jeju Myeongjo"'),document.fonts.load('400 120px "Monsieur La Doulaise"')]);
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  let texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false});
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material);plane.position.z=-3;scene.add(plane);
  return {setTravel(fraction,exit=0,reduced=false){
    plane.position.y=fraction*plane.scale.y;
    plane.rotation.x=reduced?0:-exit*.4;
    material.opacity=1-exit;
    plane.visible=exit<1;
  },resize(width,height,worldWidth,worldHeight){
    const ratio=Math.min(devicePixelRatio,2);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
    const portrait=width/height<.9;const size=portrait?width*.095:Math.min(width*.063,height*.102);
    const x=portrait?width*.075:width*.263,y=portrait?height*.20:height*.145;
    ctx.fillStyle='#090909';ctx.textBaseline='alphabetic';
    const serif=()=>{ctx.font=`400 ${size}px "Jeju Myeongjo"`;};
    serif();ctx.fillText('When life gives you',x,y+size*.73);
    let cursor=x;const baseline=y+size*1.45;
    for(const [text,script] of [['L',true],['emons,',false]]){
      ctx.font=`400 ${size*(script?1.15:1)}px "${script?'Monsieur La Doulaise':'Jeju Myeongjo'}"`;
      ctx.fillText(text,cursor,baseline+(script?size*.04:0));cursor+=ctx.measureText(text).width-(script?size*.035:0);
    }
    serif();ctx.fillText('pull one down.',x,y+size*2.17);
    // Canvas dimensions change on orientation/viewport resize; replace its GPU
    // allocation instead of uploading the new pixels into the old-sized map.
    texture.dispose();texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    material.map=texture;plane.scale.set(worldWidth,worldHeight,1);
  }};
}
