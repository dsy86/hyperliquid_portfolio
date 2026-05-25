import { createAppKit } from "@reown/appkit/react";
import {
  arbitrum,
  base,
  mainnet,
  optimism,
  type AppKitNetwork,
} from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID ?? "";

export const supportedChains: [AppKitNetwork, ...AppKitNetwork[]] = [
  arbitrum,
  mainnet,
  base,
  optimism,
];
export const primaryChain = arbitrum;
export const hasWalletConnect = Boolean(projectId);

const metadata = {
  name: "HyperCore Portfolio",
  description: "Manage Hyperliquid HyperCore assets",
  url: window.location.origin,
  icons: [`${window.location.origin}/favicon.svg`],
};

const wagmiAdapter = new WagmiAdapter({
  networks: supportedChains,
  projectId,
});

createAppKit({
  adapters: [wagmiAdapter],
  networks: supportedChains,
  defaultNetwork: primaryChain,
  metadata,
  projectId,
  themeMode: "light",
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
