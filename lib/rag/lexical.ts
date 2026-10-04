// Keyword side of the AI Tutor's hybrid retrieval, plus the rule for combining it with the
// meaning-based (embedding) side. Pure functions only - no database, no network - so the exact ranking
// logic can be tested on its own and shared between lib/rag/index.ts and its tests.
//
// Why it exists: an embedding captures what a passage is ABOUT, so a one-word question like "What does
// sundry mean?" has almost nothing to match on and returns unrelated passages at middling scores.
// Exact words - vocabulary, names, places, abbreviations - are found far more reliably by looking for
// the word itself. The keyword channel is deliberately conservative: it only speaks when the question
// contains a RARE term (one that appears in only a few passages). Common words match half the book and
// say nothing, so then it abstains and the embedding result stands exactly as before.

export const SPECIFIC_MAX_DF = 12; // a term in more passages than this is too common to identify one
export const MAX_TERMS = 6;
// Measured on the real textbook with real questions: off-topic questions (quantum computers, photosynthesis, capital of France...)
// never scored above 0.568 on any passage; genuine questions, even vague ones ("What is a noun?"), scored 0.611 or more on their
// best passage. 0.59 sits between, so an off-topic question returns no excerpts (and so no misleading page citations).
export const SEMANTIC_MIN_SCORE = 0.59;
export const SEMANTIC_FILL_MIN_SCORE = 0.65; // a stricter bar for padding keyword hits with similar passages
// A keyword hit that is clearly off-topic by meaning is an accident of a rare everyday word ("talks" appears on only
// two pages of the book). Measured on the real textbook: such stray hits sat 0.16-0.18 below the best meaning score,
// while genuine ones (names, terms) sat within about 0.11. Glossary lookups are exempt - a dictionary entry can be
// far from the question by meaning and still be exactly right.
export const LEXICAL_MAX_SEMANTIC_GAP = 0.12;

// Words that carry no identifying power in a question: question words, auxiliaries, prepositions, and
// the generic words students use to talk about a book ("lesson", "textbook", "page").
const STOPWORDS = new Set(
  (
    "a an the and or but nor so yet for of in on at to from by with without about into onto over under between among through during " +
    "is are was were be been being am do does did done doing has have had having can could will would shall should may might must " +
    "what whats which who whom whose when where why how whether that this these those there here it its it's they them their he him his she her " +
    "i me my mine we us our you your yours " +
    "mean means meant meaning meanings define defined definition refer refers referred stand stands synonym synonyms antonym antonyms " +
    "explain tell give show list describe say said write find please help need want know understand talk discuss mention cover contain " +
    "word words term terms phrase glossary dictionary vocabulary " +
    "lesson lessons chapter chapters unit units page pages book books textbook textbooks passage text story stories poem poems play plays " +
    "first second third last next previous main topic topics question questions answer answers example examples " +
    "some any all each every more most much many other another also very just only not no yes if then than as"
  ).split(/\s+/)
);

// "gives", "giving", "says" and "forgot" are the same everyday word as "give", "say", "forget" - without this a plain
// inflection of a stopword would look like a rare word (it is found in only a few passages) and mislead the ranking.
function isStopword(lower: string): boolean {
  if (STOPWORDS.has(lower)) return true;
  for (const suffix of ["ing", "es", "ed", "s", "d"]) {
    if (lower.length > suffix.length + 2 && lower.endsWith(suffix) && STOPWORDS.has(lower.slice(0, -suffix.length))) return true;
  }
  // "giving"/"making"-style forms that dropped the final "e" of the stopword
  if (lower.endsWith("ing") && lower.length > 5 && STOPWORDS.has(lower.slice(0, -3) + "e")) return true;
  // irregular forms of the stopwords that matter
  return ["gave", "given", "went", "gone", "forgot", "forgotten", "told", "knew", "known", "wrote", "written", "saw", "seen", "got", "took", "taken"].includes(lower);
}

const TOKEN_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The words of a question that could identify a passage: lower-cased, de-duplicated, stopwords removed. */
export function extractContentTerms(question: string): string[] {
  const out: string[] = [];
  for (const raw of question.match(TOKEN_RE) ?? []) {
    const word = raw.replace(/['’]s$/i, "");
    const lower = word.toLowerCase();
    const isAcronym = word.length >= 2 && word === word.toUpperCase() && /\p{L}/u.test(word);
    if (lower.length < 3 && !isAcronym) continue;
    if (isStopword(lower)) continue;
    if (!out.includes(lower)) out.push(lower);
    if (out.length >= MAX_TERMS) break;
  }
  return out;
}

/** "What does X mean", "Define X", "meaning of X" ... - a lookup of one word, not a request to explain a lesson. */
export function isDefinitionQuery(question: string): boolean {
  return /\b(mean|means|meaning|meanings|define|defined|definition|stand for|stands for|synonym|synonyms|antonym|antonyms|refers? to)\b/i.test(question);
}

// Whole-word match, tolerating plain inflection (sundry/sundries is not covered; walk/walks/walked is).
function termRegex(term: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?:s|es|ed|d|ing)?(?![\\p{L}\\p{N}])`, "iu");
}

// A glossary-style entry for the term, e.g. "sundry (adj) : various" or "nonplussed : so confused".
function entryRegex(term: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}\\s*(?:\\((?:n|v|adj|adv|prep|pron|conj|interj|phr)[^)]{0,6}\\)|:)`, "iu");
}

