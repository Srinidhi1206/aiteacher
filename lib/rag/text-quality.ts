// Is a PDF's extracted text real text? Some PDFs (older Indian-language textbooks especially) carry a "text layer" in a
// legacy font encoding: it extracts as a stream of accented Latin letters, symbols and private-use characters that look
// nothing like the words printed on the page. Embedding that would put gibberish in front of the AI Tutor, so such a
// file is refused with a plain explanation instead of being indexed. Measured on the SCERT Class 10 books: the English-
// medium books are 0.3-1.4% such characters; the legacy-font Hindi book is 44%.

/** Characters that real running text (English, or Unicode Indic scripts) almost never contains in bulk. */
const ODD = /[\u0080-\u00FF\u2000-\u2BFF\uE000-\uF8FF]/g;

/** At or above this share of such characters, the text layer is treated as unreadable. */
export const UNREADABLE_TEXT_RATIO = 0.1;
const MIN_CHARS = 200;

export interface TextLayerQuality {
  readable: boolean;
  /** Share of non-space characters that are legacy-encoding symbols (0-1). */
  oddRatio: number;
}

export function assessTextLayer(pages: string[]): TextLayerQuality {
  let total = 0;
  let odd = 0;
  for (const page of pages) {
    const compact = (page ?? "").replace(/\s+/g, "");
    total += compact.length;
    odd += compact.match(ODD)?.length ?? 0;
  }
  if (total < MIN_CHARS) return { readable: true, oddRatio: 0 }; // too little text to judge; the "no text" check handles it
  const oddRatio = odd / total;
  return { readable: oddRatio < UNREADABLE_TEXT_RATIO, oddRatio };
}

export const UNREADABLE_TEXT_MESSAGE =
  "This PDF's text uses an old font encoding, so what the computer reads is not the words printed on the page. It was not indexed, because the AI Tutor would be given gibberish. Use a copy with a proper text layer, or one that has been through OCR.";
