"use server";

// Import ONE PDF from a public https URL as a study material (the "URL
// importer"). Deliberately narrow:
//   - a single direct PDF link, never crawling a site or following page links;
//   - admins/teachers only, checked BEFORE any network request is made;
//   - the school, board and curriculum placement go through createMaterial, so
//     the same school scoping, board check and file validation as a normal
//     upload apply - the importer adds no second path around them;
//   - the person importing must confirm they have the right to use the file
//     (the server enforces it, not just the checkbox), and the source address is
//     written to the audit log;
//   - the download itself is SSRF-hardened (lib/net/safe-fetch.ts);
//   - resources that need a sign-in or permission are refused with a message
//     pointing to a manual upload - nothing here tries to get around access
//     restrictions.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentSession, UnauthorizedError, ForbiddenError } from "@/lib/auth/current-session";
import { storage, safeFilename, StorageNotConfiguredError } from "@/lib/storage";
import { fetchPublicPdf, validateImportUrl, ImportError } from "@/lib/net/safe-fetch";
import { MaterialType } from "@prisma/client";
import { createMaterial, type ActionResult } from "./materials";

const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

const importInputSchema = z.object({
  url: z.string().trim().min(8).max(2000),
  rightsConfirmed: z.literal(true, { message: "Please confirm that you have the right to use this file." }),
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).optional(),
  materialType: z.nativeEnum(MaterialType),
  boardId: z.string().min(1, "Board is required"),
  schoolClassId: z.string().min(1, "Class is required"),
  subjectId: z.string().min(1, "Subject is required"),
  chapterId: z.string().min(1, "Chapter is required"),
  topicId: z.string().optional(),
});

// A small per-user brake so the importer can't be used to hammer other sites.
const recent = new Map<string, number[]>();
function allowImport(userId: string): boolean {
  const now = Date.now();
  const hits = (recent.get(userId) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  if (hits.length >= 6) return false;
  recent.set(userId, [...hits, now]);
  return true;
}

export async function importMaterialFromUrl(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getCurrentSession();
    if (!session) throw new UnauthorizedError();
    if (session.role !== "admin" && session.role !== "teacher") throw new ForbiddenError("Only admins and teachers can import study materials.");

    const parsed = importInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    const { url, rightsConfirmed: _confirmed, ...material } = parsed.data;
    void _confirmed;

    if (!storage.isConfigured) return { ok: false, error: "File storage is not configured." };
    // Malformed / disallowed addresses are refused before anything is counted or fetched.
    try {
      validateImportUrl(url);
    } catch (e) {
      return { ok: false, error: e instanceof ImportError ? e.message : "Enter a valid web address." };
    }
    if (!allowImport(session.id)) return { ok: false, error: "You have imported several files recently. Please wait a few minutes and try again." };

    let downloaded;
    try {
      downloaded = await fetchPublicPdf(url, { maxBytes: MAX_IMPORT_BYTES });
    } catch (e) {
      if (e instanceof ImportError) return { ok: false, error: e.message };
      return { ok: false, error: "Could not download that file." };
    }

    const urlName = decodeURIComponent(new URL(downloaded.finalUrl).pathname.split("/").filter(Boolean).pop() ?? "");
    const fileName = safeFilename(/\.pdf$/i.test(urlName) ? urlName : `${material.title}.pdf`);

    let stored;
    try {
      stored = await storage.upload({
        file: new File([new Uint8Array(downloaded.bytes)], fileName, { type: "application/pdf" }),
        pathname: `materials/${material.schoolClassId}/${material.subjectId}/${Date.now()}-${fileName}`,
        contentType: "application/pdf",
      });
    } catch (e) {
      if (e instanceof StorageNotConfiguredError) return { ok: false, error: e.message };
      return { ok: false, error: "Could not store the downloaded file." };
    }

    // All school/board/curriculum authorization happens here, exactly as for a manual upload.
    const created = await createMaterial(material, { storageKey: stored.storageKey, fileName });
    if (!created.ok || !created.data) {
      await storage.delete(stored.storageKey).catch(() => {}); // don't leave an orphaned file behind
      return { ok: false, error: created.error ?? "Could not save the material." };
    }

    await prisma.auditLog.create({
      data: {
        userId: session.id,
        action: "MATERIAL_UPLOAD",
        resource: `StudyMaterial:${created.data.id}`,
        message: `Imported "${material.title}" from ${downloaded.finalUrl} (rights confirmed by uploader)`,
      },
    });
    return { ok: true, data: { id: created.data.id } };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}
