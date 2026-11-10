import {one,all,store,remove} from './storage.js';
import {stages,sectionFor,isVisible,expandedVisible,expand,calculate,audit,buildPrompt,slugOptions} from './logic.js';

const $=selector=>document.querySelector(selector);
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const root=$('#root');
const state={view:'home',online:false,logged:false,config:null,remote:[],current:null,step:0,
  photoList:[],syncing:false,conflict:false,promptShown:false,configDraft:null,configSection:'base',
  updateAvailable:false,toastTimer:0,refreshing:false};
const photoUrls=[];
let workerRegistration=null;
let autosaveTimer=null,syncTimer=null;
const icons={plus:'＋',back:'←',next:'→',camera:'◉',cloud:'↻'};

async function api(path,options={}) {
  const response=await fetch('/api'+path,{credentials:'same-origin',cache:'no-store',...options});
  let data;
  const type=response.headers.get('content-type')||'';
  try {data=type.includes('json')?await response.json():await response.text();}catch {data={};}
  if(!response.ok){const ex=new Error(data.detail||`HTTP ${response.status}`);ex.status=response.status;throw ex;}
  return data;
}
function toast(text){const dest=$('#toast');dest.innerHTML=`<div>${esc(text)}</div>`;clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>dest.innerHTML='',3600);}
function download(filename,content,type='text/plain;charset=utf-8'){
  const blob=content instanceof Blob?content:new Blob([content],{type});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function outputName(extension){return `GE360_${(state.current?.answers['cliente.nome']||'SOPRALLUOGO').replaceAll(/[^a-zA-Z0-9_-]/g,'_').slice(0,35)}_${new Date().toISOString().slice(0,10)}.${extension}`;}
function formatNum(value){return value===null||value===undefined?'—':Number(value).toLocaleString('it-IT',{maximumFractionDigits:2});}
function currentConfig(){return state.current?.form_snapshot||state.config;}
function currentAudit(){const s=state.current;return s?audit(s.form_snapshot,s.answers,s.counts):null;}
function photosForCurrent(){const id=state.current?.id;return state.photoList.filter(p=>p.survey_id===id);}
function defaultAnswers(){
  const d=new Date();const local=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
  return {'ambiente.nome':'Bagno principale','sopralluogo.data':local,'sopralluogo.stato':'in_corso',
    'interventi.demolizione_rivestimenti':'si','interventi.nuovo_pavimento':'si',
    'interventi.rivestimento_pareti':'si','geometria.forma':'rettangolare',
    'controllo.tipo_prezzo':'corpo','controllo.revisione_umana':'no',
    'geometria.muri[0].id':'M1','geometria.muri[1].id':'M2',
    'geometria.muri[2].id':'M3','geometria.muri[3].id':'M4',
    'demolizione.muri[0].demolisci':'si','demolizione.muri[1].demolisci':'si',
    'demolizione.muri[2].demolisci':'si','demolizione.muri[3].demolisci':'si'};
}
function localSurvey(){return {id:crypto.randomUUID(),version:0,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    answers:defaultAnswers(),counts:{walls:4,openings:{},excluded:{}},form_snapshot:structuredClone(state.config),dirty:true,photos:[]};}
async function getConfig(){
  if(state.online&&state.logged){
    try{state.config=await api('/config');await store('settings',{key:'config',value:state.config});return;}catch(e){console.warn(e);}
  }
  const saved=await one('settings','config');
  if(saved?.value){state.config=saved.value;return;}
  try{const response=await fetch('/default_checklist.json');if(response.ok)state.config=await response.json();}catch(e){console.warn(e);}
}
async function refreshSession(){
  try {const s=await api('/session');state.online=true;state.logged=Boolean(s.logged_in);return true;}
  catch(e){state.online=false;state.logged=false;return false;}
}
async function refreshRemote(){
  if(!state.logged)return;
  try{state.remote=await api('/surveys');}catch(e){state.remote=[];}
}
async function bootstrap(){
  await refreshSession();await getConfig();
  if(state.logged){await refreshRemote();await syncAllLocal();}
  render();
  registerWorker();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)recheckOnline();else if(state.current){clearTimeout(autosaveTimer);markDirty();}});
  window.addEventListener('online',()=>recheckOnline());
  window.addEventListener('offline',()=>{state.online=false;render();});
  setInterval(()=>{if(!document.hidden)recheckOnline();},30000);
}
async function recheckOnline(){
  const before=state.online;
  await refreshSession();
  if(state.online&&state.logged){await getConfig();await refreshRemote();await syncAllLocal();}
  if(before!==state.online)toast(state.online?'Connessione Debian ristabilita':'Modalità offline: salvataggio sul telefono');
  render();
}
async function login(password){
  try{await api('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
    state.logged=true;state.online=true;await getConfig();await refreshRemote();await syncAllLocal();render();toast('Accesso riuscito.');}
  catch(e){toast(e.message);}
}
async function logout(){
  try{await api('/logout',{method:'POST'});}catch{}
  state.logged=false;state.current=null;state.view='home';render();
}
async function localSurveys(){return (await all('surveys')).filter(s=>!s.archived).sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)));}
async function create(){
  if(!state.config){toast('Configurazione non disponibile: torna online almeno una volta.');return;}
  const s=localSurvey();await store('surveys',s);state.current=s;state.step=0;state.view='editor';state.conflict=false;state.photoList=await all('photos');render();await syncCurrent();
}
async function openSurvey(id){
  let local=await one('surveys',id);
  if(!local&&state.online&&state.logged){
    try{local=await api('/surveys/'+id);local.dirty=false;await store('surveys',local);}catch(e){toast(e.message);return;}
  }
  if(!local){toast('Sopralluogo disponibile solo quando torni online.');return;}
  // Se locale pulito e server disponibile, aggiorna da remoto.
  if(!local.dirty&&state.online&&state.logged){
    try{const server=await api('/surveys/'+id);if(server.version>=local.version){local={...server,dirty:false};await store('surveys',local);}}catch{}
  }
  state.current=local;state.step=0;state.view='editor';state.conflict=false;state.promptShown=false;
  await reloadPhotos();render();
}
async function reloadPhotos(){state.photoList=await all('photos');}
async function markDirty(){
  const s=state.current;if(!s)return;
  s.updated_at=new Date().toISOString();s.dirty=true;
  await store('surveys',structuredClone(s));
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>syncCurrent(),1100);
}
function queueSave(){clearTimeout(autosaveTimer);autosaveTimer=setTimeout(()=>markDirty(),240);}
async function syncCurrent(){
  const s=state.current;
  if(!s||state.syncing||!state.online||!state.logged||state.conflict)return;
  state.syncing=true;
  try {
    if(s.dirty){
      const snapshot={id:s.id,answers:structuredClone(s.answers),counts:structuredClone(s.counts)};
      const payload={...snapshot,expected_version:s.version};
      const latest=s.version===0
        ?await api('/surveys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
        :await api('/surveys/'+s.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      // Se durante la richiesta sono arrivate altre misure, non perderle.
      s.version=latest.version;s.dirty=JSON.stringify(s.answers)!==JSON.stringify(snapshot.answers)||JSON.stringify(s.counts)!==JSON.stringify(snapshot.counts);
      s.photos=latest.photos||s.photos||[];
      await store('surveys',structuredClone(s));
    }
    await syncPhotos(s.id);
  }catch(e){
    if(e.status===409){state.conflict=true;toast('Conflitto: copia locale preservata. Usa “Duplica”.');}
    else if(e.status===401){state.logged=false;toast('Sessione scaduta. Accedi per sincronizzare.');}
    else {state.online=false;toast('Debian non raggiungibile. Salvataggio locale disponibile.');}
  }finally{
    state.syncing=false;
    if(state.current?.id===s.id){
      const indicator=$('#save-indicator');if(indicator)indicator.textContent=state.conflict?'Conflitto':s.dirty?'Da sincronizzare':'Sincronizzato';
      if(s.dirty&&state.online&&state.logged&&!state.conflict)setTimeout(()=>syncCurrent(),1300);
    }
  }
}
async function syncPhotos(surveyId){
  if(!state.online||!state.logged||state.current?.version===0)return;
  const items=(await all('photos')).filter(p=>p.survey_id===surveyId&&!p.server_id);
  for(const p of items){
    try{
      const fd=new FormData();fd.append('question_key',p.question_key);fd.append('file',p.blob,p.name);
      const response=await api('/surveys/'+surveyId+'/photos',{method:'POST',body:fd});
      p.server_id=response.id;await store('photos',p);
    }catch(e){console.warn('Foto non sincronizzata',e);break;}
  }
  if(state.current?.id===surveyId)await reloadPhotos();
}
async function syncAllLocal(){
  if(!state.online||!state.logged)return;
  const locals=await localSurveys();
  for(const s of locals){
    if(s.dirty&&state.current?.id!==s.id){
      const old=state.current;state.current=s;
      await syncCurrent();state.current=old;
    }
  }
  if(state.current?.dirty)await syncCurrent();
}
async function duplicate(){
  if(!state.current)return;
  const src=state.current,s=structuredClone(src);
  s.id=crypto.randomUUID();s.version=0;s.created_at=new Date().toISOString();s.updated_at=s.created_at;s.dirty=true;s.photos=[];
  await store('surveys',s);state.current=s;state.conflict=false;render();await syncCurrent();toast('Creata copia indipendente.');
}
async function archive(){
  const s=state.current;if(!s||!window.confirm('Archiviare questo sopralluogo? Conserva prima un backup se necessario.'))return;
  if(s.version&&state.online&&state.logged){
    try{await api('/surveys/'+s.id,{method:'DELETE'});}catch(e){toast('Impossibile archiviare sul server: '+e.message);return;}
  }
  s.archived=true;await store('surveys',s);state.current=null;state.view='home';await refreshRemote();render();toast('Sopralluogo archiviato.');
}
async function attachPhotos(field,files){
  if(!state.current)return;
  for(const file of Array.from(files).slice(0,8)){
    if(!file.type.startsWith('image/')){toast('Selezionare file immagine.');continue;}
    if(file.size>8*1024*1024){toast('Foto troppo grande: massimo 8 MB.');continue;}
    await store('photos',{local_id:crypto.randomUUID(),survey_id:state.current.id,question_key:field,name:file.name,blob:file,created_at:new Date().toISOString(),server_id:null});
  }
  await reloadPhotos();await markDirty();render();if(state.online&&state.logged)syncCurrent();
}
async function removePhoto(localId){const p=await one('photos',localId);if(!p)return;
  if(p.server_id){toast('Foto già sincronizzata: resta nell’archivio. Per eliminarla serve l’azione amministrativa.');return;}
  await remove('photos',localId);await reloadPhotos();render();}
function setAnswer(name,value){if(!state.current)return;state.current.answers[name]=value;queueSave();}
function setCounts(type,w,delta){
  const s=state.current;if(!s)return;
  if(type==='walls'){
    const next=Math.max(0,Math.min(40,(s.counts.walls||0)+delta));
    if(delta<0&&next<s.counts.walls){
      const idx=next;for(const key of Object.keys(s.answers))if(key.includes(`muri[${idx}]`))delete s.answers[key];
      delete s.counts.openings[idx];delete s.counts.excluded[idx];
    } else if(delta>0){s.answers[`geometria.muri[${next-1}].id`]=`M${next}`;s.answers[`demolizione.muri[${next-1}].demolisci`]='si';}
    s.counts.walls=next;
  }else{
    const map=type==='openings'?'openings':'excluded';const cur=s.counts[map][w]||0,next=Math.max(0,Math.min(30,cur+delta));
    if(delta<0&&next<cur){const target=map==='openings'?'aperture':'zone_escluse';
      for(const key of Object.keys(s.answers))if(key.includes(`muri[${w}].${target}[${next}]`))delete s.answers[key];}
    s.counts[map][w]=next;
  }
  markDirty();render();
}
function photoGrid(field){
  const items=photosForCurrent().filter(p=>p.question_key===field);
  const remote=(state.current?.photos||[]).filter(p=>p.question_key===field&&!items.some(x=>x.server_id===p.id));
  let html='<div class="photos">';
  for(const item of items){
    const url=URL.createObjectURL(item.blob);photoUrls.push(url);
    html+=`<div class="photo"><img src="${url}" alt="Foto sopralluogo"><span>${esc(item.name)}</span>${!item.server_id?`<button class="btn sm ghost" data-action="remove-photo" data-id="${esc(item.local_id)}">Rimuovi</button>`:'<span>✓ salvata sul Debian</span>'}</div>`;
  }
  for(const p of remote)html+=`<div class="photo"><img src="/api/photos/${esc(p.id)}" alt="Foto archiviata"><span>${esc(p.original_name)}</span><span>✓ Debian</span></div>`;
  return html+'</div>';
}
function renderQuestion(q,key=q.id,label=null){
  if(!expandedVisible(q,state.current.answers,key,currentConfig()))return '';
  const val=state.current.answers[key]??'';
  const helper=q.help?`<div class="field-help">${esc(q.help)}</div>`:'';
  const required=q.required_when_visible?'<span class="required" title="Campo richiesto">✳</span>':'';
  let control='';
  if(q.type==='choice'){
    const options=q.options||[];
    if(options.length===3&&options.includes('si')&&options.includes('no')){
      control=`<div class="chips">${options.map(opt=>`<button type="button" class="choice ${val===opt?'selected':''}" data-action="choose" data-field="${esc(key)}" data-value="${esc(opt)}">${esc(slugOptions(opt))}</button>`).join('')}</div>`;
    } else control=`<select class="control" data-answer="${esc(key)}"><option value="">— Seleziona —</option>${options.map(opt=>`<option value="${esc(opt)}" ${val===opt?'selected':''}>${esc(slugOptions(opt))}</option>`).join('')}</select>`;
  }else if(q.type==='multitext')control=`<textarea rows="3" class="control" data-answer="${esc(key)}" placeholder="Appunti, condizioni, osservazioni…">${esc(val)}</textarea>`;
  else if(q.type==='photo') control=`<label class="photo-upload">📷 Scatta o aggiungi fotografia<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" data-photo="${esc(key)}"></label>${photoGrid(key)}`;
  else{
    const type=q.type==='date'?'date':q.type==='phone'?'tel':'text';
    const placeholder=q.type==='decimal'?'Esempio: 2,40':q.type==='integer'?'Numero':q.type==='phone'?'Telefono cliente':'Inserisci…';
    const mode=q.type==='decimal'?'decimal':q.type==='integer'?'numeric':'text';
    control=`<div class="row"><input type="${type}" class="control" data-answer="${esc(key)}" inputmode="${mode}" placeholder="${esc(placeholder)}" value="${esc(val)}">${q.unit?`<span class="pill">${esc(q.unit)}</span>`:''}</div>`;
    const floor=calculate(state.current.answers,state.current.counts).floor_m2;
    if(floor!==null&&['pavimento.superficie_posa','demolizione.pavimento_area'].includes(key))control+=`<button class="btn sm ghost" type="button" data-action="use-floor" data-field="${esc(key)}">↳ Usa superficie rilevata: ${formatNum(floor)} m²</button>`;
  }
  return `<div class="field"><label class="field-label">${esc(label||q.label)}${required}</label>${control}${helper}</div>`;
}
function wallQuestions(section,w,filter){
  const form=currentConfig();return form.questions.filter(q=>sectionFor(q)===section&&q.repeat_in===filter&&isVisible(q,state.current.answers))
    .map(q=>renderQuestion(q,q.id.replace('muri[]',`muri[${w}]`))).join('');
}
function renderWall(w,section){
  const a=state.current.answers;const id=a[`geometria.muri[${w}].id`]||`M${w+1}`;
  let body='';
  if(section==='geometria'){
    body=wallQuestions('geometria',w,'geometria.muri');
    const opens=state.current.counts.openings[w]||0;
    body+=`<div class="section-mini">Aperture nella parete</div>`;
    for(let j=0;j<opens;j++){
      const qs=currentConfig().questions.filter(q=>q.repeat_in==='geometria.muri[].aperture');
      body+=`<div class="subgroup"><div class="subgroup-title">Apertura ${j+1}</div>${qs.map(q=>renderQuestion(q,q.id.replace('muri[]',`muri[${w}]`).replace('aperture[]',`aperture[${j}]`))).join('')}</div>`;
    }
    body+=`<div class="actions"><button class="btn sm" data-action="add-opening" data-wall="${w}">＋ Apertura</button>${opens?`<button class="btn sm ghost" data-action="remove-opening" data-wall="${w}">− Ultima apertura</button>`:''}</div>`;
    const excl=state.current.counts.excluded[w]||0;
    body+=`<div class="section-mini">Zone escluse (solo annotazione, nessuna detrazione automatica)</div>`;
    for(let j=0;j<excl;j++){
      const q=currentConfig().questions.find(x=>x.id==='geometria.muri[].zone_escluse[].area');
      if(q)body+=renderQuestion(q,`geometria.muri[${w}].zone_escluse[${j}].area`,`Zona esclusa ${j+1} · ${q.label}`);
    }
    body+=`<div class="actions"><button class="btn sm" data-action="add-excluded" data-wall="${w}">＋ Zona esclusa</button>${excl?`<button class="btn sm ghost" data-action="remove-excluded" data-wall="${w}">− Ultima zona</button>`:''}</div>`;
  } else if(section==='demolizione') body=wallQuestions('demolizione',w,'geometria.muri');
  else if(section==='pareti') body=wallQuestions('pareti',w,'geometria.muri');
  if(!body)return '';
  return `<details class="wall" ${w<4?'open':''}><summary><span>▥ ${esc(id)} <span class="muted tiny">· Parete ${w+1}</span></span><span class="pill">${esc(a[`geometria.muri[${w}].lunghezza`]||'—')} m</span></summary><div class="wall-body">${body}</div></details>`;
}
function renderFields(section){
  const questions=currentConfig().questions.filter(q=>sectionFor(q)===section&&isVisible(q,state.current.answers)&&!q.repeat_in);
  let html=questions.map(q=>renderQuestion(q)).join('');
  if(['geometria','demolizione','pareti'].includes(section)){
    const show=section==='geometria'||(section==='demolizione'&&state.current.answers['interventi.demolizione_rivestimenti']==='si'&&state.current.answers['demolizione.pareti']==='si')||(section==='pareti'&&state.current.answers['interventi.rivestimento_pareti']==='si');
    if(show){
      html+=`<div class="section-mini">${section==='geometria'?'Muri e aperture':section==='demolizione'?'Fasce da demolire per parete':'Posa e fasce di rivestimento per parete'}</div>`;
      if(section==='geometria')html+='<div class="help-block">Dai un nome ai muri (M1, M2...), misura ciascuno e registra porte/finestre. Le aperture vengono detratte solo nella fascia di altezza che intersecano.</div>';
      for(let w=0;w<state.current.counts.walls;w++)html+=renderWall(w,section);
      if(section==='geometria')html+=`<div class="actions"><button class="btn" data-action="add-wall">＋ Aggiungi parete</button>${state.current.counts.walls?'<button class="btn ghost" data-action="remove-wall">− Rimuovi ultima</button>':''}</div>`;
    }
  }
  return html;
}
function progress(section){
  const s=state.current;const qs=s.form_snapshot.questions.filter(q=>sectionFor(q)===section&&isVisible(q,s.answers));
  let total=0,done=0;
  for(const q of qs){if(!q.required_when_visible)continue;for(const x of expand(q,s.counts)){
    if(!expandedVisible(q,s.answers,x.id,s.form_snapshot))continue;
    total++;let v=s.answers[x.id];if(v!==undefined&&v!==null&&v!==''&&v!=='da_verificare'&&v!=='da_definire')done++;}}
  return {total,done};
}
function renderMeasureBox(measures){
  const values=[['Pavimento rilevato',measures.floor_m2,'m²'],['Perimetro lordo',measures.perimeter_m,'m'],
    ['Demolizione pavimento',measures.demolition_floor_m2,'m²'],['Demolizione pareti',measures.demolition_walls_m2,'m²'],
    ['Nuovo pavimento',measures.new_floor_m2,'m²'],['Rivestimento pareti',measures.new_walls_m2,'m²']];
  return `<div class="measure-stats">${values.map(([title,v,unit])=>`<div class="measure-stat"><label>${esc(title)}</label><strong>${formatNum(v)}</strong> <small>${unit}</small></div>`).join('')}</div><p class="small muted">${esc(measures.note)}</p>`;
}
function renderReview(){
  const report=currentAudit();
  const errors=report.issues.filter(i=>i.severity==='block');
  const notices=report.issues.filter(i=>i.severity!=='block');
  const photos=photosForCurrent();
  const prompt=buildPrompt(state.current,photos);
  const missing=report.missing.slice(0,30);
  return `<div class="panel"><span class="kicker">RIEPILOGO GE360</span><h2 style="margin:8px 0 5px">Dati raccolti</h2>${renderMeasureBox(report.measures)}</div>
    <div class="panel" style="margin-top:12px"><div class="row between"><h3 style="margin:0">Controlli automatici</h3><span class="pill ${errors.length?'danger':report.missing.length?'warn':'ok'}">${errors.length} blocchi · ${report.missing.length} mancanti</span></div>
    ${errors.map(i=>`<div class="alert block"><strong>⛔ ${esc(i.id)} · BLOCCO</strong>${esc(i.message)}</div>`).join('')}
    ${notices.map(i=>`<div class="alert ${i.severity==='suggest'?'suggest':''}"><strong>${i.severity==='review'?'⚠ Da verificare':'ℹ Suggerimento'} · ${esc(i.id)}</strong>${esc(i.message)}</div>`).join('')}
    ${missing.length?`<div class="section-mini">Campi da completare</div>${missing.map(q=>`<div class="alert"><strong>${esc(q.field)}</strong>${esc(q.label)}</div>`).join('')}`:''}
    ${report.missing.length>30?`<p class="muted small">... e altri ${report.missing.length-30} campi.</p>`:''}
    ${!errors.length&&!notices.length&&!missing.length?'<div class="notice ok">Nessun problema automatico rilevato. Serve comunque una revisione umana per il definitivo.</div>':''}</div>
    <div class="panel" style="margin-top:12px"><div class="row between"><h3 style="margin:0">Prepara il prompt</h3><span class="pill">GPT V3.1</span></div>
    <p class="subtitle">Puoi esportare anche se il rilievo è incompleto: l'IA riceverà l'elenco delle verifiche mancanti e dovrà creare soltanto una bozza.</p>
    <div class="actions" style="margin:13px 0"><button class="btn primary" data-action="copy-prompt">⧉ Copia prompt</button><button class="btn" data-action="download-prompt">↓ Prompt TXT</button><button class="btn" data-action="download-json">↓ JSON</button><button class="btn ghost" data-action="toggle-prompt">${state.promptShown?'Nascondi':'Anteprima'}</button></div>
    ${state.promptShown?`<div class="prompt-preview">${esc(prompt)}</div>`:''}
    <div class="help-block">Le foto non possono essere incollate in un prompt testuale: allegale al GPT separatamente. Il sistema non crea il PDF; lo farà il tuo GPT Preventivi Premium V3.1.</div></div>`;
}
function statusPill(){const s=state.current;return !state.online?'<span class="pill warn">Offline: sul telefono</span>':state.conflict?'<span class="pill danger">Conflitto</span>':s?.dirty?'<span class="pill warn" id="save-indicator">Da sincronizzare</span>':'<span class="pill ok" id="save-indicator">Sincronizzato</span>';}
function layout(body){
  return `<div class="app"><header class="topbar"><div class="brand"><div class="brand-mark">▤</div><div><strong>GE360 SMART</strong><small>SOPRALLUOGHI · EDIL MILAN STEVIC</small></div></div><div class="top-actions">${state.updateAvailable?'<button class="btn sm green" data-action="update-app">↻ Aggiorna</button>':''}<span class="status ${state.online?'':'offline'}">${state.online?'Debian online':'Offline'}</span><button class="icon-btn" data-action="home" title="Archivio">⌂</button><button class="icon-btn" data-action="settings" title="Impostazioni">⚙</button></div></header>${body}</div>`;
}
function renderHome(){
  const list=[...state.localList||[]];
  const ids=new Set(list.map(x=>x.id));
  const remote=state.remote.filter(x=>!ids.has(x.id));
  const card=s=>{
    const a=s.answers||{};const client=s.client||a['cliente.nome']||'Cliente da inserire';
    const room=s.room||a['ambiente.nome']||'Bagno';const address=s.address||a['immobile.indirizzo']||'Indirizzo da completare';
    const badge=s.dirty?'<span class="pill warn">Da sincronizzare</span>':!s.answers?'<span class="pill">Sul Debian</span>':'<span class="pill ok">Salvato</span>';
    return `<button class="panel survey-card" data-action="open" data-id="${esc(s.id)}"><div class="top"><h3>${esc(client)}</h3>${badge}</div><p>${esc(room)} · ${esc(address)}</p><div class="row between" style="margin-top:10px"><span class="muted tiny">${esc((s.updated_at||'').replace('T',' ').slice(0,16))}</span><span style="color:#ebac6f">Apri →</span></div></button>`;
  };
  return layout(`<section class="hero"><span class="kicker">IL TUO ASSISTENTE IN CANTIERE</span><h1>Ogni misura.<br>Un preventivo migliore.</h1><p>Rilievi semplici sul telefono. Risposte ordinate e pronte per il tuo GPT Premium.</p><button class="btn primary full" data-action="create">＋ Nuovo sopralluogo bagno</button></section>
    ${!state.online?'<div class="notice">Nessuna connessione al Debian. Puoi creare e modificare rilievi offline; la sincronizzazione riprenderà quando torni connesso.</div>':''}
    <section style="margin-top:22px"><div class="row between" style="margin-bottom:12px"><h2 style="font-size:18px;margin:0">I tuoi sopralluoghi</h2><span class="pill">${list.length+remote.length}</span></div>
    <div class="stack">${[...list,...remote].length?[...list,...remote].map(card).join(''):'<div class="panel"><strong>Nessun sopralluogo ancora</strong><p class="subtitle">Premi “Nuovo sopralluogo bagno” per cominciare.</p></div>'}</div></section>
    <section class="panel soft" style="margin-top:18px"><div class="row between"><div><strong>Checklist bagno V1</strong><p class="subtitle">3 lavorazioni · domande e regole condizionali</p></div><span class="pill">91 campi</span></div></section>`);
}
function renderEditor(){
  const s=state.current,stage=stages[state.step],report=currentAudit();
  const progressCount=progress(stage.id);const fraction=progressCount.total?Math.round(progressCount.done/progressCount.total*100):100;
  const sBody=stage.id==='controllo'?renderFields(stage.id)+renderReview():renderFields(stage.id);
  return layout(`<div class="heading"><div class="row between"><button class="btn sm ghost" data-action="home">← Archivio</button>${statusPill()}</div>
    <h1>${esc(s.answers['cliente.nome']||'Sopralluogo bagno')}</h1><div class="subtitle">${esc(s.answers['immobile.indirizzo']||'Cliente e indirizzo da inserire')} · ${esc(s.answers['ambiente.nome']||'Bagno')}</div></div>
    ${state.conflict?'<div class="notice error">Modifiche concorrenti rilevate. La tua copia locale è intatta: premi “Duplica” per salvarla come nuovo sopralluogo, oppure contatta l’amministratore.</div>':''}
    <div class="layout"><nav class="wizard" aria-label="Passaggi della checklist">${stages.map((s,i)=>{
      const p=progress(s.id),c=p.total?Math.round(p.done/p.total*100):100;
      return `<button class="step ${i===state.step?'active':''} ${c===100?'done':''}" data-action="step" data-step="${i}"><small>0${i+1} · ${esc(s.icon)}</small><b>${esc(s.title)}</b><small>${p.done}/${p.total}</small></button>`;
    }).join('')}</nav><div class="content-panel"><div class="panel"><div class="section-head"><span class="kicker">PASSAGGIO ${state.step+1} DI ${stages.length}</span><h2>${esc(stage.title)}</h2><p>${esc(stage.desc)}</p></div>
    <div class="row between"><span class="muted small">${progressCount.done} di ${progressCount.total} campi richiesti</span><span class="pill ${fraction===100?'ok':''}">${fraction}%</span></div><div class="meter"><span style="width:${fraction}%"></span></div>
    ${sBody||'<div class="help-block">Non ci sono domande attive in questa sezione: prosegui.</div>'}
    ${stage.id==='geometria'?renderMeasureBox(report.measures):''}</div>
    <div class="panel soft" style="margin-top:10px"><div class="row between"><span class="muted small">Versione locale: ${esc(s.form_snapshot.version||'1.0')}</span><span class="muted small">Rilievo #${esc(s.id.slice(0,8))}</span></div><div class="actions" style="margin-top:12px"><button class="btn sm" data-action="sync-now">↻ Sincronizza ora</button><button class="btn sm ghost" data-action="duplicate">Duplica</button><button class="btn sm danger" data-action="archive">Archivia</button></div></div></div></div>
    <div class="bottom-bar"><div class="bottom-inner"><button class="btn ghost" data-action="previous" ${state.step===0?'disabled':''}>← Indietro</button><button class="btn primary" data-action="next">${state.step===7?'✓ Riepilogo':'Avanti →'}</button></div></div>`);
}
function renderSettings(){
  const conf=state.configDraft||state.config;
  if(!conf)return layout('<div class="notice">Caricamento configurazione…</div>');
  const qs=conf.questions.filter(q=>sectionFor(q)===state.configSection);
  return layout(`<div class="heading"><button class="btn sm ghost" data-action="home">← Archivio</button><h1>Impostazioni GE360</h1><p class="subtitle">Il catalogo si aggiorna sul Debian senza reinstallare la PWA.</p></div>
    <div class="panel"><h2 class="card-title">Collegamento</h2><p class="subtitle">${state.online?'Debian raggiungibile':'Modalità offline'} · ${state.logged?'Sessione attiva':'Non autenticato'}</p><div class="actions" style="margin-top:12px"><button class="btn" data-action="sync-all">↻ Aggiorna e sincronizza</button><button class="btn ghost" data-action="backup">↓ Backup ZIP Debian</button><button class="btn ghost" data-action="logout">Esci</button></div></div>
    <div class="panel" style="margin-top:13px"><div class="row between"><h2 class="card-title">Editor checklist</h2><span class="pill">V ${esc(conf.version)}</span></div><p class="subtitle">Modifica testi, opzioni e aggiungi domande semplici. Ogni sopralluogo conserva una copia della checklist con cui è nato.</p>
    <div class="field"><label class="field-label">Sezione da modificare</label><select class="control" data-config-section>${stages.map(s=>`<option value="${s.id}" ${s.id===state.configSection?'selected':''}>${esc(s.title)}</option>`).join('')}</select></div>
    <div class="admin-list">${qs.map(q=>`<div class="admin-q"><div class="tiny muted">${esc(q.id)}</div><input class="control" style="margin:8px 0" data-config-label="${esc(q.id)}" value="${esc(q.label)}"><input class="control" placeholder="Aiuto / esempio" data-config-help="${esc(q.id)}" value="${esc(q.help||'')}">${q.type==='choice'?`<input class="control" style="margin-top:8px" data-config-options="${esc(q.id)}" value="${esc(q.options.join(', '))}" title="Opzioni separate da virgola">`:''}</div>`).join('')}</div>
    <hr class="section-separator"><div class="section-mini">Aggiungi una nuova domanda alla sezione</div><form id="new-field-form" class="stack">
    <label class="small muted">ID univoco (esempio: pavimento.nuova_domanda)<input class="control" name="id" required placeholder="${esc(state.configSection)}.nuova_domanda"></label>
    <label class="small muted">Testo domanda<input class="control" name="label" required placeholder="Cosa chiedere in cantiere?"></label>
    <div class="grid-2"><label class="small muted">Tipo<select class="control" name="type"><option value="choice">Scelta</option><option value="text">Testo</option><option value="decimal">Misura numerica</option><option value="multitext">Note</option><option value="photo">Foto</option></select></label><label class="small muted">Obbligatorio<select class="control" name="required"><option value="no">No</option><option value="si">Sì</option></select></label></div>
    <label class="small muted">Opzioni (solo scelta, separate da virgola)<input class="control" name="options" value="si, no, da_verificare"></label>
    <div class="grid-2"><label class="small muted">Mostra solo se campo...<select class="control" name="depField"><option value="">Sempre visibile</option>${conf.questions.filter(q=>q.type==='choice'&&!q.id.includes('[]')).map(q=>`<option value="${esc(q.id)}">${esc(q.id)}</option>`).join('')}</select></label><label class="small muted">...è uguale a<input class="control" name="depValue" placeholder="si"></label></div>
    <button class="btn" type="submit">＋ Aggiungi alla checklist</button></form>
    <div class="actions" style="margin-top:16px"><button class="btn primary" data-action="save-config" ${!state.logged?'disabled':''}>Salva configurazione sul Debian</button><button class="btn ghost" data-action="export-config">↓ JSON</button><button class="btn ghost" data-action="reset-config">Annulla modifiche</button></div>
    <p class="subtitle">Per regole condizionali avanzate puoi modificare il JSON esportato nel repository. Le modifiche alle regole devono essere testate prima di pubblicarle.</p></div>`);
}
function renderLogin(){
  return `<div class="login-screen"><div class="login-card"><div class="brand-mark" style="width:58px;height:58px;font-size:29px">▤</div><div class="kicker" style="margin-top:22px">ACCESSO PRIVATO · TAILSCALE</div><h1>GE360 Smart</h1><p>Collegati al tuo Debian per accedere ai sopralluoghi. I dati rimangono sul tuo server e, quando serve, sul telefono in modalità offline.</p><form id="login-form" class="stack"><label class="small muted">Password applicazione<input type="password" name="password" class="control" autocomplete="current-password" minlength="12" required placeholder="Password GE360"></label><button class="btn primary full" type="submit">Accedi al Debian →</button></form><p class="tiny muted">Solo dispositivi autorizzati nella tua rete Tailscale devono poter aprire questa pagina.</p></div></div>`;
}
function render(){
  for(const url of photoUrls)URL.revokeObjectURL(url);photoUrls.length=0;
  if(state.online&&!state.logged){root.innerHTML=renderLogin();return;}
  if(state.view==='editor'&&state.current)root.innerHTML=renderEditor();
  else if(state.view==='settings')root.innerHTML=renderSettings();
  else root.innerHTML=renderHome();
}
async function prepareHome(){state.view='home';state.current=null;state.configDraft=null;state.localList=await localSurveys();await refreshRemote();render();}
async function copyPrompt(){
  const text=buildPrompt(state.current,photosForCurrent());
  try {await navigator.clipboard.writeText(text);toast('Prompt copiato. Incollalo nel tuo GPT Preventivi V3.1.');}
  catch {download(outputName('txt'),text);toast('Il browser non permette la copia: scaricato TXT.');}
}
async function backendBackup(){
  if(!state.online||!state.logged){toast('Backup completo disponibile solo collegato al Debian.');return;}
  try{
    const r=await fetch('/api/backup',{credentials:'same-origin'});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    download('GE360_BACKUP_'+new Date().toISOString().slice(0,10)+'.zip',await r.blob(),'application/zip');
  }catch(e){toast('Backup fallito: '+e.message);}
}
function registerWorker(){
  if(!('serviceWorker' in navigator))return;
  navigator.serviceWorker.register('/sw.js').then(reg=>{
    workerRegistration=reg;
    const promptUpdate=()=>{
      if(reg.waiting){state.updateAvailable=true;render();toast('Aggiornamento pronto: premi Aggiorna quando hai finito il rilievo.');}
    };
    if(reg.waiting)promptUpdate();
    reg.addEventListener('updatefound',()=>reg.installing?.addEventListener('statechange',()=>{
      if(reg.waiting && navigator.serviceWorker.controller)promptUpdate();
    }));
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(!state.refreshing){state.refreshing=true;window.location.reload();}
    });
  }).catch(console.warn);
}

