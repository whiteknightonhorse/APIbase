#!/usr/bin/env python3
"""test-close-healthy.py -- T-0335. Plain unittest on the disposable Postgres of merchant_fixture.py
(never production, never a model call).

Run: python3 scripts/autopilot/test-close-healthy.py
Mutation: drop the `epoch <= card_mtime` check -> CH2 red; drop the probe_log last-2 check -> CH3 red;
drop the provider_is_retired guard in open_or_merge_incident -> CH4 red.
"""
import io
import os
import sys
import time
import unittest
import warnings
from contextlib import redirect_stdout

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import merchant_fixture as fx  # noqa: E402  (must precede autopilot_common: env overrides)
import autopilot_common as ap  # noqa: E402

warnings.simplefilter("ignore", ResourceWarning)
ENG = None
ROOT = os.path.join(fx.SCRATCH, "taskloop")


def engine():
    global ENG
    if ENG is None:
        ENG = fx.load_engine()
    return ENG


def card(where, name, age_s=0, body="# card\n"):
    d = {"queue": "queue", "stuck": "stuck", "parked": "stuck/parked", "done": "done"}[where]
    os.makedirs(os.path.join(ROOT, d), exist_ok=True)
    path = os.path.join(ROOT, d, name)
    with open(path, "w") as f:
        f.write(body)
    t = time.time() - age_s
    os.utime(path, (t, t))
    return path


def provider_status(provider, state, probe_age_s, results=("OK", "OK")):
    fx.psql(f"DELETE FROM provider_status WHERE provider = '{provider}'; DELETE FROM probe_log WHERE provider = '{provider}'")
    fx.psql(
        "INSERT INTO provider_status (provider, state, state_since, last_probe_at, last_probe_result, next_probe_at, probe_interval_s) "
        f"VALUES ('{provider}', '{state}', now(), now() - interval '{probe_age_s} seconds', '{results[0]}', now(), 600)")
    for i, r in enumerate(results):
        fx.psql(f"INSERT INTO probe_log (provider, ts, kind, result) VALUES ('{provider}', "
                f"now() - interval '{probe_age_s + i * 60} seconds', 'head', '{r}')")


def queued_incident(provider, task, state="REMEDIATION_QUEUED", kind="PROVIDER_DOWN"):
    iid, created = ap.open_or_merge_incident(kind, provider, {"x": 1}, "probe")
    assert created
    fx.psql(f"UPDATE incidents SET state = '{state}', fleet_task_id = '{task}' WHERE incident_id = '{iid}'")
    return iid


def state_of(iid):
    return fx.psql(f"SELECT state FROM incidents WHERE incident_id = '{iid}'")


