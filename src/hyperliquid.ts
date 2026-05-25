import * as hl from "@nktkas/hyperliquid";
import { signUserSignedAction } from "@nktkas/hyperliquid/signing";
import type { WalletClient } from "viem";

export const ARBITRUM_NATIVE_USDC =
  "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as const;
export const HYPERLIQUID_BRIDGE2 =
  "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7" as const;
export const HYPEREVM_USDC_SYSTEM_ADDRESS =
  "0x2000000000000000000000000000000000000000" as const;

export const erc20TransferAbi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const transport = new hl.HttpTransport();
const publicClient = new hl.PublicClient({ transport });

type AccountAbstractionMode =
  | "disabled"
  | "default"
  | "dexAbstraction"
  | "unifiedAccount"
  | "portfolioMargin"
  | "unknown"
  | string;

type ExchangeDefaultResponse =
  | {
      status: "ok";
      response: {
        type: "default";
      };
    }
  | {
      status: "err";
      response: string;
    };

const userSetAbstractionTypes = {
  "HyperliquidTransaction:UserSetAbstraction": [
    { name: "hyperliquidChain", type: "string" },
    { name: "user", type: "address" },
    { name: "abstraction", type: "string" },
    { name: "nonce", type: "uint64" },
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

export type SpotBalanceRow = {
  coin: string;
  tokenId: string | null;
  tokenKey: `${string}:0x${string}` | null;
  total: string;
  hold: string;
  available: string;
  entryNtl: string;
};

export type PositionRow = {
  coin: string;
  size: string;
  value: string;
  pnl: string;
  marginUsed: string;
};

export type AccountSnapshot = {
  accountMode: {
    mode: AccountAbstractionMode;
    isUnified: boolean;
  };
  summary: {
    accountValue: string;
    perpAccountValue: string;
    spotAccountValue: string;
    withdrawable: string;
    marginUsed: string;
  };
  spotBalances: SpotBalanceRow[];
  perp: {
    accountValue: string;
    withdrawable: string;
    marginUsed: string;
  };
  positions: PositionRow[];
};

export type WithdrawSourceDex = "" | "spot";

export type CctpFeeQuote = {
  minimumFeeBps: number;
  forwardFeeUsdc: string;
  finalityThreshold: number;
};

export async function loadAccountSnapshot(
  user: `0x${string}`,
): Promise<AccountSnapshot> {
  const [spotState, spotMetaAndAssetCtxs, clearinghouseState, accountMode] =
    await Promise.all([
      publicClient.spotClearinghouseState({ user }),
      publicClient.spotMetaAndAssetCtxs(),
      publicClient.clearinghouseState({ user }),
      loadAccountMode(user),
    ]);
  const [spotMeta, spotAssetCtxs] = spotMetaAndAssetCtxs;

  const tokenByIndex = new Map(
    spotMeta.tokens.map((token) => [token.index, token]),
  );
  const spotPriceByTokenIndex = buildSpotPriceMap(spotMeta, spotAssetCtxs);

  const spotBalances = spotState.balances.map((balance) => {
    const token = tokenByIndex.get(balance.token);
    const tokenKey = token
      ? (`${token.name}:${token.tokenId}` as `${string}:0x${string}`)
      : null;
    const available = Math.max(
      Number(balance.total) - Number(balance.hold),
      0,
    ).toString();

    return {
      coin: token?.name ?? balance.coin,
      tokenId: token?.tokenId ?? null,
      tokenKey,
      total: balance.total,
      hold: balance.hold,
      available,
      entryNtl: balance.entryNtl,
    };
  });

  const spotAccountValue = sumNumbers(
    spotState.balances.map((balance) => {
      const tokenPrice = spotPriceByTokenIndex.get(balance.token);
      if (typeof tokenPrice === "number" && Number.isFinite(tokenPrice)) {
        return Number(balance.total) * tokenPrice;
      }
      return Number(balance.entryNtl);
    }),
  );
  const usdcBalance = spotState.balances.find((balance) => balance.coin === "USDC");
  const spotUsdcAvailable = usdcBalance
    ? Math.max(Number(usdcBalance.total) - Number(usdcBalance.hold), 0)
    : 0;
  const positions = clearinghouseState.assetPositions.map(({ position }) => ({
    coin: position.coin,
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
    clearinghouseState.assetPositions.map(({ position }) =>
      Number(position.marginUsed),
    ),
  );
  const unrealizedPnl = sumNumbers(
    clearinghouseState.assetPositions.map(({ position }) =>
      Number(position.unrealizedPnl),
    ),
  );
  const marginUsed =
    perpsMarginUsed > 0 ? perpsMarginUsed : positionMarginUsed;
  const combinedAccountValue = isUnified
    ? Math.max(perpAccountValue, spotAccountValue + unrealizedPnl)
    : perpAccountValue + spotAccountValue;
  const withdrawable = isUnified
    ? Math.max(perpsWithdrawable, spotUsdcAvailable)
    : perpsWithdrawable + spotUsdcAvailable;

  return {
    accountMode: {
      mode: accountMode,
      isUnified,
    },
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
  };
}

export function createHyperWalletClient(wallet: WalletClient) {
  return new hl.WalletClient({
    wallet,
    transport: new hl.HttpTransport(),
    signatureChainId: "0xa4b1",
  });
}

export async function activateUnifiedAccountMode(
  wallet: WalletClient,
  user: `0x${string}`,
) {
  return setUserAbstraction(wallet, user, "unifiedAccount");
}

export async function activatePortfolioMarginMode(
  wallet: WalletClient,
  user: `0x${string}`,
) {
  return setUserAbstraction(wallet, user, "portfolioMargin");
}

export async function disableUnifiedAccountMode(
  wallet: WalletClient,
  user: `0x${string}`,
) {
  return setUserAbstraction(wallet, user, "disabled");
}

export async function sendUnifiedAsset(
  wallet: WalletClient,
  args: {
    destination: `0x${string}`;
    token: `${string}:0x${string}`;
    amount: string;
  },
) {
  const nonce = Date.now();
  const action = {
    type: "sendAsset",
    hyperliquidChain: "Mainnet",
    signatureChainId: "0xa4b1",
    destination: args.destination,
    sourceDex: "spot",
    destinationDex: "spot",
    token: args.token,
    amount: args.amount,
    fromSubAccount: "",
    nonce,
  };
  const signature = await signUserSignedAction({
    wallet: wallet as Parameters<typeof signUserSignedAction>[0]["wallet"],
    action,
    types: sendAssetTypes,
    chainId: parseInt(action.signatureChainId, 16),
  });
  const response = await transport.request<ExchangeDefaultResponse>("exchange", {
    action,
    signature,
    nonce,
  });

  if (response.status === "err") {
    throw new Error(`Cannot process API request: ${response.response}`);
  }

  return response;
}

export async function withdrawToEvmWithData(
  wallet: WalletClient,
  args: {
    destination: `0x${string}`;
    amount: string;
    sourceDex: WithdrawSourceDex;
    destinationChainId: number;
    signatureChainId: `0x${string}`;
  },
) {
  const nonce = Date.now();
  const action = {
    type: "sendToEvmWithData",
    hyperliquidChain: "Mainnet",
    signatureChainId: args.signatureChainId,
    token: "USDC",
    amount: args.amount,
    sourceDex: args.sourceDex,
    destinationRecipient: args.destination,
    addressEncoding: "hex",
    destinationChainId: args.destinationChainId,
    gasLimit: 200000,
    data: "0x",
    nonce,
  };
  const signature = await signUserSignedAction({
    wallet: wallet as Parameters<typeof signUserSignedAction>[0]["wallet"],
    action,
    types: sendToEvmWithDataTypes,
    chainId: parseInt(action.signatureChainId, 16),
  });
  const response = await transport.request<ExchangeDefaultResponse>("exchange", {
    action,
    signature,
    nonce,
  });

  if (response.status === "err") {
    throw new Error(`Cannot process API request: ${response.response}`);
  }

  return response;
}

export async function withdrawToHyperEvm(
  wallet: WalletClient,
  args: {
    amount: string;
    sourceDex: WithdrawSourceDex;
  },
) {
  const nonce = Date.now();
  const action = {
    type: "sendAsset",
    hyperliquidChain: "Mainnet",
    signatureChainId: "0xa4b1",
    destination: HYPEREVM_USDC_SYSTEM_ADDRESS,
    sourceDex: args.sourceDex,
    destinationDex: "spot",
    token: "USDC",
    amount: args.amount,
    fromSubAccount: "",
    nonce,
  };
  const signature = await signUserSignedAction({
    wallet: wallet as Parameters<typeof signUserSignedAction>[0]["wallet"],
    action,
    types: sendAssetTypes,
    chainId: parseInt(action.signatureChainId, 16),
  });
  const response = await transport.request<ExchangeDefaultResponse>("exchange", {
    action,
    signature,
    nonce,
  });

  if (response.status === "err") {
    throw new Error(`Cannot process API request: ${response.response}`);
  }

  return response;
}

export async function loadCctpFeeQuote(
  destinationChainId: number,
): Promise<CctpFeeQuote> {
  const response = await fetch(
    `https://iris-api.circle.com/v2/burn/USDC/fees/19/${destinationChainId}?forward=true`,
  );

  if (!response.ok) {
    throw new Error("Unable to load CCTP fee.");
  }

  const fees = (await response.json()) as Array<{
    finalityThreshold: number;
    minimumFee: number;
    forwardFee?: {
      low?: number;
      med?: number;
      high?: number;
    };
  }>;
  const selectedFee = fees[0];
  const forwardFee =
    selectedFee?.forwardFee?.med ??
    selectedFee?.forwardFee?.high ??
    selectedFee?.forwardFee?.low ??
    0;

  return {
    minimumFeeBps: selectedFee?.minimumFee ?? 0,
    forwardFeeUsdc: (forwardFee / 1_000_000).toString(),
    finalityThreshold: selectedFee?.finalityThreshold ?? 0,
  };
}

async function setUserAbstraction(
  wallet: WalletClient,
  user: `0x${string}`,
  abstraction: "unifiedAccount" | "portfolioMargin" | "disabled",
) {
  const nonce = Date.now();
  const action = {
    type: "userSetAbstraction",
    hyperliquidChain: "Mainnet",
    signatureChainId: "0xa4b1",
    user,
    abstraction,
    nonce,
  };
  const signature = await signUserSignedAction({
    wallet: wallet as Parameters<typeof signUserSignedAction>[0]["wallet"],
    action,
    types: userSetAbstractionTypes,
    chainId: parseInt(action.signatureChainId, 16),
  });
  const response = await transport.request<ExchangeDefaultResponse>("exchange", {
    action,
    signature,
    nonce,
  });

  if (response.status === "err") {
    throw new Error(`Cannot process API request: ${response.response}`);
  }

  return response;
}

async function loadAccountMode(user: `0x${string}`) {
  try {
    return await transport.request<AccountAbstractionMode>("info", {
      type: "userAbstraction",
      user,
    });
  } catch {
    return "unknown";
  }
}

function buildSpotPriceMap(
  spotMeta: Awaited<ReturnType<typeof publicClient.spotMeta>>,
  spotAssetCtxs: Awaited<ReturnType<typeof publicClient.spotMetaAndAssetCtxs>>[1],
) {
  const priceByTokenIndex = new Map<number, number>([[0, 1]]);

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

function sumNumbers(values: number[]) {
  return values.reduce(
    (total, value) => total + (Number.isFinite(value) ? value : 0),
    0,
  );
}
