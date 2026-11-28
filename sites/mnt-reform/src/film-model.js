import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';
import {addHardware} from './hardware.js?v=film1';
import {createKimiScreen} from './kimi-screen.js';
import {groupKeycaps,matchLegend,LEGEND_SCALE} from './keylegends.js';

export async function loadFilmModel(scene){
  const [map,hardware]=await Promise.all(['parts_map.json','hardware.json'].map(p=>fetch('./'+p+'?v=hinge-slot').then(r=>{if(!r.ok)throw Error(p);return r.json();})));
  const draco=new DRACOLoader().setDecoderPath('./vendor/three/addons/libs/draco/gltf/');
  const gltf=await new GLTFLoader().setDRACOLoader(draco).loadAsync('./'+map.meta.glb);
  const root=new THREE.Group();scene.add(root);
  const pivots={},mats={};gltf.scene.updateMatrixWorld(true);
  for(const [name,info] of Object.entries(map.parts)){
    const node=gltf.scene.getObjectByName(name);if(!node)throw Error('Missing part '+name);
    const center=new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
    const world=node.getWorldPosition(new THREE.Vector3());
    const pivot=new THREE.Group();pivot.position.copy(center);pivot.userData={canon:name,base:center.clone()};
    root.add(pivot);pivot.add(node);node.position.copy(world).sub(center);pivots[name]=pivot;mats[name]=[];
    node.traverse(o=>{if(o.isMesh){
      if(info.matClass==='alu')o.geometry=toCreasedNormals(o.geometry,Math.PI/6);
      o.material=o.material.clone();mats[name].push(o.material);o.castShadow=true;o.receiveShadow=true;o.userData.canon=name;
    }});
  }
  addHardware(hardware,root,pivots,mats,map);
  root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  const tl=new THREE.TextureLoader();
  const [keys,oled,brush]=await Promise.all(['keycaps_us.png','oled.png','brushed.png'].map(p=>tl.loadAsync('./textures/'+p)));
  for(const t of [keys,oled]){t.colorSpace=THREE.SRGBColorSpace;t.flipY=false;t.anisotropy=8;}
  brush.wrapS=brush.wrapT=THREE.RepeatWrapping;
  for(const [name,info] of Object.entries(map.parts))for(const m of mats[name]){
    if(info.matClass==='alu'){m.bumpMap=brush;m.bumpScale=.035;m.roughness=.52;m.metalness=.75;m.envMapIntensity=.65;}
    if(info.matClass==='acrylic'){m.transparent=true;m.opacity=name==='case_bottom'?.6:.82;m.depthWrite=false;m.roughness=.3;}
  }
  const rows=groupKeycaps(map),w=new THREE.Vector3();root.updateMatrixWorld(true);
  for(const [name,info] of Object.entries(map.parts))if(info.matClass==='keycap'){
    const [cx,cz]=matchLegend(rows,name,info.center);
    pivots[name].traverse(o=>{if(o.isMesh){o.geometry=o.geometry.clone();const p=o.geometry.attributes.position,uv=new Float32Array(p.count*2);
      for(let i=0;i<p.count;i++){w.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);uv[i*2]=(cx+(w.x-info.center[0])*LEGEND_SCALE)/3000;uv[i*2+1]=(cz+(w.z-info.center[2])*LEGEND_SCALE)/2122;}
      o.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));}});
    for(const m of mats[name]){m.map=keys;m.color.setHex(0xffffff);}
  }
  const kimi=createKimiScreen();kimi.anisotropy=8;
  const bootCanvas=document.createElement('canvas');bootCanvas.width=1280;bootCanvas.height=800;
  const ctx=bootCanvas.getContext('2d');ctx.fillStyle='#0b0d0e';ctx.fillRect(0,0,1280,800);ctx.fillStyle='#f7f8fa';ctx.font='600 104px -apple-system, sans-serif';ctx.textAlign='center';ctx.fillText('K',640,407);ctx.fillStyle='#7c8686';ctx.font='22px -apple-system, sans-serif';ctx.fillText('正在启动',640,484);
  const boot=new THREE.CanvasTexture(bootCanvas);boot.colorSpace=THREE.SRGBColorSpace;boot.flipY=false;
  const pm=mats.display_panel[0],om=mats.oled_screen[0];
  Object.assign(pm,{roughness:1,metalness:0,envMapIntensity:0,toneMapped:false});
  om.map=om.emissiveMap=oled;om.toneMapped=false;om.roughness=1;om.metalness=0;
  function power(stage,brightness){
    const tex=stage==='kimi'?kimi:boot;if(pm.map!==tex){pm.map=pm.emissiveMap=tex;pm.needsUpdate=true;}
    pm.color.setHex(0x010101);pm.emissive.setHex(0xffffff);pm.emissiveIntensity=brightness;
    om.color.setHex(0x010101);om.emissive.setHex(0xffffff);om.emissiveIntensity=brightness*.8;
  }
  power('off',0);draco.dispose();return {root,pivots,mats,map,power};
}
