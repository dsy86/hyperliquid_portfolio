import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Copy,
  LogOut,
  RefreshCw,
  Send,
  Wallet,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppKit } from "@reown/appkit/react";
import {
  useAccount,
  useDisconnect,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { parseUnits, isAddress } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import {
  ARBITRUM_NATIVE_USDC,
  HYPERLIQUID_BRIDGE2,
  activatePortfolioMarginMode,
  activateUnifiedAccountMode,
  approveAgentWallet,
  cancelOpenOrder,
  closePerpsPosition,
  disableUnifiedAccountMode,
  erc20TransferAbi,
  loadAgentRole,
  loadCctpFeeQuote,
  loadAccountSnapshot,
  sendPerpUsdc,
  sendSpotAsset,
  sendUnifiedAsset,
  transferUsdClass,
  withdrawToArbitrum,
  withdrawToEvmWithData,
  withdrawToHyperEvm,
  type AccountSnapshot,
  type AgentWalletRow,
  type CctpFeeQuote,
  type HyperliquidSigner,
  type OpenOrderRow,
  type PositionRow,
  type WithdrawSourceDex,
} from "./hyperliquid";
import { hasWalletConnect, primaryChain } from "./wagmi";

type Notice = {
  kind: "success" | "error";
  text: string;
};

type SendSource = {
  label: string;
  value: string;
  tokenKey: `${string}:0x${string}` | null;
};

type WithdrawChainId = "arbitrum" | "arbitrum-cctp" | "hyperevm";
type AccountType = "manual" | "unified" | "portfolio";
type PortfolioTab = "readonly" | "wallet" | "agent";

type WithdrawChain = {
  id: WithdrawChainId;
  label: string;
  kind: "bridge" | "cctp" | "hyperevm";
  feeLabel: string;
  feeHint: string;
  destinationChainId?: number;
  signatureChainId?: `0x${string}`;
};

const emptyTransfer = { amount: "", direction: "spot-to-perp" };
const emptySend = { source: "perp-usdc", amount: "", destination: "" };
const emptyBridge = {
  amount: "",
  destination: "",
  chain: "arbitrum" as WithdrawChainId,
};
const PRIVATE_KEY_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const READONLY_ADDRESS_STORAGE_KEY = "hypercore.readonlyAddress";
const MIN_ARBITRUM_DEPOSIT_USDC = 5;
const WITHDRAW_CHAINS: WithdrawChain[] = [
  {
    id: "arbitrum",
    label: "Arbitrum",
    kind: "bridge",
    feeLabel: "1 USDC",
    feeHint: "Legacy Hyperliquid bridge fee, deducted from the withdrawn USDC.",
  },
  {
    id: "arbitrum-cctp",
    label: "Arbitrum (CCTP)",
    kind: "cctp",
    feeLabel: "Loading fee...",
    feeHint: "Circle CCTP forwarding fee, refreshed from Circle.",
    destinationChainId: 3,
    signatureChainId: "0xa4b1",
  },
  {
    id: "hyperevm",
    label: "HyperEVM",
    kind: "hyperevm",
    feeLabel: "No bridge fee",
    feeHint:
      "Arrives as USDC on HyperEVM at your connected wallet address. HyperCore token-transfer gas rules may still apply.",
  },
];

function App() {
  const { address: browserAddress, chainId } = useAccount();
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const queryClient = useQueryClient();

  const [importedAccount, setImportedAccount] =
    useState<PrivateKeyAccount | null>(null);
  const [privateKeyInput, setPrivateKeyInput] = useState("");
  const [transferForm, setTransferForm] = useState(emptyTransfer);
  const [sendForm, setSendForm] = useState(emptySend);
  const [depositForm, setDepositForm] = useState({ amount: "" });
  const [withdrawForm, setWithdrawForm] = useState(emptyBridge);
  const [agentAddressForm, setAgentAddressForm] = useState("");
  const [lookupAddress, setLookupAddress] = useState(
    () => getStoredReadonlyAddress() ?? "",
  );
  const [viewAddress, setViewAddress] = useState<`0x${string}` | null>(
    () => getStoredReadonlyAddress(),
  );
  const [activeTab, setActiveTab] = useState<PortfolioTab>("readonly");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const activeAddress = importedAccount?.address ?? browserAddress ?? null;
  const activeSigner = (importedAccount ?? walletClient ?? null) as
    | HyperliquidSigner
    | null;
  const signerKind = importedAccount
    ? "private-key"
    : browserAddress
      ? "wallet"
      : "none";

  const agentRoleQuery = useQuery({
    queryKey: ["hyperliquid-agent-role", activeAddress],
    queryFn: () => loadAgentRole(activeAddress!),
    enabled: Boolean(activeAddress),
    refetchOnWindowFocus: false,
  });
  const accountQuery = useQuery({
    queryKey: ["hyperliquid-account", viewAddress],
    queryFn: () => loadAccountSnapshot(viewAddress!),
    enabled: Boolean(viewAddress),
    refetchOnWindowFocus: false,
  });

  const sendSources = useMemo(
    () => buildSendSources(accountQuery.data),
    [accountQuery.data],
  );
  const accountType = getAccountType(accountQuery.data?.accountMode.mode);
  const isManualMode = accountType === "manual";
  const isSharedBalanceMode = !isManualMode;
  const agentMasterAddress = agentRoleQuery.data?.masterAddress ?? null;
  const shouldShowAgentTab =
    !activeAddress || agentRoleQuery.isLoading || Boolean(agentMasterAddress);
  const isViewingOwnSigner = Boolean(
    activeAddress &&
      viewAddress &&
      activeAddress.toLowerCase() === viewAddress.toLowerCase(),
  );
  const isViewingAgentMaster = Boolean(
    agentMasterAddress &&
      viewAddress &&
      agentMasterAddress.toLowerCase() === viewAddress.toLowerCase(),
  );
  const canSignForViewedAddress = Boolean(
    activeSigner && (isViewingOwnSigner || isViewingAgentMaster),
  );
  const canOperateCurrentView = Boolean(
    activeSigner &&
      ((activeTab === "wallet" && isViewingOwnSigner) ||
        (activeTab === "agent" && isViewingAgentMaster)),
  );
  const canDepositCurrentView =
    activeTab === "wallet" &&
    signerKind === "wallet" &&
    Boolean(browserAddress && viewAddress && walletClient) &&
    browserAddress?.toLowerCase() === viewAddress?.toLowerCase();
  const shouldShowClassTransfer = canOperateCurrentView && isManualMode;
  const selectedWithdrawChain = getWithdrawChain(withdrawForm.chain);
  const withdrawFeeQuery = useQuery({
    queryKey: [
      "withdraw-fee",
      selectedWithdrawChain.id,
      selectedWithdrawChain.destinationChainId,
    ],
    queryFn: () => loadCctpFeeQuote(selectedWithdrawChain.destinationChainId!),
    enabled: canOperateCurrentView && selectedWithdrawChain.kind === "cctp",
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (activeAddress && !viewAddress && !lookupAddress) {
      setLookupAddress(activeAddress);
      setViewAddress(activeAddress);
      setActiveTab("wallet");
    }
  }, [activeAddress, lookupAddress, viewAddress]);

  useEffect(() => {
    if (activeTab === "wallet" && activeAddress) {
      setLookupAddress(activeAddress);
      setViewAddress(activeAddress);
    }
  }, [activeAddress, activeTab]);

  useEffect(() => {
    if (activeTab === "agent" && agentMasterAddress) {
      setLookupAddress(agentMasterAddress);
      setViewAddress(agentMasterAddress);
    } else if (activeTab === "agent" && activeAddress && !agentRoleQuery.isLoading) {
      setLookupAddress(activeAddress);
      setViewAddress(activeAddress);
      setActiveTab("wallet");
    }
  }, [activeAddress, activeTab, agentMasterAddress, agentRoleQuery.isLoading]);

  useEffect(() => {
    if (
      sendSources.length > 0 &&
      !sendSources.some((source) => source.value === sendForm.source)
    ) {
      setSendForm((current) => ({
        ...current,
        source: sendSources[0].value,
      }));
    }
  }, [sendForm.source, sendSources]);

  async function ensureArbitrum() {
    if (signerKind === "private-key") {
      return;
    }
    if (chainId !== primaryChain.id) {
      await switchChainAsync({ chainId: primaryChain.id });
    }
  }

  async function runAction(name: string, task: () => Promise<string>) {
    if (!activeAddress || !activeSigner) {
      setNotice({ kind: "error", text: "Connect a wallet or import a private key first." });
      return;
    }
    if (!canSignForViewedAddress) {
      setNotice({
        kind: "error",
        text: "Select your wallet or an authorized master wallet before signing actions.",
      });
      return;
    }

    setNotice(null);
    setBusyAction(name);
    try {
      await ensureArbitrum();
      const message = await task();
      await queryClient.invalidateQueries({
        queryKey: ["hyperliquid-account", viewAddress],
      });
      setNotice({ kind: "success", text: message });
    } catch (error) {
      setNotice({ kind: "error", text: getErrorMessage(error) });
    } finally {
      setBusyAction(null);
    }
  }

  function submitLookupAddress() {
    const nextAddress = lookupAddress.trim();
    if (!isAddress(nextAddress)) {
      setNotice({ kind: "error", text: "Enter a valid wallet address." });
      return;
    }

    setNotice(null);
    setViewAddress(nextAddress as `0x${string}`);
    localStorage.setItem(READONLY_ADDRESS_STORAGE_KEY, nextAddress);
    setActiveTab("readonly");
  }

  function useConnectedWalletAddress() {
    if (!activeAddress) {
      setNotice({ kind: "error", text: "Connect a wallet or import a private key first." });
      return;
    }

    setNotice(null);
    setLookupAddress(activeAddress);
    setViewAddress(activeAddress);
    setActiveTab("wallet");
  }

  function useAgentMasterAddress() {
    if (!activeAddress) {
      setNotice({ kind: "error", text: "Connect a wallet or import a private key first." });
      return;
    }
    if (agentRoleQuery.isLoading) {
      return;
    }
    if (!agentMasterAddress) {
      setNotice({
        kind: "error",
        text: "Connected wallet is not an authorized Hyperliquid Agent Wallet.",
      });
      return;
    }

    setNotice(null);
    setLookupAddress(agentMasterAddress);
    setViewAddress(agentMasterAddress);
    setActiveTab("agent");
  }

  function submitImportPrivateKey() {
    const normalizedKey = normalizePrivateKey(privateKeyInput);

    if (!normalizedKey) {
      setNotice({ kind: "error", text: "Enter a valid private key." });
      return;
    }

    try {
      const account = privateKeyToAccount(normalizedKey);
      setImportedAccount(account);
      setPrivateKeyInput("");
      setNotice(null);
      if (activeTab === "readonly") {
        setActiveTab("wallet");
      }
      if (activeTab !== "agent") {
        setLookupAddress(account.address);
        setViewAddress(account.address);
      }
    } catch {
      setNotice({ kind: "error", text: "Enter a valid private key." });
    }
  }

  function disconnectActiveSigner() {
    if (importedAccount) {
      setImportedAccount(null);
      setPrivateKeyInput("");
      setViewAddress(null);
      setLookupAddress("");
      setActiveTab("readonly");
      setNotice(null);
      return;
    }

    disconnect();
    setViewAddress(null);
    setLookupAddress("");
    setActiveTab("readonly");
    setNotice(null);
  }

  async function submitClassTransfer() {
    if (!isManualMode) {
      setNotice({
        kind: "error",
        text: "Spot / Perps transfer is disabled for this account type.",
      });
      return;
    }
    if (!isPositiveAmount(transferForm.amount)) {
      setNotice({ kind: "error", text: "Enter a positive transfer amount." });
      return;
    }

    await runAction("class-transfer", async () => {
      await transferUsdClass(activeSigner!, {
        amount: transferForm.amount,
        toPerp: transferForm.direction === "spot-to-perp",
      });
      setTransferForm(emptyTransfer);
      return "Transfer submitted.";
    });
  }

  async function submitSend() {
    if (!isAddress(sendForm.destination)) {
      setNotice({ kind: "error", text: "Enter a valid recipient address." });
      return;
    }
    if (!isPositiveAmount(sendForm.amount)) {
      setNotice({ kind: "error", text: "Enter a positive send amount." });
      return;
    }

    await runAction("send", async () => {
      const source = sendSources.find((item) => item.value === sendForm.source);

      if (!source) {
        throw new Error("Select an asset to send.");
      }

      if (isSharedBalanceMode) {
        if (!source.tokenKey) {
          throw new Error("Select an asset to send.");
        }
        await sendUnifiedAsset(activeSigner!, {
          destination: sendForm.destination as `0x${string}`,
          token: source.tokenKey,
          amount: sendForm.amount,
        });
      } else if (source.value === "perp-usdc") {
        await sendPerpUsdc(activeSigner!, {
          destination: sendForm.destination as `0x${string}`,
          amount: sendForm.amount,
        });
      } else if (source.tokenKey) {
        await sendSpotAsset(activeSigner!, {
          destination: sendForm.destination as `0x${string}`,
          token: source.tokenKey,
          amount: sendForm.amount,
        });
      }

      setSendForm({
        ...emptySend,
        source: sendSources[0]?.value ?? emptySend.source,
      });
      return "Send submitted.";
    });
  }

  async function submitSetAccountType(nextType: AccountType) {
    await runAction("account-mode", async () => {
      if (!viewAddress) {
        throw new Error("Select an account first.");
      }
      if (nextType === "manual") {
        await disableUnifiedAccountMode(activeSigner!, viewAddress);
        return "Manual account activation submitted.";
      }

      if (nextType === "portfolio") {
        await activatePortfolioMarginMode(activeSigner!, viewAddress);
        return "Portfolio Margin activation submitted.";
      }

      await activateUnifiedAccountMode(activeSigner!, viewAddress);
      return "Unified Account activation submitted.";
    });
  }

  async function submitDeposit() {
    if (!canDepositCurrentView) {
      setNotice({
        kind: "error",
        text: "Deposits can only be sent to your connected wallet account.",
      });
      return;
    }
    if (!isAtLeastAmount(depositForm.amount, MIN_ARBITRUM_DEPOSIT_USDC)) {
      setNotice({
        kind: "error",
        text: `Minimum Arbitrum deposit is ${MIN_ARBITRUM_DEPOSIT_USDC} USDC.`,
      });
      return;
    }

    await runAction("deposit", async () => {
      const hash = await walletClient!.writeContract({
        address: ARBITRUM_NATIVE_USDC,
        abi: erc20TransferAbi,
        functionName: "transfer",
        args: [HYPERLIQUID_BRIDGE2, parseUnits(depositForm.amount, 6)],
        account: browserAddress!,
        chain: primaryChain,
      });
      setDepositForm({ amount: "" });
      return `Deposit transaction sent: ${shortHash(hash)}`;
    });
  }

  async function submitApproveAgent() {
    const agentAddress = agentAddressForm.trim();

    if (!isAddress(agentAddress)) {
      setNotice({ kind: "error", text: "Enter a valid agent wallet address." });
      return;
    }

    await runAction("approve-agent", async () => {
      await approveAgentWallet(activeSigner!, {
        agentAddress: agentAddress as `0x${string}`,
      });
      setAgentAddressForm("");
      return "Agent Wallet approved for about 180 days.";
    });
  }

  async function submitCancelOrder(order: OpenOrderRow) {
    if (order.assetId < 0) {
      setNotice({
        kind: "error",
        text: "Unable to identify this order market for cancellation.",
      });
      return;
    }

    await runAction(`cancel-${order.orderId}`, async () => {
      await cancelOpenOrder(activeSigner!, {
        assetId: order.assetId,
        orderId: order.orderId,
      });
      return "Order cancellation submitted.";
    });
  }

  async function submitClosePosition(position: PositionRow) {
    if (position.assetId < 0) {
      setNotice({
        kind: "error",
        text: "Unable to identify this position market for closing.",
      });
      return;
    }

    await runAction(`close-${position.coin}`, async () => {
      await closePerpsPosition(activeSigner!, {
        coin: position.coin,
        size: position.size,
      });
      return "Close position order submitted.";
    });
  }

  async function submitWithdraw() {
    if (
      selectedWithdrawChain.kind !== "hyperevm" &&
      !isAddress(withdrawForm.destination)
    ) {
      setNotice({ kind: "error", text: "Enter a valid destination address." });
      return;
    }
    if (!isPositiveAmount(withdrawForm.amount)) {
      setNotice({ kind: "error", text: "Enter a positive withdrawal amount." });
      return;
    }

    await runAction("withdraw", async () => {
      const sourceDex = getWithdrawSourceDex(accountType);

      if (selectedWithdrawChain.kind === "bridge") {
        await withdrawToArbitrum(activeSigner!, {
          destination: withdrawForm.destination as `0x${string}`,
          amount: withdrawForm.amount,
        });
      } else if (selectedWithdrawChain.kind === "cctp") {
        await withdrawToEvmWithData(activeSigner!, {
          destination: withdrawForm.destination as `0x${string}`,
          amount: withdrawForm.amount,
          sourceDex,
          destinationChainId: selectedWithdrawChain.destinationChainId!,
          signatureChainId: selectedWithdrawChain.signatureChainId!,
        });
      } else {
        await withdrawToHyperEvm(activeSigner!, {
          amount: withdrawForm.amount,
          sourceDex,
        });
      }

      setWithdrawForm({
        ...emptyBridge,
        chain: selectedWithdrawChain.id,
      });
      return `Withdrawal to ${selectedWithdrawChain.label} submitted.`;
    });
  }

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">HyperCore Portfolio</p>
          <h1>Manage Hyperliquid balances</h1>
        </div>
        {activeAddress ? (
          <div className="wallet-pill">
            <span>
              {shortAddress(activeAddress)}
              {signerKind === "private-key" ? " Imported" : ""}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Copy address"
              onClick={() => navigator.clipboard.writeText(activeAddress)}
            >
              <Copy size={16} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Disconnect signer"
              onClick={disconnectActiveSigner}
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <SignerAccess
            privateKeyInput={privateKeyInput}
            onPrivateKeyInputChange={setPrivateKeyInput}
            onImportPrivateKey={submitImportPrivateKey}
            onConnectWallet={() => open({ view: "Connect" })}
            canConnectWallet={hasWalletConnect}
            compact
          />
        )}
      </header>

      <section className="portfolio-tabs-band">
        <div className="portfolio-tabs" role="tablist" aria-label="Portfolio view">
          <button
            type="button"
            className={activeTab === "readonly" ? "active" : ""}
            onClick={() => {
              setActiveTab("readonly");
              const storedAddress = getStoredReadonlyAddress();
              if (storedAddress) {
                setLookupAddress(storedAddress);
                setViewAddress(storedAddress);
              }
            }}
          >
            Read-only address
          </button>
          <button
            type="button"
            className={activeTab === "wallet" ? "active" : ""}
            onClick={() => {
              setActiveTab("wallet");
              if (activeAddress) {
                setLookupAddress(activeAddress);
                setViewAddress(activeAddress);
              }
            }}
          >
            My wallet
          </button>
          <button
            type="button"
            className={activeTab === "agent" ? "active" : ""}
            disabled={!shouldShowAgentTab}
            onClick={() => {
              setActiveTab("agent");
              if (agentMasterAddress) {
                setLookupAddress(agentMasterAddress);
                setViewAddress(agentMasterAddress);
              } else {
                setLookupAddress("");
                setViewAddress(null);
              }
            }}
          >
            Authorized master
          </button>
        </div>

        {activeTab === "readonly" ? (
          <div className="tab-panel">
            <label>
              View portfolio address
              <input
                value={lookupAddress}
                placeholder="0x..."
                onChange={(event) => setLookupAddress(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    submitLookupAddress();
                  }
                }}
              />
            </label>
            <div className="lookup-actions">
              <button
                type="button"
                className="primary-button"
                onClick={submitLookupAddress}
              >
                View Portfolio
              </button>
            </div>
          </div>
        ) : null}

        {activeTab === "wallet" ? (
          <div className="wallet-tab-panel">
            {activeAddress ? (
              <div className="wallet-tab-row">
                <div>
                  <p className="eyebrow">
                    {signerKind === "private-key"
                      ? "Imported wallet"
                      : "Connected wallet"}
                  </p>
                  <strong>{shortAddress(activeAddress)}</strong>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={useConnectedWalletAddress}
                >
                  Refresh wallet view
                </button>
              </div>
            ) : (
              <SignerAccess
                privateKeyInput={privateKeyInput}
                onPrivateKeyInputChange={setPrivateKeyInput}
                onImportPrivateKey={submitImportPrivateKey}
                onConnectWallet={() => open({ view: "Connect" })}
                canConnectWallet={hasWalletConnect}
              />
            )}
          </div>
        ) : null}

        {activeTab === "agent" ? (
          activeAddress ? (
            <div className="tab-panel info-panel">
              <div>
                <p className="eyebrow">Authorized master wallet</p>
                <strong>
                  {agentMasterAddress
                    ? shortAddress(agentMasterAddress)
                    : agentRoleQuery.isLoading
                      ? "Checking..."
                      : "No authorized master found"}
                </strong>
                {agentMasterAddress ? (
                  <p className="hint">
                    Actions are signed by {shortAddress(activeAddress)} as
                    Agent Wallet.
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="secondary-button"
                disabled={!agentMasterAddress}
                onClick={useAgentMasterAddress}
              >
                View master wallet
              </button>
            </div>
          ) : (
            <SignerAccess
              privateKeyInput={privateKeyInput}
              onPrivateKeyInputChange={setPrivateKeyInput}
              onImportPrivateKey={submitImportPrivateKey}
              onConnectWallet={() => open({ view: "Connect" })}
              canConnectWallet={hasWalletConnect}
            />
          )
        ) : null}
      </section>

      {notice ? (
        <div className={`notice ${notice.kind}`}>{notice.text}</div>
      ) : null}

      {!viewAddress ? (
        activeTab === "readonly" ? (
          <section className="connect-shell">
            <div className="connect-action">
              <p className="hint">
                Enter any wallet address above to view a read-only portfolio.
              </p>
              {!hasWalletConnect ? (
                <p className="hint">
                  Add `VITE_REOWN_PROJECT_ID` to enable wallet connections.
                </p>
              ) : null}
            </div>
          </section>
        ) : null
      ) : (
        <>
          <section className="account-tools-grid">
            <section className="account-card account-overview-card">
              <div className="account-card-heading">
                <div>
                  <p className="eyebrow">Portfolio</p>
                  <h2>Account overview</h2>
                </div>
                <button
                  type="button"
                  className="secondary-button refresh"
                  onClick={() => accountQuery.refetch()}
                  disabled={accountQuery.isFetching}
                >
                  <RefreshCw size={16} />
                  Refresh
                </button>
              </div>
              <div
                className={`metrics-grid ${
                  isManualMode ? "four-metrics" : "three-metrics"
                }`}
              >
                <Metric
                  label={isManualMode ? "Perps account" : "Account value"}
                  value={formatUsd(
                    isManualMode
                      ? accountQuery.data?.summary.perpAccountValue
                      : accountQuery.data?.summary.accountValue,
                  )}
                />
                {isManualMode ? (
                  <Metric
                    label="Spot account"
                    value={formatUsd(accountQuery.data?.summary.spotAccountValue)}
                  />
                ) : null}
                <Metric
                  label="Withdrawable"
                  value={formatUsd(accountQuery.data?.summary.withdrawable)}
                />
                <Metric
                  label="Margin used"
                  value={formatUsd(accountQuery.data?.summary.marginUsed)}
                />
              </div>
            </section>

            <section className="account-card account-mode-card">
              <div>
                <p className="eyebrow">Account mode</p>
                <h2>{getAccountTypeLabel(accountType)}</h2>
                <p className="hint">
                  Viewing {shortAddress(viewAddress)}
                  {canOperateCurrentView
                    ? activeTab === "agent"
                      ? ` with Agent signing from ${shortAddress(activeAddress ?? undefined)}.`
                      : " with signing enabled."
                    : " in read-only mode."}
                </p>
              </div>
              {canOperateCurrentView ? (
                <div className="account-type-control">
                  {(["unified", "portfolio", "manual"] as const).map((type) => (
                    <button
                      type="button"
                      key={type}
                      className={accountType === type ? "active" : ""}
                      disabled={
                        busyAction === "account-mode" ||
                        accountQuery.isLoading ||
                        accountType === type
                      }
                      onClick={() => submitSetAccountType(type)}
                    >
                      {getAccountTypeLabel(type)}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="readonly-pill">Read-only</span>
              )}
              <AgentWalletList agents={accountQuery.data?.agents ?? []} />
            </section>

            {activeTab === "wallet" && activeAddress ? (
              <section className="account-card agent-approval-card">
                <div>
                  <p className="eyebrow">Agent wallet</p>
                  <h2>Approve Agent</h2>
                  <p className="hint">
                    Approves a named Hyperliquid Agent Wallet for about 180 days.
                  </p>
                </div>
                <div className="agent-approval-form">
                  <label>
                    Agent wallet address
                    <input
                      value={agentAddressForm}
                      placeholder="0x..."
                      onChange={(event) =>
                        setAgentAddressForm(event.target.value)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busyAction === "approve-agent"}
                    onClick={submitApproveAgent}
                  >
                    Approve Agent
                  </button>
                </div>
              </section>
            ) : null}
          </section>

          <section className="content-grid">
            <section className="panel balances-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Balances</p>
                  <h2>{getBalancesTitle(accountType)}</h2>
                </div>
              </div>
              <BalancesTable
                data={accountQuery.data}
                isLoading={accountQuery.isLoading}
                error={accountQuery.error}
              />
            </section>

            <section className="panel perps-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Perps</p>
                  <h2>Positions and orders</h2>
                </div>
              </div>
              <div className="perps-sections">
                <section className="perps-section">
                  <h3>Open positions</h3>
                  <PositionsTable
                    data={accountQuery.data}
                    canClose={canOperateCurrentView}
                    busyAction={busyAction}
                    onClose={submitClosePosition}
                  />
                </section>
                <section className="perps-section">
                  <h3>Open orders</h3>
                  <OpenOrdersTable
                    data={accountQuery.data}
                    canCancel={canOperateCurrentView}
                    busyAction={busyAction}
                    onCancel={submitCancelOrder}
                  />
                </section>
              </div>
            </section>

            {canOperateCurrentView ? (
              <>
                {shouldShowClassTransfer ? (
                  <ActionPanel
                    icon={<ArrowLeftRight size={19} />}
                    title="Spot / Perps transfer"
                    action={
                      <button
                        type="button"
                        className="primary-button"
                        disabled={busyAction === "class-transfer"}
                        onClick={submitClassTransfer}
                      >
                        Transfer
                      </button>
                    }
                  >
                    <label>
                      Amount
                      <input
                        inputMode="decimal"
                        value={transferForm.amount}
                        placeholder="0.00 USDC"
                        onChange={(event) =>
                          setTransferForm({
                            ...transferForm,
                            amount: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Direction
                      <select
                        value={transferForm.direction}
                        onChange={(event) =>
                          setTransferForm({
                            ...transferForm,
                            direction: event.target.value,
                          })
                        }
                      >
                        <option value="spot-to-perp">Spot to Perps</option>
                        <option value="perp-to-spot">Perps to Spot</option>
                      </select>
                    </label>
                  </ActionPanel>
                ) : null}

                <section className="funding-actions-grid">
                  <ActionPanel
                    icon={<Send size={19} />}
                    title="Send asset"
                    action={
                      <button
                        type="button"
                        className="primary-button"
                        disabled={
                          busyAction === "send" || sendSources.length === 0
                        }
                        onClick={submitSend}
                      >
                        Send
                      </button>
                    }
                  >
                    <label>
                      {isSharedBalanceMode ? "Asset" : "Source"}
                      <select
                        value={sendForm.source}
                        disabled={sendSources.length === 0}
                        onChange={(event) =>
                          setSendForm({
                            ...sendForm,
                            source: event.target.value,
                          })
                        }
                      >
                        {sendSources.map((source) => (
                          <option value={source.value} key={source.value}>
                            {source.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Recipient
                      <input
                        value={sendForm.destination}
                        placeholder="0x..."
                        onChange={(event) =>
                          setSendForm({
                            ...sendForm,
                            destination: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Amount
                      <input
                        inputMode="decimal"
                        value={sendForm.amount}
                        placeholder="0.00"
                        onChange={(event) =>
                          setSendForm({
                            ...sendForm,
                            amount: event.target.value,
                          })
                        }
                      />
                    </label>
                    <p className="hint">
                      HyperCore may charge a one-time 1 USDC activation gas fee
                      when sending to an unused address. This is paid from your
                      HyperCore USDC balance, not wallet network gas.
                    </p>
                  </ActionPanel>

                  {canDepositCurrentView ? (
                    <ActionPanel
                      icon={<ArrowDownToLine size={19} />}
                      title="Deposit from Arbitrum"
                      action={
                        <button
                          type="button"
                          className="primary-button"
                          disabled={busyAction === "deposit"}
                          onClick={submitDeposit}
                        >
                          Deposit
                        </button>
                      }
                    >
                      <label>
                        Amount
                        <input
                          inputMode="decimal"
                          value={depositForm.amount}
                          placeholder="5.00 USDC"
                          onChange={(event) =>
                            setDepositForm({ amount: event.target.value })
                          }
                        />
                      </label>
                      <p className="hint">
                        Sends native Arbitrum USDC to Hyperliquid Bridge2.
                        Minimum deposit is 5 USDC.
                      </p>
                    </ActionPanel>
                  ) : null}

                  <ActionPanel
                    icon={<ArrowUpFromLine size={19} />}
                    title="Withdraw"
                    action={
                      <button
                        type="button"
                        className="primary-button"
                        disabled={busyAction === "withdraw"}
                        onClick={submitWithdraw}
                      >
                        Withdraw
                      </button>
                    }
                  >
                    <label>
                      Asset
                      <select value="USDC" disabled>
                        <option value="USDC">USDC</option>
                      </select>
                    </label>
                    <label>
                      Withdrawal chain
                      <select
                        value={withdrawForm.chain}
                        onChange={(event) =>
                          setWithdrawForm({
                            ...withdrawForm,
                            chain: event.target.value as WithdrawChainId,
                          })
                        }
                      >
                        {WITHDRAW_CHAINS.map((chain) => (
                          <option value={chain.id} key={chain.id}>
                            {chain.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="fee-summary">
                      <div>
                        <span>Fee</span>
                        <strong>
                          {formatWithdrawFee(
                            selectedWithdrawChain,
                            withdrawFeeQuery,
                          )}
                        </strong>
                      </div>
                      <p>
                        {getWithdrawFeeHint(
                          selectedWithdrawChain,
                          withdrawFeeQuery,
                        )}
                      </p>
                    </div>
                    {selectedWithdrawChain.kind === "hyperevm" ? (
                      <p className="hint">
                        HyperEVM withdrawals are sent to your connected wallet
                        address.
                      </p>
                    ) : (
                      <label>
                        Destination
                        <input
                          value={withdrawForm.destination}
                          placeholder="0x..."
                          onChange={(event) =>
                            setWithdrawForm({
                              ...withdrawForm,
                              destination: event.target.value,
                            })
                          }
                        />
                      </label>
                    )}
                    <label>
                      Amount
                      <input
                        inputMode="decimal"
                        value={withdrawForm.amount}
                        placeholder="0.00 USDC"
                        onChange={(event) =>
                          setWithdrawForm({
                            ...withdrawForm,
                            amount: event.target.value,
                          })
                        }
                      />
                    </label>
                  </ActionPanel>
                </section>
              </>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}

function ActionPanel({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="panel action-panel">
      <div className="panel-heading">
        <div className="panel-title">
          <span className="icon-wrap">{icon}</span>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="form-stack">{children}</div>
      <div className="form-actions">{action}</div>
    </section>
  );
}

function SignerAccess({
  privateKeyInput,
  onPrivateKeyInputChange,
  onImportPrivateKey,
  onConnectWallet,
  canConnectWallet,
  compact = false,
}: {
  privateKeyInput: string;
  onPrivateKeyInputChange: (value: string) => void;
  onImportPrivateKey: () => void;
  onConnectWallet: () => void;
  canConnectWallet: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`signer-access ${compact ? "compact" : ""}`}>
      <button
        type="button"
        className="primary-button"
        disabled={!canConnectWallet}
        onClick={onConnectWallet}
      >
        <Wallet size={16} />
        Connect Wallet
      </button>
      <div className="private-key-form">
        <input
          type="password"
          value={privateKeyInput}
          placeholder="Import private key"
          onChange={(event) => onPrivateKeyInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onImportPrivateKey();
            }
          }}
        />
        <button
          type="button"
          className="secondary-button"
          onClick={onImportPrivateKey}
        >
          Import Key
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AgentWalletList({ agents }: { agents: AgentWalletRow[] }) {
  return (
    <div className="agent-wallet-list">
      <div className="agent-wallet-list-heading">
        <span>Agent wallets</span>
        <strong>{agents.length}</strong>
      </div>
      {agents.length ? (
        <ul>
          {agents.map((agent) => (
            <li key={agent.address}>
              <div>
                <strong>{shortAddress(agent.address)}</strong>
                <span>{agent.name.trim() ? agent.name : "Unnamed"}</span>
              </div>
              <span>{formatAgentValidUntil(agent.validUntil)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">No approved Agent Wallets found.</p>
      )}
    </div>
  );
}

function BalancesTable({
  data,
  isLoading,
  error,
}: {
  data?: AccountSnapshot;
  isLoading: boolean;
  error: Error | null;
}) {
  if (isLoading) {
    return <div className="empty-state">Loading balances...</div>;
  }
  if (error) {
    return <div className="empty-state error-text">{error.message}</div>;
  }
  if (!data) {
    return <div className="empty-state">No spot balances found.</div>;
  }

  const accountType = getAccountType(data.accountMode.mode);
  const isManualAccount = accountType === "manual";
  const isPortfolioAccount = accountType === "portfolio";

  return (
    <div className="balance-sections">
      {isManualAccount ? (
        <section className="balance-section">
          <h3>Perps account</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Account value</th>
                  <th>Withdrawable</th>
                  <th>Margin used</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>USDC</strong>
                  </td>
                  <td>{formatUsd(data.perp.accountValue)}</td>
                  <td>{formatUsd(data.perp.withdrawable)}</td>
                  <td>{formatUsd(data.perp.marginUsed)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {isPortfolioAccount ? (
        <section className="balance-section">
          <h3>Portfolio margin summary</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Account value</th>
                  <th>Withdrawable</th>
                  <th>Margin used</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{formatUsd(data.summary.accountValue)}</td>
                  <td>{formatUsd(data.summary.withdrawable)}</td>
                  <td>{formatUsd(data.summary.marginUsed)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="balance-section">
        {isManualAccount ? <h3>Spot assets</h3> : null}
        {data.spotBalances.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Total</th>
                  <th>Available</th>
                  <th>Hold</th>
                  <th>Entry</th>
                </tr>
              </thead>
              <tbody>
                {data.spotBalances.map((balance) => (
                  <tr key={`${balance.coin}-${balance.tokenId ?? balance.total}`}>
                    <td>
                      <strong>{balance.coin}</strong>
                    </td>
                    <td>{formatNumber(balance.total)}</td>
                    <td>{formatNumber(balance.available)}</td>
                    <td>{formatNumber(balance.hold)}</td>
                    <td>{formatUsd(balance.entryNtl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">No spot balances found.</div>
        )}
      </section>
    </div>
  );
}

function PositionsTable({
  data,
  canClose,
  busyAction,
  onClose,
}: {
  data?: AccountSnapshot;
  canClose: boolean;
  busyAction: string | null;
  onClose: (position: PositionRow) => void;
}) {
  if (!data?.positions.length) {
    return <div className="empty-state">No open perps positions.</div>;
  }

  return (
    <div className="table-wrap compact">
      <table>
        <thead>
          <tr>
            <th>Market</th>
            <th>Size</th>
            <th>Value</th>
            <th>PNL</th>
            {canClose ? <th>Action</th> : null}
          </tr>
        </thead>
        <tbody>
          {data.positions.map((position) => {
            const closeBusy = busyAction === `close-${position.coin}`;

            return (
              <tr key={position.coin}>
                <td>
                  <strong>{position.coin}</strong>
                  <span className="table-subtext">
                    {Number(position.size) > 0 ? "Long" : "Short"}
                  </span>
                </td>
                <td>{formatNumber(position.size)}</td>
                <td>{formatUsd(position.value)}</td>
                <td className={Number(position.pnl) >= 0 ? "green" : "red"}>
                  {formatUsd(position.pnl)}
                </td>
                {canClose ? (
                  <td>
                    <button
                      type="button"
                      className="table-action-button"
                      disabled={closeBusy || position.assetId < 0}
                      onClick={() => onClose(position)}
                    >
                      <XCircle size={15} />
                      {closeBusy ? "Closing" : "Close"}
                    </button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OpenOrdersTable({
  data,
  canCancel,
  busyAction,
  onCancel,
}: {
  data?: AccountSnapshot;
  canCancel: boolean;
  busyAction: string | null;
  onCancel: (order: OpenOrderRow) => void;
}) {
  if (!data?.openOrders.length) {
    return <div className="empty-state">No open orders.</div>;
  }

  return (
    <div className="table-wrap compact">
      <table>
        <thead>
          <tr>
            <th>Market</th>
            <th>Side</th>
            <th>Price</th>
            <th>Size</th>
            <th>Notional</th>
            <th>Placed</th>
            {canCancel ? <th>Action</th> : null}
          </tr>
        </thead>
        <tbody>
          {data.openOrders.map((order) => {
            const cancelBusy = busyAction === `cancel-${order.orderId}`;

            return (
              <tr key={`${order.marketType}-${order.orderId}`}>
                <td>
                  <strong>{order.symbol}</strong>
                  <span className="table-subtext">
                    {order.marketType === "spot" ? "Spot" : "Perp"}
                    {order.reduceOnly ? " reduce only" : ""}
                  </span>
                </td>
                <td className={order.side === "buy" ? "green" : "red"}>
                  {order.side}
                </td>
                <td>{formatNumber(order.limitPrice)}</td>
                <td>{formatNumber(order.size)}</td>
                <td>{formatUsd(order.notionalUsd)}</td>
                <td>{formatDateTime(order.timestamp)}</td>
                {canCancel ? (
                  <td>
                    <button
                      type="button"
                      className="table-action-button"
                      disabled={cancelBusy || order.assetId < 0}
                      onClick={() => onCancel(order)}
                    >
                      <XCircle size={15} />
                      {cancelBusy ? "Canceling" : "Cancel"}
                    </button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function getWithdrawChain(id: WithdrawChainId) {
  return WITHDRAW_CHAINS.find((chain) => chain.id === id) ?? WITHDRAW_CHAINS[0];
}

function getAccountType(mode?: AccountSnapshot["accountMode"]["mode"]): AccountType {
  if (mode === "portfolioMargin") {
    return "portfolio";
  }
  if (mode === "unifiedAccount") {
    return "unified";
  }
  return "manual";
}

function getAccountTypeLabel(type: AccountType) {
  if (type === "portfolio") {
    return "Portfolio Margin";
  }
  if (type === "unified") {
    return "Unified Account";
  }
  return "Manual";
}

function getBalancesTitle(type: AccountType) {
  if (type === "portfolio") {
    return "Portfolio margin assets";
  }
  if (type === "unified") {
    return "Unified assets";
  }
  return "Account assets";
}

function getWithdrawSourceDex(type: AccountType): WithdrawSourceDex {
  return type === "manual" ? "" : "spot";
}

function formatWithdrawFee(
  chain: WithdrawChain,
  feeQuery: {
    data?: CctpFeeQuote;
    isLoading: boolean;
    isError: boolean;
  },
) {
  if (chain.kind !== "cctp") {
    return chain.feeLabel;
  }

  if (feeQuery.isLoading) {
    return chain.feeLabel;
  }

  if (feeQuery.isError || !feeQuery.data) {
    return "Fee unavailable";
  }

  return `~${formatUsdcFee(feeQuery.data.forwardFeeUsdc)} USDC`;
}

function getWithdrawFeeHint(
  chain: WithdrawChain,
  feeQuery: {
    data?: CctpFeeQuote;
    isError: boolean;
  },
) {
  if (chain.kind !== "cctp") {
    return chain.feeHint;
  }

  if (feeQuery.isError || !feeQuery.data) {
    return "Circle fee lookup failed. The withdrawal can still be signed, but the fee may differ.";
  }

  return `${chain.feeHint} Minimum fee: ${feeQuery.data.minimumFeeBps} bps.`;
}

function buildSendSources(data?: AccountSnapshot): SendSource[] {
  const accountType = getAccountType(data?.accountMode.mode);
  const isManualAccount = accountType === "manual";
  const sources: SendSource[] = isManualAccount
    ? [{ label: "USDC Perps balance", value: "perp-usdc", tokenKey: null }]
    : [];

  data?.spotBalances.forEach((balance) => {
    if (balance.tokenKey && Number(balance.total) > 0) {
      sources.push({
        label: isManualAccount ? `${balance.coin} Spot balance` : balance.coin,
        value: balance.tokenKey,
        tokenKey: balance.tokenKey,
      });
    }
  });

  return sources;
}

function isPositiveAmount(value: string) {
  return value.trim() !== "" && Number(value) > 0;
}

function isAtLeastAmount(value: string, minimum: number) {
  return value.trim() !== "" && Number(value) >= minimum;
}

function formatNumber(value?: string) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: numeric >= 1 ? 4 : 8,
  }).format(numeric);
}

function formatUsdcFee(value?: string) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
  }).format(Number(value ?? 0));
}

function formatUsd(value?: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatAgentValidUntil(value: number | null) {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return "No expiry";
  }
  return `Valid until ${formatDateTime(value)}`;
}

function shortAddress(value?: string) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "";
}

function shortHash(value: string) {
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function getStoredReadonlyAddress(): `0x${string}` | null {
  const value = localStorage.getItem(READONLY_ADDRESS_STORAGE_KEY);
  return value && isAddress(value) ? (value as `0x${string}`) : null;
}

function normalizePrivateKey(value: string): `0x${string}` | null {
  const trimmed = value.trim();
  const normalized = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  return PRIVATE_KEY_PATTERN.test(normalized)
    ? (normalized as `0x${string}`)
    : null;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (
      error.message.includes(
        "Insufficient USDC balance for token transfer gas",
      )
    ) {
      return "Insufficient USDC balance for HyperCore token transfer gas. Keep at least 1 extra USDC available for the one-time activation gas fee when sending to an unused address.";
    }
    return error.message;
  }
  return "Action failed.";
}

export default App;
