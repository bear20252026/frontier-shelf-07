import * as THREE from 'three';
// A local homepage illustration: no external page or network request.
export function createKimiScreen() {
 const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=900;
 const c=canvas.getContext('2d');
 const rounded=(x,y,w,h,r,fill,stroke)=>{c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=1.5;c.stroke();}};
 const text=(s,x,y,size=22,color='#dce0e5',weight=400)=>{c.fillStyle=color;c.font=`${weight} ${size}px -apple-system, "PingFang SC", sans-serif`;c.fillText(s,x,y);};
 c.fillStyle='#111214';c.fillRect(0,0,1600,900);rounded(12,12,1576,876,20,null,'#303136');
 rounded(34,30,30,29,6,null,'#b7bdc7');c.fillStyle='#b7bdc7';c.fillRect(44,31,2,27);
 rounded(1347,29,75,38,12,'#202125');text('登录',1362,55,20);rounded(1435,29,122,38,12,'#e6e7e9');text('下载客户端',1447,55,18,'#17191c',500);
 c.textAlign='center';text('KIMI',800,312,94,'#f0f1f4',650);rounded(317,359,966,172,32,'#202124','#494b50');
 c.textAlign='left';text('尽管问，或做个 Agent 任务...',343,403,25,'#91959e');text('+',343,501,31,'#b4b8c1',300);text('快速  进阶⌄',1102,500,20,'#aeb2bb');
 c.beginPath();c.arc(1240,491,23,0,Math.PI*2);c.fillStyle='#35383d';c.fill();c.textAlign='center';text('↑',1240,500,27,'#989da6');
 const labels=['PPT','集群','深度研究','文档','网站','表格','设计'],widths=[86,86,127,86,86,86,86],gap=15;let x=(1600-widths.reduce((a,b)=>a+b)-gap*6)/2;
 labels.forEach((s,i)=>{rounded(x,572,widths[i],44,22,null,'#303238');text(s,x+widths[i]/2,601,19,'#a1a6b0');x+=widths[i]+gap;});
 text('探索灵感',800,818,19,'#636b76');const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;texture.anisotropy=4;texture.userData={label:'Kimi 模拟主页',local:true};return texture;
}
