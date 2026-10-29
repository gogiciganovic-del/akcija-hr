#!/usr/bin/env python3
"""
Unit testovi za send_flyer_pushes (bez mreže / bez baze).
Pokreni: npm run test:flyer-push
         ili: py -3 scripts/test-flyer-push.py
"""

from __future__ import annotations

import base64
import contextlib
import io
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scraper"))

import send_flyer_pushes as sfp  # noqa: E402
from datetime import datetime, timezone  # noqa: E402

from send_flyer_pushes import (  # noqa: E402
    ALLOWED_CHAINS,
    apply_limit_after_dedup,
    build_flyer_payload,
    build_jobs,
    build_test_fire_jobs,
    endpoint_hash_prefix,
    filter_jobs_by_endpoint_hash,
    filter_unsent_jobs,
    firing_chains,
    flyer_job_key,
    parse_args,
    process_jobs,
    resolve_dry_run,
    test_flyer_week,
    validate_test_fire_args,
)
from flyer_detect_lib import iso_week_key  # noqa: E402
from send_price_drop_pushes import supabase_key_role  # noqa: E402


def fake_jwt(role: str | None) -> str:
    header = base64.urlsafe_b64encode(b'{"alg":"none","typ":"JWT"}').rstrip(b"=").decode()
    payload_obj = {"role": role} if role is not None else {"sub": "x"}
    payload = (
        base64.urlsafe_b64encode(json.dumps(payload_obj).encode("utf-8"))
        .rstrip(b"=")
        .decode()
    )
    return f"{header}.{payload}.fakesig"


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


def make_jobs(n: int, chain: str = "Eurospin", week: str = "2026-W44") -> list[dict]:
    fire = [{"chain": chain, "week": week, "would_fire": True}]
    subs = [
        make_sub(f"s{i}", f"https://push.example/{i}", [chain]) for i in range(n)
    ]
    return build_jobs(fire, {chain: subs})


# --- payload / hash / quote ---
payload = build_flyer_payload("Eurospin", "2026-W44")
assert_(payload["title"] == "Izašao je novi letak", payload["title"])
assert_(payload["body"] == "Eurospin: pogledaj nove akcije", payload["body"])
assert_(
    payload["url"] == f"/?trgovina={quote('Eurospin', safe='')}",
    payload["url"],
)
assert_(payload["tag"] == "flyer-eurospin-2026-W44", payload["tag"])

ep = "https://fcm.googleapis.com/fcm/send/test-endpoint-abc"
h = endpoint_hash_prefix(ep)
assert_(len(h) == 12 and h.isalnum(), h)
assert_("fcm" not in h and "endpoint" not in h, "hash must not leak endpoint")

# --- supabase_key_role: sb_ + JWT + smeće ---
assert_(
    supabase_key_role("sb_secret_xxxxxxxxxxxxxxxx") == "service_role",
    "sb_secret",
)
assert_(
    supabase_key_role("sb_publishable_xxxxxxxxxxxxxxxx") == "anon",
    "sb_publishable",
)
assert_(supabase_key_role(fake_jwt("service_role")) == "service_role", "jwt svc")
assert_(supabase_key_role(fake_jwt("anon")) == "anon", "jwt anon")
assert_(supabase_key_role("not-a-jwt") == "unknown", "garbage")
assert_(supabase_key_role("sb_other_xxx") == "unknown", "sb other")
assert_(supabase_key_role("") == "unknown", "empty")
assert_(supabase_key_role(fake_jwt("authenticated")) == "unknown", "other jwt role")

# --- CLI ---
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

# --- --test-fire: odbijanja + TEST week ne dira pravi tjedan ---
fixed_now = datetime(2026, 10, 29, 14, 5, tzinfo=timezone.utc)
tw = test_flyer_week(fixed_now)
assert_(tw == "TEST-202610291405", tw)
real_week = iso_week_key(fixed_now.date())
assert_(tw != real_week, (tw, real_week))
assert_(not tw.startswith(real_week[:4] + "-W"), "TEST week must not look like ISO week")

# bez --send
args_tf_nosend = parse_args(
    ["--limit", "1", "--test-fire", "Kaufland", "--only-endpoint-hash", "abc"]
)
try:
    validate_test_fire_args(args_tf_nosend)
    raise AssertionError("test-fire without --send must fail")
except SystemExit as e:
    assert_("--send" in str(e), str(e))

