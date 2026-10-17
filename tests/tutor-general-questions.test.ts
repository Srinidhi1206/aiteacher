// Offline tests that the AI Tutor is BOTH a personal tutor and a general-purpose assistant: an ordinary question is sent to the model and answered even when the student's
// textbook search finds nothing; textbook passages are used (and credited) only when the answer really used them; and the context of a topic or chapter never forces an
// unrelated question into that topic. The REAL prompt templates, context builder, source labels and server actions run; only the database, the session, the textbook search
// and the model are replaced (the model by a scripted stand-in). No real database, network or AI is involved - so these tests prove the plumbing and the instructions the
// model is given, NOT how well a real model answers. Needs Node's module mocking (--experimental-test-module-mocks, as in `npm run test:storage`).
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";

import { AIError } from "@/lib/ai/errors";

const here = (p: string) => new URL(`../${p}`, import.meta.url).href;

// ---- in-memory database ------------------------------------------------------------------------------------------------------------------------------------------------
type Conv = { id: string; studentId: string; title: string; subject: string | null; contextSnapshot: unknown; createdAt: Date; updatedAt: Date };
type Msg = { id: string; conversationId: string; role: "STUDENT" | "AI"; content: string; createdAt: Date };
const db = { convs: [] as Conv[], msgs: [] as Msg[], seq: 0, clock: 0, adminTemplate: null as string | null, students: {} as Record<string, Record<string, unknown>> };
const tick = () => new Date(Date.UTC(2026, 9, 17, 5, 0, 0) + ++db.clock * 1000);
const order = <T extends { createdAt: Date }>(rows: T[], dir: "asc" | "desc") => [...rows].sort((a, b) => (a.createdAt.getTime() - b.createdAt.getTime()) * (dir === "asc" ? 1 : -1));

const prisma = {
  promptTemplate: { findFirst: async () => (db.adminTemplate ? { template: db.adminTemplate } : null) },
  student: {
    findUnique: async ({ where }: { where: { userId?: string; id?: string } }) => Object.values(db.students).find((s) => (where.userId ? s.userId === where.userId : s.id === where.id)) ?? null,
  },
  weaknessProfile: { findMany: async () => [{ topic: { name: "Quadratic Equations" } }] },
  strengthProfile: { findMany: async () => [] },
  topic: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === "t1" ? { id: "t1", name: "Euclid's division lemma", chapter: { name: "Real Numbers", subject: { name: "Mathematics" } } } : null) },
  studentTopicProgress: { findUnique: async () => ({ mastery: 35 }) },
  schoolClassSubject: { findMany: async () => [] },
  aIConversation: {
    findFirst: async ({ where }: { where: { id?: string; studentId?: string; messages?: object } }) =>
      order(db.convs.filter((c) => (where.id === undefined || c.id === where.id) && (where.studentId === undefined || c.studentId === where.studentId) && (where.messages === undefined || !db.msgs.some((m) => m.conversationId === c.id))), "desc")[0] ?? null,
    findUnique: async ({ where }: { where: { id: string } }) => {
      const c = db.convs.find((x) => x.id === where.id);
      const s = c ? Object.values(db.students).find((x) => x.id === c.studentId) : null;
      return c && s ? { studentId: c.studentId, student: { schoolId: s.schoolId, schoolClassId: s.schoolClassId, boardId: s.boardId } } : null;
    },
    create: async ({ data }: { data: Partial<Conv> & { studentId: string; title: string } }) => {
      const c = { id: `conv-${++db.seq}`, subject: null, contextSnapshot: null, createdAt: tick(), updatedAt: tick(), ...data } as Conv;
      db.convs.push(c);
      return c;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Conv> }) => Object.assign(db.convs.find((c) => c.id === where.id)!, data),
  },
  aIMessage: {
    findMany: async ({ where, orderBy, take }: { where: { conversationId: string }; orderBy: { createdAt: "asc" | "desc" }; take?: number }) => {
      const rows = order(db.msgs.filter((m) => m.conversationId === where.conversationId), orderBy.createdAt);
      return take ? rows.slice(0, take) : rows;
    },
    findFirst: async ({ where, orderBy }: { where: { conversationId: string }; orderBy: { createdAt: "asc" | "desc" } }) => order(db.msgs.filter((m) => m.conversationId === where.conversationId), orderBy.createdAt)[0] ?? null,
    count: async ({ where }: { where: { conversationId: string } }) => db.msgs.filter((m) => m.conversationId === where.conversationId).length,
    create: async ({ data }: { data: Omit<Msg, "id" | "createdAt"> }) => {
      const m = { id: `msg-${++db.seq}`, createdAt: tick(), ...data } as Msg;
      db.msgs.push(m);
      return m;
    },
  },
};

