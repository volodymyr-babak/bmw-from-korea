#!/usr/bin/env python3
"""Розмитнення: Python-двійник breakdown() з assets/js/common.js.

Мита рахуються від ФІКСОВАНОЇ мінімальної митної вартості P за роком
виготовлення, а не від корейської ціни. Таблиця P звірена скріншотами
carspy для X5; для X6 узято ту саму, тому ціни X6 — оцінка
(priceEstimated: true, реально +$1000…2000).
"""

KRW_PER_USD = 1372
EUR_USD = 1.1648
EXCISE_RATE_EUR = 75          # €/л для дизеля
ENGINE_L = 3.0                # митниця бере 2993 см³ для всіх 30d
AGE_BASE = 2025
SHIPPING = 3700
SERVICE = 1000
CERT_REG = 124                # сертифікація $79 + реєстрація $45
BUDGET_CAP = 70000

MIN_CUSTOMS_VALUE = {2019: 25000, 2020: 36000, 2021: 40500, 2022: 43000}

# Ціна авто в 만원, вище якої під ключ гарантовано перевищить стелю
# навіть для найдорожчого року. Використовується як серверний фільтр Encar.
SEARCH_PRICE_CAP_MAN = 7000


def _r(x: float) -> int:
    return int(x + 0.5)


def fees(year: int) -> int:
    """Усі платежі, крім вартості самого авто. Залежать тільки від року."""
    p = MIN_CUSTOMS_VALUE[year]
    age = AGE_BASE - year
    duty = 0.10 * p
    excise = EXCISE_RATE_EUR * ENGINE_L * age * EUR_USD
    vat = 0.20 * (p + duty + excise)
    pension = 0.05 * p
    return _r(duty) + _r(excise) + _r(vat) + _r(pension) + CERT_REG + SHIPPING + SERVICE


def car_usd(man: int) -> int:
    """Корейська ціна в 만원 → USD."""
    return _r(man * 10000 / KRW_PER_USD)


def landed(year: int, man: int) -> int:
    """Ціна «під ключ» у Києві."""
    return car_usd(man) + fees(year)
