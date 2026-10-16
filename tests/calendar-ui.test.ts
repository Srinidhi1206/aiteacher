// Offline tests that the calendar-import review screen's main action is REACHABLE: the dialog frame is never taller than the viewport, only its
// middle scrolls, and the "Save ... as drafts" bar is pinned outside that scrolling area - however many events were found. The pieces are rendered
// to static HTML with react-dom/server (no browser, no network, no OCR); the structure of that HTML is what is asserted.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ModalFrame } from "@/components/ui/modal";
import { CalendarReviewFooter } from "@/components/admin/calendar-review-footer";
import { planSave, saveButtonState, SAVE_FAILED_MESSAGE, type ReviewRow } from "@/lib/calendar-import/review";

const h = React.createElement;
const noop = () => {};

/** The opening tag of the primary button, and whether it carries the real `disabled` attribute (not the `disabled:` utility classes in its class list). */
const primaryTag = (html: string) => /<button[^>]*data-primary-action="save-drafts"[^>]*>/.exec(html)?.[0] ?? "";
const isDisabled = (tag: string) => /\sdisabled(=""|\s|>)/.test(tag);

const makeRows = (n: number): ReviewRow[] =>
  Array.from({ length: n }, (_, i) => ({ id: `r${i}`, title: `Event ${i}`, type: "EVENT", startDate: "2026-08-15", endDate: "", description: "", academicYear: "2026-27", confidence: "high", warnings: [], sourceText: "x", include: true, schoolClassId: "", saved: false }));

function screen(rowCount: number, over: { saving?: boolean; error?: string | null; ack?: boolean; needsAck?: boolean; rows?: ReviewRow[] } = {}) {
  const rows = over.rows ?? makeRows(rowCount);
  const plan = planSave(rows, {});
  const button = saveButtonState(plan, { saving: !!over.saving, audienceAcknowledged: over.ack ?? true, audienceNeedsAck: !!over.needsAck });
  const footer = h(CalendarReviewFooter, { button, saving: !!over.saving, selected: plan.toSave.length, savedCount: 0, error: over.error ?? null, onSave: noop, onStartOver: noop, onClose: noop });
  const list = h("ul", null, rows.map((r) => h("li", { key: r.id }, r.title)));
  return renderToStaticMarkup(h(ModalFrame, { onClose: noop, title: "Import calendar", className: "max-w-4xl", footer, children: list }));
}

test("the dialog frame can never be taller than the viewport, and only its middle scrolls", () => {
  const html = screen(3);
  assert.match(html, /max-h-\[calc\(100dvh-2rem\)\]/, "bounded by the viewport");
  assert.match(html, /role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /<div data-modal-body="true" class="[^"]*overflow-y-auto[^"]*"/, "the body scrolls");
  assert.match(html, /<div class="shrink-0 px-6 pt-6"><h2[^>]*>Import calendar<\/h2>/, "the title stays put");
});

test("the Save action is in the pinned footer, AFTER and OUTSIDE the scrolling body", () => {
  const html = screen(5);
  const bodyStart = html.indexOf("data-modal-body");
  const bodyEnd = html.indexOf("</div><div data-modal-footer");
  const footerStart = html.indexOf("data-modal-footer");
  assert.ok(bodyStart > -1 && bodyEnd > bodyStart && footerStart > bodyEnd, "the body closes before the footer opens");
  const body = html.slice(bodyStart, bodyEnd);
  const footer = html.slice(footerStart);
  assert.ok(!body.includes("Save 5 events as drafts"), "the button is not inside the scrolling area");
  assert.ok(footer.includes("Save 5 events as drafts"));
  assert.ok(footer.includes('data-primary-action="save-drafts"'));
});

test("with a LONG list of events (300) the Save action is still in the footer, not pushed down with the list", () => {
  const html = screen(300);
  const rowsInBody = (html.slice(0, html.indexOf("data-modal-footer")).match(/<li>/g) ?? []).length;
  assert.equal(rowsInBody, 300, "every event is in the scrolling body");
  const footer = html.slice(html.indexOf("data-modal-footer"));
  assert.ok(footer.includes("Save 300 events as drafts"));
  assert.ok(!footer.includes("<li>"), "no list items in the footer");
  assert.equal((html.match(/data-modal-footer/g) ?? []).length, 1);
});

test("the primary button is a real, keyboard-reachable button: type=button, enabled when something can be saved, described by the note", () => {
  const html = screen(2);
  const button = primaryTag(html);
  assert.ok(button.includes('type="button"'));
  assert.ok(!isDisabled(button), "enabled");
  assert.ok(button.includes('aria-describedby="calendar-review-note"'));
  assert.ok(html.includes('id="calendar-review-note"'));
  assert.ok(html.includes("students see nothing until you publish"), "the draft-not-published promise is stated next to the button");
});

test("disabled and loading states are clear: nothing ticked says why; while saving the label says so and all the buttons are disabled", () => {
  const none = screen(0, { rows: makeRows(2).map((r) => ({ ...r, include: false })) });
  assert.ok(isDisabled(primaryTag(none)), "nothing ticked: the save button is disabled");
  assert.ok(none.includes("Tick the events you want to save."), "...and says why");

  const saving = screen(2, { saving: true });
  assert.ok(isDisabled(primaryTag(saving)));
  assert.ok(saving.includes("Saving..."));
  assert.equal((saving.match(/\sdisabled(=""|\s|>)/g) ?? []).length, 3, "Start over, Cancel and Save are all disabled while saving");
  assert.equal((screen(2).match(/\sdisabled(=""|\s|>)/g) ?? []).length, 0, "and none is disabled when idle with events ticked");
});

test("a wide-open audience keeps the button disabled with the reason until confirmed", () => {
  const html = screen(2, { needsAck: true, ack: false });
  assert.ok(isDisabled(primaryTag(html)));
  assert.ok(html.includes("confirm that these drafts are meant for everyone"));
  const confirmed = screen(2, { needsAck: true, ack: true });
  assert.ok(!isDisabled(primaryTag(confirmed)));
});

test("a failed save shows its error in the footer (always visible), with the extracted events still in the body", () => {
  const html = screen(3, { error: SAVE_FAILED_MESSAGE });
  const footer = html.slice(html.indexOf("data-modal-footer"));
  assert.match(footer, /role="alert"/);
  assert.ok(footer.includes("Everything you extracted is still here"));
  assert.equal((html.slice(0, html.indexOf("data-modal-footer")).match(/<li>/g) ?? []).length, 3);
  assert.ok(!isDisabled(primaryTag(html)), "and the retry button is enabled");
});

test("a dialog without a footer (every other use of Modal) is unchanged apart from now scrolling when it is too tall", () => {
  const html = renderToStaticMarkup(h(ModalFrame, { onClose: noop, title: "Add event", children: h("p", null, "form") }));
  assert.ok(!html.includes("data-modal-footer"));
  assert.match(html, /overflow-y-auto/);
  assert.ok(html.includes("<p>form</p>"));
});

test("on a phone-width screen the primary button takes the full width, first, so its label never wraps into a cramped column", () => {
  const tag = primaryTag(screen(4));
  assert.match(tag, /order-first/);
  assert.match(tag, /w-full/);
  assert.match(tag, /sm:w-auto/, "and returns to its natural width on larger screens");
  assert.match(screen(4), /flex shrink-0 flex-wrap justify-end gap-2/, "the three buttons may wrap onto two lines");
});

