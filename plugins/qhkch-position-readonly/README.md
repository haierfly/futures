# 奇货可查只读持仓 MCP

通过奇货可查具体合约页面 `code=` 直接读取持仓数据，不经过搜索引擎。

## 工具

`get_contract_position(code)` 返回：

- 目标合约、交易日与持仓更新状态
- 前20多头/空头合计及日增减仓
- 前20净持仓
- 完整多头、空头龙虎榜
- 按绝对净持仓排序的核心席位
- 合约、日期、表格和合计校验结果

服务只有 HTTP GET 读取能力，不含账户、登录、下单或写入操作。

## 本地验收

```bash
node plugins/qhkch-position-readonly/test.mjs
```

## 远程 HTTPS MCP

服务端入口：

- 健康检查：`GET /health`
- Streamable HTTP MCP：`POST /mcp`

本地验证：

```bash
cd plugins/qhkch-position-readonly
npm start
```

部署后在 ChatGPT Developer Mode 中填写 `https://你的域名/mcp`。服务无账户、密码、下单或写入接口。

## Cloudflare Workers

仓库已包含 Workers 原生入口 `worker.mjs` 和 `wrangler.toml`：

```bash
cd plugins/qhkch-position-readonly
npm run deploy:cloudflare
```

当前生产端点：`https://qhkch-position-readonly.157626059.workers.dev/mcp`。

插件的 `.mcp.json` 已直接注册该远程 Streamable HTTP 端点；安装或更新插件后，新会话会从线上 `tools/list` 发现 `get_contract_position`。
