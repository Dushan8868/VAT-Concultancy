/**
 * VAT Desk — company AI server (Cloudflare Worker)
 * Keeps the Anthropic API key on the server. Staff use VAT Desk with an access code only.
 *
 * Settings (Cloudflare dashboard → Worker → Settings → Variables and Secrets):
 *   ANTHROPIC_API_KEY  (Secret)  the company's Anthropic API key
 *   ACCESS_CODE        (Secret)  code staff type into VAT Desk → AI settings
 *   ALLOWED_ORIGINS    (Text)    e.g. https://dushan8868.github.io   (comma-separate several; no trailing slash)
 *   WORKSPACE_ID       (Text, optional) only if your organisation needs the anthropic-workspace-id header
 */
const MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"];
const MAX_TOKENS = 16000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim().replace(/\/+$/, "")).filter(Boolean);
    const okOrigin = allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": okOrigin ? origin : (allowed[0] || ""),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, x-access-code",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };
    const reply = (status, message) => new Response(JSON.stringify({ error: { message } }), { status, headers: { ...cors, "content-type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply(405, "Use POST.");
    if (!okOrigin) return reply(403, "This site is not allowed to use the VAT Desk AI server.");
    if (!env.ANTHROPIC_API_KEY) return reply(500, "The server has no API key configured.");
    if (env.ACCESS_CODE && request.headers.get("x-access-code") !== env.ACCESS_CODE) return reply(401, "Access code rejected.");

    let body;
    try { body = await request.json(); } catch { return reply(400, "Invalid request."); }
    if (!Array.isArray(body.messages) || !body.messages.length) return reply(400, "No messages.");

    const headers = {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    };
    if (env.WORKSPACE_ID) headers["anthropic-workspace-id"] = env.WORKSPACE_ID;

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: MODELS.includes(body.model) ? body.model : "claude-sonnet-5-5",
        max_tokens: Math.min(Number(body.max_tokens) || 4096, MAX_TOKENS),
        messages: body.messages
      })
    });
    return new Response(upstream.body, { status: upstream.status, headers: { ...cors, "content-type": "application/json" } });
  }
};
