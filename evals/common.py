"""Общее для ЛЗ 12: загрузка набора, метрики (без внешних пакетов), сохранение прогонов.

Метрики считаются так же, как в sklearn:
  accuracy  — доля верных ответов;
  macro F1  — среднее F1 по классам (каждый класс весит одинаково, большой класс не маскирует маленькие).
Ответ «не уверен» (отказ) считается неверным для accuracy и F1 — это строгая оценка.
Отдельно считаются покрытие (доля ответов без отказа) и точность на ответах.
"""
import json
import os
from collections import Counter

LABELS = ['терапия', 'дерматология', 'хирургия', 'стоматология', 'офтальмология', 'неотложно']
ABSTAIN = 'не уверен'
HERE = os.path.dirname(os.path.abspath(__file__))


def load_dataset(path=os.path.join(HERE, 'dataset.jsonl')):
    with open(path, encoding='utf-8') as f:
        return [json.loads(line) for line in f if line.strip()]


def per_class(true, pred):
    out = {}
    for c in LABELS:
        tp = sum(1 for t, p in zip(true, pred) if t == c and p == c)
        fp = sum(1 for t, p in zip(true, pred) if t != c and p == c)
        fn = sum(1 for t, p in zip(true, pred) if t == c and p != c)
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        out[c] = {'precision': prec, 'recall': rec, 'f1': f1, 'support': tp + fn}
    return out


def metrics(true, pred, hard=None):
    n = len(true)
    answered = [(t, p) for t, p in zip(true, pred) if p != ABSTAIN]
    cls = per_class(true, pred)
    m = {
        'n': n,
        'accuracy': sum(t == p for t, p in zip(true, pred)) / n,
        'macro_f1': sum(v['f1'] for v in cls.values()) / len(LABELS),
        'coverage': len(answered) / n,
        'accuracy_answered': (sum(t == p for t, p in answered) / len(answered)) if answered else 0.0,
        'abstained': n - len(answered),
        'per_class': cls,
        'confusion': {t: dict(Counter(p for tt, p in zip(true, pred) if tt == t)) for t in LABELS},
    }
    if hard is not None:
        hp = [(t, p) for t, p, h in zip(true, pred, hard) if h]
        m['hard_accuracy'] = sum(t == p for t, p in hp) / len(hp) if hp else 0.0
        m['hard_n'] = len(hp)
    return m


def normalize(answer):
    """Приводит ответ модели к одному из классов или к отказу."""
    a = (answer or '').strip().lower().strip('.«»"\' \n')
    if not a:
        return ABSTAIN
    if 'не уверен' in a:
        return ABSTAIN
    hits = [c for c in LABELS if c in a]
    return hits[0] if len(hits) == 1 else ABSTAIN  # ни одной или несколько категорий — отказ


def save_run(name, rows, meta):
    os.makedirs(os.path.join(HERE, 'runs'), exist_ok=True)
    path = os.path.join(HERE, 'runs', f'{name}.jsonl')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(json.dumps({'meta': meta}, ensure_ascii=False) + '\n')
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    return path


def print_metrics(title, m):
    print(f'\n== {title} ==')
    print(f"accuracy: {m['accuracy']:.3f}   macro F1: {m['macro_f1']:.3f}   "
          f"покрытие: {m['coverage']:.2f}   точность на ответах: {m['accuracy_answered']:.3f}")
    if 'hard_accuracy' in m:
        print(f"сложные примеры ({m['hard_n']}): accuracy {m['hard_accuracy']:.3f}")
    for c, v in m['per_class'].items():
        print(f"  {c:<14} P={v['precision']:.2f} R={v['recall']:.2f} F1={v['f1']:.2f} (n={v['support']})")
