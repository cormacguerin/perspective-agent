// agent/Auth.ts
import jwt from "jsonwebtoken";
import { base } from "viem/chains";
import { verifyMessage, createPublicClient, http } from "viem";
import { CdpSmartWalletProvider } from "@coinbase/agentkit";
import fs from "fs/promises";
import path from "path";
import { getAddress } from "ethers";
import type { Request, Response } from "express";
import dotenv from "dotenv";

dotenv.config();

const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');
const JWT_SECRET = process.env.AGENT_JWT_SECRET || "change-me-now";
const JWT_EXPIRES_IN = "21d";

console.log("process.env.AGENT_JWT_SECRET", process.env.AGENT_JWT_SECRET);

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

let writePromise: Promise<void> | null = null;

interface User {
  address: string;
  loggedInAt: number;
}

interface JwtPayload {
  sub: string;
  iat?: number;
  exp?: number;
}

class Auth {

  private users = new Map<string, User>();
  private owner: string = '';

  constructor() {
    this.init();
  }

  private async init() {
    await this.loadUsers();
    await this.loadOwner();
    await this.getOwnerWalletAddress();
    console.log('Auth ready, loaded', this.users.size, 'users');
  }

  /*
   * validates signature and registers in users.
   */
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

    if (!isValid) return null;

    const token = jwt.sign({ sub: normalized }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    this.users.set(normalized, {
      address: normalized,
      loggedInAt: Date.now()
    });
    console.log("this.users",this.users)
    await this.saveUsers(this.users);

    return token;

  }

  /*
   * Non express authentication, determines if user is registered or not.
   */
  authenticateToken(token: string): string | null {
    console.log("Auth.ts authenticateToken")
    try {
      console.log("in - JWT_SECRET ", JWT_SECRET)
      console.log("in - token ", token)
      const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
      console.log("payload",payload)
      const addr = payload.sub.toLowerCase();
      console.log("authenticateToken",addr);
      return this.users.has(addr) ? addr : null;
    } catch(e) {
      console.log(e)
      return null;
    }
  }

  /*
   * Expreess auth middleware, placeholder, does nothing at the moment.
   */
  authorize = (req:any, res:any, next:any) => {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: "Missing token" });

    const token = header.split(" ")[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      const addr = decoded.sub.toLowerCase();
      req.user = addr;
      let t_addr = this.users.get(addr)?.address;
      if (getAddress(t_addr as string) === getAddress(addr)) {
          next();
      } else {
          return res.status(401).json({ error: "Invalid token" });
      }
    } catch (e) {
      //next();
      return res.status(401).json({ error: "Invalid token" });
    }
  }

  /*
   * Expreess auth middleware, placeholder, does nothing at the moment.
   */
  isOwnerRequest = (req:any, res:any, next:any) => {

    const authHeader = req.headers.authorization;           // "Bearer eyJhbGciOi..."

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token' });
    }

    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: "Missing token" });
    console.log("isOwnerRequest header",header)

    const token = header.split(" ")[1];
    console.log("isOwnerRequest token",token)

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      let addr = decoded?.sub;
      if (!addr) {
          return false;
      }
      console.log(this.owner)
      console.log("isOwner this.owner", this.owner);
      console.log("isOwner decoded.sub", getAddress(addr as string));
      if (getAddress(addr as string) === this.owner) {
          console.log("THIS IS THE OWNER")
          next();
      } else {
          console.log("THIS IS NOT THE OWNER")
          res.send(401) 
      }

    } catch(e) {

      console.log("not an authenticated user", e)
      res.send(401) 

    }

  }

  /*
   * Non express isOwner token
   */
  isOwnerToken(token: string): boolean {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      let addr = decoded?.sub;
      console.log("isOwner addr", addr)
      if (!addr) {
          return false;
      }
      if (getAddress(addr as string) === this.owner) {
          console.log("THIS IS THE OWNER")
          return true;
      } else {
          console.log("THIS IS NOT THE OWNER")
          return false;
      }
    } catch (e) {
      console.log(e);
      return false;
    }
  }

  /*
   * Non express isOwner addres
   */
  isOwnerAddress(addr: string): boolean {
    try {
      if (!addr) {
          return false;
      }
      if (getAddress(addr as string) === this.owner) {
          console.log("THIS IS THE OWNER")
          return true;
      } else {
          console.log("THIS IS NOT THE OWNER")
          return false;
      }
    } catch (e) {
      console.log(e);
      return false;
    }
  }

  // TODO; this should be onchain
  async claimAgent(address: string) {

    var claimed = false;
    try {
      await fs.access("owner.txt");  
    } catch {
      await fs.writeFile("owner.txt", address);
      this.owner = getAddress(address);
      claimed = true;
    }
    return claimed;

  }

  async getOwnerWalletAddress(): Promise<string | null> {

    try {
      const owner_ = await fs.readFile("owner.txt", "utf8");
      this.owner = getAddress(owner_);
      return owner_;
    } catch {
      return null;
    }

  }

  async saveUsers(map: Map<string, any>) {

    console.log("in")
    const last = writePromise;
    console.log("last a",last)
    const save = (async () => {
      console.log("last b", last)
      if (last) await last; // wait for last execution
      
      console.log("last c", last)

      console.log("write")
      const tmp = USERS_FILE + '.tmp.' + Date.now();
      const data = JSON.stringify(Object.fromEntries(map));

      await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
      await fs.writeFile(tmp, data);
      await fs.rename(tmp, USERS_FILE);
    })();

    writePromise = save.catch((e) => { writePromise = null; throw e; });
    await save;

  }

  async loadOwner() {
    try {
      const addr = await fs.readFile("owner.txt", "utf8");
      this.owner = getAddress(addr.trim());
      console.log("this.owner",this.owner)
      return this.owner;
    } catch {
      this.owner = "";
      return null;
    }
  }


  async loadUsers() {
    try {
      const raw = await fs.readFile(USERS_FILE, 'utf-8');
      const data = JSON.parse(raw);
      this.users = new Map(Object.entries(data ?? {}));
    } catch {
      this.users = new Map();   // file missing or corrupt = start fresh
    }
  }

  logout(address: string) {
    this.users.delete(address.toLowerCase());
  }

  getUserCount() {
    return this.users.size;
  }

}

export const auth = new Auth();

