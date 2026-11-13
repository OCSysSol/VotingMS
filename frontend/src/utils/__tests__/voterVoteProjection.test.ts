import { describe, expect, it } from "vitest";
import type { LotInfo, MotionOut } from "../../api/voter";
import { projectMotionVotes } from "../voterVoteProjection";

const motion: MotionOut = {
  id: "m1",
  title: "Budget",
  description: null,
  display_order: 1,
  motion_number: "1",
  motion_type: "general",
  is_visible: true,
  already_voted: false,
  submitted_choice: null,
  option_limit: null,
  options: [
    { id: "opt-a", text: "Option A", display_order: 1 },
    { id: "opt-b", text: "Option B", display_order: 2 },
  ],
};

function lot(
  id: string,
  submitted_votes?: LotInfo["submitted_votes"],
  voted_motion_ids: string[] = [],
): LotInfo {
  return {
    lot_owner_id: id,
    lot_number: id,
    financial_position: "normal",
    already_submitted: (submitted_votes?.length ?? 0) > 0,
    is_proxy: false,
    voted_motion_ids,
    submitted_votes,
  };
}

describe("projectMotionVotes", () => {
  it("returns no aggregate when there are no selected lots", () => {
    expect(projectMotionVotes(motion, [])).toEqual({
      answeredCount: 0,
      totalCount: 0,
      isComplete: false,
      isMixed: false,
      choice: null,
      optionChoices: null,
      summary: null,
    });
  });

  it("returns no aggregate when no selected lot has voted", () => {
    expect(projectMotionVotes(motion, [lot("A"), lot("B")])).toMatchObject({
      answeredCount: 0,
      totalCount: 2,
      isComplete: false,
      summary: null,
    });
  });

  it("projects a single exact binary prior choice", () => {
    const result = projectMotionVotes(motion, [
      lot("A", [
        { motion_id: "m1", choice: "no", option_choices: {} },
      ]),
    ]);
    expect(result).toMatchObject({
      isComplete: true,
      isMixed: false,
      choice: "no",
      summary: "Earlier vote: Against",
    });
  });

  it("uses the legacy motion aggregate only when submitted_votes is absent", () => {
    const legacyMotion = {
      ...motion,
      already_voted: true,
      submitted_choice: "yes" as const,
    };
    const result = projectMotionVotes(legacyMotion, [
      lot("A", undefined, ["m1"]),
    ]);
    expect(result.choice).toBe("yes");
    expect(result.summary).toBe("Earlier vote: For");
  });

  it("does not use a legacy aggregate when an empty exact-vote list is present", () => {
    const legacyMotion = {
      ...motion,
      already_voted: true,
      submitted_choice: "yes" as const,
    };
    const result = projectMotionVotes(legacyMotion, [lot("A", [], ["m1"])]);
    expect(result.answeredCount).toBe(0);
    expect(result.choice).toBeNull();
  });

  it("locks identical choices across all selected lots", () => {
    const votes = [
      { motion_id: "m1", choice: "abstained" as const, option_choices: {} },
    ];
    const result = projectMotionVotes(motion, [
      lot("A", votes),
      lot("B", votes),
    ]);
    expect(result.isComplete).toBe(true);
    expect(result.isMixed).toBe(false);
    expect(result.choice).toBe("abstained");
    expect(result.summary).toBe("Earlier vote: Abstain");
  });

  it("reports mixed choices across all selected lots", () => {
    const result = projectMotionVotes(motion, [
      lot("A", [{ motion_id: "m1", choice: "yes", option_choices: {} }]),
      lot("B", [{ motion_id: "m1", choice: "no", option_choices: {} }]),
    ]);
    expect(result.isComplete).toBe(true);
    expect(result.isMixed).toBe(true);
    expect(result.choice).toBeNull();
    expect(result.summary).toBe("Mixed votes among selected lots");
  });

  it("reports partial coverage with all distinct prior choices", () => {
    const result = projectMotionVotes(motion, [
      lot("A", [{ motion_id: "m1", choice: "not_eligible", option_choices: {} }]),
      lot("B"),
      lot("C", [{ motion_id: "m1", choice: "yes", option_choices: {} }]),
    ]);
    expect(result.isComplete).toBe(false);
    expect(result.summary).toBe(
      "2 of 3 selected lots already voted: Not eligible; For",
    );
  });

  it("compares complete multi-choice maps independent of key order", () => {
    const result = projectMotionVotes(motion, [
      lot("A", [
        {
          motion_id: "m1",
          choice: "selected",
          option_choices: { "opt-a": "for", "opt-b": "against" },
        },
      ]),
      lot("B", [
        {
          motion_id: "m1",
          choice: "selected",
          option_choices: { "opt-b": "against", "opt-a": "for" },
        },
      ]),
    ]);
    expect(result.isMixed).toBe(false);
    expect(result.choice).toBe("selected");
    expect(result.optionChoices).toEqual({
      "opt-a": "for",
      "opt-b": "against",
    });
    expect(result.summary).toBe(
      "Earlier vote: Option A: For; Option B: Against",
    );
  });

  it("formats per-option abstains and unknown option ids", () => {
    const result = projectMotionVotes(motion, [
      lot("A", [
        {
          motion_id: "m1",
          choice: "selected",
          option_choices: { "unknown-option": "abstained" },
        },
      ]),
    ]);
    expect(result.summary).toBe("Earlier vote: unknown-option: Abstain");
  });
});
