"""T-INT-29 exporter tests (temp FS, no docker): python3 -m unittest discover -s tests/python"""
import importlib.util
import json
import os
import tempfile
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location("sea_export", os.path.join(ROOT, "scripts", "sea-fleet-export.py"))
sea = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sea)

NOW = 1_800_000_000.0
CANARY = "SECRET-REASON-CANARY"
FORBIDDEN = ["taskloop", "night-orchestra", "autopilot", "sentinel", "0x", "/home/", "T-9999-secret-task", "acme-provider"]


def touch(path, age_s=10):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write("x")
    os.utime(path, (NOW - age_s, NOW - age_s))


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        r = self.tmp.name
        self.paths = {
            "pause": os.path.join(r, "paused"),
            "taskloop_active": os.path.join(r, "taskloop", "active"),
            "taskloop_tick": os.path.join(r, "taskloop", "logs", "tick.log"),
            "orchestra_heartbeat": os.path.join(r, "orch", "heartbeat"),
            "orchestra_log_dir": os.path.join(r, "orch", "logs"),
            "orchestra_pause": os.path.join(r, "orch", "pause"),
            "content_guides": os.path.join(r, "guides"),
            "doors": os.path.join(r, "doors"),
        }
        os.makedirs(self.paths["taskloop_active"])
        os.makedirs(self.paths["doors"])
        touch(self.paths["taskloop_active"] + "/T-9999-secret-task.md")
        touch(self.paths["taskloop_tick"], 20)
        touch(self.paths["orchestra_heartbeat"], 50)
        touch(os.path.join(self.paths["content_guides"], "a.html"), 300)

    def tearDown(self):
        self.tmp.cleanup()

    def build(self, rows=(), agents=0, hb=None):
        return sea.build(NOW, self.paths, hb, list(rows), agents)

    def door(self, name, body):
        with open(os.path.join(self.paths["doors"], name), "w") as f:
            json.dump(body, f)


