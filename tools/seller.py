#!/usr/bin/env python3
"""Що можна витягти з тексту оголошення Encar (`contents.text`).

Опис — єдине місце, де трапляється те, чого немає ні в API, ні в білд-листі:
кількість ключів, залишок протектора, продовжена гарантія, ціна нової,
прокатна історія, чесні визнання кузовних робіт. Плюс іноді там лежить VIN.

Тут — лише **високоточні** шаблони, які не залежать від тону тексту. Усе, що
вимагає розуміння полярності («판금 하나 있습니다» = ремонт Є, а «무판금» = немає),
розбирається руками: сирий текст лежить у `data/cars/<id>.json → sellerText`,
тож перечитати його можна будь-коли без запитів до Encar.
"""
import re

# --- VIN ---------------------------------------------------------------
# Рік у VIN (10-й знак) для наших років виготовлення
VIN_YEAR = {2019: 'K', 2020: 'L', 2021: 'M', 2022: 'N'}
VIN_RE = re.compile(r'\b(WBA[A-HJ-NPR-Z0-9]{14})\b')
# 차대번호 = «номер шасі»; помічений VIN куди надійніший за випадковий у тексті
LABELLED = re.compile(r'차대번호[^\w]{0,6}([A-Z0-9]{17})')


def vin_from_text(text, year):
    """VIN з опису — лише якщо помічений «차대번호» і код року збігається.

    Без цих двох умов не беремо: дилери копіюють описи між оголошеннями, і в
    41142979 у тексті лежав VIN зовсім іншого авто (2021 замість 2022).
    """
    if not text:
        return None
    m = LABELLED.search(text.upper().replace(' ', ''))
    if not m:
        return None
    vin = m.group(1)
    if not VIN_RE.fullmatch(vin):
        return None
    if VIN_YEAR.get(year) and vin[9] != VIN_YEAR[year]:
        return None
    return vin


# --- факти -------------------------------------------------------------
def _keys(text):
    m = re.search(r'(?:키|KEY|스마트키)\s?(\d)\s?(?:개|벌|EA|ea)', text, re.I)
    if not m:
        m = re.search(r'KEY\s?(\d)\s?EA', text, re.I)
    if m and m.group(1) in '123':
        n = int(m.group(1))
        word = {1: 'один ключ', 2: 'два ключі', 3: 'три ключі'}[n]
        return ('plus' if n >= 2 else 'minus', f'{word.capitalize()} (зі слів продавця).')
    return None


def _tyres(text):
    m = re.search(r'타이어[^\n]{0,20}?(\d{2})\s?%\s?이상', text)
    if m:
        return ('plus', f'Протектор шин понад {m.group(1)}% (зі слів продавця).')
    return None


def _new_price(text):
    m = re.search(r'신차[가값격][^\d]{0,12}([\d,]{4,8})\s?만', text)
    if m:
        man = int(m.group(1).replace(',', ''))
        return ('info', f'Нова коштувала {man:,}'.replace(',', ' ') + ' 만원.')
    return None


def _warranty(text):
    m = re.search(r'(\d{2})년\s?(\d{1,2})월\s?(\d{1,2})일까지\s?보증연장', text)
    if m:
        y, mo, d = m.groups()
        return ('plus', f'Гарантію продовжено до {int(d):02d}.{int(mo):02d}.20{y}.')
    return None


def _no_rental(text):
    if re.search(r'렌트\s?이력\s?(?:무|없)', text):
        return ('plus', 'Прокатної історії немає (продавець зазначає окремо).')
    return None


def _bps(text):
    if 'BMW Premium Selection' in text or 'BPS' in text:
        return ('plus', 'Продається через BMW Premium Selection — офіційна сертифікація '
                        'BMW Korea (72 пункти перевірки, історія обслуговування).')
    return None


def _nonsmoker(text):
    if re.search(r'비흡연|금연\s?차', text):
        return ('plus', 'Некурящий власник (зі слів продавця).')
    return None


# --- пневмопідвіска ----------------------------------------------------
# Єдиний виняток із правила «полярність руками»: заперечення тут стоїть
# впритул до згадки («에어서스 없는차량» = пневмо НЕМАЄ), тож вікно вузьке.
AIR_RE = re.compile(r'에어\s?[서써]스\w*|air\s?susp\w*|에어매틱', re.I)
# Корейське заперечення йде ПІСЛЯ іменника, англійське — ПЕРЕД ним.
AIR_NEG_AFTER = re.compile(r'없|미장착|비장착|미적용|아닙|아님')
AIR_NEG_BEFORE = re.compile(r'\b(?:no|not|without)\b\s*$', re.I)


def air_suspension(text):
    """True / False / None — пневмопідвіска зі слів продавця.

    Пневмо (`S2VR`) є не в усіх X5/X6 M Sport — у частині стоїть `S2VF`
    Adaptive M chassis, а ретрофіт нереальний. Продавці про неї пишуть, і в
    усіх авто, де є і опис, і білд-лист, вони збіглися (41032632 «에어 서스팬션
    적용» і 41142979 = S2VR; 42468210 «에어서스 없는차량» = S2VF). Тому опис —
    безкоштовне джерело для недекодованих.

    `None` = продавець не згадав. Це НЕ «немає»: у 42445415 і 42405951
    пневмо немає за білд-листом, а в описі про неї ні слова.
    """
    if not text:
        return None
    verdict = None
    for m in AIR_RE.finditer(text):
        # вікно 10 знаків: далі вже наступне речення з його власним 무사고
        if AIR_NEG_AFTER.search(text[m.end():m.end() + 10]):
            return False                      # пряме заперечення важить більше
        if AIR_NEG_BEFORE.search(text[max(0, m.start() - 12):m.start()]):
            return False
        verdict = True
    return verdict


def _air(text):
    got = air_suspension(text)
    if got is True:
        return ('plus', 'Пневмопідвіска є (зі слів продавця).')
    if got is False:
        return ('minus', 'Пневмопідвіски немає (продавець зазначає прямо).')
    return None


CHECKS = (_keys, _tyres, _new_price, _warranty, _no_rental, _bps, _nonsmoker, _air)


def facts(text):
    """Список {kind, text} — тільки однозначні шаблони. Решту читати руками."""
    if not text:
        return []
    out = []
    for check in CHECKS:
        got = check(text)
        if got:
            out.append({'kind': got[0], 'text': got[1]})
    return out
