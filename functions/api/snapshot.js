const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const address = url.searchParams.get("address")?.trim();

  if (!isAddress(address)) {
    return json({ error: "INVALID_ADDRESS", message: "Pass ?address=0x..." }, 400);
  }

  try {
    return json(await loadSnapshot(address));
  } catch (error) {
    return json(
      {
        error: "SNAPSHOT_LOAD_FAILED",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      502,
    );
  }
}

async function loadSnapshot(user) {
  const [
    spotState,
    spotMetaAndAssetCtxs,
    clearinghouseState,
    accountMode,
    openOrders,
    perpsMeta,
  ] = await Promise.all([
    postInfo({ type: "spotClearinghouseState", user }),
    postInfo({ type: "spotMetaAndAssetCtxs" }),
    postInfo({ type: "clearinghouseState", user }),
    loadAccountMode(user),
    postInfo({ type: "openOrders", user }),
    postInfo({ type: "meta" }),
  ]);
  const [spotMeta, spotAssetCtxs] = spotMetaAndAssetCtxs;
  const tokenByIndex = new Map(spotMeta.tokens.map((token) => [token.index, token]));
  const spotPriceByTokenIndex = buildSpotPriceMap(spotMeta, spotAssetCtxs);

  const spotBalances = spotState.balances.map((balance) => {
    const token = tokenByIndex.get(balance.token);
    const available = Math.max(Number(balance.total) - Number(balance.hold), 0);

    return {
      coin: token?.name ?? balance.coin,
      tokenId: token?.tokenId ?? null,
      tokenKey: token ? `${token.name}:${token.tokenId}` : null,
      total: balance.total,
      hold: balance.hold,
      available: available.toString(),
      entryNtl: balance.entryNtl,
    };
  });

  const spotAccountValue = sumNumbers(
    spotState.balances.map((balance) => {
      const tokenPrice = spotPriceByTokenIndex.get(balance.token);
      return typeof tokenPrice === "number" && Number.isFinite(tokenPrice)
        ? Number(balance.total) * tokenPrice
        : Number(balance.entryNtl);
    }),
  );
  const usdcBalance = spotState.balances.find((balance) => balance.coin === "USDC");
  const spotUsdcAvailable = usdcBalance
    ? Math.max(Number(usdcBalance.total) - Number(usdcBalance.hold), 0)
    : 0;
  const positions = clearinghouseState.assetPositions.map(({ position }) => ({
    coin: position.coin,
    assetId: perpsMeta.universe.findIndex((asset) => asset.name === position.coin),
    size: position.szi,
    value: position.positionValue,
    pnl: position.unrealizedPnl,
    marginUsed: position.marginUsed,
  }));
  const isUnified =
    accountMode === "unifiedAccount" || accountMode === "portfolioMargin";
  const perpAccountValue = Number(clearinghouseState.marginSummary.accountValue);
  const perpsWithdrawable = Number(clearinghouseState.withdrawable);
  const perpsMarginUsed = Number(clearinghouseState.marginSummary.totalMarginUsed);
  const positionMarginUsed = sumNumbers(
    clearinghouseState.assetPositions.map(({ position }) => Number(position.marginUsed)),
  );
  const unrealizedPnl = sumNumbers(
    clearinghouseState.assetPositions.map(({ position }) => Number(position.unrealizedPnl)),
  );
  const marginUsed = perpsMarginUsed > 0 ? perpsMarginUsed : positionMarginUsed;
  const combinedAccountValue = isUnified
    ? Math.max(perpAccountValue, spotAccountValue + unrealizedPnl)
    : perpAccountValue + spotAccountValue;
  const withdrawable = isUnified
    ? Math.max(perpsWithdrawable, spotUsdcAvailable)
    : perpsWithdrawable + spotUsdcAvailable;

  return {
    accountMode: { mode: accountMode, isUnified },
    summary: {
      accountValue: combinedAccountValue.toString(),
      perpAccountValue: perpAccountValue.toString(),
      spotAccountValue: spotAccountValue.toString(),
      withdrawable: withdrawable.toString(),
      marginUsed: marginUsed.toString(),
    },
    spotBalances,
    perp: {
      accountValue: clearinghouseState.marginSummary.accountValue,
      withdrawable: clearinghouseState.withdrawable,
      marginUsed: clearinghouseState.marginSummary.totalMarginUsed,
    },
    positions,
    openOrders: openOrders.map((order) =>
      normalizeOpenOrder(order, spotMeta, perpsMeta),
    ),
  };
}

function normalizeOpenOrder(order, spotMeta, perpsMeta) {
  const market = describeOrderMarket(order.coin, spotMeta, perpsMeta);
  const limitPrice = Number(order.limitPx);
  const size = Number(order.sz);

  return {
    ...market,
    orderId: order.oid,
    clientOrderId: order.cloid ?? null,
    side: order.side === "B" ? "buy" : "sell",
    limitPrice: order.limitPx,
    size: order.sz,
    originalSize: order.origSz,
    notionalUsd:
      Number.isFinite(limitPrice) && Number.isFinite(size)
        ? (limitPrice * size).toString()
        : "0",
    reduceOnly: order.reduceOnly === true,
    timestamp: order.timestamp,
    placedAt: new Date(order.timestamp).toISOString(),
  };
}

function describeOrderMarket(coin, spotMeta, perpsMeta) {
  if (coin.startsWith("@")) {
    const spotPairIndex = Number(coin.slice(1));
    const universe = spotMeta.universe.find((item) => item.index === spotPairIndex);
    const baseToken = universe
      ? spotMeta.tokens.find((token) => token.index === universe.tokens[0])
      : null;
    const quoteToken = universe
      ? spotMeta.tokens.find((token) => token.index === universe.tokens[1])
      : null;

    return {
      assetId: 10000 + spotPairIndex,
      marketType: "spot",
      symbol: universe?.name ?? coin,
      base: baseToken?.name ?? null,
      quote: quoteToken?.name ?? null,
    };
  }

  return {
    assetId: perpsMeta.universe.findIndex((asset) => asset.name === coin),
    marketType: "perp",
    symbol: coin,
    base: coin,
    quote: "USDC",
  };
}

async function loadAccountMode(user) {
  try {
    return await postInfo({ type: "userAbstraction", user });
  } catch {
    return "unknown";
  }
}

function buildSpotPriceMap(spotMeta, spotAssetCtxs) {
  const priceByTokenIndex = new Map([[0, 1]]);

  spotMeta.universe.forEach((universe) => {
    const baseToken = universe.tokens[0];
    const quoteToken = universe.tokens[1];
    const ctx = spotAssetCtxs[universe.index];
    const price = Number(ctx?.markPx ?? ctx?.midPx);
    if (quoteToken === 0 && Number.isFinite(price) && price > 0) {
      priceByTokenIndex.set(baseToken, price);
    }
  });

  return priceByTokenIndex;
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

function isAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function sumNumbers(values) {
  return values.reduce(
    (total, value) => total + (Number.isFinite(value) ? value : 0),
    0,
  );
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}
