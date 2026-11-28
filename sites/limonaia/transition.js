import * as THREE from 'three';

// A scroll-scrubbed, centre-out burn. Both scenes remain live behind the edge.
export function createChapterTransition(renderer) {
  let first=new THREE.FramebufferTexture(1,1),second=new THREE.FramebufferTexture(1,1);
  const uniforms={uFirst:{value:first},uSecond:{value:second},
    uProgress:{value:0},uAspect:{value:1},uReduced:{value:0}};
  const material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms,
    vertexShader:`varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader:`
      varying vec2 vUv;
      uniform sampler2D uFirst,uSecond;
      uniform float uProgress,uAspect,uReduced;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
      float fbm(vec2 p){float n=0.,a=.5;for(int i=0;i<5;i++){n+=noise(p)*a;p=p*2.07+13.1;a*=.49;}return n;}
      void main(){
        vec2 uv=vUv,q=(uv-.5)*vec2(uAspect,1.);
        vec3 a=texture2D(uFirst,uv).rgb,b=texture2D(uSecond,uv).rgb;
        float maxRadius=length(vec2(uAspect,1.))*.5;
        float field=length(q)+(fbm(q*5.2)-.5)*.22+(noise(q*53.)-.5)*.035;
        float radius=mix(-.25,maxRadius+.35,uProgress);
        float edge=field-radius;
        float reveal=1.-smoothstep(-.016,.016,edge);
        float band=1.-smoothstep(.014,.10,abs(edge));
        float ember=pow(1.-smoothstep(.0,.043,abs(edge)),2.);
        float grain=step(.91,hash(floor(uv*vec2(1400.,1000.))))*band;
        float burnStrength=smoothstep(0.,.06,uProgress)*(1.-smoothstep(.94,1.,uProgress));
        vec3 ash=mix(a,vec3(dot(a,vec3(.2126,.7152,.0722))),band*.55*burnStrength);
        vec3 color=mix(ash,b,reveal);
        color+=vec3(1.,.86,.60)*(ember*1.9+grain*1.4+band*.13)*burnStrength;
        if(uReduced>.5)color=mix(a,b,uProgress);
        gl_FragColor=vec4(color,1.);
      }`});
  const scene=new THREE.Scene();scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));
  const camera=new THREE.Camera();
  return {captureFirst(){renderer.copyFramebufferToTexture(first);},captureSecond(){renderer.copyFramebufferToTexture(second);},resize(width,height){
    const dpr=renderer.getPixelRatio();first.dispose();second.dispose();
    first=new THREE.FramebufferTexture(Math.floor(width*dpr),Math.floor(height*dpr));second=new THREE.FramebufferTexture(Math.floor(width*dpr),Math.floor(height*dpr));
    uniforms.uFirst.value=first;uniforms.uSecond.value=second;
    uniforms.uAspect.value=width/height;
  },render(progress,reduced){
    uniforms.uProgress.value=progress;uniforms.uReduced.value=reduced?1:0;
    renderer.clear();renderer.render(scene,camera);
  }};
}
