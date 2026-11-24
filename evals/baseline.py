"""ЛЗ 12, шаг 3: базовое решение без ИИ — правила по ключевым словам.

Те же правила работают на сайте (src/ai/rules.js). Тест test/lab12.test.js проверяет,
что JS и Python дают одинаковые ответы на всём наборе.

Запуск:  python evals/baseline.py
"""
import json
import os
import re
from datetime import datetime
from common import HERE, LABELS, load_dataset, metrics, print_metrics, save_run

# Правила лежат в evals/rules.json — тот же файл читает сайт (src/ai/rules.js).
# Порядок важен: первое совпадение побеждает, неотложные случаи проверяются первыми.
with open(os.path.join(HERE, 'rules.json'), encoding='utf-8') as _f:
    _cfg = json.load(_f)
RULES = _cfg['rules']
DEFAULT = _cfg['default']  # ни одно правило не сработало — к терапевту на первичный осмотр
COMPILED = [(label, re.compile(rx, re.IGNORECASE)) for label, rx in RULES]


def classify(text):
    for label, rx in COMPILED:
        if rx.search(text):
            return label
    return DEFAULT


if __name__ == '__main__':
    data = load_dataset()
    rows = []
    for x in data:
        pred = classify(x['text'])
        rows.append({'id': x['id'], 'text': x['text'], 'label': x['label'], 'pred': pred, 'hard': x['hard']})
    m = metrics([r['label'] for r in rows], [r['pred'] for r in rows], [r['hard'] for r in rows])
    print_metrics('Правила без ИИ', m)
    meta = {'approach': 'baseline-rules', 'rules': len(RULES), 'date': datetime.now().isoformat(timespec='seconds'),
            'labels': LABELS, 'metrics': {k: v for k, v in m.items() if k not in ('per_class', 'confusion')},
            'per_class': m['per_class'], 'confusion': m['confusion']}
    print('сохранено:', save_run('baseline', rows, meta))
    print('\nОшибки:')
    for r in rows:
        if r['pred'] != r['label']:
            print(f"  #{r['id']:>2} «{r['text']}» → {r['pred']} (эталон: {r['label']})")
