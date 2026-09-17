#!/usr/bin/env node

import http from "node:http";
import { handle } from "./server.mjs";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": ALLOWED_ORIGIN,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (request.method === "OPTIONS") return sendJson(response, 204, {});
    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, { ok: true, service: "qhkch-position-readonly", transport: "streamable-http", endpoint: "/mcp" });
    }
    if (url.pathname !== "/mcp") return sendJson(response, 404, { error: "Not found" });
    if (request.method === "GET") {
      response.setHeader("allow", "POST, OPTIONS");
      return sendJson(response, 405, { error: "This stateless MCP endpoint accepts POST requests" });
    }
    if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });

    const rpc = await readJson(request);
    if (Array.isArray(rpc)) return sendJson(response, 400, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Batch requests are not supported" } });
    if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") return sendJson(response, 400, { jsonrpc: "2.0", id: rpc.id ?? null, error: { code: -32600, message: "Invalid Request" } });

    const result = await handle(rpc);
    if (rpc.id === undefined || result === null) {
      response.writeHead(202, { "access-control-allow-origin": ALLOWED_ORIGIN, "cache-control": "no-store" });
      return response.end();
    }
    return sendJson(response, 200, { jsonrpc: "2.0", id: rpc.id, result });
  } catch (error) {
    return sendJson(response, 500, { jsonrpc: "2.0", id: null, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } });
  }
});

server.listen(PORT, HOST, () => {
  process.stderr.write(`qhkch-position-readonly listening on http://${HOST}:${PORT}/mcp\n`);
});
