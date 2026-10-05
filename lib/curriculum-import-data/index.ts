// Registry of approved, source-grounded textbook curricula that the admin "Import approved textbook curriculum"
// button may load. An import is offered ONLY for the exact board + grade + subject it was built for, so it can
// never be run against an unrelated subject. Adding a book means adding a data file here and one entry below.
import type { CurriculumImportChapter } from "./telangana-bse-class8-mathematics";
import { TELANGANA_BSE_CLASS8_MATHEMATICS } from "./telangana-bse-class8-mathematics";
import { TELANGANA_BSE_CLASS10_ENGLISH } from "./telangana-bse-class10-english";
import { TELANGANA_BSE_CLASS10_BIOLOGICAL_SCIENCE } from "./telangana-bse-class10-biological-science";
import { TELANGANA_BSE_CLASS10_SOCIAL_STUDIES } from "./telangana-bse-class10-social-studies";
import { TELANGANA_BSE_CLASS10_TELUGU } from "./telangana-bse-class10-telugu";
import { TELANGANA_BSE_CLASS10_HINDI } from "./telangana-bse-class10-hindi";
import { TELANGANA_BSE_CLASS10_MATHEMATICS } from "./telangana-bse-class10-mathematics";
import { TELANGANA_BSE_CLASS10_PHYSICAL_SCIENCE } from "./telangana-bse-class10-physical-science";

export interface CurriculumImportDefinition {
  boardShortName: string;
  grade: number;
  subjectSlug: string;
  /** Shown to the admin, e.g. "BSE Telangana Class 10 English". */
  label: string;
  /** Unit/chapter label for the confirmation text. */
  chapterNoun: string;
  /** What each topic is, for the confirmation text. */
  topicNoun: string;
  chapters: CurriculumImportChapter[];
}

export const CURRICULUM_IMPORTS: CurriculumImportDefinition[] = [
  {
    boardShortName: "BSE Telangana",
    grade: 8,
    subjectSlug: "mathematics",
    label: "BSE Telangana Class 8 Mathematics",
    chapterNoun: "chapters",
    topicNoun: "topics",
    chapters: TELANGANA_BSE_CLASS8_MATHEMATICS,
  },
  {
    boardShortName: "BSE Telangana",
    grade: 10,
    subjectSlug: "english",
    label: "BSE Telangana Class 10 English",
    chapterNoun: "units",
    topicNoun: "lessons",
    chapters: TELANGANA_BSE_CLASS10_ENGLISH,
  },
  {
    boardShortName: "BSE Telangana",
    grade: 10,
    subjectSlug: "mathematics",
    label: "BSE Telangana Class 10 Mathematics",
    chapterNoun: "chapters",
    topicNoun: "topics",
    chapters: TELANGANA_BSE_CLASS10_MATHEMATICS,
  },
  {
    boardShortName: "BSE Telangana",
    grade: 10,
    subjectSlug: "science", // the Class 10 "Physical Science" subject keeps the slug it was created with
    label: "BSE Telangana Class 10 Physical Science",
    chapterNoun: "chapters",
    topicNoun: "topics",
    chapters: TELANGANA_BSE_CLASS10_PHYSICAL_SCIENCE,
  },
  {
    boardShortName: "BSE Telangana",
    grade: 10,
    subjectSlug: "hindi",
    label: "BSE Telangana Class 10 Hindi",
    chapterNoun: "lessons",
    topicNoun: "topics",
    chapters: TELANGANA_BSE_CLASS10_HINDI,
  },
  {
    boardShortName: "BSE Telangana",
    grade: 10,
    subjectSlug: "biological-science",
    label: "BSE Telangana Class 10 Biological Science",
    chapterNoun: "chapters",
    topicNoun: "topics",
    chapters: TELANGANA_BSE_CLASS10_BIOLOGICAL_SCIENCE,
  },
  {
    boardShortName: "BSE Telangana",
    grade: 10,
    subjectSlug: "social-science", // the Class 10 "Social Studies" subject keeps the slug it was created with
    label: "BSE Telangana Class 10 Social Studies",
    chapterNoun: "chapters",
    topicNoun: "topics",
    chapters: TELANGANA_BSE_CLASS10_SOCIAL_STUDIES,
  },
  {
    boardShortName: "BSE Telangana",
    grade: 10,
    subjectSlug: "environmental-education", // the Class 10 "Telugu" subject was renamed from an empty Environmental Education one and kept its slug
    label: "BSE Telangana Class 10 Telugu",
    chapterNoun: "lessons",
    topicNoun: "topics",
    chapters: TELANGANA_BSE_CLASS10_TELUGU,
  },
];

export function findCurriculumImport(boardShortName: string | undefined, grade: number | undefined, subjectSlug: string | undefined): CurriculumImportDefinition | null {
  if (!boardShortName || grade === undefined || !subjectSlug) return null;
  return CURRICULUM_IMPORTS.find((d) => d.boardShortName === boardShortName && d.grade === grade && d.subjectSlug === subjectSlug) ?? null;
}

export function countTopics(chapters: CurriculumImportChapter[]): number {
  return chapters.reduce((n, c) => n + c.topics.length, 0);
}
