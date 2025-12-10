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
  newPythActionProvider, // custom provider with robust price getter
} from "./providers/newPythActionProvider.js";
import {
  dexScreenerActionProvider, // custom provider for based hackathon
} from "./providers/dexScreenerActionProvider.js";
import {
  basicActionProvider, // custom provider basic functions
} from "./providers/basicActionProvider.js";

//import {
//  AuthProvider, // Authentication provider
//} from "./providers/AuthProvider.js";

import {
  configActionProvider,
} from "./providers/configActionProvider.js";
import {
  dataStoreActionProvider, // custom provider for data storage
} from "./providers/dataStoreActionProvider.js";

import { createWalletClient, http, publicActions } from 'viem';  // viem is auto-available via AgentKit
import { mainnet } from 'viem/chains';  // or your chain

/*
import {
  tradeStrategyActionProvider, // custom provider for based hackathon
} from "../../providers/tradeStrategyActionProvider.js";
import {
  swapActionProvider, // custom provider for based hackathon
} from "../../providers/swapActionProvider.js";
*/

import * as fs from "fs";
import { Address, Hex, LocalAccount } from "viem";
import { privateKeyToAccount } from "viem/accounts";

//const pythProvider = newPythActionProvider();
//const tradeProvider = tradeStrategyActionProvider(pythProvider);

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
export async function prepareAgentkitAndWalletProvider(authProvider: any, reqAddr: string): Promise<{
  agentkit: AgentKit;
  walletProvider: WalletProvider;
  actionProviders: any;
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
      owner: owner as any,
      address: walletData?.smartWalletAddress,
      paymasterUrl: process.env.PAYMASTER_URL,
      rpcUrl: process.env.RPC_URL,
      idempotencyKey: process.env.IDEMPOTENCY_KEY,
    });

    console.log("Connected via Coinbase Smart Wallet");
    const actionProviders = {
      weth: wethActionProvider(),
      wallet:walletActionProvider(),
      erc20:erc20ActionProvider(),
      cdpApi:erc20ActionProvider(),
      cdpSmartWallet:cdpApiActionProvider(),
      x402:cdpSmartWalletActionProvider(),
      newPyth:newPythActionProvider(),
      dexScreener:dexScreenerActionProvider(),
      basic:basicActionProvider(),
      config:configActionProvider(authProvider, reqAddr),
      dataStore:dataStoreActionProvider(authProvider, reqAddr)
        //zeroXActionProvider(),
        //pythProvider,
        //tradeStrategyActionProvider(),
        //tradeProvider,
        //swapActionProvider(),
    };

    const agentkit = await AgentKit.from({
      walletProvider,
      actionProviders: Object.values(actionProviders)
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

    return { agentkit, walletProvider, actionProviders };

  } catch (error) {
    console.error("Error initializing agent:", error);
    throw new Error("Failed to initialize agent");
  }

}
