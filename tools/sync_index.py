#!/usr/bin/env python3
"""Синхронізує data/cars.json з детальними файлами data/cars/<listingId>.json.

Детальні файли — джерело правди. Індекс — похідний артефакт для головної
сторінки: до нього підтягуються VIN, кольори, фото, історія та ключові опції.

`decoded` = у детальному файлі є `options`, тобто знято білд-лист BMW за VIN.
Детальний файл існує для кожного авто (фото й історія є завжди), тому сама
його наявність ще не означає, що комплектація відома.

Запуск:  python3 tools/sync_index.py
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / "data" / "cars.json"
DETAILS = ROOT / "data" / "cars"

KEY_FEATURES = ["air", "laser", "led", "soft", "vent", "hk", "pano", "skylounge",
                "mhev", "acc", "park", "comfort", "seatheat",
                "wheelheat", "climate4", "exhaust"]

FRAME = re.compile(r"_(\d+)\.jpg$")


def frame_no(path: str) -> int:
    """Номер кадру з шляху Encar (…_001.jpg → 1); без номера — в кінець."""
    m = FRAME.search(path)
    return int(m.group(1)) if m else 999
# Необовʼязкові прапорці: переносяться в індекс лише якщо є в деталі.
# bw = Bowers & Wilkins (S6F1) — вищий тир за Harman/Kardon, тоді hk=false.
OPTIONAL_FEATURES = ["bw"]


# Декоративні планки салону (Interior trim finishers) — у білд-листі рівно одна.
# Ловимо і за кодом, і за англійським описом: коди `S4K…`/`S4M…` виписані не
# підряд, а формулювання BMW стабільне. Незнайомий код усе одно потрапляє
# в індекс — фронт покаже англійський опис, а не вигадає назву.
TRIM_CODES = {"S4KK", "S4KM", "S4KP", "S4KR", "S4KT", "S4ML", "S4MC"}
TRIM_DESC = re.compile(r"interior trim finish|trim finishers", re.I)


def trim_finish(detail):
    """Планка салону з білд-листа: {"code", "en"} або None."""
    for o in detail.get("options") or []:
        code = o.get("code") or ""
        if code in TRIM_CODES or TRIM_DESC.search(o.get("desc") or ""):
            return {"code": code, "en": o.get("desc") or ""}
    return None


def incidents(history):
    """Скільки РІЗНИХ ДТП пережило авто (None — детальних записів немає).

    `accidentCnt` в Encar — це число страхових ЗАПИСІВ, а не подій: одне ДТП
    дає два записи, якщо виплата йшла і власнику (내차피해), і потерпілій
    стороні (상대차피해). Приклад `42287839`: 5 записів, але дат лише три
    (2025-07-08, 2020-08-18, 2019-11-14) — тобто три ДТП, а не п'ять.
    Тому рахуємо унікальні дати по всіх типах записів (`type` 1 — своя
    страховка, 2 — чужа, 3 — шкода іншому авто).

    ⚠️ Два справді різні ДТП в один день зіллються в одне. Трапляється рідко,
    і помилка йде в бік «менше», тож у сумнівних випадках дивитись сам список
    дат на сторінці авто.
    """
    acc = history.get("accidents")
    if acc is None:
        return None
    return len({a.get("date") for a in acc if a.get("date")})


def main() -> int:
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    changed, problems = [], []

    for car in index["cars"]:
        path = DETAILS / f"{car['listingId']}.json"
        if not path.exists():
            problems.append(f"{car['listingId']}: немає {path.name} — фото й історії не буде")
            continue

        detail = json.loads(path.read_text(encoding="utf-8"))
        before = json.dumps(car, ensure_ascii=False, sort_keys=True)

        if detail.get("vin"):
            car["vin"] = detail["vin"]
        for side in ("exterior", "interior"):
            name = (detail.get(side) or {}).get("name")
            if name:
                car[side] = name
        # Салон із білд-листа за VIN перекриває будь-яку непідтверджену догадку
        # (опис оголошення чи фото) — щоб на сайті не лишалось двох відповідей.
        if car.get("interior"):
            car.pop("interiorUnverified", None)

        photos = detail.get("photos") or {}
        shots = photos.get("outer") or photos.get("inner") or []
        if shots:
            # _001 в Encar — головний ракурс; беремо найменший номер кадру
            car["photo"] = min(shots, key=frame_no)

        # Прапорці зі звіту інспекції — найтвердіші дані, мусять бути видні у списку
        insp = detail.get("inspection") or {}
        flags = list(insp.get("usage") or []) + list(insp.get("serious") or [])
        if insp.get("accident"):
            flags.append("ДТП каркаса")
        if insp.get("waterlog"):
            flags.append("потоп")
        if flags:
            car["flags"] = flags
        else:
            car.pop("flags", None)

        h = detail.get("history") or {}
        if h and not h.get("http"):
            car["accident"] = {"costKRW": h.get("myAccidentCost") or 0,
                               "owners": h.get("ownerChangeCnt") or 0}
            inc = incidents(h)
            if inc is not None:
                car["accident"]["incidents"] = inc

        # Пневмопідвіска зі слів продавця — для недекодованих це єдине джерело
        # (у каталозі опцій Encar її немає, а ретрофіт нереальний). Щойно є
        # білд-лист — прапорець з індексу йде, щоб не було двох відповідей.
        if detail.get("airSeller") is not None and not detail.get("options"):
            car["airSeller"] = bool(detail["airSeller"])
        else:
            car.pop("airSeller", None)

        # Планка салону — властивість, яку видно тільки в білд-листі: на фото
        # оголошення вставку майже не спіймати, а в описі про неї не пишуть.
        finish = trim_finish(detail)
        if finish:
            car["trimFinish"] = finish
        else:
            car.pop("trimFinish", None)

        # decoded = знято білд-лист BMW за VIN. Детальний файл є в кожного авто
        # (фото й історія), тому сама його наявність нічого не означає.
        car["decoded"] = bool(detail.get("options"))
        if car["decoded"]:
            kf = detail.get("keyFeatures") or {}
            missing = [k for k in KEY_FEATURES if k not in kf]
            if missing:
                problems.append(f"{car['listingId']}: keyFeatures без {', '.join(missing)}")
            car["keyFeatures"] = {k: bool(kf.get(k)) for k in KEY_FEATURES}
            for k in OPTIONAL_FEATURES:
                if k in kf:
                    car["keyFeatures"][k] = bool(kf[k])
        else:
            car.pop("keyFeatures", None)

        if json.dumps(car, ensure_ascii=False, sort_keys=True) != before:
            changed.append(car["listingId"])

    index["meta"]["count"] = len(index["cars"])
    index["meta"]["decodedCount"] = sum(1 for c in index["cars"] if c.get("decoded"))

    INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Оновлено {len(changed)} записів: {', '.join(changed) or '—'}")
    print(f"Декодовано {index['meta']['decodedCount']} з {index['meta']['count']}")
    for p in problems:
        print(f"  ! {p}", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
