import { handle } from "./server.mjs";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id",
  "cache-control": "no-store"
};

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS, ...extraHeaders }
  });
}

export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "qhkch-position-readonly", transport: "streamable-http", endpoint: "/mcp", runtime: "cloudflare-workers" });
      }
      if (url.pathname !== "/mcp") return json({ error: "Not found" }, 404);
      if (request.method === "GET") return json({ error: "This stateless MCP endpoint accepts POST requests" }, 405, { allow: "POST, OPTIONS" });
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > 1_000_000) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request body too large" } }, 413);
      const text = await request.text();
      if (text.length > 1_000_000) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request body too large" } }, 413);
      const rpc = JSON.parse(text);
      if (Array.isArray(rpc)) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Batch requests are not supported" } }, 400);
      if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") return json({ jsonrpc: "2.0", id: rpc.id ?? null, error: { code: -32600, message: "Invalid Request" } }, 400);

      const result = await handle(rpc);
      if (rpc.id === undefined || result === null) return new Response(null, { status: 202, headers: CORS_HEADERS });
      return json({ jsonrpc: "2.0", id: rpc.id, result });
    } catch (error) {
      return json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } }, 500);
    }
  }
};
