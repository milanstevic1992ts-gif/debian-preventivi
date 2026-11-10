import io
import json
import os
import uuid
from pathlib import Path

os.environ['GE360_SKIP_DEFAULT_APP']='1'
from fastapi.testclient import TestClient
from PIL import Image
import pytest

from backend.app import create_app
from backend.logic import evaluate, calculate_measures, missing_and_rules, build_prompt

ROOT=Path(__file__).parents[1]
FORM=json.loads((ROOT/'config/checklist_bagno_v1.json').read_text())

@pytest.fixture
def client(tmp_path):
    app=create_app(data_dir=tmp_path,password='UnaPasswordMoltoLunga123!',secret='a'*64,secure_cookie=False)
    with TestClient(app) as tc:
        yield tc

def login(c):
    r=c.post('/api/login',json={'password':'UnaPasswordMoltoLunga123!'})
    assert r.status_code==200,r.text

def payload():
    return {'id':str(uuid.uuid4()),'answers':{'cliente.nome':'Cliente Test',
      'geometria.forma':'rettangolare','geometria.lunghezza':'2,4','geometria.larghezza':'1,8',
      'interventi.nuovo_pavimento':'si','interventi.rivestimento_pareti':'si',
      'pareti.muri[0].posa':'si','pareti.muri[0].fascia_da':'0',
      'pareti.muri[0].fascia_a':'2.4','geometria.muri[0].id':'M1',
      'geometria.muri[0].lunghezza':'2.4','geometria.muri[0].altezza':'2.7',
      'geometria.muri[0].aperture[0].larghezza':'0.8',
      'geometria.muri[0].aperture[0].altezza':'2.0',
      'geometria.muri[0].aperture[0].quota_base':'0',
      'pavimento.superficie_posa':'4.32',
      'controllo.tipo_prezzo':'corpo'},
      'counts':{'walls':1,'openings':{'0':1},'excluded':{}}}

def test_health_and_auth(client):
    assert client.get('/api/health').status_code==200
    assert client.get('/api/config').status_code==401
    assert client.post('/api/login',json={'password':'sbagliata'}).status_code==401
    login(client)
    assert len(client.get('/api/config').json()['questions'])==91
    assert client.get('/api/surveys').json()==[]
    assert client.post('/api/logout').status_code==200
    assert client.get('/api/surveys').status_code==401

def test_create_update_conflict_and_export(client):
    login(client)
    p=payload()
    r=client.post('/api/surveys',json=p)
    assert r.status_code==201,r.text
    s=r.json();assert s['version']==1
    assert client.post('/api/surveys',json=p).status_code==409
    assert client.get('/api/surveys/'+p['id']).json()['answers']['cliente.nome']=='Cliente Test'
    prompt=client.get('/api/surveys/'+p['id']+'/prompt')
    assert prompt.status_code==200
    assert 'Cliente Test' in prompt.text
    assert 'BOZZA' in prompt.text
    assert '4.32' in prompt.text
    assert 'DEFINITIVO' in prompt.text
    data=client.get('/api/surveys/'+p['id']+'/export').json()
    assert data['audit']['measures']['floor_m2']==4.32
    p['answers']['cliente.nome']='Cliente Modificato';p['expected_version']=1
    r=client.put('/api/surveys/'+p['id'],json=p)
    assert r.status_code==200,r.text
    assert r.json()['version']==2
    assert client.put('/api/surveys/'+p['id'],json=p).status_code==409
    assert client.get('/api/surveys/'+p['id']).json()['answers']['cliente.nome']=='Cliente Modificato'
    assert client.delete('/api/surveys/'+p['id']).status_code==200
    assert client.get('/api/surveys/'+p['id']).status_code==404

def test_photo_and_backup(client):
    login(client)
    p=payload();assert client.post('/api/surveys',json=p).status_code==201
    im=Image.new('RGB',(100,120),'red'); out=io.BytesIO();im.save(out,format='JPEG')
    r=client.post('/api/surveys/'+p['id']+'/photos',data={'question_key':'controllo.foto_generali'},files={'file':('test.jpg',out.getvalue(),'image/jpeg')})
    assert r.status_code==201,r.text
    photo_id=r.json()['id']
    r=client.get('/api/photos/'+photo_id);assert r.status_code==200
    assert r.headers['content-type']=='image/jpeg'
    assert client.get('/api/surveys/'+p['id']).json()['photos'][0]['id']==photo_id
    r=client.get('/api/backup')
    assert r.status_code==200 and r.content[:2]==b'PK'
    import zipfile
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        assert 'ge360.sqlite3' in z.namelist()
        assert 'active_checklist.json' in z.namelist()
        assert 'photos/'+photo_id+'.jpg' in z.namelist()

