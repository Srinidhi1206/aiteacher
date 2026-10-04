// Source-grounded curriculum extraction for one specific board-specific subject:
// Telangana -> BSE Telangana -> Class 10 -> Mathematics (SCERT Telangana, English medium, e-textbook 10EM_MAT.pdf).
//
// Provenance - nothing here is invented, renamed or simplified:
//   * Chapters: the "CHAPTER CONTENTS" table on the book's contents page (printed page vii), in book order, with the
//     chapter numbers 01-14 and the unnumbered "Appendix: Mathematical Modelling" that follows chapter 14.
//   * "Answers" and the revision period listed in the same table are not teaching chapters and are not imported.
// Chapters only: the textbook's contents page lists no topics, so no topics are created rather than guessing them.
// A teacher can add topics later from the curriculum screen.
import type { CurriculumImportChapter } from "./telangana-bse-class8-mathematics";

export const TELANGANA_BSE_CLASS10_MATHEMATICS: CurriculumImportChapter[] = [
  { name: "Real Numbers", slug: "real-numbers", topics: [] },
  { name: "Sets", slug: "sets", topics: [] },
  { name: "Polynomials", slug: "polynomials", topics: [] },
  { name: "Pair of Linear Equations in Two Variables", slug: "pair-of-linear-equations-in-two-variables", topics: [] },
  { name: "Quadratic Equations", slug: "quadratic-equations", topics: [] },
  { name: "Progressions", slug: "progressions", topics: [] },
  { name: "Coordinate Geometry", slug: "coordinate-geometry", topics: [] },
  { name: "Similar Triangles", slug: "similar-triangles", topics: [] },
  { name: "Tangents and Secants to a Circle", slug: "tangents-and-secants-to-a-circle", topics: [] },
  { name: "Mensuration", slug: "mensuration", topics: [] },
  { name: "Trigonometry", slug: "trigonometry", topics: [] },
  { name: "Applications of Trigonometry", slug: "applications-of-trigonometry", topics: [] },
  { name: "Probability", slug: "probability", topics: [] },
  { name: "Statistics", slug: "statistics", topics: [] },
  { name: "Appendix: Mathematical Modelling", slug: "appendix-mathematical-modelling", topics: [] },
];
