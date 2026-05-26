import {
  signL1Action,
  signUserSignedAction,
} from "@nktkas/hyperliquid/signing";
import type { AbstractWallet, Hex, ValueMap } from "@nktkas/hyperliquid/signing";

export const ARBITRUM_NATIVE_USDC =
  "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as const;
export const HYPERLIQUID_BRIDGE2 =
  "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7" as const;

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

type AccountAbstractionMode =
  | "disabled"
  | "default"
  | "dexAbstraction"
  | "unifiedAccount"
  | "portfolioMargin"
  | "unknown"
  | string;

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
  assetId: number;
  size: string;
  value: string;
  pnl: string;
  marginUsed: string;
};

export type OpenOrderRow = {
  assetId: number;
  orderId: number;
  clientOrderId: `0x${string}` | null;
  marketType: "perp" | "spot";
  symbol: string;
  base: string | null;
  quote: string | null;
  side: "buy" | "sell";
  limitPrice: string;
  size: string;
  originalSize: string;
  notionalUsd: string;
  reduceOnly: boolean;
  timestamp: number;
  placedAt: string;
};

export type AgentWalletRow = {
  address: `0x${string}`;
  name: string;
  validUntil: number | null;
  validUntilIso: string | null;
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
  openOrders: OpenOrderRow[];
  agents: AgentWalletRow[];
};

export type WithdrawSourceDex = "" | "spot";

export type CctpFeeQuote = {
  minimumFeeBps: number;
  forwardFeeUsdc: string;
  finalityThreshold: number;
};

export type AgentRoleInfo = {
  role: string;
  masterAddress: `0x${string}` | null;
};

export type HyperliquidSigner = AbstractWallet;

type PreparedAction =
  | {
      signatureKind: "l1";
      action: ValueMap;
      nonce: number;
    }
  | {
      signatureKind: "user";
      action: Record<string, unknown>;
      nonce: number;
      chainId: number;
      types: {
        [key: string]: {
          name: string;
          type: string;
        }[];
      };
    };

export async function loadAgentRole(
  user: `0x${string}`,
): Promise<AgentRoleInfo> {
  return apiGet(`/api/agent-role?address=${user}`);
}

export async function loadAccountSnapshot(
  user: `0x${string}`,
): Promise<AccountSnapshot> {
  return apiGet(`/api/snapshot?address=${user}`);
}

export async function loadCctpFeeQuote(
  destinationChainId: number,
): Promise<CctpFeeQuote> {
  return apiGet(`/api/cctp-fee?destinationChainId=${destinationChainId}`);
}

export async function transferUsdClass(
  wallet: HyperliquidSigner,
  args: { amount: string; toPerp: boolean },
) {
  return signAndSubmit(wallet, {
    type: "usdClassTransfer",
    amount: args.amount,
    toPerp: args.toPerp,
  });
}

export async function sendPerpUsdc(
  wallet: HyperliquidSigner,
  args: { destination: `0x${string}`; amount: string },
) {
  return signAndSubmit(wallet, {
    type: "usdSend",
    destination: args.destination,
    amount: args.amount,
  });
}

export async function sendSpotAsset(
  wallet: HyperliquidSigner,
  args: {
    destination: `0x${string}`;
    token: `${string}:0x${string}`;
    amount: string;
  },
) {
  return signAndSubmit(wallet, {
    type: "spotSend",
    destination: args.destination,
    token: args.token,
    amount: args.amount,
  });
}

export async function sendUnifiedAsset(
  wallet: HyperliquidSigner,
  args: {
    destination: `0x${string}`;
    token: `${string}:0x${string}`;
    amount: string;
  },
) {
  return signAndSubmit(wallet, {
    type: "sendAsset",
    destination: args.destination,
    sourceDex: "spot",
    destinationDex: "spot",
    token: args.token,
    amount: args.amount,
    fromSubAccount: "",
  });
}

