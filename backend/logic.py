"""Regole deterministiche e generatore di prompt per GE360 Smart.

Non assegna automaticamente prezzi né conferma lavori non verificati.
I campi di schema sono quelli della checklist bagno V1 originale.
"""
from __future__ import annotations
import datetime as dt
import json
import math
import re
from decimal import Decimal, InvalidOperation
from typing import Any

PREFIXES = {
    'cliente': 'Identificazione', 'immobile': 'Identificazione',
    'ambiente': 'Identificazione', 'sopralluogo': 'Identificazione',
    'interventi': 'Interventi scelti', 'geometria': 'Misure e pareti',
    'stato': 'Stato attuale', 'demolizione': 'Demolizioni',
    'pavimento': 'Nuovo pavimento', 'pareti': 'Rivestimenti pareti',
    'logistica': 'Logistica', 'controllo': 'Controlli finali',
}


def as_num(value: Any) -> float | None:
    if value is None or isinstance(value, bool) or value == '':
        return None
    try:
        n = float(str(value).strip().replace(',', '.'))
    except (TypeError, ValueError):
        return None
    return n if math.isfinite(n) else None


def evaluate(condition: Any, answers: dict[str, Any]) -> bool:
    """Piccolo DSL sicuro: non esegue codice o espressioni arbitrarie."""
    if not condition:
        return True
    if not isinstance(condition, dict) or len(condition) != 1:
        return False
    if 'eq' in condition:
        item = condition['eq']
        return (isinstance(item, list) and len(item) == 2
                and answers.get(item[0]) == item[1])
    if 'all' in condition:
        return isinstance(condition['all'], list) and all(evaluate(c, answers) for c in condition['all'])
    if 'any' in condition:
        return isinstance(condition['any'], list) and any(evaluate(c, answers) for c in condition['any'])
    if 'not' in condition:
        return not evaluate(condition['not'], answers)
    return False


def expand_question(question: dict, counts: dict) -> list[dict]:
    """Espande i campi ripetuti preservando l'identità della parete."""
    path = question['id']
    if '[]' not in path:
        return [question]
    walls = max(0, min(40, int(counts.get('walls', 0))))
    expanded = []
    for w in range(walls):
        wp = path.replace('muri[]', f'muri[{w}]', 1)
        if 'aperture[]' in wp:
            num = max(0, min(30, int(counts.get('openings', {}).get(str(w), 0))))
            for a in range(num):
                expanded.append(dict(question, id=wp.replace('aperture[]', f'aperture[{a}]')))
        elif 'zone_escluse[]' in wp:
            num = max(0, min(30, int(counts.get('excluded', {}).get(str(w), 0))))
            for a in range(num):
                expanded.append(dict(question, id=wp.replace('zone_escluse[]', f'zone_escluse[{a}]')))
        else:
            expanded.append(dict(question, id=wp))
    return expanded


def visible(question: dict, answers: dict) -> bool:
    return evaluate(question.get('visible_when'), answers)


def expanded_visible(question: dict, expanded_key: str, answers: dict, form: dict) -> bool:
    """Condizione per muro, aggiuntiva rispetto alla regola globale."""
    if not visible(question, answers):
        return False
    match = re.search(r'muri\[(\d+)\]', expanded_key)
    if not match:
        return True
    w = match.group(1)
    if question['id'].startswith('pareti.muri[].fascia_'):
        return answers.get(f'pareti.muri[{w}].posa') == 'si'
    if question['id'].startswith('demolizione.muri[].fascia_'):
        # Retrocompatibilità con checklist V1 antecedenti alla scelta per muro.
        has_switch = any(q['id'] == 'demolizione.muri[].demolisci' for q in form['questions'])
        return not has_switch or answers.get(f'demolizione.muri[{w}].demolisci') == 'si'
    return True


