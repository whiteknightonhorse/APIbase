#!/usr/bin/env python3
"""deploy-tree-dirty-alert.py — T-20 addendum (2026-09-07): page once if the
DEPLOY tree (/home/apibase/apibase) sits dirty (`git status --porcelain`
non-empty) longer than DIRTY_GRACE_MINUTES, because that state means the
next `deploy.sh` run is guaranteed to abort at its own F2 gate (see
`scripts/deploy.sh`'s "ABORT: working tree has uncommitted changes").

Ruling-75 (taskloop/disputes/75-sync-counts-dirties-deploy-tree.ruling-1.md)
already closed the one KNOWN repeat writer (sync-counts.sh's old cron) via a
refuse-to-run guard (sync-counts.sh itself + .husky/pre-push). Both of those
fire at WRITE time / PUSH time. Neither can catch this ticket's actual
incident: a legitimate, deliberate live hotfix to nginx.conf (T-16/T-17 —
the deploy tree's nginx.conf is bind-mounted straight into the running
container, so a live edit-and-reload IS the only way to make a guides fix
live immediately) that was correctly applied, then never landed as a commit
and never cleaned up — it just sat there for hours until the next deploy
tried to run and aborted. There is no write to intercept; the defect is
absence of a *later* action. That needs a periodic check, not a guard.

Do NOT auto-revert and do NOT auto-commit here (explicit prohibition in the
T-20 brief) — both are worse than the dirt itself: a revert can destroy a
live-only fix (this exact nginx.conf case), and a commit from an unattended
script bypasses the one human review step (/push) that ruling-75 itself
relied on to keep the deploy tree's only sanctioned writer honest. This
script only reads `git status --porcelain` and, if warranted, sends ONE
Telegram message — it changes no tracked file, staged or not.

State lives in scripts/night-orchestra/state/ (this whole directory is
gitignored in BOTH trees — deploy tree and fleet tree — see
`scripts/night-orchestra/` in .gitignore, B-01 private-repo split), so this
script's own bookkeeping can never itself be the thing that makes
`git status --porcelain` non-empty in the deploy tree.

Alert de-duplication: writes first-seen-dirty timestamp to STATE_FILE the
first tick it sees dirt. Once DIRTY_GRACE_MINUTES has elapsed AND no alert
has been sent yet for this dirty episode, sends exactly one Telegram message
and marks ALERTED_FILE. Both files are removed the moment the tree is clean
again, so the NEXT dirty episode gets its own fresh grace period and its own
single alert — never a stream of pages for one ongoing problem, and never
silence for a second, unrelated one.

Run via cron, e.g. (same `cd` + STATE shape as x402-settle-leak-alerts.py /
mpp-refund-owed-alerts.py -- this is a read-only sibling of those, not a new
pattern):
    */10 * * * * cd /home/apibase/apibase && /usr/bin/python3 scripts/deploy-tree-dirty-alert.py >> scripts/night-orchestra/logs/deploy-tree-dirty-alert.log 2>&1

Runs FROM the deploy tree (not the fleet tree) deliberately, matching every
other *-alerts.py sibling: that is where the real `tg.env` (bot token) and
`scripts/night-orchestra/state/` actually live (the fleet tree's copy of
that directory is a near-empty placeholder -- night-orchestra is a separate
private repo, B-01). This is safe against F2 for the same reason its
siblings already are: it only ever WRITES inside `scripts/night-orchestra/`,
which is entirely `.gitignore`d in the deploy tree, and its only read of the
tracked tree is `git status --porcelain` -- no tracked file is ever touched.
"""
import os
import subprocess
import time

DEPLOY_TREE = "/home/apibase/apibase"
STATE_DIR = f"{DEPLOY_TREE}/scripts/night-orchestra/state"
STATE_FILE = f"{STATE_DIR}/deploy-tree-dirty-since.txt"
ALERTED_FILE = f"{STATE_DIR}/deploy-tree-dirty-alerted.txt"
TG_ENV_PATH = f"{STATE_DIR}/tg.env"
DIRTY_GRACE_MINUTES = 30


def load_tg_env():
    env = {}
    if not os.path.exists(TG_ENV_PATH):
        return env
    for line in open(TG_ENV_PATH):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k] = v.strip('"').strip("'")
    return env


def tg_send(text: str) -> bool:
    env = load_tg_env()
    token, chat_id = env.get("TG_BOT_TOKEN"), env.get("TG_CHAT_ID")
    if not token or not chat_id:
        print("deploy-tree-dirty-alert: no tg.env configured -- would have sent:\n" + text)
        return False
    r = subprocess.run(
        ["curl", "-sS", "--max-time", "30", "-F", f"chat_id={chat_id}", "-F", f"text={text}",
         f"https://api.telegram.org/bot{token}/sendMessage"],
        capture_output=True, text=True,
    )
    return '"ok":true' in r.stdout


def porcelain_status() -> str:
    out = subprocess.run(
        ["git", "-C", DEPLOY_TREE, "status", "--porcelain"],
        capture_output=True, text=True,
    )
    return out.stdout


def main():
    os.makedirs(STATE_DIR, exist_ok=True)
    status = porcelain_status()

    if not status.strip():
        # Clean: reset both markers so the next dirty episode starts fresh.
        removed = False
        for f in (STATE_FILE, ALERTED_FILE):
            if os.path.exists(f):
                os.remove(f)
                removed = True
        print("deploy-tree-dirty-alert: clean" + (" (reset markers)" if removed else ""))
        return

    now = time.time()
    if not os.path.exists(STATE_FILE):
        with open(STATE_FILE, "w") as f:
            f.write(str(now))
        print(f"deploy-tree-dirty-alert: dirty, first seen now -- grace period started ({DIRTY_GRACE_MINUTES}min)")
        return

    first_seen = float(open(STATE_FILE).read().strip())
    elapsed_min = (now - first_seen) / 60

    if elapsed_min < DIRTY_GRACE_MINUTES:
        print(f"deploy-tree-dirty-alert: dirty for {elapsed_min:.1f}min, within grace period, not yet alerting")
        return

    if os.path.exists(ALERTED_FILE):
        print(f"deploy-tree-dirty-alert: dirty for {elapsed_min:.1f}min, already alerted this episode, staying quiet")
        return

    files = "\n".join(f"  {line}" for line in status.strip().splitlines())
    text = (
        f"[apibase] ⚠️ deploy tree ({DEPLOY_TREE}) dirty for {elapsed_min:.0f}min -- "
        f"next deploy.sh run WILL abort at the F2 gate.\n{files}\n\n"
        f"Do not `git checkout -- <file>` blindly if it's a live hotfix (e.g. nginx.conf is "
        f"bind-mounted into the running container) -- land it as a proper commit in "
        f"apibase-fleet (ci-staging) first, THEN clean this tree."
    )
    ok = tg_send(text)
    if ok:
        with open(ALERTED_FILE, "w") as f:
            f.write(str(now))
        print(f"deploy-tree-dirty-alert: ALERTED (dirty {elapsed_min:.0f}min)")
    else:
        print(f"deploy-tree-dirty-alert: dirty {elapsed_min:.0f}min, alert send FAILED -- will retry next tick")


if __name__ == "__main__":
    main()
