"""ЛЗ 13. Еженедельный статус-отчёт проекта: факты из GitHub API → черновик (Ollama) → автопроверка чисел.

Принцип: все числа считает этот скрипт, модель только формулирует текст вокруг готовых чисел.
Без модели (Ollama не запущена, или запуск в GitHub Actions) получается отчёт-шаблон без ИИ.

Запуск:
  python scripts/weekly_status.py                         # прошедшие 7 дней
  python scripts/weekly_status.py --sprints 2             # две последние полные недели (два спринта)
  python scripts/weekly_status.py --from 2026-11-17 --to 2026-11-23
  python scripts/weekly_status.py --gh                    # брать данные через утилиту gh (авторизованно)
Переменные: GITHUB_REPO (по умолчанию nureke077/my-site), GH_TOKEN или GITHUB_TOKEN (необязательно),
            OLLAMA_URL (http://localhost:11434), OLLAMA_MODEL (qwen2.5:3b).
Результат: reports/status-<дата окончания>.md и reports/status-<дата>.json (факты, промпт, сырой ответ).
Только стандартная библиотека Python.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = os.environ.get('GITHUB_REPO', 'nureke077/my-site')
OLLAMA = os.environ.get('OLLAMA_URL', 'http://localhost:11434')
MODEL = os.environ.get('OLLAMA_MODEL', 'qwen2.5:3b')
PROMPT = open(os.path.join(HERE, 'pm_prompt.txt'), encoding='utf-8').read()
PROMPT_VERSION = open(os.path.join(HERE, 'pm_prompt.version'), encoding='utf-8').read().strip()
IN_PROGRESS = re.compile(r'in progress|в работе|doing', re.I)
BLOCKED = re.compile(r'blocked|заблок', re.I)
DEPLOY = re.compile(r'deploy|pages|release|релиз|развёрт', re.I)
EVALUATIVE = ['отлично', 'успешно', 'к сожалению', 'значительно', 'хорошо', 'плохо', 'прекрасно', 'впечатляющ']


def gh_api(path, use_cli):
    if use_cli:
        out = subprocess.run(['gh', 'api', path], capture_output=True, text=True, encoding='utf-8')
        if out.returncode:
            raise RuntimeError(out.stderr.strip())
        return json.loads(out.stdout)
    req = urllib.request.Request('https://api.github.com' + path, headers={
        'Accept': 'application/vnd.github+json', 'User-Agent': 'doktor-khvost-pm-assistant'})
    token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def in_period(iso, a, b):
    return bool(iso) and a <= iso[:10] <= b


def collect(repo, a, b, use_cli):
    since, until = f'{a}T00:00:00Z', f'{b}T23:59:59Z'
    commits = gh_api(f'/repos/{repo}/commits?since={since}&until={until}&per_page=100', use_cli)
    issues = [i for i in gh_api(f'/repos/{repo}/issues?state=all&since={since}&per_page=100', use_cli) if 'pull_request' not in i]
    open_ = [i for i in gh_api(f'/repos/{repo}/issues?state=open&per_page=100', use_cli) if 'pull_request' not in i]
    pulls = gh_api(f'/repos/{repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100', use_cli)
    runs = gh_api(f'/repos/{repo}/actions/runs?created={a}..{b}&per_page=100', use_cli).get('workflow_runs', [])
    labels = lambda i: ' '.join(l['name'] for l in i.get('labels', []))  # noqa: E731
    deploy = [r for r in runs if DEPLOY.search(r.get('name') or '')]
    closed = [i for i in issues if in_period(i.get('closed_at'), a, b)]
    blocked = [i for i in open_ if BLOCKED.search(labels(i))]
    return {
        'repo': repo, 'period': {'from': a, 'to': b},
        'commits': {'count': len(commits), 'authors_count': len({(c.get('author') or {}).get('login') or c['commit']['author']['name'] for c in commits})},
        'issues': {'opened': sum(in_period(i['created_at'], a, b) for i in issues), 'closed': len(closed),
                   'open_now': len(open_), 'in_progress': sum(bool(IN_PROGRESS.search(labels(i))) for i in open_),
                   'blocked': len(blocked), 'closed_titles': [f"#{i['number']} {i['title']}" for i in closed[:10]],
                   'blocked_titles': [f"#{i['number']} {i['title']}" for i in blocked[:10]]},
        'pull_requests': {'merged': sum(in_period(p.get('merged_at'), a, b) for p in pulls)},
        'ci': {'runs': len(runs), 'success': sum(r.get('conclusion') == 'success' for r in runs),
               'failure': sum(r.get('conclusion') == 'failure' for r in runs)},
        'deployments': sum(r.get('conclusion') == 'success' for r in deploy) if deploy else None,
    }


def nd(v):
    return 'нет данных' if v is None else v


def template_draft(f):
    i, c = f.get('issues'), f.get('ci')
    out = ['Сделано:', f"- коммитов: {nd((f.get('commits') or {}).get('count'))}; закрыто задач: {nd(i and i['closed'])}; "
           f"слито pull request: {nd((f.get('pull_requests') or {}).get('merged'))}."]
    out += [f'- {t}' for t in (i or {}).get('closed_titles', [])]
    out += ['В работе:', f"- открытых задач: {nd(i and i['open_now'])}, из них с меткой «в работе»: {nd(i and i['in_progress'])}; "
            f"новых задач за период: {nd(i and i['opened'])}."]
    out += ['Риски и блокеры:', f"- заблокированных задач: {i['blocked']}." if i else '- нет данных.']
    out += [f'- {t}' for t in (i or {}).get('blocked_titles', [])]
    out += ['Качество сборок:', f"- запусков CI: {c['runs']}, успешных: {c['success']}, упавших: {c['failure']}; "
            f"развёртываний: {nd(f.get('deployments'))}." if c else '- нет данных.']
    return '\n'.join(out)


def auto_check(text, facts):
    allowed = {str(int(n)) for n in re.findall(r'\d+', json.dumps(facts))}
    flags = []
    for n in re.findall(r'\d+(?:[.,]\d+)?', text):
        v = n.replace(',', '.')
        if (str(int(float(v))) if float(v).is_integer() else v) not in allowed:
            flags.append({'type': 'число не из фактов', 'value': n})
    low = text.lower()
    flags += [{'type': 'оценочное слово', 'value': w} for w in EVALUATIVE if w in low]
    if len(text.split()) > 140:
        flags.append({'type': 'объём', 'value': 'больше 120 слов'})
    return flags


def ask_model(prompt):
    try:
        urllib.request.urlopen(f'{OLLAMA}/api/tags', timeout=3)
    except Exception:
        return None
    body = json.dumps({'model': MODEL, 'prompt': prompt, 'stream': False,
                       'options': {'temperature': 0.2, 'seed': 42}}).encode()
    req = urllib.request.Request(f'{OLLAMA}/api/generate', data=body, headers={'Content-Type': 'application/json'})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=600) as r:
        d = json.load(r)
    return {'text': d.get('response', '').strip(), 'seconds': round(time.time() - t0, 1),
            'prompt_tokens': d.get('prompt_eval_count'), 'output_tokens': d.get('eval_count')}


def main():
    ap = argparse.ArgumentParser()
    today = date.today()
    ap.add_argument('--from', dest='a', default=str(today - timedelta(days=7)))
    ap.add_argument('--to', dest='b', default=str(today - timedelta(days=1)))
    ap.add_argument('--repo', default=REPO)
    ap.add_argument('--gh', action='store_true', help='данные через утилиту gh')
    ap.add_argument('--no-model', action='store_true', help='не обращаться к модели')
    ap.add_argument('--sprints', type=int, default=0, help='отчёты за N последних полных недель (пн–вс)')
    args = ap.parse_args()
    if args.sprints:
        last_sunday = today - timedelta(days=today.weekday() + 1)
        for k in range(args.sprints, 0, -1):
            end = last_sunday - timedelta(weeks=k - 1)
            run(argparse.Namespace(**{**vars(args), 'a': str(end - timedelta(days=6)), 'b': str(end)}))
        return
    run(args)


def run(args):

    facts = collect(args.repo, args.a, args.b, args.gh)
    prompt = PROMPT.replace('{repo}', args.repo).replace('{period_from}', args.a).replace('{period_to}', args.b) \
        .replace('{facts}', json.dumps(facts, ensure_ascii=False, indent=2))
    t0 = time.time()
    ai = None if args.no_model else ask_model(prompt)
    draft = ai['text'] if ai and ai['text'] else template_draft(facts)
    source = 'ai' if ai and ai['text'] else 'template'
    flags = auto_check(draft, facts)
    disclosure = (f'Раскрытие использования ИИ: текст сформулировала модель {MODEL} (локально, Ollama) по данным GitHub API; '
                  'все числа посчитаны скриптом. Факты проверил(а): ____________, дата ______.') if source == 'ai' else \
        'Отчёт собран скриптом по данным GitHub API без языковой модели. Факты проверил(а): ____________, дата ______.'

    os.makedirs(os.path.join(ROOT, 'reports'), exist_ok=True)
    base = os.path.join(ROOT, 'reports', f'status-{args.b}')
    meta = {'generated_at': datetime.now().isoformat(timespec='seconds'), 'repo': args.repo, 'period': [args.a, args.b],
            'facts_via': 'gh cli' if args.gh else 'api.github.com', 'source': source, 'model': MODEL if source == 'ai' else None,
            'prompt_version': PROMPT_VERSION, 'seconds_total': round(time.time() - t0, 1), 'model_stats': ai,
            'facts': facts, 'prompt': prompt, 'draft': draft, 'auto_flags': flags}
    with open(base + '.json', 'w', encoding='utf-8') as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=2)
    rows = [('Коммитов', (facts['commits'] or {}).get('count')), ('Задач открыто за период', facts['issues']['opened']),
            ('Задач закрыто за период', facts['issues']['closed']), ('Открытых задач сейчас', facts['issues']['open_now']),
            ('Заблокированных', facts['issues']['blocked']), ('Слито PR', facts['pull_requests']['merged']),
            ('Запусков CI (успешно / упало)', f"{facts['ci']['runs']} ({facts['ci']['success']} / {facts['ci']['failure']})"),
            ('Развёртываний', nd(facts['deployments']))]
    md = [f'# Статус-отчёт {args.repo}: {args.a} — {args.b}', '', f'_Черновик · {"ИИ" if source == "ai" else "без ИИ"} · промпт {PROMPT_VERSION} · '
          f'сформирован {meta["generated_at"]}_', '', '## Факты (посчитаны скриптом)', '', '| Показатель | Значение |', '|---|---|']
    md += [f'| {k} | {v} |' for k, v in rows]
    md += ['', '## Текст отчёта', '', draft, '', '## Автопроверка', '']
    md += [f"- ⚠ {x['type']}: {x['value']}" for x in flags] or ['- замечаний нет (это не заменяет проверку человеком)']
    md += ['', '---', disclosure, '']
    with open(base + '.md', 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(md))
    print('\n'.join(md))
    print(f'\nсохранено: {base}.md и .json')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:  # noqa: BLE001
        sys.exit(f'Ошибка: {e}')