def missing_and_rules(form: dict, answers: dict, counts: dict) -> dict:
    missing: list[dict] = []
    for question in form.get('questions', []):
        if not visible(question, answers) or not question.get('required_when_visible'):
            continue
        for item in expand_question(question, counts):
            if not expanded_visible(question, item['id'], answers, form):
                continue
            value = answers.get(item['id'])
            if value is None or value == '' or value == [] or value in ('da_verificare', 'da_definire'):
                missing.append({'field': item['id'], 'label': item['label']})
    issues = [
        {'id': r['id'], 'severity': r['severity'], 'message': r['message']}
        for r in form.get('rules', []) if evaluate(r.get('when'), answers)
    ]
    for question in form.get('questions', []):
        if question.get('type') not in ('decimal', 'integer') or not visible(question, answers):
            continue
        for item in expand_question(question, counts):
            if not expanded_visible(question, item['id'], answers, form):
                continue
            raw = answers.get(item['id'])
            if raw in (None, ''):
                continue
            value = as_num(raw)
            bad_integer = value is not None and question['type'] == 'integer' and not value.is_integer()
            bad_negative = value is not None and value < 0 and item['id'] != 'immobile.piano'
            if value is None or bad_integer or bad_negative:
                issues.append({'id': 'NUM', 'severity': 'block',
                    'message': f"Valore numerico non valido: {item['id']} = {raw}"})
    measures = calculate_measures(answers, counts)
    if 'geometry_errors' in measures:
        issues.extend({'id': 'GEO', 'severity': 'block', 'message': x} for x in measures['geometry_errors'])
    if answers.get('interventi.rivestimento_pareti') == 'si' and counts.get('walls', 0) == 0:
        issues.append({'id': 'WALLS', 'severity': 'block', 'message': 'Aggiungi almeno una parete da rilevare.'})
    # Il sopralluogo resta BOZZA fino alla conferma umana e contrattuale della V3.1.
    return {'missing': missing, 'issues': issues, 'ready_for_draft': True,
            'ready_for_final_review': not missing and not any(i['severity'] == 'block' for i in issues),
            'measures': measures}


def _round(v: float) -> float:
    return round(v + 1e-9, 3)


