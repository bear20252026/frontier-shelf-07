// Drag distance sets an unrestricted yaw, with a restrained vertical tilt.
// Keeping the unwrapped angle avoids a snap when crossing a full revolution.
export function createAppleOrbit() {
  let targetYaw=0,targetPitch=0;
  const rotation={yaw:0,pitch:0};
  return {
    rotation,
    drag(dx,dy,width,height,tilt=true) {
      targetYaw+=dx/Math.max(width,1)*Math.PI*2;
      if(tilt)targetPitch=Math.max(-.45,Math.min(.45,targetPitch+dy/Math.max(height,1)*2));
    },
    update(dt,reduced=false) {
      const blend=reduced?1:1-Math.exp(-Math.max(dt,0)*13);
      rotation.yaw+=(targetYaw-rotation.yaw)*blend;
      rotation.pitch+=(targetPitch-rotation.pitch)*blend;
      return rotation;
    },
  };
}
