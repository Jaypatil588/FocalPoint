# FocalPoint Verification Record

Observed on 2026-09-22. Automated and live-provider acceptance are verified below.
Physical camera accuracy and human comprehension acceptance remain **NOT RUN**:
the user declined the requested physical-camera check. This record does not claim
100% correctness, measured learning benefit, or successful live policy promotion.

## Environment and commands

macOS; Python 3.11.13; Node 26.7.0; MongoDB 7.0.14, a real single-node replica set
named `focalpoint`; FastAPI 0.115.0; Pydantic 2.9.2; PyMongo 4.8.0; HTTPX 0.28.1;
Vite 8.1.0; Playwright 1.55.1 with explicitly selected Chrome 153.0.8010.53.
Backend: `http://127.0.0.1:8000`; frontend: `http://localhost:5173`.

| Command | Observed result |
| --- | --- |
| `uv venv .runtime/install-venv --python .venv/bin/python` then `uv pip install --python .runtime/install-venv/bin/python -r backend/requirements-test.txt` | Clean environment, 51 dependencies installed; importing `main.app` from `backend` reports FocalPoint API 2.0.0. |
| `npm ci --prefix .runtime/install-node` and `npm ci --prefix .runtime/install-frontend` after copying each package manifest/lockfile into an empty directory | Clean root and frontend dependency installs passed: 72 and 300 packages. |
| `.runtime/install-venv/bin/python -m pytest -q` | 65 passed using the clean backend environment. |
| `.venv/bin/python -m pytest --cov=backend/services --cov=backend/db --cov=backend/routes --cov-report=term-missing -q` | 65 passed; 93% statement coverage across those three production directories (645/692 statements). |
| `npm run eval` | 25/25 deterministic checks passed; dataset hash below. |
| `npm run build` | Production frontend build passed. |
| `npm --prefix frontend run lint` | Exit 0; existing `Button.jsx` fast-refresh export warning. |
| `PLAYWRIGHT_CHANNEL=chrome npx playwright test` | 7 passed, 1 intentional mobile-camera skip; 9.6 seconds. |
| `npm audit --omit=optional` and `npm --prefix frontend audit --omit=optional` | Zero reported vulnerabilities; clean installs' complete audits also reported zero. |
| `npm run test:live` | Real Groq chat, feedback, proposal, generation and judging completed; candidate legitimately rejected. |
| `node scripts/browser-live.cjs` | Real browser/API chat, rendered zone IDs, synthetic feedback, reload and trace inspection passed. |
| `.venv/bin/python scripts/verify-persistence.py capture`, backend stop/start, then `.venv/bin/python scripts/verify-persistence.py verify` | Six API records identical across actual process restart. |
| `git diff --check` | Passed before delivery. |

One backend dependency warning concerns Starlette's deprecated AnyIO
`BlockingPortal` alias. Node emits a `module.register()` deprecation warning.
Clean npm installs warned about unapproved optional/install scripts; installation
succeeded. MongoDB's runtime launcher and real database tests were verified
separately. Bundled Chromium installation stalled in this environment; it was
stopped and Chrome was selected explicitly. No application fallback was added.
Gemini remains a selectable adapter but was not live-tested; Groq was requested.

## Requirement evidence

Test names include the acceptance IDs they cover. All integration tests use a
real disposable MongoDB database and actual transactions; model test doubles in
those tests do not establish provider availability or answer quality.

