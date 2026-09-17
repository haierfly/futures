#!/usr/bin/env node

import readline from "node:readline";

const BASE_URL = "https://x.qhkch.com/variety/position";
const USER_AGENT = "qhkch-position-readonly/0.1 (+https://github.com/haierfly/futures)";
const TIMEOUT_MS = Number(process.env.QHKCH_TIMEOUT_MS || 20000);

const VARIETIES = {
  a: "豆一", ag: "白银", al: "铝", ao: "氧化铝", ap: "苹果", au: "黄金",
  b: "豆二", bb: "胶合板", bc: "国际铜", br: "丁二烯橡胶", bu: "沥青",
  c: "玉米", cf: "棉花", cj: "红枣", cs: "淀粉", cu: "铜", cy: "棉纱",
  eb: "苯乙烯", ec: "集运指数", eg: "乙二醇",
  fb: "纤维板", fg: "玻璃", fu: "燃料油",
  hc: "热卷",
  i: "铁矿石", ic: "中证500", if: "沪深300", ih: "上证50", im: "中证1000",
  j: "焦炭", jd: "鸡蛋", jm: "焦煤", jr: "粳稻",
  l: "塑料", lc: "碳酸锂", lh: "生猪", lu: "低硫燃料油",
  m: "豆粕", ma: "甲醇",
  ni: "镍", nr: "20号胶",
  oi: "菜油",
  p: "棕榈油", pb: "铅", pf: "短纤", pg: "液化石油气", pk: "花生", pp: "聚丙烯", pr: "瓶片", ps: "多晶硅",
  rb: "螺纹钢", ri: "早籼稻", rm: "菜粕", rr: "粳米", ru: "橡胶",
  sa: "纯碱", sc: "原油", sf: "硅铁", sh: "烧碱", si: "工业硅", sm: "锰硅", sn: "锡", sp: "纸浆", sr: "白糖", ss: "不锈钢",
  t: "十年国债", ta: "PTA", tf: "五年国债", tl: "三十年国债", ts: "二年国债",
  ur: "尿素",
  v: "PVC",
  wh: "强麦", wr: "线材",
  y: "豆油",
  zn: "锌"
};

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function textOf(html) {
  return decodeHtml(String(html ?? "").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function integer(value) {
  const s = textOf(value).replace(/,/g, "").replace(/[^0-9+\-]/g, "");
  if (!s || s === "+" || s === "-") return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function cell(row, className) {
  const re = new RegExp(`<td\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/td>`, "i");
  return row.match(re)?.[1] ?? null;
}

function parseNet(value) {
  const txt = textOf(value);
  const amount = integer(txt);
  if (amount === null) return { direction: "flat", amount: 0, signed: 0 };
  if (txt.includes("空")) return { direction: "short", amount: Math.abs(amount), signed: -Math.abs(amount) };
  if (txt.includes("多")) return { direction: "long", amount: Math.abs(amount), signed: Math.abs(amount) };
  return { direction: amount < 0 ? "short" : amount > 0 ? "long" : "flat", amount: Math.abs(amount), signed: amount };
}

function tableSection(html, id) {
  const match = html.match(new RegExp(`<table\\b[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/table>`, "i"));
  if (!match) throw new Error(`Missing table ${id}`);
  return match[1];
}

function parseRanking(html, side) {
  const isLong = side === "long";
  const id = isLong ? "td-variety_position_buy" : "td-variety_position_ss";
  const positionClass = isLong ? "sort-buy" : "sort-ss";
  const changeClass = isLong ? "sort-buy_chge" : "sort-ss_chge";
  const section = tableSection(html, id);
  const title = textOf(section.match(/<thead\b[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>/i)?.[1]);
  const body = section.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] ?? "";
  const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m, index) => {
    const row = m[1];
    const broker = textOf(cell(row, "sort-broker"));
    if (!broker) return null;
    const net = parseNet(cell(row, "sort-net_position"));
    return {
      rank: index + 1,
      broker,
      position: integer(cell(row, positionClass)),
      change: integer(cell(row, changeClass)),
      net_direction: net.direction,
      net_position: net.signed
    };
  }).filter(Boolean);
  const foot = section.match(/<tfoot\b[^>]*>([\s\S]*?)<\/tfoot>/i)?.[1] ?? "";
  const totalNet = parseNet(cell(foot, "text-end") && cell(foot, "sort-net_position"));
  const totalPositionMatch = foot.match(new RegExp(`data-${isLong ? "buy" : "ss"}=["'](-?\\d+)["']`, "i"));
  const totalChangeMatch = foot.match(new RegExp(`data-${isLong ? "buy_chge" : "ss_chge"}=["'](-?\\d+)["']`, "i"));
  const explicitNetMatch = foot.match(/data-net_position=["'](-?\d+)["']/i);
  return {
    title,
    rows,
    total: totalPositionMatch ? Number(totalPositionMatch[1]) : rows.reduce((s, r) => s + (r.position ?? 0), 0),
    change: totalChangeMatch ? Number(totalChangeMatch[1]) : rows.reduce((s, r) => s + (r.change ?? 0), 0),
    displayed_net: explicitNetMatch ? Number(explicitNetMatch[1]) : totalNet.signed
  };
}

function coreSeats(longRows, shortRows, limit = 10) {
  const seats = new Map();
  for (const [side, rows] of [["long", longRows], ["short", shortRows]]) {
    for (const row of rows) {
      const current = seats.get(row.broker) || { broker: row.broker, ranked_in: [], long_position: null, long_change: null, short_position: null, short_change: null, net_direction: row.net_direction, net_position: row.net_position };
      current.ranked_in.push(side);
      current[`${side}_position`] = row.position;
      current[`${side}_change`] = row.change;
      if (Math.abs(row.net_position) >= Math.abs(current.net_position)) {
        current.net_position = row.net_position;
        current.net_direction = row.net_direction;
      }
      seats.set(row.broker, current);
    }
  }
  return [...seats.values()].sort((a, b) => Math.abs(b.net_position) - Math.abs(a.net_position)).slice(0, limit);
}

function normalizeCode(raw) {
  const code = String(raw ?? "").trim().toLowerCase();
  if (!/^[a-z]{1,3}\d{3,4}$/.test(code)) throw new Error("code must be a concrete futures contract such as l2611 or jm2701");
  const prefix = code.match(/^[a-z]+/)[0];
  const variety = VARIETIES[prefix];
  if (!variety) throw new Error(`Unsupported contract prefix: ${prefix}`);
  return { code, prefix, variety };
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" }, signal: controller.signal });
    if (!response.ok) throw new Error(`QHKCH returned HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function getContractPosition(rawCode) {
  const { code, variety } = normalizeCode(rawCode);
  const url = new URL(BASE_URL);
  url.searchParams.set("code", code);
  url.searchParams.set("variety", variety);
  const html = await fetchHtml(url);
  const selected = html.match(/<option\b[^>]*value=["']([^"']+)["'][^>]*selected[^>]*>([\s\S]*?)<\/option>/i);
  const selectedCode = selected?.[1]?.toLowerCase() ?? null;
  const contract = textOf(selected?.[2]);
  const tradingDate = html.match(/<input\b[^>]*id=["']date["'][^>]*value=["']([^"']+)["']/i)?.[1] ?? null;
  const status = textOf(html.match(/<span\b[^>]*id=["']top_indexs_title_small["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
  const long = parseRanking(html, "long");
  const short = parseRanking(html, "short");
  const contractMatch = selectedCode === code && long.title.includes(contract) && short.title.includes(contract);
  if (!contractMatch) throw new Error(`Contract verification failed: requested ${code}, page selected ${selectedCode || "unknown"}`);
  if (long.rows.length !== 20 || short.rows.length !== 20) throw new Error(`Ranking completeness failed: long=${long.rows.length}, short=${short.rows.length}`);
  const top20Net = long.total - short.total;
  return {
    source: "奇货可查",
    source_url: url.toString(),
    code,
    contract,
    trading_date: tradingDate,
    position_status: status,
    position_updated: status === "持仓已更新",
    top20_long: { total: long.total, change: long.change },
    top20_short: { total: short.total, change: short.change },
    top20_net: top20Net,
    top20_net_direction: top20Net > 0 ? "long" : top20Net < 0 ? "short" : "flat",
    long_ranking: long.rows,
    short_ranking: short.rows,
    core_seats: coreSeats(long.rows, short.rows),
    verification: {
      contract_match: contractMatch,
      date_verified: /^\d{4}-\d{2}-\d{2}$/.test(tradingDate || ""),
      update_status_verified: ["持仓已更新", "持仓未更新", "无持仓数据"].includes(status),
      long_table_verified: long.rows.length === 20,
      short_table_verified: short.rows.length === 20,
      totals_verified: Number.isInteger(long.total) && Number.isInteger(short.total),
      search_engine_used: false
    }
  };
}

const TOOL = {
  name: "get_contract_position",
  description: "Directly read and verify one exact futures contract's QHKCH position page. Returns update status, trading date, top-20 long/short totals and changes, net position, full rankings, and core seats. Read-only; never uses search engines.",
  inputSchema: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      code: { type: "string", pattern: "^[A-Za-z]{1,3}[0-9]{3,4}$", description: "Exact contract code such as l2611, v2611, jm2701 or jm2705" }
    },
    required: ["code"],
    additionalProperties: false
  }
};

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handle(request) {
  if (request.method === "initialize") return { protocolVersion: "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "qhkch-position-readonly", version: "0.1.0" } };
  if (request.method === "ping") return {};
  if (request.method === "tools/list") return { tools: [TOOL] };
  if (request.method === "tools/call") {
    if (request.params?.name !== TOOL.name) throw new Error(`Unknown tool: ${request.params?.name}`);
    const data = await getContractPosition(request.params?.arguments?.code);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data };
  }
  if (String(request.method || "").startsWith("notifications/")) return null;
  throw new Error(`Method not found: ${request.method}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", async line => {
    if (!line.trim()) return;
    let request;
    try {
      request = JSON.parse(line);
      const result = await handle(request);
      if (request.id !== undefined && result !== null) send({ jsonrpc: "2.0", id: request.id, result });
    } catch (error) {
      if (request?.id !== undefined) send({ jsonrpc: "2.0", id: request.id, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } });
    }
  });
}