# bez --only-endpoint-hash
args_tf_nohash = parse_args(["--limit", "1", "--send", "--test-fire", "Kaufland"])
try:
    validate_test_fire_args(args_tf_nohash)
    raise AssertionError("test-fire without hash must fail")
except SystemExit as e:
    assert_("--only-endpoint-hash" in str(e), str(e))

# nedopušten lanac
args_tf_bad = parse_args(
    [
        "--limit",
        "1",
        "--send",
        "--test-fire",
        "Lidl",
        "--only-endpoint-hash",
        "deadbeefcafe",
    ]
)
try:
    validate_test_fire_args(args_tf_bad)
    raise AssertionError("test-fire Lidl must fail")
except SystemExit as e:
    assert_("nedopušten" in str(e) and "Lidl" in str(e), str(e))

# validan
args_tf_ok = parse_args(
    [
        "--limit",
        "1",
        "--send",
        "--test-fire",
        "Eurospin",
        "--only-endpoint-hash",
        "aabbccddeeff",
    ]
)
assert_(validate_test_fire_args(args_tf_ok) == "Eurospin", "ok chain")
assert_(validate_test_fire_args(parse_args(["--limit", "1"])) is None, "no flag")

# build_test_fire_jobs: jedan uređaj, TEST week u payload/tag; pravi tjedan nije u ključu
sub_a = make_sub("s1", "https://push.example/a", ["Kaufland"])
sub_b = make_sub("s2", "https://push.example/b", ["Kaufland"])
want_h = endpoint_hash_prefix(sub_a["endpoint"])
tf_jobs = build_test_fire_jobs(
    "Kaufland", "TEST-202610291405", [sub_a, sub_b], want_h
)
assert_(len(tf_jobs) == 1, tf_jobs)
assert_(tf_jobs[0]["subscription"]["id"] == "s1", tf_jobs[0])
assert_(tf_jobs[0]["flyer_week"] == "TEST-202610291405", tf_jobs[0]["flyer_week"])
assert_(
    tf_jobs[0]["payload"]["tag"] == "flyer-kaufland-TEST-202610291405",
    tf_jobs[0]["payload"]["tag"],
)
assert_(real_week not in tf_jobs[0]["flyer_week"], tf_jobs[0]["flyer_week"])
assert_(real_week not in tf_jobs[0]["payload"]["tag"], tf_jobs[0]["payload"]["tag"])

# --- firing_chains ---
rows = [
    {"chain": "Eurospin", "would_fire": True, "week": "2026-W44"},
    {"chain": "Lidl", "would_fire": True, "week": "2026-W44"},
    {"chain": "Kaufland", "would_fire": False, "week": "2026-W44"},
    {"chain": "Plodine", "would_fire": True, "week": "2026-W44"},
]
fires = firing_chains(rows)
assert_([r["chain"] for r in fires] == ["Eurospin", "Plodine"], fires)
assert_(ALLOWED_CHAINS == ("Eurospin", "Kaufland", "Plodine"), ALLOWED_CHAINS)

# --- nepraćeni lanac ---
subs = {
    "Eurospin": [make_sub("s1", "https://push.example/a", ["Eurospin"])],
    "Plodine": [make_sub("s2", "https://push.example/b", ["Eurospin"])],
}
jobs = build_jobs(fires, subs)
assert_(len(jobs) == 1 and jobs[0]["subscription"]["id"] == "s1", jobs)

# --- only-endpoint-hash ---
sub_a = make_sub("s1", "https://push.example/a", ["Eurospin"])
sub_b = make_sub("s2", "https://push.example/b", ["Eurospin"])
fire_one = [{"chain": "Eurospin", "week": "2026-W44", "would_fire": True}]
all_jobs = build_jobs(fire_one, {"Eurospin": [sub_a, sub_b]})
want = endpoint_hash_prefix(sub_a["endpoint"])
filtered = filter_jobs_by_endpoint_hash(all_jobs, want)
assert_(len(filtered) == 1 and filtered[0]["subscription"]["id"] == "s1", filtered)


class ReserveStore:
    """Lažni log: try_reserve vraća True samo pri prvom upisu."""

    def __init__(self, initial: set[tuple[str, str, str]] | None = None) -> None:
        self.rows: set[tuple[str, str, str]] = set(initial or ())
        self.released: list[tuple[str, str, str]] = []
        self.reserve_calls: list[tuple[str, str, str]] = []

    def try_reserve(self, sid: str, chain: str, week: str) -> bool:
        key = flyer_job_key(sid, chain, week)
        self.reserve_calls.append(key)
        if key in self.rows:
            return False
        self.rows.add(key)
        return True

    def release(self, sid: str, chain: str, week: str) -> None:
        key = flyer_job_key(sid, chain, week)
        self.released.append(key)
        self.rows.discard(key)


