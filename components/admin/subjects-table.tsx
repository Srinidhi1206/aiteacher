"use client";
// Real Board -> Class -> Subject -> Chapter -> Topic curriculum manager,
// replacing the old static mock table. Client component fetching via
// server actions directly (same pattern as study-materials-card.tsx /
// exam-schedule-card.tsx), living inside AdminTabs' client boundary.
import * as React from "react";
import { BookOpen, ChevronRight, Pencil, Trash2, Plus, ArrowUp, ArrowDown, GitFork, Eye, EyeOff } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { inputClass, labelClass } from "@/components/register/field-styles";
import { listStates, listBoards, listSchoolClasses, listClassSubjectLinks, listChaptersForSubject } from "@/lib/actions/curriculum";
import {
  createBoardSpecificSubject,
  createClassSubject,
  setClassSubjectEnabled,
  updateSubjectVariant,
  createChapter,
  updateChapter,
  deleteChapter,
  reorderChapters,
  createTopic,
  updateTopic,
  deleteTopic,
  reorderTopics,
  bulkImportCurriculum,
} from "@/lib/actions/curriculum-admin";
import { findCurriculumImport, countTopics } from "@/lib/curriculum-import-data";
import { getMyAdminStatus } from "@/lib/actions/user-management";

type State = Awaited<ReturnType<typeof listStates>>[number];
type Board = Awaited<ReturnType<typeof listBoards>>[number];
type SchoolClass = Awaited<ReturnType<typeof listSchoolClasses>>[number];
type SubjectRow = Awaited<ReturnType<typeof listClassSubjectLinks>>[number];
type ChapterRow = Awaited<ReturnType<typeof listChaptersForSubject>>[number];
type TopicRow = ChapterRow["topics"][number];

