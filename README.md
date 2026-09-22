# FocalPoint

Gaze-adaptive chat with a typed run harness, server-owned context, structured
memory, inspectable traces, and evaluation-gated policy improvement.

The browser maps fixations to response-scoped reading zones. The backend scores
feedback using the policy that produced the response, adapts the user's profile,
selects bounded context, generates an answer, and atomically stores the exchange,
feedback, memory changes and successful run in MongoDB.

An explicit **Improve Current Session** action proposes a new adaptation policy,
evaluates it against its parent on checked-in holdouts, and activates it only if
all gates pass. Policies are immutable and every candidate records its evidence
and parent. This is behavioral self-improvement, not model training or code edits.

## What Is Implemented

- A fixed execution pipeline with validated requests/context/results, stage
  checkpoints, a 64-stage bound, provider timeouts and explicit terminal errors.
- Full-input budgeting using a conservative UTF-8-byte token upper bound. Exact
  provider usage is recorded separately. Complete recent exchanges and relevant
  semantic memories are selected server-side.
- Working memory (conversation), episodic memory (feedback), semantic memory
  (derived preferences with provenance), and procedural memory (versioned policy).
- Request idempotency, feedback deduplication, and optimistic concurrency checks.
  Conversation/profile/feedback/memory changes commit in a MongoDB transaction.
- Offline deterministic regression CLI plus paired model evaluation with blind
  grading in both answer orders, reference facts, dataset hashes and stored outputs.
- Correctness floors, per-case correctness non-regression, mean quality and minimum
  improvement gates. The proposer cannot edit those gates.
- A responsive inspector for runs, memory, policies and evaluations; JSON stage
  logs; actual provider/model/usage records and reconstructable model inputs.
- Explicit Groq or Gemini configuration. No provider substitution, automatic
  retries, mock production responses, MCP or code sandboxing.

## Chat and Tracking Reliability

Disabled tracking and absent fixations no longer count as skipped reading.
Feedback applies to the original response's question and recorded policy, even
if the next question changes topic. Repeated feedback is deduplicated. Failed
generation preserves the typed input, leaves the stored conversation untouched,
and exposes the actual error instead of inserting an error as an assistant answer.

The frontend no longer writes over server-owned sessions or re-saves a partial
profile after each response. Concurrent stale writes are rejected. Inspector tab
switches keep each response tied to its view, preventing stale data from crashing
the page. Calibration starts only after the camera opens successfully; denied
camera access leaves tracking off, and Resume requires a saved calibration.

## Resume Summary

- Engineered an adaptive LLM agent harness with bounded context management,
  working/episodic/semantic/procedural memory, and execution tracing; implemented
  idempotent requests and atomic MongoDB updates for reliable state transitions.
- Built evaluation-gated recursive policy improvement with immutable policy
  versions, deterministic regression tests, and blind paired model judging;
  automated promotion checks for correctness, non-regression, and minimum gain.

## Run Locally

Requirements: Python 3.11, Node.js 22+, and MongoDB with replica-set transactions.
Use an Atlas cluster or the supplied local replica-set launcher.

```bash
python3.11 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-test.txt
npm ci
npm --prefix frontend ci
cp .env.example .env
```

Set the selected provider key in `.env`. Groq configuration:

```dotenv
MODEL_PROVIDER=groq
GROQ_API_KEY=your-key
GROQ_MODEL=openai/gpt-oss-120b
GROQ_REQUEST_INTERVAL_SECONDS=15
MONGODB_URI=mongodb://127.0.0.1:27028/?replicaSet=focalpoint
MONGODB_DB_NAME=focalpoint_dev
```

`GROQ_REQUEST_INTERVAL_SECONDS` explicitly paces requests in this backend process.
It is not a retry. Set it to match your account limits; a rate-limit error is still
a visible failure. Evaluating four holdouts with both grade orders takes several
minutes with the example pacing. Run one backend worker with this local limiter.

For Gemini, select `MODEL_PROVIDER=gemini` and set `GEMINI_API_KEY` and
`GEMINI_MODEL` explicitly. The live acceptance run uses Groq.

In one terminal, start the real local MongoDB replica set:

```bash
npm run db:dev
```

The launcher downloads MongoDB 7.0.14 on first use and stores development data in
ignored `.runtime/mongo`. It does not substitute an in-memory database for the app.
In a second terminal:

```bash
npm run dev
```

Open [FocalPoint](http://localhost:5173). API docs are at
[localhost:8000/docs](http://localhost:8000/docs). Use the activity icon to open
the inspector. Calibration is available in the desktop tracking panel.

## Verification

Keep the local replica set running for integration tests:

```bash
npm run test:backend
npm run eval
npm run build
npm --prefix frontend run lint
npx playwright install chromium
npm run test:browser
```

Browser tests require the frontend and backend servers. To explicitly use installed
Chrome, run `PLAYWRIGHT_CHANNEL=chrome npm run test:browser`.

Live checks make real provider calls and preserve their evidence in the configured
database. They must not run concurrently when sharing a rate-limited key:

```bash
npm run test:live
node scripts/browser-live.cjs
```

The test plan, design, and verification record are independent documents:

- [Acceptance test specification](docs/ACCEPTANCE_TESTS.md)
- [Implementation design](docs/IMPLEMENTATION_DESIGN.md)
- [Observed verification results](docs/VERIFICATION.md)

## API Contract

`POST /chat` accepts a new message, not a client-provided history:

```json
{
  "user_id": "demo_user",
  "session_id": "s_example",
  "request_id": "unique-request-id",
  "message": "Explain recursion",
  "previous_response_id": null,
  "gaze_events": []
}
```

An identical completed request ID returns its recorded result. Changed payloads,
in-progress requests and failed request IDs conflict. Explicit retries use a new
ID. Feedback zones must start with `<previous_response_id>:` and each response's
feedback is applied once. Tracking disabled or no fixations sends no feedback.

`POST /session/end` accepts the same identity/feedback fields without `message`.
It records any final-answer feedback, proposes and evaluates a candidate, then
reports the promotion decision. Rejection is a normal successful evaluation.

Read endpoints: `/profile`, `/sessions`, `/inspect/runs`, `/inspect/runs/{run_id}`,
`/inspect/memory`, `/inspect/policies`, `/inspect/evaluations`, and
`/inspect/evaluations/{evaluation_id}`. All take `user_id`; memory also takes
`session_id`. Run deterministic checks with
`POST /inspect/policies/{policy_id}/regression?user_id=...`.

Sessions are server-owned; the former `POST /sessions` write path is removed.
Legacy sessions remain readable, but continuing or scoring unversioned messages
can require starting a new chat. Deleting a session removes the conversation;
its evaluation/feedback audit records are retained.

## Limits of the Evidence

This is a local demo with a selected user ID, not an authenticated hosted service.
User-scoped queries do not replace authentication. Traces contain conversation
content and belong in a private database.

Gaze is a noisy heuristic, not measured comprehension. The small holdout dataset
and model judge provide regression evidence, not a guarantee that every answer is
correct or every user benefits. Physical camera accuracy and human comprehension
were not verified in this change; the user declined that manual check. See the
verification record for the actual live result, including rejected candidates.
