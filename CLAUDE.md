# Ranger from Korea — пошук і пригін Ford Ranger 4-го покоління

## Що це за проєкт
**Особистий** (не робочий) проєкт Володимира: підбір вживаного **Ford Ranger 4-го покоління**
у Кореї (Encar) для пригону в Україну. Список кандидатів публікується як сайт на GitHub Pages.

Репозиторій: `git@github.com:volodymyr-babak/bmw-from-korea.git` →
Pages: `https://volodymyr-babak.github.io/bmw-from-korea/`.

> **Історія.** До 2026-09-07 тут велась добірка BMW X5 (G05) / X6 (G06) xDrive30d — звідси назва
> репозиторію. Те авто куплене. **2026-09-24 список повністю замінено на Ranger**, а декодери
> VIN (bimmer.work, outvin, oemnav, mdecoder), палітри кольорів, планки, митниця й усі
> BMW-нотатки прибрані — вони лежать у git-історії до коміту заміни, якщо колись знадобляться.

---

## Критерії (чинні з 2026-09-24, розширені того ж дня)
- **Модель:** Ford Ranger **4-го покоління** — в Encar `Model` = `레인저 4세대` (нова
  платформа, випуск 2023+). **Будь-яка комплектація**: у Кореї їх дві, `BadgeDetail`
  `와일드트랙` → Wildtrak і `랩터` → Raptor (`encar.TRIMS`); двигун в обох 2.0 дизель.
  Спочатку (вранці 24.09) список був «Wildtrak 2022+», включно з 3-м поколінням T6;
  за проханням користувача 3-тє покоління прибрано, а Raptor додано.
- **Рік** окремо не фільтруємо — 4-те покоління само собою 2023+. У даних лишається
  `year` = `Year // 100` (виготовлення) і `formYear` (연식) у деталі.
- **Тип продажу:** лише `일반` (звичайний); лізинг `리스` і оренда `렌트` відсіяні сервером.
- **Не беремо ніколи:** списання / потоп / викрадення (`totalLoss`, `flood`, `robber`
  у реєстрі, `seriousTypes`/`waterlog` у звіті інспекції), дублі за VIN, дублі без VIN
  (той самий рік + ціна + пробіг ±1000 км).
- **За ДТП, ремонтом, власниками НЕ фільтруємо** — показуємо колонками. Пробігу й стелі
  ціни теж немає. Комплектацію за VIN не декодуємо (рішення користувача).

Показуємо: комплектацію, рік, пробіг, ціна в Кореї (만원 + `≈ $` за курсом 1372 ₩/$),
різних ДТП, виплати за ремонт, змін власника, VIN, прапорці зі звіту інспекції.

---

## Encar API (endpoints) — те, що перевірено на Ranger 2026-09-24
Заголовки: `User-Agent: Mozilla/5.0…` + `Referer: https://fem.encar.com/`. Проксі egress
періодично віддає **HTTP 407** — рятують ретраї в циклі (`tools/encar.py::get`).

**⚠️ З-під VPN Encar не працює взагалі.** 2026-09-24 із хмарної адреси (`34.107.12.39`)
CloudFront віддавав **403 на все** — і пошук, і деталь відомого лота, — а браузер
перекидало на `fem.encar.com/client-verification/blocked` («비정상적인 트래픽»). Після
вимкнення VPN (egress `91.225.165.251`) усе запрацювало. Якщо раптом суцільні 403 — спершу
перевірити `curl https://api.ipify.org`.

