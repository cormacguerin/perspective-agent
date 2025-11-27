// app/providers/swapActionProvider.ts

import { ActionProvider, CreateAction, Network, WalletProvider, CdpSmartWalletProvider } from "@coinbase/agentkit";
import { CdpClient } from "@coinbase/cdp-sdk";
import { z } from "zod";
import { checksumAddress, parseUnits, encodeFunctionData, erc20Abi } from "viem";

/**
 * SwapActionProvider
 * - Uses Coinbase CDP Trade API (via @coinbase/cdp-sdk) and Smart Accounts for execution.
 * - Accepts an optional WalletProvider when invoked (AgentKit pattern). If provided, it is
 *   used to pick the network preference and for logging context. The actual swap executes
 *   via a CDP-managed Smart Account (server-side) to leverage UserOp/paymaster flows.
 *
 * Notes:
 * - This provider intentionally follows the "walletProvider -> actionProvider" calling
 *   pattern used by official providers (ZeroXActionProvider). When AgentKit calls the
 *   action it will pass the walletProvider; our code tolerates being called programmatically
 *   without one.
 * - The implementation creates/fetches a CDP-managed owner account and a Smart Account,
 *   uses smartAccount.quoteSwap(...) to get a quote, executes it (returns a userOpHash),
 *   and waits for user operation completion.
 */

// Define the smart wallet account name so wallets persist accross sessions
const OWNER_NAME = "My Smart Base Wallet2";
const SMART_ACCOUNT_NAME = "MyBasedAccount2";

// Supported networks (extend if necessary)
const SUPPORTED_NETWORKS = ["base", "ethereum", "optimism", "arbitrum"] as const;
type SupportedNetwork = (typeof SUPPORTED_NETWORKS)[number];

export interface SwapArgs {
    fromToken: string; // contract address (0x...)
    toToken: string; // contract address (0x...)
    fromAmount: string; // integer string in smallest units (wei)
    network?: string; // flexible input; validated below
    slippageBps?: number; // basis points
    ownerName?: string; // optional name for CDP-managed owner account
    smartAccountName?: string; // optional name for Smart Account
}

export interface FundArgs {
    fundToken: string; // contract address (0x...)
    amount: string; // integer string in smallest units (wei)
    network?: string; // flexible input; validated below
    ownerName?: string; // optional name for CDP-managed owner account
    smartAccountName?: string; // optional name for Smart Account
}

export interface WalletArgs {
    network?: string; // flexible input; validated below
    ownerName?: string; // optional name for CDP-managed owner account
    smartAccountName?: string; // optional name for Smart Account
}

export const SwapSchema = z.object({
    fromToken: z.string().describe("Contract address to sell (0x...)").min(1),
    toToken: z.string().describe("Contract address to buy (0x...)").min(1),
    fromAmount: z.string().describe("Amount of fromToken in smallest units (wei)").min(1),
    network: z.string().optional(),
    slippageBps: z.number().optional(),
    ownerName: z.string().optional(),
    smartAccountName: z.string().optional(),
});

export const SmartWalletSchema = z.object({
    address: z.string().describe("The Smart Contract Address eg. (0x...)").min(1),
    ownerName: z.string().optional(),
    smartAccountName: z.string().optional(),
});

export const FundSmartWalletSchema = z.object({
    token: z.string().describe("Token contract address (0x...) or 'ETH' for native."),
    amount: z.string().describe("Amount to send in human units, e.g. '0.02' (uses decimals param)"),
    decimals: z.number().optional().describe("Decimals for token (default 18)"),
    ownerName: z.string().optional(),
    smartAccountName: z.string().optional(),
});

// type FundArgs = z.infer<typeof FundSmartWalletSchema>;

function checkAddr(addr: string): string {
    if (!addr || typeof addr !== "string") throw new Error(`Invalid address: ${String(addr)}`);
    const normalized = addr.startsWith("0x") ? addr : `0x${addr}`;
    return checksumAddress(normalized as `0x${string}`);
}

function normalizeNetwork(n?: string): SupportedNetwork {
    if (n && (SUPPORTED_NETWORKS as readonly string[]).includes(n)) return n as SupportedNetwork;
    return "base";
}

// Initialize CDP client singleton (reads credentials from env)
let _cdpClient: CdpClient | null = null;
function getCdpClient(): CdpClient {
    if (_cdpClient) return _cdpClient;
    _cdpClient = new CdpClient({
        apiKeyId: process.env.CDP_API_KEY_ID || "",
        apiKeySecret: process.env.CDP_API_KEY_SECRET || "",
        walletSecret: process.env.CDP_WALLET_SECRET || undefined,
    });
    console.log([process.env.CDP_API_KEY_ID,process.env.CDP_API_KEY_SECRET,process.env.CDP_WALLET_SECRET]);
    return _cdpClient;
}

export class SwapActionProvider extends ActionProvider {
    supportsNetwork: (network: Network) => boolean;