def run_process(
    job_list,
    *,
    dry_run: bool,
    store: ReserveStore | None = None,
    send_fn=None,
    fail_mode=None,
    delete_fail: bool = False,
):
    store = store or ReserveStore()
    deleted: list[str] = []
    sent_calls: list[str] = []
    log_buf = io.StringIO()

    def default_send(sub, payload):
        if fail_mode == "gone":
            raise GoneExc(410)
        if fail_mode == "fail":
            raise RuntimeError("network boom")
        sent_calls.append(sub["id"])

    def delete_sub(endpoint: str) -> None:
        if delete_fail:
            raise RuntimeError("delete boom")
        deleted.append(endpoint)

    stats = process_jobs(
        job_list,
        dry_run=dry_run,
        try_reserve=store.try_reserve,
        release_reserve=store.release,
        send_fn=send_fn or default_send,
        delete_sub=delete_sub,
        log=lambda *a, **k: log_buf.write(" ".join(str(x) for x in a) + "\n"),
    )
    return stats, store, deleted, sent_calls, log_buf.getvalue()


# --- test-fire: rezervacija TEST tjedna ne dira pravi ISO tjedan ---
store_tf = ReserveStore({("s1", "Kaufland", real_week)})
stats_tf, store_tf, _, calls_tf, _ = run_process(
    tf_jobs, dry_run=False, store=store_tf
)
assert_(stats_tf["sent"] == 1 and calls_tf == ["s1"], (stats_tf, calls_tf))
assert_(("s1", "Kaufland", "TEST-202610291405") in store_tf.rows, store_tf.rows)
assert_(
    ("s1", "Kaufland", real_week) in store_tf.rows,
    "real week row must stay untouched",
)

# --- dry-run: ništa ne rezervira / ne šalje ---
stats, store, deleted, sent_calls, out = run_process(all_jobs[:2], dry_run=True)
assert_(stats["sent"] == 2 and stats["dry_run"] is True, stats)
assert_(store.rows == set() and store.reserve_calls == [], store.reserve_calls)
assert_(sent_calls == [], sent_calls)
assert_("would send" in out, out)
assert_("https://push.example" not in out, out)
assert_("fake-p256dh" not in out and "fake-auth" not in out, out)

# --- rezervacija već postoji → send_fn se NE zove ---
dup_jobs = make_jobs(1)
pre = ReserveStore({("s0", "Eurospin", "2026-W44")})
sent_calls_block: list[str] = []
stats, store, _, calls, _ = run_process(
    dup_jobs,
    dry_run=False,
    store=pre,
    send_fn=lambda sub, payload: sent_calls_block.append(sub["id"]),
)
assert_(stats["skipped_dedup"] == 1 and stats["sent"] == 0, stats)
assert_(sent_calls_block == [], "send_fn must not run when reserve fails")
assert_(calls == [], calls)

# --- uspjeh: rezervacija ostaje ---
store_ok = ReserveStore()
stats, store, _, calls, _ = run_process(dup_jobs, dry_run=False, store=store_ok)
assert_(stats["sent"] == 1, stats)
assert_(("s0", "Eurospin", "2026-W44") in store.rows, store.rows)
assert_(store.released == [], store.released)
assert_(calls == ["s0"], calls)

# --- privremena greška: briše rezervaciju ---
store_fail = ReserveStore()
stats, store, deleted, calls, out = run_process(
    dup_jobs, dry_run=False, store=store_fail, fail_mode="fail"
)
assert_(stats["failed"] == 1 and stats["sent"] == 0, stats)
assert_(store.rows == set(), "reservation must be released")
assert_(store.released == [("s0", "Eurospin", "2026-W44")], store.released)
assert_(calls == [], calls)
assert_(deleted == [], deleted)

# --- 410: briše pretplatu (rezervacija ostaje; CASCADE u produkciji) ---
store_gone = ReserveStore()
stats, store, deleted, calls, _ = run_process(
    dup_jobs, dry_run=False, store=store_gone, fail_mode="gone"
)
assert_(stats["gone"] == 1 and stats["sent"] == 0, stats)
assert_(deleted == ["https://push.example/0"], deleted)
assert_(("s0", "Eurospin", "2026-W44") in store.rows, "410 keeps row; CASCADE cleans")
assert_(store.released == [], store.released)

