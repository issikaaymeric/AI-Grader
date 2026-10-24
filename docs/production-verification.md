# Production verification checklist

This checklist is intentionally separate from unit-test results. Do not mark a deployment production-ready until the checks below have been run against a dedicated staging Supabase project and the actual deployed frontend/API.

## 1. Environment and deployment

- [ ] Configure backend secrets in the hosting provider, not in Git or frontend variables:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SECRET_KEY` (long, random, production-only)
  - the selected LLM provider key (for example, `MISTRAL_API_KEY`)
  - any required queue/cache settings if Celery is enabled.
- [ ] Confirm the deployed API starts from the intended ASGI entry point and `GET /health` succeeds.
- [ ] Set CORS to the exact production frontend origins; do not use wildcard origins with credentials.
- [ ] Confirm the frontend API base URL points to the deployed API, not localhost or a preview environment.
- [ ] Verify production and preview deployments use separate secrets and separate test data.
- [ ] Confirm logs do not include API keys, bearer tokens, full student submissions, or unredacted provider errors.

## 2. Supabase schema and storage

Compare the live schema to the code and migrations before running workflow tests. The current grading route reads/writes the `assignments` fields including:

- `id`, `user_id`, `subject`, `grading_system`, `instructions`, `rubric_id`, `file_url`
- `status`, `grade`, `score`, `feedback_json`, `swot_analysis`, `flagged_for_review`, `created_at`

The custom rubric route expects `rubrics.id`, `professor_id`, `name`, `grading_mode`, and `criteria`. Audit analytics and audit-log tables against their route queries as well.

- [ ] Confirm all referenced columns exist with compatible types and defaults.
- [ ] Review RLS policies for assignments, rubrics, and audit records using separate student, professor, and admin accounts.
- [ ] Confirm service-role credentials are backend-only; never expose them as `VITE_*` variables.
- [ ] Verify the `assignments` Storage bucket exists and upload, retrieval, and deletion permissions match the intended policy.
- [ ] **Privacy gate:** the current upload helper calls `get_public_url`. Treat original submissions as potentially public until bucket visibility and the generated URL have been explicitly verified. Prefer a private bucket and short-lived signed URLs if submissions are confidential; update the marked-up-document view before changing URL behavior.
- [ ] Confirm deleting an assignment also removes its stored original and that failed cleanup is observable.

## 3. End-to-end grading smoke test

Use synthetic, non-sensitive submissions in staging.

1. Sign in as a test professor/student and obtain a valid access token.
2. Submit one small supported PDF or TXT file with a known subject and grading system.
3. Verify the upload responds with HTTP 202 and an assignment ID.
4. Poll `GET /api/assignments/{assignment_id}` until the status becomes `done` or `error`; enforce a timeout in the test.
5. On success, verify the stored grade, numeric score, feedback JSON, SWOT output, and review flag are present and parseable.
6. Refresh the page or fetch the result again to verify results persist in Supabase and do not depend on an in-memory cache.
7. Submit an unsupported file, an oversized file, an invalid token, and a malformed/empty document; verify safe and expected errors.
8. Force an LLM/provider failure in staging and confirm the assignment transitions to `error`, the API remains healthy, and logs contain a useful correlation ID without secrets.

## 4. Batch grading acceptance criteria

Batch grading is not considered verified merely because multiple independent single-file requests work.

- [ ] Define a maximum batch size and per-file size limits.
- [ ] Return a stable batch ID plus one result entry per file, including per-file assignment ID and status.
- [ ] One invalid file must not silently discard successful files; report partial failures explicitly.
- [ ] Enforce per-user ownership for batch status and result retrieval.
- [ ] Bound concurrency and provider retries to avoid resource exhaustion and unexpected LLM costs.
- [ ] Test duplicate submissions, provider rate limits, worker restarts, and retry/idempotency behavior.
- [ ] Confirm all batch jobs eventually reach a terminal state (`done` or `error`) and remain retrievable after process restart.

## 5. Authorization and human review

- [ ] Verify a user cannot read, delete, or infer another user's assignment by changing an ID; unauthorized reads should not disclose record existence.
- [ ] Test student, professor, and admin roles independently, including rubric access and analytics.
- [ ] Treat uploaded documents and embedded instructions as untrusted input; sanitization is defense in depth, not a prompt-injection guarantee.
- [ ] Keep grading output marked as AI-assisted and require an instructor to review and approve grades before they become final.
- [ ] Verify flagged submissions are clearly surfaced to the reviewer and that changes/approval are auditable.

## Release evidence

Record the deployment URL, commit SHA, test account roles (never passwords or tokens), test date, schema/migration version, and pass/fail outcome for each section. Keep this pull request in draft until the staging workflow and privacy checks have evidence.
