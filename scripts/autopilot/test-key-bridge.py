#!/usr/bin/env python3
"""test-key-bridge.py — T-0239. Plain unittest, every world is a synthetic temp dir; nothing live is touched.

Run: python3 scripts/autopilot/test-key-bridge.py
The mutation tests re-run this same suite against a mutated copy of key-bridge.py (via KB_SCRIPT) and
require it to FAIL, which shows the guard is actually covered.
"""
import fcntl
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
REAL = os.path.join(HERE, "key-bridge.py")
SCRIPT = os.environ.get("KB_SCRIPT", REAL)
IS_MUTANT = bool(os.environ.get("KB_SCRIPT"))
MARKER_TEXT = "## KEYED CANDIDATE\nif the candidate line has a fourth field starting with key= ...\n"


def rec(pid, status="issued", auth="header X-Key", date="2026-09-10", env=None, url="https://x.example"):
    r = {"provider_id": pid, "env_vars": env or ["PROVIDER_KEY_" + pid.upper().replace("-", "_")],
         "status": status, "signup_url": url}
    if auth:
        r["auth_method"] = auth
        r["auth_method_date"] = date
    return r


class World:
    def __init__(self, records, connected=None, queue_lines=(), resolutions=None, adapters=(), marker=True):
        self.dir = tempfile.mkdtemp(prefix="kb-test-")
        self.state = os.path.join(self.dir, "state")
        self.roles = os.path.join(self.dir, "roles")
        self.adapters = os.path.join(self.dir, "adapters")
        for d in (self.state, self.roles, self.adapters):
            os.makedirs(d)
        for a in adapters:
            os.makedirs(os.path.join(self.adapters, a))
        self._w("state/key-required-queue.json", json.dumps(records))
        self._w("state/connected.json", json.dumps(connected or {}))
        self._w("state/queue.txt", "".join(l + "\n" for l in queue_lines))
        self._w("resolutions.json", json.dumps(resolutions or {}))
        self._w("roles/fix.md", "x")
        self._w("roles/onboard-batch.md", MARKER_TEXT if marker else "no-auth candidates only\n")

    def _w(self, rel, text):
        with open(os.path.join(self.dir, rel), "w") as f:
            f.write(text)

    def read(self, rel):
        try:
            with open(os.path.join(self.dir, rel)) as f:
                return f.read()
        except FileNotFoundError:
            return None

    def queue(self):
        return self.read("state/queue.txt")

    def ledger(self):
        t = self.read("state/key-bridge.jsonl")
        return [json.loads(l) for l in t.splitlines()] if t else []

    def run(self, *extra, state=True, script=None):
        env = dict(os.environ, AUTOPILOT_FIX_MD=os.path.join(self.roles, "fix.md"),
                   KEY_BRIDGE_ADAPTERS_DIR=self.adapters,
                   KEY_BRIDGE_RESOLUTIONS=os.path.join(self.dir, "resolutions.json"))
        cmd = [sys.executable, script or SCRIPT] + (["--state-dir", self.state] if state else []) + list(extra)
        return subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=60)

    def close(self):
        shutil.rmtree(self.dir, ignore_errors=True)


