// Original editorial copy. This is a structural demonstration, not a solved
// piano-action or acoustic simulation. Keep object identities outside copy.
export const COPY={
 en:{
  chapters:[
   {label:'Piano',title:'From touch to sound.',description:'A small movement becomes room-filling sound. Open the piano to follow the parts that make it possible.',parts:['Keys','Action','Strings','Soundboard']},
   {label:'Section',title:'Inside the piano.',description:'A cut from keyboard to tail reveals the layers within. Each has a different role in the path from touch to sound.',parts:['Structure','Motion','Resonance']},
   {label:'Keys',title:'A longer lever.',description:'Each key extends deep into the piano. Pressing its front lifts the rear, passing motion to the action.',parts:['Key lever','Balance point','Key frame']},
   {label:'Action',title:'Motion becomes a strike.',description:'The action transfers key movement to a felt hammer. In play, the hammer strikes and leaves the string free to vibrate.',parts:['Wippen','Hammer shank','Felt hammer']},
   {label:'Strings',title:'Tension, held in balance.',description:'Strings vibrate after a hammer strike. The cast-iron plate carries their tension; the bridges pass their vibration to the soundboard.',parts:['Strings','Cast-iron plate','Bridges']},
   {label:'Soundboard',title:'Sound into the room.',description:'Wooden bridges carry string vibration into the broad soundboard. Its moving surface couples that vibration to the surrounding air.',parts:['Bridges','Soundboard','Ribs']},
   {label:'Dampers',title:'When a note ends.',description:'Felt dampers stop string vibration as a key is released. The right pedal lifts the dampers, allowing notes to continue ringing.',parts:['Damper felt','Damper mechanism','Sustain pedal']},
   {label:'All parts',title:'Every part, in place.',description:'Every part takes its place in a wider arrangement. Drag back to follow the parts into a complete piano.',parts:['Complete inventory','Reversible assembly']}
  ],
  ui:{
   pageTitle:'KIMI · From Touch to Sound',headerTitle:'From touch to sound',homeLabel:'Return to the opening piano',inspectLabel:'Explore freely',
   narrativeLabel:'Current piano layer',chapterNavLabel:'Choose a piano layer',chapterAria:'Chapter {number}: {label}',sliderLabel:'Piano disassembly progress',controlsLabel:'Continuous piano disassembly',
   loading:'Opening the piano',studyNote:'Structural study · Not a service procedure',languageToggle:'EN',languageToggleLabel:'English',iframeTitle:'Piano section and sound-producing systems',
   start:'Explore',continue:'Continue',pause:'Pause',replay:'Replay',startAria:'Start the piano disassembly',continueAria:'Continue the piano disassembly',pauseAria:'Pause playback',replayAria:'Replay from the beginning',pauseReturnAria:'Pause the return to the opening',returning:'Returning to the opening',
   prev:'Reassemble one layer',next:'Open the next layer',versionError:'The model resources are out of sync. Please refresh.',loadTimeout:'The model is taking too long to load. Please refresh or explore freely.',renderError:'The piano could not be displayed. Please refresh and try again.',renderLogLabel:'Piano presentation failed',
   partLabels:{keyboard:'Keys · Transfer motion',action:'Action · Drive the hammers',plate:'Cast-iron plate · Carry tension',strings:'Strings · Produce vibration',bridges:'Bridges · Transfer vibration',soundboard:'Soundboard · Move air',damper:'Dampers · Control sustain',pedals:'Right pedal · Sustain'}
  }
 },
 zh:{
  chapters:[
   {label:'Piano',title:'From touch to sound.',description:'How does a small motion become a tone that fills the room? Open the piano and follow the keys, action, strings, and soundboard.',parts:['Keys','Action','Strings','Soundboard']},
   {label:'Section',title:'Inside the piano.',description:'A lengthwise cut from keyboard to tail reveals the inner layers, each with its own role along the path from touch to sound.',parts:['Support','Transfer','Resonance']},
   {label:'Keys',title:'A long lever.',description:'The key reaches deep into the piano as a long wooden lever. Press the front, and the rear rises past the balance point, sending motion into the action.',parts:['Key lever','Balance point','Key frame']},
   {label:'Action',title:'Motion, passed to the hammer.',description:'The action passes key motion to the felt-covered hammer. In real playing, the hammer leaves the string immediately after striking, letting it vibrate freely.',parts:['Wippen','Hammer shank','Felt hammer']},
   {label:'Strings',title:'Strings and their support.',description:'Struck strings vibrate while the cast-iron plate carries the tension of the entire set. The bridges pass the vibration on to the soundboard below.',parts:['Strings','Cast-iron plate','Bridges']},
   {label:'Soundboard',title:'Sound, into the room.',description:'Wooden bridges carry the vibration of thin strings into the broad soundboard. The soundboard moves the air around it, sending the tone into the room.',parts:['Bridges','Soundboard','Ribs']},
   {label:'Dampers',title:'When the sustain ends.',description:'When a key is released, the damper felt settles back onto the string and stops its vibration. The right sustain pedal holds the dampers up, letting the tone continue.',parts:['Damper felt','Damper mechanism','Sustain pedal']},
   {label:'All parts',title:'Every part, in place.',description:'Every part is laid back out across the wide frame. Drag the slider back to see how each group comes together into a piano.',parts:['Complete inventory','Continuous assembly']}
  ],
  ui:{
   pageTitle:'KIMI · From Touch to Sound',headerTitle:'From touch to sound',homeLabel:'Return to the opening piano',inspectLabel:'Explore freely',
   narrativeLabel:'Current piano layer',chapterNavLabel:'Choose a piano layer',chapterAria:'Chapter {number}: {label}',sliderLabel:'Piano disassembly progress',controlsLabel:'Continuous piano disassembly',
   loading:'Opening the piano',studyNote:'Structural study · Not a service procedure',languageToggle:'EN',languageToggleLabel:'English',iframeTitle:'Piano section and sound-producing systems',
   start:'Explore',continue:'Continue',pause:'Pause',replay:'Replay',startAria:'Start the piano disassembly',continueAria:'Continue the piano disassembly',pauseAria:'Pause playback',replayAria:'Replay from the beginning',pauseReturnAria:'Pause the return to the opening',returning:'Returning to the opening',
   prev:'Reassemble one layer',next:'Open the next layer',versionError:'The model resources are out of sync. Please refresh.',loadTimeout:'The model is taking too long to load. Please refresh or explore freely.',renderError:'The piano could not be displayed. Please refresh and try again.',renderLogLabel:'Piano presentation failed',
   partLabels:{keyboard:'Keys · Transfer motion',action:'Action · Drive the hammers',plate:'Cast-iron plate · Carry tension',strings:'Strings · Produce vibration',bridges:'Bridges · Transfer vibration',soundboard:'Soundboard · Move air',damper:'Dampers · Control sustain',pedals:'Right pedal · Sustain'}
  }
 }
};

