#!/usr/bin/env python3
"""Колір оббивки з тексту оголошення Encar (`contents.text`).

Encar в API кольору салону не віддає, зате продавці регулярно пишуть його в
описі — і опис збігається з білд-листом (перевірено на 42445415: «블랙시트»
проти Vernasca Black за VIN). Це дає змогу відсіяти cognac / червоний
**до** декодування, не витрачаючи добову квоту mdecoder.

Головна пастка: назва кольору сама по собі часто описує **кузов**, не салон
(`색상 : 맨하탄 (갈색)` — це коричнева фарба Manhattan). Тому колір вважається
кольором салону лише тоді, коли поруч стоїть слово про салон: 시트 (сидіння),
가죽 (шкіра), 내장 (оздоблення), 실내 (інтер'єр).
"""

# Слово про салон має стояти в межах цього вікна від назви кольору
NEAR = 14
SEAT_WORDS = ('시트', '가죽', '내장', '실내')

# колір → (українська назва, чи лишаємо авто)
TRIM_COLOURS = {
    'cognac':  ('Cognac (рудий)',      False),
    # Світлий салон повернуто в добірку 2026-09-03 за рішенням користувача.
    'ivory':   ('Ivory White (айворі)', True),
    'beige':   ('бежевий / айворі',     True),
    'red':     ('червоний',             False),
    'coffee':  ('кава (Coffee)',         True),
    'brown':   ('коричневий — кава або cognac', True),
    'black':   ('чорний',               True),
    'tartufo': ('Tartufo',              True),
}

# Обидва написання cognac реальні: 꼬냑 трапляється частіше за 코냑.
KEYWORDS = {
    'cognac':  ['꼬냑', '코냑', '카냑'],
    'ivory':   ['아이보리'],
    'beige':   ['베이지'],
    'red':     ['레드', '타코라', '버건디', '빨간'],
    # 커피 = «кава», це явна назва оббивки Coffee.
    'coffee':  ['커피', '모카', '초콜릿'],
    # ⚠ 브라운/갈색 = просто «коричневий» і НЕ розрізняє Coffee від Cognac.
    # Доведено на 42244757: продавець писав «브라운시트», а в білд-листі MCRI
    # Vernasca Cognac — тобто авто під виключення. Тому окремий, обережніший ключ.
    'brown':   ['브라운', '갈색'],
    'black':   ['블랙', '검정'],
    'tartufo': ['타르투포'],
}


def seat_colour(text):
    """(колір, чи лишаємо, фрагмент) або (None, True, None), якщо не сказано."""
    if not text:
        return None, True, None
    for colour, words in KEYWORDS.items():
        for kw in words:
            start = 0
            while (i := text.find(kw, start)) != -1:
                start = i + 1
                around = text[max(0, i - NEAR):i + len(kw) + NEAR]
                if any(w in around for w in SEAT_WORDS):
                    name, keep = TRIM_COLOURS[colour]
                    snippet = text[max(0, i - 45):i + len(kw) + 45].replace('\n', ' ')
                    return name, keep, snippet.strip()
    return None, True, None
