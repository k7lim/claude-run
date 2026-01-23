
Use bd as the source of truth for tasks. Do not maintain separate TODO lists unless asked.

Start:
- If possible, run `bd prime`.
- Get work: `bd ready --json`.

During work:
- Claim: `bd update <id> --status in_progress --json`.
- Create discoveries: `bd create "Title" -p 1 -t task --deps discovered-from:<id> --json`.
- Add blockers: `bd dep add <child> <parent> --json`.

Finish:
- Close: `bd close <id> --reason "Summary" --json`.
- Sync: `bd sync`.

Rules:
- Always use `--json` for machine output.
- Always double-quote titles/descriptions.
- Do not use `bd edit` (human-only); use `bd update` flags.
- If daemon is unsafe (sandbox/CI/worktrees), use `bd --sandbox` or `bd --no-daemon`.

Need more context? Ask to open the smallest relevant doc instead of guessing.

