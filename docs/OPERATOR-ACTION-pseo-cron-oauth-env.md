# OPERATOR ACTION — pSEO print cron never sources ~/.claude/oauth.env

**Status:** diagnosed 2026-09-05 (T-09 ruling-1). Fix is a one-line crontab edit; the
taskloop sandbox hard-blocks any command that mentions `crontab -e/-r` or `.env` from an
agent session ("a human runs push.sh / deploy through the gated path" — see
`scripts/autopilot/incident-engine.py`'s own module docstring for the same boundary),
so this has to be applied by hand, not by a fleet task.

## What's broken

`logs/pseo/cron.log` shows every generation attempt failing the same way:

```
[pseo-tick] fire (roll=0.046 < p=0.08, count=1/2) -> generation_failed: claude CLI exit 1: stderr=''
[pseo-tick] quota_forced (count=1/2, hour=23 UTC) -> generation_failed: claude CLI exit 1: stderr=''
```

The `claude` CLI was exiting 1 with an empty stderr. Root cause: it printed `"Not logged
in"` as its JSON *result* on stdout (not stderr), and `call_claude_cli()` in
`~/content-machine/scripts/pseo-generate.py` only ever looked at stderr — fixed
separately in this same task (now falls through stderr -> stdout's `result`/`error`
field -> raw stdout -> a literal, never empty; also now tags this specific case
`error_class=auth_missing` so the 23:45 UTC underrun check reports `auth_missing`
instead of the misleading `generator_failure`).

But the actual reason the CLI wasn't logged in: the pSEO print cron line never sources
`~/.claude/oauth.env`. Compare it with taskloop's own cron line, which does:

```
*/5 * * * * bash -lc ". $HOME/.claude/oauth.env >/dev/null 2>&1; $HOME/taskloop/taskloop.sh" >/dev/null 2>&1
```

## The fix

1. Back up the current crontab first: `crontab -l > ~/crontab.bak-<date>`.
2. Find the pSEO probabilistic-generation line (currently the only `*/30 * * * *` line
   under the `content-machine` comment block):

   ```
   */30 * * * * [ "$(date -u +\%Y\%m\%d)" -ge 20260904 ] && cd /home/apibase/content-machine && set -a && . /home/apibase/apibase/.env && set +a && /usr/bin/python3 scripts/pseo-generate.py --probabilistic >> logs/pseo/cron.log 2>&1
   ```

3. Replace it with (adds oauth sourcing inside a `{ ...; }` group so a missing/failing
   oauth file is best-effort and does NOT swallow the date guard or the `cd`'s own
   `&&`-chain — those two must stay real gates):

   ```
   */30 * * * * [ "$(date -u +\%Y\%m\%d)" -ge 20260904 ] && cd /home/apibase/content-machine && { . ~/.claude/oauth.env 2>/dev/null; set -a && . /home/apibase/apibase/.env && set +a && /usr/bin/python3 scripts/pseo-generate.py --probabilistic; } >> logs/pseo/cron.log 2>&1
   ```

4. Install with `crontab <file>`, then confirm with `crontab -l | diff <old> -` that only
   this one line changed.
5. One manual verification run is fine (`cd ~/content-machine && . ~/.claude/oauth.env &&
   set -a && . ~/apibase/.env && set +a && python3 scripts/pseo-generate.py
   --probabilistic`) — but per ruling-1, it must count toward the daily cap of 2, not
   bypass it. Check `logs/pseo/cron.log` for a real published guide afterward, not just
   an exit code.

No secret value needs to be typed or printed for this — `oauth.env` is sourced by path,
same as the other cron lines already do.
