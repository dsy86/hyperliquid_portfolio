# Hyperliquid Portfolio API

Base URL:

```text
https://hyperliquid-portfolio.pages.dev
```

The web frontend uses these APIs as its Hyperliquid data and action layer:

- `GET /api/snapshot`
- `GET /api/agent-role`
- `GET /api/cctp-fee`
- `POST /api/actions/prepare`
- `POST /api/actions/submit`

The legacy `GET /api/portfolio` endpoint has been removed. It was not used by the frontend and overlapped with `GET /api/snapshot`.

## Signing Model

The API does not hold private keys and does not sign on behalf of users.

For signed Hyperliquid operations, use this flow:

1. Call `POST /api/actions/prepare` with the intended action parameters.
2. Sign the returned `action` client-side with the user's wallet or agent wallet.
3. Call `POST /api/actions/submit` with `action`, `signature`, and `nonce`.

The browser app performs step 2 through the connected wallet. A bot or another service can reuse the same API by signing the returned payload with its own signer.

## Common Error Shape

Errors are JSON:

```json
{
  "error": "ERROR_CODE",
  "message": "Human readable message"
}
```

## GET /api/snapshot

Returns the account snapshot used by the frontend: account mode, balances, summary values, perps positions, and open orders.

### Request

```http
GET /api/snapshot?address=0x...
```

### Query Parameters

| Name | Required | Description |
| --- | --- | --- |
| `address` | Yes | EVM address to query. Must be a `0x` address. |