- **Пошук:** `https://api.encar.com/search/car/list/general?count=true&q=<QUERY>&sr=|ModifiedDate|<offset>|20`.
  Робочий запит для всіх Ranger 4-го покоління:
  ```
  (And.Hidden.N._.(C.CarType.A._.(C.Manufacturer.포드._.(C.ModelGroup.레인저._.Model.레인저 4세대.)))_.SellType.일반.)
  ```
  Щоб узяти одну комплектацію — додати топ-рівнем `_.BadgeDetail.와일드트랙.`; щоб усі
  покоління разом — `ModelGroup` без вкладеного `C.`: `(C.Manufacturer.포드._.ModelGroup.레인저.)`.
  Пастки синтаксису (усі дають 400): `ModelGroup` у формі `(C.ModelGroup.레인저.)` без
  `Model` усередині; `BadgeDetail`, `Year`, `SellType` не топ-рівнем; `Manufacturer` без
  `ModelGroup`/`Model` узагалі. Щоб узяти всі покоління разом, `ModelGroup` пишеться
  **без вкладеного `C.`**: `(C.Manufacturer.포드._.ModelGroup.레인저.)`.
  Поля результату: `Id, Manufacturer, Model, Badge, BadgeDetail, FuelType, Year (YYYYMM
  виготовлення), FormYear (연식), Mileage, Price (만원), SellType, Photos[]`.
  `Model` = `레인저 3세대` (T6 рестайлінг, 2019–2022) або `레인저 4세대` (нова платформа,
  2023+) → у даних `gen: 3 | 4` (`encar.generation()`). Старий `레인저` 2003 року — окрема
  модель, у запит не потрапляє.
  **Комплектація видна ЛИШЕ в пошуку** (`BadgeDetail`), у деталі її немає — тому
  `find_new()` добирає `trim` і для вже відомих лотів.
  **Дублів дуже багато:** з 40 лотів 4-го покоління 13 — той самий VIN під другим
  `listingId`, ще 4 — уже за контрактом; лишилось 23. Дедуплікація обов'язкова.
- **Деталь:** `https://api.encar.com/v1/readside/vehicle/{listingId}` → `vehicleId`, `vin`,
  `spec.mileage`, `spec.colorName` (корейською), `advertisement.price` (만원),
  `advertisement.salesStatus` (`CONTRACT` = продано), `contents.text` (текст оголошення),
  `photos[]` (`type` OUTER/INNER, сортувати за номером кадру — `_001` головний).
  **⚠️ `vehicleId` ≠ `listingId`** — брати з деталі (`vehicleId` або `manage.dummyVehicleId`).
  VIN Ford: `6FPPXXMJ2…`/`6FPP2CMJ…` — Wildtrak, `6FPFXXMX2…` — Raptor; 10-й знак — код року
  (N=2022, P=2023, R=2024, S=2025). VIN є не в усіх лотах і може зникати з відповіді —
  наявний ніколи не перетирати `None`.
- **Історія:** `…/record/vehicle/{vehicleId}/open` → `myAccidentCnt/myAccidentCost`
  (свій ремонт), `otherAccidentCnt/Cost`, `ownerChangeCnt`, `totalLossCnt`,
  `floodTotalLossCnt/floodPartLossCnt`, `robberCnt`, `firstDate`, **`accidents[]`** із датами.
  **«Різних ДТП» = унікальні дати в `accidents`**, а не `accidentCnt`: одне ДТП дає два записи
  (виплата власнику + потерпілому). Типи: `1` своя страховка, `2` чужа, `3` шкода іншому авто.
- **Інспекція:** `…/inspection/vehicle/{vehicleId}` — державний звіт про стан
  (성능점검기록부), модуль `tools/inspection.py` (не `inspect.py` — перекриває стандартний
  модуль). Дає прокат/таксі (`usageChangeTypes`), ДТП каркаса (`accdient`), панель-за-панеллю
  (`outers[]`: заміна / зварювання, ранг деталі), пробіг на дату інспекції, коментар інспектора.
  404 — звіту немає, це нормально.
- **Чи продано:** `HTTP 404` на деталі — знято; `salesStatus == "CONTRACT"` — продано
  (`status` при цьому все ще `ADVERTISE`); `price == 9999` — ціну приховано, зазвичай продаж.
- **Фото:** `https://ci.encar.com<path>?impolicy=heightRate&rh=<H>&cw=<W>&ch=<H>&cg=Center`,
  розміри 16:9: `280×158`, `640×360`, `800×450`.

---

## Сайт
Pages з гілки `main`, корінь репо (`.nojekyll`). Публікація = `git push` у `main`; статика без збірки.
Локально — `python3 -m http.server` (ES-модулі не працюють з `file://`).

