"""T-0575: autopilot_common.tg_send writes lib/tg.sh's delivery line (fake curl on PATH, temp FS).
Run: python3 -m unittest discover -s tests/python -p 'test_tg_delivery.py'"""
import importlib
import os
import re
import stat
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "scripts", "autopilot"))

FAKE_CURL = """#!/bin/sh
# prints a Telegram-like body, then the -w "\\n%{http_code}" tail, from $FAKE_BODY / $FAKE_HTTP
printf '%s\\n%s' "$FAKE_BODY" "$FAKE_HTTP"
"""
BOT = "123456:FAKE-BOT-CREDENTIAL"
LINE = re.compile(
    r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ (SENT|FAILED|TG-NOENV|RECOVERED) http=\S+ ok=\S+ desc=\S+ bytes=\d+ head=.*$")


class TgSendDelivery(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        bindir = os.path.join(self.tmp, "bin")
        os.makedirs(bindir)
        curl = os.path.join(bindir, "curl")
        with open(curl, "w") as f:
            f.write(FAKE_CURL)
        os.chmod(curl, os.stat(curl).st_mode | stat.S_IEXEC)
        self.envfile = os.path.join(self.tmp, "tg.env")
        with open(self.envfile, "w") as f:
            f.write(f"TG_BOT_TOKEN={BOT}\nTG_CHAT_ID=987654\n")
        self.log = os.path.join(self.tmp, "tg-delivery.log")
        self.marker = os.path.join(self.tmp, "dead")
        self.streak = os.path.join(self.tmp, "streak")
        self.saved = dict(os.environ)
        os.environ.update({
            "PATH": bindir + os.pathsep + os.environ["PATH"],
            "AUTOPILOT_TG_ENV_PATH": self.envfile,
            "AUTOPILOT_TASKLOOP_ROOT": self.tmp,
            "TG_DELIVERY_LOG": self.log,
            "TG_DEAD_MARKER": self.marker,
            "TG_DEAD_STREAK_FILE": self.streak,
        })
        import autopilot_common
        self.ap = importlib.reload(autopilot_common)

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self.saved)

    def lines(self):
        with open(self.log) as f:
            return f.read().splitlines()

    def test_sent_line_format_and_no_secrets(self):
        os.environ.update(FAKE_BODY='{"ok":true,"result":{}}', FAKE_HTTP="200")
        self.assertTrue(self.ap.tg_send("[apibase] hello\nsecond line"))
        (line,) = self.lines()
        self.assertRegex(line, LINE)
        self.assertIn(" SENT http=200 ok=yes desc=none ", line)
        self.assertIn("head=[apibase] hello second line", line)
        self.assertNotIn(BOT, line)
        self.assertNotIn("987654", line)
        self.assertNotIn('"result"', line)

    def test_failed_line_and_dead_marker_after_three(self):
        os.environ.update(FAKE_BODY='{"ok":false,"description":"Bad Request: chat not found"}', FAKE_HTTP="400")
        for _ in range(3):
            self.assertFalse(self.ap.tg_send("x"))
        lines = self.lines()
        self.assertEqual(len(lines), 3)
        for line in lines:
            self.assertRegex(line, LINE)
            self.assertIn(" FAILED http=400 ok=no desc=Bad_Request:_chat_not_found ", line)
        self.assertTrue(os.path.exists(self.marker))

    def test_marker_not_written_before_third_failure_and_cleared_on_sent(self):
        os.environ.update(FAKE_BODY='{"ok":false}', FAKE_HTTP="500")
        self.ap.tg_send("a")
        self.ap.tg_send("b")
        self.assertFalse(os.path.exists(self.marker))
        self.ap.tg_send("c")
        self.assertTrue(os.path.exists(self.marker))
        os.environ.update(FAKE_BODY='{"ok":true}', FAKE_HTTP="200")
        self.assertTrue(self.ap.tg_send("d"))
        self.assertFalse(os.path.exists(self.marker))
        self.assertFalse(os.path.exists(self.streak))
        self.assertIn(" RECOVERED ", self.lines()[-1])
        self.assertIn(" SENT ", self.lines()[-2])

    def test_http_200_without_ok_true_is_failed(self):
        os.environ.update(FAKE_BODY='{"ok":false}', FAKE_HTTP="200")
        self.assertFalse(self.ap.tg_send("x"))
        self.assertIn(" FAILED http=200 ok=no ", self.lines()[0])

    def test_missing_env_file_logs_noenv(self):
        os.remove(self.envfile)
        self.assertFalse(self.ap.tg_send("x"))
        self.assertRegex(self.lines()[0], LINE)
        self.assertIn(" TG-NOENV http=- ok=- desc=no-env-file bytes=0 ", self.lines()[0])


if __name__ == "__main__":
    unittest.main()
