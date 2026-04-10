import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { startGeneralMeeting } from "../../api/admin";
import type { GeneralMeetingStartOut } from "../../api/admin";
import ConfirmDialog from "./ConfirmDialog";

interface StartGeneralMeetingButtonProps {
  meetingId: string;
  onSuccess: () => void;
}

export default function StartGeneralMeetingButton({ meetingId, onSuccess }: StartGeneralMeetingButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const mutation = useMutation<GeneralMeetingStartOut, Error, string>({
    mutationFn: (id) => startGeneralMeeting(id),
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
      <button ref={triggerRef} className="btn btn--primary" onClick={() => setShowDialog(true)}>
        Start Meeting
      </button>

      <ConfirmDialog
        isOpen={showDialog}
        onClose={handleClose}
        onConfirm={handleConfirm}
        isPending={mutation.isPending}
        error={error}
        title="Start Meeting"
        titleId="start-meeting-title"
        message="Are you sure you want to start this meeting? This will open voting immediately."
        confirmLabel={mutation.isPending ? "Starting..." : "Confirm Start"}
        confirmClassName="btn btn--primary"
        icon="▶"
      />
    </>
  );
}