def calculate_measures(a: dict, counts: dict) -> dict:
    errors: list[str] = []
    shape = a.get('geometria.forma')
    if shape == 'rettangolare':
        l, w = as_num(a.get('geometria.lunghezza')), as_num(a.get('geometria.larghezza'))
        floor = l * w if l is not None and w is not None and l > 0 and w > 0 else None
        perimeter = 2 * (l + w) if floor is not None else None
        if floor is None:
            errors.append('Dimensioni del bagno non valide: lunghezza e larghezza devono essere maggiori di zero.')
    elif shape == 'irregolare':
        floor = as_num(a.get('geometria.superficie_rilevata'))
        if floor is None or floor <= 0:
            errors.append('Per una stanza irregolare serve una superficie rilevata positiva.')
            floor = None
        perimeter = None
    else:
        floor, perimeter = None, None

    data = {'floor_m2': _round(floor) if floor is not None else None,
            'perimeter_m': _round(perimeter) if perimeter is not None else None,
            'walls': [], 'demolition_wall_m2': 0.0,
            'new_wall_covering_m2': 0.0,
            'measurement_notes': [
                'Quantità geometriche indicative: non sostituiscono i criteri contrattuali di misurazione.',
                'Le zone escluse e le facce delle nicchie devono essere verificate manualmente; non sono detratte/aggiunte automaticamente.',
                'Verificare che le aperture inserite non si sovrappongano: non è nota la posizione orizzontale.'
            ]}
    has_demo = False
    has_new = False
    for w in range(min(40, max(0, int(counts.get('walls', 0))))):
        prefix = f'geometria.muri[{w}]'
        length, height = as_num(a.get(prefix + '.lunghezza')), as_num(a.get(prefix + '.altezza'))
        if length is None or height is None or length <= 0 or height <= 0:
            # Non generare quantità tratte da dati parziali.
            if a.get(prefix + '.id') or a.get(prefix + '.lunghezza') or a.get(prefix + '.altezza'):
                errors.append(f'Parete {w+1}: lunghezza/altezza mancanti o non positive.')
            continue
        wall = {'index': w + 1, 'name': a.get(prefix + '.id') or f'M{w+1}',
                'length_m': length, 'height_m': height, 'gross_m2': _round(length * height)}

        def band(project: str, active: bool) -> dict | None:
            if not active:
                return None
            start = as_num(a.get(f'{project}.muri[{w}].fascia_da'))
            end = as_num(a.get(f'{project}.muri[{w}].fascia_a'))
            if start is None or end is None:
                return None
            if start < 0 or end <= start or end > height + .0001:
                errors.append(f'Parete {w+1}: fascia {project} non valida (0 ≤ inizio < fine ≤ altezza).')
                return None
            gross = length * (end - start)
            openings = 0.0
            for j in range(max(0, min(30, int(counts.get('openings', {}).get(str(w), 0))))):
                op = f'{prefix}.aperture[{j}]'
                ow, oh, base = [as_num(a.get(op + '.' + k)) for k in ('larghezza', 'altezza', 'quota_base')]
                if ow is None or oh is None or base is None:
                    continue
                if ow <= 0 or oh <= 0 or base < 0 or base + oh > height + .0001 or ow > length + .0001:
                    errors.append(f'Parete {w+1}: apertura {j+1} non valida.')
                    continue
                overlap = max(0.0, min(base + oh, end) - max(base, start))
                openings += ow * overlap
            if openings > gross + .0001:
                errors.append(f'Parete {w+1}: superficie aperture maggiore della fascia {project}.')
                return None
            return {'from_m': start, 'to_m': end, 'gross_m2': _round(gross),
                    'openings_m2': _round(openings), 'net_m2': _round(gross - openings)}

        demo_active = (a.get('interventi.demolizione_rivestimenti') == 'si' and a.get('demolizione.pareti') == 'si'
                       and a.get(f'demolizione.muri[{w}].demolisci', 'si') == 'si')
        new_active = a.get('interventi.rivestimento_pareti') == 'si' and a.get(f'pareti.muri[{w}].posa') == 'si'
        bd = band('demolizione', demo_active)
        bn = band('pareti', new_active)
        if demo_active:
            has_demo = True
        if new_active:
            has_new = True
        if bd:
            data['demolition_wall_m2'] += bd['net_m2']
        if bn:
            data['new_wall_covering_m2'] += bn['net_m2']
        wall['demolition'] = bd
        wall['new_covering'] = bn
        data['walls'].append(wall)
    if has_demo and not any(w.get('demolition') for w in data['walls']):
        data['demolition_wall_m2'] = None
    else:
        data['demolition_wall_m2'] = _round(data['demolition_wall_m2'])
    if has_new and not any(w.get('new_covering') for w in data['walls']):
        data['new_wall_covering_m2'] = None
    else:
        data['new_wall_covering_m2'] = _round(data['new_wall_covering_m2'])
    data['new_floor_m2'] = as_num(a.get('pavimento.superficie_posa')) if a.get('interventi.nuovo_pavimento') == 'si' else None
    data['demolition_floor_m2'] = as_num(a.get('demolizione.pavimento_area')) if a.get('demolizione.pavimento') == 'si' else None
    # Non usare quantità negative anche quando fornite dall'utente.
    for k in ('new_floor_m2', 'demolition_floor_m2'):
        if data[k] is not None and data[k] < 0:
            errors.append(f'Valore negativo non ammesso per {k}.')
            data[k] = None
    if errors:
        data['geometry_errors'] = errors
    return data


