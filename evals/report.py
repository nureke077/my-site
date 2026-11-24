"""ЛЗ 12: сводная таблица по всем прогонам из evals/runs/ → evals/results.md

Запуск:  python evals/report.py
"""
import json
import os
from common import LABELS, HERE

ORDER = ['baseline', 'zero-shot', 'few-shot']


def load(name):
    path = os.path.join(HERE, 'runs', f'{name}.jsonl')
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        lines = [json.loads(s) for s in f if s.strip()]
    return lines[0]['meta'], lines[1:]


def main():
    runs = {n: load(n) for n in ORDER}
    have = [n for n in ORDER if runs[n]]
    out = ['# ЛЗ 12. Результаты замера', '']
    out.append('| Подход | Дата | accuracy | macro F1 | покрытие | точность на ответах | сложные (accuracy) |')
    out.append('|---|---|---|---|---|---|---|')
    for n in have:
        meta, _ = runs[n]
        m = meta['metrics']
        out.append(f"| {n} | {meta['date']} | {m['accuracy']:.3f} | {m['macro_f1']:.3f} | {m['coverage']:.2f} | "
                   f"{m['accuracy_answered']:.3f} | {m.get('hard_accuracy', 0):.3f} |")
    out += ['', '## F1 по классам', '', '| Класс | ' + ' | '.join(have) + ' |', '|---|' + '---|' * len(have)]
    for c in LABELS:
        out.append(f'| {c} | ' + ' | '.join(f"{runs[n][0]['per_class'][c]['f1']:.2f}" for n in have) + ' |')
    for n in have:
        meta, rows = runs[n]
        if meta.get('model'):
            out += ['', f'## Параметры прогона {n}', '',
                    f"- модель: {meta['model']} {meta.get('model_version')}",
                    f"- параметры: {meta['options']}",
                    f"- средняя длина запроса: {meta['avg_prompt_tokens']:.0f} токенов (токенизатор модели, prompt_eval_count)",
                    f"- средняя длина ответа: {meta['avg_output_tokens']:.1f} токенов; среднее время: {meta['avg_seconds']:.2f} с"]
        errs = [r for r in rows if r['pred'] != r['label']]
        out += ['', f'## Ошибки: {n} ({len(errs)})', '']
        out += [f"- #{r['id']} «{r['text']}» → {r['pred']} (эталон: {r['label']})" + (f"; сырой ответ: {r['raw'].strip()!r}" if 'raw' in r else '') for r in errs]
    path = os.path.join(HERE, 'results.md')
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out) + '\n')
    print('\n'.join(out))
    print('\nсохранено:', path)
    missing = [n for n in ORDER if not runs[n]]
    if missing:
        print('Нет прогонов:', ', '.join(missing), '— запустите python evals/run_llm.py')


if __name__ == '__main__':
    main()
