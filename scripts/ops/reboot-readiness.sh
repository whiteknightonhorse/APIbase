#!/usr/bin/env bash
# reboot-readiness.sh -- T-0593 (AUDIT-OPUS-1028 A4 section 6). READ-ONLY: lists what would not come
# back by itself after a reboot. Never starts, stops, enables or deletes anything. Always exit 0.
#
#   reboot-readiness.sh            full report (sections + OK lines)
#   reboot-readiness.sh --list     only the not-ready items, one per line (used by fleet-check)
#
# Env (tests only): RR_UNITS overrides the unit list; RR_SKIP_DOCKER=1 / RR_SKIP_PS=1 skip a section.

MODE="${1:-}"
UNITS="${RR_UNITS:-aipush-eth-indexer aipush-cf-hostname-poller aipush-gen-daily-runner mip-worker postgresql@14-main}"
PROBLEMS=()

say(){ [ "$MODE" = "--list" ] || printf '%s\n' "$*"; }
problem(){ PROBLEMS+=("$*"); say "NOT-READY  $*"; }

say "== systemd units (enabled state) =="
for u in $UNITS; do
  st=$(systemctl is-enabled "$u" 2>&1 | head -1)
  case "$st" in
    enabled|static|alias) say "enabled    $u ($st)" ;;
    *) problem "unit $u is '${st:-unknown}'" ;;
  esac
done

if [ -z "${RR_SKIP_DOCKER:-}" ]; then
  say "== containers with restart policy other than unless-stopped/always =="
  if command -v docker >/dev/null 2>&1; then
    while IFS=$'\t' read -r name pol; do
      [ -z "$name" ] && continue
      case "$pol" in
        unless-stopped|always) ;;
        *) problem "container $name restart policy '${pol:-no}'" ;;
      esac
    done < <(docker ps -a --format '{{.Names}}' 2>/dev/null | while read -r n; do
               printf '%s\t%s\n' "$n" "$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$n" 2>/dev/null)"
             done)
  else
    say "docker not available"
  fi
fi

if [ -z "${RR_SKIP_PS:-}" ]; then
  say "== listening processes with PPID 1 started from /tmp =="
  # ss -ltnpH prints users:(("name",pid=N,fd=M)); resolve each pid's PPID and cwd/exe/cmdline.
  while read -r pid; do
    [ -z "$pid" ] && continue
    ppid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
    [ "$ppid" = "1" ] || continue
    cmd=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)
    cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null)
    case "$cmd$cwd" in
      */tmp/*|/tmp*) problem "pid $pid (PPID 1) from /tmp: ${cmd:0:120}" ;;
    esac
  done < <(ss -ltnpH 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)
fi

say "== /tmp size =="
say "$(du -sh /tmp 2>/dev/null | cut -f1)  /tmp (cleared at boot)"

if [ "$MODE" = "--list" ]; then
  for p in "${PROBLEMS[@]}"; do printf '%s\n' "$p"; done
else
  say "== summary: ${#PROBLEMS[@]} not-ready item(s) =="
fi
exit 0
