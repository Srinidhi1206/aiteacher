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
import type { Prisma } from "@prisma/client";
import { extractContentTerms, isDefinitionQuery, rankLexical, fuseResults, limitPerPage } from "@/lib/rag/lexical";
import { studentMaterialWhere, studentChunkWhere } from "@/lib/materials/scope";

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
  /** Which channel found it: the word itself (keyword), similar meaning (semantic), or both. */
  via?: "keyword" | "semantic" | "both";
}

// --- Scope loading ---------------------------------------------------------------------------------
// What retrieval may see is the student's own school + class (+ board when they have one, the same
// rule the Materials page uses) and PUBLISHED materials only. The text of those passages is small
// (under 1 KB each) and is loaded first; the 768 numbers per passage (about 10 KB each) are only
// loaded when a meaning-based search is actually needed. Both are kept per server instance, and the
// cache is checked on every question against the published materials' versions (id, last update,
// passage count) - so an unpublish, delete, re-upload or re-index shows up immediately, and a
// cached scope can only ever be reused for exactly the same school/class/board.

interface ScopePassage {
  id: string;
  page: number | null;
  text: string;
  title: string;
}

interface ScopeEntry {
  version: string;
  at: number;
  passages: ScopePassage[];
  vectors: Map<string, Float32Array> | null;
}

const SCOPE_CACHE = new Map<string, ScopeEntry>();
const SCOPE_CACHE_MAX_ENTRIES = 6;
const SCOPE_CACHE_MAX_AGE_MS = 10 * 60 * 1000;

export interface RetrievalScope {
  schoolId: string | null;
  schoolClassId: string | null;
  boardId?: string | null;
}

export interface RetrievalStats {
  passagesInScope: number;
  cacheHit: boolean;
  keywordTerms: number;
  keywordHits: number;
  usedSemantic: boolean;
  vectorsLoaded: number;
  ms: { scope: number; keyword: number; semantic: number; total: number };
}

async function loadScope(scope: { schoolId: string; schoolClassId: string; boardId: string }): Promise<{ entry: ScopeEntry; cacheHit: boolean; where: Prisma.MaterialChunkWhereInput } | null> {
  // The shared rule (lib/materials/scope.ts): common material for this board + class, or this school's own.
  const materialWhere = studentMaterialWhere(scope);
  const chunkWhere = studentChunkWhere(scope);
  if (!materialWhere || !chunkWhere) return null;

  const materials = await prisma.studyMaterial.findMany({
    where: materialWhere,
    select: { id: true, updatedAt: true, _count: { select: { chunks: true } } },
    orderBy: { id: "asc" },
  });
  if (materials.length === 0 || materials.every((m) => m._count.chunks === 0)) return null;

  const key = `${scope.schoolId}|${scope.schoolClassId}|${scope.boardId}`;
  const version = materials.map((m) => `${m.id}:${m.updatedAt.getTime()}:${m._count.chunks}`).join(",");
  const cached = SCOPE_CACHE.get(key);
  if (cached && cached.version === version && Date.now() - cached.at < SCOPE_CACHE_MAX_AGE_MS) {
    return { entry: cached, cacheHit: true, where: chunkWhere };
  }

  const rows = await prisma.materialChunk.findMany({
    where: chunkWhere,
    select: { id: true, page: true, text: true, material: { select: { title: true } } },
    orderBy: [{ materialId: "asc" }, { chunkIndex: "asc" }],
  });
  const entry: ScopeEntry = {
    version,
    at: Date.now(),
    passages: rows.map((r) => ({ id: r.id, page: r.page, text: r.text, title: r.material.title })),
    vectors: null,
  };
  SCOPE_CACHE.delete(key);
  SCOPE_CACHE.set(key, entry);
  while (SCOPE_CACHE.size > SCOPE_CACHE_MAX_ENTRIES) SCOPE_CACHE.delete(SCOPE_CACHE.keys().next().value as string);
  return { entry, cacheHit: false, where: chunkWhere };
}

