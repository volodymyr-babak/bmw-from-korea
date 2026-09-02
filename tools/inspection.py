#!/usr/bin/env python3
"""Звіт про стан (성능점검기록부) з Encar — `inspection/vehicle/{vehicleId}`.

Найтвердіше джерело в проєкті: державна інспекція, а не слова продавця. Дає те,
чого немає більше ніде:

* `usageChangeTypes` — **прокат / таксі / службове** у минулому. В Україні
  прокатна історія помітно б'є по ліквідності, а в API оголошення її немає.
* `accdient` — ДТП **силових елементів** (не те саме, що виплати страховика).
* панель-за-панеллю: що заміняли (`교환`), що варили (`판금/용접`) і якого рангу
  та деталь — зовнішня накладна (RANK_ONE/TWO) чи каркас (RANK_A/B/C).
* `mileage` на дату інспекції — можна зловити скручений пробіг.
* `comments` — вільний текст інспектора; там трапляється «미확정보험이력있음»
  (виплата ще не проведена), чого в `record` API ще немає.

Ранг важливий: заміна капота чи крила — це болтова накладна деталь і в Кореї
вважається дрібницею. Зварювання каркаса (RANK_A і далі) — зовсім інша розмова,
саме через нього `accdient` стає True.
"""

PARTS = {
    '후드': 'капот',
    '프론트 휀더(우)': 'переднє крило, праве',
    '프론트 휀더(좌)': 'переднє крило, ліве',
    '프론트 도어(우)': 'передні двері, праві',
    '프론트 도어(좌)': 'передні двері, ліві',
    '리어 도어(우)': 'задні двері, праві',
    '리어 도어(좌)': 'задні двері, ліві',
    '트렁크 리드': 'кришка багажника',
    '쿼터 패널(우)': 'задня боковина, права',
    '쿼터 패널(좌)': 'задня боковина, ліва',
    '루프 패널': 'дах',
    '사이드 실 패널(우)': 'порог, правий',
    '사이드 실 패널(좌)': 'порог, лівий',
    '라디에이터 서포트(볼트체결부품)': 'панель радіатора (на болтах)',
    '리어 패널': 'задня панель',
    '프론트 패널': 'передня панель',
    '대쉬 패널': 'моторний щит',
    '플로어 패널': 'підлога',
    '트렁크 플로어': 'підлога багажника',
    '인사이드 패널(우)': 'внутрішня панель, права',
    '인사이드 패널(좌)': 'внутрішня панель, ліва',
    '휠 하우스(우)': 'арка колеса, права',
    '휠 하우스(좌)': 'арка колеса, ліва',
    '크로스 멤버': 'поперечина',
    '사이드 멤버(우)': 'лонжерон, правий',
    '사이드 멤버(좌)': 'лонжерон, лівий',
    'A 필러 패널(우)': 'стійка A, права',
    'A 필러 패널(좌)': 'стійка A, ліва',
    'B 필러 패널(우)': 'стійка B, права',
    'B 필러 패널(좌)': 'стійка B, ліва',
    'C 필러 패널(우)': 'стійка C, права',
    'C 필러 패널(좌)': 'стійка C, ліва',
}

STATUSES = {
    '교환(교체)': 'заміна',
    '판금/용접': 'кузовний ремонт / зварювання',
    '부식': 'корозія',
    '흠집': 'потертості',
    '요철': 'нерівність',
    '도색': 'фарбування',
}

USAGE = {'렌트': 'прокат', '영업용': 'комерційне', '택시': 'таксі',
         '관용': 'службове (держ.)', '리스': 'лізинг'}

SERIOUS = {'침수': 'потоп', '화재': 'пожежа', '전손': 'списання (тотал)'}

# Каркасні (골격) ранги — зварювання тут значно серйозніше за накладну деталь
FRAME_RANKS = ('RANK_A', 'RANK_B', 'RANK_C')


def uk(table, korean):
    """Переклад із запасним варіантом: невідоме слово лишаємо як є."""
    return table.get(korean, korean)


def normalise(payload, mileage_ad=None):
    """Компактний, уже перекладений зріз звіту. None, якщо звіту немає."""
    if not payload or not payload.get('master'):
        return None
    m = payload['master']
    det = m.get('detail') or {}

    panels = []
    for o in payload.get('outers') or []:
        ranks = o.get('attributes') or []
        panels.append({
            'part': uk(PARTS, (o.get('type') or {}).get('title') or '?'),
            'status': ', '.join(uk(STATUSES, s['title']) for s in (o.get('statusTypes') or [])) or '?',
            'frame': any(r in FRAME_RANKS for r in ranks),
        })

    out = {
        'accident': bool(m.get('accdient')),          # ДТП силових елементів
        'simpleRepair': bool(m.get('simpleRepair')),  # просте кузовне
        'waterlog': bool(det.get('waterlog')),
        'tuning': bool(det.get('tuning')),
        'usage': [uk(USAGE, u['title']) for u in det.get('usageChangeTypes') or []],
        'serious': [uk(SERIOUS, s['title']) for s in det.get('seriousTypes') or []],
        'panels': panels,
        'date': det.get('issueDate'),
        'mileage': det.get('mileage'),
        'recall': bool(det.get('recall')),
        'comment': (det.get('comments') or '').strip() or None,
    }
    # Розбіжність пробігу: інспекція свіжа, а в оголошенні менше — привід питати
    if mileage_ad and out['mileage'] and out['mileage'] - mileage_ad > 3000:
        out['mileageWarning'] = out['mileage'] - mileage_ad
    return out


def facts(insp):
    """Факти для картки авто. kind: plus | minus | info."""
    if not insp:
        return []
    out = []
    if insp['serious']:
        out.append(('minus', 'Звіт інспекції: ' + ', '.join(insp['serious']) + ' — не брати.'))
    if insp['usage']:
        out.append(('minus', 'У минулому авто було в статусі «' + ', '.join(insp['usage'])
                    + '». В Україні це помітно б\'є по ліквідності при перепродажі.'))
    if insp['accident']:
        out.append(('minus', 'Інспекція зафіксувала ДТП силових елементів (не просте кузовне).'))
    frame = [p for p in insp['panels'] if p['frame']]
    plain = [p for p in insp['panels'] if not p['frame']]
    if frame:
        out.append(('minus', 'Каркас: ' + '; '.join(f"{p['part']} — {p['status']}" for p in frame) + '.'))
    if plain:
        out.append(('info', 'Накладні деталі: '
                    + '; '.join(f"{p['part']} — {p['status']}" for p in plain)
                    + '. У Кореї це вважається дрібним ремонтом.'))
    if insp.get('mileageWarning'):
        out.append(('minus', f"Пробіг в оголошенні на {insp['mileageWarning']:,}".replace(',', ' ')
                    + ' км менший, ніж зафіксувала інспекція.'))
    if insp['tuning']:
        out.append(('info', 'Інспекція відзначила тюнінг — запитати, що саме змінено.'))
    if not insp['panels'] and not insp['accident'] and not insp['usage']:
        out.append(('plus', 'Звіт інспекції чистий: ні замін панелей, ні кузовного, '
                            'ні комерційної історії.'))
    return out
