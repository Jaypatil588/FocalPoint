import { useEffect, useRef, useState } from 'react';
import { X, RefreshCw, Play, FlaskConical } from 'lucide-react';
import { apiRequest } from '../utils/api';

const USER = 'user_id=demo_user';
const TABS = ['Runs', 'Memory', 'Policies', 'Evaluations'];

export default function Inspector({ sessionId, busy, onImprove, onClose }) {
  const [tab, setTab] = useState('Runs');
  const [resource, setResource] = useState(null);
  const data = resource?.tab === tab ? resource.value : null;
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const closeRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const keyboard = event => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const elements = [...dialogRef.current.querySelectorAll('button:not(:disabled), summary')];
        const first = elements[0], last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('keydown', keyboard); previous?.focus(); };
  }, [onClose]);

  useEffect(() => {
    let active = true;
    setPending(true);
    setError(null);
    setDetail(null);
    setResource(null);
    const route = tab.toLowerCase();
    const suffix = tab === 'Memory' ? `&session_id=${encodeURIComponent(sessionId)}` : '';
    apiRequest(`/inspect/${route}?${USER}${suffix}`)
      .then(result => { if (active) setResource({ tab, value: result }); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setPending(false); });
    return () => { active = false; };
  }, [tab, revision, sessionId]);

  async function action(fn) {
    setPending(true);
    setError(null);
    try {
      setDetail(await fn());
      if (tab === 'Policies') {
        setResource({ tab, value: await apiRequest(`/inspect/policies?${USER}`) });
      }
    } catch (err) { setError(err.message); }
    finally { setPending(false); }
  }

  return <div className="inspector-backdrop">
    <section ref={dialogRef} className="inspector" role="dialog" aria-modal="true" aria-labelledby="inspector-title">
      <header className="inspector-header">
        <h2 id="inspector-title">FocalPoint Inspector</h2>
        <button className="icon-btn" aria-label="Refresh inspector" title="Refresh" disabled={pending || busy} onClick={() => setRevision(v => v + 1)}><RefreshCw size={18} /></button>
        <button ref={closeRef} className="icon-btn" aria-label="Close inspector" title="Close" onClick={onClose}><X size={20} /></button>
      </header>
      <nav className="inspector-tabs" aria-label="Inspector views">
        {TABS.map(name => <button key={name} aria-current={name === tab ? 'page' : undefined}
          disabled={pending || busy} onClick={() => setTab(name)}>{name}</button>)}
      </nav>
      <div className="inspector-content">
        {error && <p className="inspector-error" role="alert">{error}</p>}
        {(pending || busy) && <p role="status">Running...</p>}
        {tab === 'Runs' && data && <>
          {data.length === 0 && <p>No runs recorded.</p>}
          {data.map(run => <button className="inspector-row" key={run.run_id} disabled={pending || busy}
            onClick={() => action(() => apiRequest(`/inspect/runs/${encodeURIComponent(run.run_id)}?${USER}`))}>
            <strong>{run.run_type}</strong><span className={`status-${run.status}`}>{run.status}</span>
            <small>{new Date(run.started_at).toLocaleString()}</small><code>{run.run_id}</code>
          </button>)}
        </>}
        {tab === 'Memory' && data && Object.entries(data).map(([kind, values]) => <details key={kind} open={kind === 'semantic'}>
          <summary>{kind} {Array.isArray(values) ? `(${values.length})` : ''}</summary>
          <pre>{JSON.stringify(values, null, 2)}</pre>
        </details>)}
        {tab === 'Policies' && data && <>
          <button className="inspector-command" disabled={pending || busy} onClick={() => action(onImprove)}>
            <Play size={16} /> Improve Current Session
          </button>
          {data.policies.map(policy => <div className="inspector-policy" key={policy.policy_id}>
            <strong>{policy.policy_id === data.active_policy_id ? 'Active' : 'Historical / candidate'}</strong>
            <code>{policy.policy_id}</code><p>{policy.rationale}</p>
            <button className="inspector-command" disabled={pending || busy} onClick={() => action(() =>
              apiRequest(`/inspect/policies/${encodeURIComponent(policy.policy_id)}/regression?${USER}`, { method: 'POST' }))}>
              <FlaskConical size={16} /> Run Regression
            </button>
            <details><summary>Policy</summary><pre>{JSON.stringify(policy, null, 2)}</pre></details>
          </div>)}
        </>}
        {tab === 'Evaluations' && data && <>
          {data.length === 0 && <p>No evaluations recorded.</p>}
          {data.map(evaluation => <button className="inspector-row" key={evaluation.evaluation_id} disabled={pending || busy}
            onClick={() => action(() => apiRequest(`/inspect/evaluations/${evaluation.evaluation_id}?${USER}`))}>
            <strong>{evaluation.status}</strong><span>{evaluation.gate ? (evaluation.gate.passed ? 'Gate passed' : 'Gate rejected') : 'No gate result'}</span>
            <small>{new Date(evaluation.created_at).toLocaleString()}</small><code>{evaluation.evaluation_id}</code>
          </button>)}
        </>}
        {detail && <section className="inspector-detail" aria-label="Selected result"><h3>Result</h3><pre>{JSON.stringify(detail, null, 2)}</pre></section>}
      </div>
    </section>
  </div>;
}
