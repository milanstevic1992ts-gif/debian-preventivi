"""API GE360 Smart: self-hosted su Debian, dietro Tailscale Serve.

Una sola utenza; dati e checklist persistenti su volume Docker separato.
"""
from __future__ import annotations
import base64
import datetime as dt
import hashlib
import hmac
import io
import json
import os
import secrets
import sqlite3
import tempfile
import time
import uuid
import zipfile
from collections import defaultdict, deque
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Depends, HTTPException, Request, Response, UploadFile, File, Form
from fastapi.responses import JSONResponse, PlainTextResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.background import BackgroundTask
from PIL import Image, ImageOps, UnidentifiedImageError

from .logic import build_prompt, missing_and_rules, validate_config

ROOT = Path(__file__).resolve().parent.parent
FRONT = ROOT / 'frontend'
DEFAULT_CONFIG = ROOT / 'config' / 'checklist_bagno_v1.json'
MAX_IMAGE = 8 * 1024 * 1024
MAX_REQUEST_JSON = 1_500_000
COOKIE = 'ge360_sess'


def create_app(data_dir: str | Path | None = None, password: str | None = None,
               secret: str | None = None, secure_cookie: bool | None = None) -> FastAPI:
    data_dir = Path(data_dir or os.environ.get('GE360_DATA_DIR', str(ROOT / 'data')))
    password = password if password is not None else os.environ.get('GE360_APP_PASSWORD', '')
    secret = secret if secret is not None else os.environ.get('GE360_SESSION_SECRET', '')
    secure_cookie = secure_cookie if secure_cookie is not None else os.environ.get('GE360_COOKIE_SECURE', '1') == '1'
    if not password or password.startswith('SOSTITUISCI') or len(password) < 12:
        raise RuntimeError('Imposta GE360_APP_PASSWORD (almeno 12 caratteri) nel file .env.')
    if not secret or secret.startswith('SOSTITUISCI') or len(secret) < 32:
        raise RuntimeError('Imposta GE360_SESSION_SECRET (openssl rand -hex 32) nel file .env.')
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / 'photos').mkdir(exist_ok=True)
    (data_dir / 'config_versions').mkdir(exist_ok=True)
    cfg_file = data_dir / 'active_checklist.json'
    if not cfg_file.exists():
        cfg_file.write_bytes(DEFAULT_CONFIG.read_bytes())
    db_path = data_dir / 'ge360.sqlite3'

    def con():
        connection = sqlite3.connect(db_path, timeout=15)
        connection.row_factory = sqlite3.Row
        connection.execute('PRAGMA busy_timeout=15000')
        connection.execute('PRAGMA foreign_keys=ON')
        return connection
    with con() as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript('''
        CREATE TABLE IF NOT EXISTS surveys (
            id TEXT PRIMARY KEY,
            answers TEXT NOT NULL,
            counts TEXT NOT NULL,
            form_snapshot TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            archived INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS ix_surveys_updated ON surveys(updated_at DESC);
        CREATE TABLE IF NOT EXISTS photos (
            id TEXT PRIMARY KEY,
            survey_id TEXT NOT NULL,
            question_key TEXT NOT NULL,
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(survey_id) REFERENCES surveys(id)
        );
        ''')

    def config():
        return json.loads(cfg_file.read_text(encoding='utf8'))

    def utc():
        return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')

    app = FastAPI(title='GE360 Smart PWA', version='1.0.0', docs_url=None, redoc_url=None, openapi_url=None)
    attempts: dict[str, deque] = defaultdict(deque)

    def signed_session() -> str:
        stamp = str(int(time.time()))
        nonce = secrets.token_hex(16)
        value = f'{stamp}.{nonce}'
        mac = hmac.new(secret.encode(), value.encode(), hashlib.sha256).hexdigest()
        return f'{value}.{mac}'

    def valid_session(value: str | None) -> bool:
        if not value:
            return False
        try:
            stamp, nonce, sig = value.split('.')
            if not stamp.isdecimal() or len(nonce) != 32 or len(sig) != 64:
                return False
            age = time.time() - int(stamp)
            if not (0 <= age <= 14 * 24 * 60 * 60):
                return False
            correct = hmac.new(secret.encode(), f'{stamp}.{nonce}'.encode(), hashlib.sha256).hexdigest()
            return hmac.compare_digest(correct, sig)
        except (TypeError, ValueError):
            return False

    def auth(request: Request):
        if not valid_session(request.cookies.get(COOKIE)):
            raise HTTPException(status_code=401, detail='Accesso richiesto.')
        # Evita modifiche cross-origin in caso di configurazioni future sbagliate.
        if request.method in ('POST', 'PUT', 'PATCH', 'DELETE'):
            origin = request.headers.get('origin')
            if origin:
                from urllib.parse import urlsplit
                host = request.headers.get('host', '')
                if urlsplit(origin).netloc.lower() != host.lower():
                    raise HTTPException(status_code=403, detail='Origine non autorizzata.')
        return True

    def json_row(row, with_photos=True):
        result = {
            'id': row['id'], 'answers': json.loads(row['answers']),
            'counts': json.loads(row['counts']), 'form_snapshot': json.loads(row['form_snapshot']),
            'version': row['version'], 'created_at': row['created_at'],
            'updated_at': row['updated_at'], 'archived': bool(row['archived']),
        }
        if with_photos:
            with con() as db:
                result['photos'] = [dict(p) for p in db.execute(
                    'SELECT id, question_key, original_name, created_at FROM photos WHERE survey_id=? ORDER BY created_at DESC', (row['id'],))]
        return result

    def survey_or_404(survey_id: str):
        with con() as db:
            row = db.execute('SELECT * FROM surveys WHERE id=? AND archived=0', (survey_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail='Sopralluogo non trovato.')
        return row

    def validate_payload(data: Any):
        if not isinstance(data, dict):
            raise HTTPException(status_code=422, detail='JSON non valido.')
        if len(json.dumps(data, ensure_ascii=False)) > MAX_REQUEST_JSON:
            raise HTTPException(status_code=413, detail='Dati troppo grandi.')
        answers, counts = data.get('answers'), data.get('counts')
        if not isinstance(answers, dict) or len(answers) > 1200 or not isinstance(counts, dict):
            raise HTTPException(status_code=422, detail='Risposte o conteggi non validi.')
        for key, val in answers.items():
            if not isinstance(key, str) or len(key) > 180 or not isinstance(val, (str, int, float, bool, type(None))):
                raise HTTPException(status_code=422, detail='Campo risposta non valido.')
            if isinstance(val, str) and len(val) > 8000:
                raise HTTPException(status_code=422, detail=f'Testo troppo lungo: {key}')
        if isinstance(counts.get('walls', 0), bool) or not isinstance(counts.get('walls', 0), int) or not 0 <= counts.get('walls', 0) <= 40:
            raise HTTPException(status_code=422, detail='Numero di muri non valido (0-40).')
        for group in ('openings', 'excluded'):
            if not isinstance(counts.get(group, {}), dict):
                raise HTTPException(status_code=422, detail='Conteggi sottogruppi non validi.')
            for idx, n in counts.get(group, {}).items():
                if not str(idx).isdigit() or isinstance(n, bool) or not isinstance(n, int) or not 0 <= n <= 30:
                    raise HTTPException(status_code=422, detail='Conteggio aperture/esclusioni non valido (0-30).')
        return answers, counts

    @app.get('/api/health')
    def health():
        return {'ok': True, 'service': 'GE360 Smart', 'version': '1.0.0'}

    @app.get('/api/session')
    def session(request: Request):
        return {'logged_in': valid_session(request.cookies.get(COOKIE))}

    @app.post('/api/login')
    async def login(request: Request, response: Response):
        ip = request.client.host if request.client else 'unknown'
        dq = attempts[ip]
        now = time.monotonic()
        while dq and now - dq[0] > 900:
            dq.popleft()
        if len(dq) >= 8:
            raise HTTPException(status_code=429, detail='Troppi tentativi: riprova più tardi.')
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail='Formato non valido.')
        supplied = body.get('password', '') if isinstance(body, dict) else ''
        if not isinstance(supplied, str) or not hmac.compare_digest(password.encode(), supplied.encode()):
            dq.append(now)
            raise HTTPException(status_code=401, detail='Password non corretta.')
        dq.clear()
        response.set_cookie(COOKIE, signed_session(), max_age=14*24*3600, path='/',
                            secure=secure_cookie, httponly=True, samesite='strict')
        return {'ok': True}

    @app.post('/api/logout')
    def logout(response: Response, _: bool = Depends(auth)):
        response.delete_cookie(COOKIE, path='/', secure=secure_cookie, httponly=True, samesite='strict')
        return {'ok': True}

    @app.get('/api/config')
    def get_config(_: bool = Depends(auth)):
        return config()

    @app.put('/api/config')
    async def put_config(request: Request, _: bool = Depends(auth)):
        data = await request.json()
        try:
            validate_config(data)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        # Conserva sempre configurazione precedente, in caso di modifica errata.
        old = cfg_file.read_text(encoding='utf8')
        rev = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S') + '_' + secrets.token_hex(3)
        (data_dir / 'config_versions' / (rev + '.json')).write_text(old, encoding='utf8')
        temp = cfg_file.with_suffix('.new')
        temp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf8')
        temp.replace(cfg_file)
        return {'ok': True, 'version': data['version']}

    @app.get('/api/surveys')
    def list_surveys(_: bool = Depends(auth)):
        with con() as db:
            rows = db.execute('SELECT id, answers, version, updated_at FROM surveys WHERE archived=0 ORDER BY updated_at DESC LIMIT 500').fetchall()
        return [{
            'id': r['id'], 'version': r['version'], 'updated_at': r['updated_at'],
            'client': json.loads(r['answers']).get('cliente.nome', 'Cliente da inserire'),
            'room': json.loads(r['answers']).get('ambiente.nome', 'Bagno'),
            'address': json.loads(r['answers']).get('immobile.indirizzo', ''),
        } for r in rows]

    @app.post('/api/surveys', status_code=201)
    async def create_survey(request: Request, _: bool = Depends(auth)):
        body = await request.json()
        answers, counts = validate_payload(body)
        survey_id = body.get('id') or str(uuid.uuid4())
        try:
            if str(uuid.UUID(survey_id)) != survey_id:
                raise ValueError()
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail='ID sopralluogo non valido.')
        stamp = utc()
        with con() as db:
            try:
                db.execute('INSERT INTO surveys(id,answers,counts,form_snapshot,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
                           (survey_id, json.dumps(answers, ensure_ascii=False), json.dumps(counts),
                            json.dumps(config(), ensure_ascii=False), 1, stamp, stamp))
                db.commit()
            except sqlite3.IntegrityError:
                raise HTTPException(status_code=409, detail='Sopralluogo già presente. Ricarica i dati.')
        return json_row(survey_or_404(survey_id))

    @app.get('/api/surveys/{survey_id}')
    def get_survey(survey_id: str, _: bool = Depends(auth)):
        return json_row(survey_or_404(survey_id))

    @app.put('/api/surveys/{survey_id}')
    async def update_survey(survey_id: str, request: Request, _: bool = Depends(auth)):
        body = await request.json()
        answers, counts = validate_payload(body)
        expect = body.get('expected_version')
        if isinstance(expect, bool) or not isinstance(expect, int) or expect < 1:
            raise HTTPException(status_code=422, detail='expected_version obbligatorio.')
        stamp = utc()
        with con() as db:
            cur = db.execute('UPDATE surveys SET answers=?,counts=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND archived=0',
                             (json.dumps(answers, ensure_ascii=False), json.dumps(counts), stamp, survey_id, expect))
            db.commit()
            if cur.rowcount == 0:
                row = db.execute('SELECT version FROM surveys WHERE id=? AND archived=0', (survey_id,)).fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail='Sopralluogo non trovato.')
                raise HTTPException(status_code=409, detail=f'Conflitto: il server è alla versione {row["version"]}. Copia locale non sovrascritta.')
        return json_row(survey_or_404(survey_id))

    @app.delete('/api/surveys/{survey_id}')
    def archive_survey(survey_id: str, _: bool = Depends(auth)):
        with con() as db:
            cur = db.execute('UPDATE surveys SET archived=1, updated_at=? WHERE id=? AND archived=0', (utc(), survey_id))
            db.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail='Sopralluogo non trovato.')
        return {'ok': True, 'archived': True}

    @app.get('/api/surveys/{survey_id}/audit')
    def get_audit(survey_id: str, _: bool = Depends(auth)):
        s = json_row(survey_or_404(survey_id))
        return missing_and_rules(s['form_snapshot'], s['answers'], s['counts'])

    @app.get('/api/surveys/{survey_id}/prompt')
    def get_prompt(survey_id: str, _: bool = Depends(auth)):
        survey = json_row(survey_or_404(survey_id))
        name = f'GE360_PROMPT_{survey_id[:8]}.txt'
        return PlainTextResponse(build_prompt(survey), headers={'Content-Disposition': f'attachment; filename="{name}"', 'Cache-Control':'no-store'})

    @app.get('/api/surveys/{survey_id}/export')
    def get_export(survey_id: str, _: bool = Depends(auth)):
        survey = json_row(survey_or_404(survey_id))
        survey['audit'] = missing_and_rules(survey['form_snapshot'], survey['answers'], survey['counts'])
        return JSONResponse(survey, headers={'Content-Disposition': f'attachment; filename="GE360_RILIEVO_{survey_id[:8]}.json"', 'Cache-Control':'no-store'})

    @app.post('/api/surveys/{survey_id}/photos', status_code=201)
    async def upload_photo(survey_id: str, question_key: str = Form(...), file: UploadFile = File(...), _: bool = Depends(auth)):
        survey_or_404(survey_id)
        if len(question_key) > 180 or not question_key:
            raise HTTPException(status_code=422, detail='Riferimento foto non valido.')
        content = await file.read(MAX_IMAGE+1)
        if len(content) > MAX_IMAGE:
            raise HTTPException(status_code=413, detail='Foto troppo grande (massimo 8 MB).')
        try:
            with Image.open(io.BytesIO(content)) as original:
                if original.format not in ('JPEG','PNG','WEBP'):
                    raise ValueError('Tipo immagine non ammesso.')
                if original.width * original.height > 40_000_000:
                    raise ValueError('Risoluzione troppo elevata.')
                img = ImageOps.exif_transpose(original)
                img.thumbnail((1800, 1800))
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                output = io.BytesIO()
                img.save(output, format='JPEG', quality=83, optimize=True)
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
            raise HTTPException(status_code=422, detail=f'File immagine non valido: {exc}')
        photo_id = str(uuid.uuid4())
        filename = photo_id + '.jpg'
        (data_dir / 'photos' / filename).write_bytes(output.getvalue())
        try:
            with con() as db:
                db.execute('INSERT INTO photos VALUES(?,?,?,?,?,?)',
                           (photo_id, survey_id, question_key, filename, (file.filename or 'foto')[:180], utc()))
                db.commit()
        except Exception:
            (data_dir / 'photos' / filename).unlink(missing_ok=True)
            raise
        return {'id': photo_id, 'question_key': question_key, 'original_name': file.filename, 'size': len(output.getvalue())}

    @app.get('/api/photos/{photo_id}')
    def get_photo(photo_id: str, _: bool = Depends(auth)):
        with con() as db:
            row = db.execute('SELECT filename FROM photos WHERE id=?', (photo_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail='Foto inesistente.')
        return FileResponse(data_dir / 'photos' / row['filename'], media_type='image/jpeg', headers={'Cache-Control':'private, max-age=120'})

    @app.get('/api/backup')
    def download_backup(_: bool = Depends(auth)):
        # Backup consistente scritto su disco: non carica tutte le foto in RAM.
        with tempfile.NamedTemporaryFile(suffix='.sqlite3', dir=data_dir) as snap:
            with con() as db, sqlite3.connect(snap.name) as dest:
                db.backup(dest)
            with tempfile.NamedTemporaryFile(suffix='.zip', dir=data_dir, delete=False) as tmpzip:
                backup_path = Path(tmpzip.name)
            try:
                with zipfile.ZipFile(backup_path, mode='w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
                    z.write(snap.name, 'ge360.sqlite3')
                    z.write(cfg_file, 'active_checklist.json')
                    for f in sorted((data_dir / 'photos').glob('*.jpg')):
                        z.write(f, 'photos/' + f.name)
            except Exception:
                backup_path.unlink(missing_ok=True)
                raise
        stamp = dt.datetime.now().strftime('%Y%m%d-%H%M')
        return FileResponse(backup_path, media_type='application/zip', headers={
            'Content-Disposition': f'attachment; filename="GE360_BACKUP_{stamp}.zip"',
            'Cache-Control':'no-store'},
            background=BackgroundTask(lambda: backup_path.unlink(missing_ok=True)))

    # Il backend e la PWA sono nello stesso origin; niente CORS pubblico.
    app.mount('/', StaticFiles(directory=FRONT, html=True), name='frontend')
    return app


# L'ambiente deve essere configurato prima di avviare l'app in produzione.
# In test la factory create_app() riceve directory, password e segreto separati.
if os.environ.get('GE360_SKIP_DEFAULT_APP') == '1':
    app = FastAPI()
else:
    app = create_app()
