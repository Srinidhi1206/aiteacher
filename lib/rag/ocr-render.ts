// Renders PDF pages to PNG images for the OCR reader. PDFium (WebAssembly, bundled inside the package - no native binary, no file
// path to trace) draws what is actually on the page, so a broken or missing text layer, or an encrypted-but-openable file, does not
// matter. One document is opened once and many pages are drawn from it.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

/** 2x = about 144 dpi: small Telugu / Devanagari conjuncts stay legible while a page is still ~1 MB. */
const RENDER_SCALE = 2;

export interface PageRenderer {
  pageCount: number;
  /** 1-based page number. */
  renderPng(page: number): Promise<Uint8Array>;
  close(): void;
}

// The WebAssembly file ships inside the package. next.config.mjs lists it in outputFileTracingIncludes so it is deployed with the
// server code; it is read from there and handed to the library, which then needs no file-path guessing of its own.
function loadWasm(): ArrayBuffer {
  const file = path.join(process.cwd(), "node_modules", "@hyzyla", "pdfium", "dist", "pdfium.wasm");
  const buf = fs.readFileSync(file);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export async function openPageRenderer(pdf: Uint8Array): Promise<PageRenderer> {
  const { PDFiumLibrary } = await import("@hyzyla/pdfium");
  const library = await PDFiumLibrary.init({ wasmBinary: loadWasm() });
  let doc;
  try {
    doc = await library.loadDocument(pdf);
  } catch (e) {
    library.destroy();
    throw e;
  }
  return {
    pageCount: doc.getPageCount(),
    async renderPng(page: number) {
      const image = await doc.getPage(page - 1).render({ scale: RENDER_SCALE, render: "bitmap" });
      const png = new PNG({ width: image.width, height: image.height });
      const src = image.data;
      for (let i = 0; i < src.length; i += 4) {
        png.data[i] = src[i + 2]; // PDFium gives BGRA
        png.data[i + 1] = src[i + 1];
        png.data[i + 2] = src[i];
        png.data[i + 3] = 255;
      }
      return PNG.sync.write(png);
    },
    close() {
      doc.destroy();
      library.destroy();
    },
  };
}
