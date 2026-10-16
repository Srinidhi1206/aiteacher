// Offline tests for the Study Plan page's "what this plan is based on" callout (components/study-plan/plan-notes.tsx), rendered to static markup.
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PlanNotes } from "@/components/study-plan/plan-notes";

const html = (notes: string[]) => renderToStaticMarkup(React.createElement(PlanNotes, { notes }));
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

test("no notes: nothing is rendered", () => {
  assert.equal(html([]), "");
});

test("a note is shown as an accessible note with its full text", () => {
  const n = "Your plan for Half-Yearly Examination is based on the published papers for Mathematics. Check with your teacher whether other subjects are included.";
  const h = html([n]);
  assert.match(h, /role="note"/);
  assert.match(h, /aria-label="About this plan"/);
  assert.equal(text(h), n);
});

test("several notes are listed, each once", () => {
  const h = html(["First note.", "Second note."]);
  assert.match(text(h), /First note\. Second note\./);
  assert.equal((h.match(/<p /g) ?? []).length, 2);
});

test("it uses the same warning-note styling as the rest of the app's notices", () => {
  assert.match(html(["x"]), /border-warning-200 bg-warning-50/);
});