// ---- session, textbook search, model -----------------------------------------------------------------------------------------------------------------------------------
class UnauthorizedError extends Error {}
class ForbiddenError extends Error {}
let sessionUser: { id: string; role: string } | null = null;
mock.module("server-only", { namedExports: {} });
mock.module(here("lib/prisma.ts"), { namedExports: { prisma } });
mock.module(here("lib/auth/current-session.ts"), {
  namedExports: {
    UnauthorizedError,
    ForbiddenError,
    requireRole: async (role: string) => {
      if (!sessionUser) throw new UnauthorizedError("You must be signed in.");
      if (sessionUser.role !== role) throw new ForbiddenError("Not allowed.");
      return sessionUser;
    },
  },
});
interface ModelCall { systemPrompt: string; messages: { role: string; content: string }[]; userMessage: string; studentContext?: { curriculum?: { subject?: string; chapter?: string; topic?: string } } }
const model = { calls: [] as ModelCall[], answer: (async () => "ok") as (req: ModelCall) => Promise<string> };
mock.module(here("lib/ai/provider.ts"), {
  namedExports: { getAIProvider: () => ({ name: "scripted", generateResponse: async (req: ModelCall) => (model.calls.push(req), { content: await model.answer(req) }) }) },
});
const search = { calls: 0, fail: false, passages: [] as { materialTitle: string; page: number | null; text: string }[] };
mock.module(here("lib/rag/index.ts"), {
  namedExports: {
    retrieveForStudent: async () => {
      search.calls++;
      if (search.fail) throw new Error("embedding service down");
      return search.passages;
    },
  },
});

let tutor: typeof import("@/lib/actions/tutor");
let formatContextBlock: typeof import("@/lib/ai/context-block").formatContextBlock;
before(async () => {
  tutor = await import("@/lib/actions/tutor");
  formatContextBlock = (await import("@/lib/ai/context-block")).formatContextBlock;
});

let n = 0;
function asNewStudent() {
  const k = ++n;
  db.students[`u${k}`] = { id: `s${k}`, userId: `u${k}`, schoolId: "demo", schoolClassId: "c10", boardId: "bse", state: { name: "Telangana" }, board: { shortName: "BSE Telangana" }, schoolClass: { label: "Class 10" } };
  sessionUser = { id: `u${k}`, role: "student" };
  model.calls = [];
  model.answer = async () => "ok";
  search.calls = 0;
  search.fail = false;
  search.passages = [];
  db.adminTemplate = null;
  return `s${k}`;
}
const start = async (topicId?: string) => (await tutor.createConversation(topicId)).data!.id;
const stored = (id: string) => db.msgs.filter((m) => m.conversationId === id).map((m) => [m.role, m.content]);

// ---- general questions work with NO textbook passages ---------------------------------------------------------------------------------------------------------------

const GENERAL: [string, string][] = [
  ["What is 1 + 1?", "1 + 1 = 2."],
  ["What is the capital of India?", "The capital of India is New Delhi."],
  ["Why is the sky blue?", "Air scatters blue light from the Sun more than red light, so the sky looks blue."],
  ["What does 'photosynthesis' mean?", "Photosynthesis is how plants make food from sunlight, water and carbon dioxide."],
  ["If all cats are animals and Tom is a cat, is Tom an animal?", "Yes - Tom is a cat, and every cat is an animal, so Tom is an animal."],
  ["How many days are there in a leap year?", "A leap year has 366 days."],
];

