#!/usr/bin/env python3
"""Синхронізує data/cars.json з детальними файлами data/cars/<listingId>.json.

Детальні файли — джерело правди. Індекс — похідний артефакт для головної:
до нього підтягуються VIN, фото, історія (ДТП, ремонт, зміни власника) і
прапорці зі звіту інспекції.

Запуск:  python3 tools/sync_index.py
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / "data" / "cars.json"
DETAILS = ROOT / "data" / "cars"

FRAME = re.compile(r"_(\d+)\.jpg$")


def frame_no(path: str) -> int:
    """Номер кадру з шляху Encar (…_001.jpg → 1); без номера — в кінець."""
    m = FRAME.search(path)
    return int(m.group(1)) if m else 999


def incidents(history):
    """Скільки РІЗНИХ ДТП пережило авто (None — детальних записів немає).

    `accidentCnt` в Encar — це число страхових ЗАПИСІВ, а не подій: одне ДТП
    дає два записи, якщо виплата йшла і власнику (내차피해), і потерпілій
    стороні (상대차피해). Тому рахуємо унікальні дати по всіх типах записів
    (`type` 1 — своя страховка, 2 — чужа, 3 — шкода іншому авто).

    ⚠️ Два справді різні ДТП в один день зіллються в одне. Помилка йде в бік
    «менше», тож у сумнівних випадках дивитись список дат на сторінці авто.
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
        if detail.get("gen") and not car.get("gen"):
            car["gen"] = detail["gen"]
        if detail.get("trim"):
            car["trim"] = detail["trim"]

        photos = detail.get("photos") or {}
        shots = photos.get("outer") or photos.get("inner") or []
        if shots:
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

        if json.dumps(car, ensure_ascii=False, sort_keys=True) != before:
            changed.append(car["listingId"])

    index["meta"]["count"] = len(index["cars"])
    index["meta"].pop("decodedCount", None)

    INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Оновлено {len(changed)} записів: {', '.join(changed) or '—'}")
    for p in problems:
        print(f"  ! {p}", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
