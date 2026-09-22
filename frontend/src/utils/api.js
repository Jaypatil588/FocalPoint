const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

async function parseJsonResponse(response, context) {
  const body = await response.text();
  let parsed = null;

  if (body) {
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error(`${context} returned non-JSON response: ${body}`);
    }
  }

  if (!response.ok) {
    const detail = parsed?.detail || parsed?.message || body || response.statusText;
    throw new Error(`${context} failed (${response.status}): ${detail}`);
  }

  return parsed;
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  return parseJsonResponse(response, path);
}

export async function sendChatMessage(message, previousResponseId, gazeEvents, sessionId) {
  return apiRequest('/chat', {
    method: 'POST',
    body: JSON.stringify({
      user_id: 'demo_user',
      message,
      session_id: sessionId,
      request_id: crypto.randomUUID(),
      previous_response_id: previousResponseId,
      gaze_events: gazeEvents,
    }),
  });
}

export async function improveSession(sessionId, previousResponseId, gazeEvents) {
  return apiRequest('/session/end', {
    method: 'POST',
    body: JSON.stringify({ user_id: 'demo_user', session_id: sessionId,
      request_id: crypto.randomUUID(), previous_response_id: previousResponseId, gaze_events: gazeEvents }),
  });
}
