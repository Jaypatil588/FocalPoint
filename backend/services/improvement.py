from db.mongo import get_db
from db.users import get_user
from db.sessions import get_session
from db.memories import get_semantic_memories
from db.episodes import get_session_episodes
from db.policies import get_active_policy, insert_candidate
from services.chat_harness import prepare_feedback, commit_feedback
from services.evaluation import run_evaluation
from services.meta_agent import propose_candidate_policy
from services.policy_defaults import now
from services.tracing import RunTrace, ConflictError


def promote(db, user_id, baseline, candidate, evaluation, trace, response):
    with db.client.start_session() as transaction:
        with transaction.start_transaction():
            stored = db.evaluations.find_one({"_id": evaluation["evaluation_id"], "user_id": user_id,
                                             "status": "completed", "baseline_policy_id": baseline.policy_id,
                                             "candidate_policy_id": candidate.policy_id}, session=transaction)
            if stored is None or not stored["gate"]["passed"]:
                raise ConflictError("promotion requires a matching passing evaluation")
            if candidate.parent_policy_id != baseline.policy_id or candidate.user_id != user_id:
                raise ConflictError("candidate parent or owner mismatch")
            updated = db.policy_state.update_one({"_id": user_id, "active_policy_id": baseline.policy_id},
                                                 {"$set": {"active_policy_id": candidate.policy_id,
                                                           "evaluation_id": evaluation["evaluation_id"],
                                                           "promoted_at": now()}}, session=transaction)
            if updated.modified_count != 1:
                raise ConflictError("active policy changed while evaluation ran")
            trace.complete(response, transaction)


class ImprovementService:
    def run(self, request):
        trace = RunTrace("improvement", request)
        if trace.cached is not None:
            return trace.cached
        db = get_db()
        try:
            with trace.span("evidence.load") as span:
                session = get_session(request.user_id, request.session_id)
                profile = get_user(request.user_id)
                active = get_active_policy(request.user_id)
                memories = get_semantic_memories(request.user_id)
                staged, _, changed, episode = prepare_feedback(request, session, profile, memories)
                # Final-answer feedback is a separate evidence commit, before any policy proposal.
                if episode is not None:
                    with db.client.start_session() as transaction:
                        with transaction.start_transaction():
                            commit_feedback(db, request, profile, staged, changed, episode, transaction)
                            updated = db.sessions.update_one({"_id": request.session_id, "revision": session["revision"]},
                                                             {"$inc": {"revision": 1}}, session=transaction)
                            if updated.modified_count != 1:
                                raise ConflictError("session changed while recording final feedback")
                episodes = get_session_episodes(request.user_id, request.session_id)
                if not episodes:
                    raise ValueError("session has no rewarded episodes; record gaze feedback first")
                span["output"] = {"episode_ids": [episode["episode_id"] for episode in episodes]}
            candidate = propose_candidate_policy(active, episodes, trace)
            with trace.span("candidate.persist"):
                insert_candidate(candidate)
            evaluation = run_evaluation(request.user_id, active, candidate, trace)
            promoted = evaluation["gate"]["passed"]
            response = {"candidate_policy_id": candidate.policy_id, "promoted": promoted,
                        "active_policy_id": candidate.policy_id if promoted else active.policy_id,
                        "evaluation_id": evaluation["evaluation_id"], "gate": evaluation["gate"],
                        "rationale": candidate.rationale, "trace": trace.summary()}
            with trace.span("promotion.gate", evaluation["gate"]):
                if promoted:
                    promote(db, request.user_id, active, candidate, evaluation, trace, response)
                else:
                    with db.client.start_session() as transaction:
                        with transaction.start_transaction():
                            trace.complete(response, transaction)
                trace.finished = True
            return response
        except Exception as error:
            trace.fail(error)
            raise