def test_config_version_snapshot(client):
    login(client)
    p=payload();assert client.post('/api/surveys',json=p).status_code==201
    old=client.get('/api/surveys/'+p['id']).json()['form_snapshot']
    form=client.get('/api/config').json()
    form['version']='1.0.1';form['questions'][0]['label']='Cliente oppure referente'
    assert client.put('/api/config',json=form).status_code==200
    assert client.get('/api/config').json()['questions'][0]['label']=='Cliente oppure referente'
    assert client.get('/api/surveys/'+p['id']).json()['form_snapshot']==old
    p2=payload();assert client.post('/api/surveys',json=p2).status_code==201
    assert client.get('/api/surveys/'+p2['id']).json()['form_snapshot']['version']=='1.0.1'

def test_bad_inputs(client):
    login(client)
    p=payload();p['counts']['walls']=41
    assert client.post('/api/surveys',json=p).status_code==422
    p['counts']['walls']=1;p['answers']['bad']={'object':'not allowed'}
    assert client.post('/api/surveys',json=p).status_code==422
    p['answers'].pop('bad');r=client.post('/api/surveys',json=p)
    assert r.status_code==201
    assert client.put('/api/surveys/'+p['id'],json={**p,'expected_version':0}).status_code==422
    assert client.post('/api/surveys/'+p['id']+'/photos',data={'question_key':'x'},files={'file':('x.svg',b'<svg></svg>','image/svg+xml')}).status_code==422


def test_geometry_and_rules():
    p=payload();m=calculate_measures(p['answers'],p['counts'])
    assert m['floor_m2']==4.32
    assert m['new_wall_covering_m2']==4.16  # 2.4*2.4 - 0.8*2.0
    assert m['walls'][0]['new_covering']['openings_m2']==1.6
    p['answers']['pareti.muri[0].fascia_da']='1.8'
    m=calculate_measures(p['answers'],p['counts'])
    assert m['new_wall_covering_m2']==1.28  # 2.4*.6 -.8*.2
    assert evaluate({'all':[{'eq':['geometria.forma','rettangolare']},{'not':{'eq':['geometria.forma','irregolare']}}]},p['answers'])
    p['answers']['interventi.demolizione_rivestimenti']='si'
    p['answers']['demolizione.pavimento']='no'
    p['answers']['pavimento.modalita']='dopo_demolizione'
    audit=missing_and_rules(FORM,p['answers'],p['counts'])
    assert any(r['id']=='R01' and r['severity']=='block' for r in audit['issues'])
    text=build_prompt({**p,'form_snapshot':FORM,'photos':[]})
    assert '[BLOCK]' in text


def test_pwa_assets_and_configuration(client):
    for p in ('/','/app.js','/logic.js','/sw.js','/style.css','/manifest.webmanifest','/default_checklist.json','/icons/icon-192.png'):
        r=client.get(p);assert r.status_code==200,(p,r.status_code)
    assert 'GE360' in client.get('/').text

def test_numeric_validation_and_per_wall_switch():
    p=payload();p['answers']['pavimento.superficie_posa']='-2'
    p['answers']['demolizione.pareti']='si'
    p['answers']['interventi.demolizione_rivestimenti']='si'
    p['answers']['demolizione.muri[0].demolisci']='no'
    p['answers']['pareti.muri[0].posa']='no'
    result=missing_and_rules(FORM,p['answers'],p['counts'])
    assert any(i['id']=='NUM' for i in result['issues'])
    assert not any(m['field']=='demolizione.muri[0].fascia_a' for m in result['missing'])
    assert not any(m['field']=='pareti.muri[0].fascia_a' for m in result['missing'])
    p['answers']['pavimento.superficie_posa']='4.32'
    m=calculate_measures(p['answers'],p['counts'])
    assert m['new_wall_covering_m2']==0.0
