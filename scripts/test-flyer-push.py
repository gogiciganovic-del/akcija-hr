#!/usr/bin/env python3
"""
Unit testovi za send_flyer_pushes (bez mreže / bez baze).
Pokreni: npm run test:flyer-push
         ili: py -3 scripts/test-flyer-push.py
"""

from __future__ import annotations

import contextlib
import io
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scraper"))

from send_flyer_pushes import (  # noqa: E402
    ALLOWED_CHAINS,
    build_flyer_payload,
    build_jobs,
    endpoint_hash_prefix,
    filter_jobs_by_endpoint_hash,
    firing_chains,
    parse_args,
    process_jobs,
    resolve_dry_run,
)


def assert_(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


class GoneExc(Exception):
    def __init__(self, status_code: int) -> None:
        super().__init__(f"gone {status_code}")
        self.response = SimpleNamespace(status_code=status_code)


def make_sub(sid: str, endpoint: str, chains: list[str]) -> dict:
    return {
        "id": sid,
        "endpoint": endpoint,
        "p256dh": "fake-p256dh",
        "auth": "fake-auth",
        "followed_chains": chains,
    }


# --- payload / hash ---
payload = build_flyer_payload("Eurospin", "2026-W44")
assert_(payload["title"] == "Izašao je novi letak", payload["title"])
assert_(payload["body"] == "Eurospin: pogledaj nove akcije", payload["body"])
assert_(payload["url"] == "/?trgovina=Eurospin", payload["url"])
assert_(payload["tag"] == "flyer-eurospin-2026-W44", payload["tag"])

ep = "https://fcm.googleapis.com/fcm/send/test-endpoint-abc"
h = endpoint_hash_prefix(ep)
assert_(len(h) == 12 and h.isalnum(), h)
assert_("fcm" not in h and "endpoint" not in h, "hash must not leak endpoint")

# --- CLI: default dry-run, --limit required, --send turns off dry-run ---
with contextlib.redirect_stderr(io.StringIO()):
    try:
        parse_args([])
        raise AssertionError("parse_args without --limit should fail")
    except SystemExit:
        pass

args = parse_args(["--limit", "3"])
assert_(resolve_dry_run(args) is True, "default dry-run")
args_send = parse_args(["--limit", "1", "--send"])
assert_(resolve_dry_run(args_send) is False, "--send → not dry-run")

# --- firing_chains: samo 3 lanca ---
rows = [
    {"chain": "Eurospin", "would_fire": True, "week": "2026-W44"},
    {"chain": "Lidl", "would_fire": True, "week": "2026-W44"},
    {"chain": "Kaufland", "would_fire": False, "week": "2026-W44"},
    {"chain": "Plodine", "would_fire": True, "week": "2026-W44"},
]
fires = firing_chains(rows)
assert_([r["chain"] for r in fires] == ["Eurospin", "Plodine"], fires)
assert_(ALLOWED_CHAINS == ("Eurospin", "Kaufland", "Plodine"), ALLOWED_CHAINS)

# --- nepraćeni lanac ne dobije job ---
subs = {
    "Eurospin": [make_sub("s1", "https://push.example/a", ["Eurospin"])],
    "Plodine": [make_sub("s2", "https://push.example/b", ["Eurospin"])],  # ne prati Plodine
}
jobs = build_jobs(fires, subs)
assert_(len(jobs) == 1, jobs)
assert_(jobs[0]["chain"] == "Eurospin", jobs[0])
assert_(jobs[0]["subscription"]["id"] == "s1", jobs[0])

# --- --only-endpoint-hash ---
sub_a = make_sub("s1", "https://push.example/a", ["Eurospin"])
sub_b = make_sub("s2", "https://push.example/b", ["Eurospin"])
fire_one = [{"chain": "Eurospin", "week": "2026-W44", "would_fire": True}]
all_jobs = build_jobs(fire_one, {"Eurospin": [sub_a, sub_b]})
want = endpoint_hash_prefix(sub_a["endpoint"])
filtered = filter_jobs_by_endpoint_hash(all_jobs, want)
assert_(len(filtered) == 1 and filtered[0]["subscription"]["id"] == "s1", filtered)

# --- --limit ---
limited = all_jobs[:1]
assert_(len(limited) == 1, "limit slice")


def run_process(
    job_list,
    *,
    dry_run,
    sent_set=None,
    send_fn=None,
    fail_mode=None,
):
    sent_set = sent_set if sent_set is not None else set()
    recorded: list[tuple] = []
    deleted: list[str] = []
    sent_calls: list[tuple] = []
    log_buf = io.StringIO()

    def already_sent(sid, chain, week):
        return (sid, chain, week) in sent_set

    def record_sent(sid, chain, week):
        recorded.append((sid, chain, week))
        sent_set.add((sid, chain, week))

    def default_send(sub, payload):
        if fail_mode == "gone":
            raise GoneExc(410)
        if fail_mode == "fail":
            raise RuntimeError("network boom")
        sent_calls.append((sub["id"], payload["tag"]))

    stats = process_jobs(
        job_list,
        dry_run=dry_run,
        already_sent=already_sent,
        record_sent=record_sent,
        send_fn=send_fn or default_send,
        delete_sub=lambda ep: deleted.append(ep),
        log=lambda *a, **k: log_buf.write(" ".join(str(x) for x in a) + "\n"),
    )
    return stats, recorded, deleted, sent_calls, log_buf.getvalue()


# --- dry-run: ništa ne šalje / ne upisuje ---
stats, recorded, deleted, sent_calls, out = run_process(all_jobs[:2], dry_run=True)
assert_(stats["sent"] == 2, stats)
assert_(stats["dry_run"] is True, stats)
assert_(recorded == [], recorded)
assert_(sent_calls == [], sent_calls)
assert_("would send" in out, out)
assert_("https://push.example" not in out, "endpoint must not appear in logs")
assert_("fake-p256dh" not in out and "fake-auth" not in out, out)

# --- dedup: ne šalje dvaput ---
dup_jobs = build_jobs(
    fire_one,
    {"Eurospin": [make_sub("s1", "https://push.example/a", ["Eurospin"])]},
)
# isti job 2× u listi (simulacija ponovnog runa + već upisan)
sent_set = {("s1", "Eurospin", "2026-W44")}
stats, recorded, deleted, sent_calls, out = run_process(
    dup_jobs + dup_jobs, dry_run=False, sent_set=sent_set
)
assert_(stats["sent"] == 0, stats)
assert_(stats["skipped_dedup"] == 2, stats)
assert_(recorded == [], recorded)
assert_(sent_calls == [], sent_calls)

# Prvi put pošalji, drugi put (isti key u sent_set nakon record) skip
sent_set2: set = set()
stats1, rec1, _, calls1, _ = run_process(dup_jobs, dry_run=False, sent_set=sent_set2)
assert_(stats1["sent"] == 1 and len(calls1) == 1 and len(rec1) == 1, (stats1, rec1))
stats2, rec2, _, calls2, _ = run_process(dup_jobs, dry_run=False, sent_set=sent_set2)
assert_(stats2["sent"] == 0 and stats2["skipped_dedup"] == 1, stats2)
assert_(rec2 == [] and calls2 == [], (rec2, calls2))

# --- neuspjelo slanje ne upisuje log ---
stats, recorded, deleted, sent_calls, _ = run_process(
    dup_jobs, dry_run=False, fail_mode="fail"
)
assert_(stats["failed"] == 1 and stats["sent"] == 0, stats)
assert_(recorded == [], "fail must not record")

# --- 410 briše pretplatu, ne upisuje ---
stats, recorded, deleted, sent_calls, _ = run_process(
    dup_jobs, dry_run=False, fail_mode="gone"
)
assert_(stats["gone"] == 1 and stats["sent"] == 0, stats)
assert_(recorded == [], recorded)
assert_(deleted == ["https://push.example/a"], deleted)

# --- mutacija: ukloni dedup provjeru → očekivani dedup assert MORA pasti ---
print("... mutacija: already_sent uvijek False ...")


def process_jobs_no_dedup(jobs, **kwargs):
    """Mutirana verzija: ignorira already_sent (kao da je dedup uklonjen)."""

    def never_sent(sid, chain, week):
        return False

    kwargs = dict(kwargs)
    kwargs["already_sent"] = never_sent
    return process_jobs(jobs, **kwargs)


sent_set_m = {("s1", "Eurospin", "2026-W44")}
recorded_m: list = []
calls_m: list = []


def record_m(sid, chain, week):
    recorded_m.append((sid, chain, week))


def send_m(sub, payload):
    calls_m.append(sub["id"])


mutation_failed_as_expected = False
mute = lambda *a, **k: None
try:
    stats_m = process_jobs_no_dedup(
        dup_jobs,
        dry_run=False,
        already_sent=lambda *a: True,  # overwritten inside mutator
        record_sent=record_m,
        send_fn=send_m,
        delete_sub=lambda ep: None,
        log=mute,
    )
    # Isti assert kao u zdravom dedup testu: skipped_dedup==1, sent==0
    assert_(stats_m["skipped_dedup"] == 1, "dedup should skip")
    assert_(stats_m["sent"] == 0, "dedup should not send")
except AssertionError:
    mutation_failed_as_expected = True
    assert_(len(calls_m) == 1, "without dedup, send still happens")
    assert_(len(recorded_m) == 1, "without dedup, record still happens")

assert_(
    mutation_failed_as_expected,
    "mutacija: uklanjanje dedupa nije srušilo dedup assert",
)
print("OK mutation: removing dedup check makes dedup assertions fail")

print("OK flyer-push")

# Primjer dry-run linije (za izvješće)
demo_jobs = build_jobs(
    [{"chain": "Kaufland", "week": "2026-W44", "would_fire": True}],
    {
        "Kaufland": [
            make_sub("demo", "https://push.example/demo-device", ["Kaufland"])
        ]
    },
)
print("--- dry-run sample ---")
process_jobs(
    demo_jobs,
    dry_run=True,
    already_sent=lambda *a: False,
    record_sent=lambda *a: None,
    send_fn=lambda *a: (_ for _ in ()).throw(RuntimeError("no send")),
    delete_sub=lambda ep: None,
)
