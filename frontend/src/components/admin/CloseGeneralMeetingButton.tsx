import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { closeGeneralMeeting } from "../../api/admin";
import type { GeneralMeetingCloseOut } from "../../api/admin";
import ConfirmDialog from "./ConfirmDialog";

interface CloseGeneralMeetingButtonProps {
  meetingId: string;
  meetingTitle: string;
  onSuccess: () => void;
}

export default function CloseGeneralMeetingButton({ meetingId, meetingTitle, onSuccess }: CloseGeneralMeetingButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const mutation = useMutation<GeneralMeetingCloseOut, Error, string>({
    mutationFn: (id) => closeGeneralMeeting(id),
    onSuccess: () => {
      setShowDialog(false);
      setError(null);
      onSuccess();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleClose() {
    setShowDialog(false);
    setError(null);
    triggerRef.current?.focus();
  }

  function handleConfirm() {
    mutation.mutate(meetingId);
  }

  return (
    <>
      <button ref={triggerRef} className="btn btn--danger" onClick={() => setShowDialog(true)}>
        Close Voting
      </button>

      <ConfirmDialog
        isOpen={showDialog}
        onClose={handleClose}
        onConfirm={handleConfirm}
        isPending={mutation.isPending}
        error={error}
        title="Close Voting"
        titleId="close-meeting-title"
        message={
          <>
            Close voting for <strong>{meetingTitle}</strong>? This cannot be undone.
            Results will be emailed to all lot owners.
          </>
        }
        confirmLabel={mutation.isPending ? "Closing..." : "Confirm Close"}
        confirmClassName="btn btn--danger"
        icon="⚠"
      />
    </>
  );
}
