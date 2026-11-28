import * as THREE from 'three';

const windGLSL=`
  attribute vec3 wind;
  uniform vec4 uRootRotation;
  uniform vec3 uLeafAxis;
  uniform vec3 uLeafNormal;
  uniform vec3 uLeafSide;
  uniform float uLeafLength;
  uniform float uLeafBend;
  uniform float uLeafFlutter;
  uniform float uLeafStrength;
  uniform float uLeafLift;
  vec3 leafDisplacement(vec3 p) {
    float along=clamp(dot(p,uLeafAxis)/uLeafLength,0.0,1.0);
    float across=dot(p,uLeafSide)/uLeafLength;
    float edge=smoothstep(0.015,0.22,abs(across));
    vec3 rotated=p+2.0*cross(uRootRotation.xyz,
      cross(uRootRotation.xyz,p)+uRootRotation.w*p);
    float flex=uLeafBend*along*along;
    float flutter=uLeafFlutter*edge*along*along*sin(across*13.0+along*4.0);
    vec3 airflow=vec3(0.0,uLeafLift*along*along*uLeafLength,0.0);
    return (rotated-p+uLeafNormal*(flex+flutter)*uLeafLength+airflow)*wind.x*uLeafStrength;
  }
`;

function addWind(material,uniforms,withNormals=false) {
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>',`#include <common>\n${windGLSL}`)
      .replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed+=leafDisplacement(position);');
    if(withNormals) shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`
      #include <beginnormal_vertex>
      vec3 axis=abs(objectNormal.y)<0.9?vec3(0,1,0):vec3(1,0,0);
      vec3 tangent=normalize(cross(axis,objectNormal));
      vec3 bitangent=cross(objectNormal,tangent);
      vec3 offset=leafDisplacement(position);
      vec3 dt=tangent+(leafDisplacement(position+tangent*0.001)-offset)/0.001;
      vec3 db=bitangent+(leafDisplacement(position+bitangent*0.001)-offset)/0.001;
      objectNormal=normalize(cross(dt,db));
    `);
  };
  material.customProgramCacheKey=()=>`rooted-leaf-wind-v3-${withNormals}`;
}

export function createLeafMotion(mesh,shared) {
  const rig=mesh.userData.leafRig;
  const axis=new THREE.Vector3().fromArray(rig.axis).normalize();
  const normal=new THREE.Vector3().fromArray(rig.normal).normalize();
  const side=new THREE.Vector3().crossVectors(axis,normal).normalize();
  const rotation=new THREE.Quaternion(),twist=new THREE.Quaternion(),yaw=new THREE.Quaternion();
  const uniforms={...shared,uRootRotation:{value:rotation},uLeafAxis:{value:axis},
    uLeafNormal:{value:normal},uLeafSide:{value:side},uLeafLength:{value:rig.length},
    uLeafBend:{value:0},uLeafFlutter:{value:0},uLeafLift:{value:0}};
  const mask=mesh.geometry.getAttribute('color');
  if(!mask)throw new Error('Missing leaf attachment weights.');
  mesh.geometry.setAttribute('wind',mask);mesh.geometry.deleteAttribute('color');
  // Each blade gets its own uniforms, while sharing the original PBR textures.
  mesh.material=mesh.material.clone();mesh.material.vertexColors=false;
  addWind(mesh.material,uniforms,true);
  mesh.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});
  addWind(mesh.customDepthMaterial,uniforms);
  const frequency=0.82+rig.index*0.057;
  const compliance=THREE.MathUtils.clamp(0.27/rig.length,0.8,1.25);
  return {mesh,uniforms,update(time,reduced,fall=0){
    uniforms.uLeafLift.value=reduced?0:fall*(.085+Math.sin(time*4.1+rig.phase)*.015);
    if(reduced){rotation.identity();uniforms.uLeafBend.value=0;uniforms.uLeafFlutter.value=0;return;}
    const phase=rig.phase;
    // Shared wind has delayed, differently tuned responses in each petiole.
    const gust=0.76+0.18*Math.sin(time*0.17-phase*0.035)+0.06*Math.sin(time*0.31);
    const swing=(Math.sin(time*frequency+phase)*0.075+Math.sin(time*1.67+phase*0.7)*0.018+fall*Math.sin(time*3.9+phase)*.025)*gust*compliance;
    rotation.setFromAxisAngle(side,swing);
    twist.setFromAxisAngle(axis,Math.sin(time*1.21+phase+0.8)*0.055*gust);
    yaw.setFromAxisAngle(normal,Math.sin(time*0.69+phase-0.4)*0.038*gust);
    rotation.multiply(twist).multiply(yaw);
    uniforms.uLeafBend.value=Math.sin(time*frequency+phase-0.65)*0.032*gust;
    uniforms.uLeafFlutter.value=(Math.sin(time*3.6+phase)*0.010+Math.sin(time*5.1+phase*1.4)*0.003)*gust+fall*(Math.sin(time*8.3+phase)*.012+Math.sin(time*11.7+phase*.8)*.004);
  }};
}