class SH2Pause(Base):
    def test_pause_file_reason_never_leaks(self):
        with open(self.paths["pause"], "w") as f:
            f.write(f"{int(NOW) + 3600 + 25}\nreason: {CANARY}\nby: user@host\n")
        out = self.build()
        text = json.dumps(out)
        self.assertNotIn(CANARY, text)
        self.assertNotIn("user@host", text)
        self.assertTrue(out["fleet_paused"])
        self.assertTrue(all(s["state"] == "resting" for s in out["ships"]))
        self.assertEqual(out["paused_until_minute"], sea.iso((int(NOW) + 3600 + 25) // 60 * 60))

    def test_pause_reason_with_digits_does_not_shift_epoch(self):
        with open(self.paths["pause"], "w") as f:
            f.write(f"{int(NOW) + 3600}\nreason: {CANARY}-42\nby: user@host\n")
        self.assertEqual(self.build()["paused_until_minute"], sea.iso((int(NOW) + 3600) // 60 * 60))

    def test_expired_pause_is_not_paused(self):
        with open(self.paths["pause"], "w") as f:
            f.write(f"{int(NOW) - 5}\n")
        out = self.build()
        self.assertFalse(out["fleet_paused"])
        self.assertNotIn("paused_until_minute", out)


class SH4Doors(Base):
    def test_non_neutral_class_ignored_neutral_becomes_ship(self):
        self.door("a.json", {"class": "taskloop", "state": "working", "started_at": NOW - 5})
        self.door("b.json", {"class": "scout", "state": "working", "started_at": NOW - 5})
        out = self.build()
        ids = [s["id"] for s in out["ships"]]
        self.assertNotIn("taskloop-1", ids)
        self.assertEqual(ids.count("scout-2"), 1)  # scout-1 is the orchestra heartbeat


class SH5Leaks(Base):
    def test_no_forbidden_substrings(self):
        out = self.build(rows=[("weather", 3)], agents=3, hb=NOW - 30)
        text = json.dumps(out)
        for s in FORBIDDEN:
            self.assertNotIn(s, text)


class SH6Aggregation(Base):
    def test_by_category_aggregates(self):
        out = self.build(rows=[("weather", 3), ("finance", 5), ("weather", 4)])
        self.assertEqual(out["external"]["by_category"], [{"category": "weather", "calls": 7}, {"category": "finance", "calls": 5}])
        self.assertEqual(out["external"]["calls"], 12)
        self.assertEqual(out["external"]["window_s"], 900)

    def test_agent_buckets(self):
        for n, want in ((0, "0"), (3, "1-5"), (10, "6-20"), (30, "21+")):
            self.assertEqual(self.build(agents=n)["external"]["agents_bucket"], want)


class SH8SingleReadline(Base):
    def test_one_readline_no_read(self):
        calls = {"readline": 0, "read": 0}

        class Fake:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def readline(self):
                calls["readline"] += 1
                return f"{int(NOW) + 100}\n"

            def read(self, *a):
                calls["read"] += 1
                return f"{int(NOW) + 100}\nreason: {CANARY}\n"

            def __iter__(self):
                raise AssertionError("iterating the pause file")

            readlines = read

        with mock.patch("builtins.open", return_value=Fake()):
            self.assertEqual(sea.read_pause_until("/x"), int(NOW) + 100)
        self.assertEqual(calls, {"readline": 1, "read": 0})


class Levels(Base):
    def test_activity_level_deterministic(self):
        self.assertEqual([sea.activity_level(a) for a in (0, 120, 121, 600, 601, 1800, 1801)], [3, 3, 2, 2, 1, 1, 0])

    def test_builder_ships_count_active_files_not_names(self):
        touch(self.paths["taskloop_active"] + "/another.md")
        out = self.build()
        self.assertEqual([s["id"] for s in out["ships"] if s["class"] == "builder"], ["builder-1", "builder-2"])


def stamp(age_s):
    return sea.iso(NOW - age_s)


class ScoutProgress(Base):
    def write_log(self, lines):
        os.makedirs(self.paths["orchestra_log_dir"], exist_ok=True)
        day = sea.iso(NOW)[:10]
        with open(os.path.join(self.paths["orchestra_log_dir"], f"orchestra-{day}.log"), "w") as f:
            f.write("\n".join(lines) + "\n")

    def scout(self):
        return [s for s in self.build()["ships"] if s["class"] == "scout"][0]

    def test_working_on_onboard_ok(self):
        self.write_log([f"[{stamp(600)}] ONBOARD_OK foo adapter ready"])
        self.assertEqual(self.scout()["state"], "working")

    def test_working_on_new_candidate_name(self):
        self.write_log([f"[{stamp(9000)}] ONBOARD candidate: old", f"[{stamp(300)}] ONBOARD candidate: fresh"])
        self.assertEqual(self.scout()["state"], "working")

    def test_stalled_when_only_repeated_names(self):
        self.write_log([f"[{stamp(9000)}] ONBOARD candidate: zippopotam", f"[{stamp(300)}] ONBOARD candidate: zippopotam"])
        s = self.scout()
        self.assertEqual(s["state"], "stalled")
        self.assertEqual(s["reason"], "no progress 2 h")

    def test_stalled_when_no_log(self):
        self.assertEqual(self.scout()["state"], "stalled")

    def test_old_onboard_ok_is_stalled(self):
        self.write_log([f"[{stamp(7300)}] ONBOARD_OK foo"])
        self.assertEqual(self.scout()["state"], "stalled")

    def test_idle_when_heartbeat_stale(self):
        touch(self.paths["orchestra_heartbeat"], 3000)
        self.write_log([f"[{stamp(60)}] ONBOARD_OK foo"])
        s = self.scout()
        self.assertEqual(s["state"], "idle")
        self.assertNotIn("reason", s)

    def test_orchestra_pause_rests_fleet(self):
        with open(self.paths["orchestra_pause"], "w") as f:
            f.write(f"{int(NOW) + 3600}\nreason: {CANARY}\nby: x\n")
        out = self.build()
        self.assertTrue(out["fleet_paused"])
        self.assertTrue(all(s["state"] == "resting" for s in out["ships"]))
        self.assertNotIn(CANARY, json.dumps(out))

    def test_expired_orchestra_pause_ignored(self):
        with open(self.paths["orchestra_pause"], "w") as f:
            f.write(f"{int(NOW) - 5}\n")
        self.assertFalse(self.build()["fleet_paused"])


if __name__ == "__main__":
    unittest.main()