root.addEventListener('submit',async event=>{
  if(event.target.id==='login-form'){
    event.preventDefault();await login(new FormData(event.target).get('password')||'');return;}
  if(event.target.id==='new-field-form'){
    event.preventDefault();const data=Object.fromEntries(new FormData(event.target));
    const conf=state.configDraft||(state.configDraft=structuredClone(state.config));
    if(!/^[a-zA-Z0-9_.-]{3,120}$/.test(data.id)||conf.questions.some(q=>q.id===data.id)){toast('ID non valido o già presente.');return;}
    if(!data.id.startsWith(state.configSection+'.') && !(state.configSection==='base'&&['cliente','immobile','ambiente','sopralluogo','interventi'].some(p=>data.id.startsWith(p+'.')))){toast('L’ID deve appartenere alla sezione scelta.');return;}
    const q={id:data.id,label:data.label,type:data.type,required_when_visible:data.required==='si'};
    if(q.type==='choice')q.options=String(data.options).split(',').map(s=>s.trim()).filter(Boolean);
    if(data.depField&&data.depValue)q.visible_when={eq:[data.depField,data.depValue]};
    conf.questions.push(q);render();toast('Domanda aggiunta. Premi Salva configurazione.');return;
  }
});
root.addEventListener('input',event=>{
  const f=event.target;
  if(f.dataset.answer){setAnswer(f.dataset.answer,f.value);return;}
  const conf=state.configDraft;
  if(!conf)return;
  const q=conf.questions.find(x=>x.id===(f.dataset.configLabel||f.dataset.configHelp||f.dataset.configOptions));
  if(q){if(f.dataset.configLabel)q.label=f.value;
    else if(f.dataset.configHelp)q.help=f.value;
    else if(f.dataset.configOptions)q.options=f.value.split(',').map(s=>s.trim()).filter(Boolean);}
});
root.addEventListener('change',async event=>{
  const el=event.target;
  if(el.dataset.answer){setAnswer(el.dataset.answer,el.value);await markDirty();if(el.tagName==='SELECT')render();return;}
  if(el.dataset.photo){await attachPhotos(el.dataset.photo,el.files);return;}
  if(el.hasAttribute('data-config-section')){state.configSection=el.value;render();}
});
root.addEventListener('click',async event=>{
  const btn=event.target.closest('[data-action]');if(!btn)return;
  const action=btn.dataset.action;
  if(action==='create')await create();
  else if(action==='home')await prepareHome();
  else if(action==='open')await openSurvey(btn.dataset.id);
  else if(action==='settings'){state.configDraft=structuredClone(state.config);state.view='settings';render();}
  else if(action==='step'){state.step=Number(btn.dataset.step);render();}
  else if(action==='next'){state.step=Math.min(7,state.step+1);render();}
  else if(action==='previous'){state.step=Math.max(0,state.step-1);render();}
  else if(action==='choose'){setAnswer(btn.dataset.field,btn.dataset.value);await markDirty();render();}
  else if(action==='use-floor'){const v=calculate(state.current.answers,state.current.counts).floor_m2;if(v!==null){setAnswer(btn.dataset.field,String(v));await markDirty();render();}}
  else if(action==='add-wall')setCounts('walls',0,1);
  else if(action==='remove-wall')setCounts('walls',0,-1);
  else if(action==='add-opening')setCounts('openings',btn.dataset.wall,1);
  else if(action==='remove-opening')setCounts('openings',btn.dataset.wall,-1);
  else if(action==='add-excluded')setCounts('excluded',btn.dataset.wall,1);
  else if(action==='remove-excluded')setCounts('excluded',btn.dataset.wall,-1);
  else if(action==='sync-now'){await markDirty();await syncCurrent();toast(state.online?'Sincronizzazione richiesta.':'Dati salvati localmente.');}
  else if(action==='sync-all')await recheckOnline();
  else if(action==='update-app'){
    if(state.current){clearTimeout(autosaveTimer);await markDirty();await syncCurrent();}
    if(workerRegistration?.waiting)workerRegistration.waiting.postMessage({type:'SKIP_WAITING'});
    else window.location.reload();
  }
  else if(action==='copy-prompt')await copyPrompt();
  else if(action==='download-prompt')download(outputName('txt'),buildPrompt(state.current,photosForCurrent()));
  else if(action==='download-json'){
    const s=structuredClone(state.current);delete s.dirty;
    s.audit=currentAudit();s.photos=photosForCurrent().map(({blob,...other})=>other);
    download(outputName('json'),JSON.stringify(s,null,2),'application/json');
  }
  else if(action==='toggle-prompt'){state.promptShown=!state.promptShown;render();}
  else if(action==='remove-photo')await removePhoto(btn.dataset.id);
  else if(action==='duplicate')await duplicate();
  else if(action==='archive')await archive();
  else if(action==='backup')await backendBackup();
  else if(action==='logout')await logout();
  else if(action==='reset-config'){state.configDraft=structuredClone(state.config);render();toast('Modifiche locali annullate.');}
  else if(action==='export-config')download('GE360_checklist.json',JSON.stringify(state.configDraft||state.config,null,2),'application/json');
  else if(action==='save-config'){
    try{
      if(!state.online||!state.logged)throw new Error('Serve il collegamento al Debian.');
      const conf=state.configDraft;conf.version=String(conf.version||'1.0.0').replace(/(\d+)$/,x=>String(Number(x)+1));
      await api('/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(conf)});
      state.config=structuredClone(conf);await store('settings',{key:'config',value:state.config});
      state.configDraft=structuredClone(conf);render();toast('Checklist aggiornata sul Debian. I vecchi rilievi rimangono invariati.');
    }catch(e){toast('Salvataggio checklist fallito: '+e.message);}
  }
});

// Evita di sincronizzare ripetutamente durante la compilazione: le modifiche sono
// scritte in IndexedDB anche in assenza di connessione. L'avvio è asincrono.
state.localList=[];
bootstrap().then(()=>localSurveys()).then(list=>{state.localList=list;if(state.view==='home')render();})
  .catch(e=>{console.error(e);root.innerHTML=`<div class="login-screen"><div class="panel">Errore avvio: ${esc(e.message)}. Aggiorna la pagina.</div></div>`;});