def build_prompt(survey: dict) -> str:
    a = survey['answers']
    form = survey['form_snapshot']
    counts = survey.get('counts', {})
    checks = missing_and_rules(form, a, counts)
    m = checks['measures']
    out = [
        'GE360 SMART SOPRALLUOGO — DATI PER GPT PREVENTIVI PREMIUM V3.1',
        'Documento di trasferimento dati, NON un preventivo DEFINITIVO già approvato.',
        'ISTRUZIONI AL GPT:',
        'Genera soltanto una BOZZA del preventivo con istruzioni e asset V3.1 già disponibili nel GPT.',
        'Non inventare quantità, prezzi, forniture, validità, IVA o condizioni contrattuali.',
        'Distingui ciò che è confermato da ciò che è da verificare o escluso.',
        'Usa il listino V3.1 solo come riferimento; chiedi conferma dei prezzi e delle inclusioni.',
        'Non duplicare demolizione, intonaci, battiscopa, impermeabilizzazioni o smaltimenti.',
        'Segnala criticità tecniche e i blocchi prima di qualunque emissione DEFINITIVA.',
        '', 'IDENTIFICAZIONE',
        f"Cliente: {a.get('cliente.nome') or 'NON INDICATO'}",
        f"Telefono: {a.get('cliente.telefono') or 'NON INDICATO'}",
        f"Indirizzo: {a.get('immobile.indirizzo') or 'NON INDICATO'}",
        f"Piano: {a.get('immobile.piano') if a.get('immobile.piano') not in (None, '') else 'NON INDICATO'}",
        f"Ambiente: {a.get('ambiente.nome') or 'Bagno'}",
        f"Data rilievo: {a.get('sopralluogo.data') or 'NON INDICATA'}",
        f"Modalità prezzo: {a.get('controllo.tipo_prezzo') or 'NON DEFINITA'}",
        '', 'MISURE CALCOLATE (geometriche, da verificare per computo)',
        json.dumps(m, ensure_ascii=False, indent=2),
        '', 'RACCOLTA DELLE RISPOSTE',
    ]
    for prefix in ('cliente', 'immobile', 'ambiente', 'sopralluogo', 'interventi', 'geometria', 'stato', 'demolizione', 'pavimento', 'pareti', 'logistica', 'controllo'):
        relevant = [(key, value) for key, value in sorted(a.items()) if key.split('.')[0] == prefix and value not in (None, '', [])]
        if relevant:
            out.append(f"\n[{PREFIXES.get(prefix,prefix).upper()}]")
            for key, val in relevant:
                out.append(f'{key}: {val}')
    out.extend(['', 'FOTO ALLEGATE (non incluse nel prompt testuale)'])
    photos = survey.get('photos', [])
    if photos:
        for p in photos:
            out.append(f"{p.get('question_key', 'foto')}: allegato {p.get('id','')} — da condividere separatamente al GPT")
    else:
        out.append('Nessuna foto salvata sul server; caricarle separatamente se necessarie.')
    out.extend(['', 'CONTROLLI E DATI NON RISOLTI'])
    for issue in checks['issues']:
        out.append(f"[{issue['severity'].upper()}] {issue['message']}")
    for q in checks['missing']:
        out.append(f"[MANCANTE] {q['field']}: {q['label']}")
    if not checks['missing'] and not checks['issues']:
        out.append('Nessuna anomalia automatica rilevata. Necessaria comunque validazione umana/commerciale.')
    out.extend(['', 'OUTPUT RICHIESTO:',
                '1) Esamina incongruenze e informazioni da confermare.',
                '2) Prepara il computo con quantità distinte da quelle da verificare.',
                '3) Genera una BOZZA in grafica Premium V3.1; non trattarla come definitiva.',
                '4) Per la versione definitiva attendi conferma umana esplicita di tutti gli importi e delle condizioni.',
                'FINE DATI GE360'])
    return '\n'.join(out) + '\n'


def validate_config(config: Any) -> None:
    if not isinstance(config, dict) or not isinstance(config.get('questions'), list) or not isinstance(config.get('rules'), list):
        raise ValueError('La configurazione deve avere questions e rules come liste.')
    if not config.get('version') or len(config['questions']) > 500:
        raise ValueError('Versione mancante oppure troppe domande (>500).')
    ids = set()
    for q in config['questions']:
        if not isinstance(q, dict) or not isinstance(q.get('id'), str) or not isinstance(q.get('label'), str):
            raise ValueError('Una domanda non ha id o label validi.')
        if not re.fullmatch(r'[a-zA-Z0-9_.\[\]-]{1,120}', q['id']):
            raise ValueError(f"ID non valido: {q['id']}")
        if q['id'] in ids:
            raise ValueError(f"Domanda duplicata: {q['id']}")
        ids.add(q['id'])
        if q.get('type') not in ('text','phone','date','integer','decimal','choice','multitext','photo'):
            raise ValueError(f"Tipo non supportato: {q.get('type')}")
        if q.get('type') == 'choice' and not isinstance(q.get('options'), list):
            raise ValueError(f"Opzioni mancanti: {q['id']}")
    for r in config['rules']:
        if not isinstance(r, dict) or r.get('severity') not in ('block','review','suggest') or not isinstance(r.get('message'),str):
            raise ValueError('Regola non valida.')
