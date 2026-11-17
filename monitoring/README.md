# Supabase monitoring

External read-only Data API probes for all three projects visible on 2026-11-17.
Runs six times daily on GitHub's standard Linux runner in this public repository.
No npm dependencies, service-role keys, management tokens, application passwords,
schema changes, row writes or paid services. Publishable keys already ship in the apps.
`select=*&limit=0` requests return zero records; RLS is preserved. HTTP authorization
errors, missing tables, redirects, malformed data and timeouts fail the check.
Transient failures retry at most three times per project; other projects continue.

The workflow opens one GitHub issue mentioning @danal8 on failure and closes it on
full recovery. Actual delivery of GitHub email/push depends on account notification
settings. Notification API failure also fails the workflow. GitHub Actions failure
notifications are a separate account setting. The report is in the run log and summary.

Supabase says a few database requests daily typically avoid inactivity pausing;
this is best effort, not a guarantee or a paid-plan SLA. New projects must be added
to projects.json after inventory review. This inventory covers the two connected accounts.

GitHub may delay/drop schedules and automatically disables schedules in public repos
after 60 days without repository activity. An independent ChatGPT watchdog should
check recent successful runs and report stale/disabled workflows and project inventory
changes. Do not rely exclusively on a workflow to detect its own absence.

Validation: `node --test monitoring/*.test.mjs`, then `node monitoring/probe.mjs`.
Live 2026-11-17: shared apps and MediCredit return HTTP 200 with []. MUA Planner
returns HTTP 401/42501 (anon lacks SELECT). It is deliberately reported as a failure,
not as protected. Do not grant anonymous SELECT on clients to fix this. A project
administrator must expose a dedicated constant read-only health RPC with no access
to business tables, then change that project's probe to the RPC and verify it live.
Connected SQL/key tools currently reject access, so this final step is blocked.

Sources: https://supabase.com/docs/guides/platform/free-project-pausing
and https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