class CloseHealthy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fx.ensure_pg()

    def setUp(self):
        fx.reset()
        fx.psql("TRUNCATE provider_status, probe_log; DELETE FROM tools")
        ap.tg_send = lambda text: True

    def test_ch1_healthy_after_card_resolves_and_moves(self):
        fx.psql("INSERT INTO tools VALUES ('a.t', 'dpla', 'healthy')")
        card("queue", "9656-dpla.md", age_s=3600)
        iid = queued_incident("dpla", "9656-dpla.md")
        provider_status("dpla", "HEALTHY", probe_age_s=60)
        engine().close_healthy_remediations()
        self.assertEqual(state_of(iid), "RESOLVED")
        self.assertFalse(os.path.exists(os.path.join(ROOT, "queue", "9656-dpla.md")))
        done = open(os.path.join(ROOT, "done", "9656-dpla.md")).read()
        self.assertIn(f"AUTO-CLOSED-BY: incident-engine {iid}", done)
        notes = fx.psql(f"SELECT attempts::text FROM incidents WHERE incident_id = '{iid}'")
        self.assertIn("auto-closed: provider healthy at ", notes)
        self.assertIn(", card filed ", notes)

    def test_ch2_probe_older_than_card_untouched(self):
        fx.psql("INSERT INTO tools VALUES ('a.t', 'dpla', 'healthy')")
        card("queue", "9656-dpla.md", age_s=60)
        iid = queued_incident("dpla", "9656-dpla.md")
        provider_status("dpla", "HEALTHY", probe_age_s=3600)
        engine().close_healthy_remediations()
        self.assertEqual(state_of(iid), "REMEDIATION_QUEUED")
        self.assertTrue(os.path.exists(os.path.join(ROOT, "queue", "9656-dpla.md")))

    def test_ch3_last_two_probes_must_be_ok_and_active_card_untouched(self):
        fx.psql("INSERT INTO tools VALUES ('a.t', 'dpla', 'healthy'), ('b.t', 'bcb', 'healthy')")
        card("queue", "9656-dpla.md", age_s=3600)
        iid = queued_incident("dpla", "9656-dpla.md")
        provider_status("dpla", "HEALTHY", probe_age_s=60, results=("OK", "FAIL_TRANSIENT"))
        card("stuck", "x", age_s=0)  # unrelated
        os.makedirs(os.path.join(ROOT, "active"), exist_ok=True)
        with open(os.path.join(ROOT, "active", "9651-bcb.md"), "w") as f:
            f.write("running\n")
        iid2 = queued_incident("bcb", "9651-bcb.md")
        os.utime(os.path.join(ROOT, "active", "9651-bcb.md"), (time.time() - 3600,) * 2)
        provider_status("bcb", "HEALTHY", probe_age_s=60)
        engine().close_healthy_remediations()
        self.assertEqual(state_of(iid), "REMEDIATION_QUEUED")
        self.assertEqual(state_of(iid2), "REMEDIATION_QUEUED")
        self.assertTrue(os.path.exists(os.path.join(ROOT, "active", "9651-bcb.md")))

    def test_ch4_retired_provider_opens_no_incident_and_old_row_gets_one_note(self):
        iid, created = ap.open_or_merge_incident("PROVIDER_DOWN", "gdelt", {"x": 1}, "probe")
        self.assertTrue(created)  # still has an active tool -> not retired yet
        fx.psql("INSERT INTO tools VALUES ('g.t', 'gdelt', 'unavailable')")
        fx.psql(f"UPDATE incidents SET state = 'RESOLVED' WHERE incident_id = '{iid}'")
        self.assertEqual(ap.open_or_merge_incident("PROVIDER_DOWN", "gdelt", {"x": 1}, "probe"), (None, False))
        self.assertEqual(fx.psql("SELECT count(*) FROM incidents WHERE state <> 'RESOLVED'"), "0")
        fx.psql(f"UPDATE incidents SET state = 'OPEN' WHERE incident_id = '{iid}'")
        engine().close_healthy_remediations()
        engine().close_healthy_remediations()
        self.assertEqual(state_of(iid), "WAITING_HUMAN")
        notes = fx.psql(f"SELECT count(*) FROM incidents, jsonb_array_elements(attempts) e "
                        f"WHERE incident_id = '{iid}' AND e->>'action' = 'retired-provider'")
        self.assertEqual(notes, "1")

    def test_ch5_parked_resolved_moves_orphans_listed(self):
        old = 15 * 86400
        card("parked", "9500-a.md", age_s=old)
        card("parked", "9615-adbkidb.md", age_s=old, body="harness did not recognize DONE\n")
        card("parked", "0111.md", age_s=old)
        card("parked", "9600-fresh.md", age_s=3600)
        iid, _ = ap.open_or_merge_incident("PROVIDER_DOWN", "a", {"x": 1}, "probe")
        fx.psql(f"UPDATE incidents SET state = 'RESOLVED', fleet_task_id = '9500-a.md' WHERE incident_id = '{iid}'")
        engine().close_healthy_remediations()
        self.assertIn("AUTO-CLOSED-BY: incident-engine", open(os.path.join(ROOT, "done", "9500-a.md")).read())
        for stay in ("9615-adbkidb.md", "0111.md", "9600-fresh.md"):
            self.assertTrue(os.path.exists(os.path.join(ROOT, "stuck", "parked", stay)), stay)
        log = open(ap.NOTICES_LOG).read()
        self.assertIn("9615-adbkidb.md", log)
        self.assertIn("0111.md", log)
        self.assertNotIn("9600-fresh.md", log)

    def test_ch6_dry_run_writes_nothing(self):
        fx.psql("INSERT INTO tools VALUES ('a.t', 'dpla', 'healthy')")
        card("queue", "9656-dpla.md", age_s=3600)
        iid = queued_incident("dpla", "9656-dpla.md")
        provider_status("dpla", "HEALTHY", probe_age_s=60)
        buf = io.StringIO()
        with redirect_stdout(buf):
            engine().close_healthy_remediations(dry_run=True)
        self.assertIn("WOULD RESOLVE", buf.getvalue())
        self.assertEqual(state_of(iid), "REMEDIATION_QUEUED")
        self.assertTrue(os.path.exists(os.path.join(ROOT, "queue", "9656-dpla.md")))
        self.assertFalse(os.path.exists(os.path.join(ROOT, "done", "9656-dpla.md")))


if __name__ == "__main__":
    unittest.main()
