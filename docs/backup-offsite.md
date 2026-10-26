# Offsite backup: encrypted staging and laptop pull (T-0355)

Decision: APIBASE-AUDIT-1012 ruling-6 B. The laptop pulls; the server never holds a key that can read the copies.

## 1. What is staged where
- `backups/daily/apibase-YYYYMMDD.sql.gz` is written by `postgres_backup` at 03:00 UTC (7 days kept). `apibase-latest.sql.gz` is never staged.
- `scripts/backup-encrypt.sh` (03:40 UTC) encrypts each daily dump with the public age recipient from `config/backup/offsite.json` into `backups/offsite-staging/` (mode 750, files 640):
  `apibase-YYYYMMDD.sql.gz.age` plus `apibase-YYYYMMDD.sql.gz.age.sha256` (lists the bare file name).
  Staged files whose source dump has rotated away are deleted. The last stdout line is `ENCRYPT OK new=<n> staged=<m> seconds=<s>` or `ENCRYPT FAIL <reason>` (exit 1).
- The recipient is a public key and is safe to commit. `age1REPLACEME` is a placeholder until the laptop key exists; the script refuses to run with it.

T-0571 adds the `fleet-` and `orchestra-` dump families and `env-YYYYMMDD.tar.age`; see [self-hosting.md](self-hosting.md#backups) for the canonical list and permissions.

## 2. Laptop side
- Pull script `~/bin/apibase-backup-pull.sh`, run by launchd at 12:00 Asia/Bangkok.
- It downloads new `.age` and `.sha256` files over ssh as user `apibase`, verifies `sha256sum -c` and `age -d | gzip -t`, keeps the newest 3 copies and deletes older ones.
- After a verified download it writes `backups/offsite-staging/.last-pull` on the server: `<name> <ISO-8601 UTC>`.
- Log: `pull.log`, expected line `OK stored <name>`.

## 3. Secret key
- Lives only on the laptop: `~/.config/apibase-backup/age.key` (mode 600, FileVault disk).
- One copy in the operator's password manager. Never on the server.

## 4. Restore from a laptop copy
```
age -d -i ~/.config/apibase-backup/age.key -o x.sql.gz x.sql.gz.age && touch -r x.sql.gz.age x.sql.gz && scp -p x.sql.gz apibase-prod:/tmp/ && ssh apibase-prod 'bash ~/apibase/scripts/backup-restore-drill.sh /tmp/x.sql.gz; shred -u /tmp/x.sql.gz'
```

## 5. Stale detection
- `scripts/backup-offsite-check.sh` (06:00 UTC) compares `.last-pull` with now. Older than 48 h, or missing, means stale.
- State is kept in `.stale-state`. It prints exactly one line per transition: `OFFSITE-PULL STALE age=<h>h last=<name|none>` (exit 1), later `OFFSITE-PULL RESOLVED last=<name>`. While still stale it prints nothing (exit 1). `--verbose` also prints `OFFSITE-PULL OK ...`.
- The dispatcher wires the scheduler lines and the single Telegram message each way.

## 6. Tests
`bash tests/bash/backup-offsite.test.sh` (throw-away key, temp dirs, never touches real `backups/`).
