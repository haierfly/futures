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
