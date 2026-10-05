// Source-grounded curriculum extraction for one specific board-specific subject:
// Telangana -> BSE Telangana -> Class 10 -> Telugu (SCERT Telangana e-textbook 10_TEL.pdf, the book uploaded for the demo school).
//
// Provenance - nothing here is invented, renamed or simplified:
//   * Chapters: the twelve numbered lessons (పాఠాలు) of the book's contents page "10వ తరగతి - విషయసూచిక" (printed page 1), in the
//     book's own numbering 1-12. The page was read as an image and cross-checked with an OCR reading of the same page.
//   * Each lesson's opening page was confirmed on the page itself (the numbered banner and title at the top of PDF pages 14, 25, 38,
//     48, 59, 68, 78, 89, 99, 107, 121 and 132).
//   * Names are the lesson titles only, as printed on the contents page, in Telugu (the poet/author, genre and month printed beside
//     each title are not part of the name). The supplementary reader "ఉపవాచకం: రామాయణం" and the "పదవిజ్ఞానం" vocabulary section
//     are separate parts of the book, not lessons, and are not imported as chapters.
// Chapters only: the contents page lists no topics, so none are created rather than guessing them. Slugs are ASCII transliterations
// used only as stable identifiers.
import type { CurriculumImportChapter } from "./telangana-bse-class8-mathematics";

export const TELANGANA_BSE_CLASS10_TELUGU: CurriculumImportChapter[] = [
  { name: "దానశీలము", slug: "lesson-01-danasheelamu", topics: [] },
  { name: "ఎవరి భాష వాళ్ళకు వినసొంపు", slug: "lesson-02-evari-bhasha-vallaku-vinasompu", topics: [] },
  { name: "వీర తెలంగాణ", slug: "lesson-03-veera-telangana", topics: [] },
  { name: "కొత్తబాట", slug: "lesson-04-kottabata", topics: [] },
  { name: "నగరగీతం", slug: "lesson-05-nagaragitam", topics: [] },
  { name: "భాగ్యోదయం", slug: "lesson-06-bhagyodayam", topics: [] },
  { name: "శతక మధురిమ", slug: "lesson-07-shataka-madhurima", topics: [] },
  { name: "లక్ష్యసిద్ధి", slug: "lesson-08-lakshyasiddhi", topics: [] },
  { name: "జీవనభాష్యం", slug: "lesson-09-jeevanabhashyam", topics: [] },
  { name: "గోలకొండ పట్టణము", slug: "lesson-10-golkonda-pattanamu", topics: [] },
  { name: "భిక్ష", slug: "lesson-11-bhiksha", topics: [] },
  { name: "భూమిక", slug: "lesson-12-bhumika", topics: [] },
];
