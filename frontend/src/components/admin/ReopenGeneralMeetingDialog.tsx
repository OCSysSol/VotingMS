import { useState, type FormEvent } from "react";

interface ReopenGeneralMeetingDialogProps {
  initialVotingClosesAt: string;
  isPending: boolean;
  error: string | null;
  onConfirm: (votingClosesAt: string) => void;
  onCancel: () => void;
}

export default function ReopenGeneralMeetingDialog({
  initialVotingClosesAt,
  isPending,
  error,
  onConfirm,
  onCancel,
}: ReopenGeneralMeetingDialogProps) {
  const [votingClosesAt, setVotingClosesAt] = useState(initialVotingClosesAt);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!votingClosesAt) return;
    onConfirm(new Date(votingClosesAt).toISOString());
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reopen-meeting-title"
      className="dialog-overlay"
      onClick={(event) => { if (event.target === event.currentTarget && !isPending) onCancel(); }}
    >
      <form className="dialog" onSubmit={handleSubmit}>
        <h2 id="reopen-meeting-title" className="dialog__title">Reopen this General Meeting?</h2>
        <p className="dialog__body">
          Voters can submit votes again for motions they have not voted on. Submitted votes will be kept.
          Choose a new voting close time.
        </p>
        <div className="field">
          <label className="field__label" htmlFor="reopen-voting-closes-at">New voting close time</label>
          <input
            id="reopen-voting-closes-at"
            className="field__input"
            type="datetime-local"
            aria-label="New voting close time"
            value={votingClosesAt}
            onChange={(event) => setVotingClosesAt(event.target.value)}
            required
            disabled={isPending}
          />
        </div>
        {error && <p role="alert" className="dialog__error">{error}</p>}
        <div className="dialog__actions">
          <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={isPending}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={isPending}>
            {isPending ? "Reopening…" : "Reopen Meeting"}
          </button>
        </div>
      </form>
    </div>
  );
}
