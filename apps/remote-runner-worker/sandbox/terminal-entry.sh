#!/bin/sh
set -eu

case "${PRODIVIX_TERMINAL_PID_FILE:-}" in
  /tmp/prodivix-terminal-*.pid) ;;
  *) exit 64 ;;
esac

case "${PRODIVIX_TERMINAL_COLUMNS:-}" in
  ''|*[!0-9]*) exit 64 ;;
esac
case "${PRODIVIX_TERMINAL_ROWS:-}" in
  ''|*[!0-9]*) exit 64 ;;
esac

exec script -qefc '
  umask 077
  printf "%s" "$$" > "${PRODIVIX_TERMINAL_PID_FILE}"
  stty cols "${PRODIVIX_TERMINAL_COLUMNS}" rows "${PRODIVIX_TERMINAL_ROWS}"
  export PS1="$ "
  exec /bin/sh -i
' /dev/null
