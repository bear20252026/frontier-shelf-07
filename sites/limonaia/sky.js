import * as THREE from 'three';

// An atmospheric sky rendered on the GPU. Different cloud layers drift at
// different speeds, so the backdrop never behaves like a sliding photograph.
export function createSky() {
  const material = new THREE.ShaderMaterial({
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uFallOffset: { value: 0 },
      uPointer: { value: new THREE.Vector2() },
    },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uAspect;
      uniform float uFallOffset;
      uniform vec2 uPointer;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        // Wrap the lattice so hash arguments stay small forever: the cloud
        // field becomes a statistically uniform periodic tile that precision
        // can never kill, no matter how long the updraft runs.
        vec2 i=mod(floor(p),vec2(32.0)), f=fract(p);
        vec2 j=mod(i+1.0,vec2(32.0));
        vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(vec2(j.x,i.y)),u.x),
                   mix(hash(vec2(i.x,j.y)),hash(j),u.x),u.y);
      }
      float fbm(vec2 p) {
        float value=0.0, amplitude=0.5;
        mat2 turn=mat2(0.8,-0.6,0.6,0.8);
        for(int i=0;i<6;i++) {
          value+=noise(p)*amplitude;
          p=turn*p*2.03+vec2(13.1,7.7);
          amplitude*=0.49;
        }
        return value;
      }
      float cloud(vec2 p, float time) {
        // Internal currents reshape the cloud independently of its drift.
        // Slow, continuous warping keeps the edges from boiling or flickering.
        vec2 curl=vec2(sin(p.y*1.15+time*0.085),
                       cos(p.x*0.9-time*0.065))*0.10;
        float billow=fbm(p*0.7+vec2(time*0.012,-time*0.009));
        return fbm(p+billow*2.2+curl);
      }
      void main() {
        vec2 uv=vUv;
        vec2 p=vec2((uv.x-0.5)*uAspect,uv.y);
        // The sky reacts less than the foreground models, which turns pointer
        // movement into a restrained depth cue instead of a flat pan.
        p+=uPointer*vec2(0.10,0.055);
        vec3 sky=mix(vec3(0.80,0.89,0.90),vec3(0.48,0.72,0.80),pow(uv.y,0.65));
        float sun=exp(-length((p-vec2(-0.56,0.92))*vec2(0.65,1.0))*2.3);
        sky+=vec3(0.20,0.15,0.06)*sun;

        // Integrated gusts gently accelerate the wind without reversing it.
        // Foreground banks travel faster than the distant, lower cloud layer.
        float wind=uTime*0.057+sin(uTime*0.22)*0.085
                   +sin(uTime*0.39)*0.035;
        vec2 c=p*vec2(2.5,3.3)+vec2(12.7-wind,
          3.2+sin(uTime*0.11)*0.035-uFallOffset*3.3);
        float n=cloud(c,uTime);
        float shape=0.49+0.045*sin((p.x-wind/2.5)*2.1+0.4)+uv.y*0.028;
        float density=smoothstep(shape-0.055,shape+0.12,n);
        float shadow=cloud(c+vec2(-0.065,0.10),uTime);
        float light=clamp(0.62+(n-shadow)*4.0,0.2,1.0);
        vec3 white=mix(vec3(0.70,0.80,0.82),vec3(1.0,0.98,0.90),light);
        sky=mix(sky,white,density*0.87);

        vec2 farP=(p-uPointer*vec2(0.055,0.03))*vec2(1.9,4.2)+vec2(-23.0-wind*0.40,
          8.0+sin(uTime*0.07)*0.020-uFallOffset*2.1);
        float farBillow=fbm(farP+vec2(uTime*0.005,-uTime*0.004));
        float farCloud=fbm(farP+farBillow*1.5);
        float farDensity=smoothstep(0.48,0.69,farCloud)*(1.0-smoothstep(0.28,0.88,uv.y));
        sky=mix(sky,vec3(0.95,0.95,0.90),farDensity*0.6);

        // A tiny amount of film grain keeps the soft light tactile.
        float grain=(hash(gl_FragCoord.xy)-0.5)/255.0;
        float vignette=smoothstep(0.35,1.25,length((uv-0.5)*vec2(1.0,0.83)));
        sky=sky*(1.0-vignette*0.075)+grain;
        gl_FragColor=vec4(sky,1.0);
      }`,
  });
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { scene, camera: new THREE.Camera(), uniforms: material.uniforms };
}
