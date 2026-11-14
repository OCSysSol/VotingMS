export interface VoterDisplayInput {
  voter_email?: string | null;
  voter_name?: string | null;
  proxy_email?: string | null;
  submitted_by_admin?: boolean;
}

/** Human-readable voter/source label shared by tables and CSV exports. */
export function formatVoterIdentity(voter: VoterDisplayInput): string {
  if (voter.submitted_by_admin) return "Floor vote";

  const displayName = voter.voter_name
    ? `${voter.voter_name} <${voter.voter_email ?? ""}>`
    : (voter.voter_email || "");
  return voter.proxy_email ? `${displayName} (proxy)` : displayName;
}
