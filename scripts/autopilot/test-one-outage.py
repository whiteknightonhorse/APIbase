#!/usr/bin/env python3
"""test-one-outage.py -- T-0336. Plain unittest on the disposable Postgres of merchant_fixture.py
(never production, never a model call).

Run: python3 scripts/autopilot/test-one-outage.py
Mutation: drop _merge_outage_sibling's call -> OO1 red; drop the resolved_at window -> OO2/OO3 red;
drop the age check in _degraded_card_ready -> OO4 red; drop the FLAP_REOPEN_LIMIT branch -> OO5 red.
"""
import os
import sys
import unittest
import warnings

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import merchant_fixture as fx  # noqa: E402  (must precede autopilot_common: env overrides)
import autopilot_common as ap  # noqa: E402

warnings.simplefilter("ignore", ResourceWarning)
ENG = None
QUEUE = os.path.join(fx.SCRATCH, "taskloop", "queue")


def engine():
    global ENG
    if ENG is None:
        ENG = fx.load_engine()
    return ENG


def provider_status(provider, state, result="FAIL_TRANSIENT"):
    fx.psql(f"DELETE FROM provider_status WHERE provider = '{provider}'")
    fx.psql(
        "INSERT INTO provider_status (provider, state, state_since, last_probe_at, last_probe_result, "
        f"next_probe_at, probe_interval_s) VALUES ('{provider}', '{state}', now(), now(), '{result}', now(), 600)")


def row(iid, col):
    return fx.psql(f"SELECT {col} FROM incidents WHERE incident_id = '{iid}'")


def age(iid, hours):
    fx.psql(f"UPDATE incidents SET created_at = now() - interval '{hours} hours' WHERE incident_id = '{iid}'")


def resolve(iid, hours_ago=1):
    fx.psql(f"UPDATE incidents SET state = 'RESOLVED', resolved_at = now() - interval '{hours_ago} hours' "
            f"WHERE incident_id = '{iid}'")


def detect(provider, kind):
    return ap.open_or_merge_incident(kind, provider, {"x": 1}, "probe")


class OneOutage(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fx.ensure_pg()

    def setUp(self):
        fx.reset()
        fx.psql("TRUNCATE provider_status, probe_log; DELETE FROM tools")
        ap.tg_send = lambda text: True

    def test_oo1_two_kinds_same_provider_one_row(self):
        iid, created = detect("istat", "DEGRADED_QUALITY")
        self.assertTrue(created)
        iid2, created2 = detect("istat", "PROVIDER_DOWN")
        self.assertEqual((iid2, created2), (iid, False))
        self.assertEqual(row(iid, "kind"), "PROVIDER_DOWN")
        self.assertEqual(row(iid, "dedup_key"), "PROVIDER_DOWN:istat")
        self.assertIn("escalated", row(iid, "attempts::text"))
        iid3, created3 = detect("istat", "DEGRADED_QUALITY")  # DOWN -> DEGRADED keeps DOWN
        self.assertEqual((iid3, created3), (iid, False))
        self.assertEqual(row(iid, "kind"), "PROVIDER_DOWN")
        self.assertEqual(fx.psql("SELECT count(*) FROM incidents WHERE provider = 'istat'"), "1")

    def test_oo2_resolve_then_detect_within_24h_reopens_same_incident(self):
        iid, _ = detect("crossref", "DEGRADED_QUALITY")
        resolve(iid, hours_ago=2)
        iid2, created = detect("crossref", "DEGRADED_QUALITY")
        self.assertEqual((iid2, created), (iid, False))
        self.assertEqual(row(iid, "state"), "OPEN")
        self.assertEqual(row(iid, "resolved_at IS NULL"), "t")
        self.assertIn("reopened", row(iid, "attempts::text"))
        self.assertEqual(fx.psql("SELECT count(*) FROM incidents WHERE provider = 'crossref'"), "1")

    def test_oo3_resolved_longer_than_24h_ago_is_a_new_incident(self):
        iid, _ = detect("crossref", "DEGRADED_QUALITY")
        resolve(iid, hours_ago=30)
        iid2, created = detect("crossref", "DEGRADED_QUALITY")
        self.assertTrue(created)
        self.assertNotEqual(iid2, iid)

    def test_oo4_card_not_filed_before_age_then_filed(self):
        provider_status("health", "DEGRADED")
        iid, _ = detect("health", "DEGRADED_QUALITY")
        engine().route_auto_incidents()
        self.assertEqual(row(iid, "state"), "OPEN")
        self.assertEqual(os.listdir(QUEUE), [])
        age(iid, 3)
        engine().route_auto_incidents()
        self.assertEqual(row(iid, "state"), "REMEDIATION_QUEUED")
        self.assertEqual(len(os.listdir(QUEUE)), 1)

    def test_oo4b_healed_before_age_resolves_without_card(self):
        provider_status("iceland", "HEALTHY", result="OK")
        iid, _ = detect("iceland", "DEGRADED_QUALITY")
        age(iid, 3)
        engine().route_auto_incidents()
        self.assertEqual(row(iid, "state"), "RESOLVED")
        self.assertEqual(os.listdir(QUEUE), [])
        self.assertIn("self-recovered", row(iid, "attempts::text"))

    def test_oo5_third_reopen_is_flapping_waiting_human(self):
        iid, _ = detect("bea", "DEGRADED_QUALITY")
        for i in (1, 2):
            resolve(iid)
            detect("bea", "DEGRADED_QUALITY")
            self.assertEqual(row(iid, "state"), "OPEN", f"reopen {i}")
        resolve(iid)
        detect("bea", "DEGRADED_QUALITY")
        self.assertEqual(row(iid, "state"), "WAITING_HUMAN")
        self.assertIn("FLAPPING", row(iid, "attempts::text"))
        provider_status("bea", "DEGRADED")
        age(iid, 3)
        engine().route_auto_incidents()
        self.assertEqual(os.listdir(QUEUE), [])


if __name__ == "__main__":
    unittest.main()
