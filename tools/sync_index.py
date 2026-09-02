#!/usr/bin/env python3
"""Синхронізує data/cars.json з детальними файлами data/cars/<listingId>.json.

Детальні файли (білд-листи за VIN) — джерело правди. Індекс — похідний артефакт
для головної сторінки: до нього підтягуються VIN, кольори та ключові опції.

Запуск:  python3 tools/sync_index.py
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / "data" / "cars.json"
DETAILS = ROOT / "data" / "cars"

KEY_FEATURES = ["air", "laser", "soft", "vent", "massage", "hk", "pano", "acoustic", "mhev"]
# Необовʼязкові прапорці: переносяться в індекс лише якщо є в деталі.
# bw = Bowers & Wilkins (S6F1) — вищий тир за Harman/Kardon, тоді hk=false.
OPTIONAL_FEATURES = ["bw"]


def main() -> int:
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    changed, problems = [], []

    for car in index["cars"]:
        path = DETAILS / f"{car['listingId']}.json"
        if not path.exists():
            if car.get("decoded"):
                problems.append(f"{car['listingId']}: decoded=true, але {path.name} немає")
            continue

        detail = json.loads(path.read_text(encoding="utf-8"))
        before = json.dumps(car, ensure_ascii=False, sort_keys=True)

        car["decoded"] = True
        if detail.get("vin"):
            car["vin"] = detail["vin"]
        for side in ("exterior", "interior"):
            name = (detail.get(side) or {}).get("name")
            if name:
                car[side] = name

        kf = detail.get("keyFeatures") or {}
        missing = [k for k in KEY_FEATURES if k not in kf]
        if missing:
            problems.append(f"{car['listingId']}: keyFeatures без {', '.join(missing)}")
        car["keyFeatures"] = {k: bool(kf.get(k)) for k in KEY_FEATURES}
        if kf.get("bw"):
            car["keyFeatures"]["bw"] = True
        for k in OPTIONAL_FEATURES:
            if k in kf:
                car["keyFeatures"][k] = bool(kf[k])

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