# --- try_reserve Exception → fail-reserve, petlja nastavlja ---
jobs_two = make_jobs(2)


def boom_then_ok(sid, chain, week):
    if sid == "s0":
        raise ConnectionError("db-down")
    return True


sent_after_reserve_fail: list[str] = []
stats_rf = process_jobs(
    jobs_two,
    dry_run=False,
    try_reserve=boom_then_ok,
    release_reserve=lambda *a: None,
    send_fn=lambda sub, payload: sent_after_reserve_fail.append(sub["id"]),
    delete_sub=lambda ep: None,
    log=lambda *a, **k: None,
)
assert_(stats_rf["failed"] == 1 and stats_rf["sent"] == 1, stats_rf)
assert_(sent_after_reserve_fail == ["s1"], sent_after_reserve_fail)

# --- dedup prije limita: run1 pošalje 2/5, run2 sljedeća 2 ---
five = make_jobs(5)
assert_(len(five) == 5, len(five))
sent_keys: set[tuple[str, str, str]] = set()
limited1, skipped1, unsent1 = apply_limit_after_dedup(five, sent_keys, 2)
assert_(skipped1 == 0 and unsent1 == 5 and len(limited1) == 2, (skipped1, unsent1))
assert_([j["subscription"]["id"] for j in limited1] == ["s0", "s1"], limited1)

store_r1 = ReserveStore()
stats1, store_r1, _, calls1, _ = run_process(limited1, dry_run=False, store=store_r1)
assert_(stats1["sent"] == 2 and calls1 == ["s0", "s1"], (stats1, calls1))
sent_keys = set(store_r1.rows)

limited2, skipped2, unsent2 = apply_limit_after_dedup(five, sent_keys, 2)
assert_(skipped2 == 2 and unsent2 == 3 and len(limited2) == 2, (skipped2, unsent2))
assert_(
    [j["subscription"]["id"] for j in limited2] == ["s2", "s3"],
    [j["subscription"]["id"] for j in limited2],
)
stats2, store_r2, _, calls2, _ = run_process(
    limited2, dry_run=False, store=ReserveStore(set(sent_keys))
)
assert_(stats2["sent"] == 2 and calls2 == ["s2", "s3"], (stats2, calls2))

# dry-run također filtrira prije limita
dry_keys = {("s0", "Eurospin", "2026-W44"), ("s1", "Eurospin", "2026-W44")}
dry_limited, dry_skip, dry_unsent = apply_limit_after_dedup(five, dry_keys, 2)
assert_(
    dry_skip == 2 and [j["subscription"]["id"] for j in dry_limited] == ["s2", "s3"],
    (dry_skip, dry_limited),
)
kept, sk = filter_unsent_jobs(five, dry_keys)
assert_(sk == 2 and len(kept) == 3, (sk, len(kept)))

# --- --send s anon ključem odbija; dry-run s anon prolazi uz WARN ---
_env_save = {
    k: os.environ.get(k)
    for k in (
        "SUPABASE_URL",
        "VITE_SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_KEY",
        "VITE_SUPABASE_ANON_KEY",
    )
}


def _set_env_anon():
    os.environ["SUPABASE_URL"] = "https://example.supabase.co"
    os.environ.pop("VITE_SUPABASE_URL", None)
    os.environ.pop("SUPABASE_SERVICE_ROLE_KEY", None)
    os.environ.pop("VITE_SUPABASE_ANON_KEY", None)
    os.environ["SUPABASE_KEY"] = fake_jwt("anon")


def _restore_env():
    for k, v in _env_save.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


_set_env_anon()
buf_send = io.StringIO()
err_send = io.StringIO()
try:
    with contextlib.redirect_stdout(buf_send), contextlib.redirect_stderr(err_send):
        code_send = sfp.main(["--limit", "1", "--send"])
finally:
    _restore_env()
assert_(code_send == 1, code_send)
out_send = buf_send.getvalue()
assert_("key_not_service_role" in out_send, out_send)
assert_('"ok":false' in out_send, out_send)
assert_("supabase_key_role=anon" in out_send, out_send)

