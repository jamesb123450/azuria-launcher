# Launcher release numbering and notes

Launcher releases advance the highest published `0.2.x` patch by **one** across the public mirror and source release bridge. CI run numbers, failed checks and PR reruns do not allocate patch numbers. Existing versions and update URLs are not renamed.

The release build compares the source tag for the previous public release with the commit being published. Only unpublished commits enter the notes. The same generated file, `apps/app/release-notes.generated.md`, supplies the in-app updater manifest and both GitHub release bodies. Missing/empty/divergent comparisons stop publication rather than reuse stale notes.

Each non-merge commit can include a human-written block:

```
Improve saved sessions and version controls

Release notes:
- Stay signed in on the same browser between sessions.
- Find launch controls in a simpler Versions sidebar.
```

Only these bullets enter the release notes. Without a block, the commit's first line is used; merge boilerplate and duplicate lines are omitted. Keep commit titles suitable for public release notes. No previous release bodies are copied. `apps/app/docs/RELEASE_NOTES.md` remains the readable summary of the current work, not a rolling history or the packaging input.

For a source repository that has not retained the previous public release tag, the first transition uses the triggering push's `before` SHA. Subsequent private-source publications retain a private source tag so comparisons cover the correct range. Source commit hashes and private source links are not added to the public mirror's target or generated metadata.

No new credentials are needed: configuration uses the existing source `GITHUB_TOKEN` and `AZURIA_RELEASES_TOKEN`. Existing Actions release conditions still control publication. This change does not publish a release by itself.
