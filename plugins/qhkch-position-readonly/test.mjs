import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const child = spawn(process.execPath, [path.join(root, "stdio-server.mjs")], { stdio: ["pipe", "pipe", "inherit"] });
let nextId = 1;
const waiting = new Map();
let buffer = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", chunk => {
  buffer += chunk;
  while (buffer.includes("\n")) {
    const i = buffer.indexOf("\n");
    const line = buffer.slice(0, i); buffer = buffer.slice(i + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    const entry = waiting.get(message.id);
    if (entry) { waiting.delete(message.id); message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result); }
  }
});

function request(method, params = {}) {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve, reject) => waiting.set(id, { resolve, reject }));
}

try {
  const init = await request("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "acceptance", version: "1" } });
  assert.equal(init.serverInfo.name, "qhkch-position-readonly");
  const listed = await request("tools/list");
  assert.deepEqual(listed.tools.map(t => t.name), ["get_contract_position"]);
  assert.deepEqual(listed.tools[0].inputSchema.required, ["code"]);

  const reports = [];
  for (const code of ["l2611", "v2611", "jm2701", "jm2705"]) {
    const result = await request("tools/call", { name: "get_contract_position", arguments: { code } });
    const data = result.structuredContent;
    assert.equal(data.code, code);
    assert.equal(data.verification.contract_match, true);
    assert.equal(data.verification.date_verified, true);
    assert.equal(data.verification.long_table_verified, true);
    assert.equal(data.verification.short_table_verified, true);
    assert.equal(data.verification.search_engine_used, false);
    assert.equal(data.long_ranking.length, 20);
    assert.equal(data.short_ranking.length, 20);
    assert.equal(data.top20_net, data.top20_long.total - data.top20_short.total);
    assert.ok(data.core_seats.length > 0);
    reports.push({ code: data.code, contract: data.contract, trading_date: data.trading_date, position_status: data.position_status, long_total: data.top20_long.total, long_change: data.top20_long.change, short_total: data.top20_short.total, short_change: data.top20_short.change, net: data.top20_net, core_seats: data.core_seats.slice(0, 5) });
  }
  console.log(JSON.stringify({ schema_tool_count: listed.tools.length, tool: listed.tools[0], acceptance: reports }, null, 2));
} finally {
  child.kill();
}
