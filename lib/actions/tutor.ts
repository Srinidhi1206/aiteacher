"use server";

// AI Tutor conversation actions (Stage G). Every action re-derives the
// student from the session and re-checks conversation ownership itself -
// never trusts a conversationId supplied by the client beyond using it to
// filter a query that also filters by the caller's own studentId. A
// student can never reach another student's conversation by changing an
// ID: every lookup is `{ id, studentId: <from session> }`, so a mismatched
// ID simply finds nothing, exactly as if it didn't exist - see
// docs/STEP_3_5.md "Stage G detail" for the full walkthrough.
import { prisma } from "@/lib/prisma";
import { requireRole, ForbiddenError, UnauthorizedError } from "@/lib/auth/current-session";
import { AIError, getAIProvider, getPromptTemplate, interpolate, buildStudentContext } from "@/lib/ai";
import { checkTutorRateLimit } from "@/lib/ai/rate-limit";
import type { AIChatMessage, AIStudentContext } from "@/lib/ai/types";
import type { ActionResult } from "./materials";

const MAX_MESSAGE_LENGTH = 4000;
const MAX_MESSAGES_PER_CONVERSATION = 200; // forces starting a fresh conversation past this, keeping any one thread bounded
const MAX_HISTORY_MESSAGES = 20; // how many prior turns are sent to the provider - bounded, not the full transcript
const NEW_CONVERSATION_TITLE = "New conversation";
const WEAK_MASTERY_THRESHOLD = 50;

async function requireOwnStudentId(): Promise<string> {
  const session = await requireRole("student");
  const student = await prisma.student.findUnique({ where: { userId: session.id } });
  if (!student) throw new ForbiddenError("Student profile not found.");
  return student.id;
}

function toActionError(err: unknown): { ok: false; error: string } {
  if (err instanceof AIError) return { ok: false, error: err.message };
  if (err instanceof UnauthorizedError || err instanceof ForbiddenError) return { ok: false, error: err.message };
  throw err;
}

function deriveTitle(firstMessage: string): string {
  const trimmed = firstMessage.trim().replace(/\s+/g, " ");
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed || NEW_CONVERSATION_TITLE;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Cheap, DB-free check the UI calls up front to show the "AI Tutor is not
 * configured yet" state immediately, rather than only discovering it after
 * a student tries to send a first message.
 */
export async function getAITutorStatus(): Promise<{ configured: boolean }> {
  await requireOwnStudentId();
  return { configured: getAIProvider() !== null };
}

/** The signed-in student's own board/class, so the client can drive the
 * existing curriculum selectors (lib/actions/curriculum.ts) without ever
 * needing to know or trust a studentId itself. */
export async function getMyCurriculumScope(): Promise<{ boardId: string | null; schoolClassId: string | null }> {
  const session = await requireRole("student");
  const student = await prisma.student.findUnique({ where: { userId: session.id } });
  if (!student) throw new ForbiddenError("Student profile not found.");
  return { boardId: student.boardId, schoolClassId: student.schoolClassId };
}

export async function listMyConversations() {
  const studentId = await requireOwnStudentId();
  return prisma.aIConversation.findMany({
    where: { studentId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, subject: true, createdAt: true, updatedAt: true },
  });
}

export async function getMyConversation(conversationId: string) {
  const studentId = await requireOwnStudentId();
  // Ownership is structural: a conversation belonging to another student
  // simply doesn't match this WHERE clause, so this returns null exactly
  // as if the ID didn't exist at all - never a different error that would
  // let someone distinguish "not mine" from "doesn't exist."
  const conversation = await prisma.aIConversation.findFirst({ where: { id: conversationId, studentId } });
  if (!conversation) return null;
  const messages = await prisma.aIMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });
  return { conversation, messages };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createConversation(topicId?: string): Promise<ActionResult<{ id: string; title: string }>> {
  try {
    const studentId = await requireOwnStudentId();
    // topicId is optional enrichment, not a trust boundary - an unknown or
    // garbage topicId just results in no curriculum context being attached
    // (buildStudentContext resolves it defensively), never an error.
    const context = await buildStudentContext(studentId, topicId);

    const conversation = await prisma.aIConversation.create({
      data: {
        studentId,
        title: NEW_CONVERSATION_TITLE,
        subject: context.curriculum?.subject,
        contextSnapshot: context as object,
      },
    });
    return { ok: true, data: { id: conversation.id, title: conversation.title } };
  } catch (err) {
    return toActionError(err);
  }
}

export async function deleteConversation(conversationId: string): Promise<ActionResult> {
  try {
    const studentId = await requireOwnStudentId();
    const { count } = await prisma.aIConversation.deleteMany({ where: { id: conversationId, studentId } });
    if (count === 0) return { ok: false, error: "That conversation doesn't exist." };
    return { ok: true };
  } catch (err) {
    return toActionError(err);
  }
}

