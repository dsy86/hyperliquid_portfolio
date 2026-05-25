# Portfolio API

Read a Hyperliquid account's balances, open orders, and perps positions.

## Request

```http
GET /api/portfolio?address=0x...
```

Production URL:

```text
https://hyperliquid-portfolio.pages.dev/api/portfolio?address=0x...
```

### Query Parameters

| Name | Required | Description |
| --- | --- | --- |
| `address` | Yes | EVM address to query. Must be a 42-character `0x` address. |

## Response

### Success

Status: `200 OK`

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

## Field Reference

### Top-Level Fields

| Field | Type | Description |
| --- | --- | --- |
| `address` | string | The queried wallet address. |
| `accountType` | string | Hyperliquid account mode. Possible values are `manual`, `unified`, and `portfolio`. |
| `summary` | object | Account-level USD summary values. |
| `assets` | array | Spot, unified, or portfolio-margin asset balances. |
| `openOrders` | array | Currently open orders. Includes both spot and perps orders. Filled or canceled orders are not included. |
| `perps` | object | Perps account summary and current open positions. |

### `summary`

| Field | Type | Description |
| --- | --- | --- |
| `accountValueUsd` | number | Estimated total account value in USD. For manual accounts, this is perps account value plus spot asset value. For unified and portfolio-margin accounts, this uses the app's current combined-account estimate. |
| `spotAccountValueUsd` | number | Estimated USD value of all assets listed in `assets`. |
| `perpsAccountValueUsd` | number | Perps account value reported by Hyperliquid clearinghouse state. |
| `withdrawableUsd` | number | Estimated USD amount currently withdrawable. For manual accounts, this combines perps withdrawable USDC and available spot USDC. |
| `marginUsedUsd` | number | Margin currently used by perps positions, in USD. |

### `assets[]`

| Field | Type | Description |
| --- | --- | --- |
| `account` | string | Balance bucket. `spot` for manual spot balances, `unified` for unified-account balances, or `portfolioMargin` for portfolio-margin balances. |
| `coin` | string | Token symbol. |
| `total` | string | Total token balance. Includes tokens locked by open spot orders. |
| `hold` | string | Amount locked by open spot orders. For example, a spot sell order holds the base token, while a spot buy order holds the quote token. |
| `available` | string | Spendable token balance, calculated as `total - hold`. |
| `priceUsd` | number or null | USD price used for valuation. `USDC` is priced at `1`. Other assets use Hyperliquid spot market prices when available. |
| `valueUsd` | number | Estimated USD value of `total`. |

### `openOrders[]`

| Field | Type | Description |
| --- | --- | --- |
| `market` | object | Market metadata for the order. |
| `side` | string | Order side: `buy` or `sell`. |
| `limitPrice` | string | Limit price. |
| `size` | string | Remaining open order size. |
| `originalSize` | string | Original order size when placed. |
| `notionalUsd` | number | Estimated notional value, calculated as `limitPrice * size`. |
| `orderId` | number | Hyperliquid order ID. |
| `clientOrderId` | string or null | Client order ID if one was provided when placing the order. |
| `reduceOnly` | boolean | Whether the order is reduce-only. Reduce-only orders can only reduce an existing perps position. |
| `timestamp` | number | Order placement time as a Unix timestamp in milliseconds. |
| `placedAt` | string | Order placement time as an ISO 8601 UTC timestamp. |

### `openOrders[].market`

| Field | Type | Description |
| --- | --- | --- |
| `type` | string | Market type: `spot` or `perp`. |
| `symbol` | string | Display symbol for the market. For perps this is usually the base asset, such as `ETH`. |
| `base` | string or null | Base asset symbol. |
| `quote` | string or null | Quote asset symbol. Usually `USDC`. |

### `perps`

| Field | Type | Description |
| --- | --- | --- |
| `account` | object or null | Perps account summary for manual accounts. `null` for unified and portfolio-margin accounts because perps and spot balances are unified. |
| `positions` | array | Current open perps positions. These are already-filled positions, not open orders. |

### `perps.account`

| Field | Type | Description |
| --- | --- | --- |
| `collateral` | string | Collateral asset for the default perps account. Currently `USDC`. |
| `accountValueUsd` | number | Perps account value in USD. |
| `withdrawableUsd` | number | Withdrawable amount from the perps account in USD. |
| `marginUsedUsd` | number | Margin used by current perps positions in USD. |

### `perps.positions[]`

| Field | Type | Description |
| --- | --- | --- |
| `coin` | string | Perps market symbol. |
| `size` | string | Position size. Positive means long; negative means short. |
| `valueUsd` | number | Current notional value of the position in USD. |
| `unrealizedPnlUsd` | number | Unrealized profit or loss in USD. |
| `marginUsedUsd` | number | Margin used by this position in USD. |

## Error Responses

### Invalid Address

Status: `400 Bad Request`

```json
{
  "error": "INVALID_ADDRESS",
  "message": "Pass a valid EVM address as ?address=0x..."
}
```

### Portfolio Load Failed

Status: `502 Bad Gateway`

```json
{
  "error": "PORTFOLIO_LOAD_FAILED",
  "message": "Hyperliquid info request failed: 500"
}
```

This usually means one of the upstream Hyperliquid info requests failed.
