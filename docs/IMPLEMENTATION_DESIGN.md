# FocalPoint Adaptive System Design

Status: implementation contract. See ACCEPTANCE_TESTS.md for the independent
test specification, and VERIFICATION.md for observed results.

## Outcome and scope

Keep the gaze-aware chat product. Add a typed execution harness, bounded server
context, persistent working/episodic/semantic/procedural memory, traces and
operational inspection, a repeatable evaluation suite, and evaluation-gated
policy self-improvement. MCP is excluded. No autonomous code execution or
multi-agent framework is required by this product.

The existing program currently has hardcoded adaptation rules, frontend-owned
conversation persistence, and a session meta-agent that writes live preferences
directly. The replacement makes evidence, execution and promotion inspectable.

## Explicit provider configuration

MODEL_PROVIDER selects groq or gemini. Each adapter requires its own key and model.
Groq is the provider selected for this implementation's live tests. Provider
selection never changes on error. Calls have explicit timeouts, no hidden
retry, strict structured output validation, and recorded model/token usage.
Secrets remain in the ignored .env file. Application logs never record headers.

## Data ownership and invariants

- The server stores all exchanges. Clients supply new messages and gaze feedback,
  never authoritative history. Legacy sessions remain readable; legacy feedback
  without policy provenance is rejected with an explicit explanation.
- Per-user profile revision and per-session revision guard concurrent writes.
  Model execution occurs outside transactions; commit uses optimistic checks.
  A stale run fails visibly. All profile, episode, memory, exchange and successful
  run writes commit in one MongoDB transaction. MongoDB must be a replica set.
- Request IDs reserve runs atomically. Identical completed requests return the
  saved response; different payloads, running or failed IDs return conflicts.
  A deliberate retry uses a new request ID. Feedback is deduplicated by response
  ID plus payload hash, independently of request retries.
- Policy content is immutable. Per-user active-policy state is authoritative;
  lifecycle is derived from evaluations/promotion records, not in-place policy
  changes. Initial profile and baseline policy creation are explicit defaults,
  not service-failure substitutions.
- This remains a local demo with a selected user ID, not an authenticated hosted
  service. Every query is user-scoped, but a supplied user ID is not authentication.

## Chat execution

Fixed stages: load snapshot -> validate feedback -> adapt in memory -> select
context -> generate -> atomic commit. Each stage records inputs, outputs,
duration and terminal errors on the run. No dynamic agent spawning or looping.

Feedback must reference a stored assistant response in this user/session and
use response-scoped zone IDs. Its reward uses that response's policy and original
question. Missing gaze is absence of evidence and does not penalize the profile.
Tracking disabled or no fixations produces no feedback in the frontend.

Profile and semantic memory changes remain staged until successful generation
and commit. Failing generation therefore cannot leave half-applied adaptation.

## Context and memory

Working memory is the stored conversation; episodic memory contains the original
question/answer, gaze, reward, policy and profile transition. Semantic memory
stores a small set of derived format/topic preferences with timestamps, source
episode IDs and heuristic confidence. Procedural memory is the immutable policy.
These names describe actual stored data, not four separate agent subsystems.

Context selection retains complete recent user/assistant pairs. Relevant topic
memories and user-wide preferences are selected deterministically. The complete
system prompt, current query, memory framing and history share a bounded budget.
UTF-8 byte count plus message overhead is a conservative token upper-bound
estimate; it is recorded as such and never presented as exact token usage.
Actual provider usage is recorded separately. Mandatory content exceeding the
budget fails explicitly; historical omissions are intentional and traceable.

The exact prompt/history/query and memory IDs are saved in the trace, allowing
input reconstruction, not a promise of identical stochastic provider output.

## Evaluation

A checked-in dataset contains deterministic reward/profile/budget invariants
and independent holdout question/profile/feedback fixtures with expected facts.
Dataset content is hashed into every result. Fixture replay uses the same reward,
context and prompt functions as chat. Baseline and candidate use identical model
settings and input evidence.

For each holdout, generate both answers and grade in both A/B orders. The judge
sees the reference facts and reader needs, not policy IDs or proposal rationale.
Store raw answers, metric-level grades, judge rationale, actual model/usage and
case-level results. Provider or schema failure fails the evaluation visibly.

Promotion gates are code-owned: deterministic checks all pass; every answer meets
the correctness floor; no case regresses in correctness; mean quality reaches
the minimum; mean gain exceeds the configured fixed minimum. A small holdout and
model judge are regression safeguards, not proof of human comprehension.
Rejection is a valid measured result. No fabricated positive improvement.

## Behavioral self-improvement

An explicit session-improvement command loads rewarded episodes and proposes a
bounded change to prompt instructions, reward weights, adaptation deltas or
context limits. The proposer cannot change baseline identity, safety bounds,
evaluation dataset, grading rubric or promotion thresholds. Output is strict
schema-validated and unchanged proposals are rejected.

Persist candidate and its parent/evidence/rationale, evaluate against its parent,
then atomically compare-and-swap the user's active pointer only if the independent
result passed and the parent is still active. No candidate directly edits the
profile. Repeated runs can improve the previous promoted policy, giving a bounded
recursive behavioral improvement loop, without weight training or source edits.

## API and inspector

Chat returns the exchange, current profile and trace summary. Read endpoints
provide sessions, policies, runs/traces, memory and evaluation results with bounded
lists and user scoping. Explicit commands evaluate a policy or improve a session.
FastAPI sync handlers put blocking database/model work in its threadpool.

The existing chat keeps its visual design. Add a responsive inspector with tabs
for traces, memory, policies and evaluations, plus explicit run actions. It
displays loading, error, empty, candidate, rejected and promoted states using
stored records. Session-end improvement sends the final observed feedback first
when available so the last answer's evidence is not lost.

## Verification and delivery

Use meaningful pure-function tests, transaction/concurrency integration tests
against a disposable Mongo replica set, browser workflows and screenshots, and
real Groq chat/proposal/judging. Test doubles are restricted to test fixtures.
Record unavailable physical camera checks and any provider/credential blockers
without calling them passes. Update documentation to match implemented behavior,
review the diff, then commit and push the verified change to the user's origin.
