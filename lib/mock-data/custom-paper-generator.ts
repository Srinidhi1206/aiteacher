import { Paper, PaperQuestion, PaperQuestionType } from "@/lib/types";

const typeCycle: PaperQuestionType[] = ["mcq", "fill-blank", "true-false", "short-answer"];

const stageLabel: Record<1 | 2 | 3 | 4, string> = {
  1: "Recall",
  2: "Understanding",
  3: "Application",
  4: "Analysis",
};

function buildQuestion(n: number, type: PaperQuestionType, bloomLevel: 1 | 2 | 3 | 4, topic: string, marks: number): PaperQuestion {
  const base = {
    id: `cq-${n}`,
    type,
    bloomLevel,
    marks,
    topic,
    explanation: `This is a ${stageLabel[bloomLevel].toLowerCase()}-level question generated for "${topic}". Review your topic notes on ${topic} for the exact reasoning steps.`,
    improvementTip: `Revisit the theory and worked examples for ${topic}, focusing on ${stageLabel[bloomLevel].toLowerCase()}-level practice.`,
  };

  if (type === "mcq") {
    return {
      ...base,
      prompt: `Which of the following best relates to a key idea in ${topic}?`,
      options: [`Core idea of ${topic}`, "An unrelated concept", "A common misconception", "None of the above"],
      correctAnswer: `Core idea of ${topic}`,
    };
  }
  if (type === "true-false") {
    return { ...base, prompt: `${topic} is a topic covered in your current syllabus.`, correctAnswer: "True" };
  }
  if (type === "fill-blank") {
    return { ...base, prompt: "The topic being tested in this question is ___.", correctAnswer: topic };
  }
  return {
    ...base,
    prompt: `In 2-3 sentences, explain the core idea behind ${topic} and why it matters.`,
    correctAnswer: topic,
  };
}

export function generateCustomPaper(config: {
  subject: string;
  topics: string[];
  numQuestions: number;
  totalMarks: number;
  durationMinutes: number;
  difficulty: "Easy" | "Medium" | "Hard" | "Mixed";
  bloomCounts: [number, number, number, number];
}): Paper {
  const { subject, topics, numQuestions, totalMarks, durationMinutes, difficulty, bloomCounts } = config;
  const topicPool = topics.length ? topics : [subject];
  const baseMarks = Math.max(1, Math.floor(totalMarks / Math.max(1, numQuestions)));
  let remainder = totalMarks - baseMarks * numQuestions;

  const questions: PaperQuestion[] = [];
  let qNum = 0;
  ([1, 2, 3, 4] as const).forEach((level) => {
    const count = bloomCounts[level - 1];
    for (let i = 0; i < count; i++) {
      qNum++;
      const topic = topicPool[qNum % topicPool.length];
      const type = typeCycle[qNum % typeCycle.length];
      const marks = baseMarks + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
      questions.push(buildQuestion(qNum, type, level, topic, marks));
    }
  });

  return {
    id: `custom-${Date.now()}`,
    title: `Custom Paper: ${subject} (${numQuestions}Q)`,
    type: "Chapter Test",
    subject,
    topics: topicPool,
    questionCount: questions.length,
    totalMarks: questions.reduce((s, q) => s + q.marks, 0),
    durationMinutes,
    difficulty,
    bloomDistribution: ([1, 2, 3, 4] as const).filter((l) => bloomCounts[l - 1] > 0).map((l) => ({ level: l, count: bloomCounts[l - 1] })),
    questions,
    isCustom: true,
  };
}
