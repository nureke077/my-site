"""ЛЗ 12, шаг 8: прогон модели через Ollama — промпт без примеров и few-shot.

Перед запуском:
  1. Установите Ollama: https://ollama.com/download
  2. ollama pull qwen2.5:3b
  3. python evals/run_llm.py            (или двойной щелчок по run_lab12.bat)

Параметры: температура 0, seed 42. Сырые ответы и число токенов (prompt_eval_count — это длина,
измеренная токенизатором самой модели) сохраняются в evals/runs/<подход>.jsonl.
Внешние пакеты не нужны — только стандартная библиотека Python.
"""
import json
import os
import sys
import time
import urllib.request
from datetime import datetime
from common import HERE, load_dataset, metrics, normalize, print_metrics, save_run

OLLAMA = os.environ.get('OLLAMA_URL', 'http://localhost:11434')
MODEL = os.environ.get('OLLAMA_MODEL', 'qwen2.5:3b')
OPTIONS = {'temperature': 0, 'seed': 42, 'num_predict': 12}

# Промпт и примеры few-shot — в evals/prompts.json (тот же файл использует сайт).
# Примеры few-shot НЕ входят в набор оценки.
with open(os.path.join(HERE, 'prompts.json'), encoding='utf-8') as _f:
    _P = json.load(_f)
INSTRUCTION = _P['instruction']
FEW_SHOT = _P['few_shot']
PROMPT_VERSION = _P['version']

PROMPTS = {
    'zero-shot': lambda text: f'{INSTRUCTION}\n\nЖалоба: {text}\nКатегория:',
    'few-shot': lambda text: INSTRUCTION + '\n\nПримеры:\n' +
        '\n'.join(f'Жалоба: {t}\nКатегория: {l}' for t, l in FEW_SHOT) + f'\n\nЖалоба: {text}\nКатегория:',
}


def call(prompt):
    body = json.dumps({'model': MODEL, 'prompt': prompt, 'stream': False, 'options': OPTIONS}).encode()
    req = urllib.request.Request(f'{OLLAMA}/api/generate', data=body, headers={'Content-Type': 'application/json'})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=300) as r:
        d = json.load(r)
    return d, time.time() - t0


def model_version():
    try:
        body = json.dumps({'model': MODEL}).encode()
        req = urllib.request.Request(f'{OLLAMA}/api/show', data=body, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.load(r)
        det = d.get('details', {})
        return {'family': det.get('family'), 'parameter_size': det.get('parameter_size'),
                'quantization': det.get('quantization_level'), 'digest': d.get('digest') or d.get('modified_at')}
    except Exception as e:  # noqa: BLE001
        return {'error': str(e)}


def main():
    try:
        urllib.request.urlopen(f'{OLLAMA}/api/tags', timeout=5)
    except Exception:
        sys.exit(f'Ollama не отвечает на {OLLAMA}. Запустите Ollama и выполните: ollama pull {MODEL}')
    data = load_dataset()
    version = model_version()
    for name, build in PROMPTS.items():
        rows = []
        for x in data:
            d, secs = call(build(x['text']))
            raw = d.get('response', '')
            rows.append({'id': x['id'], 'text': x['text'], 'label': x['label'], 'hard': x['hard'],
                         'raw': raw, 'pred': normalize(raw), 'prompt_tokens': d.get('prompt_eval_count'),
                         'output_tokens': d.get('eval_count'), 'seconds': round(secs, 2)})
            print(f"{name} #{x['id']:>2}: {raw.strip()!r} → {rows[-1]['pred']}")
        m = metrics([r['label'] for r in rows], [r['pred'] for r in rows], [r['hard'] for r in rows])
        print_metrics(f'{MODEL}, {name}', m)
        tok = [r['prompt_tokens'] for r in rows if r['prompt_tokens']]
        meta = {'approach': name, 'prompt_version': PROMPT_VERSION, 'model': MODEL, 'model_version': version, 'options': OPTIONS,
                'ollama_url': OLLAMA, 'date': datetime.now().isoformat(timespec='seconds'),
                'prompt_template': build('{text}'),
                'avg_prompt_tokens': sum(tok) / len(tok) if tok else None,
                'avg_output_tokens': sum(r['output_tokens'] or 0 for r in rows) / len(rows),
                'avg_seconds': sum(r['seconds'] for r in rows) / len(rows),
                'metrics': {k: v for k, v in m.items() if k not in ('per_class', 'confusion')},
                'per_class': m['per_class'], 'confusion': m['confusion']}
        print('сохранено:', save_run(name, rows, meta))
    print('\nГотово. Теперь: python evals/report.py')


if __name__ == '__main__':
    main()
