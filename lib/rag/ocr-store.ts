// The production wiring of the OCR window store (see ocr-store-core.ts for what it does and how it is tested).
import "server-only";
import { storage } from "@/lib/storage";
import { createOcrStore } from "@/lib/rag/ocr-store-core";

const store = createOcrStore({ storage });

export const savedPages = store.savedPages;
export const verifySaved = store.verifySaved;
export const saveWindow = store.saveWindow;
export const readOcrState = store.readOcrState;
export const readOcrIdentity = store.readOcrIdentity;
export const deleteOcr = store.deleteOcr;
