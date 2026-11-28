// Explicit QA surface: exercises the same controls as the viewer and reports failures visibly.
export function mountRefineChecks(){
 const panel=document.createElement('section');panel.id='qa';panel.style='position:fixed;right:12px;top:85px;z-index:100;background:#15201f;color:#e8fff6;padding:12px;max-width:600px;max-height:65vh;overflow:auto;font:12px monospace;border:1px solid #6a9d86';
 panel.innerHTML='<button id="runChecks">运行回归检查</button><pre id="qaResults">待检查</pre>';document.body.append(panel);
 document.getElementById('runChecks').onclick=async()=>{
  const output=document.getElementById('qaResults'),a=window.__app,T=window.__THREE,report={};output.textContent='检查中…';
  await new Promise(r=>setTimeout(r,50));
  try{
   a.switchView('whole');report.staged=window.runAssemblyChecks();
   const cropped=[];
   for(let i=0;i<=48;i++){
    if(i%4===0)await new Promise(r=>requestAnimationFrame(r));
    const t=i*.2;a.assembly.setT(t);a.scene.updateMatrixWorld(true);a.camera.updateMatrixWorld(true);
    for(const [name,p] of Object.entries(a.pivots)){
     if(a.parts_map.parts[name].dynamicCable)continue;
     const box=new T.Box3().setFromObject(p);
     for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
      const v=new T.Vector3(x,y,z).project(a.camera);
      if(Math.abs(v.x)>.99||Math.abs(v.y)>.99||v.z>1||v.z< -1){cropped.push({t,name,ndc:v.toArray()});break;}
     }
    }
   }
   report.framing={samples:49,rigidParts:Object.keys(a.explosionPlan).length,viewport:[a.renderer.domElement.clientWidth,a.renderer.domElement.clientHeight],cropped:cropped.slice(0,5),pass:cropped.length===0};
   if(cropped.length)throw Error('动画取景越界');
   a.assembly.setT(9.6);const position=a.camera.position.clone(),target=a.controls.target.clone();a.assembly.stop();
   report.finish={cameraJump:position.distanceTo(a.camera.position),targetJump:target.distanceTo(a.controls.target)};
   if(report.finish.cameraJump>.001||report.finish.targetJump>.001)throw Error('动画结束镜头跳变');
   a.assembly.setT(1);document.getElementById('play').click();await new Promise(r=>setTimeout(r,350));document.getElementById('play').click();const t=a.assembly.t;
   if(t<=1)throw Error('播放没有推进');await new Promise(r=>setTimeout(r,200));if(a.assembly.t!==t)throw Error('暂停后仍在推进');
   const slider=document.getElementById('timeline');slider.value=4.2;slider.dispatchEvent(new Event('input'));
   if(Math.abs(a.assembly.t-4.2)>.001||a.assembly.playing)throw Error('拖动进度失败');
   while(a.state.speed!==1)document.getElementById('speed').click();document.getElementById('speed').click();if(a.state.speed!==2)throw Error('倍速按钮状态错误');
   report.playback={pass:true,pause:true,scrub:true,speed:a.state.speed};a.assembly.stop();a.switchView('screen');
   const texture=a.mats.display_panel[0].map;
   if(texture.userData.label!=='Kimi 模拟主页'||!a.state.power)throw Error('开机主页错误');
   document.getElementById('power').click();if(a.state.power||a.emissiveOf('display_panel').i!==0)throw Error('关机失败');
   document.getElementById('power').click();report.power={pass:true,texture:texture.userData.label};
   const footer=document.querySelector('footer'),rect=footer?.getBoundingClientRect();
   report.layout={pageWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,pass:document.documentElement.scrollWidth<=document.documentElement.clientWidth};
   if(!report.layout.pass)throw Error('页面横向溢出');
   report.pass=true;
  }catch(e){report.pass=false;report.error=e.stack||String(e);}
  output.textContent=JSON.stringify(report,null,2);panel.dataset.result=report.pass?'pass':'fail';
 };
}