/** Update static copy without changing progress, playback, controls or IDs.
 * Dynamic play/pause and return-state wording remain the controller's job.
 * @returns {'en'|'zh'} The normalized language key.
 */
export function applyLanguage(document,lang='en'){
 const language=String(lang).toLowerCase().startsWith('zh')?'zh':'en';
 const{chapters,ui}=COPY[language],byId=id=>document.getElementById(id);
 const find=(id,selector)=>byId(id)||(selector?document.querySelector(selector):null);
 const put=(element,text)=>{if(element)element.textContent=text;};
 const label=(element,text)=>{if(element)element.setAttribute('aria-label',text);};
 document.documentElement.lang=language==='zh'?'zh-CN':'en';document.title=ui.pageTitle;
 const buttons=[...document.querySelectorAll('#chapters button')];
 for(const button of buttons){
  const index=Number(button.dataset.chapter),chapter=chapters[index];if(!chapter)continue;
  button.dataset.title=chapter.title;button.dataset.description=chapter.description;button.dataset.parts=JSON.stringify(chapter.parts);
  put(button.querySelector('.chapter-label'),chapter.label);
  label(button,ui.chapterAria.replace('{number}',String(index)).replace('{label}',chapter.label));
 }
 put(find('headerTitle','.wordmark > span:last-child'),ui.headerTitle);
 label(document.querySelector('.wordmark'),ui.homeLabel);
 put(find('inspectLink','.inspect-link'),ui.inspectLabel+' ↗');
 label(document.querySelector('.narrative'),ui.narrativeLabel);
 label(byId('chapters'),ui.chapterNavLabel);label(byId('chapterSlider'),ui.sliderLabel);
 label(document.querySelector('.scrubber'),ui.controlsLabel);
 put(find('studyNote','.study-note'),ui.studyNote);
 put(byId('languageToggle'),ui.languageToggle);label(byId('languageToggle'),ui.languageToggleLabel);
 byId('scene')?.setAttribute('title',ui.iframeTitle);
 for(const id of['prev','next']){put(byId(id),ui[id]);label(byId(id),ui[id]);}
 const loading=byId('loading'),loadingText=find('loadingText','#loading > span:last-child');
 if(loadingText)put(loadingText,ui.loading);else if(loading&&!loading.hidden)put(loading,ui.loading);
 const progress=Number(byId('chapterSlider')?.value),active=buttons.find(b=>b.getAttribute('aria-current')==='step');
 const index=Number.isFinite(progress)?Math.max(0,Math.min(7,Math.round(progress))):Number(active?.dataset.chapter)||0;
 put(byId('chapterTitle'),chapters[index].title);put(byId('chapterDescription'),chapters[index].description);
 if(byId('chapterSlider'))byId('chapterSlider').setAttribute('aria-valuetext',String(index+1)+' / 8 · '+chapters[index].title);
 return language;
}