export async function cancelOpenOrder(
  wallet: HyperliquidSigner,
  order: { assetId: number; orderId: number },
) {
  return signAndSubmit(wallet, {
    type: "cancelOrder",
    assetId: order.assetId,
    orderId: order.orderId,
  });
}

export async function closePerpsPosition(
  wallet: HyperliquidSigner,
  position: { coin: string; size: string },
) {
  return signAndSubmit(wallet, {
    type: "closePosition",
    coin: position.coin,
    size: position.size,
  });
}

export async function activateUnifiedAccountMode(
  wallet: HyperliquidSigner,
  user: `0x${string}`,
) {
  return setUserAbstraction(wallet, user, "unifiedAccount");
}

export async function activatePortfolioMarginMode(
  wallet: HyperliquidSigner,
  user: `0x${string}`,
) {
  return setUserAbstraction(wallet, user, "portfolioMargin");
}

export async function disableUnifiedAccountMode(
  wallet: HyperliquidSigner,
  user: `0x${string}`,
) {
  return setUserAbstraction(wallet, user, "disabled");
}

export async function approveAgentWallet(
  wallet: HyperliquidSigner,
  args: { agentAddress: `0x${string}` },
) {
  return signAndSubmit(wallet, {
    type: "approveAgent",
    agentAddress: args.agentAddress,
  });
}

export async function withdrawToArbitrum(
  wallet: HyperliquidSigner,
  args: { destination: `0x${string}`; amount: string },
) {
  return signAndSubmit(wallet, {
    type: "withdraw3",
    destination: args.destination,
    amount: args.amount,
  });
}

export async function withdrawToEvmWithData(
  wallet: HyperliquidSigner,
  args: {
    destination: `0x${string}`;
    amount: string;
    sourceDex: WithdrawSourceDex;
    destinationChainId: number;
    signatureChainId: `0x${string}`;
  },
) {
  return signAndSubmit(wallet, {
    type: "sendToEvmWithData",
    destination: args.destination,
    amount: args.amount,
    sourceDex: args.sourceDex,
    destinationChainId: args.destinationChainId,
    signatureChainId: args.signatureChainId,
  });
}

export async function withdrawToHyperEvm(
  wallet: HyperliquidSigner,
  args: {
    amount: string;
    sourceDex: WithdrawSourceDex;
  },
) {
  return signAndSubmit(wallet, {
    type: "withdrawHyperEvm",
    amount: args.amount,
    sourceDex: args.sourceDex,
  });
}

async function setUserAbstraction(
  wallet: HyperliquidSigner,
  user: `0x${string}`,
  abstraction: "unifiedAccount" | "portfolioMargin" | "disabled",
) {
  return signAndSubmit(wallet, {
    type: "setAccountMode",
    user,
    abstraction,
  });
}

async function signAndSubmit(
  wallet: HyperliquidSigner,
  request: Record<string, unknown>,
) {
  const prepared = await prepareAction(request);
  const signature =
    prepared.signatureKind === "l1"
      ? await signL1Action({
          wallet,
          action: prepared.action,
          nonce: prepared.nonce,
          isTestnet: false,
        })
      : await signUserSignedAction({
          wallet: wallet as Parameters<typeof signUserSignedAction>[0]["wallet"],
          action: prepared.action,
          types: prepared.types,
          chainId: prepared.chainId,
        });

  return submitAction(prepared.action, signature, prepared.nonce);
}

async function prepareAction(body: Record<string, unknown>) {
  return apiPost<PreparedAction>("/api/actions/prepare", body);
}

async function submitAction(
  action: PreparedAction["action"],
  signature: { r: Hex; s: Hex; v: number },
  nonce: number,
) {
  return apiPost("/api/actions/submit", {
    action,
    signature,
    nonce,
  });
}

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path);
  return parseApiResponse<T>(response);
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<T>(response);
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = await response.json();

  if (!response.ok) {
    const message =
      typeof body?.message === "string" ? body.message : "API request failed.";
    throw new Error(message);
  }

  return body as T;
}
