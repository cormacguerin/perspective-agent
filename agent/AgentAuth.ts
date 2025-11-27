// agent/AgentAuth.ts
import jwt from "jsonwebtoken";
import { base } from "viem/chains";
import { verifyMessage, createPublicClient, http } from "viem";
import { CdpSmartWalletProvider } from "@coinbase/agentkit";
import fs from "fs/promises";
import path from "path";
import type { Request, Response } from "express";


const JWT_SECRET = process.env.AGENT_JWT_SECRET || "change-me-now";
const JWT_EXPIRES_IN = "21d";

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

interface User {
  address: string;
  loggedInAt: number;
}

class AgentAuth {

  private users = new Map<string, User>();
  private owner: string = '';

  constructor() {
      this.getOwnerWalletAddress();
  }

  async loginWithSignature(
    address: string,
    message: string,
    signature: string
  ): Promise<string | null> {
    const normalized = address.toLowerCase();

    const isValid = await publicClient.verifyMessage({
      address: normalized as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    console.log("isValid", isValid);

    if (!isValid) return null;

    const token = jwt.sign({ sub: normalized }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    this.users.set(token, { address: normalized, loggedInAt: Date.now() });
    console.log("this.users",this.users)

    return token;

  }

  authenticateToken(token: string): string | null {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
      const addr = payload.sub.toLowerCase();
      return this.users.has(addr) ? addr : null;
    } catch {
      return null;
    }
  }

  authorize(req:any, res:any, next:any) {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: "Missing token" });

    const token = header.split(" ")[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      console.log("decoded",decoded)
      req.user = decoded;
      console.log("users[token]",this.users.get(token))
      if (this.users.get(token)?.address === this.owner) {
          console.log("THIS IS THE OWNER")
      } else {
          console.log("THIS IS NOT THE OWNER")
      }
      //req.isOwner = true;
      next();
    } catch (e) {
      //next();
      return res.status(401).json({ error: "Invalid token" });
    }
  }

  // TODO; this should be onchain
  async claimAgent(address: string) {

    var claimed = false;
    try {
      await fs.access("owner.txt");  
    } catch {
      await fs.writeFile("owner.txt", address);
      this.owner = address;
      claimed = true;
    }
    return claimed;

  }

  async getOwnerWalletAddress(): Promise<string | null> {

    try {
      const owner_ = await fs.readFile("owner.txt", "utf8");
      this.owner = owner_;
      return owner_;
    } catch {
      return null;
    }

  }

  logout(address: string) {
    this.users.delete(address.toLowerCase());
  }

  getUserCount() {
    return this.users.size;
  }

}

export const auth = new AgentAuth();

/*

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
*/
