import json
import os
import time
import threading
import math
import httpx
from models import ModelResult


class ModelError(RuntimeError):
    pass


_pacing_lock = threading.Lock()
_next_request = 0.0


def pace_groq():
    global _next_request
    interval = float(os.getenv("GROQ_REQUEST_INTERVAL_SECONDS", "0"))
    if not math.isfinite(interval) or not 0 <= interval <= 60:
        raise ModelError("GROQ_REQUEST_INTERVAL_SECONDS must be between 0 and 60")
    if interval == 0:
        return
    with _pacing_lock:
        delay = _next_request - time.monotonic()
        if delay > 0:
            time.sleep(delay)
        _next_request = time.monotonic() + interval


def required(name):
    value = os.getenv(name)
    if not value:
        raise ModelError(f"{name} must be set")
    return value


def generate(system_prompt, query, history=(), *, json_mode=False, temperature=0.0):
    provider = required("MODEL_PROVIDER")
    max_output_tokens = 2048
    if provider == "groq":
        model = required("GROQ_MODEL")
        key = required("GROQ_API_KEY")
        pace_groq()
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend({"role": item["role"], "content": item["content"]} for item in history)
        messages.append({"role": "user", "content": query})
        payload = {"model": model, "messages": messages, "temperature": temperature,
                   "max_completion_tokens": max_output_tokens}
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        try:
            with httpx.Client(timeout=60.0, transport=httpx.HTTPTransport(retries=0)) as client:
                response = client.post("https://api.groq.com/openai/v1/chat/completions",
                                       headers={"Authorization": f"Bearer {key}"}, json=payload)
            if response.status_code != 200:
                raise ModelError(f"Groq HTTP {response.status_code}: {response.text[:600].replace(key, '[REDACTED]')}")
            data = response.json()
            choice = data["choices"][0]
            if choice["finish_reason"] != "stop":
                raise ModelError(f"Groq generation did not finish: {choice['finish_reason']}")
            text = choice["message"]["content"]
            input_tokens, output_tokens = data["usage"]["prompt_tokens"], data["usage"]["completion_tokens"]
            actual_model = data["model"]
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as error:
            raise ModelError(f"Groq request failed: {type(error).__name__}: {error}") from error
    elif provider == "gemini":
        import google.generativeai as genai
        model = required("GEMINI_MODEL")
        genai.configure(api_key=required("GEMINI_API_KEY"))
        client = genai.GenerativeModel(model, system_instruction=system_prompt)
        contents = [{"role": "user" if item["role"] == "user" else "model", "parts": [item["content"]]}
                    for item in history]
        contents.append({"role": "user", "parts": [query]})
        config = {"temperature": temperature, "max_output_tokens": max_output_tokens}
        if json_mode:
            config["response_mime_type"] = "application/json"
        try:
            response = client.generate_content(contents, generation_config=config,
                                               request_options={"timeout": 60, "retry": None})
            if response.candidates[0].finish_reason.name != "STOP":
                raise ModelError("Gemini generation did not finish")
            text = response.text
            input_tokens = response.usage_metadata.prompt_token_count
            output_tokens = response.usage_metadata.candidates_token_count
            actual_model = model
        except Exception as error:
            raise ModelError(f"Gemini generation failed: {type(error).__name__}: {error}") from error
    else:
        raise ModelError(f"unsupported MODEL_PROVIDER: {provider}")
    if not isinstance(text, str) or not text.strip():
        raise ModelError("provider returned an empty response")
    return ModelResult(text=text.strip(), provider=provider, model=actual_model,
                       temperature=temperature, max_output_tokens=max_output_tokens,
                       input_tokens=input_tokens, output_tokens=output_tokens)


def structured(system_prompt, query, schema):
    result = generate(system_prompt + "\nReturn only a JSON object matching this schema:\n" +
                      json.dumps(schema.model_json_schema()), query, json_mode=True)
    try:
        parsed = schema.model_validate_json(result.text)
    except ValueError as error:
        raise ModelError(f"invalid structured {schema.__name__} output: {error}") from error
    return parsed, result