test("a general question is sent to the model and answered even though the textbook search found NOTHING - no source label, no 'not found' detour", async () => {
  asNewStudent();
  const answers = new Map(GENERAL);
  model.answer = async (req) => answers.get(req.userMessage) ?? "I'm not sure.";
  for (const [question, expected] of GENERAL) {
    const id = await start();
    search.calls = 0;
    const before = model.calls.length;
    const r = await tutor.sendMessage(id, question);
    assert.equal(r.ok, true, question);
    assert.equal(r.data!.content, expected, `${question}: the answer reaches the student unchanged`);
    assert.equal(model.calls.length, before + 1, `${question}: the model WAS called`);
    assert.equal(search.calls, 1, `${question}: the textbook was searched ...`);
    const prompt = model.calls.at(-1)!.systemPrompt;
    assert.ok(!/Excerpts from the student's own school study materials/.test(prompt), `${question}: ... and nothing was found, so no excerpts block`);
    assert.ok(!/No passage from the student's study materials matched/.test(prompt), `${question}: a general question gets no 'could not find it in your book' instruction`);
    assert.ok(!/Sources:/.test(r.data!.content));
  }
});

test("the textbook search coming back empty - or failing outright (embedding service down) - never stops the model from being asked", async () => {
  asNewStudent();
  model.answer = async () => "2";
  const quiet = mock.method(console, "error", () => undefined);
  try {
    for (const fail of [false, true]) {
      search.fail = fail;
      const id = await start();
      const r = await tutor.sendMessage(id, "What is 1 + 1?");
      assert.deepEqual([fail, r.ok, r.data?.content], [fail, true, "2"]);
    }
    assert.equal(model.calls.length, 2, "asked both times");
  } finally {
    quiet.mock.restore();
  }
});

test("the instructions the model receives say: answer plainly and first, general questions are fair, textbook and topic are background - and no instruction limits it to the textbook", async () => {
  asNewStudent();
  const id = await start();
  await tutor.sendMessage(id, "What is 1 + 1?");
  const prompt = model.calls[0].systemPrompt;
  assert.match(prompt, /You are the AI Tutor inside TeachAI/, "the real tutor template is used");
  assert.match(prompt, /Answering: answer the question the student actually asked, directly and first/);
  assert.match(prompt, /What is 1 \+ 1\?[\s\S]*What is the capital of India\?[\s\S]*not a quiz, and not a question back/);
  assert.match(prompt, /General knowledge, science, everyday questions, definitions and reasoning questions are all fair questions[\s\S]*whether or not they appear in the student's textbook/);
  assert.match(prompt, /never steer a question about something else back to the current topic/);
  assert.match(prompt, /Scope: you are a school tutor[\s\S]*equally with general knowledge/);
  for (const exclusive of [/only (?:from|use) (?:the )?(?:textbook|excerpts|study materials)/i, /do not answer (?:anything )?outside/i, /refuse/i]) {
    assert.ok(!exclusive.test(prompt), `no exclusivity instruction: ${exclusive}`);
  }
  assert.match(prompt, /Formatting: reply in plain text only/);
});

test("the plain-answer rules come AFTER the school's editable template, so a template written before them cannot override them", async () => {
  asNewStudent();
  db.adminTemplate = "Never give final answers. Only discuss the textbook.";
  const id = await start();
  await tutor.sendMessage(id, "What is 1 + 1?");
  const prompt = model.calls[0].systemPrompt;
  assert.ok(prompt.indexOf("Never give final answers. Only discuss the textbook.") < prompt.indexOf("Answering: answer the question the student actually asked"));
  assert.ok(prompt.indexOf("Answering:") < prompt.indexOf("Scope:"));
});

// ---- textbook questions -------------------------------------------------------------------------------------------------------------------------------------------------

test("a textbook question WITH relevant passages: the excerpts, their titles and pages go to the model; an answer that used them is credited, once, and the marker never reaches the student", async () => {
  asNewStudent();
  const id = await start();
  search.passages = [
    { materialTitle: "Class 10 Maths Textbook", page: 23, text: "Euclid's division lemma: a = bq + r, where 0 <= r < b." },
    { materialTitle: "Class 10 Maths Textbook", page: 25, text: "Example 3: find the HCF of 135 and 225." },
  ];
  model.answer = async () => "Sources: Made-up Book\nEuclid's division lemma says a = bq + r with 0 <= r < b.\n<<used_excerpts>>";
  const r = await tutor.sendMessage(id, "What does Euclid's division lemma say in my textbook?");
  const prompt = model.calls[0].systemPrompt;
  assert.match(prompt, /Excerpts from the student's own school study materials/);
  assert.match(prompt, /\[1\] "Class 10 Maths Textbook" \(page 23\): Euclid's division lemma/);
  assert.match(prompt, /\[2\] "Class 10 Maths Textbook" \(page 25\)/);
  assert.match(prompt, /ignore them completely[\s\S]*do not mention them/, "excerpts that do not help are to be ignored silently");
  assert.match(prompt, /exact marker <<used_excerpts>>/);
  assert.equal(r.data!.content, "Euclid's division lemma says a = bq + r with 0 <= r < b.\n\nSources: Class 10 Maths Textbook (pages 23, 25)");
  assert.ok(!/Made-up Book|used_excerpts/.test(r.data!.content));
  assert.deepEqual(stored(id).at(-1), ["AI", r.data!.content]);
});

test("passages were found but the answer did not use them (a weakly related page fetched for a general question): NO source label", async () => {
  asNewStudent();
  const id = await start();
  search.passages = [{ materialTitle: "Class 10 Maths Textbook", page: 7, text: "Exercise 1.1 ... 1 + 1 ..." }];
  model.answer = async () => "1 + 1 = 2.";
  const r = await tutor.sendMessage(id, "What is 1 + 1?");
  assert.equal(r.data!.content, "1 + 1 = 2.");
  assert.match(model.calls[0].systemPrompt, /Excerpts from the student's own school study materials/, "the model was offered them - and chose not to use them");
});

test("a stray marker is always removed - with no passages at all, nothing is credited and nothing marker-like is shown", async () => {
  asNewStudent();
  const id = await start();
  model.answer = async () => "New Delhi.\n\n\n<<USED_EXCERPTS>>";
  const r = await tutor.sendMessage(id, "What is the capital of India?");
  assert.equal(r.data!.content, "New Delhi.");
});

test("a textbook question with NO relevant passages: the model is told to say honestly that it could not find it and may offer general help clearly labelled - and a made-up 'Sources:' line is dropped", async () => {
  asNewStudent();
  const id = await start();
  model.answer = async () => "Sources: Class 10 English Textbook p.99\nI couldn't find that in your study material. In general, a lemma is a helper theorem (general knowledge).";
  const r = await tutor.sendMessage(id, "What does my textbook say about lemmas?");
  const prompt = model.calls[0].systemPrompt;
  assert.match(prompt, /No passage from the student's study materials matched this question/);
  assert.match(prompt, /couldn't find it in their study material/);
  assert.match(prompt, /clearly labelled as general knowledge/);
  assert.ok(!/Sources:/.test(r.data!.content), "no source is claimed when nothing was retrieved");
  assert.match(r.data!.content, /couldn't find that in your study material/);
});

// ---- follow-ups and context ----------------------------------------------------------------------------------------------------------------------------------------------

test("a follow-up keeps the earlier turns, in order, whether or not anything was retrieved", async () => {
  asNewStudent();
  const id = await start();
  model.answer = async (req) => (req.userMessage === "What is the capital of India?" ? "New Delhi." : "About 33 million people live in its metropolitan area.");
  await tutor.sendMessage(id, "What is the capital of India?");
  const r = await tutor.sendMessage(id, "How many people live there?");
  assert.equal(r.ok, true);
  assert.deepEqual(model.calls[1].messages, [{ role: "user", content: "What is the capital of India?" }, { role: "assistant", content: "New Delhi." }]);
  assert.equal(model.calls[1].userMessage, "How many people live there?");
});

test("a chat opened from a topic carries that topic's subject, chapter and mastery to the model - and a question about something else is still answered, with the instruction not to force it into the topic", async () => {
  asNewStudent();
  const id = await start("t1");
  model.answer = async () => "New Delhi.";
  const r = await tutor.sendMessage(id, "What is the capital of India?");
  assert.equal(r.data!.content, "New Delhi.", "answered normally");
  const call = model.calls[0];
  assert.deepEqual([call.studentContext?.curriculum?.subject, call.studentContext?.curriculum?.chapter, call.studentContext?.curriculum?.topic], ["Mathematics", "Real Numbers", "Euclid's division lemma"]);
  assert.match(call.systemPrompt, /background: use them when they genuinely help with the question, and never steer a question about something else back to the current topic/);
  assert.ok(!/Excerpts from|No passage from/.test(call.systemPrompt));
});

test("the context block is labelled as background to use only where it helps - never as the subject of every answer", () => {
  const block = formatContextBlock({ curriculum: { board: "BSE Telangana", className: "Class 10", subject: "Mathematics", chapter: "Real Numbers" }, performance: { masteryPct: 35, weakTopics: ["Quadratic Equations"], strengths: [] } });
  assert.match(block, /Student's curriculum context: BSE Telangana > Class 10 > Mathematics > Real Numbers\./);
  assert.match(block, /background for your reference - use it only where it helps with the question asked, do not recite it back, and do not bring it into an answer about something else/);
  assert.equal(formatContextBlock(undefined), "");
});

// ---- failures and protections ---------------------------------------------------------------------------------------------------------------------------------------------

test("a model timeout is a clear, recoverable error: the question stays saved, no answer is invented, and Retry answers it without saving the question again", async () => {
  asNewStudent();
  const id = await start();
  model.answer = async () => {
    throw new AIError("AI_PROVIDER_ERROR", "The AI tutor took too long to answer. Please try again.");
  };
  const failed = await tutor.sendMessage(id, "What is 1 + 1?");
  assert.deepEqual([failed.ok, failed.error], [false, "The AI tutor took too long to answer. Please try again."]);
  assert.deepEqual(stored(id), [["STUDENT", "What is 1 + 1?"]]);
  model.answer = async () => "2";
  assert.equal((await tutor.retryLastReply(id)).data!.content, "2");
  assert.deepEqual(stored(id), [["STUDENT", "What is 1 + 1?"], ["AI", "2"]]);
});

test("a blank message never reaches the model; neither does an over-long one", async () => {
  asNewStudent();
  const id = await start();
  for (const bad of ["", "   ", "x".repeat(4001)]) assert.equal((await tutor.sendMessage(id, bad)).ok, false);
  assert.equal(model.calls.length, 0);
  assert.equal(search.calls, 0, "the textbook was not searched either (no wasted embedding call)");
});

test("another student's conversation is inaccessible and never reaches the model", async () => {
  asNewStudent();
  const mine = await start();
  asNewStudent();
  assert.deepEqual(await tutor.sendMessage(mine, "What is 1 + 1?"), { ok: false, error: "That conversation doesn't exist." });
  assert.equal(model.calls.length, 0);
});

test("API credentials and the provider's internal error text never reach the browser", async () => {
  asNewStudent();
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "SENTINEL-KEY-do-not-leak";
  try {
    const id = await start();
    model.answer = async () => {
      throw new Error("403 Forbidden for https://generativelanguage.googleapis.com/v1/models?key=SENTINEL-KEY-do-not-leak");
    };
    const r = await tutor.sendMessage(id, "What is 1 + 1?");
    assert.equal(r.ok, false);
    assert.ok(!/SENTINEL|googleapis|403/.test(JSON.stringify(r)), JSON.stringify(r));
    assert.deepEqual(Object.keys(await tutor.getAITutorStatus()), ["configured"], "the status check says only whether it is configured");
    const history = await tutor.getMyConversation(id);
    assert.ok(!/SENTINEL/.test(JSON.stringify(history)));
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});
