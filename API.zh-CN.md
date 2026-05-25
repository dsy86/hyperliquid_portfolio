# Portfolio API 中文文档

查询一个 Hyperliquid 账户的余额、当前挂单和 Perps 持仓。

## 请求

```http
GET /api/portfolio?address=0x...
```

生产环境 URL：

```text
https://hyperliquid-portfolio.pages.dev/api/portfolio?address=0x...
```

### 查询参数

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `address` | 是 | 要查询的 EVM 地址。必须是 42 个字符的 `0x` 地址。 |

## 返回值

### 成功返回

状态码：`200 OK`

```json
{
  "address": "0xaf68caebaa151dd592112a07e2344b3950e13561",
  "accountType": "manual",
  "summary": {
    "accountValueUsd": 26850.923366,
    "spotAccountValueUsd": 0,
    "perpsAccountValueUsd": 26850.923366,
    "withdrawableUsd": 6705.656206,
    "marginUsedUsd": 20145.26716
  },
  "assets": [
    {
      "account": "spot",
      "coin": "USDC",
      "total": "0.0",
      "hold": "0.0",
      "available": "0",
      "priceUsd": 1,
      "valueUsd": 0
    }
  ],
  "openOrders": [
    {
      "market": {
        "type": "perp",
        "symbol": "ETH",
        "base": "ETH",
        "quote": "USDC"
      },
      "side": "buy",
      "limitPrice": "2118.1",
      "size": "26.754",
      "originalSize": "26.754",
      "notionalUsd": 56667.6474,
      "orderId": 441402764187,
      "clientOrderId": "0x00000000000000000000019e5430f8bd",
      "reduceOnly": false,
      "timestamp": 1779701784790,
      "placedAt": "2026-05-25T09:36:24.790Z"
    }
  ],
  "perps": {
    "account": {
      "collateral": "USDC",
      "accountValueUsd": 26850.923366,
      "withdrawableUsd": 6705.656206,
      "marginUsedUsd": 20145.26716
    },
    "positions": [
      {
        "coin": "ETH",
        "size": "-28.5492",
        "valueUsd": 60435.80148,
        "unrealizedPnlUsd": -48.697632,
        "marginUsedUsd": 20145.26716
      }
    ]
  }
}
```

## 字段说明

### 顶层字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `address` | string | 被查询的钱包地址。 |
| `accountType` | string | Hyperliquid 账户模式。可能值为 `manual`、`unified`、`portfolio`。 |
| `summary` | object | 账户级别的 USD 汇总数据。 |
| `assets` | array | Spot、Unified 或 Portfolio Margin 模式下的资产余额。 |
| `openOrders` | array | 当前仍然开放的挂单。包含 Spot 和 Perps 挂单；已成交或已取消订单不会出现在这里。 |
| `perps` | object | Perps 账户汇总和当前持仓。 |

### `summary`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `accountValueUsd` | number | 账户总价值的 USD 估算。Manual 账户下等于 Perps account value 加 Spot 资产估值；Unified 和 Portfolio Margin 账户下使用当前应用里的统一账户估算逻辑。 |
| `spotAccountValueUsd` | number | `assets` 中所有资产的 USD 估算总值。 |
| `perpsAccountValueUsd` | number | Hyperliquid clearinghouse state 返回的 Perps 账户价值。 |
| `withdrawableUsd` | number | 当前可提现金额的 USD 估算。Manual 账户下会合并 Perps 可提现 USDC 和 Spot 可用 USDC。 |
| `marginUsedUsd` | number | Perps 持仓当前占用的保证金，单位为 USD。 |

### `assets[]`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `account` | string | 余额所在账户桶。Manual 模式的 Spot 余额为 `spot`；Unified 模式为 `unified`；Portfolio Margin 模式为 `portfolioMargin`。 |
| `coin` | string | 代币符号。 |
| `total` | string | 代币总余额。包含被 Spot 挂单锁定的数量。 |
| `hold` | string | 被 Spot 挂单锁定的数量。例如，Spot 卖单会锁定 base token，Spot 买单会锁定 quote token。 |
| `available` | string | 可用余额，按 `total - hold` 计算。 |
| `priceUsd` | number or null | 用于估值的 USD 价格。`USDC` 固定按 `1` 估值；其他资产优先使用 Hyperliquid Spot 市场价格。 |
| `valueUsd` | number | `total` 对应的 USD 估算价值。 |

### `openOrders[]`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `market` | object | 订单对应的市场元数据。 |
| `side` | string | 订单方向：`buy` 或 `sell`。 |
| `limitPrice` | string | 限价价格。 |
| `size` | string | 当前仍未成交的订单数量。 |
| `originalSize` | string | 下单时的原始订单数量。 |
| `notionalUsd` | number | 订单名义价值估算，按 `limitPrice * size` 计算。 |
| `orderId` | number | Hyperliquid 订单 ID。 |
| `clientOrderId` | string or null | 下单时传入的客户端订单 ID；如果没有传则为 `null`。 |
| `reduceOnly` | boolean | 是否为只减仓订单。只减仓订单只能减少已有 Perps 仓位。 |
| `timestamp` | number | 下单时间，Unix 毫秒时间戳。 |
| `placedAt` | string | 下单时间，ISO 8601 UTC 字符串。 |

### `openOrders[].market`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `type` | string | 市场类型：`spot` 或 `perp`。 |
| `symbol` | string | 市场显示符号。Perps 通常是 base asset，例如 `ETH`。 |
| `base` | string or null | Base asset 符号。 |
| `quote` | string or null | Quote asset 符号，通常为 `USDC`。 |

### `perps`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `account` | object or null | Manual 账户下的 Perps 账户汇总。Unified 和 Portfolio Margin 账户下为 `null`，因为 Perps 和 Spot 余额已经统一。 |
| `positions` | array | 当前 Perps 持仓。这些是已经成交形成的仓位，不是挂单。 |

### `perps.account`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `collateral` | string | 默认 Perps 账户的抵押资产，目前为 `USDC`。 |
| `accountValueUsd` | number | Perps 账户价值，单位为 USD。 |
| `withdrawableUsd` | number | Perps 账户中可提现金额，单位为 USD。 |
| `marginUsedUsd` | number | 当前 Perps 持仓占用的保证金，单位为 USD。 |

### `perps.positions[]`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `coin` | string | Perps 市场符号。 |
| `size` | string | 仓位大小。正数表示多头，负数表示空头。 |
| `valueUsd` | number | 当前仓位名义价值，单位为 USD。 |
| `unrealizedPnlUsd` | number | 未实现盈亏，单位为 USD。 |
| `marginUsedUsd` | number | 该仓位占用的保证金，单位为 USD。 |

## 错误返回

### 地址无效

状态码：`400 Bad Request`

```json
{
  "error": "INVALID_ADDRESS",
  "message": "Pass a valid EVM address as ?address=0x..."
}
```

### Portfolio 加载失败

状态码：`502 Bad Gateway`

```json
{
  "error": "PORTFOLIO_LOAD_FAILED",
  "message": "Hyperliquid info request failed: 500"
}
```

这通常表示某个上游 Hyperliquid info 请求失败。