_set_env_anon()
real_client = sfp.supabase_client
real_stores = sfp.fetch_stores
real_sets = sfp.fetch_scrape_sets
real_eval = sfp.evaluate_day
sfp.supabase_client = lambda **kw: object()  # type: ignore[assignment]
sfp.fetch_stores = lambda client: {}  # type: ignore[assignment]
sfp.fetch_scrape_sets = lambda client, stores, batch: {}  # type: ignore[assignment]
sfp.evaluate_day = lambda by_chain, as_of: []  # type: ignore[assignment]
buf_dry = io.StringIO()
err_dry = io.StringIO()
try:
    with contextlib.redirect_stdout(buf_dry), contextlib.redirect_stderr(err_dry):
        code_dry = sfp.main(["--limit", "1"])
finally:
    sfp.supabase_client = real_client
    sfp.fetch_stores = real_stores
    sfp.fetch_scrape_sets = real_sets
    sfp.evaluate_day = real_eval
    _restore_env()
assert_(code_dry == 0, code_dry)
assert_("WARN: supabase_key_role=anon" in err_dry.getvalue(), err_dry.getvalue())
assert_("supabase_key_role=anon" in buf_dry.getvalue(), buf_dry.getvalue())
assert_('"ok":true' in buf_dry.getvalue(), buf_dry.getvalue())

# --- main vraća 1 + ok:false kad evaluate_day baci; dry_run iz --send ---
os.environ["SUPABASE_URL"] = "https://example.supabase.co"
os.environ.pop("SUPABASE_SERVICE_ROLE_KEY", None)
os.environ.pop("VITE_SUPABASE_ANON_KEY", None)
os.environ["SUPABASE_KEY"] = fake_jwt("service_role")


def boom_eval(*a, **k):
    raise RuntimeError("secret-db-url-must-not-leak")


sfp.evaluate_day = boom_eval  # type: ignore[assignment]
sfp.supabase_client = lambda **kw: object()  # type: ignore[assignment]
sfp.fetch_stores = lambda client: {}  # type: ignore[assignment]
sfp.fetch_scrape_sets = lambda client, stores, batch: {}  # type: ignore[assignment]
buf = io.StringIO()
try:
    with contextlib.redirect_stdout(buf):
        code = sfp.main(["--limit", "5", "--send"])
finally:
    sfp.evaluate_day = real_eval
    sfp.supabase_client = real_client
    sfp.fetch_stores = real_stores
    sfp.fetch_scrape_sets = real_sets
    _restore_env()

assert_(code == 1, code)
main_out = buf.getvalue()
assert_("FLYER_PUSH_STATS=" in main_out, main_out)
assert_('"ok":false' in main_out, main_out)
assert_('"dry_run":false' in main_out, main_out)
assert_("RuntimeError" in main_out, main_out)
assert_("secret-db-url" not in main_out, main_out)
assert_("service_role" in main_out, main_out)

# --- mutacija: ukloni rezervaciju (try_reserve uvijek True) → dedup assert pada ---
print("... mutacija: try_reserve uvijek True (bez stvarne rezervacije) ...")


def process_jobs_no_reserve(jobs, **kwargs):
    kwargs = dict(kwargs)
    kwargs["try_reserve"] = lambda *a: True
    return process_jobs(jobs, **kwargs)


mute = lambda *a, **k: None
calls_m: list[str] = []
mutation_failed = False
try:
    stats_m = process_jobs_no_reserve(
        dup_jobs,
        dry_run=False,
        try_reserve=lambda *a: False,  # overwritten
        release_reserve=lambda *a: None,
        send_fn=lambda sub, payload: calls_m.append(sub["id"]),
        delete_sub=lambda ep: None,
        log=mute,
    )
    # Očekivanje kao u "rezervacija već postoji" testu — MORA pasti bez rezervacije
    assert_(stats_m["skipped_dedup"] == 1, "reserve miss should skip")
    assert_(stats_m["sent"] == 0, "reserve miss should not send")
    assert_(calls_m == [], "send_fn must not run")
except AssertionError:
    mutation_failed = True
    assert_(len(calls_m) == 1, "without reserve gate, send still happens")

assert_(mutation_failed, "mutacija: uklanjanje rezervacije nije srušilo assert")
print("OK mutation: removing reservation gate makes reserve assertions fail")

print("OK flyer-push")

print("--- dry-run sample ---")
process_jobs(
    make_jobs(1, chain="Kaufland"),
    dry_run=True,
    try_reserve=lambda *a: True,
    release_reserve=lambda *a: None,
    send_fn=lambda *a: (_ for _ in ()).throw(RuntimeError("no send")),
    delete_sub=lambda ep: None,
)
