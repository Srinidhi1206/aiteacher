// Source-grounded curriculum extraction for one specific board-specific subject:
// Telangana -> BSE Telangana -> Class 10 -> Physical Science (SCERT Telangana, English medium, e-textbook 10EM_PHY.pdf).
//
// Provenance - nothing here is invented, renamed or simplified:
//   * Chapters: the twelve numbered chapters of the contents page (printed page ix), in the book's own numbering
//     1-12. Each title and number was checked against that chapter's opening page (printed pages 1, 20, 33, 57, 81,
//     106, 122, 150, 176, 209, 237, 253), where the title is printed above the large chapter number.
//   * The contents page prints its title column out of order (chapter 1 is listed third), so the order comes from
//     the chapter numbers and page ranges, not from the order the titles appear in the text layer.
// Chapters only: the contents page lists no topics, so none are created rather than guessing them.
import type { CurriculumImportChapter } from "./telangana-bse-class8-mathematics";

export const TELANGANA_BSE_CLASS10_PHYSICAL_SCIENCE: CurriculumImportChapter[] = [
  { name: "Reflection of Light at Curved Surfaces", slug: "reflection-of-light-at-curved-surfaces", topics: [] },
  { name: "Chemical Equations", slug: "chemical-equations", topics: [] },
  { name: "Acids, Bases and Salts", slug: "acids-bases-and-salts", topics: [] },
  { name: "Refraction of Light at Curved Surfaces", slug: "refraction-of-light-at-curved-surfaces", topics: [] },
  { name: "Human Eye and Colourful World", slug: "human-eye-and-colourful-world", topics: [] },
  { name: "Structure of Atom", slug: "structure-of-atom", topics: [] },
  { name: "Classification of Elements - The Periodic Table", slug: "classification-of-elements-the-periodic-table", topics: [] },
  { name: "Chemical Bonding", slug: "chemical-bonding", topics: [] },
  { name: "Electric Current", slug: "electric-current", topics: [] },
  { name: "Electromagnetism", slug: "electromagnetism", topics: [] },
  { name: "Principles of Metallurgy", slug: "principles-of-metallurgy", topics: [] },
  { name: "Carbon and its Compounds", slug: "carbon-and-its-compounds", topics: [] },
];