### Success Response

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
  ]
}
```

### Field Reference

| Field | Type | Description |
| --- | --- | --- |
| `accountMode.mode` | string | Raw Hyperliquid account mode, such as `default`, `unifiedAccount`, or `portfolioMargin`. |
| `accountMode.isUnified` | boolean | `true` for unified account and portfolio margin modes. |
| `summary.accountValue` | string | Estimated total account value. Manual mode uses perps account value plus spot value; unified modes use the app's unified estimate. |
| `summary.perpAccountValue` | string | Perps account value from Hyperliquid clearinghouse state. |
| `summary.spotAccountValue` | string | Estimated spot account value. USDC is valued at 1; other spot assets use Hyperliquid spot mark/mid price when available. |
| `summary.withdrawable` | string | Estimated withdrawable amount. Manual mode combines perps withdrawable USDC and available spot USDC. |
| `summary.marginUsed` | string | Margin currently used by perps positions. |
| `spotBalances[]` | array | Spot or unified balance rows. |
| `perp` | object | Perps account summary as returned by Hyperliquid clearinghouse state. |
| `positions[]` | array | Current perps positions. These are filled positions, not open orders. |
| `openOrders[]` | array | Currently open spot and perps orders. Filled and canceled orders are not included. |

#### `spotBalances[]`

| Field | Type | Description |
| --- | --- | --- |
| `coin` | string | Token symbol. |
| `tokenId` | string or null | Hyperliquid spot token ID. |
| `tokenKey` | string or null | Token key used by Hyperliquid spot-send style actions, formatted as `SYMBOL:tokenId`. |
| `total` | string | Total token balance, including held amount. |
| `hold` | string | Amount locked by open spot orders. |
| `available` | string | Spendable amount, calculated as `total - hold`. |
| `entryNtl` | string | Entry notional from Hyperliquid spot clearinghouse state. |

#### `positions[]`

| Field | Type | Description |
| --- | --- | --- |
| `coin` | string | Perps market symbol. |
| `assetId` | number | Hyperliquid perps asset index. Used for order and cancel actions. |
| `size` | string | Position size. Positive means long; negative means short. |
| `value` | string | Current position notional value. |
| `pnl` | string | Unrealized PnL. |
| `marginUsed` | string | Margin used by this position. |

#### `openOrders[]`

| Field | Type | Description |
| --- | --- | --- |
| `assetId` | number | Hyperliquid asset ID required to cancel the order. Perps use the perps asset index; spot uses `10000 + spotPairIndex`. |
| `marketType` | string | `perp` or `spot`. |
| `symbol` | string | Display market symbol. |
| `base` | string or null | Base asset symbol. |
| `quote` | string or null | Quote asset symbol. |
| `orderId` | number | Hyperliquid order ID. |
| `clientOrderId` | string or null | Optional client order ID. |
| `side` | string | `buy` or `sell`. |
| `limitPrice` | string | Limit price. |
| `size` | string | Remaining open size. |
| `originalSize` | string | Original order size. |
| `notionalUsd` | string | Estimated notional value, calculated as `limitPrice * size`. |
| `reduceOnly` | boolean | Whether the order can only reduce an existing perps position. |
| `timestamp` | number | Placement timestamp in milliseconds. |
| `placedAt` | string | ISO 8601 UTC timestamp. |

### Errors

| Status | Code | Description |
| --- | --- | --- |
| `400` | `INVALID_ADDRESS` | Missing or invalid `address`. |
| `502` | `SNAPSHOT_LOAD_FAILED` | An upstream Hyperliquid info request failed. |

## GET /api/agent-role

Returns whether an address is a Hyperliquid agent wallet and, if so, the master wallet it controls.

### Request

```http
GET /api/agent-role?address=0x...
```

### Success Response

```json
{
  "address": "0xAgentWalletAddress",
  "role": "agent",
  "masterAddress": "0xMasterWalletAddress"
}
```

If the address is not an agent wallet, `masterAddress` is `null`.

| Field | Type | Description |
| --- | --- | --- |
| `address` | string | Queried address. |
| `role` | string | Hyperliquid role, such as `agent`, `user`, `vault`, `subAccount`, or `missing`. |
| `masterAddress` | string or null | Master wallet controlled by this agent wallet. Present only for `role = agent`. |

### Errors

| Status | Code | Description |
| --- | --- | --- |
| `400` | `INVALID_ADDRESS` | Missing or invalid `address`. |
| `502` | `AGENT_ROLE_LOAD_FAILED` | Upstream Hyperliquid request failed. |

## GET /api/cctp-fee

Returns the Circle CCTP forwarding fee used by the withdrawal UI.

### Request

```http
GET /api/cctp-fee?destinationChainId=3
```

### Query Parameters

| Name | Required | Description |
| --- | --- | --- |
| `destinationChainId` | Yes | Circle destination domain/chain ID used by the CCTP fee endpoint. |

### Success Response

```json
{
  "minimumFeeBps": 0,
  "forwardFeeUsdc": "0.214429",
  "finalityThreshold": 1000
}
```

| Field | Type | Description |
| --- | --- | --- |
| `minimumFeeBps` | number | Minimum fee in basis points. |
| `forwardFeeUsdc` | string | Estimated forwarding fee in USDC. |
| `finalityThreshold` | number | Circle finality threshold returned by the fee endpoint. |

### Errors

| Status | Code | Description |
| --- | --- | --- |
| `400` | `INVALID_DESTINATION_CHAIN` | Missing or invalid destination chain ID. |
| `502` | `CCTP_FEE_LOAD_FAILED` | Circle fee request failed. |

## POST /api/actions/prepare

Builds a Hyperliquid action payload for signing. This endpoint does not submit anything to Hyperliquid.

### Request

```http
POST /api/actions/prepare
Content-Type: application/json
```

### Supported Action Types

| `type` | Required Fields | Description |
| --- | --- | --- |
| `cancelOrder` | `assetId`, `orderId` | Prepare a cancel action for an open order. |
| `closePosition` | `coin`, `size` | Prepare a reduce-only IOC order that closes the position. Positive `size` closes by selling; negative `size` closes by buying. |
| `usdClassTransfer` | `amount`, `toPerp` | Transfer USDC between spot and perps in manual mode. |
| `usdSend` | `destination`, `amount` | Send perps USDC to another HyperCore address. |
| `spotSend` | `destination`, `token`, `amount` | Send a spot asset to another HyperCore address. |
| `sendAsset` | `destination`, `token`, `amount` | Send a unified-account asset. Optional: `sourceDex`, `destinationDex`, `fromSubAccount`. |
| `setAccountMode` | `user`, `abstraction` | Change account mode. `abstraction` is `disabled`, `unifiedAccount`, or `portfolioMargin`. |
| `approveAgent` | `agentAddress` | Approve an unnamed agent wallet. Optional: `agentName`. |
| `withdraw3` | `destination`, `amount` | Withdraw USDC to Arbitrum through the legacy Hyperliquid bridge. |
| `sendToEvmWithData` | `destination`, `amount`, `destinationChainId` | Withdraw USDC through CCTP. Optional: `sourceDex`, `signatureChainId`. |
| `withdrawHyperEvm` | `amount` | Withdraw USDC to HyperEVM system address. Optional: `sourceDex`. |

### Example: Prepare Cancel Order

```json
{
  "type": "cancelOrder",
  "assetId": 1,
  "orderId": 442842219919
}
```

### L1 Success Response

L1 actions are signed with Hyperliquid L1 action signing.

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

### User-Signed Success Response

User-signed actions are EIP-712 typed-data actions.

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

### Errors

| Status | Code | Description |
| --- | --- | --- |
| `400` | `INVALID_JSON` | Request body is not JSON. |
| `400` | `ACTION_PREPARE_FAILED` | Validation failed or action construction failed. |

## POST /api/actions/submit

Submits a signed Hyperliquid action to the exchange endpoint.

### Request

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

Optional fields:

| Field | Description |
| --- | --- |
| `vaultAddress` | Optional Hyperliquid vault address. |
| `expiresAfter` | Optional expiration timestamp in milliseconds. |

### Success Response

The response is the upstream Hyperliquid exchange response.

```json
{
  "status": "ok",
  "response": {
    "type": "default"
  }
}
```

### Errors

| Status | Code | Description |
| --- | --- | --- |
| `400` | `INVALID_JSON` | Request body is not JSON. |
| `400` | `INVALID_PAYLOAD` | Missing `action`, `signature`, or `nonce`. |
| `502` | `HYPERLIQUID_ACTION_FAILED` | Hyperliquid returned an error. The response includes `result` when available. |
| `502` | `ACTION_SUBMIT_FAILED` | Network or upstream parsing failure. |