    constructor() {
        super("dexSwap", []);
        this.supportsNetwork = () => true;
    }

    /**
     * Get smart wallet address / info
     */
    async getCDPWallet(walletProvider: WalletProvider | null, args: WalletArgs) {

        console.log("SwapActionProvider getSmartWallet");
        const parsed = SmartWalletSchema.parse(args);
        console.log(parsed)
        //const ownerName = checkAddr(parsed.toToken);
        //const smartAccountName = checkAddr(parsed.smartAccountName);
        //const smartAccountName = parsed.smartAccountName ?? "AgentSwapSmartAccount";
        //console.log("smartAccountName",smartAccountName)

        const cdp = getCdpClient();

        // Create/fetch a CDP-managed owner account (server-side key)
        try {

            const ownerName = parsed.ownerName ?? "AgentOwner";
            console.log("ownerName", ownerName)
            const owner = await cdp.evm.getOrCreateAccount({ name: ownerName });
            console.log("owner", owner)
            const smartAccount = await cdp.evm.getOrCreateSmartAccount({ name: SMART_ACCOUNT_NAME, owner });
            console.log("smartAccount", smartAccount)

            return JSON.stringify({
              success: true,
              smartAccount,
            });

        } catch(e) {

            console.error(e);

        }

    }

    // ActionKit-compatible action (AgentKit will pass walletProvider as the first arg)
    @CreateAction({
        name: "getSmartWallet",
        description: `
          Get the active smart wallet address.

          Use this action whenever a user asks to get the smart wallet address (different from agentkit wallet)
          - Get my active wallet address.
          - Show me my trading wallet address.
          - What is my smart wallet address.

          Returns a Smart wallet address which contains both address and owner(s)
          eg.

          smartAccount {
            address: '0xFc54174978E1aA27dc1708EbED904Cb1d1F2D95b',
            owners: [
              {
                address: '0x4Ed27586a6FF8545D4b5b9e542B368ECBAE400a6',
              }
            ]
          }

        `,

        schema: SmartWalletSchema,
    })
    async getSmartWallet(walletProvider: WalletProvider, args: any) {
        console.log("swapActionProvider - getSmartWallet");
        return this.getCDPWallet(walletProvider, args as WalletArgs);
    }

    /**
     * Programmatic swap. If a walletProvider is given (AgentKit runtime), it will be used
     * for network selection/logging, but swap execution is performed using a CDP-managed
     * Smart Account so we leverage the CDP UserOp/paymaster flow.
     */
    async swap(walletProvider: WalletProvider | null, args: SwapArgs) {

        console.log("SwapActionProvider inside actual swap");

        // Validate and normalize args
        const parsed = SwapSchema.parse(args);

        const fromToken = checkAddr(parsed.fromToken);
        const toToken = checkAddr(parsed.toToken);
        const fromAmount = BigInt(parsed.fromAmount);
        const slippageBps = parsed.slippageBps ?? 100; // default 1%
        const network = normalizeNetwork(parsed.network);

        const cdp = getCdpClient();
        const ownerName = parsed.ownerName ?? "AgentOwner";
        const owner = await cdp.evm.getOrCreateAccount({ name: ownerName });
        const smartAccount = await cdp.evm.getOrCreateSmartAccount({ name: SMART_ACCOUNT_NAME, owner });

        // Request a quote for the swap via the Smart Account
        const quote = await smartAccount.quoteSwap({
          network,
          fromToken:fromToken as `0x${string}`,
          toToken:toToken as `0x${string}`,
          fromAmount,
          slippageBps,
        });
        console.log("quote",quote);

        if (!quote.liquidityAvailable) {
            return { success: false, error: "Insufficient liquidity for this pair" };
        }

        // Execute the quote: returns userOpHash
        const { userOpHash } = await quote.execute();

        if (!userOpHash) {
            console.log("no userOpHash, return")
            return { success: false, error: "Quote execution returned null" };
        }

        // Optionally log the walletProvider address context
        if (walletProvider) {

            try {
              console.log(`swap invoked via smart wallet: ${smartAccount.address} on ${network ?? "unknown"}`);
            } catch (e) {
              console.warn("walletProvider present but failed to read context:", e);
            }

        }

        // Wait for completion
        const receipt = await smartAccount.waitForUserOperation({ userOpHash });
        console.log("swapActionProvider - transaction receipt", receipt)

        if (receipt.status === "complete") {
            return {
                success: true,
                userOpHash,
                transactionHash: receipt.transactionHash,
                //toAmount: receipt?.receipt?.toAmount ?? null,
            };
        }

        return { success: false, userOpHash, status: receipt.status };

    }

