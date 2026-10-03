// Source-grounded curriculum extraction for one specific board-specific subject:
// Telangana -> BSE Telangana -> Class 10 -> English ("Our World through English", SCERT Telangana).
//
// Provenance - nothing here is invented, renamed or simplified:
//   * Units: the eight numbered unit title pages of the textbook (printed as "1. Personality Development" ...
//     "8. Human Rights"), matching the eight months (June-January) on its contents page.
//   * Lessons: the large-print reading titles inside each unit, in book order, three per unit.
//   * Verified against BOTH the 2019-20 impression and the current "Republished 2025, 2026" edition on SCERT's
//     e-Textbooks page: the units, lessons and page numbers are identical in the two.
// A unit is modelled as a Chapter and each reading as a Topic, which is how the app's curriculum is shaped
// (Subject -> Chapter -> Topic); the per-unit language-skill sections (listening, speaking, writing, vocabulary,
// grammar, study skills, project, self-assessment) repeat in every unit and are deliberately not topics.
// Front matter and appendices (preface, listening texts, assessment notes) are not curriculum units.
//
// bloomLevel is deliberately uniform (UNDERSTAND), as in the Class 8 Mathematics import: the textbook does not
// tag lessons with Bloom's-taxonomy levels, so this is a neutral placeholder pending a real pedagogical
// classification, not something read from the book. Consumed only by the "Import approved textbook curriculum"
// admin action (lib/actions/curriculum-admin.ts bulkImportCurriculum), which matches existing rows by slug and
// never duplicates them.
import { BloomLevel } from "@prisma/client";
import type { CurriculumImportChapter, CurriculumImportTopic } from "./telangana-bse-class8-mathematics";

function t(name: string, slug: string): CurriculumImportTopic {
  return { name, slug, bloomLevel: BloomLevel.UNDERSTAND };
}

export const TELANGANA_BSE_CLASS10_ENGLISH: CurriculumImportChapter[] = [
  {
    name: "Unit 1: Personality Development",
    slug: "unit-1-personality-development",
    topics: [
      t("Attitude Is Altitude", "attitude-is-altitude"),
      t("Every Success Story Is also a Story of Great Failures", "every-success-story-is-also-a-story-of-great-failures"),
      t("I Will Do It", "i-will-do-it"),
    ],
  },
  {
    name: "Unit 2: Wit and Humour",
    slug: "unit-2-wit-and-humour",
    topics: [
      t("The Dear Departed - I", "the-dear-departed-i"),
      t("The Dear Departed - II", "the-dear-departed-ii"),
      t("The Brave Potter", "the-brave-potter"),
    ],
  },
  {
    name: "Unit 3: Human Relations",
    slug: "unit-3-human-relations",
    topics: [t("The Journey", "the-journey"), t("Another Woman", "another-woman"), t("The Never-Never Nest", "the-never-never-nest")],
  },
  {
    name: "Unit 4: Films and Theatre",
    slug: "unit-4-films-and-theatre",
    topics: [t("Rendezvous with Ray", "rendezvous-with-ray"), t("Maya Bazaar", "maya-bazaar"), t("A Tribute", "a-tribute")],
  },
  {
    name: "Unit 5: Social Issues",
    slug: "unit-5-social-issues",
    topics: [t("The Storeyed House - I", "the-storeyed-house-i"), t("The Storeyed House - II", "the-storeyed-house-ii"), t("Abandoned", "abandoned")],
  },
  {
    name: "Unit 6: Bio-Diversity",
    slug: "unit-6-bio-diversity",
    topics: [t("Environment", "environment"), t("Or will the Dreamer Wake?", "or-will-the-dreamer-wake"), t("A Tale of Three Villages", "a-tale-of-three-villages")],
  },
  {
    name: "Unit 7: Nation and Diversity",
    slug: "unit-7-nation-and-diversity",
    topics: [t("My Childhood", "my-childhood"), t("A Plea for India", "a-plea-for-india"), t("Unity in Diversity in India", "unity-in-diversity-in-india")],
  },
  {
    name: "Unit 8: Human Rights",
    slug: "unit-8-human-rights",
    topics: [t("Jamaican Fragment", "jamaican-fragment"), t("Once upon a Time", "once-upon-a-time"), t("What Is My Name?", "what-is-my-name")],
  },
];
