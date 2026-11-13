import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createGeneralMeeting } from "../../api/admin";
import type { GeneralMeetingOut, GeneralMeetingCreateRequest } from "../../api/admin";
import MotionEditor, { type MotionFormEntry } from "./MotionEditor";
import MotionExcelUpload from "./MotionExcelUpload";
import BuildingSearchCombobox from "./BuildingSearchCombobox";

import { formatApiErrorMessage, MOTION_LIMITS } from "../../utils/validation";

export default function CreateGeneralMeetingForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [buildingId, setBuildingId] = useState(() => searchParams.get("building") ?? "");
  const [title, setTitle] = useState("");
  const [meetingAt, setMeetingAt] = useState("");
  const [votingClosesAt, setVotingClosesAt] = useState("");
  const [motions, setMotions] = useState<MotionFormEntry[]>([{ title: "", description: "", motion_number: "", motion_type: "general", is_multi_choice: false }]);
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation<GeneralMeetingOut, Error, GeneralMeetingCreateRequest>({
    mutationFn: (data) => createGeneralMeeting(data),
    onSuccess: (data) => { navigate(`/admin/general-meetings/${data.id}`); },
    onError: (err) => { setFormError(formatApiErrorMessage(err)); },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!buildingId) { setFormError("Please select an OC Plan."); return; }
    if (!title.trim()) { setFormError("Title is required."); return; }
    if (!meetingAt) { setFormError("Meeting date/time is required."); return; }
    if (!votingClosesAt) { setFormError("Voting close date/time is required."); return; }
    if (new Date(votingClosesAt) <= new Date(meetingAt)) {
      setFormError("Voting close time must be after meeting time.");
      return;
    }
    if (motions.length === 0) { setFormError("At least one motion is required."); return; }
    for (let i = 0; i < motions.length; i++) {
      if (!motions[i].title.trim()) {
        setFormError(`Motion ${i + 1} title is required.`);
        return;
      }
      if (motions[i].title.length > MOTION_LIMITS.TITLE.MAX) {
        setFormError(`Motion ${i + 1}: Title exceeds the 500 character limit (${motions[i].title.length}/500 characters).`);
        return;
      }
      if ((motions[i].motion_number?.length ?? 0) > MOTION_LIMITS.MOTION_NUMBER.MAX) {
        setFormError(`Motion ${i + 1}: Motion number exceeds the 50 character limit (${motions[i].motion_number!.length}/50 characters).`);
        return;
      }
      if (motions[i].description.length > MOTION_LIMITS.DESCRIPTION.MAX) {
        setFormError(`Motion ${i + 1}: Description exceeds the 5,000 character limit (${motions[i].description.length.toLocaleString()}/5000 characters).`);
        return;
      }
      if (motions[i].is_multi_choice) {
        const opts = motions[i].options ?? [];
        for (let oi = 0; oi < opts.length; oi++) {
          const txt = opts[oi].text;
          if (txt.length > MOTION_LIMITS.OPTION_TEXT.MAX) {
            setFormError(`Motion ${i + 1}, Option ${oi + 1} exceeds the 1,000 character limit (${txt.length}/1000 characters).`);
            return;
          }
        }
        const validOpts = opts.filter((o: { text: string }) => o.text.trim());
        if (validOpts.length < 2) {
          setFormError(`Motion ${i + 1}: multi-choice requires at least 2 options.`);
          return;
        }
        for (let oi = 0; oi < opts.length; oi++) {
          if (!opts[oi].text.trim()) {
            setFormError(`Motion ${i + 1}, Option ${oi + 1}: option text must not be empty.`);
            return;
          }
        }
        const lim = parseInt(motions[i].option_limit ?? "1", 10);
        if (isNaN(lim) || lim < 1) {
          setFormError(`Motion ${i + 1}: option limit must be at least 1.`);
          return;
        }
        if (lim > validOpts.length) {
          setFormError(`Motion ${i + 1}: option limit cannot exceed option count.`);
          return;
        }
      }
    }

    mutation.mutate({
      building_id: buildingId,
      title: title.trim(),
      meeting_at: new Date(meetingAt).toISOString(),
      voting_closes_at: new Date(votingClosesAt).toISOString(),
      motions: motions.map((m, i) => {
        const base = {
          title: m.title.trim(),
          description: m.description.trim() || null,
          display_order: i + 1,
          motion_number: m.motion_number?.trim() || null,
          motion_type: m.motion_type,
          is_multi_choice: m.is_multi_choice ?? false,
        };
        if (m.is_multi_choice) {
          const validOpts = (m.options ?? []).filter((o: { text: string }) => o.text.trim());
          return {
            ...base,
            option_limit: parseInt(m.option_limit ?? "1", 10),
            options: validOpts.map((o: { text: string }, oi: number) => ({ text: o.text.trim(), display_order: oi + 1 })),
          };
        }
        return base;
      }),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="admin-form" noValidate>
      <p className="field__hint" style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
        <span aria-hidden="true">*</span> Required field
      </p>
      <div className="field">
        <label className="field__label field__label--required" htmlFor="agm-building">OC Plan</label>
        <BuildingSearchCombobox
          id="agm-building"
          value={buildingId}
          onChange={(id) => setBuildingId(id)}
          placeholder="Search OC Plans"
          displayLabel={(building) =>
            building.oc_plan_number
              ? `${building.oc_plan_number} — ${building.name}`
              : building.name
          }
          listboxLabel="OC Plans"
          clearLabel="Clear selection"
          emptyLabel="No OC Plans found"
        />
      </div>

      <div className="field">
        <label className="field__label field__label--required" htmlFor="agm-title">Title</label>
        <input
          id="agm-title"
          className="field__input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-required="true"
          required
        />
      </div>

      <div className="field">
        <label className="field__label field__label--required" htmlFor="agm-meeting-at">Meeting Date / Time</label>
        <input
          id="agm-meeting-at"
          className="field__input"
          type="datetime-local"
          value={meetingAt}
          onChange={(e) => setMeetingAt(e.target.value)}
          aria-required="true"
          required
        />
      </div>

      <div className="field">
        <label className="field__label field__label--required" htmlFor="agm-voting-closes-at">Voting Closes At</label>
        <input
          id="agm-voting-closes-at"
          className="field__input"
          type="datetime-local"
          value={votingClosesAt}
          onChange={(e) => setVotingClosesAt(e.target.value)}
          aria-required="true"
          required
        />
      </div>

      <MotionExcelUpload onMotionsLoaded={(loaded) => setMotions(loaded)} />

      <MotionEditor motions={motions} onChange={setMotions} />

      {formError && (
        <p role="alert" className="field__error" style={{ marginBottom: 16 }}>{formError}</p>
      )}

      <div style={{ marginTop: 8 }}>
        <button type="submit" className="btn btn--primary" disabled={mutation.isPending}>
          {mutation.isPending ? "Creating..." : "Create General Meeting"}
        </button>
      </div>
    </form>
  );
}
