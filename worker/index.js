const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, x-api-token",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, cors);
    }

    if (!env.GEMINI_API_KEY) {
      return json({ error: "GEMINI_API_KEY is not set on the worker" }, 500, cors);
    }

    const token = request.headers.get("x-api-token");
    if (env.API_TOKEN && token !== env.API_TOKEN) {
      return json({ error: "Unauthorized" }, 401, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400, cors);
    }

    const contents = (body.messages || []).map((m) => ({
      role: m.role === "model" ? "model" : "user",
      parts: typeof m.text === "string" ? [{ text: m.text }] : [{ text: "" }],
    }));

    if (contents.length === 0) {
      return json({ error: "messages is empty" }, 400, cors);
    }

    const model = body.model || env.MODEL || "gemini-2.5-pro";
    const stream = body.stream !== false;

    if (stream) {
      return await streamResponse(model, contents, env, cors);
    }
    return await plainResponse(model, contents, env, cors);
  },
};

async function plainResponse(model, contents, env, cors) {
  const url = `${API_BASE}/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents }),
  });

  if (!r.ok) {
    const details = await r.text();
    return json({ error: `Gemini error ${r.status}`, details: details.slice(0, 500) }, r.status, cors);
  }

  const data = await r.json();
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || "")
    .join("");
  return json({ text }, 200, cors);
}

async function streamResponse(model, contents, env, cors) {
  const url = `${API_BASE}/models/${model}:streamGenerateContent?alt=sse&key=${env.GEMINI_API_KEY}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents }),
  });

  if (!r.ok) {
    const details = await r.text();
    return json({ error: `Gemini error ${r.status}`, details: details.slice(0, 500) }, r.status, cors);
  }

  return new Response(r.body, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}