class KeyBridgeTests(unittest.TestCase):
    def world(self, *a, **kw):
        w = World(*a, **kw)
        self.addCleanup(w.close)
        return w

    def queued_names(self, w):
        return [l.split("|")[0] for l in w.queue().splitlines() if "|keyed|" in l]

    # ---- classification rows ----
    def test_queue_line_format_and_ledger(self):
        w = self.world([rec("alpha-api", auth="query|param x", env=["PROVIDER_KEY_A", "PROVIDER_KEY_B"])])
        r = w.run()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(w.queue().splitlines()[-1],
                         "alpha-api|https://x.example|keyed|key=PROVIDER_KEY_A,PROVIDER_KEY_B;auth=query/param x")
        led = w.ledger()
        self.assertEqual([(l["provider_id"], l["action"]) for l in led], [("alpha-api", "queued")])
        self.assertIn("date", led[0])

    def test_resolved_skip(self):
        w = self.world([rec("alpha")], resolutions={"alpha": {"resolution": "connected-as", "as": "beta",
                                                              "evidence": "x:1", "date": "2026-10-01"}})
        r = w.run()
        self.assertEqual(self.queued_names(w), [])
        self.assertIn("resolved", r.stdout)

    def test_resolution_queue_overrides_candidate_and_supplies_base_url(self):
        w = self.world([rec("census-x")], connected={"census": {"status": "connected"}},
                       resolutions={"census-x": {"resolution": "queue", "as": None,
                                                 "base_url": "https://api.census-x.example",
                                                 "evidence": "m", "date": "2026-10-01"}})
        w.run()
        self.assertEqual(w.queue().splitlines()[-1].split("|")[:3],
                         ["census-x", "https://api.census-x.example", "keyed"])

    def test_alias_exact_connected_key(self):
        w = self.world([rec("ocr-space")], connected={"ocrspace": {"status": "connected"}})
        r = w.run()
        self.assertEqual(self.queued_names(w), [])
        self.assertIn("connected-as ocrspace", r.stdout)

    def test_alias_exact_adapter_dir(self):
        w = self.world([rec("my_adapter")], adapters=["myadapter"])
        r = w.run()
        self.assertEqual(self.queued_names(w), [])
        self.assertIn("connected-as myadapter", r.stdout)

    def test_exact_name_but_not_connected_holds_as_candidate_not_alias(self):
        w = self.world([rec("foo")], connected={"foo": {"status": "blocked"}})
        r = w.run()
        self.assertEqual(self.queued_names(w), [])  # never auto-resolved as connected-as
        self.assertIn("alias candidate foo", r.stdout)

    def test_alias_candidate_prefix_and_suffix_hold(self):
        w = self.world([rec("eia-energy"), rec("un-trade-x"), rec("zz")],
                       connected={"eia": {"status": "connected"}, "x": {"status": "connected"},
                                  "trade-x": {"status": "connected"}})
        r = w.run()
        self.assertEqual(self.queued_names(w), ["zz"])
        self.assertIn("alias candidate eia", r.stdout)
        self.assertIn("alias candidate trade-x", r.stdout)  # suffix overlap

    def test_overlap_below_three_chars_ignored(self):
        w = self.world([rec("abc-thing")], connected={"ab": {"status": "connected"}})
        w.run()
        self.assertEqual(self.queued_names(w), ["abc-thing"])

    def test_alias_candidate_via_adapter_dir(self):
        w = self.world([rec("epa-aqs")], connected={"epa": {"status": "skip"}}, adapters=["epa"])
        r = w.run()
        self.assertEqual(self.queued_names(w), [])
        self.assertIn("alias candidate epa", r.stdout)

    def test_skip_status_connected_key_alone_is_not_candidate(self):
        w = self.world([rec("stats-nz")], connected={"statsnzapi": {"status": "skip"}})
        w.run()
        self.assertEqual(self.queued_names(w), ["stats-nz"])

    def test_unverified_hold(self):
        w = self.world([rec("nomethod", auth=None)])
        r = w.run()
        self.assertEqual(self.queued_names(w), [])
        self.assertIn("unverified", r.stdout)

    def test_pending_dead_waiting_skip_never_touched(self):
        w = self.world([rec("p1", status="pending"), rec("p2", status="dead"),
                        rec("p3", status="waiting"), rec("p4", status="skip")])
        r = w.run()
        self.assertEqual(self.queued_names(w), [])
        self.assertEqual(w.ledger(), [])
        for p in ("p1", "p2", "p3", "p4"):
            self.assertNotIn(p, r.stdout)

    # ---- idempotency / dedup ----
    def test_rerun_appends_nothing(self):
        w = self.world([rec("alpha"), rec("beta")])
        w.run()
        first_q, first_l = w.queue(), w.ledger()
        w.run()
        w.run()
        self.assertEqual(w.queue(), first_q)
        self.assertEqual(w.ledger(), first_l)

    def test_already_in_queue_txt_field1(self):
        w = self.world([rec("alpha")], queue_lines=["alpha|https://old|misc"])
        w.run()
        self.assertEqual(w.queue(), "alpha|https://old|misc\n")

    def test_ledger_within_7_days_blocks_even_without_queue_line(self):
        w = self.world([rec("alpha")])
        from datetime import date
        w._w("state/key-bridge.jsonl", json.dumps({"provider_id": "alpha", "action": "queued", "reason": "r",
                                                    "date": date.today().isoformat()}) + "\n")
        r = w.run()
        self.assertEqual(self.queued_names(w), [])
        self.assertIn("recent", r.stdout)

    def test_ledger_older_than_7_days_allows_requeue(self):
        w = self.world([rec("alpha")])
        w._w("state/key-bridge.jsonl", json.dumps({"provider_id": "alpha", "action": "queued", "reason": "r",
                                                    "date": "2020-01-01"}) + "\n")
        w.run()
        self.assertEqual(self.queued_names(w), ["alpha"])

    def test_queued_three_times_without_resolution_stops(self):
        w = self.world([rec("alpha")])
        w._w("state/key-bridge.jsonl", "".join(json.dumps({"provider_id": "alpha", "action": "queued",
                                                           "reason": "r", "date": "2020-01-0%d" % i}) + "\n"
                                               for i in (1, 2, 3)))
        r = w.run()
        self.assertEqual(self.queued_names(w), [])
        self.assertIn("exhausted", r.stdout)

    def test_missing_trailing_newline_does_not_glue_lines(self):
        w = self.world([rec("alpha")])
        w._w("state/queue.txt", "dog|https://d|misc")
        w.run()
        self.assertEqual(w.queue().splitlines()[0], "dog|https://d|misc")
        self.assertTrue(w.queue().splitlines()[1].startswith("alpha|"))

    # ---- guards ----
    def test_lock_held_writes_nothing(self):
        w = self.world([rec("alpha")])
        before = w.queue()
        fd = os.open(os.path.join(w.state, "orchestra.lock"), os.O_RDWR | os.O_CREAT)
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            r = w.run()
        finally:
            os.close(fd)
        self.assertEqual(w.queue(), before)
        self.assertEqual(w.ledger(), [])
        self.assertIn("lock held", r.stdout)

    def test_lock_free_proceeds(self):
        w = self.world([rec("alpha")])
        w.run()
        self.assertEqual(self.queued_names(w), ["alpha"])

    def test_default_state_refused_outside_root(self):
        w = self.world([rec("alpha")])
        r = w.run(state=False)  # no --state-dir; script lives in the fleet tree
        self.assertEqual(r.returncode, 2)
        self.assertIn("REFUSED", r.stdout)
        self.assertEqual(w.queue(), "")

    def test_marker_absent_holds(self):
        w = self.world([rec("alpha")], marker=False)
        r = w.run()
        self.assertEqual(self.queued_names(w), [])
        self.assertEqual(w.ledger(), [])
        self.assertIn("hold-marker", r.stdout)

    def test_marker_present_queues(self):
        w = self.world([rec("alpha")], marker=True)
        w.run()
        self.assertEqual(self.queued_names(w), ["alpha"])

    def test_cap_respected_default_two_and_max_flag(self):
        w = self.world([rec("a-one"), rec("b-two"), rec("c-three"), rec("d-four")])
        r = w.run()
        self.assertEqual(len(self.queued_names(w)), 2)
        self.assertIn("deferred-cap", r.stdout)
        w.run("--max", "1")
        self.assertEqual(len(self.queued_names(w)), 3)  # the cap is per run; the first two are deduped

    def test_dry_run_writes_nothing(self):
        w = self.world([rec("alpha"), rec("ocrspace")], connected={"ocrspace": {"status": "connected"}})
        before = w.queue()
        r = w.run("--dry-run")
        self.assertEqual(w.queue(), before)
        self.assertEqual(w.ledger(), [])
        self.assertFalse(os.path.exists(os.path.join(w.state, "orchestra.lock")))
        self.assertIn("would-queue", r.stdout)
        self.assertIn("connected-as ocrspace", r.stdout)


