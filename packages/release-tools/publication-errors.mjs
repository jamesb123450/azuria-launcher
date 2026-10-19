// Return only fixed messages; Git subprocess output may contain credentials.
export function publicationError(stage, error) {
  const detail = String(error.stderr || "").toLowerCase();
  let reason =
    "Git failed; inspect repository access and runner configuration.";
  if (
    /invalid username|authentication failed|bad credentials|password authentication|could not read username/.test(
      detail,
    )
  )
    reason =
      "GitHub rejected the token. Replace AZURIA_RELEASES_TOKEN with the raw token value.";
  else if (
    /403|permission .* denied|write access .* not granted|repository not found|could not read from remote/.test(
      detail,
    )
  )
    reason =
      "GitHub denied repository access. Check token owner, repository selection, approval and Contents write permission.";
  else if (/protected branch|repository rule|gh006|gh013/.test(detail))
    reason =
      "A destination branch rule blocked publication. Allow the publishing identity to update site/ on main.";
  else if (/fetch first|non-fast-forward|remote contains work/.test(detail))
    reason =
      "The destination changed during publication. Rerun the failed website job.";
  else if (
    /could not resolve|failed to connect|timed out|connection reset/.test(
      detail,
    )
  )
    reason = "The runner could not reach GitHub. Retry the failed website job.";
  return `Website publication failed during ${stage} (exit ${Number.isInteger(error.status) ? error.status : "unknown"}). ${reason}`;
}