| Acceptance cases | Evidence and status |
| --- | --- |
| ENV-01 | Clean installs, clean-environment tests, import, build and lint above: PASS with listed warnings. |
| ENV-02 | `test_provider.py` missing provider/key/model; `test_inspection_memory.py` missing URI: PASS for selected Groq provider. |
| ENV-03 | Unreachable database and real standalone MongoDB rejection, with unchanged messages/profile: PASS. |
| ENV-04 | Quota, auth, timeout, empty/truncated response, malformed JSON/schema tests; failed generation rollback and malformed judging tests: PASS. Exactly one HTTP call, no substituted output. |
| ENV-05 | `test_health_during_model_call`: PASS. |
| RUN-01, RUN-02 | First/follow-up exchange and absent-feedback assertions in `test_chat.py`, plus real Groq run: PASS. |
| RUN-03, RUN-04 | Completed replay, changed payload, failed/in-progress ID conflicts; improvement replay: PASS. |
| RUN-05 | Two simultaneous turns with synchronized model calls and real transactions: one commits, loser has no partial effects: PASS. |
| RUN-06, RUN-07 | Injected commit/model/context failures, state rollback and failed stages; 64-stage overflow test: PASS. |
| RUN-08 | Actual backend PID changed from 42380 to 45479; full stored session/trace snapshots unchanged: PASS. |
| RUN-09 | Parameterized invalid contract tests, client-history rejection and malformed history tests: PASS. |
| GAZE-01, GAZE-02 | Browser synthetic zone classifications, tracking disabled and no-fixation cases: PASS; not physical tracking evidence. |
| GAZE-03, GAZE-04 | Original response/question provenance and repeated/changed feedback tests: PASS. |
| GAZE-05, GAZE-06 | Cross-user/session/legacy/zone rejection and recorded-policy reward tests: PASS. |
| GAZE-07 | Pure reward/profile tests and deterministic boundary/mixed-feedback fixtures: PASS. |
| GAZE-08 | Desktop denied-camera behavior: PASS. Physical calibration/read/skip/revisit accuracy: NOT RUN, user declined. Mobile permission test skipped because camera panel is desktop-only. |
| CTX-01 | Forged history and obsolete session-write endpoint rejected: PASS. |
| CTX-02, CTX-03 | Complete exchange selection, Unicode full-input bound, oversized mandatory prompt/query failure: PASS. |
| CTX-04 | Relevant/confident memory selection, same-user cross-session retrieval and cross-user exclusion: PASS. |
| CTX-05 | Stored context inspected in integration, live API and browser runs: PASS. Exact selected inputs and conservative budget are distinct from actual provider token usage. |
| CTX-06 | Invalid stored exchange ordering/missing required message identifiers: PASS. |
| MEM-01, MEM-03 | Four memory views and semantic episode provenance assertions, also real live evidence: PASS. |
| MEM-02 | Repeated evidence deduplication, confidence/count change and conflicting preference replacement: PASS. |
| MEM-04 | Same-user/new-session retrieval and separate-user exclusion: PASS. |
| EVAL-01, EVAL-02 | Baseline passes; intentionally bad policy fails; deterministic replay and dataset hash assertions: PASS. |
| EVAL-03 | Full paired pipeline including fixture history and relevant semantic memory; production replay functions; real Groq evaluation: PASS. |
| EVAL-04 | Two swapped answer orders, hidden policy identities/rationale, retained raw grades/outputs: PASS. |
| EVAL-05 | Equality, correctness floor/regression, quality floor and minimum-gain boundary tests: PASS. |
| EVAL-06 | Malformed judge/provider failure and NaN/infinite/boolean/out-of-range/string grade rejection: PASS. |
| RSI-01 | Insufficient rewarded evidence rejects without candidate activation: PASS. |
| RSI-02 | Schema-valid immutable parent-linked evidence-backed proposal: PASS in integration and live Groq runs. |
| RSI-03 | No-op behavior, extra fields and gate-threshold modification rejection: PASS. |
| RSI-04 | Passing fixture promotes; failing fixture and real rejected candidate remain inactive: PASS. Promotion is proven with test-double grades, not claimed as a real model quality improvement. |
| RSI-05 | Stale active pointer and mismatched evaluation user/parent/candidate rejection: PASS. |
| RSI-06 | Failure during terminal promotion transaction leaves active pointer unchanged: PASS. |
| RSI-07 | Two passing fixture iterations preserve baseline and parent-link next candidate to promoted policy: PASS. |
| OBS-01 | Stored successful/failed spans, timestamps/duration, context and provider usage: PASS. |
| OBS-02 | Scoped list/detail/memory/policy/evaluation routes and missing-record responses: PASS. |
| OBS-03 | Parsed JSON stage-log assertions, fixed event fields and provider-secret redaction tests: PASS. |
| UI-01, UI-03 | Desktop/mobile chat, explicit new-ID retry, reload, new chat, session switch/delete and recoverable input: PASS. |
| UI-02 | All inspector views/actions, stable rejection result, loading/empty/error/refresh states: PASS. |
| UI-04 | Desktop 1440x1000 and mobile 390x844 screenshots inspected; no page horizontal overflow: PASS. |
| UI-05 | Unmocked browser/API chat plus synthetic feedback and reload: PASS. |
| LIVE-01, LIVE-02 | Real Groq/Mongo run detailed below: PASS for execution and gate behavior. |
| LIVE-03 | Six complete API snapshots unchanged after process restart; browser reopened persisted Groq trace: PASS. |
| LIVE-04 | Human explanation comparison and physical tracking observations: NOT RUN. No measured comprehension benefit claimed. |
| SHIP-01 | Diff, secret/ignored-file audit and current docs reviewed; excluded MCP/multi-agent/sandbox features not added. |
| SHIP-02 | Implementation commit pushed to origin/main; remote SHA matched local HEAD and intended worktree was clean. See delivery record below. |

