// pages/api/link-wallet.ts (or your route handler)
import { CdpSmartWalletProvider } from "@coinbase/agentkit";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import fs from "fs";
import path from "path";
import type { Request, Response } from "express";


const publicClient = createPublicClient({ chain: base, transport: http() });

const walletDb = new Map<string, { agentWallet: string; owner: string }>();

export default async function connect(
    req: Request,
    res: Response
  ) {

  if (req.method !== "POST") return res.status(405).end();

  const { address, signature, message } = req.body;

  const isValid = await publicClient.verifyMessage({
    address,
    message,
    signature,
  });

  if (!isValid) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  if (walletDb.has(address)) {
    const data = walletDb.get(address)!;
    return res.json({ success: true, agentWallet: data.agentWallet });
  }

  // Create new CDP Smart Wallet with user's EOA as owner
  const provider = await CdpSmartWalletProvider.configureWithWallet({
    apiKeyId: process.env.CDP_API_KEY_ID!,
    apiKeySecret: process.env.CDP_API_KEY_SECRET!,
    networkId: "base", // or base-mainnet
    owner: address,  // This is the key line — user's real wallet becomes owner
    paymasterUrl: "https://paymaster.base.org",
  });

  const agentWallet = provider.getAddress();

  walletDb.set(address, { agentWallet, owner: address });

  console.log(`Created agent wallet ${agentWallet} for user ${address}`);

  return res.json({ success: true, agentWallet });
  
}

export function getOwnerWalletAddress(userEOA: string): string | null {

  const file = path.join(process.cwd(), "wallets", `${userEOA.toLowerCase()}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return data.smartWalletAddress || null;
  } catch {
    return null;
  }

}
