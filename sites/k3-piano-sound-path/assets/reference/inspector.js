// One readable name per selectable item; no sea of labels over the photograph.
export function createInspector({names,notes,onSelect,onClose}){
 const $=id=>document.getElementById(id),byId=new Map(names.items.map(d=>[d.id,d])),systems=new Map(notes.definitions.map(d=>[d.key,d]));
 let query='',system='',current=null;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 for(const s of notes.definitions){const option=el('option',s.title);option.value=s.key;$('systemFilter').append(option);}
 function renderList(){
  const q=query.trim().toLowerCase(),matches=names.items.filter(d=>(!system||d.system===system)&&(!q||[d.id,d.label,d.description,systems.get(d.system)?.title].join(' ').toLowerCase().includes(q)));
  $('catalogCount').textContent=`${matches.length} / ${names.count} modeled units`;$('catalogList').replaceChildren();
  if(!matches.length){$('catalogList').append(el('p','No matches. Try "soundboard", "damper", or an ID.','empty'));return;}
  for(const s of notes.definitions){
   const list=matches.filter(d=>d.system===s.key);if(!list.length)continue;
   const block=document.createElement('details');block.open=!!q||!!system;
   const title=el('summary',s.title+' · '+list.length);block.append(title,el('p',s.summary,'system-note'));
   for(const d of list){
    const b=el('button',d.label,'catalog-item');b.type='button';b.dataset.itemId=d.id;
    b.setAttribute('aria-label',d.label+' — locate part');if(d.id===current)b.classList.add('active');
    b.append(el('small',d.id));b.onclick=()=>{current=d.id;onSelect(d.id);$('catalogList').querySelectorAll('[data-item-id]').forEach(x=>x.classList.toggle('active',x.dataset.itemId===d.id));if(innerWidth<=680)toggle(false);};
    block.append(b);
   }
   $('catalogList').append(block);
  }
 }
 function toggle(open){$('catalog').hidden=!open;$('partsToggle').setAttribute('aria-expanded',String(open));$('partsToggle').classList.toggle('active',open);if(open){renderList();$('partSearch').focus({preventScroll:true});}}
 $('partsToggle').onclick=()=>toggle($('catalog').hidden);$('catalogClose').onclick=()=>toggle(false);
 $('partSearch').oninput=e=>{query=e.target.value;renderList();};$('systemFilter').onchange=e=>{system=e.target.value;renderList();};
 function show(id,locked=false){
  current=locked?id:null;const target=$('part'),d=byId.get(id);target.replaceChildren();target.classList.toggle('inspecting',!!d);
  if(!d){target.append(el('span','Click a part to see its name and role · or browse the catalog'));return;}
  const s=systems.get(d.system),heading=el('div',null,'part-heading');
  heading.append(el('small',s?.title||'Part notes'));
  if(locked){const close=el('button','×','part-close');close.setAttribute('aria-label','Clear part selection');close.onclick=onClose;heading.append(close);}
  target.append(heading,el('strong',d.label),el('p',d.description,'part-description'));
  if(s){target.append(el('p',s.detail,'part-context'));}
  const meta=el('div',null,'part-meta');meta.append(el('span',d.id));
  if(d.identification==='visual')meta.append(el('span','Named by visible shape · role unconfirmed'));
  target.append(meta);
  if(s?.sourceURL){const link=el('a','Learn about this system ↗');link.href=s.sourceURL;link.target='_blank';link.rel='noopener noreferrer';link.className='part-source';target.append(link);}
 }
 function reset(){query='';system='';$('partSearch').value='';$('systemFilter').value='';current=null;toggle(false);show(null);}
 return {show,reset,byId,systems,toggle};
}
