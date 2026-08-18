"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { GraduationCap, Check, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const gradeStages = [
  { id: "Primary", label: "Primary", grades: ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5"] },
  { id: "Middle School", label: "Middle School", grades: ["Class 6", "Class 7", "Class 8"] },
  { id: "High School", label: "High School", grades: ["Class 9", "Class 10", "Class 11", "Class 12"] },
  { id: "College", label: "College", grades: ["1st Year", "2nd Year"] },
  { id: "University", label: "University", grades: ["Undergraduate", "Postgraduate"] },
];

const curricula = ["CBSE", "ICSE", "State Board", "IB", "IGCSE", "University"];

const boardsByCurriculum: Record<string, string[]> = {
  "State Board": ["Maharashtra State Board", "Karnataka State Board", "Tamil Nadu State Board", "UP State Board", "West Bengal Board"],
  IB: ["PYP (Primary Years)", "MYP (Middle Years)", "DP (Diploma Programme)"],
};

const allSubjects = [
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "English",
  "Computer Science",
  "Economics",
  "History",
  "Geography",
  "Political Science",
  "Accountancy",
  "Business Studies",
];

const steps = ["Grade", "Curriculum", "Board", "Subjects"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [gradeStage, setGradeStage] = React.useState<string | null>(null);
  const [grade, setGrade] = React.useState<string | null>(null);
  const [curriculum, setCurriculum] = React.useState<string | null>(null);
  const [board, setBoard] = React.useState<string | null>(null);
  const [subjects, setSubjects] = React.useState<string[]>([]);
  const [building, setBuilding] = React.useState(false);

  const needsBoardStep = curriculum ? Boolean(boardsByCurriculum[curriculum]) : false;
  const effectiveSteps = needsBoardStep ? steps : steps.filter((s) => s !== "Board");
  const currentStepName = effectiveSteps[step];

  const canContinue =
    (currentStepName === "Grade" && Boolean(gradeStage && grade)) ||
    (currentStepName === "Curriculum" && Boolean(curriculum)) ||
    (currentStepName === "Board" && Boolean(board)) ||
    (currentStepName === "Subjects" && subjects.length > 0);

  const goNext = () => {
    if (step < effectiveSteps.length - 1) {
      setStep(step + 1);
    } else {
      setBuilding(true);
      setTimeout(() => {
        router.push("/dashboard");
      }, 2600);
    }
  };

  const goBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const toggleSubject = (subject: string) => {
    setSubjects((prev) => (prev.includes(subject) ? prev.filter((s) => s !== subject) : [...prev, subject]));
  };

  if (building) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-primary-50 via-white to-white px-4 text-center dark:from-primary-950/30 dark:via-gray-950 dark:to-gray-950">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-card"
        >
          <Loader2 className="h-8 w-8" />
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 text-2xl font-bold text-gray-900 dark:text-gray-50"
        >
          Building your personalized learning path...
        </motion.h2>
        <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
          Mapping {subjects.length} subject{subjects.length !== 1 ? "s" : ""} across Bloom&apos;s taxonomy for {grade}, {curriculum}.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-950">
      <header className="flex items-center justify-center gap-2 py-8">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-white">
          <GraduationCap className="h-5 w-5" />
        </div>
        <span className="text-lg font-bold text-gray-900 dark:text-gray-50">mAITeacher</span>
      </header>

      <div className="mx-auto w-full max-w-xl flex-1 px-4 pb-16">
        <div className="mb-8 flex items-center gap-2">
          {effectiveSteps.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-2">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                  i < step
                    ? "bg-success-500 text-white"
                    : i === step
                    ? "bg-primary-600 text-white"
                    : "bg-gray-200 text-gray-400 dark:bg-gray-800"
                )}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < effectiveSteps.length - 1 && (
                <div className={cn("h-0.5 flex-1 rounded-full", i < step ? "bg-success-400" : "bg-gray-200 dark:bg-gray-800")} />
              )}
            </div>
          ))}
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-card dark:border-gray-800 dark:bg-gray-900 sm:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStepName}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.25 }}
            >
              {currentStepName === "Grade" && (
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">What grade are you in?</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">This helps us calibrate lesson difficulty.</p>

                  <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {gradeStages.map((stage) => (
                      <button
                        key={stage.id}
                        onClick={() => {
                          setGradeStage(stage.id);
                          setGrade(null);
                        }}
                        className={cn(
                          "rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                          gradeStage === stage.id
                            ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300"
                            : "border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300"
                        )}
                      >
                        {stage.label}
                      </button>
                    ))}
                  </div>

                  {gradeStage && (
                    <div className="mt-5">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Select your grade</p>
                      <div className="flex flex-wrap gap-2">
                        {gradeStages
                          .find((s) => s.id === gradeStage)!
                          .grades.map((g) => (
                            <button
                              key={g}
                              onClick={() => setGrade(g)}
                              className={cn(
                                "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                                grade === g
                                  ? "border-primary-500 bg-primary-600 text-white"
                                  : "border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300"
                              )}
                            >
                              {g}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {currentStepName === "Curriculum" && (
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">Which curriculum do you follow?</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">We&apos;ll tailor your syllabus mapping accordingly.</p>

                  <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {curricula.map((c) => (
                      <button
                        key={c}
                        onClick={() => {
                          setCurriculum(c);
                          setBoard(null);
                        }}
                        className={cn(
                          "rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                          curriculum === c
                            ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300"
                            : "border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300"
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {currentStepName === "Board" && (
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">
                    Select your {curriculum === "IB" ? "programme" : "board"}
                  </h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    This lets us match your exact exam pattern.
                  </p>

                  <div className="mt-6 flex flex-col gap-2">
                    {(boardsByCurriculum[curriculum ?? ""] ?? []).map((b) => (
                      <button
                        key={b}
                        onClick={() => setBoard(b)}
                        className={cn(
                          "rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors",
                          board === b
                            ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300"
                            : "border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300"
                        )}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {currentStepName === "Subjects" && (
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">Which subjects do you want to focus on?</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Pick as many as you like - you can change these later.</p>

                  <div className="mt-6 flex flex-wrap gap-2">
                    {allSubjects.map((subject) => {
                      const selected = subjects.includes(subject);
                      return (
                        <button
                          key={subject}
                          onClick={() => toggleSubject(subject)}
                          className={cn(
                            "flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                            selected
                              ? "border-primary-500 bg-primary-600 text-white"
                              : "border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300"
                          )}
                        >
                          {selected && <Check className="h-3.5 w-3.5" />}
                          {subject}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" onClick={goBack} disabled={step === 0}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button onClick={goNext} disabled={!canContinue}>
              {step === effectiveSteps.length - 1 ? "Build My Path" : "Continue"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
