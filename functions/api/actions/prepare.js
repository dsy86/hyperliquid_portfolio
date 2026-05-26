const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";
const HYPERLIQUID_CHAIN = "Mainnet";
const SIGNATURE_CHAIN_ID = "0xa4b1";
const HYPEREVM_USDC_SYSTEM_ADDRESS =
  "0x2000000000000000000000000000000000000000";

const userSetAbstractionTypes = {
  "HyperliquidTransaction:UserSetAbstraction": [
    { name: "hyperliquidChain", type: "string" },
    { name: "user", type: "address" },
    { name: "abstraction", type: "string" },
    { name: "nonce", type: "uint64" },
  ],
};

const approveAgentTypes = {
  "HyperliquidTransaction:ApproveAgent": [
    { name: "hyperliquidChain", type: "string" },
    { name: "agentAddress", type: "address" },
    { name: "agentName", type: "string" },
    { name: "nonce", type: "uint64" },
  ],
};

const usdClassTransferTypes = {
  "HyperliquidTransaction:UsdClassTransfer": [
    { name: "hyperliquidChain", type: "string" },
    { name: "amount", type: "string" },
    { name: "toPerp", type: "bool" },
    { name: "nonce", type: "uint64" },
  ],
};

const usdSendTypes = {
  "HyperliquidTransaction:UsdSend": [
    { name: "hyperliquidChain", type: "string" },
    { name: "destination", type: "string" },
    { name: "amount", type: "string" },
    { name: "time", type: "uint64" },
  ],
};

const spotSendTypes = {
  "HyperliquidTransaction:SpotSend": [
    { name: "hyperliquidChain", type: "string" },
    { name: "destination", type: "string" },
    { name: "token", type: "string" },
    { name: "amount", type: "string" },
    { name: "time", type: "uint64" },
  ],
};

const withdrawTypes = {
  "HyperliquidTransaction:Withdraw": [
    { name: "hyperliquidChain", type: "string" },
    { name: "destination", type: "string" },
    { name: "amount", type: "string" },
    { name: "time", type: "uint64" },
  ],
};

const sendAssetTypes = {
  "HyperliquidTransaction:SendAsset": [
    { name: "hyperliquidChain", type: "string" },
    { name: "destination", type: "string" },
    { name: "sourceDex", type: "string" },
    { name: "destinationDex", type: "string" },
    { name: "token", type: "string" },
    { name: "amount", type: "string" },
    { name: "fromSubAccount", type: "string" },
    { name: "nonce", type: "uint64" },
  ],
};

const sendToEvmWithDataTypes = {
  "HyperliquidTransaction:SendToEvmWithData": [
    { name: "hyperliquidChain", type: "string" },
    { name: "token", type: "string" },
    { name: "amount", type: "string" },
    { name: "sourceDex", type: "string" },
    { name: "destinationRecipient", type: "string" },
    { name: "addressEncoding", type: "string" },
    { name: "destinationChainId", type: "uint32" },
    { name: "gasLimit", type: "uint64" },
    { name: "data", type: "bytes" },
    { name: "nonce", type: "uint64" },
  ],
};

export async function onRequestPost({ request }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "INVALID_JSON", message: "Expected JSON body." }, 400);
  }

  try {
    return json(await prepareAction(body));
  } catch (error) {
    return json(
      {
        error: "ACTION_PREPARE_FAILED",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      400,
    );
  }
}

export function onRequestOptions() {
  return cors();
}