const BLOOM_LEVELS = ["REMEMBER", "UNDERSTAND", "APPLY", "ANALYZE"] as const;

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function SubjectsTable() {
  const { showToast } = useToast();

  const [states, setStates] = React.useState<State[]>([]);
  const [boards, setBoards] = React.useState<Board[]>([]);
  const [classes, setClasses] = React.useState<SchoolClass[]>([]);
  const [stateId, setStateId] = React.useState("");
  const [boardId, setBoardId] = React.useState("");
  const [schoolClassId, setSchoolClassId] = React.useState("");
  const [dbUnavailable, setDbUnavailable] = React.useState(false);
  // Display only - the server (curriculum-admin.ts) is what actually enforces
  // who may edit which board; this just explains it before the click.
  const [me, setMe] = React.useState<Awaited<ReturnType<typeof getMyAdminStatus>>>(null);

  const [subjects, setSubjects] = React.useState<SubjectRow[] | null>(null);
  const [subjectId, setSubjectId] = React.useState("");
  const [forkingSubjectId, setForkingSubjectId] = React.useState<string | null>(null);

  const [chapters, setChapters] = React.useState<ChapterRow[] | null>(null);
  const [chapterId, setChapterId] = React.useState("");
  const [subjectEditName, setSubjectEditName] = React.useState<string | null>(null);
  const [chapterForm, setChapterForm] = React.useState<{ id: string | null; name: string; slug: string } | null>(null);
  const [topicForm, setTopicForm] = React.useState<{ id: string | null; name: string; slug: string; bloomLevel: (typeof BLOOM_LEVELS)[number] } | null>(null);

  React.useEffect(() => {
    listStates().then(setStates).catch(() => setDbUnavailable(true));
    getMyAdminStatus().then(setMe).catch(() => setMe(null));
  }, []);

  // Curriculum is global, so only the super admin sees any editing controls; the server enforces the same rule.
  const canWrite = me?.isSuperAdmin === true;
  const readOnlyReason: string | null =
    !me || me.isSuperAdmin ? null : "Curriculum is shared by every school, so only the super administrator can change it. You can view it here.";

  React.useEffect(() => {
    setBoardId("");
    setBoards([]);
    if (!stateId) return;
    listBoards(stateId).then(setBoards).catch(() => setDbUnavailable(true));
  }, [stateId]);

  React.useEffect(() => {
    setSchoolClassId("");
    setClasses([]);
    if (!boardId) return;
    listSchoolClasses(boardId).then(setClasses).catch(() => setDbUnavailable(true));
  }, [boardId]);

  const refreshSubjects = React.useCallback(() => {
    if (!schoolClassId) {
      setSubjects(null);
      return;
    }
    listClassSubjectLinks(schoolClassId)
      .then(setSubjects)
      .catch(() => setDbUnavailable(true));
  }, [schoolClassId]);

  React.useEffect(() => {
    setSubjectId("");
    setChapters(null);
    refreshSubjects();
  }, [schoolClassId, refreshSubjects]);

  const refreshChapters = React.useCallback(() => {
    if (!subjectId) {
      setChapters(null);
      return;
    }
    listChaptersForSubject(subjectId)
      .then(setChapters)
      .catch(() => setDbUnavailable(true));
  }, [subjectId]);

  React.useEffect(() => {
    setChapterId("");
    refreshChapters();
  }, [subjectId, refreshChapters]);

  const selectedClass = classes.find((c) => c.id === schoolClassId);
  const selectedSubject = subjects?.find((s) => s.id === subjectId);
  const selectedChapter = chapters?.find((c) => c.id === chapterId);
  const selectedBoard = boards.find((b) => b.id === boardId);

  // Offered only for the exact board + grade + subject an approved, source-grounded extraction was built for
  // (see lib/curriculum-import-data/index.ts) - never reachable from an unrelated subject.
  const [importing, setImporting] = React.useState(false);
  const importDefinition = selectedSubject?.boardId ? findCurriculumImport(selectedBoard?.shortName, selectedClass?.grade, selectedSubject.slug) : null;
  const canImportApprovedCurriculum = importDefinition !== null;

  async function handleBulkImport() {
    if (!subjectId || !importDefinition) return;
    setImporting(true);
    const result = await bulkImportCurriculum({ subjectId, chapters: importDefinition.chapters });
    setImporting(false);
    if (!result.ok) {
      showToast("Import failed", result.error ?? "");
      return;
    }
    const d = result.data!;
    showToast(
      "Curriculum imported",
      `${d.chaptersCreated} ${importDefinition.chapterNoun} created, ${d.chaptersReused} already existed, ${d.topicsCreated} ${importDefinition.topicNoun} created, ${d.topicsReused} already existed.`
    );
    refreshChapters();
  }

  async function handleFork(genericSubjectId: string) {
    if (!schoolClassId) return;
    setForkingSubjectId(genericSubjectId);
    const result = await createBoardSpecificSubject({ schoolClassId, genericSubjectId });
    setForkingSubjectId(null);
    if (!result.ok) {
      showToast("Could not create board-specific subject", result.error ?? "");
      return;
    }
    showToast("Board-specific subject created", "You can now add chapters just for this class.");
    refreshSubjects();
    if (result.data) setSubjectId(result.data.subjectId);
  }

  const [subjectToggling, setSubjectToggling] = React.useState<string | null>(null);
  const [addSubjectForm, setAddSubjectForm] = React.useState<{ name: string; slug: string } | null>(null);

  async function handleToggleSubject(subject: SubjectRow) {
    if (!schoolClassId) return;
    setSubjectToggling(subject.id);
    const result = await setClassSubjectEnabled(schoolClassId, subject.id, !subject.isEnabled);
    setSubjectToggling(null);
    if (!result.ok) {
      showToast("Could not update subject", result.error ?? "");
      return;
    }
    showToast(subject.isEnabled ? `"${subject.name}" hidden for this class` : `"${subject.name}" shown for this class`);
    refreshSubjects();
  }

  async function handleAddSubject() {
    if (!addSubjectForm || !schoolClassId) return;
    const result = await createClassSubject({ schoolClassId, name: addSubjectForm.name, slug: addSubjectForm.slug });
    if (!result.ok) {
      showToast("Could not add subject", result.error ?? "");
      return;
    }
    showToast("Subject added to this class", "You can now add its chapters.");
    setAddSubjectForm(null);
    refreshSubjects();
    if (result.data) setSubjectId(result.data.subjectId);
  }

  async function handleSaveSubjectName() {
    if (!subjectId || subjectEditName === null) return;
    const result = await updateSubjectVariant(subjectId, { name: subjectEditName });
    if (!result.ok) {
      showToast("Could not rename subject", result.error ?? "");
      return;
    }
    showToast("Subject renamed");
    setSubjectEditName(null);
    refreshSubjects();
  }

  async function handleSaveChapter() {
    if (!chapterForm || !subjectId) return;
    const input = { name: chapterForm.name, slug: chapterForm.slug };
    const result = chapterForm.id ? await updateChapter(chapterForm.id, input) : await createChapter(subjectId, input);
    if (!result.ok) {
      showToast("Could not save chapter", result.error ?? "");
      return;
    }
    showToast(chapterForm.id ? "Chapter updated" : "Chapter created");
    setChapterForm(null);
    refreshChapters();
  }

  async function handleDeleteChapter(id: string) {
    const result = await deleteChapter(id);
    if (!result.ok) {
      showToast("Could not delete chapter", result.error ?? "");
      return;
    }
    showToast("Chapter deleted");
    if (chapterId === id) setChapterId("");
    refreshChapters();
  }

  async function handleMoveChapter(index: number, direction: -1 | 1) {
    if (!chapters || !subjectId) return;
    const target = index + direction;
    if (target < 0 || target >= chapters.length) return;
    const ids = chapters.map((c) => c.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    const result = await reorderChapters(subjectId, ids);
    if (!result.ok) {
      showToast("Could not reorder chapters", result.error ?? "");
      return;
    }
    refreshChapters();
  }

  async function handleSaveTopic() {
    if (!topicForm || !chapterId) return;
    const input = { name: topicForm.name, slug: topicForm.slug, bloomLevel: topicForm.bloomLevel };
    const result = topicForm.id ? await updateTopic(topicForm.id, input) : await createTopic(chapterId, input);
    if (!result.ok) {
      showToast("Could not save topic", result.error ?? "");
      return;
    }
    showToast(topicForm.id ? "Topic updated" : "Topic created");
    setTopicForm(null);
    refreshChapters();
  }

  async function handleDeleteTopic(id: string) {
    const result = await deleteTopic(id);
    if (!result.ok) {
      showToast("Could not delete topic", result.error ?? "");
      return;
    }
    showToast("Topic deleted");
    refreshChapters();
  }

  async function handleMoveTopic(topics: TopicRow[], index: number, direction: -1 | 1) {
    if (!chapterId) return;
    const target = index + direction;
    if (target < 0 || target >= topics.length) return;
    const ids = topics.map((t) => t.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    const result = await reorderTopics(chapterId, ids);
    if (!result.ok) {
      showToast("Could not reorder topics", result.error ?? "");
      return;
    }
    refreshChapters();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary-500" /> Subjects &amp; Curriculum
        </CardTitle>
        <CardDescription className="hidden sm:block">
          Board &rarr; Class &rarr; Subject &rarr; Chapter &rarr; Topic - the real curriculum structure the rest of the app reads from.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {dbUnavailable ? (
          <p className="py-4 text-center text-sm text-gray-400">Curriculum needs a connected database. Set DATABASE_URL (see docs/DATABASE.md).</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={labelClass}>State</label>
                <select className={`${inputClass} !py-2 !text-xs`} value={stateId} onChange={(e) => setStateId(e.target.value)}>
                  <option value="">Select</option>
                  {states.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Board</label>
                <select className={`${inputClass} !py-2 !text-xs`} value={boardId} onChange={(e) => setBoardId(e.target.value)} disabled={!stateId}>
                  <option value="">Select</option>
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>{b.shortName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Class</label>
                <select className={`${inputClass} !py-2 !text-xs`} value={schoolClassId} onChange={(e) => setSchoolClassId(e.target.value)} disabled={!boardId}>
                  <option value="">Select</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {readOnlyReason && (
              <p role="note" className="rounded-xl border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-800 dark:border-warning-900/50 dark:bg-warning-900/20 dark:text-warning-300">
                Read-only. {readOnlyReason}
              </p>
            )}

            {subjects !== null && (
              <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Subjects in {selectedClass?.label ?? "this class"}
                </p>
                {subjects.length === 0 ? (
                  <p className="py-2 text-sm text-gray-400">No subjects assigned to this class.</p>
                ) : (
                  <div className="space-y-1.5">
                    {subjects.map((s) => (
                      <div
                        key={s.id}
                        className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 text-sm ${s.isEnabled ? "" : "opacity-60"} ${subjectId === s.id ? "border-primary-300 bg-primary-50 dark:border-primary-800 dark:bg-primary-950/30" : "border-gray-100 dark:border-gray-800"}`}
                      >
                        <button type="button" className="flex flex-1 items-center gap-2 text-left" onClick={() => setSubjectId(s.id)}>
                          <span className="font-medium text-gray-800 dark:text-gray-100">{s.name}</span>
                          <Badge variant={s.boardId ? "success" : "outline"}>{s.boardId ? "Board-specific" : "Generic"}</Badge>
                          {!s.isEnabled && <Badge variant="warning">Hidden from students</Badge>}
                        </button>
                        {canWrite && (
                          <button
                            type="button"
                            aria-label={s.isEnabled ? `Hide ${s.name} for this class` : `Show ${s.name} for this class`}
                            title={s.isEnabled ? "Hide from students of this class" : "Show to students of this class"}
                            onClick={() => handleToggleSubject(s)}
                            disabled={subjectToggling === s.id}
                            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800"
                          >
                            {s.isEnabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        {!canWrite ? null : !s.boardId ? (
                          <button
                            type="button"
                            onClick={() => handleFork(s.id)}
                            disabled={forkingSubjectId === s.id}
                            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50 disabled:opacity-50 dark:text-primary-400 dark:hover:bg-primary-950"
                          >
                            <GitFork className="h-3 w-3" /> {forkingSubjectId === s.id ? "Creating..." : "Make board-specific"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            aria-label="Rename subject"
                            onClick={() => {
                              setSubjectId(s.id);
                              setSubjectEditName(s.name);
                            }}
                            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
                      </div>
                    ))}
                  </div>
                )}
                {canWrite && schoolClassId && (
                  <div className="mt-3">
                    {addSubjectForm ? (
                      <div className="space-y-2 rounded-xl border border-gray-100 p-3 dark:border-gray-800">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Adds a subject for {selectedClass?.label} only. Use this for a textbook subject that has no shared equivalent (for example a
                          separate Physical Science or Environmental Education book).
                        </p>
                        <div>
                          <label className={labelClass}>Subject name</label>
                          <input
                            className={inputClass}
                            value={addSubjectForm.name}
                            onChange={(e) => setAddSubjectForm({ name: e.target.value, slug: slugify(e.target.value) })}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Slug</label>
                          <input className={inputClass} value={addSubjectForm.slug} onChange={(e) => setAddSubjectForm({ ...addSubjectForm, slug: e.target.value })} />
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" onClick={handleAddSubject}>Add subject</Button>
                          <Button type="button" variant="outline" onClick={() => setAddSubjectForm(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAddSubjectForm({ name: "", slug: "" })}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-950"
                      >
                        <Plus className="h-3 w-3" /> Add subject to {selectedClass?.label ?? "this class"}
                      </button>
                    )}
                  </div>
                )}
                {selectedSubject?.boardId && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-400">
                      This is a board-specific copy - chapters added below apply only to classes using this exact variant, not the shared generic subject.
                    </p>
                    {canWrite && subjectEditName !== null && (
                      <div className="mt-2 flex items-center gap-2">
                        <input className={`${inputClass} !py-1.5 !text-xs`} value={subjectEditName} onChange={(e) => setSubjectEditName(e.target.value)} />
                        <Button type="button" onClick={handleSaveSubjectName}>Save</Button>
                        <Button type="button" variant="outline" onClick={() => setSubjectEditName(null)}>Cancel</Button>
                      </div>
                    )}
                    {canWrite && canImportApprovedCurriculum && (
                      <div className="mt-3 rounded-xl border border-primary-200 bg-primary-50 p-3 dark:border-primary-800 dark:bg-primary-950/30">
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                          Imports the approved {importDefinition?.label} textbook curriculum ({importDefinition?.chapters.length} {importDefinition?.chapterNoun},{" "}
                          {importDefinition ? countTopics(importDefinition.chapters) : 0} {importDefinition?.topicNoun}) into this
                          board-specific subject. Safe to run more than once - existing {importDefinition?.chapterNoun}/{importDefinition?.topicNoun} are matched
                          and reused, never duplicated.
                        </p>
                        <Button type="button" className="mt-2" disabled={importing} onClick={handleBulkImport}>
                          {importing ? "Importing..." : "Import approved textbook curriculum"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {subjectId && chapters !== null && (
              <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Chapters in {selectedSubject?.name}</p>
                  {canWrite && !chapterForm && (
                    <button
                      type="button"
                      onClick={() => setChapterForm({ id: null, name: "", slug: "" })}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-950"
                    >
                      <Plus className="h-3 w-3" /> Add chapter
                    </button>
                  )}
                </div>

                {canWrite && chapterForm && (
                  <div className="mb-3 space-y-2 rounded-xl border border-gray-100 p-3 dark:border-gray-800">
                    <div>
                      <label className={labelClass}>Chapter name</label>
                      <input
                        className={inputClass}
                        value={chapterForm.name}
                        onChange={(e) => setChapterForm({ ...chapterForm, name: e.target.value, slug: chapterForm.id ? chapterForm.slug : slugify(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Slug</label>
                      <input className={inputClass} value={chapterForm.slug} onChange={(e) => setChapterForm({ ...chapterForm, slug: e.target.value })} />
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" onClick={handleSaveChapter}>Save</Button>
                      <Button type="button" variant="outline" onClick={() => setChapterForm(null)}>Cancel</Button>
                    </div>
                  </div>
                )}

                {chapters.length === 0 ? (
                  <p className="py-2 text-sm text-gray-400">No chapters yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {chapters.map((c, i) => (
                      <div key={c.id}>
                        <div
                          className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 text-sm ${chapterId === c.id ? "border-primary-300 bg-primary-50 dark:border-primary-800 dark:bg-primary-950/30" : "border-gray-100 dark:border-gray-800"}`}
                        >
                          <button type="button" className="flex-1 text-left font-medium text-gray-800 dark:text-gray-100" onClick={() => setChapterId(chapterId === c.id ? "" : c.id)}>
                            {c.name} <span className="text-xs font-normal text-gray-400">({c.topics.length} topics)</span>
                          </button>
                          {canWrite && (
                          <div className="flex shrink-0 items-center gap-1">
                            <button type="button" aria-label="Move up" onClick={() => handleMoveChapter(i, -1)} disabled={i === 0} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800">
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" aria-label="Move down" onClick={() => handleMoveChapter(i, 1)} disabled={i === chapters.length - 1} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800">
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" aria-label="Edit chapter" onClick={() => setChapterForm({ id: c.id, name: c.name, slug: c.slug })} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" aria-label="Delete chapter" onClick={() => handleDeleteChapter(c.id)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500 dark:hover:bg-gray-800">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          )}
                        </div>

                        {chapterId === c.id && (
                          <div className="ml-4 mt-1.5 space-y-1.5 border-l border-gray-100 pl-3 dark:border-gray-800">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Topics</p>
                              {canWrite && !topicForm && (
                                <button
                                  type="button"
                                  onClick={() => setTopicForm({ id: null, name: "", slug: "", bloomLevel: "UNDERSTAND" })}
                                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-950"
                                >
                                  <Plus className="h-3 w-3" /> Add topic
                                </button>
                              )}
                            </div>

                            {canWrite && topicForm && (
                              <div className="space-y-2 rounded-xl border border-gray-100 p-3 dark:border-gray-800">
                                <div>
                                  <label className={labelClass}>Topic name</label>
                                  <input
                                    className={inputClass}
                                    value={topicForm.name}
                                    onChange={(e) => setTopicForm({ ...topicForm, name: e.target.value, slug: topicForm.id ? topicForm.slug : slugify(e.target.value) })}
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className={labelClass}>Slug</label>
                                    <input className={inputClass} value={topicForm.slug} onChange={(e) => setTopicForm({ ...topicForm, slug: e.target.value })} />
                                  </div>
                                  <div>
                                    <label className={labelClass}>Bloom level</label>
                                    <select
                                      className={inputClass}
                                      value={topicForm.bloomLevel}
                                      onChange={(e) => setTopicForm({ ...topicForm, bloomLevel: e.target.value as (typeof BLOOM_LEVELS)[number] })}
                                    >
                                      {BLOOM_LEVELS.map((b) => (
                                        <option key={b} value={b}>{b.charAt(0) + b.slice(1).toLowerCase()}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Button type="button" onClick={handleSaveTopic}>Save</Button>
                                  <Button type="button" variant="outline" onClick={() => setTopicForm(null)}>Cancel</Button>
                                </div>
                              </div>
                            )}

                            {c.topics.length === 0 ? (
                              <p className="py-1 text-xs text-gray-400">No topics yet.</p>
                            ) : (
                              c.topics.map((t, ti) => (
                                <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 p-2 text-xs dark:border-gray-800">
                                  <span className="text-gray-700 dark:text-gray-200">
                                    {t.name} <Badge variant="outline">{t.bloomLevel}</Badge>
                                  </span>
                                  {canWrite && (
                                  <div className="flex shrink-0 items-center gap-1">
                                    <button type="button" aria-label="Move up" onClick={() => handleMoveTopic(c.topics, ti, -1)} disabled={ti === 0} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800">
                                      <ArrowUp className="h-3 w-3" />
                                    </button>
                                    <button type="button" aria-label="Move down" onClick={() => handleMoveTopic(c.topics, ti, 1)} disabled={ti === c.topics.length - 1} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800">
                                      <ArrowDown className="h-3 w-3" />
                                    </button>
                                    <button type="button" aria-label="Edit topic" onClick={() => setTopicForm({ id: t.id, name: t.name, slug: t.slug, bloomLevel: t.bloomLevel })} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                    <button type="button" aria-label="Delete topic" onClick={() => handleDeleteTopic(t.id)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500 dark:hover:bg-gray-800">
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
