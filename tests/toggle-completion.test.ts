// Offline tests for ticking a task on the dashboard (lib/dashboard/toggle-completion.ts): the tick shows at once, is put back when the save fails or throws, the
// "saving" state is always cleared, and the page refreshes only after a successful save. No real action, database or network is involved.
import { test } from "node:test";
import assert from "node:assert/strict";

import { toggleCompletion } from "@/lib/dashboard/toggle-completion";

function harness(current: boolean, save: (next: boolean) => Promise<{ ok: boolean }>) {
  const log: string[] = [];
  const state = { completed: current, pending: false };
  const run = () =>
    toggleCompletion({
      current,
      save: async (next) => {
        log.push(`save(${next})`);
        return save(next);
      },
      setCompleted: (v) => {
        state.completed = v;
        log.push(`completed=${v}`);
      },
      setPending: (v) => {
        state.pending = v;
        log.push(`pending=${v}`);
      },
      onSaved: () => log.push("refresh"),
    });
  return { log, state, run };
}

test("a successful save: optimistic tick, saved with the new value, page refreshed once, pending cleared", async () => {
  const h = harness(false, async () => ({ ok: true }));
  assert.equal(await h.run(), true);
  assert.deepEqual(h.log, ["pending=true", "completed=true", "save(true)", "refresh", "pending=false"]);
  assert.deepEqual(h.state, { completed: true, pending: false });
});

test("un-ticking saves false", async () => {
  const h = harness(true, async () => ({ ok: true }));
  await h.run();
  assert.ok(h.log.includes("save(false)"));
  assert.equal(h.state.completed, false);
});

test("the save returns ok:false: the tick is reverted, no refresh, pending cleared", async () => {
  const h = harness(false, async () => ({ ok: false }));
  assert.equal(await h.run(), false);
  assert.deepEqual(h.state, { completed: false, pending: false });
  assert.ok(!h.log.includes("refresh"));
});

test("the save THROWS (for example an expired session): the tick is reverted, nothing is thrown out, no refresh, pending is still cleared", async () => {
  const h = harness(false, async () => {
    throw new Error("session expired");
  });
  assert.equal(await h.run(), false);
  assert.deepEqual(h.state, { completed: false, pending: false });
  assert.ok(!h.log.includes("refresh"));
  assert.equal(h.log[h.log.length - 1], "pending=false");
});

test("a throw while un-ticking puts the ticked state back", async () => {
  const h = harness(true, async () => {
    throw new Error("network");
  });
  await h.run();
  assert.deepEqual(h.state, { completed: true, pending: false });
});
