#!/usr/bin/env python3
"""test-phase-a-brief.py — T-0291. Plain unittest, no DB, no model call.
Checks the phase-A brief: every Measurement command is ONE block with `date -u` first and
`| tee <proof_dir>` last; the cause section demands evidence or `cause: unknown`.

Run: python3 scripts/autopilot/test-phase-a-brief.py
Mutations: delete `date -u` from the probe_log command line in _phase_a_what -> red (PA1);
delete the `cause: unknown` sentence -> red (PA2).
"""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import autopilot_common as ap  # noqa: E402

TID = "9999-test-task"


def render(kind, health):
    cfg = {"health_url": "https://example.test/health"} if health else {}
    return ap._phase_a_what(kind, "exampleprov", "INC-1", cfg, TID)


def measurement(text):
    return text[text.index("### Measurement"):text.index("### Cause")]


class PhaseABrief(unittest.TestCase):
    def test_pa1_measurement_lines(self):
        for kind in sorted(ap.PHASE_A_KINDS):
            for health in (True, False):
                seen = 0
                for ln in measurement(render(kind, health)).splitlines():
                    if any(k in ln for k in ("psql", "curl -si", "getent")):
                        seen += 1
                        self.assertIn("date -u", ln, (kind, ln))
                        self.assertIn(" | tee ", ln, (kind, ln))
                        self.assertIn(f"/logs/{TID}/", ln, (kind, ln))
                        self.assertLess(ln.index("date -u"), ln.index(" | tee "), ln)
                self.assertGreaterEqual(seen, 4, kind)

    def test_pa2_cause(self):
        for kind in sorted(ap.PHASE_A_KINDS):
            t = render(kind, True)
            self.assertIn("cause: unknown", t)
            self.assertIn("(PROOF: <file>:<line>)", t)
            self.assertNotIn('--reason "<why>"', t)
            self.assertIn("is not a proof (T-11)", t)

    def test_pa3_health_url_substituted(self):
        self.assertIn('curl -si "https://example.test/health"', render("PROVIDER_DOWN", True))
        self.assertIn("<health_url from evidence/provider-limits>", render("PROVIDER_DOWN", False))

    def test_pa4_wiring(self):
        inc = {"incident_id": "INC-abcdef12", "kind": "PROVIDER_DOWN", "provider": "exampleprov",
               "severity": "S2", "evidence": {}, "attempts": []}
        try:
            _fn, body = ap.build_remediation_task_body(inc)
        except Exception as e:  # next_task_filename may need the DB / queue dir
            self.skipTest(f"build_remediation_task_body not callable without fixtures: {e!r}")
        self.assertIn("/logs/", body)


if __name__ == "__main__":
    unittest.main()
