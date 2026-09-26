"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { GraduationCap, Check, ArrowLeft, ArrowRight, Loader2, DatabaseZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCurriculumSelect } from "@/lib/hooks/use-curriculum-select";
import { listSubjectsForClass } from "@/lib/actions/curriculum";
import { inputClass, labelClass } from "@/components/register/field-styles";

type Subject = Awaited<ReturnType<typeof listSubjectsForClass>>[number];

// State -> Board -> Class, sourced from the same real curriculum tables as
// /register/student (via useCurriculumSelect) - not a hardcoded board/grade
// list. This page is calibration only (it doesn't create or update an
// account); see RegisterStudentPage for the real, persisted enrollment flow.
const steps = ["State", "Board", "Class", "Subjects"];

export default function OnboardingPage() {
  const router = useRouter();
  const curriculum = useCurriculumSelect();
  const [step, setStep] = React.useState(0);
  const [availableSubjects, setAvailableSubjects] = React.useState<Subject[]>([]);
  const [subjectIds, setSubjectIds] = React.useState<string[]>([]);
  const [building, setBuilding] = React.useState(false);

  const currentStepName = steps[step];

  React.useEffect(() => {
    setSubjectIds([]);
    setAvailableSubjects([]);
    if (!curriculum.schoolClassId) return;
    listSubjectsForClass(curriculum.schoolClassId)
      .then(setAvailableSubjects)
      .catch(() => setAvailableSubjects([]));
  }, [curriculum.schoolClassId]);

  const canContinue =
    (currentStepName === "State" && Boolean(curriculum.stateId)) ||
    (currentStepName === "Board" && Boolean(curriculum.boardId)) ||
    (currentStepName === "Class" && Boolean(curriculum.schoolClassId)) ||
    (currentStepName === "Subjects" && subjectIds.length > 0);

  const goNext = () => {
    if (step < steps.length - 1) {
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

  const toggleSubject = (subjectId: string) => {
    setSubjectIds((prev) => (prev.includes(subjectId) ? prev.filter((s) => s !== subjectId) : [...prev, subjectId]));
  };

  const selectedBoard = curriculum.boards.find((b) => b.id === curriculum.boardId);
  const selectedClass = curriculum.schoolClasses.find((c) => c.id === curriculum.schoolClassId);

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
          Mapping {subjectIds.length} subject{subjectIds.length !== 1 ? "s" : ""} for {selectedClass?.label ?? "your class"}, {selectedBoard?.shortName ?? "your board"}.
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
          {steps.map((s, i) => (
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
              {i < steps.length - 1 && (
                <div className={cn("h-0.5 flex-1 rounded-full", i < step ? "bg-success-400" : "bg-gray-200 dark:bg-gray-800")} />
              )}
            </div>
          ))}
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-card dark:border-gray-800 dark:bg-gray-900 sm:p-8">
          {curriculum.unavailable && (
            <div className="mb-5 flex items-start gap-2 rounded-xl bg-gray-100 p-3 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <DatabaseZap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              State, board, and class options need a connected database and can&apos;t be loaded right now.
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStepName}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.25 }}
            >
              {currentStepName === "State" && (
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">Which state are you in?</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">This determines which boards are available to you.</p>

                  <div className="mt-6">
                    <label className={labelClass}>State</label>
                    <select
                      className={inputClass}
                      value={curriculum.stateId}
                      onChange={(e) => curriculum.setStateId(e.target.value)}
                      disabled={curriculum.unavailable}
                    >
                      <option value="">Select state</option>
                      {curriculum.states.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {currentStepName === "Board" && (
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">Select your board</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    National boards (CBSE, CISCE, NIOS) are available regardless of state; your state&apos;s own board is shown too.
                  </p>

                  <div className="mt-6">
                    <label className={labelClass}>Board</label>
                    <select
                      className={inputClass}
                      value={curriculum.boardId}
                      onChange={(e) => curriculum.setBoardId(e.target.value)}
                      disabled={!curriculum.stateId}
                    >
                      <option value="">Select board</option>
                      {curriculum.boards.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.shortName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {currentStepName === "Class" && (
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">Which class are you in?</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">This helps us calibrate lesson difficulty.</p>

                  <div className="mt-6">
                    <label className={labelClass}>Class</label>
                    <select
                      className={inputClass}
                      value={curriculum.schoolClassId}
                      onChange={(e) => curriculum.setSchoolClassId(e.target.value)}
                      disabled={!curriculum.boardId}
                    >
                      <option value="">Select class</option>
                      {curriculum.schoolClasses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    {curriculum.boardId && curriculum.schoolClasses.length === 0 && (
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        No classes are enabled for this board yet - an admin needs to enable them first.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {currentStepName === "Subjects" && (
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">Which subjects do you want to focus on?</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Pick as many as you like - you can change these later.</p>

                  <div className="mt-6 flex flex-wrap gap-2">
                    {availableSubjects.map((subject) => {
                      const selected = subjectIds.includes(subject.id);
                      return (
                        <button
                          key={subject.id}
                          onClick={() => toggleSubject(subject.id)}
                          className={cn(
                            "flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                            selected
                              ? "border-primary-500 bg-primary-600 text-white"
                              : "border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300"
                          )}
                        >
                          {selected && <Check className="h-3.5 w-3.5" />}
                          {subject.name}
                        </button>
                      );
                    })}
                    {availableSubjects.length === 0 && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No subjects are configured for this class yet.</p>
                    )}
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
            <Button onClick={goNext} disabled={!canContinue || curriculum.unavailable}>
              {step === steps.length - 1 ? "Build My Path" : "Continue"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
