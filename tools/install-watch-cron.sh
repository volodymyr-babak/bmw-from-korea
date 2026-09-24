#!/usr/bin/env bash
# Ставить щогодинний запуск доглядача в crontab поточного користувача.
# Ідемпотентно: повторний запуск лише переписує рядок.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="$HOME/.cache/bmw-watch.log"
MARK='# bmw-from-korea watch'
# flock не дасть двом прогонам накластися: прохід із десятками запитів до
# Encar і ретраями на 407 триває до кількох хвилин.
LINE="17 * * * * cd $REPO || exit; /usr/bin/flock -n /tmp/bmw-watch.lock /usr/bin/python3 tools/watch.py >> $LOG 2>&1 $MARK"

mkdir -p "$(dirname "$LOG")"
( crontab -l 2>/dev/null | grep -vF "$MARK" || true; echo "$LINE" ) | crontab -

echo "Поставлено:"
crontab -l | grep -F "$MARK"
echo
echo "Лог: $LOG"
echo "Прибрати:  crontab -l | grep -vF '$MARK' | crontab -"
