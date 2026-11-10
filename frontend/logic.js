/* Motore di regole esplicito (niente eval), allineato al backend Python. */
export const stages=[
  {id:'base',title:'Dati',icon:'◈',desc:'Cliente e lavori richiesti'},
  {id:'geometria',title:'Misure',icon:'⌗',desc:'Ambiente, muri e aperture'},
  {id:'stato',title:'Stato',icon:'◎',desc:'Com’è il bagno oggi'},
  {id:'demolizione',title:'Demolizioni',icon:'⚒',desc:'Cosa va rimosso'},
  {id:'pavimento',title:'Pavimento',icon:'▦',desc:'Posa e preparazione'},
  {id:'pareti',title:'Pareti',icon:'▤',desc:'Rivestimenti e dettagli'},
  {id:'logistica',title:'Logistica',icon:'▣',desc:'Accessi e responsabilità'},
  {id:'controllo',title:'Riepilogo',icon:'✓',desc:'Controlli e prompt'}
];
export function sectionFor(q) {
  const pre=q.id.split('.')[0];
  return ['cliente','immobile','ambiente','sopralluogo','interventi'].includes(pre)?'base':
    ['controllo','geometria','stato','demolizione','pavimento','pareti','logistica'].includes(pre)?pre:'base';
}
export function evaluate(cond,a) {
  if(!cond) return true;
  if(typeof cond!=='object'||Array.isArray(cond)) return false;
  if(Array.isArray(cond.eq) && cond.eq.length===2) return a[cond.eq[0]]===cond.eq[1];
  if(Array.isArray(cond.all)) return cond.all.every(c=>evaluate(c,a));
  if(Array.isArray(cond.any)) return cond.any.some(c=>evaluate(c,a));
  if(cond.not) return !evaluate(cond.not,a);
  return false;
}
export function isVisible(q,a) {return evaluate(q.visible_when,a);}
export function expandedVisible(q,a,key,form) {
  if(!isVisible(q,a))return false;
  const match=/muri\[(\d+)\]/.exec(key);if(!match)return true;
  const w=match[1];
  if(q.id.startsWith('pareti.muri[].fascia_'))return a[`pareti.muri[${w}].posa`]==='si';
  if(q.id.startsWith('demolizione.muri[].fascia_')) {
    const hasSwitch=form.questions.some(x=>x.id==='demolizione.muri[].demolisci');
    return !hasSwitch||a[`demolizione.muri[${w}].demolisci`]==='si';
  }
  return true;
}
export function expand(q,c) {
  if(!q.id.includes('[]')) return [q];
  const res=[];let walls=Math.max(0,Math.min(40,Number(c.walls)||0));
  for(let w=0;w<walls;w++) {
    const wp=q.id.replace('muri[]',`muri[${w}]`);
    if(wp.includes('aperture[]')) {
      const n=Math.max(0,Math.min(30,Number(c.openings?.[w])||0));
      for(let j=0;j<n;j++) res.push({...q,id:wp.replace('aperture[]',`aperture[${j}]`)});
    } else if(wp.includes('zone_escluse[]')) {
      const n=Math.max(0,Math.min(30,Number(c.excluded?.[w])||0));
      for(let j=0;j<n;j++) res.push({...q,id:wp.replace('zone_escluse[]',`zone_escluse[${j}]`)});
    } else res.push({...q,id:wp});
  }
  return res;
}
const n=v=> {if(v===null||v===undefined||v==='')return null;const x=Number(String(v).replace(',','.'));return Number.isFinite(x)?x:null;};
const round=v=>Math.round((v+Number.EPSILON)*1000)/1000;
export function calculate(a,c) {
  const errs=[],walls=[];
  let floor=null,perimeter=null;
  if(a['geometria.forma']==='rettangolare') {
    const l=n(a['geometria.lunghezza']),w=n(a['geometria.larghezza']);
    if(l!==null&&w!==null&&l>0&&w>0) {floor=round(l*w);perimeter=round((l+w)*2);}
    else errs.push('Indicare lunghezza e larghezza positive.');
  } else if(a['geometria.forma']==='irregolare') {
    const f=n(a['geometria.superficie_rilevata']);
    if(f!==null&&f>0) floor=round(f);else errs.push('Inserire la superficie misurata del locale irregolare.');
  }
  let demo=0,covered=0,demoCount=0,coverCount=0;
  for(let w=0;w<Math.min(40,Number(c.walls)||0);w++) {
    const p=`geometria.muri[${w}]`,len=n(a[p+'.lunghezza']),height=n(a[p+'.altezza']);
    if(len===null||height===null||len<=0||height<=0) {if(a[p+'.id']||a[p+'.lunghezza']||a[p+'.altezza']) errs.push(`Parete ${w+1}: lunghezza o altezza mancante/non valida.`);continue;}
    function band(kind,active) {
      if(!active)return null;
      const lo=n(a[`${kind}.muri[${w}].fascia_da`]),hi=n(a[`${kind}.muri[${w}].fascia_a`]);
      if(lo===null||hi===null)return null;
      if(lo<0||hi<=lo||hi>height+.0001){errs.push(`Parete ${w+1}: fascia ${kind} non valida.`);return null;}
      const gross=len*(hi-lo);let subtract=0;
      for(let j=0;j<(Number(c.openings?.[w])||0);j++){
        const op=`${p}.aperture[${j}]`,ow=n(a[op+'.larghezza']),oh=n(a[op+'.altezza']),base=n(a[op+'.quota_base']);
        if(ow===null||oh===null||base===null)continue;
        if(ow<=0||oh<=0||base<0||base+oh>height+.0001||ow>len+.0001){errs.push(`Parete ${w+1}: apertura ${j+1} non valida.`);continue;}
        subtract+=ow*Math.max(0,Math.min(base+oh,hi)-Math.max(base,lo));
      }
      if(subtract>gross+.0001){errs.push(`Parete ${w+1}: aperture maggiori della fascia.`);return null;}
      return {da:lo,a:hi,lorda:round(gross),aperture:round(subtract),netta:round(gross-subtract)};
    }
    const d=band('demolizione',a['interventi.demolizione_rivestimenti']==='si'&&a['demolizione.pareti']==='si'&&(a[`demolizione.muri[${w}].demolisci`]??'si')==='si');
    const wallIncluded=a[`pareti.muri[${w}].posa`]==='si';
    const v=band('pareti',a['interventi.rivestimento_pareti']==='si'&&wallIncluded);
    if(d) {demo+=d.netta;demoCount++;}
    if(v) {covered+=v.netta;coverCount++;}
    walls.push({name:a[p+'.id']||`M${w+1}`,length:len,height,demolition:d,covering:v});
  }
  if(a['interventi.rivestimento_pareti']==='si'&&c.walls===0)errs.push('Aggiungere almeno una parete.');
  const newFloor=a['interventi.nuovo_pavimento']==='si'?n(a['pavimento.superficie_posa']):null;
  const demoFloor=a['demolizione.pavimento']==='si'?n(a['demolizione.pavimento_area']):null;
  if(newFloor!==null&&newFloor<0)errs.push('Superficie pavimento nuovo negativa.');
  if(demoFloor!==null&&demoFloor<0)errs.push('Superficie demolizione pavimento negativa.');
  return {floor_m2:floor,perimeter_m:perimeter,
    demolition_floor_m2:demoFloor,demolition_walls_m2:demoCount?round(demo):null,
    new_floor_m2:newFloor,new_walls_m2:coverCount?round(covered):null,
    walls,errors:errs,
    note:'Quantità geometriche indicative. Nicchie, zone escluse, sovrapposizioni e detrazioni contrattuali da verificare.'};
}
export function audit(form,a,c) {
  const missing=[];
  for(const q of form.questions||[]) {
    if(!isVisible(q,a)||!q.required_when_visible) continue;
    for(const x of expand(q,c)) {
      if(!expandedVisible(q,a,x.id,form))continue;
      const v=a[x.id];
      if(v===undefined||v===null||v===''||v==='da_verificare'||v==='da_definire') missing.push({field:x.id,label:x.label});
    }
  }
  const issues=(form.rules||[]).filter(r=>evaluate(r.when,a)).map(r=>({id:r.id,severity:r.severity,message:r.message}));
  for(const q of form.questions||[]) {
    if(!['decimal','integer'].includes(q.type)||!isVisible(q,a))continue;
    for(const x of expand(q,c)){
      if(!expandedVisible(q,a,x.id,form))continue;
      const v=a[x.id];if(v===undefined||v===null||v==='')continue;
      const value=Number(String(v).replace(',','.'));
      if(!Number.isFinite(value)||(q.type==='integer'&&!Number.isInteger(value))||(value<0&&x.id!=='immobile.piano')){
        issues.push({id:'NUM',severity:'block',message:`Valore numerico non valido: ${x.id} = ${v}`});
      }
    }
  }
  const measures=calculate(a,c);
  for(const e of measures.errors)issues.push({id:'GEO',severity:'block',message:e});
  return {missing,issues,measures,ready_for_final_review:missing.length===0&&!issues.some(i=>i.severity==='block')};
}
export function buildPrompt(s,photos=[]) {
  const a=s.answers,c=s.counts,form=s.form_snapshot,result=audit(form,a,c),m=result.measures;
  const lines=[
    'GE360 SMART SOPRALLUOGO — INPUT PER GPT PREVENTIVI PREMIUM V3.1',
    'TRASFERIMENTO DATI, NON PREVENTIVO DEFINITIVO',
    '',
    'ISTRUZIONI: Usa esclusivamente il motore V3.1 presente nelle tue conoscenze. Genera una BOZZA PDF.',
    'Non inventare misure, importi, quantità, forniture, IVA, smaltimenti o condizioni.',
    'Non sommare due volte demolizioni, ripristini, posa battiscopa e impermeabilizzazioni.',
    'Distinguere dati confermati, da verificare, esclusi e opzionali.',
    'Per importi e condizioni richiedi esplicita conferma prima del definitivo.',
    '',
    'CLIENTE: '+(a['cliente.nome']||'NON INDICATO'),
    'INDIRIZZO: '+(a['immobile.indirizzo']||'NON INDICATO'),
    'AMBIENTE: '+(a['ambiente.nome']||'Bagno'),
    'DATA SOPRALLUOGO: '+(a['sopralluogo.data']||'NON INDICATA'),
    'TIPO DI PREZZO: '+(a['controllo.tipo_prezzo']||'NON DEFINITO'),
    '',
    'MISURE GEOMETRICHE (non necessariamente quantità fatturabili):',
    JSON.stringify(m,null,2),
    '',
    'RISPOSTE DELLA CHECKLIST:',
  ];
  const bySection=new Map();
  for(const q of form.questions||[]) {
    const group=sectionFor(q);
    if(!bySection.has(group))bySection.set(group,[]);
    for(const expanded of expand(q,c)) {
      const value=a[expanded.id];
      if(value!==undefined&&value!==null&&value!=='')bySection.get(group).push(`${expanded.id} (${q.label}): ${value}`);
    }
  }
  for(const stage of stages){if(bySection.get(stage.id)?.length)lines.push(`\n## ${stage.title.toUpperCase()}`, ...bySection.get(stage.id));}
  lines.push('', 'FOTOGRAFIE:');
  if(photos.length)for(const p of photos)lines.push(`${p.question_key}: ${p.name||p.original_name||'foto'} — caricare separatamente nel GPT`);
  else lines.push('Nessuna foto allegata nel testo; trasferirle separatamente se utili.');
  lines.push('', 'CRITICITÀ E LACUNE:');
  for(const i of result.issues)lines.push(`[${i.severity.toUpperCase()}] ${i.message}`);
  for(const q of result.missing)lines.push(`[MANCANTE] ${q.field} — ${q.label}`);
  if(!result.issues.length&&!result.missing.length)lines.push('Nessun blocco automatico, necessaria comunque revisione umana.');
  lines.push('', 'OUTPUT: 1. Controllo incongruenze; 2. Bozza computo; 3. PDF in layout Premium V3.1 BOZZA; 4. Domande per eventuale definitivo.');
  return lines.join('\n')+'\n';
}
export function slugOptions(s) {
  const dict={si:'Sì',no:'No',da_verificare:'Da verificare',da_definire:'Da definire',rettangolare:'Rettangolare',irregolare:'Irregolare',
    in_corso:'In corso',completo:'Completo',corpo:'A corpo',misura:'A misura',da_cliente:'Cliente',impresa:'Impresa',
    a_carico_impresa:'A carico impresa',a_carico_committente:'A carico cliente'};
  return dict[s]||String(s).replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase());
}