async function prepareAction(body) {
  const nonce = Date.now();

  switch (body.type) {
    case "cancelOrder":
      requireNumber(body.assetId, "assetId");
      requireNumber(body.orderId, "orderId");
      return l1({ type: "cancel", cancels: [{ a: body.assetId, o: body.orderId }] }, nonce);

    case "closePosition":
      requireString(body.coin, "coin");
      requireString(body.size, "size");
      return l1(await buildClosePositionAction(body.coin, body.size), nonce);

    case "usdClassTransfer":
      requireString(body.amount, "amount");
      return user(
        {
          type: "usdClassTransfer",
          hyperliquidChain: HYPERLIQUID_CHAIN,
          signatureChainId: SIGNATURE_CHAIN_ID,
          amount: body.amount,
          toPerp: Boolean(body.toPerp),
          nonce,
        },
        nonce,
        usdClassTransferTypes,
      );

    case "usdSend":
      requireAddress(body.destination, "destination");
      requireString(body.amount, "amount");
      return user(
        {
          type: "usdSend",
          hyperliquidChain: HYPERLIQUID_CHAIN,
          signatureChainId: SIGNATURE_CHAIN_ID,
          destination: body.destination,
          amount: body.amount,
          time: nonce,
        },
        nonce,
        usdSendTypes,
      );

    case "spotSend":
      requireAddress(body.destination, "destination");
      requireString(body.token, "token");
      requireString(body.amount, "amount");
      return user(
        {
          type: "spotSend",
          hyperliquidChain: HYPERLIQUID_CHAIN,
          signatureChainId: SIGNATURE_CHAIN_ID,
          destination: body.destination,
          token: body.token,
          amount: body.amount,
          time: nonce,
        },
        nonce,
        spotSendTypes,
      );

    case "sendAsset":
      requireAddress(body.destination, "destination");
      requireString(body.token, "token");
      requireString(body.amount, "amount");
      return user(
        {
          type: "sendAsset",
          hyperliquidChain: HYPERLIQUID_CHAIN,
          signatureChainId: SIGNATURE_CHAIN_ID,
          destination: body.destination,
          sourceDex: body.sourceDex ?? "spot",
          destinationDex: body.destinationDex ?? "spot",
          token: body.token,
          amount: body.amount,
          fromSubAccount: body.fromSubAccount ?? "",
          nonce,
        },
        nonce,
        sendAssetTypes,
      );

    case "setAccountMode":
      requireAddress(body.user, "user");
      requireString(body.abstraction, "abstraction");
      return user(
        {
          type: "userSetAbstraction",
          hyperliquidChain: HYPERLIQUID_CHAIN,
          signatureChainId: SIGNATURE_CHAIN_ID,
          user: body.user,
          abstraction: body.abstraction,
          nonce,
        },
        nonce,
        userSetAbstractionTypes,
      );

    case "approveAgent":
      requireAddress(body.agentAddress, "agentAddress");
      return user(
        {
          type: "approveAgent",
          hyperliquidChain: HYPERLIQUID_CHAIN,
          signatureChainId: SIGNATURE_CHAIN_ID,
          agentAddress: body.agentAddress,
          agentName: body.agentName ?? "",
          nonce,
        },
        nonce,
        approveAgentTypes,
      );

    case "withdraw3":
      requireAddress(body.destination, "destination");
      requireString(body.amount, "amount");
      return user(
        {
          type: "withdraw3",
          hyperliquidChain: HYPERLIQUID_CHAIN,
          signatureChainId: SIGNATURE_CHAIN_ID,
          destination: body.destination,
          amount: body.amount,
          time: nonce,
        },
        nonce,
        withdrawTypes,
      );

    case "sendToEvmWithData":
      requireAddress(body.destination, "destination");
      requireString(body.amount, "amount");
      requireNumber(body.destinationChainId, "destinationChainId");
      return user(
        {
          type: "sendToEvmWithData",
          hyperliquidChain: HYPERLIQUID_CHAIN,
          signatureChainId: body.signatureChainId ?? SIGNATURE_CHAIN_ID,
          token: "USDC",
          amount: body.amount,
          sourceDex: body.sourceDex ?? "",
          destinationRecipient: body.destination,
          addressEncoding: "hex",
          destinationChainId: body.destinationChainId,
          gasLimit: 200000,
          data: "0x",
          nonce,
        },
        nonce,
        sendToEvmWithDataTypes,
      );

    case "withdrawHyperEvm":
      requireString(body.amount, "amount");
      return user(
        {
          type: "sendAsset",
          hyperliquidChain: HYPERLIQUID_CHAIN,
          signatureChainId: SIGNATURE_CHAIN_ID,
          destination: HYPEREVM_USDC_SYSTEM_ADDRESS,
          sourceDex: body.sourceDex ?? "",
          destinationDex: "spot",
          token: "USDC",
          amount: body.amount,
          fromSubAccount: "",
          nonce,
        },
        nonce,
        sendAssetTypes,
      );

    default:
      throw new Error("Unsupported action type.");
  }
}

async function buildClosePositionAction(coin, positionSize) {
  const size = Number(positionSize);
  if (!Number.isFinite(size) || size === 0) {
    throw new Error("Position size is unavailable.");
  }

  const [perpsMeta, perpsAssetCtxs] = await postInfo({ type: "metaAndAssetCtxs" });
  const assetId = perpsMeta.universe.findIndex((asset) => asset.name === coin);
  const asset = perpsMeta.universe[assetId];
  const assetCtx = perpsAssetCtxs[assetId];
  const referencePrice = Number(assetCtx?.markPx ?? assetCtx?.oraclePx);

  if (assetId < 0 || !asset || !Number.isFinite(referencePrice) || referencePrice <= 0) {
    throw new Error("Unable to identify this position market for closing.");
  }

  const isBuy = size < 0;
  const closePrice = referencePrice * (isBuy ? 1.03 : 0.97);

  return {
    type: "order",
    orders: [
      {
        a: assetId,
        b: isBuy,
        p: formatOrderPrice(closePrice, asset.szDecimals),
        s: Math.abs(size).toString(),
        r: true,
        t: { limit: { tif: "Ioc" } },
      },
    ],
    grouping: "na",
  };
}

function l1(action, nonce) {
  return { signatureKind: "l1", action, nonce };
}

function user(action, nonce, types) {
  return {
    signatureKind: "user",
    action,
    nonce,
    chainId: Number.parseInt(action.signatureChainId, 16),
    types,
  };
}

async function postInfo(body) {
  const response = await fetch(HYPERLIQUID_INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Hyperliquid info request failed: ${response.status}`);
  }

  return response.json();
}

function requireAddress(value, name) {
  if (!isAddress(value)) {
    throw new Error(`${name} must be a valid EVM address.`);
  }
}

function requireString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required.`);
  }
}

function requireNumber(value, name) {
  if (!Number.isFinite(Number(value))) {
    throw new Error(`${name} must be a number.`);
  }
}

function isAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function formatOrderPrice(value, szDecimals) {
  const maxDecimals = Math.max(0, 6 - szDecimals);
  const rounded = value >= 100_000 ? Math.round(value) : Number(value.toPrecision(5));

  return rounded
    .toFixed(maxDecimals)
    .replace(/(\.\d*?[1-9])0+$/, "$1")
    .replace(/\.0+$/, "");
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    },
  });
}

function cors() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
