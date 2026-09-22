# FocalPoint Acceptance Test Specification

Status: acceptance contract written before completing implementation.

## Product claim under test

FocalPoint uses response-scoped gaze feedback to adapt explanations. It owns
conversation context on the server, persists evidence-backed memory, records
inspectable execution traces, evaluates adaptation policies, and only activates
a proposed policy when an independent evaluation gate passes. Policy changes
are behavioral self-improvement; they do not modify model weights or source code.

MCP, general-purpose tools, sandbox execution, and multi-agent systems are outside
this change. Tests must not claim those capabilities. Gaze is a noisy preference
signal, not proof of comprehension or disability.

## Evidence rules

- Unit tests use explicit fixtures and test doubles. They establish deterministic
  behavior, never real provider availability or response quality.
- Integration tests use a real disposable MongoDB replica set to exercise actual
  transactions, uniqueness, restart persistence, and concurrent writes.
- Browser tests exercise the rendered application and its network contracts at
  desktop and mobile sizes. Synthetic gaze is labeled synthetic.
- Live tests require an explicitly configured provider and MongoDB. Groq is used
  for this change at the user's request. Missing credentials
  mean NOT RUN, never PASS. Provider errors must be reported and never replaced.
- Human camera calibration and comprehension quality require human observations.
  Automated output and model grading cannot establish 100% semantic correctness.
- Each test below needs an executable test, observed procedure, or an explicit
  unresolved status in VERIFICATION.md. A build alone cannot satisfy a feature.

## Setup and failure behavior

| ID | Procedure | Required result |
| --- | --- | --- |
| ENV-01 | Install declared backend/frontend dependencies in clean environments; import app; build and lint frontend. | Reproducible installation, no missing imports, build/lint pass. |
| ENV-02 | Remove MongoDB URI, selected provider key, or model individually. | Explicit configuration error on affected operation; no alternate backend/model. |
| ENV-03 | Connect to an unreachable database or standalone MongoDB without transactions. | Bounded failure; no simulated data or partial chat commit. |
| ENV-04 | Make provider return timeout, quota/auth error, empty text, invalid JSON, and invalid structured fields. | Failed run with original stage/error; no successful message or policy promotion. |
| ENV-05 | Probe health during model latency. | Health responds; synchronous provider work does not block the ASGI loop. |

## Chat and run harness

| ID | Procedure | Required result |
| --- | --- | --- |
| RUN-01 | Submit first chat with new session and request ID. | One complete exchange, one successful run, policy/trace IDs and profile returned. |
| RUN-02 | Submit follow-up with no gaze, including tracking disabled. | Conversation continues; profile is not penalized for absent tracking. |
| RUN-03 | Submit repeated identical request ID. | Stored result returned; one generation and one exchange, no duplicated effects. |
| RUN-04 | Reuse request ID with different body or replay a failed/in-progress ID. | Explicit conflict; no silent retry or substitution. |
| RUN-05 | Submit simultaneous turns against the same profile/session revision. | At most one stale snapshot commits; losing run reports conflict without partial effects. |
| RUN-06 | Inject a failure while committing message/profile/memory/episode/run writes. | Entire transaction aborts; previous state remains intact. |
| RUN-07 | Trigger failure in context, model, and commit stages. | Stage name, elapsed time and failed run visible; no double finalization masking original error. |
| RUN-08 | Read session after restarting the backend. | Server-stored exchanges retain exact response IDs and policy provenance. |
| RUN-09 | Send blank/oversized messages, extra client history, invalid roles/events and mismatched IDs. | Schema/contract errors; no fabricated context or provider call. |

## Gaze feedback and adaptation

| ID | Procedure | Required result |
| --- | --- | --- |
| GAZE-01 | Use zero, one, two/three and four visits for known zones. | Frontend flags skipped, skim, smooth and confusion respectively. |
| GAZE-02 | Turn tracking off or submit a response with no recorded fixation. | No synthetic all-skipped feedback. |
| GAZE-03 | Send confusion on response A while asking about unrelated topic B. | Reward and memory refer to A and its original question, not B. |
| GAZE-04 | Replay the same feedback for one response. | Episode/profile/memory effects applied once. Changed feedback for that ID conflicts. |
| GAZE-05 | Reference nonexistent, another user's/session's, legacy unversioned, or incorrectly scoped response zones. | Clear rejection before state changes. |
| GAZE-06 | Promote a policy between response and feedback. | Reward uses response's recorded policy, not newly active weights. |
| GAZE-07 | Exercise smooth, confusion, mixed, empty, upper/lower complexity boundary cases. | Deterministic rewards; complexity stays 1..10; no input mutation or invalid floats. |
| GAZE-08 | Calibrate physical camera; read, skip and revisit a real response. | Human records correct zone mapping and calibration behavior; denied camera gives visible error. |

## Context management

| ID | Procedure | Required result |
| --- | --- | --- |
| CTX-01 | Forge client history or attempt to overwrite stored messages through session endpoint. | Backend rejects it; generation uses stored exchanges only. |
| CTX-02 | Fill history beyond message and token budget, including large Unicode messages. | Complete recent user/assistant pairs selected; ordering maintained; count bounded. |
| CTX-03 | Make mandatory system prompt/current query exceed budget. | Explicit budget failure before generation; query never silently truncated. |
| CTX-04 | Include relevant, unrelated, low-confidence and another user's memories. | Only eligible relevant/user-wide memories from this user enter prompt. |
| CTX-05 | Inspect recorded context. | Exact prompt, query, selected message/memory IDs, omissions and budget accounting reconstruct input. |
| CTX-06 | Corrupt stored conversation ordering or required provenance. | Explicit error, not silent filtering or invented defaults. |

