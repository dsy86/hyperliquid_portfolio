# Hyperliquid Portfolio API 中文文档

基础 URL：

```text
https://hyperliquid-portfolio.pages.dev
```

当前网页前端使用以下 API 作为 Hyperliquid 数据和操作层：

- `GET /api/snapshot`
- `GET /api/agent-role`
- `GET /api/cctp-fee`
- `POST /api/actions/prepare`
- `POST /api/actions/submit`

旧的 `GET /api/portfolio` 已删除。它不是前端数据源，并且与新的 `GET /api/snapshot` 功能重叠。

## 签名模型

API 不保存私钥，也不会替用户完成签名。

所有需要 Hyperliquid 签名的操作使用以下流程：

1. 调用 `POST /api/actions/prepare`，传入要执行的操作参数。
2. 客户端使用用户钱包或 Agent Wallet 对返回的 `action` 签名。
3. 调用 `POST /api/actions/submit`，提交 `action`、`signature` 和 `nonce`。

网页前端在第 2 步通过浏览器钱包完成签名。TG bot 或其他服务也可以复用同一套 API，只要自己完成签名即可。

## 通用错误格式

错误返回是 JSON：

```json
{
  "error": "ERROR_CODE",
  "message": "可读错误信息"
}
```

## GET /api/snapshot

返回前端使用的账户快照：账户模式、余额、汇总数据、Perps 持仓和当前挂单。

### 请求

```http
GET /api/snapshot?address=0x...
```

### 查询参数

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `address` | 是 | 要查询的 EVM 地址，必须是 `0x` 地址。 |

### 成功返回

