"""T-0569: layer3_review.py selection order, cap, pause scope, grammar. No model, no database, no network.
Run: python3 -m unittest tests/python/test_layer3_review.py"""
import importlib.util
import os
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location(
    "l3", os.path.join(HERE, "..", "..", "scripts", "moderation", "layer3_review.py"))
l3 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(l3)

M = [f"00000000-0000-4000-8000-0000000000{i:02d}" for i in range(4)]
P = [f"11111111-1111-4111-8111-1111111111{i:02d}" for i in range(8)]
l3.PAUSE_FILE = "/nonexistent/pause"
SLUGS = {"gambling", "weapons"}


def rows(n_products):
    out = [{"kind": "merchant", "merchant_id": M[0], "product_id": None, "last_review_at": None}]
    out += [{"kind": "product", "merchant_id": M[0], "product_id": P[i], "last_review_at": None}
            for i in range(n_products)]
    return out


def ctx_for(candidates, answer, posted):
    def sql(q):
        if q is l3.CANDIDATE_SQL:
            return candidates
        if "FROM shop_merchants m" in q and "json_agg" not in q:
            return {"merchant_id": M[0], "name": "n", "category": "books", "country": "US", "site_url": "https://x.example"}
        if "AND p.product_id = " in q:
            pid = q.split("AND p.product_id = '")[1].split("'")[0]
            return [{"product_id": pid, "title": "t", "description": "d", "category": None,
                     "price_usd": "1", "moderation_status": "ok"}]
        return [{"product_id": P[i], "title": "t", "description": "d", "category": None,
                 "price_usd": "1", "moderation_status": "ok"} for i in range(2)]
    calls = []

    def invoke(prompt):
        calls.append(prompt)
        return answer(prompt)
    return {"sql": sql, "invoke": invoke, "post": posted.append, "role": "R __CATEGORIES__ __DATA__",
            "categories": [("gambling", "g"), ("weapons", "w")]}, calls


class SelectionTest(unittest.TestCase):
    def test_sql_orders_merchants_first_then_oldest_product(self):
        sql = l3.CANDIDATE_SQL
        self.assertIn("ORDER BY (kind = 'merchant') DESC, sort_at, product_id", sql)
        self.assertIn("interval '7 days'", sql)
        self.assertIn("moderation_status IN ('ok', 'flagged')", sql)
        self.assertIn("r.layer IN ('llm', 'human')", sql)

    def test_cap_keeps_the_head_of_the_ordered_list(self):
        items, hit = l3.select_candidates(rows(7), 5)
        self.assertEqual([i["product_id"] for i in items], [None] + P[:4])
        self.assertTrue(hit)

    def test_under_cap_is_not_a_hit(self):
        items, hit = l3.select_candidates(rows(3), 60)
        self.assertEqual(len(items), 4)
        self.assertFalse(hit)

    def test_run_stops_at_cap_and_logs_counts(self):
        posted = []
        ctx, calls = ctx_for(rows(7), lambda p: f"merchant: ok\nproduct {P[0]}: flag:gambling", posted)
        reviewed, flagged, rejected, hit = l3.run(3, ctx=ctx)
        # merchant item: first answer + confirming call; the two product items were already reviewed in it
        self.assertEqual(len(calls), 2)
        self.assertTrue(hit)
        self.assertEqual(rejected, 0)
        self.assertEqual(reviewed, len(posted))
        self.assertGreater(flagged, 0)


