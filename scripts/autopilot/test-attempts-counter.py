#!/usr/bin/env python3
"""test-attempts-counter.py -- T-0334. Plain unittest on the disposable Postgres of merchant_fixture.py
(never production, never a model call).

Run: python3 scripts/autopilot/test-attempts-counter.py
Mutation: drop the CASE fold in note_incident -> AC1 red; drop capped_attempts_sql from
append_attempt_sql -> AC3 red; drop the schedule_orphan_recheck calls -> AC4 red.
"""
import importlib.util
import json
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


def engine():
    global ENG
    if ENG is None:
        ENG = fx.load_engine()
    return ENG


def compact_module():
    spec = importlib.util.spec_from_file_location("compact_attempts_t0334", os.path.join(HERE, "compact-attempts.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def attempts(iid):
    return json.loads(fx.psql(f"SELECT attempts::text FROM incidents WHERE incident_id = '{iid}'"))


def new_incident(provider="amadeus", kind="PROVIDER_DOWN"):
    iid, created = ap.open_or_merge_incident(kind, provider, {"x": 1}, "probe")
    assert created
    return iid


def recurrences(iid):
    return [a for a in attempts(iid) if a["action"] == "recurrence"]


class AttemptsCounter(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fx.ensure_pg()

    def setUp(self):
        fx.reset()
        ap.tg_send = lambda text: True

    def test_ac1_same_fault_three_merges_is_one_entry_count_3(self):
        iid = new_incident()
        for _ in range(3):
            _, created = ap.open_or_merge_incident("PROVIDER_DOWN", "amadeus", {"x": 1}, "probe")
            self.assertFalse(created)
        rec = recurrences(iid)
        self.assertEqual(len(rec), 1)
        self.assertEqual(rec[0]["count"], 3)
        self.assertIn("last_at", rec[0])
        self.assertEqual([a["action"] for a in attempts(iid)], ["route", "recurrence"])

    def test_ac2_different_result_is_a_new_entry_and_other_actions_never_fold(self):
        iid = new_incident()
        ap.open_or_merge_incident("PROVIDER_DOWN", "amadeus", {"x": 1}, "probe")
        ap.open_or_merge_incident("PROVIDER_DOWN", "amadeus", {"x": 2}, "probe")
        self.assertEqual([r["count"] for r in recurrences(iid)], [1, 1])
        ap.note_incident(iid, "t", "note", "same")
        ap.note_incident(iid, "t", "note", "same")
        self.assertEqual(len([a for a in attempts(iid) if a["action"] == "note"]), 2)

    def test_ac3_600_writes_keep_500_with_one_marker(self):
        iid = new_incident()
        fx.psql("UPDATE incidents SET attempts = (SELECT jsonb_agg(jsonb_build_object("
                "'ts', 'x', 'actor', 't', 'action', 'note', 'result', 'n' || g) ORDER BY g) "
                f"FROM generate_series(1, 560) g) WHERE incident_id = '{iid}'")
        for i in range(40):
            ap.note_incident(iid, "t", "note", f"w{i}")
        a = attempts(iid)
        self.assertEqual(len(a), 500)
        marks = [i for i, e in enumerate(a) if e["action"] == "truncated"]
        self.assertEqual(marks, [50])
        self.assertEqual(a[50], {"action": "truncated", "dropped": 101})  # 600 logical - 499 kept
        self.assertEqual(a[0]["result"], "n1")
        self.assertEqual(a[-1]["result"], "w39")

    def _verifying(self, provider, fleet_task_id=None, kind="PROVIDER_DOWN"):
        iid = new_incident(provider, kind)
        ft = "NULL" if fleet_task_id is None else f"'{fleet_task_id}'"
        fx.psql(f"UPDATE incidents SET state = 'VERIFYING', fleet_task_id = {ft}, next_recheck_at = NULL "
                f"WHERE incident_id = '{iid}'")
        return iid

    def row(self, iid):
        return fx.psql(f"SELECT state, next_recheck_at IS NOT NULL FROM incidents WHERE incident_id = '{iid}'").split("\x1f")

    def test_ac4_orphan_verifying_gets_recheck_but_stuck_or_parked_does_not(self):
        orphan = self._verifying("jikan")
        with_task = self._verifying("night-orchestra", "T-1.md")
        stuck = self._verifying("amadeus", "T-2.md")
        parked = self._verifying("dictionary", "T-3.md")
        for sub, name in (("stuck", "T-2.md"), ("stuck/parked", "T-3.md")):
            os.makedirs(os.path.join(fx.SCRATCH, "taskloop", sub), exist_ok=True)
            open(os.path.join(fx.SCRATCH, "taskloop", sub, name), "w").close()
        engine().advance_verifying()
        self.assertEqual(self.row(orphan), ["VERIFYING", "t"])
        self.assertEqual(self.row(with_task), ["VERIFYING", "t"])
        self.assertEqual(self.row(stuck), ["STUCK", "f"])
        self.assertEqual(self.row(parked), ["STUCK", "f"])
        self.assertIn("recheck scheduled (orphan)", [a["result"] for a in attempts(orphan)])
        self.assertNotIn("recheck scheduled (orphan)", [a["result"] for a in attempts(stuck)])
        before = len(attempts(orphan))
        engine().advance_verifying()  # already scheduled: no second note
        self.assertEqual(len(attempts(orphan)), before)

    def test_ac4b_scheduled_orphan_still_resolves_on_a_fresh_ok_probe(self):
        iid = self._verifying("jikan")
        engine().advance_verifying()
        self.assertEqual(self.row(iid), ["VERIFYING", "t"])
        fx.psql("DELETE FROM provider_status WHERE provider = 'jikan'")
        fx.psql("INSERT INTO provider_status (provider, state, state_since, next_probe_at, probe_interval_s, "
                "last_probe_result, last_probe_at) VALUES ('jikan', 'HEALTHY', now(), now(), 300, 'OK', now())")
        engine().advance_verifying()
        self.assertEqual(self.row(iid)[0], "RESOLVED")

    def test_ac5_rate_limited_stuck_without_task_is_listed_not_changed(self):
        iid = new_incident("health", "RATE_LIMITED")
        fx.psql(f"UPDATE incidents SET state = 'STUCK' WHERE incident_id = '{iid}'")
        self.assertEqual([r[0] for r in engine().list_rate_limited_orphans()], [iid])
        self.assertEqual(self.row(iid), ["STUCK", "f"])

    def test_ac6_compact_collapses_runs_only(self):
        c = compact_module()
        rec = {"actor": "e", "action": "recurrence", "result": "r", "ts": "1"}
        src = [{"action": "route"}, dict(rec), dict(rec), {**rec, "result": "r2"}, dict(rec), dict(rec),
               {"action": "wait", "actor": "e", "result": "r"}, {"action": "wait", "actor": "e", "result": "r"}]
        out = c.collapse(src)
        self.assertEqual([(e["action"], e.get("count")) for e in out],
                         [("route", None), ("recurrence", 2), ("recurrence", 1), ("recurrence", 2),
                          ("wait", None), ("wait", None)])
        self.assertEqual(len(c.collapse([{"action": "note", "result": str(i)} for i in range(600)])), 500)


if __name__ == "__main__":
    unittest.main(verbosity=2)