```json
{
  "accountMode": {
    "mode": "default",
    "isUnified": false
  },
  "summary": {
    "accountValue": "27105.276532",
    "perpAccountValue": "27105.276532",
    "spotAccountValue": "0",
    "withdrawable": "17289.848266",
    "marginUsed": "9815.428266"
  },
  "spotBalances": [
    {
      "coin": "USDC",
      "tokenId": "0x6d1e7cde53ba9467b783cb7c530ce054",
      "tokenKey": "USDC:0x6d1e7cde53ba9467b783cb7c530ce054",
      "total": "0.0",
      "hold": "0.0",
      "available": "0",
      "entryNtl": "0.0"
    }
  ],
  "perp": {
    "accountValue": "27105.276532",
    "withdrawable": "17289.848266",
    "marginUsed": "9815.428266"
  },
  "positions": [
    {
      "coin": "ETH",
      "assetId": 1,
      "size": "14.0488",
      "value": "29446.2848",
      "pnl": "-5.61952",
      "marginUsed": "9815.428266"
    }
  ],
  "openOrders": [
    {
      "assetId": 1,
      "marketType": "perp",
      "symbol": "ETH",
      "base": "ETH",
      "quote": "USDC",
      "orderId": 442842219919,
      "clientOrderId": "0x00000000000000000000019e554b606e",
      "side": "sell",
      "limitPrice": "2095.9",
      "size": "15.1324",
      "originalSize": "15.1324",
      "notionalUsd": "31715.997160000003",
      "reduceOnly": false,
      "timestamp": 1779788868199,
      "placedAt": "2026-05-26T09:47:48.199Z"
    }
  ],
  "agents": [
    {
      "address": "0xAgentWalletAddress",
      "name": "",
      "validUntil": 1782380868199,
      "validUntilIso": "2026-06-25T09:47:48.199Z"
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `accountMode.mode` | string | Hyperliquid 原始账户模式，例如 `default`、`unifiedAccount`、`portfolioMargin`。 |
| `accountMode.isUnified` | boolean | Unified Account 和 Portfolio Margin 下为 `true`。 |
| `summary.accountValue` | string | 账户总价值估算。Manual 模式下为 Perps account value 加 Spot 估值；统一账户模式下使用当前应用的统一估算逻辑。 |
| `summary.perpAccountValue` | string | Hyperliquid clearinghouse state 返回的 Perps 账户价值。 |
| `summary.spotAccountValue` | string | Spot 账户估值。USDC 固定按 1 估值，其他 Spot 资产优先使用 Hyperliquid Spot mark/mid price。 |
| `summary.withdrawable` | string | 可提现金额估算。Manual 模式会合并 Perps 可提现 USDC 和 Spot 可用 USDC。 |
| `summary.marginUsed` | string | Perps 持仓当前占用保证金。 |
| `spotBalances[]` | array | Spot 或统一账户余额行。 |
| `perp` | object | Hyperliquid clearinghouse state 返回的 Perps 账户汇总。 |
| `positions[]` | array | 当前 Perps 持仓。它们是已成交形成的仓位，不是挂单。 |
| `openOrders[]` | array | 当前开放的 Spot 和 Perps 挂单；已成交或已取消订单不包含在内。 |
| `agents[]` | array | 当前查询钱包已授权的 Agent Wallet 列表。包含 `webData3` 返回的 unnamed API Wallet，以及 `extraAgents` 返回的 named agents。 |

#### `spotBalances[]`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `coin` | string | 代币符号。 |
| `tokenId` | string or null | Hyperliquid Spot token ID。 |
| `tokenKey` | string or null | Hyperliquid Spot 发送类动作使用的 token key，格式为 `SYMBOL:tokenId`。 |
| `total` | string | 代币总余额，包含被锁定数量。 |
| `hold` | string | 被 Spot 挂单锁定的数量。 |
| `available` | string | 可用数量，按 `total - hold` 计算。 |
| `entryNtl` | string | Hyperliquid spot clearinghouse state 返回的 entry notional。 |

#### `positions[]`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `coin` | string | Perps 市场符号。 |
| `assetId` | number | Hyperliquid Perps asset index，下单和撤单时使用。 |
| `size` | string | 仓位大小。正数表示多仓，负数表示空仓。 |
| `value` | string | 当前仓位名义价值。 |
| `pnl` | string | 未实现盈亏。 |
| `marginUsed` | string | 该仓位占用保证金。 |

#### `openOrders[]`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `assetId` | number | 撤单所需的 Hyperliquid asset ID。Perps 使用 Perps asset index；Spot 使用 `10000 + spotPairIndex`。 |
| `marketType` | string | `perp` 或 `spot`。 |
| `symbol` | string | 市场显示符号。 |
| `base` | string or null | Base asset 符号。 |
| `quote` | string or null | Quote asset 符号。 |
| `orderId` | number | Hyperliquid 订单 ID。 |
| `clientOrderId` | string or null | 可选客户端订单 ID。 |
| `side` | string | `buy` 或 `sell`。 |
| `limitPrice` | string | 限价价格。 |
| `size` | string | 当前仍未成交的数量。 |
| `originalSize` | string | 下单时原始数量。 |
| `notionalUsd` | string | 名义价值估算，按 `limitPrice * size` 计算。 |
| `reduceOnly` | boolean | 是否只减仓。 |
| `timestamp` | number | 下单时间，Unix 毫秒时间戳。 |
| `placedAt` | string | ISO 8601 UTC 时间。 |

#### `agents[]`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `address` | string | 已授权的 Agent Wallet 地址。 |
| `name` | string | Agent 名称。空字符串表示 unnamed。 |
| `validUntil` | number or null | 授权过期时间，Unix 毫秒时间戳。 |
| `validUntilIso` | string or null | 授权过期时间的 ISO 8601 UTC 字符串；无法解析时为 `null`。 |

### 错误

| 状态码 | 错误码 | 说明 |
| --- | --- | --- |
| `400` | `INVALID_ADDRESS` | 缺少或传入了无效的 `address`。 |
| `502` | `SNAPSHOT_LOAD_FAILED` | 上游 Hyperliquid info 请求失败。 |

## GET /api/agent-role

查询某个地址是否是 Hyperliquid Agent Wallet；如果是，返回它被授权操作的 Master Wallet。

### 请求

```http
GET /api/agent-role?address=0x...
```

### 成功返回

```json
{
  "address": "0xAgentWalletAddress",
  "role": "agent",
  "masterAddress": "0xMasterWalletAddress"
}
```

如果该地址不是 Agent Wallet，`masterAddress` 为 `null`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `address` | string | 被查询地址。 |
| `role` | string | Hyperliquid 角色，例如 `agent`、`user`、`vault`、`subAccount`、`missing`。 |
| `masterAddress` | string or null | 该 Agent Wallet 被授权操作的 Master Wallet。仅当 `role = agent` 时有值。 |

### 错误

| 状态码 | 错误码 | 说明 |
| --- | --- | --- |
| `400` | `INVALID_ADDRESS` | 缺少或传入了无效的 `address`。 |
| `502` | `AGENT_ROLE_LOAD_FAILED` | 上游 Hyperliquid 请求失败。 |

## GET /api/cctp-fee

返回提现 UI 使用的 Circle CCTP forwarding fee。

### 请求

```http
GET /api/cctp-fee?destinationChainId=3
```

### 查询参数

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `destinationChainId` | 是 | Circle CCTP fee endpoint 使用的目标 domain/chain ID。 |

### 成功返回

```json
{
  "minimumFeeBps": 0,
  "forwardFeeUsdc": "0.214429",
  "finalityThreshold": 1000
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `minimumFeeBps` | number | 最低费率，单位 bps。 |
| `forwardFeeUsdc` | string | 预估 forwarding fee，单位 USDC。 |
| `finalityThreshold` | number | Circle fee endpoint 返回的 finality threshold。 |

### 错误

| 状态码 | 错误码 | 说明 |
| --- | --- | --- |
| `400` | `INVALID_DESTINATION_CHAIN` | 缺少或传入了无效的目标 chain ID。 |
| `502` | `CCTP_FEE_LOAD_FAILED` | Circle fee 请求失败。 |

## POST /api/actions/prepare

构造一个待签名的 Hyperliquid action。这个接口不会把操作提交到 Hyperliquid。

### 请求

```http
POST /api/actions/prepare
Content-Type: application/json
```

### 支持的 Action 类型

| `type` | 必填字段 | 说明 |
| --- | --- | --- |
| `cancelOrder` | `assetId`, `orderId` | 构造撤单 action。 |
| `closePosition` | `coin`, `size` | 构造 reduce-only IOC 平仓单。`size` 为正数时卖出平多，为负数时买入平空。 |
| `usdClassTransfer` | `amount`, `toPerp` | Manual 模式下在 Spot 和 Perps 之间转移 USDC。 |
| `usdSend` | `destination`, `amount` | 从 Perps USDC 余额发送给另一个 HyperCore 地址。 |
| `spotSend` | `destination`, `token`, `amount` | 发送 Spot 资产到另一个 HyperCore 地址。 |
| `sendAsset` | `destination`, `token`, `amount` | 发送 Unified Account 资产。可选：`sourceDex`、`destinationDex`、`fromSubAccount`。 |
| `setAccountMode` | `user`, `abstraction` | 修改账户模式。`abstraction` 为 `disabled`、`unifiedAccount` 或 `portfolioMargin`。 |
| `approveAgent` | `agentAddress` | 授权 unnamed Agent Wallet。可选：`agentName`。 |
| `withdraw3` | `destination`, `amount` | 通过旧 Hyperliquid bridge 提现 USDC 到 Arbitrum。 |
| `sendToEvmWithData` | `destination`, `amount`, `destinationChainId` | 通过 CCTP 提现 USDC。可选：`sourceDex`、`signatureChainId`。 |
| `withdrawHyperEvm` | `amount` | 提现 USDC 到 HyperEVM 系统地址。可选：`sourceDex`。 |

### 示例：构造撤单

```json
{
  "type": "cancelOrder",
  "assetId": 1,
  "orderId": 442842219919
}
```

### L1 Action 成功返回

L1 action 使用 Hyperliquid L1 action 签名。

```json
{
  "signatureKind": "l1",
  "action": {
    "type": "cancel",
    "cancels": [
      { "a": 1, "o": 442842219919 }
    ]
  },
  "nonce": 1779788816584
}
```

### User-Signed Action 成功返回

User-signed action 是 EIP-712 typed-data action。

```json
{
  "signatureKind": "user",
  "action": {
    "type": "usdSend",
    "hyperliquidChain": "Mainnet",
    "signatureChainId": "0xa4b1",
    "destination": "0xRecipient",
    "amount": "5",
    "time": 1779788816584
  },
  "nonce": 1779788816584,
  "chainId": 42161,
  "types": {
    "HyperliquidTransaction:UsdSend": [
      { "name": "hyperliquidChain", "type": "string" },
      { "name": "destination", "type": "string" },
      { "name": "amount", "type": "string" },
      { "name": "time", "type": "uint64" }
    ]
  }
}
```

### 错误

| 状态码 | 错误码 | 说明 |
| --- | --- | --- |
| `400` | `INVALID_JSON` | 请求体不是 JSON。 |
| `400` | `ACTION_PREPARE_FAILED` | 参数校验失败或 action 构造失败。 |

## POST /api/actions/submit

把已经签名的 Hyperliquid action 提交到 exchange endpoint。

### 请求

```http
POST /api/actions/submit
Content-Type: application/json
```

```json
{
  "action": {
    "type": "cancel",
    "cancels": [
      { "a": 1, "o": 442842219919 }
    ]
  },
  "signature": {
    "r": "0x...",
    "s": "0x...",
    "v": 27
  },
  "nonce": 1779788816584
}
```

可选字段：

| 字段 | 说明 |
| --- | --- |
| `vaultAddress` | 可选 Hyperliquid vault 地址。 |
| `expiresAfter` | 可选过期时间，Unix 毫秒时间戳。 |

### 成功返回

返回上游 Hyperliquid exchange response。

```json
{
  "status": "ok",
  "response": {
    "type": "default"
  }
}
```

### 错误

| 状态码 | 错误码 | 说明 |
| --- | --- | --- |
| `400` | `INVALID_JSON` | 请求体不是 JSON。 |
| `400` | `INVALID_PAYLOAD` | 缺少 `action`、`signature` 或 `nonce`。 |
| `502` | `HYPERLIQUID_ACTION_FAILED` | Hyperliquid 返回错误；可用时会附带 `result`。 |
| `502` | `ACTION_SUBMIT_FAILED` | 网络或上游解析失败。 |