async function buildSystemPrompt(contextSnapshot: unknown): Promise<string> {
  const context = (contextSnapshot ?? {}) as AIStudentContext;
  let system = await getPromptTemplate("TUTOR_SYSTEM");
  const masteryPct = context.performance?.masteryPct;
  if (masteryPct !== undefined && masteryPct < WEAK_MASTERY_THRESHOLD) {
    const weakAreaNote = interpolate(await getPromptTemplate("TUTOR_WEAK_AREA"), { masteryPct });
    system = `${system}\n\n${weakAreaNote}`;
  }
  return system;
}

/**
 * Sends a student message and generates the tutor's reply. Follows the
 * required sequence exactly: authenticate -> verify ownership -> validate
 * message -> persist user message -> build context -> call provider ->
 * validate response -> persist assistant message -> return. If generation
 * fails at any point after the user message is persisted, that message is
 * NOT rolled back (so nothing the student typed is ever lost) and no
 * assistant message is fabricated - the caller gets a typed error and can
 * retry via retryLastReply below.
 */
export async function sendMessage(conversationId: string, content: string): Promise<ActionResult<{ id: string; content: string; createdAt: Date }>> {
  try {
    const studentId = await requireOwnStudentId();

    const conversation = await prisma.aIConversation.findFirst({ where: { id: conversationId, studentId } });
    if (!conversation) throw new AIError("CONVERSATION_NOT_FOUND");

    const trimmed = content.trim();
    if (!trimmed) throw new AIError("AI_INVALID_REQUEST", "Message can't be empty.");
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      throw new AIError("AI_INVALID_REQUEST", `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).`);
    }

    const messageCount = await prisma.aIMessage.count({ where: { conversationId } });
    if (messageCount >= MAX_MESSAGES_PER_CONVERSATION) {
      throw new AIError("AI_INVALID_REQUEST", "This conversation has reached its length limit - please start a new conversation.");
    }

    checkTutorRateLimit(studentId);

    await prisma.aIMessage.create({ data: { conversationId, role: "STUDENT", content: trimmed } });

    if (conversation.title === NEW_CONVERSATION_TITLE) {
      await prisma.aIConversation.update({ where: { id: conversation.id }, data: { title: deriveTitle(trimmed) } });
    }

    return await generateAndPersistReply(conversation.id, conversation.contextSnapshot);
  } catch (err) {
    return toActionError(err);
  }
}

/**
 * Re-attempts generation for a conversation whose last turn is a student
 * message with no reply yet (i.e. the previous sendMessage's generation
 * step failed). Does not persist a new user message - only retries the
 * assistant reply, so retrying never duplicates what the student typed.
 */
export async function retryLastReply(conversationId: string): Promise<ActionResult<{ id: string; content: string; createdAt: Date }>> {
  try {
    const studentId = await requireOwnStudentId();
    const conversation = await prisma.aIConversation.findFirst({ where: { id: conversationId, studentId } });
    if (!conversation) throw new AIError("CONVERSATION_NOT_FOUND");

    const lastMessage = await prisma.aIMessage.findFirst({ where: { conversationId }, orderBy: { createdAt: "desc" } });
    if (!lastMessage || lastMessage.role !== "STUDENT") {
      throw new AIError("AI_INVALID_REQUEST", "There's nothing to retry.");
    }

    checkTutorRateLimit(studentId);
    return await generateAndPersistReply(conversation.id, conversation.contextSnapshot);
  } catch (err) {
    return toActionError(err);
  }
}

async function generateAndPersistReply(
  conversationId: string,
  contextSnapshot: unknown
): Promise<ActionResult<{ id: string; content: string; createdAt: Date }>> {
  const provider = getAIProvider();
  if (!provider) throw new AIError("AI_NOT_CONFIGURED");

  const priorMessages = await prisma.aIMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORY_MESSAGES + 1, // +1 because the just-persisted user message is included
  });
  const ordered = priorMessages.reverse();
  const lastUserMessage = ordered[ordered.length - 1];
  const history: AIChatMessage[] = ordered.slice(0, -1).map((m) => ({
    role: m.role === "AI" ? "assistant" : "user",
    content: m.content,
  }));

  const systemPrompt = await buildSystemPrompt(contextSnapshot);

  let result;
  try {
    result = await provider.generateResponse({
      systemPrompt,
      messages: history,
      userMessage: lastUserMessage.content,
      studentContext: (contextSnapshot ?? undefined) as AIStudentContext | undefined,
    });
  } catch (err) {
    if (err instanceof AIError) throw err;
    throw new AIError("AI_PROVIDER_ERROR");
  }

  const replyText = result.content.trim();
  if (!replyText) throw new AIError("AI_PROVIDER_ERROR", "The AI tutor returned an empty response.");

  const assistantMessage = await prisma.aIMessage.create({
    data: { conversationId, role: "AI", content: replyText },
  });
  // Bump updatedAt so the sidebar's "most recent" ordering reflects the
  // reply, not just the user's turn.
  await prisma.aIConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

  return { ok: true, data: { id: assistantMessage.id, content: assistantMessage.content, createdAt: assistantMessage.createdAt } };
}
