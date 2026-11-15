import { useState, useEffect, useRef } from "react";
import type { VoteChoice } from "../types";
import type { MotionOut } from "../api/voter";

export type OptionChoiceMap = Record<string, "for" | "against" | "abstained">;

interface UseVotingStateParams {
  meetingId: string | undefined;
  motions: MotionOut[] | undefined;
  isMotionReadOnly: (m: { id: string }) => boolean;
  getPriorVote?: (
    motion: MotionOut,
  ) => {
    choice: VoteChoice;
    optionChoices: OptionChoiceMap;
  } | null;
  selectionKey?: string;
  unvotedMotions: MotionOut[];
}

interface UseVotingStateResult {
  choices: Record<string, VoteChoice | null>;
  multiChoiceSelections: Record<string, OptionChoiceMap>;
  highlightUnanswered: boolean;
  setHighlightUnanswered: (v: boolean) => void;
  handleChoiceChange: (motionId: string, choice: VoteChoice | null) => void;
  handleMultiChoiceChange: (motionId: string, newChoices: OptionChoiceMap) => void;
  resetMultiChoiceSelections: () => void;
  answeredCount: number;
  unansweredMotions: MotionOut[];
}

export function loadFromSessionStorage(meetingId: string | undefined): Record<string, OptionChoiceMap> {
  if (!meetingId) return {};
  try {
    const raw = sessionStorage.getItem(`meeting_mc_selections_${meetingId}`);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, OptionChoiceMap>;
  } catch {
    return {};
  }
}

export function useVotingState({
  meetingId,
  motions,
  isMotionReadOnly,
  getPriorVote = (motion) =>
    motion.already_voted && motion.submitted_choice
      ? {
          choice: motion.submitted_choice,
          optionChoices: (motion.submitted_option_choices ?? {}) as OptionChoiceMap,
        }
      : null,
  selectionKey = "",
  unvotedMotions,
}: UseVotingStateParams): UseVotingStateResult {
  const [choices, setChoices] = useState<Record<string, VoteChoice | null>>({});
  const [multiChoiceSelections, setMultiChoiceSelections] = useState<Record<string, OptionChoiceMap>>(
    () => loadFromSessionStorage(meetingId)
  );
  const [highlightUnanswered, setHighlightUnanswered] = useState(false);

  // Use refs to avoid triggering the seeding effect on prop reference changes.
  const isMotionReadOnlyRef = useRef(isMotionReadOnly);
  isMotionReadOnlyRef.current = isMotionReadOnly;
  const getPriorVoteRef = useRef(getPriorVote);
  getPriorVoteRef.current = getPriorVote;
  const previousSelectionKeyRef = useRef(selectionKey);
  const seededSelectionKeyRef = useRef<string | null>(null);

  // Memoize the motions array identity to prevent infinite effect loops when
  // callers pass a new array literal on every render.
  const motionsRef = useRef(motions);
  if (motions !== motionsRef.current) {
    motionsRef.current = motions;
  }

  // A selection change changes the target lots, so clear any candidate choices
  // that were made for the previous selection before locking/restoring a new one.
  useEffect(() => {
    if (previousSelectionKeyRef.current === selectionKey) return;
    previousSelectionKeyRef.current = selectionKey;
    seededSelectionKeyRef.current = null;
    setChoices({});
    setMultiChoiceSelections({});
    if (meetingId) {
      sessionStorage.removeItem(`meeting_mc_selections_${meetingId}`);
    }
  }, [meetingId, selectionKey]);

  // Restore exact per-lot choices for motions fully covered by the current
  // selection. The selected controls remain visible but are read-only.
  useEffect(() => {
    const currentMotions = motionsRef.current;
    if (!currentMotions) return;
    const isReadOnly = isMotionReadOnlyRef.current;
    const priorVote = getPriorVoteRef.current;
    const shouldReseed = seededSelectionKeyRef.current !== selectionKey;

    setChoices((prev) => {
      let changed = false;
      const seeded: Record<string, VoteChoice | null> = { ...prev };
      for (const m of currentMotions) {
        const previous = priorVote(m);
        if (
          isReadOnly(m) &&
          previous &&
          (shouldReseed || !(m.id in seeded)) &&
          seeded[m.id] !== previous.choice
        ) {
          seeded[m.id] = previous.choice;
          changed = true;
        }
      }
      return changed ? seeded : prev;
    });

    setMultiChoiceSelections((prev) => {
      let changed = false;
      const seeded: Record<string, OptionChoiceMap> = { ...prev };
      for (const m of currentMotions) {
        const previous = priorVote(m);
        if (
          m.is_multi_choice &&
          isReadOnly(m) &&
          previous &&
          (shouldReseed || !(m.id in seeded)) &&
          JSON.stringify(seeded[m.id] ?? {}) !==
            JSON.stringify(previous.optionChoices)
        ) {
          seeded[m.id] = previous.optionChoices;
          changed = true;
        }
      }
      return changed ? seeded : prev;
    });
    seededSelectionKeyRef.current = selectionKey;
  }, [motions, selectionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChoiceChange = (motionId: string, choice: VoteChoice | null) => {
    setChoices((prev) => ({ ...prev, [motionId]: choice }));
  };

  const handleMultiChoiceChange = (motionId: string, newChoices: OptionChoiceMap) => {
    setMultiChoiceSelections((prev) => {
      const next = { ...prev, [motionId]: newChoices };
      if (meetingId) {
        sessionStorage.setItem(`meeting_mc_selections_${meetingId}`, JSON.stringify(next));
      }
      return next;
    });
  };

  const resetMultiChoiceSelections = () => {
    setMultiChoiceSelections({});
    if (meetingId) {
      sessionStorage.removeItem(`meeting_mc_selections_${meetingId}`);
    }
  };

  const answeredCount = unvotedMotions.filter((m) =>
    m.is_multi_choice
      ? m.id in multiChoiceSelections
      : !!choices[m.id]
  ).length;

  const unansweredMotions = unvotedMotions.filter((m) =>
    m.is_multi_choice
      ? !(m.id in multiChoiceSelections)
      : !choices[m.id]
  );

  return {
    choices,
    multiChoiceSelections,
    highlightUnanswered,
    setHighlightUnanswered,
    handleChoiceChange,
    handleMultiChoiceChange,
    resetMultiChoiceSelections,
    answeredCount,
    unansweredMotions,
  };
}
