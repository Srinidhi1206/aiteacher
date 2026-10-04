// Source-grounded curriculum extraction for one specific board-specific subject:
// Telangana -> BSE Telangana -> Class 10 -> Social Studies (SCERT Telangana, English medium, e-textbook 10EM_SOC.pdf).
//
// Provenance - nothing here is invented, renamed or simplified:
//   * Chapters: the twenty-one numbered chapters of the contents page (printed page ix), in the book's own numbering 1-21.
//     Part I "Resources Development and Equity" is chapters 1-11 and Part II "Contemporary World and India" is chapters
//     12-21; the parts are headings in the book, not chapters, and are not imported as such.
//   * Each chapter number and start page was checked against the chapter's opening page (printed pages 1, 14, 28, 44, 58,
//     71, 87, 102, 117, 131, 145, 162, 186, 202, 216, 232, 242, 258, 276, 292, 308). Titles are as printed on the contents page.
// Chapters only: the contents page lists no topics, so none are created rather than guessing them.
import type { CurriculumImportChapter } from "./telangana-bse-class8-mathematics";

export const TELANGANA_BSE_CLASS10_SOCIAL_STUDIES: CurriculumImportChapter[] = [
  { name: "India: Relief Features", slug: "india-relief-features", topics: [] },
  { name: "Ideas of Development", slug: "ideas-of-development", topics: [] },
  { name: "Production and Employment", slug: "production-and-employment", topics: [] },
  { name: "Climate of India", slug: "climate-of-india", topics: [] },
  { name: "Indian Rivers and Water Resources", slug: "indian-rivers-and-water-resources", topics: [] },
  { name: "India - Population", slug: "india-population", topics: [] },
  { name: "Settlements - Migrations", slug: "settlements-migrations", topics: [] },
  { name: "Rampur : A Village Economy", slug: "rampur-a-village-economy", topics: [] },
  { name: "Globalisation", slug: "globalisation", topics: [] },
  { name: "Food Security", slug: "food-security", topics: [] },
  { name: "Sustainable Development with Equity", slug: "sustainable-development-with-equity", topics: [] },
  { name: "World Between the World Wars", slug: "world-between-the-world-wars", topics: [] },
  { name: "National Liberation Movements in the Colonies", slug: "national-liberation-movements-in-the-colonies", topics: [] },
  { name: "National Movement in India–Partition & Independence : 1939-1947", slug: "national-movement-in-india-partition-and-independence-1939-1947", topics: [] },
  { name: "The Making of Independent India’s Constitution", slug: "the-making-of-independent-indias-constitution", topics: [] },
  { name: "Election Process in India", slug: "election-process-in-india", topics: [] },
  { name: "Independent India (The First 30 years - 1947-77)", slug: "independent-india-the-first-30-years-1947-77", topics: [] },
  { name: "Emerging Political Trends 1977 to 2000", slug: "emerging-political-trends-1977-to-2000", topics: [] },
  { name: "Post - War World and India", slug: "post-war-world-and-india", topics: [] },
  { name: "Social Movements in Our Times", slug: "social-movements-in-our-times", topics: [] },
  { name: "The Movement for the Formation of Telangana State", slug: "the-movement-for-the-formation-of-telangana-state", topics: [] },
];
