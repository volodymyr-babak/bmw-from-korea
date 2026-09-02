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
                "acoustic", "mhev", "acc", "park", "hud", "comfort", "seatheat",
                "wheelheat", "climate4", "exhaust"]

FRAME = re.compile(r"_(\d+)\.jpg$")


def frame_no(path: str) -> int:
    """Номер кадру з шляху Encar (…_001.jpg → 1); без номера — в кінець."""
    m = FRAME.search(path)
    return int(m.group(1)) if m else 999
# Необовʼязкові прапорці: переносяться в індекс лише якщо є в деталі.
# bw = Bowers & Wilkins (S6F1) — вищий тир за Harman/Kardon, тоді hk=false.
OPTIONAL_FEATURES = ["bw"]


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

        photos = detail.get("photos") or {}
        shots = photos.get("outer") or photos.get("inner") or []
        if shots:
            # _001 в Encar — головний ракурс; беремо найменший номер кадру
            car["photo"] = min(shots, key=frame_no)

        h = detail.get("history") or {}
        if h and not h.get("http"):
            car["accident"] = {"costKRW": h.get("myAccidentCost") or 0,
                               "owners": h.get("ownerChangeCnt") or 0}

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
