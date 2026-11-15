import type {
  LotInfo,
  MotionOut,
  SubmittedVoteInfo,
} from "../api/voter";
import type { VoteChoice } from "../types";

export type ProjectedOptionChoices = Record<
  string,
  "for" | "against" | "abstained"
>;

export interface MotionVoteProjection {
  answeredCount: number;
  totalCount: number;
  isComplete: boolean;
  isMixed: boolean;
  choice: VoteChoice | null;
  optionChoices: ProjectedOptionChoices | null;
  summary: string | null;
}

const CHOICE_LABELS: Record<VoteChoice, string> = {
  yes: "For",
  no: "Against",
  abstained: "Abstain",
  not_eligible: "Not eligible",
  selected: "Selected",
};

function submittedVoteForLot(
  lot: LotInfo,
  motion: MotionOut,
): SubmittedVoteInfo | null {
  const exact = lot.submitted_votes?.find(
    (vote) => vote.motion_id === motion.id,
  );
  if (exact) return exact;

  // Compatibility for sessions cached before submitted_votes was added. Exact
  // per-lot records are authoritative whenever the server supplies the field.
  if (
    lot.submitted_votes === undefined &&
    (lot.voted_motion_ids ?? []).includes(motion.id) &&
    motion.submitted_choice
  ) {
    return {
      motion_id: motion.id,
      choice: motion.submitted_choice,
      option_choices: {
        ...(motion.submitted_option_choices ?? {}),
      },
    };
  }

  return null;
}

function canonicalVote(vote: SubmittedVoteInfo): string {
  const entries = Object.entries(vote.option_choices).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  if (entries.length > 0) {
    return `options:${entries.map(([id, choice]) => `${id}:${choice}`).join("|")}`;
  }
  return `choice:${vote.choice}`;
}

function formatVote(vote: SubmittedVoteInfo, motion: MotionOut): string {
  const optionChoices = Object.entries(vote.option_choices);
  if (optionChoices.length === 0) {
    return CHOICE_LABELS[vote.choice] ?? vote.choice;
  }

  const optionTextById = new Map(
    motion.options.map((option) => [option.id, option.text]),
  );
  return optionChoices
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([optionId, choice]) => {
      const label = choice === "for" ? "For" : choice === "against" ? "Against" : "Abstain";
      return `${optionTextById.get(optionId) ?? optionId}: ${label}`;
    })
    .join("; ");
}

export function projectMotionVotes(
  motion: MotionOut,
  lots: LotInfo[],
): MotionVoteProjection {
  const recorded = lots
    .map((lot) => submittedVoteForLot(lot, motion))
    .filter((vote): vote is SubmittedVoteInfo => vote !== null);
  const totalCount = lots.length;
  const answeredCount = recorded.length;

  if (totalCount === 0 || answeredCount === 0) {
    return {
      answeredCount,
      totalCount,
      isComplete: false,
      isMixed: false,
      choice: null,
      optionChoices: null,
      summary: null,
    };
  }

  const signatures = new Set(recorded.map(canonicalVote));
  const isComplete = answeredCount === totalCount;
  const isMixed = isComplete && signatures.size > 1;
  const first = recorded[0];
  const uniqueLabels = [...new Set(recorded.map((vote) => formatVote(vote, motion)))];

  if (isMixed) {
    return {
      answeredCount,
      totalCount,
      isComplete,
      isMixed,
      choice: null,
      optionChoices: null,
      summary: "Mixed votes among selected lots",
    };
  }

  if (isComplete) {
    return {
      answeredCount,
      totalCount,
      isComplete,
      isMixed: false,
      choice: first.choice,
      optionChoices: first.option_choices as ProjectedOptionChoices,
      summary: `Earlier vote: ${formatVote(first, motion)}`,
    };
  }

  return {
    answeredCount,
    totalCount,
    isComplete: false,
    isMixed: false,
    choice: null,
    optionChoices: null,
    summary: `${answeredCount} of ${totalCount} selected lots already voted: ${uniqueLabels.join("; ")}`,
  };
}
