// Source-grounded curriculum extraction for one specific board-specific subject:
// Telangana -> BSE Telangana -> Class 10 -> Biological Science (SCERT Telangana, English medium, e-textbook 10EM_BIO.pdf).
//
// Provenance - nothing here is invented, renamed or simplified:
//   * Chapters: the ten chapters of the contents page (printed page ix). Titles are as printed there; the order and
//     numbering were checked against each chapter's opening page (printed pages 1, 24, 48, 74, 94, 116, 144, 166, 193,
//     212), where the chapter number is printed beside the title.
//   * The contents page prints its title column out of order (Heredity is listed last but is chapter 8; Our Environment
//     is chapter 9; Natural Resources is chapter 10), so the order comes from the chapter numbers and page numbers, not
//     from the order of the titles in the text layer.
// Chapters only: the contents page lists no topics, so none are created rather than guessing them.
import type { CurriculumImportChapter } from "./telangana-bse-class8-mathematics";

export const TELANGANA_BSE_CLASS10_BIOLOGICAL_SCIENCE: CurriculumImportChapter[] = [
  { name: "Nutrition - Food Supplying System", slug: "nutrition-food-supplying-system", topics: [] },
  { name: "Respiration - The Energy Releasing System", slug: "respiration-the-energy-releasing-system", topics: [] },
  { name: "Transportation - The Circulatory System", slug: "transportation-the-circulatory-system", topics: [] },
  { name: "Excretion - The Wastage Disposing System", slug: "excretion-the-wastage-disposing-system", topics: [] },
  { name: "Coordination - The Linking System", slug: "coordination-the-linking-system", topics: [] },
  { name: "Reproduction - The Generating System", slug: "reproduction-the-generating-system", topics: [] },
  { name: "Coordination in Life Processes", slug: "coordination-in-life-processes", topics: [] },
  { name: "Heredity - From Parent to Progeny", slug: "heredity-from-parent-to-progeny", topics: [] },
  { name: "Our Environment - Our Concern", slug: "our-environment-our-concern", topics: [] },
  { name: "Natural Resources", slug: "natural-resources", topics: [] },
];
