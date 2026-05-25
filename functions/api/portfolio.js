const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const address = url.searchParams.get("address")?.trim();

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return json(
      {
        error: "INVALID_ADDRESS",
        message: "Pass a valid EVM address as ?address=0x...",
      },
      400,
    );
  }

  try {
    const portfolio = await loadPortfolio(address);
    return json(portfolio);
  } catch (error) {
    return json(
      {
        error: "PORTFOLIO_LOAD_FAILED",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      502,
    );
  }
}

async function loadPortfolio(address) {
  const [
    spotState,
    spotMetaAndAssetCtxs,
    clearinghouseState,
    openOrders,
    rawAccountMode,
  ] =
    await Promise.all([
      postInfo({ type: "spotClearinghouseState", user: address }),
      postInfo({ type: "spotMetaAndAssetCtxs" }),
      postInfo({ type: "clearinghouseState", user: address }),
      postInfo({ type: "openOrders", user: address }),
      loadAccountMode(address),
    ]);
  const [spotMeta, spotAssetCtxs] = spotMetaAndAssetCtxs;
  const accountType = getAccountType(rawAccountMode);
  const tokenByIndex = new Map(
    spotMeta.tokens.map((token) => [token.index, token]),
  );
  const priceByTokenIndex = buildSpotPriceMap(spotMeta, spotAssetCtxs);

  const assets = spotState.balances.map((balance) => {
    const token = tokenByIndex.get(balance.token);
    const priceUsd = priceByTokenIndex.get(balance.token) ?? null;
    const total = Number(balance.total);
    const hold = Number(balance.hold);
    const valueUsd =
      typeof priceUsd === "number" && Number.isFinite(total)
        ? total * priceUsd
        : Number(balance.entryNtl);

    return {
      account: getAssetAccountLabel(accountType),
      coin: token?.name ?? balance.coin,
      total: balance.total,
      hold: balance.hold,
      available: Math.max(total - hold, 0).toString(),
      priceUsd,
      valueUsd: finiteNumber(valueUsd),
    };
  });

  const spotAccountValueUsd = sumNumbers(assets.map((asset) => asset.valueUsd));
  const usdcSpotAsset = assets.find((asset) => asset.coin === "USDC");
  const spotUsdcAvailable = usdcSpotAsset ? Number(usdcSpotAsset.available) : 0;
  const positions = clearinghouseState.assetPositions.map(({ position }) => ({
    coin: position.coin,
    size: position.szi,
    valueUsd: finiteNumber(Number(position.positionValue)),
    unrealizedPnlUsd: finiteNumber(Number(position.unrealizedPnl)),
    marginUsedUsd: finiteNumber(Number(position.marginUsed)),
  }));

  const perpsAccountValueUsd = finiteNumber(
    Number(clearinghouseState.marginSummary.accountValue),
  );
  const perpsWithdrawableUsd = finiteNumber(Number(clearinghouseState.withdrawable));
  const perpsMarginUsedUsd = finiteNumber(
    Number(clearinghouseState.marginSummary.totalMarginUsed),
  );
  const positionMarginUsedUsd = sumNumbers(
    positions.map((position) => position.marginUsedUsd),
  );
  const unrealizedPnlUsd = sumNumbers(
    positions.map((position) => position.unrealizedPnlUsd),
  );
  const marginUsedUsd =
    perpsMarginUsedUsd > 0 ? perpsMarginUsedUsd : positionMarginUsedUsd;
  const accountValueUsd =
    accountType.id === "manual"
      ? perpsAccountValueUsd + spotAccountValueUsd
      : Math.max(perpsAccountValueUsd, spotAccountValueUsd + unrealizedPnlUsd);
  const withdrawableUsd =
    accountType.id === "manual"
      ? perpsWithdrawableUsd + spotUsdcAvailable
      : Math.max(perpsWithdrawableUsd, spotUsdcAvailable);

  return {
    address,
    accountType: accountType.id,
    summary: {
      accountValueUsd: finiteNumber(accountValueUsd),
      spotAccountValueUsd: finiteNumber(spotAccountValueUsd),
      perpsAccountValueUsd,
      withdrawableUsd: finiteNumber(withdrawableUsd),
      marginUsedUsd: finiteNumber(marginUsedUsd),
    },
    assets,
    openOrders: openOrders.map((order) => normalizeOpenOrder(order, spotMeta)),
    perps: {
      account:
        accountType.id === "manual"
          ? {
              collateral: "USDC",
              accountValueUsd: perpsAccountValueUsd,
              withdrawableUsd: perpsWithdrawableUsd,
              marginUsedUsd: perpsMarginUsedUsd,
            }
          : null,
      positions,
    },
  };
}

function normalizeOpenOrder(order, spotMeta) {
  const limitPrice = Number(order.limitPx);
  const size = Number(order.sz);

  return {
    market: describeOrderMarket(order.coin, spotMeta),
    side: order.side === "B" ? "buy" : "sell",
    limitPrice: order.limitPx,
    size: order.sz,
    originalSize: order.origSz,
    notionalUsd: finiteNumber(limitPrice * size),
    orderId: order.oid,
    clientOrderId: order.cloid ?? null,
    reduceOnly: order.reduceOnly === true,
    timestamp: order.timestamp,
    placedAt: new Date(order.timestamp).toISOString(),
  };
}

function describeOrderMarket(coin, spotMeta) {
  if (coin.startsWith("@")) {
    const spotPairIndex = Number(coin.slice(1));
    const universe = spotMeta.universe.find(
      (spotUniverse) => spotUniverse.index === spotPairIndex,
    );
    const baseToken = universe
      ? spotMeta.tokens.find((token) => token.index === universe.tokens[0])
      : null;
    const quoteToken = universe
      ? spotMeta.tokens.find((token) => token.index === universe.tokens[1])
      : null;

    return {
      type: "spot",
      symbol: universe?.name ?? coin,
      base: baseToken?.name ?? null,
      quote: quoteToken?.name ?? null,
    };
  }

  return {
    type: "perp",
    symbol: coin,
    base: coin,
    quote: "USDC",
  };
}

async function loadAccountMode(address) {
  try {
    return await postInfo({ type: "userAbstraction", user: address });
  } catch {
    return "unknown";
  }
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

function getAccountType(rawMode) {
  if (rawMode === "portfolioMargin") {
    return {
      id: "portfolio",
      label: "Portfolio Margin",
      raw: rawMode,
    };
  }
  if (rawMode === "unifiedAccount") {
    return {
      id: "unified",
      label: "Unified Account",
      raw: rawMode,
    };
  }
  return {
    id: "manual",
    label: "Manual",
    raw: rawMode,
  };
}

function getAssetAccountLabel(accountType) {
  if (accountType.id === "portfolio") {
    return "portfolioMargin";
  }
  if (accountType.id === "unified") {
    return "unified";
  }
  return "spot";
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

function sumNumbers(values) {
  return values.reduce(
    (total, value) => total + (Number.isFinite(value) ? value : 0),
    0,
  );
}

function finiteNumber(value) {
  return Number.isFinite(value) ? value : 0;
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