    // ActionKit-compatible action (AgentKit will pass walletProvider as the first arg)
    @CreateAction({
      name: "swapTokens",
      description: `
        Perform a token swap or purchase onchain using the Coinbase CDP Trade API and Smart Accounts.

        Use this action whenever a user wants to:
        - Swap one token for another (e.g. "swap ETH for USDC", "trade my PEPE to DEGEN")
        - Buy or sell a token using another (e.g. "buy $10 of BRETT", "sell half my USDC for WETH")
        - Exchange tokens on the Base network or compatible EVM chains.

        If the user does not specify an amount or token symbols, ask clarifying questions like:
        "How much would you like to swap?" or "Which token do you want to buy or sell?"

        Accepts standard token symbols (e.g. ETH, USDC, PEPE) or contract addresses (0x...).
        Supports specifying network and slippage tolerance.

        To execute a swap always ensure you have:
        - The token to sell ("fromToken")
        - The token to buy ("toToken")
        - The amount or value to swap ("fromAmount")
      `,

      schema: SwapSchema,
    })
    async swapTokens(walletProvider: WalletProvider, args: any) {
      console.log("swapActionProvider - swapTokens", args);
      // When AgentKit invokes an action it commonly passes the walletProvider as first parameter.
      return this.swap(walletProvider, args as SwapArgs);
    }

    // ActionKit-compatible action (AgentKit will pass walletProvider as the first arg)
    @CreateAction({
      name: "fundSmartWallet",
      description: `
        Send funds from the connected wallet to the agent's smart account.
        Accepts native ETH (token = "ETH") or an ERC-20 contract address.
        Example: "fund smart account with 0.05 ETH" or token contract and amount.

        This is required because the coinbase API uses a smart wallet to trade.
        However the agent uses a standard EOA account, the user will probably fund that so we need a mechanism to manage the trading account.
        It is also good practice to separate the trading account from the agents main account.

        Use this function to send funds from your main account to the smart account.
        To fund the wallet make sure you have
        - The token to send (eg 0x..)
        - The amount to send (eg 0.02)
      `,

      schema: FundSmartWalletSchema,
    })
    async fundSmartWallet(walletProvider: WalletProvider, args: FundArgs) {

        console.log("fundSmartWallet ", args)

        // parse args
        const parsed = FundSmartWalletSchema.parse(args);

        // normalize destination smart account (create or fetch)
        const cdp = getCdpClient();
        const ownerName = parsed.ownerName ?? "AgentOwner";
        console.log("ownerName",ownerName)
        const owner = await cdp.evm.getOrCreateAccount({ name: ownerName });
        console.log("owner", owner)
        const smartAccount = await cdp.evm.getOrCreateSmartAccount({ name: SMART_ACCOUNT_NAME, owner });
        console.log("smartAccount", smartAccount)

        const dest = smartAccount.address;
        console.log("dest",dest)
        if (!dest) {
          return { success: false, error: "Failed to resolve smart account address" };
        }

        // normalize token input
        const tokenInput = parsed.token.trim();
        console.log("tokenInput",tokenInput);
        const isNative = tokenInput.toLowerCase() === "eth" || tokenInput.toLowerCase() === "native" || tokenInput.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

        console.log("tokenInput",tokenInput)

        // compute amount in smallest units
        const decimals = parsed.decimals ?? 18;
        // parseUnits expects string and decimals, returns bigint-like; viem.parseUnits returns a bigint or string depending on version
        const amountBn = BigInt(parseUnits(parsed.amount, decimals).toString());
        console.log("amountBn",amountBn)

        try {

            if (isNative) {

              console.log("native")

                // Send native ETH from walletProvider -> smartAccount
                const txHash = await (walletProvider as any).sendTransaction({
                  to: dest,
                  value: amountBn,
                });
                console.log("txHash", txHash);
                const receipt = await (walletProvider as any).waitForTransactionReceipt(txHash);
                console.log("receipt",receipt);
                return {
                  success: true,
                  method: "nativeTransfer",
                  txHash,
                  receipt,
                  to: dest,
                  amount: parsed.amount,
                  decimals,
                };

            } else {

              console.log("erc20")

                // ERC-20 token transfer: wallet sends `transfer(dest, amount)`
                const tokenAddr = checkAddr(tokenInput); // must be `0x...`
                const data = encodeFunctionData({
                  abi: erc20Abi,
                  functionName: "transfer",
                  args: [dest, amountBn],
                });
                console.log("data",data)

                // Build tx params and send via walletProvider
                const txHash = await (walletProvider as any).sendTransaction({
                  to: tokenAddr,
                  data,
                  // ERC20 transfer normally doesn't require value field
                });
                console.log("txHash",txHash)

                const receipt = await (walletProvider as any).waitForTransactionReceipt(txHash);
                return {
                  success: true,
                  method: "erc20Transfer",
                  txHash,
                  receipt,
                  token: tokenAddr,
                  to: dest,
                  amount: parsed.amount,
                  decimals,
                };

            }

        } catch (error: any) {

            return {
              success: false,
              error: String(error?.message ?? error),
            };

        }

    }

}

export const swapActionProvider = () => new SwapActionProvider();

