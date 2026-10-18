// The words the Study Plan page and the dashboard use about ticking a task. A tick is the student's OWN record - nothing checks it - so it is called that everywhere,
// and the page says what the real evidence of learning is. Kept in one place so the two screens and the tests cannot drift apart.
export const MARK_DONE_LABEL = "Mark as done (your own check)";
export const MARK_NOT_DONE_LABEL = "Mark as not done";
export const MARKED_DONE_BADGE = "Marked done";
/**
 * The accessible name of a tick button: the action it will take AND the task it is for ("Mark as done (your own check): Study: Polynomials"). The name changes with the state, so
 * the button must NOT also carry aria-pressed - a screen reader would announce the state twice ("Mark as not done, pressed").
 */
export const tickLabel = (completed: boolean, taskTitle: string) => `${completed ? MARK_NOT_DONE_LABEL : MARK_DONE_LABEL}: ${taskTitle}`;
export const TICK_HELPER_TEXT = "Ticks are your own record - tick a task when you have finished it. Your mastery and weak areas come from exams and practice, not from ticks. A chapter you tick is planned again for revision the next time you generate your plan.";
export const markedDoneCount = (done: number, total: number) => `${done} of ${total} marked done by you`;