## Real provider evidence

Provider: `groq`; model: `openai/gpt-oss-120b`. Requests paced at an explicitly
configured 15-second interval in one process. No provider retries or substitutions.

- User: `live_2b581ad4d4fd`; session: `abfc947a676b44a7aec67986356763db`.
- Chat runs: `live_2b581ad4d4fd:b1cd5bf80cb3448aa98e5026eaf13714` and
  `live_2b581ad4d4fd:851be409aee1478b870d4a9c6daaccbb`.
- Improvement run: `live_2b581ad4d4fd:2ae3d91dc04142159c15ebffd6e58a7b`.
- Evaluation: `2f83c5a4d83749e1943ffef94a6bcf63`.
- Candidate: `bc3b4e0f02e6420b8ffeaf29264981d0`.
- Dataset hash: `c80da0ac1229a00fba3372417ac309c4e9731f58117f2cf79719cabd989d4c6f`.
- Four holdouts; eight generated answers; eight swapped-order judge calls.
- Baseline mean: **8.6458**; candidate mean: **8.7917**; gain: **0.145833**.
- Required gain: **0.2**. Result: **rejected**. Active policy remains
  `live_2b581ad4d4fd:baseline-v1`.

This validates rejection rather than claiming improvement. Scores are small-suite
model judgments, not human outcome measurements. An earlier attempt encountered
HTTP 429 and failed visibly without promotion; the successful run was an explicit
new run after configuring pacing, not an automatic retry.

The live browser session `s_1790066517007_h8q1` used rendered response zone
`c4dc65ab03e44a72915b15c4c8bdc157:line_0` for **synthetic** confusion feedback.
It restored response `7f4d82287de94e6c87af4126a8ef6b87` after reload, opened
run `demo_user:cd10d2c6-d32c-4c0d-a659-d0d657f2652e`, and recorded no browser errors.

## Browser artifacts and persistence

Local artifacts are deliberately ignored, not included in Git:

- `.runtime/inspector-desktop.png`, `.runtime/inspector-mobile.png`.
- `.runtime/chat-desktop.png`, `.runtime/chat-mobile.png`.
- `.runtime/live-browser-desktop.png`, `.runtime/inspector-after-restart.png`.
- `.runtime/live-acceptance.json`, `.runtime/live-browser.json`.
- `.runtime/persistence-before-restart.json`, `.runtime/persistence-verification.json`.

The persistence script captures sessions, memory, policies, evaluation, chat run
and improvement run. After stopping the old uvicorn process and starting a new
one, all six complete JSON records matched. The inspector independently rendered
the persisted trace after restart. This is stronger than reconnecting a DB client
without restarting the backend, which the live script also checks.

## Delivery

Implementation commit: `771079a4b0fc66066f415dd00c255315ecae0183`.
Pushed to `https://github.com/Jaypatil588/FocalPoint.git`, branch `main`.
`git ls-remote origin refs/heads/main` returned that exact SHA, matching
`git rev-parse HEAD`; `git status --porcelain` was empty. This documentation-only
follow-up records the observed delivery check without changing tested code.

## Unresolved acceptance

GAZE-08's physical accuracy component and LIVE-04 remain unverified. Automated
tests cannot establish a person's gaze calibration or comprehension. The user
declined that manual check; it is neither a pass nor a reason to invent evidence.
The broader request for every required test to pass is therefore not fully met,
even though the implemented backend/browser/live-provider paths have executable
evidence. No real-provider successful promotion or benchmark-quality improvement
is asserted, and this local selected-user demo is not an authenticated service.
