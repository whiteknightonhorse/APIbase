#!/usr/bin/env python3
"""test-moderation-flag-human.py — T-0313. Plain unittest on the disposable Postgres of merchant_fixture.py
(never production, never a model call).

Run: python3 scripts/autopilot/test-moderation-flag-human.py
Mutation: drop _HUMAN_VERDICT_KINDS from the advance_waiting_human branch -> MF1 red (a file appears in queue/).
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
TG = []
ap.tg_send = lambda text: (TG.append(text), True)[1]
ENG = None


def engine():
    global ENG
    if ENG is None:
        ENG = fx.load_engine()
    return ENG


def q(sql):
    return fx.psql(sql)


def incidents(kind):
    rows = q(f"SELECT incident_id, state FROM incidents WHERE kind = '{kind}' ORDER BY created_at")
    return [dict(zip(("id", "state"), r.split("\x1f"))) for r in rows.splitlines()]


def tick():
    e = engine()
    e.merchant_tick()
    e.route_auto_incidents()


def queue_files():
    return sorted(os.listdir(os.path.join(fx.SCRATCH, "taskloop", "queue")))


def review(merchant, verdict, category, layer):
    q("INSERT INTO shop_moderation_reviews (merchant_id, scope, layer, verdict, category) "
      f"VALUES ('{merchant}', 'merchant', '{layer}', '{verdict}', '{category}')")


class ModerationFlagHuman(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fx.ensure_pg()

    def setUp(self):
        fx.reset()
        TG.clear()
        ap.tg_send = lambda text: (TG.append(text), True)[1]

    def test_mf1_flag_answer_resolves_without_a_fleet_task(self):
        m = fx.new_merchant("flag-shop")
        review(m, "flag", "gambling", "llm")
        tick()
        self.assertEqual(incidents("MODERATION_FLAG")[0]["state"], "WAITING_HUMAN")
        sid = ap.short_id(incidents("MODERATION_FLAG")[0]["id"])
        with open(os.path.join(ap.HUMAN_DONE_DIR, f"INC-{sid}.md"), "w", encoding="utf-8") as f:
            f.write("## Handoff\n---\n" + ap._RESULT_MARKER + " reviewed the item, released it\n")
        engine().advance_waiting_human()
        self.assertEqual(incidents("MODERATION_FLAG")[0]["state"], "RESOLVED")
        self.assertEqual(queue_files(), [], "no fleet task")
        self.assertIn(f"INC-{sid}.md", os.listdir(os.path.join(ap.HUMAN_DONE_DIR, "processed")))
        self.assertFalse(os.path.exists(os.path.join(ap.HUMAN_DONE_DIR, f"INC-{sid}.md")))

    def test_mf2_catalog_rejected_is_unchanged(self):
        m = fx.new_merchant("rej-shop")
        review(m, "reject", "weapons", "human")
        tick()
        self.assertEqual([r["state"] for r in incidents("CATALOG_REJECTED")], ["RESOLVED"])
        rows = q("SELECT template FROM email_events WHERE direction = 'out'").splitlines()
        self.assertEqual(rows, ["catalog_rejected"], "a human reject mails the merchant through the same chain")
        self.assertEqual(queue_files(), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