@unittest.skipIf(IS_MUTANT, "mutants run the base suite only")
class MutationTests(unittest.TestCase):
    """Each mutation removes one guard; the suite must then fail."""

    MUTATIONS = {
        "remove-dedup": [("if n in queued_names:", "if False:"),
                         ("if len(mine) >= MAX_QUEUED_TIMES:", "if False:"),
                         ("if recent:", "if False:")],
        "remove-lock-check": [("fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)", "pass")],
        "remove-marker-check": [("if not has_marker:", "if False:")],
    }

    def _mutant_run(self, name):
        with open(REAL) as f:
            src = f.read()
        for old, new in self.MUTATIONS[name]:
            self.assertIn(old, src, f"mutation anchor vanished: {old}")
            src = src.replace(old, new)
        tmp = tempfile.mkdtemp(prefix="kb-mutant-")
        self.addCleanup(shutil.rmtree, tmp, True)
        shutil.copy(os.path.join(HERE, "autopilot_common.py"), tmp)
        path = os.path.join(tmp, "key-bridge.py")
        with open(path, "w") as f:
            f.write(src)
        r = subprocess.run([sys.executable, os.path.abspath(__file__), "-v"], capture_output=True, text=True,
                           env=dict(os.environ, KB_SCRIPT=path,
                                    AUTOPILOT_ROUTING_JSON=os.path.join(ROOT, "config", "autopilot", "routing.json"),
                                    AUTOPILOT_PROVIDER_LIMITS_JSON=os.path.join(ROOT, "src", "config",
                                                                                "provider-limits.json")),
                           timeout=300)
        return r

    def _assert_killed(self, name, expect_failing):
        r = self._mutant_run(name)
        out = r.stderr + r.stdout
        killed = [l.split(" (")[0] for l in out.splitlines() if l.endswith(("... FAIL", "... ERROR"))]
        print(f"\n[mutant {name}] exit={r.returncode} failing: {', '.join(sorted(killed))}", file=sys.stderr)
        self.assertNotEqual(r.returncode, 0, f"mutant {name} survived:\n{out}")
        for t in expect_failing:
            self.assertRegex(out, rf"{t} \(.*\) \.\.\. (FAIL|ERROR)", f"{name}: {t} did not fail:\n{out}")

    def test_mutation_remove_dedup_fails(self):
        self._assert_killed("remove-dedup", ["test_rerun_appends_nothing", "test_already_in_queue_txt_field1"])

    def test_mutation_remove_lock_check_fails(self):
        self._assert_killed("remove-lock-check", ["test_lock_held_writes_nothing"])

    def test_mutation_remove_marker_check_fails(self):
        self._assert_killed("remove-marker-check", ["test_marker_absent_holds"])


if __name__ == "__main__":
    unittest.main()