class HumanOkAndConfirmTest(unittest.TestCase):
    def test_sql_has_human_ok_hash_condition(self):
        for sql in (l3.CANDIDATE_SQL, l3.PRODUCT_SQL):
            self.assertIn("hr.layer = 'human'", sql)
            self.assertIn("h.verdict = 'ok'", sql)
            self.assertIn("h.content_hash = p.content_hash", sql)
            self.assertIn("p.content_hash IS NOT NULL", sql)
        self.assertIn("interval '7 days'", l3.CANDIDATE_SQL)

    def test_human_cleared_uses_newest_human_review(self):
        self.assertIn("ORDER BY hr.at DESC LIMIT 1", l3.HUMAN_CLEARED)

    def _cand(self):
        return [{"kind": "product", "merchant_id": M[0], "product_id": P[3], "last_review_at": None}]

    def test_flag_flag_posts_one_flag(self):
        posted = []
        ctx, calls = ctx_for(self._cand(), lambda p: f"merchant: ok\nproduct {P[3]}: flag:gambling", posted)
        l3.run(5, ctx=ctx)
        self.assertEqual(len(calls), 2)
        self.assertEqual([(b["product_id"], b["verdict"]) for b in posted], [(P[3], "flag:gambling")])

    def test_flag_then_ok_posts_nothing_and_logs(self):
        posted = []
        answers = iter([f"merchant: ok\nproduct {P[3]}: flag:gambling", f"merchant: ok\nproduct {P[3]}: ok"])
        ctx, calls = ctx_for(self._cand(), lambda p: next(answers), posted)
        import io, contextlib
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            l3.run(5, ctx=ctx)
        self.assertEqual(posted, [])
        self.assertIn(f"product {P[3]}: answers disagree (flag:gambling / ok) -- stays due", buf.getvalue())

    def test_failed_second_call_is_disagree(self):
        posted = []
        answers = iter([f"merchant: ok\nproduct {P[3]}: reject:weapons", ""])
        ctx, _ = ctx_for(self._cand(), lambda p: next(answers), posted)
        l3.run(5, ctx=ctx)
        self.assertEqual(posted, [])

    def test_ok_makes_exactly_one_call(self):
        posted = []
        ctx, calls = ctx_for(self._cand(), lambda p: f"merchant: ok\nproduct {P[3]}: ok", posted)
        l3.run(5, ctx=ctx)
        self.assertEqual(len(calls), 1)
        self.assertEqual(len(posted), 1)

    def test_product_in_both_passes_is_posted_once(self):
        posted = []
        cand = [{"kind": "merchant", "merchant_id": M[0], "product_id": None, "last_review_at": None},
                {"kind": "product", "merchant_id": M[0], "product_id": P[0], "last_review_at": None}]
        ctx, _ = ctx_for(cand, lambda p: f"merchant: ok\nproduct {P[0]}: ok\nproduct {P[1]}: ok", posted)
        l3.run(5, ctx=ctx)
        self.assertEqual([b.get("product_id") for b in posted if "product_id" in b].count(P[0]), 1)


class PauseTest(unittest.TestCase):
    def _file(self, epoch, reason):
        f = tempfile.NamedTemporaryFile("w", delete=False)
        f.write(f"{epoch}\nreason: {reason}\nby: test\n")
        f.close()
        self.addCleanup(os.unlink, f.name)
        return f.name

    def test_only_a_moderation_reason_pauses(self):
        future = int(time.time()) + 3600
        self.assertFalse(l3.pause_active(self._file(future, "Fable limit hit, resumes later")))
        self.assertTrue(l3.pause_active(self._file(future, "moderation review stood down")))

    def test_expired_or_missing_does_not_pause(self):
        self.assertFalse(l3.pause_active(self._file(int(time.time()) - 5, "moderation")))
        self.assertFalse(l3.pause_active("/nonexistent/pause"))


class GrammarTest(unittest.TestCase):
    def test_valid_and_invalid_lines(self):
        txt = f"merchant: ok\nproduct {P[0]}: reject:weapons\nproduct {P[1]}: reject:nonsense\nchatter"
        self.assertEqual(l3.parse_verdicts(txt, SLUGS, [P[0], P[1]]), ("ok", {P[0]: "reject:weapons"}))

    def test_missing_merchant_line_is_rejected(self):
        self.assertIsNone(l3.parse_verdicts(f"product {P[0]}: ok", SLUGS, [P[0]]))

    def test_bad_answer_posts_nothing(self):
        posted = []
        ctx, _ = ctx_for(rows(1)[:1], lambda p: "I think this is fine", posted)
        self.assertEqual(l3.run(5, ctx=ctx)[0], 0)
        self.assertEqual(posted, [])

    def test_product_item_posts_only_its_own_product(self):
        posted = []
        cand = [{"kind": "product", "merchant_id": M[0], "product_id": P[3], "last_review_at": None}]
        ctx, _ = ctx_for(cand, lambda p: f"merchant: reject:weapons\nproduct {P[3]}: ok", posted)
        l3.run(5, ctx=ctx)
        self.assertEqual([(b["product_id"], b["verdict"]) for b in posted], [(P[3], "ok")])

    def test_invoke_uses_absolute_claude_not_path_wrapper(self):
        with tempfile.TemporaryDirectory() as d:
            fake = os.path.join(d, "claude")
            open(fake, "w").write("#!/bin/sh\necho REAL\n")
            os.chmod(fake, 0o755)
            self.assertTrue(os.path.isabs(l3.CLAUDE_BIN))
            old = l3.CLAUDE_BIN
            l3.CLAUDE_BIN = fake
            try:
                self.assertEqual(l3.default_invoke("p").strip(), "REAL")
            finally:
                l3.CLAUDE_BIN = old


if __name__ == "__main__":
    unittest.main()