export interface LexicalHit {
  id: string;
  score: number;
}

/**
 * Passages that contain the question's rare terms, best first. Returns [] (abstains) when no term is rare
 * enough to identify a passage. Passages are scored by how RARE the words they contain are (a word found in
 * a handful of passages counts far more than one found in half the book), so a passage holding the one
 * distinctive word of the question beats a passage that merely holds several everyday words. For definition
 * lookups a glossary-style entry for the term ranks first.
 *
 * `relaxed` is for when the meaning-based search is unavailable: there is nothing to fall back on, so any
 * term that occurs in the material may identify passages, not only the rare ones.
 */
export function rankLexical(passages: { id: string; text: string }[], terms: string[], definition: boolean, opts?: { relaxed?: boolean }): LexicalHit[] {
  if (terms.length === 0 || passages.length === 0) return [];
  const regs = terms.map(termRegex);
  const df = regs.map((re) => passages.reduce((n, p) => n + (re.test(p.text) ? 1 : 0), 0));
  // A word that appears nowhere in the material means the question is about something this material
  // doesn't contain (or is misspelled). Guessing from the remaining words would cite unrelated passages,
  // so stay silent and let the meaning-based search decide, exactly as before.
  if (df.some((n) => n === 0)) return [];
  const specific = terms.map((_, i) => i).filter((i) => df[i] <= SPECIFIC_MAX_DF);
  if (specific.length === 0 && !opts?.relaxed) return [];
  const gate = specific.length > 0 ? specific : terms.map((_, i) => i); // relaxed with only common terms: use them all
  const idf = df.map((n) => Math.log(1 + passages.length / n));

  const entries = definition ? gate.map((i) => entryRegex(terms[i])) : [];
  const scored = passages
    .map((p) => {
      let gated = 0; // matches of the terms allowed to identify a passage
      let score = 0;
      for (let i = 0; i < terms.length; i++) {
        const all = p.text.match(new RegExp(regs[i].source, "giu"));
        if (!all) continue;
        if (gate.includes(i)) gated++;
        score += idf[i] * (1 + 0.1 * Math.min(all.length - 1, 3));
      }
      const entryBoost = entries.some((re) => re.test(p.text)) ? 1000 : 0;
      return { id: p.id, gated, score: score + entryBoost };
    })
    .filter((p) => p.gated > 0);
  if (scored.length === 0) return [];
  const best = Math.max(...scored.map((p) => p.score));
  // A long tail of weak partial matches only dilutes the citations; keep what is close to the best.
  return scored
    .filter((p) => p.score >= best * 0.6)
    .sort((a, b) => b.score - a.score)
    .map(({ id, score }) => ({ id, score }));
}

/**
 * At most `maxPerPage` passages from any one page (a page is two or three consecutive passages, and four of
 * them together would crowd out every other part of the book), keeping the order, cut to `k`.
 */
export function limitPerPage<T extends { id: string }>(hits: T[], pageOf: (id: string) => number | null, maxPerPage: number, k: number): T[] {
  const seen = new Map<number, number>();
  const out: T[] = [];
  for (const h of hits) {
    const page = pageOf(h.id);
    if (page !== null) {
      const n = seen.get(page) ?? 0;
      if (n >= maxPerPage) continue;
      seen.set(page, n + 1);
    }
    out.push(h);
    if (out.length >= k) break;
  }
  return out;
}

export interface SemanticHit {
  id: string;
  score: number;
}

export interface FusedHit {
  id: string;
  score: number;
  via: "keyword" | "semantic" | "both";
}

/**
 * Combines the two channels. When the keyword channel found passages for a rare term it leads; a
 * definition lookup is answered from those alone (similar-but-unrelated passages would only add wrong
 * citations), other questions are topped up with clearly similar passages. When it abstains, the
 * embedding ranking is returned exactly as before.
 */
export function fuseResults(lexical: LexicalHit[], semantic: SemanticHit[], opts: { k: number; definition: boolean }): FusedHit[] {
  const sem = new Map(semantic.map((s) => [s.id, s.score]));
  // For ordinary (non-glossary) questions, ignore keyword hits that are far less similar in meaning than the best passage.
  if (!opts.definition && semantic.length > 0) {
    const bestSemantic = Math.max(...semantic.map((x) => x.score));
    lexical = lexical.filter((l) => {
      const score = sem.get(l.id);
      return score === undefined || score >= bestSemantic - LEXICAL_MAX_SEMANTIC_GAP;
    });
  }
  if (lexical.length === 0) {
    return semantic
      .filter((s) => s.score >= SEMANTIC_MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.k)
      .map((s) => ({ id: s.id, score: s.score, via: "semantic" as const }));
  }
  // Equal keyword scores are separated by how close the passage is in meaning, when that was computed.
  const keyword = [...lexical]
    .sort((a, b) => b.score - a.score || (sem.get(b.id) ?? 0) - (sem.get(a.id) ?? 0))
    .slice(0, opts.k)
    .map((l) => ({ id: l.id, score: l.score, via: sem.has(l.id) ? ("both" as const) : ("keyword" as const) }));
  if (opts.definition) return keyword;
  const taken = new Set(keyword.map((h) => h.id));
  const fill = semantic
    .filter((s) => s.score >= SEMANTIC_FILL_MIN_SCORE && !taken.has(s.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.k - keyword.length)
    .map((s) => ({ id: s.id, score: s.score, via: "semantic" as const }));
  return [...keyword, ...fill];
}