async function loadVectors(entry: ScopeEntry, where: Prisma.MaterialChunkWhereInput): Promise<Map<string, Float32Array>> {
  if (entry.vectors) return entry.vectors;
  const rows = await prisma.materialChunk.findMany({ where, select: { id: true, embedding: true } });
  const vectors = new Map<string, Float32Array>();
  for (const r of rows) vectors.set(r.id, Float32Array.from(r.embedding));
  entry.vectors = vectors;
  return vectors;
}

function cosineF32(a: ArrayLike<number>, b: ArrayLike<number>): number {
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

/**
 * The most relevant passages from the student's own school's PUBLISHED materials for their own class.
 * Hybrid: a keyword channel for exact words (vocabulary, names, terms) that abstains unless the question
 * contains a rare word, and the embedding channel for everything else - see lib/rag/lexical.ts for how
 * they combine. Pass `stats` to receive counts and timings (never the question or any passage text).
 */
export async function retrieveForStudent(scope: RetrievalScope, question: string, k = 4, stats?: { out?: RetrievalStats }): Promise<RetrievedPassage[]> {
  if (!scope.schoolId || !scope.schoolClassId || !scope.boardId) return [];
  const t0 = Date.now();

  const loaded = await loadScope({ schoolId: scope.schoolId, schoolClassId: scope.schoolClassId, boardId: scope.boardId });
  const tScope = Date.now();
  if (!loaded) return [];
  const { entry, cacheHit, where } = loaded;

  const terms = extractContentTerms(question);
  const definition = isDefinitionQuery(question);
  const lexical = rankLexical(entry.passages, terms, definition);
  const tKeyword = Date.now();

  // A definition lookup that the keyword channel answered needs no meaning-based search at all - which
  // also saves the embedding call and loading the vectors.
  const needSemantic = !(definition && lexical.length > 0);
  let semantic: { id: string; score: number }[] = [];
  let vectorsLoaded = 0;
  if (needSemantic) {
    try {
      const [queryVectors, vectors] = await Promise.all([embedTexts([question], "RETRIEVAL_QUERY"), loadVectors(entry, where)]);
      vectorsLoaded = vectors.size;
      const q = queryVectors[0];
      semantic = entry.passages.flatMap((p) => {
        const v = vectors.get(p.id);
        return v ? [{ id: p.id, score: cosineF32(q, v) }] : [];
      });
    } catch (err) {
      // The embedding service can refuse (rate limit, daily quota) or be down. Keyword hits are still
      // good evidence, so keep them instead of failing the whole lookup; with no keyword hits there is
      // nothing to return and the tutor answers without excerpts, as it always has. Metadata only.
      const info = describeEmbeddingError(err);
      console.error(`[rag] embedding unavailable status=${info.status ?? "none"} category=${info.category}; using keyword results only`);
    }
  }
  const tSemantic = Date.now();

  // With the meaning-based search unavailable there is nothing else to lean on, so let any word of the question
  // that occurs in the material - not only the rare ones - identify passages (ranked by rarity).
  const keywordHits = needSemantic && semantic.length === 0 ? rankLexical(entry.passages, terms, definition, { relaxed: true }) : lexical;

  const byId = new Map(entry.passages.map((p) => [p.id, p]));
  // Fuse more than needed, then keep at most two passages per page so one page cannot crowd out the rest of the book.
  const fused = limitPerPage(fuseResults(keywordHits, semantic, { k: k * 3, definition }), (id) => byId.get(id)?.page ?? null, 2, k);
  if (stats) {
    stats.out = {
      passagesInScope: entry.passages.length,
      cacheHit,
      keywordTerms: terms.length,
      keywordHits: keywordHits.length,
      usedSemantic: needSemantic,
      vectorsLoaded,
      ms: { scope: tScope - t0, keyword: tKeyword - tScope, semantic: tSemantic - tKeyword, total: tSemantic - t0 },
    };
  }
  return fused.flatMap((h) => {
    const p = byId.get(h.id);
    return p ? [{ materialTitle: p.title, page: p.page, text: p.text, score: h.score, via: h.via }] : [];
  });
}
