"""ЛЗ 12, шаг 5: согласие двух разметчиков (каппа Коэна) и перенос эталонов в dataset.jsonl.

1. Два участника НЕЗАВИСИМО заполняют столбцы labeler_a и labeler_b в evals/labeling.csv
   (открывается в Excel / LibreOffice; разделитель «;»). Категории: терапия, дерматология,
   хирургия, стоматология, офтальмология, неотложно.
2. python evals/agreement.py            — покажет согласие и список расхождений.
3. Расхождения разберите с заказчиком, его решение впишите в столбец final.
4. python evals/agreement.py --apply    — перенесёт final в dataset.jsonl как эталон.
Эталоны нельзя получать той же моделью, которую проверяете.
"""
import csv
import json
import os
import sys
from collections import Counter
from common import HERE, LABELS

PATH = os.path.join(HERE, 'labeling.csv')


def kappa(a, b):
    n = len(a)
    po = sum(x == y for x, y in zip(a, b)) / n
    ca, cb = Counter(a), Counter(b)
    pe = sum(ca[k] * cb[k] for k in set(a) | set(b)) / (n * n)
    return (po - pe) / (1 - pe) if pe < 1 else 1.0


def main():
    with open(PATH, encoding='utf-8-sig') as f:
        rows = list(csv.DictReader(f, delimiter=';'))
    done = [r for r in rows if r['labeler_a'].strip() and r['labeler_b'].strip()]
    if not done:
        sys.exit('В labeling.csv ещё нет разметки двух участников.')
    bad = [r for r in done if r['labeler_a'].strip() not in LABELS or r['labeler_b'].strip() not in LABELS]
    if bad:
        sys.exit('Неизвестная категория в строках: ' + ', '.join(r['id'] for r in bad))
    a = [r['labeler_a'].strip() for r in done]
    b = [r['labeler_b'].strip() for r in done]
    print(f'Размечено обоими: {len(done)} из {len(rows)}')
    print(f'Совпадение: {sum(x == y for x, y in zip(a, b)) / len(done):.2f}   каппа Коэна: {kappa(a, b):.2f}')
    diff = [r for r in done if r['labeler_a'].strip() != r['labeler_b'].strip()]
    for r in diff:
        print(f"  #{r['id']} «{r['text']}»: {r['labeler_a']} / {r['labeler_b']} → итог: {r['final'] or '???'}")
    if '--apply' in sys.argv:
        final = {int(r['id']): (r['final'].strip() or (r['labeler_a'].strip() if r['labeler_a'].strip() == r['labeler_b'].strip() else '')) for r in rows}
        missing = [i for i, v in final.items() if v not in LABELS]
        if missing:
            sys.exit(f'Нет итогового эталона для: {missing}. Заполните столбец final.')
        path = os.path.join(HERE, 'dataset.jsonl')
        data = [json.loads(s) for s in open(path, encoding='utf-8')]
        for x in data:
            x['label'] = final[x['id']]
            x['labeled_by'] = 'два участника команды, расхождения — по решению заказчика'
        with open(path, 'w', encoding='utf-8') as f:
            f.writelines(json.dumps(x, ensure_ascii=False) + '\n' for x in data)
        print('Эталоны перенесены в dataset.jsonl. Перезапустите baseline.py и run_llm.py.')


if __name__ == '__main__':
    main()
