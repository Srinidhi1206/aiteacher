"use client";
// Shared State -> Board -> Class (+ optional School) cascading-select logic
// for the Stage F registration forms. Each level re-fetches from the real
// curriculum tables whenever its parent changes, and resets to empty
// whenever the parent selection is cleared - never lets a stale
// class/board leak past a state change.
import * as React from "react";
import { listStates, listBoards, listSchoolClasses, listSchools } from "@/lib/actions/curriculum";

type State = Awaited<ReturnType<typeof listStates>>[number];
type Board = Awaited<ReturnType<typeof listBoards>>[number];
type SchoolClass = Awaited<ReturnType<typeof listSchoolClasses>>[number];
type School = Awaited<ReturnType<typeof listSchools>>[number];

// Next 14 resolves a server action with `undefined` (it does not reject) when the response is not an
// action payload - for example an HTML 500 from the host. Treat that like any other failed load so the
// existing `.catch` fallbacks run instead of the page crashing on `undefined.map(...)`.
export function expectList<T>(value: T[] | null | undefined): T[] {
  if (!Array.isArray(value)) throw new Error("Unexpected server action response.");
  return value;
}

export function useCurriculumSelect() {
  const [states, setStates] = React.useState<State[]>([]);
  const [boards, setBoards] = React.useState<Board[]>([]);
  const [schoolClasses, setSchoolClasses] = React.useState<SchoolClass[]>([]);
  const [schools, setSchools] = React.useState<School[]>([]);

  const [stateId, setStateId] = React.useState("");
  const [boardId, setBoardId] = React.useState("");
  const [schoolClassId, setSchoolClassId] = React.useState("");
  const [schoolId, setSchoolId] = React.useState("");
  const [unavailable, setUnavailable] = React.useState(false);

  React.useEffect(() => {
    listStates()
      .then((v) => setStates(expectList(v)))
      .catch(() => {
        setStates([]);
        setUnavailable(true);
      });
  }, []);

  React.useEffect(() => {
    setBoardId("");
    setBoards([]);
    listBoards(stateId || null)
      .then((v) => setBoards(expectList(v)))
      .catch(() => setBoards([]));
    setSchools([]);
    listSchools(stateId || null)
      .then((v) => setSchools(expectList(v)))
      .catch(() => setSchools([]));
  }, [stateId]);

  React.useEffect(() => {
    setSchoolClassId("");
    setSchoolClasses([]);
    if (!boardId) return;
    listSchoolClasses(boardId)
      .then((v) => setSchoolClasses(expectList(v)))
      .catch(() => setSchoolClasses([]));
  }, [boardId]);

  return {
    states,
    boards,
    schoolClasses,
    schools,
    stateId,
    setStateId,
    boardId,
    setBoardId,
    schoolClassId,
    setSchoolClassId,
    schoolId,
    setSchoolId,
    unavailable,
  };
}
