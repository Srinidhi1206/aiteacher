// Which ONE subject a student's question is about, when it says so ("in maths...", "explain this physics chapter",
// "history of ..."). Used only to NARROW retrieval to that subject's passages - fewer passages to search and, more
// importantly, fewer embedding vectors to load per question as more textbooks are added. It never widens anything and never
// decides what a student may see (that is lib/materials/scope.ts): if no subject is clearly named, or two are, it returns
// null and retrieval searches the whole class exactly as before. Pure, so it can be tested on its own.
//
// The hints are lexical aids matched against the subject NAMES an administrator set up - nothing here knows or invents any
// textbook content.
export interface SubjectRef {
  id: string;
  name: string;
}

// Subject-name pattern -> words that point at it. Deliberately conservative: a word that could belong to more than one
// subject (for example "environment", which is also an English lesson) is left out.
const HINTS: { subject: RegExp; words: string[] }[] = [
  { subject: /math/i, words: ["math", "maths", "mathematics", "algebra", "geometry", "trigonometry", "arithmetic", "mensuration", "polynomial", "polynomials", "quadratic"] },
  { subject: /physic/i, words: ["physics", "chemistry", "physical science"] },
  { subject: /biolog/i, words: ["biology", "biological science"] },
  { subject: /social/i, words: ["social studies", "social science", "history", "geography", "civics", "economics"] },
  { subject: /environment/i, words: ["environmental education", "evs"] },
  { subject: /english/i, words: ["english", "grammar"] },
  { subject: /hindi/i, words: ["hindi"] },
  { subject: /telugu/i, words: ["telugu"] },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Whole-word (or whole-phrase) match: not part of a longer word.
function wordRegExp(phrase: string, flags: string): RegExp {
  return new RegExp("(?<![\\p{L}\\p{N}])" + escapeRegExp(phrase) + "(?![\\p{L}\\p{N}])", flags);
}

function mentions(question: string, phrase: string): boolean {
  return wordRegExp(phrase, "iu").test(question);
}

/** The id of the single subject the question clearly names, or null (none named, or more than one). */
export function detectSubject(question: string, subjects: SubjectRef[]): string | null {
  const matched = new Set<string>();
  for (const s of subjects) {
    const name = s.name.trim().toLowerCase();
    if (name && mentions(question, name)) matched.add(s.id);
    for (const h of HINTS) {
      if (h.subject.test(s.name) && h.words.some((w) => mentions(question, w))) matched.add(s.id);
    }
  }
  return matched.size === 1 ? [...matched][0] : null;
}

/**
 * The question with the words that merely NAMED the subject taken out ("in maths what is a zephyr" -> "in  what is a zephyr").
 * Once retrieval is narrowed to the subject, those words have done their job; left in, a hint word that never appears in the
 * book itself ("maths", "physics") would make the keyword search think the question is about something the book does not contain.
 */
export function withoutSubjectWords(question: string, subjectId: string, subjects: SubjectRef[]): string {
  const subject = subjects.find((s) => s.id === subjectId);
  if (!subject) return question;
  const phrases = [subject.name.trim().toLowerCase(), ...HINTS.filter((h) => h.subject.test(subject.name)).flatMap((h) => h.words)];
  let out = question;
  // longest phrases first, so "physical science" goes before "science"-like fragments
  for (const phrase of phrases.filter(Boolean).sort((a, b) => b.length - a.length)) {
    out = out.replace(wordRegExp(phrase, "giu"), " ");
  }
  return out;
}