1. **Головна** `index.html` — одна таблиця, 8 колонок: `№ · Авто (комплектація + рік) ·
   Пробіг · Ціна в Кореї · ДТП · Ремонт · Змін вл. · Нотатка`. Сортування кліком по
   заголовку, тай-брейк за ціною; `№` = місце за ціною. Три перші колонки липкі по
   горизонталі, шапка — по вертикалі.
   Фільтри: комплектація (з даних, з лічильником) / рік (з даних) / різних ДТП не більше / ремонт. Фільтр ДТП ховає й
   авто без детальних записів (`incidents == null`). Мітка «найдешевше» рахується на рендері.
   **Ціни під ключ на сайті немає** — показуємо корейську ціну в 만원 і `≈ $` за курсом.
2. **Сторінка авто** `car.html?id=<listingId>` — галерея, «Що це за авто» (VIN, комплектація, покоління,
   рік виготовлення, модельний рік, пробіг, колір з Encar), «Історія» (розклад ДТП по датах),
   «Звіт інспекції», «Що пише продавець» (сирий корейський текст у `<details>`).
3. Дані — тільки з JSON у `data/`, у розмітці нічого не захардкоджено.

### Файли
```
index.html · car.html
assets/css/site.css      світла/темна тема на CSS-змінних, IBM Plex
assets/js/common.js      форматери (man/manUSD — 만원 і $), genLabel, MARKS, тема
assets/js/index.js       головна: COLUMNS, сортування, фільтри
assets/js/car.js         сторінка авто
tools/encar.py           клієнт Encar: search(), trim(), detail, record, inspection, photos
tools/inspection.py      нормалізація звіту про стан + факти для картки
tools/watch.py           доглядач (продані / нові / зміна ціни → звіт → коміт → пуш)
tools/sync_index.py      деталь → індекс (VIN, фото, accident{costKRW, owners, incidents}, flags)
tools/install-watch-cron.sh
```

### Структура даних
```
data/
├── cars.json           # індекс: meta + масив авто
├── cars/<id>.json      # деталь: фото, історія, інспекція, sellerText, colorName, formYear
├── watch-state.json    # rejected {listingId: {reason, vin, at}}, lastRun
├── last-change.md      # останній звіт (push сюди → issue → лист)
└── watch-log.md        # усі звіти
```
Поля індексу: `rank, listingId, model ("Ranger"), trim (Wildtrak|Raptor), gen (4), year, mileageKm,
koreaPriceMan, vin, accident{costKRW, owners, incidents?}, photo, flags?, mark?, note?`.
`accident.incidents` — число РІЗНИХ ДТП (унікальні дати); відсутнє = записів немає → `—`.
`owners` = `ownerChangeCnt`, тобто **перереєстрації**, а не число людей (0 = досі перший власник).
Кураторські `mark` (`hero`, `star`) і `note` ставляться руками в `data/cars.json` і
переживають проходи `watch.py` (він оновлює лише ціну/пробіг/VIN).

---

## Автоматичний моніторинг
`tools/watch.py` — один прохід: перевірка проданих → пошук нових → коміт і пуш звіту.
`--dry-run` нічого не пише; `--no-publish` пише дані, але не комітить. Cron ставить
`tools/install-watch-cron.sh` (щогодини о `:17`). **Станом на 2026-09-24 cron НЕ
встановлений** — список зібрано вручну одним проходом; увімкнути, якщо користувач попросить.

- Листи — не з watch.py: push у `data/last-change.md` запускає `.github/workflows/notify.yml`,
  який створює issue від `github-actions[bot]` (про власні дії GitHub листів не шле).
- Падіння проходу теж їде листом (`crash_report`); однаковий трейсбек/звіт вдруге не публікується.
- `watch-state.rejected` — журнал відсіяних із причиною і VIN; дублі перепитуються, коли
  близнюк зникає зі списку.

## Конвенції
- **Мова спілкування — українська.**
- Комміти — Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`…).
- Це **особистий** проєкт, окремий від робочого `career-home` (ThingsBoard).
- Ціни/пробіги в даних — станом на перевірку; перед показом іншим перевіряти актуальність на Encar.
