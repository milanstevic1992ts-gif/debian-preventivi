import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluate,expand,calculate,audit,buildPrompt,sectionFor,isVisible} from '../frontend/logic.js';
const form=JSON.parse(fs.readFileSync(new URL('../config/checklist_bagno_v1.json',import.meta.url),'utf8'));
const answer={
 'cliente.nome':'Cliente Demo','ambiente.nome':'Bagno',
 'geometria.forma':'rettangolare','geometria.lunghezza':'2,4','geometria.larghezza':'1,8',
 'interventi.demolizione_rivestimenti':'si','demolizione.pareti':'si',
 'interventi.nuovo_pavimento':'si','pavimento.modalita':'su_esistente',
 'interventi.rivestimento_pareti':'si','pareti.muri[0].posa':'si',
 'geometria.muri[0].lunghezza':'2,4','geometria.muri[0].altezza':'2,7',
 'geometria.muri[0].id':'M1','pareti.muri[0].fascia_da':'0','pareti.muri[0].fascia_a':'2,40',
 'geometria.muri[0].aperture[0].larghezza':'0,8',
 'geometria.muri[0].aperture[0].altezza':'2','geometria.muri[0].aperture[0].quota_base':'0',
 'controllo.tipo_prezzo':'corpo'
};
const counts={walls:1,openings:{0:1},excluded:{}};
test('schema riutilizzato con 91 domande e 30 regole',()=>{assert.equal(form.questions.length,91);assert.equal(form.rules.length,30);});
test('regole all, any, not, eq',()=>{
 assert.equal(evaluate({all:[{eq:['geometria.forma','rettangolare']},{not:{eq:['geometria.forma','irregolare']}}]},answer),true);
 assert.equal(evaluate({any:[{eq:['x','y']},{eq:['cliente.nome','Cliente Demo']}]},answer),true);
});
test('campi condizionali solo quando applicabili',()=>{
 const q=form.questions.find(q=>q.id==='pavimento.dettagli_pendenza');
 assert.equal(isVisible(q,answer),false);
 const a={...answer,'pavimento.pendenza_doccia':'si'};
 assert.equal(isVisible(q,a),true);
});
test('espansione muro e aperture',()=>{
 const q=form.questions.find(q=>q.id==='geometria.muri[].aperture[].larghezza');
 assert.deepEqual(expand(q,counts).map(q=>q.id),['geometria.muri[0].aperture[0].larghezza']);
});
test('superfici e intersezione aperture corrette',()=>{
 const m=calculate(answer,counts);
 assert.equal(m.floor_m2,4.32);
 assert.equal(m.new_walls_m2,4.16);
 assert.equal(m.walls[0].covering.aperture,1.6);
});
test('rilevamento conflitti e dati non verificati',()=>{
 const a={...answer,'demolizione.pavimento':'si'};
 const result=audit(form,a,counts);
 assert.ok(result.issues.some(i=>i.id==='R02'));
 assert.ok(result.missing.some(i=>i.field==='immobile.indirizzo'));
});
test('il prompt non assegna prezzi automatici e segnala BOZZA',()=>{
 const text=buildPrompt({answers:answer,counts,form_snapshot:form});
 assert.ok(text.includes('BOZZA'));
 assert.ok(text.includes('Cliente Demo'));
 assert.ok(text.includes('4.32'));
 assert.ok(!text.includes('€'));
});
test('nessun obbligo per fasce di una parete esclusa',()=>{
 const a={...answer, 'pareti.muri[0].posa':'no','demolizione.muri[0].demolisci':'no'};
 const result=audit(form,a,counts);
 assert.ok(!result.missing.some(q=>q.field==='pareti.muri[0].fascia_da'));
 assert.ok(!result.missing.some(q=>q.field==='demolizione.muri[0].fascia_da'));
 const m=calculate(a,counts);
 assert.equal(m.new_walls_m2,null);
});
test('rileva quantità negative o non numeriche',()=>{
 const a={...answer,'pavimento.superficie_posa':'-2','geometria.lunghezza':'abc'};
 const result=audit(form,a,counts);
 assert.ok(result.issues.some(i=>i.id==='NUM'&&i.message.includes('pavimento.superficie_posa')));
 assert.ok(result.issues.some(i=>i.id==='GEO'));
});
