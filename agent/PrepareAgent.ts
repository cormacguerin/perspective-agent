import {
  AgentKit,
  WalletProvider,
  walletActionProvider,
  CdpSmartWalletProvider,
  wethActionProvider,
  erc20ActionProvider,
  cdpApiActionProvider,
  cdpSmartWalletActionProvider,
  x402ActionProvider,
//  zeroXActionProvider,
} from "@coinbase/agentkit";

import {
  configActionProvider, // config provider (required)
} from "./providers/configActionProvider.js";
import {
  newPythActionProvider, // custom provider with robust price getter
} from "./providers/newPythActionProvider.js";
import {
  dexScreenerActionProvider, // custom provider for based hackathon
} from "./providers/dexScreenerActionProvider.js";
import {
  basicActionProvider, // custom provider basic functions
} from "./providers/basicActionProvider.js";

import { createWalletClient, http, publicActions } from 'viem';  // viem is auto-available via AgentKit
import { mainnet } from 'viem/chains';  // or your chain

//import {
//  tradeStrategyActionProvider, // custom provider for based hackathon
//} from "../../providers/tradeStrategyActionProvider.js";
//import {
//  swapActionProvider, // custom provider for based hackathon
//} from "../../providers/swapActionProvider.js";

import * as fs from "fs";
import { Address, Hex, LocalAccount } from "viem";
import { privateKeyToAccount } from "viem/accounts";

//const pythProvider = newPythActionProvider();
//const tradeProvider = tradeStrategyActionProvider(pythProvider);

/**
 * AgentKit Integration Route
 *
 * This file is your gateway to integrating AgentKit with your product.
 * It defines the core capabilities of your agent through WalletProvider
 * and ActionProvider configuration.
 *
 * Key Components:
 * 1. WalletProvider Setup:
 *    - Configures the blockchain wallet integration
 *    - Learn more: https://github.com/coinbase/agentkit/tree/main/typescript/agentkit#evm-wallet-providers
 *
 * 2. ActionProviders Setup:
 *    - Defines the specific actions your agent can perform
 *    - Choose from built-in providers or create custom ones:
 *      - Built-in: https://github.com/coinbase/agentkit/tree/main/typescript/agentkit#action-providers
 *      - Custom: https://github.com/coinbase/agentkit/tree/main/typescript/agentkit#creating-an-action-provider
 *
 * # Next Steps:
 * - Explore the AgentKit README: https://github.com/coinbase/agentkit
 * - Experiment with different LLM configurations
 * - Fine-tune agent parameters for your use case
 *
 * ## Want to contribute?
 * Join us in shaping AgentKit! Check out the contribution guide:
 * - https://github.com/coinbase/agentkit/blob/main/CONTRIBUTING.md
 * - https://discord.gg/CDP
 */

// Configure a file to persist the agent's Smart Wallet + Private Key data
const WALLET_DATA_FILE = "wallet_data.txt";

type WalletData = {
  privateKey?: Hex;
  smartWalletAddress: Address;
  ownerAddress?: Address;
};

/**
 * Prepares the AgentKit and WalletProvider.
 *
 * @function prepareAgentkitAndWalletProvider
 * @returns {Promise<{ agentkit: AgentKit, walletProvider: WalletProvider }>} The initialized AI agent.
 *
 * @description Handles agent setup
 *
 * @throws {Error} If the agent initialization fails.
 */
export async function prepareAgentkitAndWalletProvider(): Promise<{
  agentkit: AgentKit;
  walletProvider: WalletProvider;
}> {
  if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
    throw new Error(
      "I need both CDP_API_KEY_ID and CDP_API_KEY_SECRET in your .env file to connect to the Coinbase Developer Platform.",
    );
  }

  let walletData: WalletData | null = null;
  let owner: Hex | LocalAccount | undefined = undefined;

  // Read existing wallet data if available
  if (fs.existsSync(WALLET_DATA_FILE)) {
    try {
      walletData = JSON.parse(fs.readFileSync(WALLET_DATA_FILE, "utf8")) as WalletData;
      if (walletData.ownerAddress) owner = walletData.ownerAddress;
      else if (walletData.privateKey) owner = privateKeyToAccount(walletData.privateKey as Hex);
      else
        console.log(
          `No ownerAddress or privateKey found in ${WALLET_DATA_FILE}, will create a new CDP server account as owner`,
        );
    } catch (error) {
      console.error("Error reading wallet data:", error);
    }
  }

  try {

    const walletProvider = await CdpSmartWalletProvider.configureWithWallet({
      apiKeyId: process.env.CDP_API_KEY_ID!,
      apiKeySecret: process.env.CDP_API_KEY_SECRET!,
      networkId: process.env.NETWORK_ID || "base-sepolia",
      address: walletData?.smartWalletAddress,
      paymasterUrl: process.env.PAYMASTER_URL,
      rpcUrl: process.env.RPC_URL,
    });

    console.log("Connected via Coinbase Smart Wallet");

    const agentkit = await AgentKit.from({
      walletProvider,
      actionProviders: [
        wethActionProvider(),
        walletActionProvider(),
        erc20ActionProvider(),
        cdpApiActionProvider(),
        cdpSmartWalletActionProvider(),
        x402ActionProvider(),
        configActionProvider(),
        newPythActionProvider(),
        dexScreenerActionProvider(),
        basicActionProvider(),
        //zeroXActionProvider(),
        //pythProvider,
        //tradeStrategyActionProvider(),
        //tradeProvider,
        //swapActionProvider(),
      ],
    });

    // Save wallet data
    if (!walletData) {
      const exportedWallet = await walletProvider.exportWallet();
      fs.writeFileSync(
        WALLET_DATA_FILE,
        JSON.stringify({
          ownerAddress: exportedWallet.ownerAddress,
          smartWalletAddress: exportedWallet.address,
        } as WalletData),
      );
    }

    return { agentkit, walletProvider };
  } catch (error) {
    console.error("Error initializing agent:", error);
    throw new Error("Failed to initialize agent");
  }

}
