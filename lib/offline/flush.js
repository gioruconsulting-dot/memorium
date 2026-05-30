// Outbox flush / drain (Chunk 3, sub-step 4a). Snapshots the grade outbox, POSTs
// it to /api/sync/grades, and applies the per-event acks. This is the DRAIN — it
// is the one path that is NEVER blocked by the write barrier (sub-step 4b).
//
// Guarantees:
//   - Single-flight: only one flush runs at a time, via the Web Locks API when
//     available, else an IndexedDB lock flag in `meta` with a 60s stale-timeout so
//     a crashed flush self-heals.
//   - A 401 / non-2xx / network failure is NEVER an ack: keep the whole batch.
//   - Per-event ack handling (matches the verified wire contract):
//       applied / duplicate_same_payload          -> delete from outbox.
//       rejected (bad_clock) / error:conflict     -> keep (retry next flush).
//       error:transaction_timeout / exception     -> keep (transient, retry).
//       absent from response                       -> keep (defensive).
//       error:question_not_found_for_user / malformed_event -> quarantine
//         (terminal: removed from outbox, moved to `quarantine`, never deleted
//         outright and never left to block the barrier).
//
// Reuses lib/offline/db.js getDb and lib/offline/outbox.js listOutbox.

import { getDb } from "./db.js";
import { listOutbox } from "./outbox.js";

const FLUSH_LOCK_NAME = "repetita-flush";
const LOCK_KEY = "flushLock";
const LOCK_STALE_MS = 60_000;

const zeroSummary = () => ({ applied: 0, duplicates: 0, kept: 0, quarantined: 0, errors: 0 });

// Reasons we will never be able to apply — retrying is pointless and would block
// the barrier forever, so these are quarantined.
const TERMINAL_ERROR_REASONS = new Set(["question_not_found_for_user", "malformed_event"]);

// Default transport: POST the batch and report ok/status/results without throwing
// on HTTP errors (network errors still throw and are caught by the caller).
async function defaultPoster(events) {
  const res = await fetch("/api/sync/grades", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
  });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error body */ }
  return { ok: res.ok, status: res.status, results: body?.results };
}

// Flush the outbox once. `poster(events) -> { ok, status, results }` is injectable
// for tests. Returns the summary, or { skipped: true, ...zeros } if another flush
// already holds the single-flight lock.
export async function flushOutbox(poster = defaultPoster) {
  const res = await withFlushLock(() => doFlush(poster));
  if (!res.acquired) return { skipped: true, ...zeroSummary() };
  return res.value;
}

async function doFlush(poster) {
  const events = await listOutbox();
  if (events.length === 0) return zeroSummary();

  // Send. A thrown poster = network failure -> keep everything, abort.
  let resp;
  try {
    resp = await poster(events);
  } catch {
    return { ...zeroSummary(), kept: events.length, errors: events.length, aborted: true, reason: "network" };
  }

  // 401 / any non-2xx / missing results array is NEVER an ack -> keep everything.
  if (!resp || !resp.ok || !Array.isArray(resp.results)) {
    return {
      ...zeroSummary(),
      kept: events.length,
      errors: events.length,
      aborted: true,
      signInNeeded: resp?.status === 401,
      status: resp?.status,
    };
  }

  // Classify each event against its result (pure JS), then apply mutations in one txn.
  const byId = new Map(resp.results.map((r) => [r.eventId, r]));
  const summary = zeroSummary();
  const toDelete = [];
  const toQuarantine = [];

  for (const ev of events) {
    const r = byId.get(ev.eventId);
    if (!r) { summary.kept++; continue; }            // absent -> keep, defensive

    if (r.status === "applied") {
      summary.applied++; toDelete.push(ev.eventId);
    } else if (r.status === "duplicate_same_payload") {
      summary.duplicates++; toDelete.push(ev.eventId);
    } else if (r.status === "error" && TERMINAL_ERROR_REASONS.has(r.reason)) {
      summary.quarantined++; summary.errors++; toQuarantine.push({ ev, reason: r.reason });
    } else {
      // rejected (bad_clock), error:conflict, error:transaction_timeout/exception,
      // or any unknown status -> keep for a later retry.
      summary.kept++;
      if (r.status === "error") summary.errors++;
    }
  }

  if (toDelete.length || toQuarantine.length) {
    const db = await getDb();
    const tx = db.transaction(["outbox", "quarantine"], "readwrite");
    const outbox = tx.objectStore("outbox");
    const quarantine = tx.objectStore("quarantine");
    for (const id of toDelete) outbox.delete(id);
    for (const { ev, reason } of toQuarantine) {
      quarantine.put({ ...ev, quarantineReason: reason, quarantinedAt: Math.floor(Date.now() / 1000) });
      outbox.delete(ev.eventId);
    }
    await tx.done;
  }

  return summary;
}

// --- single-flight lock -----------------------------------------------------

// Returns { acquired: boolean, value? }. Prefers Web Locks (ifAvailable: don't
// queue a second flush — bail). Falls back to an IndexedDB flag for environments
// without navigator.locks (iOS < 15.4, and Node tests).
async function withFlushLock(fn) {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    let acquired = false;
    let value;
    await navigator.locks.request(FLUSH_LOCK_NAME, { ifAvailable: true }, async (lock) => {
      if (!lock) return;        // someone else holds it -> skip
      acquired = true;
      value = await fn();
    });
    return acquired ? { acquired: true, value } : { acquired: false };
  }
  return idbFlushLock(fn);
}

async function idbFlushLock(fn) {
  const db = await getDb();

  // Acquire atomically: in one meta txn, take the flag unless a fresh one is held.
  const acquired = await (async () => {
    const tx = db.transaction("meta", "readwrite");
    const store = tx.objectStore("meta");
    const cur = await store.get(LOCK_KEY);
    const now = Date.now();
    if (cur && now - cur.value < LOCK_STALE_MS) { await tx.done; return false; }
    store.put({ key: LOCK_KEY, value: now }); // stamps (or steals a stale lock)
    await tx.done;
    return true;
  })();

  if (!acquired) return { acquired: false };

  try {
    return { acquired: true, value: await fn() };
  } finally {
    const tx = db.transaction("meta", "readwrite");
    tx.objectStore("meta").delete(LOCK_KEY);
    await tx.done;
  }
}

// Fire a flush on reconnect and once on load if already online. Single-flight is
// enforced inside flushOutbox. Returns a cleanup fn. (Component wiring is later.)
export function startFlushOnReconnect() {
  if (typeof window === "undefined") return () => {};
  const run = () => { flushOutbox().catch(() => {}); };
  window.addEventListener("online", run);
  if (navigator.onLine) run();
  return () => window.removeEventListener("online", run);
}
