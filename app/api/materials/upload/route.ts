import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCurrentSession } from "@/lib/auth/current-session";
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from "@/lib/storage";
import { isStorageBreakerOpen } from "@/lib/storage/blocked";
import { STORAGE_BLOCKED_MESSAGE } from "@/lib/storage/stop-messages";

// Issues short-lived client-upload tokens so the browser can send a study
// material's bytes straight to Vercel Blob, never through this (or any)
// Server Action/route body - see lib/actions/materials.ts's createMaterial
// for why that mattered (Next's Server Action body limit and Vercel's
// serverless request body limit are both far smaller than a real textbook
// PDF). This route only ever hands out a constrained token; the actual
// StudyMaterial row is created afterward by createMaterial, which
// independently re-verifies the upload via storage.getMetadata() rather
// than trusting anything the client claims.
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Storage is already known to be blocked on this instance: say so now instead of letting the browser start a large upload that cannot succeed.
  if (isStorageBreakerOpen()) return NextResponse.json({ error: STORAGE_BLOCKED_MESSAGE }, { status: 503 });
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const session = await getCurrentSession();
        if (!session || (session.role !== "admin" && session.role !== "teacher")) {
          throw new Error("Only admins and teachers can upload study materials.");
        }
        return {
          allowedContentTypes: [...ALLOWED_MIME_TYPES],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
        };
      },
      // Required by handleUpload's type, but createMaterial (called by the
      // client immediately after upload() resolves) is what actually writes
      // the StudyMaterial row - this callback runs unauthenticated (Vercel
      // calls it server-to-server, with no user session attached), so it
      // must never be the place that creates authorized, curriculum-scoped
      // data.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload authorization failed." }, { status: 400 });
  }
}
