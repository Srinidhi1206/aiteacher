// Retrieval-augmented generation building blocks for the AI Tutor: chunking,
// embeddings and school-scoped retrieval over StudyMaterial text.
//
// Isolation: retrieval takes the student's OWN school and class (read from
// their Student row by the caller, never from the browser) and filters on the
// school/class stored ON each chunk plus the material still being published.
// A chunk from another school's material is not merely hidden - it is never
// loaded, so it cannot reach the model or the student.
import "server-only";
import { prisma } from "@/lib/prisma";

// Configurable like GEMINI_MODEL; the stored vectors are 768-dimensional, so only change it to a
// model that supports outputDimensionality 768, and re-index materials afterwards.
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL?.trim() || "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;
const EMBED_BATCH = 50;

export const CHUNK_TARGET_CHARS = 900;
export const CHUNK_OVERLAP_CHARS = 150;
const MIN_CHUNK_CHARS = 40;

/** Splits one page of text into overlapping passages, breaking on sentence boundaries where possible. */
export function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length < MIN_CHUNK_CHARS) return [];
  if (clean.length <= CHUNK_TARGET_CHARS) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_TARGET_CHARS, clean.length);
    if (end < clean.length) {
      // Prefer to end on a sentence boundary in the last third of the window.
      const window = clean.slice(start, end);
      const lastStop = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
      if (lastStop > CHUNK_TARGET_CHARS * 0.6) end = start + lastStop + 1;
    }
    const piece = clean.slice(start, end).trim();
    if (piece.length >= MIN_CHUNK_CHARS) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(end - CHUNK_OVERLAP_CHARS, start + 1);
  }
  return chunks;
}

async function embedBatch(texts: string[], taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<number[][]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
    try {
      const res = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: texts,
        config: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType, abortSignal: AbortSignal.timeout(30_000) },
      });
      const vectors = (res.embeddings ?? []).map((e) => e.values ?? []);
      if (vectors.length !== texts.length || vectors.some((v) => v.length !== EMBEDDING_DIMENSIONS)) {
        throw new Error("Embedding service returned an unexpected result.");
      }
      return vectors;
    } catch (err) {
      lastError = err;
      // Only transient failures (5xx, network, timeout) are worth another try. Quota and other
      // client errors (4xx) would fail again and only spend more quota.
      const status = (err as { status?: number } | null)?.status;
      if (typeof status === "number" && status >= 400 && status < 500) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Embedding failed.");
}

// Gemini's free tier allows 100 embedding requests per minute per project and model, and every text in
// a batch counts as one. Indexing paces itself to stay under that (override with GEMINI_EMBED_PER_MINUTE
// on a paid plan) instead of firing every batch at once and being refused.
export const EMBED_PER_MINUTE = Math.max(10, Number(process.env.GEMINI_EMBED_PER_MINUTE) || 90);
export const INDEX_BATCH_SIZE = 30;

export interface EmbeddingFailure {
  status: number | null;
  category: "quota" | "auth" | "bad_request" | "server" | "timeout" | "unknown";
  /** How long the provider asked us to wait before retrying, when it said. */
  retryAfterMs: number | null;
}

/** Classifies an embedding error into safe metadata only - never the raw message, which could echo request details. */
export function describeEmbeddingError(err: unknown): EmbeddingFailure {
  const e = err as { status?: unknown; name?: unknown; message?: unknown } | null;
  const status = typeof e?.status === "number" ? e.status : null;
  const message = typeof e?.message === "string" ? e.message : "";
  const retry = /retry in ([\d.]+)\s*s/i.exec(message);
  const retryAfterMs = retry ? Math.ceil(Number(retry[1]) * 1000) : null;
  if (status === 429) return { status, category: "quota", retryAfterMs };
  if (status === 401 || status === 403) return { status, category: "auth", retryAfterMs: null };
  if (status !== null && status >= 400 && status < 500) return { status, category: "bad_request", retryAfterMs: null };
  if (status !== null && status >= 500) return { status, category: "server", retryAfterMs: null };
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return { status, category: "timeout", retryAfterMs: null };
  return { status, category: "unknown", retryAfterMs: null };
}

export async function embedTexts(texts: string[], taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    out.push(...(await embedBatch(texts.slice(i, i + EMBED_BATCH), taskType)));
  }
  return out;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface RetrievedPassage {
  materialTitle: string;
  page: number | null;
  text: string;
  score: number;
}

// Passages weaker than this are not "relevant" and are not shown to the model,
// so an unrelated question isn't dressed up with irrelevant excerpts.
const MIN_SCORE = 0.55;

/**
 * The most relevant passages from the student's own school's PUBLISHED
 * materials for their own class. `subjectName` (when the conversation is about
 * a subject) only re-ranks - it never widens what is searched.
 */
export async function retrieveForStudent(
  scope: { schoolId: string | null; schoolClassId: string | null },
  question: string,
  k = 4
): Promise<RetrievedPassage[]> {
  if (!scope.schoolId || !scope.schoolClassId) return [];

  const chunks = await prisma.materialChunk.findMany({
    where: { schoolId: scope.schoolId, schoolClassId: scope.schoolClassId, material: { isPublished: true } },
    select: { text: true, page: true, embedding: true, material: { select: { title: true } } },
  });
  if (chunks.length === 0) return [];

  const [queryVector] = await embedTexts([question], "RETRIEVAL_QUERY");
  return chunks
    .map((c) => ({ materialTitle: c.material.title, page: c.page, text: c.text, score: cosine(queryVector, c.embedding) }))
    .filter((c) => c.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
