// Source-grounded curriculum extraction for one specific board-specific subject:
// Telangana -> BSE Telangana -> Class 10 -> Hindi (second language; SCERT Telangana e-textbook 10_HIN(SL).pdf).
//
// Provenance - nothing here is invented, renamed or simplified:
//   * Chapters: the twelve numbered lessons of the contents page "विषय सूची" (printed page vii), in the book's own
//     numbering 1-12, under its four units (इकाई I-IV). The contents page was read as an IMAGE of the page - the PDF's
//     text layer uses a legacy font and is unreadable as text - and the 2018-19 impression and the 2020-21 edition
//     show an identical list of lessons.
//   * Names are the lesson titles only (the genre and author printed beside each title on the contents page are not
//     part of the name). Titles are stored exactly as printed, in Devanagari.
//   * The unnumbered supplementary items under some lessons (reading pieces marked "पठन हेतु", and the starred
//     "उपवाचक" readers) belong to their lesson and are not separate chapters.
// Chapters only: the book lists no topics, so none are created rather than guessing them. Slugs are ASCII transliterations
// used only as stable identifiers.
import type { CurriculumImportChapter } from "./telangana-bse-class8-mathematics";

export const TELANGANA_BSE_CLASS10_HINDI: CurriculumImportChapter[] = [
  { name: "बरसते बादल", slug: "lesson-01-barasate-badal", topics: [] },
  { name: "ईदगाह", slug: "lesson-02-idgah", topics: [] },
  { name: "माँ मुझे आने दे!", slug: "lesson-03-maa-mujhe-aane-de", topics: [] },
  { name: "कण-कण का अधिकारी", slug: "lesson-04-kan-kan-ka-adhikari", topics: [] },
  { name: "लोकगीत", slug: "lesson-05-lokgeet", topics: [] },
  { name: "अंतर्राष्ट्रीय स्तर पर हिंदी", slug: "lesson-06-antarrashtriya-star-par-hindi", topics: [] },
  { name: "भक्ति पद", slug: "lesson-07-bhakti-pad", topics: [] },
  { name: "स्वराज्य की नींव", slug: "lesson-08-swarajya-ki-neenv", topics: [] },
  { name: "दक्षिणी गंगा गोदावरी", slug: "lesson-09-dakshini-ganga-godavari", topics: [] },
  { name: "नीति दोहे", slug: "lesson-10-neeti-dohe", topics: [] },
  { name: "जल ही जीवन है", slug: "lesson-11-jal-hi-jeevan-hai", topics: [] },
  { name: "धरती के सवाल अंतरिक्ष के ज़वाब", slug: "lesson-12-dharti-ke-sawal-antariksh-ke-jawab", topics: [] },
];