## Structured memory

| ID | Procedure | Required result |
| --- | --- | --- |
| MEM-01 | Read working, episodic, semantic and procedural memory after two turns. | Working=stored exchanges, episodic=feedback, semantic=evidence-backed preferences, procedural=versioned policy. |
| MEM-02 | Add repeated consistent feedback and conflicting format observations. | Evidence deduplicated; confidence/count updated; one current preference per key. |
| MEM-03 | Read semantic memory and follow its evidence references. | Every referenced episode exists; confidence is a heuristic, not a calibrated probability. |
| MEM-04 | Start a new session for same user and a separate user. | Relevant preferences cross sessions only for the same user. |

## Evaluation and self-improvement

| ID | Procedure | Required result |
| --- | --- | --- |
| EVAL-01 | Run checked-in deterministic suite on baseline and deliberately bad reward policy. | Baseline passes; bad policy fails the appropriate behavioral assertions. |
| EVAL-02 | Replay same evaluation fixture twice. | Deterministic profile/context/prompt outputs match; immutable dataset hash recorded. |
| EVAL-03 | Compare candidate and parent through the production reward/context/prompt pipeline. | Both use identical fixtures, model/settings and independent holdout data. |
| EVAL-04 | Inspect judge inputs and swapped-order grades. | Policy identities/rationale hidden; both A/B orders graded; metric-level results retained. |
| EVAL-05 | Test equality, below-threshold quality, correctness regression, gain below boundary and exact pass boundary. | Only every-gate-passing candidate is eligible; average gains cannot hide correctness regression. |
| EVAL-06 | Inject malformed/NaN/boolean grades or provider failure mid-evaluation. | Evaluation fails visibly; no promotion and no invented grades. |
| RSI-01 | Request improvement without rewarded episodes. | Explicit insufficient-evidence result; active policy unchanged. |
| RSI-02 | Generate schema-valid candidate from session evidence. | Immutable parent-linked candidate; evidence IDs and rationale persisted; profile not directly overwritten. |
| RSI-03 | Propose unchanged behavior, extra fields or attempts to alter gate thresholds. | Candidate rejected before activation. |
| RSI-04 | Return passing and failing independent evaluation fixtures. | Passing promotes, failing remains inactive; results and rationale visible. |
| RSI-05 | Change active policy while evaluation is running, or promote using wrong user's/parent's evaluation. | Compare-and-swap/evidence checks reject stale or mismatched promotion. |
| RSI-06 | Fail a write during promotion. | Active pointer and promotion result remain transactionally consistent. |
| RSI-07 | Run another improvement after successful promotion. | Next candidate descends from promoted policy; historical policies remain unchanged. |

## Observability, API and browser

| ID | Procedure | Required result |
| --- | --- | --- |
| OBS-01 | Inspect successful and failed chat/improvement runs. | Typed stage sequence, timestamps, latency, actual model/settings/usage, input snapshots and errors. |
| OBS-02 | Read trace lists/details, memory, policies and evaluation results. | User-scoped results, bounded list sizes, missing records return 404. |
| OBS-03 | Inspect structured logs. | JSON run/stage events, IDs and timing; API keys never logged. |
| UI-01 | Send two turns, reload session, start a new chat and delete a session. | Correct messages/history; no client write destroys provenance. |
| UI-02 | Open inspector tabs and run evaluation/improvement. | Loading, empty, error and result states; actual IDs/scores match API. |
| UI-03 | Fail model generation, retry explicitly and switch sessions. | Errors stay out of stored conversations; input recoverable; stale trace/error cleared. |
| UI-04 | Inspect screenshots at desktop and mobile widths. | Usable navigation, readable tables/details, no overlapping controls or horizontal overflow. |
| UI-05 | Exercise real API from browser with synthetic gaze, then reload. | Persisted data and inspectable trace match the submitted exchange. |

## Live acceptance and delivery

| ID | Procedure | Required result |
| --- | --- | --- |
| LIVE-01 | Use configured real Groq and MongoDB for two chat turns plus synthetic gaze. | Real nonempty responses, second context includes first exchange, episode/memory/trace persist. |
| LIVE-02 | Request real policy proposal and full independent evaluation. | Actual responses and grades persisted; active pointer follows gate result, including legitimate rejection. |
| LIVE-03 | Reload persisted live state through inspector after backend restart. | Same messages, policies, memory, traces and evaluation evidence. |
| LIVE-04 | Have a human compare adaptive explanations and physical camera behavior. | Record observations, limitations and misclassifications; no claim of measured benefit without evidence. |
| SHIP-01 | Audit changed files, secrets, tests and docs; inspect git diff. | No MCP or excluded functionality, credentials, generated dependencies or unverified claims committed. |
| SHIP-02 | Commit and push to user's origin; compare remote HEAD to local commit. | Verified remote commit and clean intended worktree; test report states all unresolved checks. |

## Required execution record

VERIFICATION.md must record exact commands, pass/fail counts, service/runtime
versions, browser artifacts, live run IDs when available, and any cases not run.
The design document is separate; this contract does not rely on it to define
expected behavior. No unresolved required live/human check can be relabeled as
automatically passed.
