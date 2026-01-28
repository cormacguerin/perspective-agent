// agentkit/providers/dataStoreActionProvider.ts
import { ActionProvider, CreateAction } from "@coinbase/agentkit";
import { z } from "zod";
import fs from "fs/promises";
import { stat } from 'fs/promises';
import { Readable } from 'node:stream';
import { createReadStream } from 'node:fs';
import path from "path";
import crypto from "crypto";
import { fileTypeFromBuffer } from "file-type";
import dotenv from "dotenv";
import { checksumAddress, parseUnits, encodeFunctionData, erc20Abi } from "viem";

dotenv.config();
//import { AuthProvider } from './AuthProvider.js';

// ---------------------------------------------------------------------------
// Types & Schemas
// ---------------------------------------------------------------------------


export const DataItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  owner: z.string(),
  inferredFrom: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  text: z.string().optional(),
  agentId: z.string().nullable(),
  storeId: z.string().optional(),
  status: z.enum(["noted", "ingested", "deleted", "purged", "stale"]),
  metadata: z.object({
    uploadTimestamp: z.string(),
    mimetype: z.string(),
    size: z.number().optional(),
    type: z.enum(["corpus", "avatarVideo", "other"]),
    tags: z.array(z.string()).optional(),
    fileHash: z.string().optional(),
    ext: z.string().optional()
  })
});

export type DataItemType = z.infer<typeof DataItemSchema>;
export type DataStore = DataItemType[];

// Path to persistent JSON file
const DATASTORE_PATH = path.resolve(process.cwd(), "data/datastore.json");

// Atomic save lock (same pattern as config provider)
let saveAtom: Promise<void> | null = null;

// ---------------------------------------------------------------------------
// Load / Save Helpers
// ---------------------------------------------------------------------------

async function loadDataStore(): Promise<DataStore> {
  try {
    const raw = await fs.readFile(DATASTORE_PATH, "utf-8");
    return JSON.parse(raw) as DataStore;
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return []; // fresh start
    }
    throw err;
  }
}

async function saveDataStore(store: DataStore): Promise<void> {
  const previous = saveAtom;
  const save = (async () => {
    if (previous) await previous;
    const tmp = DATASTORE_PATH + ".tmp." + Date.now();
    await fs.mkdir(path.dirname(DATASTORE_PATH), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(store, null, 2));
    await fs.rename(tmp, DATASTORE_PATH);
    console.log("datastore saved –", store.length, "items");
  })();
  saveAtom = save.finally(() => { saveAtom = null; });
  await save;
}

// In-memory cache (refreshed on startup)
let dataStore: DataStore = await loadDataStore();

// ---------------------------------------------------------------------------
// Utility: Compute SHA256 hash of file
// ---------------------------------------------------------------------------

async function getFileInfo(filePath: string): Promise<{
  hash: string;
  mimetype: string | null;
  ext: string | null;
}> {
  console.log("filePath",filePath)
  const buffer = await fs.readFile(filePath);

  const hash = crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");

  const fileType = await fileTypeFromBuffer(buffer);

  return {
    hash,
    mimetype: fileType?.mime ?? null,
    ext: fileType?.ext ?? null,
  };

}

// ---------------------------------------------------------------------------
// DataStoreActionProvider
// ---------------------------------------------------------------------------

export class DataStoreActionProvider extends ActionProvider {

  supportsNetwork = () => true;

  constructor(private readonly authProvider: any, private readonly userAddress: string, private readonly db: any) {
    super("dataStore", []);
  }

  private isOwner(): boolean {
    console.log("this.userAddress",this.userAddress)
    const isOwner_ = this.authProvider.isOwnerAddress(this.userAddress);
    if (!isOwner_) {
      console.log("not owner")
      return false;
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // 1. List all items (with optional filters)
  // -------------------------------------------------------------------------
  @CreateAction({
    name: "listDataStore",
    description: `List all uploaded files. Supports filtering by type, owner, agentId, and status.
      Call this tool with:
      - {} to list everything
      - or provide optional filters (type, owner, agentId)`,
    schema: z.object({
      type: z.array(z.enum(["corpus", "avatarVideo", "other"])).optional().describe("Only set if user wants multiple specific types"),
      owner: z.string().describe("the 0x ethereum address owner").optional(),
      agentId: z.string().optional(),
      // status: z.enum(["noted", "ingested", "deleted", "purged", "stale"]).optional(),
      raw: z.boolean().optional(),
    //}).default({}),
    }),
  })
  async listDataStore(args: {
    type?: DataItemType["metadata"]["type"];
    owner?: string;
    agentId?: string;
    //status?: DataItem["status"];
    raw?: boolean;
  }): Promise<string> {

    console.log("listDataStore args",args)

    this.isOwner();

    // console.log("dataStore",dataStore)

    let filtered = dataStore;
    const raw = args.raw ?? false; // set default here not in schema

    if (args.type != null && args.type.length > 0) {
        const types = args.type;
          filtered = filtered.filter(i => types.includes(i.metadata.type));
    }
    //if (args.type) filtered = filtered.filter(i => i.metadata.type === args.type);
    //if (args.agentId) filtered = filtered.filter(i => i.agentId === args.agentId);
    //if (args.owner) filtered = filtered.filter(i => i.owner === args.owner);

    const result = {
      action: "listDataStore",
      count: filtered.length,
      data: raw ? filtered : filtered.map(i => ({
        id: i.id,
        name: i.name,
        type: i.metadata.type,
        agentId: i.agentId,
        tags: i.metadata.tags,
        uploadTimestamp: i.metadata.uploadTimestamp,
        description: i.description
      }))
    };

    return JSON.stringify(result);
  }

  // -------------------------------------------------------------------------
  // 2. Add or update data item (core upload action)
  // -------------------------------------------------------------------------
  @CreateAction({
    name: "addDataItem",
    description: `
      Add or update a datafile to the datastore
      Only use this function if the user specifically requests to update a file to the datastore
      ALWAYS store relative path eg. data/owner/<data-store-id>
    `,
    schema: z.object({
      name: z.string().describe("Original filename"),
      // path: z.string().describe("Relative path on disk, eg /data/owner/<data-store-id>"),
      owner: z.string().describe("0x address of uploader"),
      agentId: z.string().nullable().optional(),
      type: z.enum(["corpus", "avatarVideo", "other"])
        .optional()
        .default("other"),
      tags: z.array(z.string()).optional(),
      description: z.string().optional()
    })
  })
  async addDataItem(
    args: {
      name: string;
      path: string;
      owner: string; //file owner not agent owner (0x)
      agentId?: string | null;
      type?: DataItemType["metadata"]["type"];
      tags?: string[];
      description?: string;
    }
  ): Promise<string> {

    this.isOwner();

    const uploadTimestamp = new Date().toISOString();
    const id = `data-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Compute hash from the file contents (server-side)
    let fileInfo: { hash: string; mimetype: string | null; ext: string | null } = {
      hash: "",
      mimetype: null,
      ext: null
    };

    console.log("path",path)
    
    try {
      fileInfo = await getFileInfo(`${args.path}`);
    } catch (e) {
      console.error("Failed to compute hash:", e);
    }

    // Check for existing
    let existingItem: DataItemType | undefined = undefined;
    if (fileInfo?.hash) {
      existingItem = dataStore.find(i => i.metadata?.fileHash === fileInfo?.hash);
    }

    // Remove old duplicate item
    if (existingItem) {
      const index = dataStore.findIndex(i => i.id === existingItem!.id);
      if (index !== -1) {
        console.log("Remove existing item", existingItem)
        dataStore.splice(index, 1);
      }
    }

    const owner = checkAddr(args.owner);

    // Create the DataItem
    const item: DataItemType = {
      id,
      name: args.name,
      path: args.path,
      //path: "data/" + args.owner,
      owner,
      inferredFrom: null,
      description: args.description ?? null,
      text: undefined,
      agentId: args.agentId ?? null,
      storeId: undefined,
      status: "noted",
      metadata: {
        uploadTimestamp,
        mimetype: fileInfo?.mimetype ?? "application/octet-stream", // optional to fill based on file extension
        size: undefined,
        type: args.type ?? "other",
        tags: args.tags,
        fileHash: fileInfo.hash,
        ext: fileInfo.ext ?? ""
      }
    };

    // 4. Insert blindly — no dedupe
    dataStore.push(item);
    await saveDataStore(dataStore);

    // 5. Index dataItem
    let textResponse = await this.indexDataItem(item);

    // add to database
    const docId = await this.db.admin.upsertCorpus({
        agent: process.env.VITE_AGENT_INSTANCE,
        type: "text",
        data: textResponse,
        owner,
    });

    console.log("upsert", {
        agent: process.env.VITE_AGENT_INSTANCE,
        type: "text",
        data: textResponse,
        owner,
    });

    console.log("textResponse", textResponse)

    return `Added new item: ${item.id} (${item.name})`;

  }

  async indexDataItem(dataItem: DataItemType): Promise<string> {

    if (!dataItem.path) {
      return "";
    }

    try {

      const stats = await stat(dataItem.path);

      const nodeStream = createReadStream(dataItem.path);

      const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

      if (!process.env.TIKA_URL) {
          throw new Error("TIKA_URL is not defined");
      }

      const res = await fetch(process.env.TIKA_URL, {
        method: "PUT",
        headers: {
          Accept: "text/plain",
          "Content-Length": stats.size.toString(),
        },
        body: webStream,
        duplex: "half",
      } as any);

      if (!res.ok) {
        console.log(`Tika failed: ${res.status}`);
        return "";
      }

      return await res.text();
    } catch (error) {
      console.error("Error in indexDataItem:", error);
      return "";
    }

  }

  @CreateAction({
    name: "crawlURL",
    description: `
      Add a url to the datastore.
      Only use this function if the user specifically requests to add a crawlable URL
      ALWAYS store relative path eg. data/owner/<data-store-id.json>
    `,
    schema: z.object({
      url: z.string().describe("Full path on disk or cloud URL")
    })
  })
  async crawlURL({ url }: { url: string }): Promise<string> {

    this.isOwner();

    try {
      // 1. Download the file
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("Response has no body");
      }

      const webStream = response.body;

      // 2. Send to Tika
      if (!process.env.TIKA_URL) {
        throw new Error("TIKA_URL is not defined");
      }

      const tikaResponse = await fetch(process.env.TIKA_URL, {
        method: "PUT",
        body: webStream,
        headers: {
          Accept: "text/plain",
          "Content-Type": response.headers.get("content-type") || "application/octet-stream",
          "X-Tika-OCR": "true", // optional but often useful
        },
        //duplex: "half", // required when sending streams in fetch (Node 18+)
      });

      if (!tikaResponse.ok) {
        throw new Error(`Tika failed: ${tikaResponse.statusText}`);
      }

      const extractedText = await tikaResponse.text();

      // Optional: store in DB
      const docId = await this.db.admin.upsertCorpus({
        agent: process.env.VITE_AGENT_INSTANCE,
        type: "text",
        data: extractedText,
        owner: this.userAddress,
      });

      console.log("Upserted document ID:", docId);
      console.log("Extracted Content (first 300 chars):", extractedText.slice(0, 300));

      return extractedText;

    } catch (error) {
      console.error("Error crawling URL:", error);
      throw error; // or return "" / return error message
    }
  }

  // -------------------------------------------------------------------------
  // 3. Remove item
  // -------------------------------------------------------------------------
  @CreateAction({
    name: "removeDataItem",
    description: "Remove a file from the datastore (does NOT delete the file from disk)",
    schema: z.object({
      id: z.string().describe("Data item ID to remove")
    })
  })
  async removeDataItem(args: { id: string }): Promise<string> {
    this.isOwner();

    const index = dataStore.findIndex(i => i.id === args.id);
    if (index === -1) {
      return(`Data item ${args.id} not found`);
    }

    const item = dataStore[index];
    const filePath = item.path;

    // Remove from in-memory store first (so it's gone even if delete fails)
    dataStore.splice(index, 1);

    // Try to delete the physical file – but don't let failure block JSON cleanup
    try {
      await fs.unlink(filePath);
      console.log(`Deleted file: ${filePath}`);
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        console.warn(`Failed to delete file ${filePath}:`, err.message);
        // Optionally re-throw if you want the action to fail on disk error
      } else {
        console.log(`File already gone: ${filePath}`);
      }
    }

    await saveDataStore(dataStore);
    return `Removed data item ${args.id}`;
  }

  // -------------------------------------------------------------------------
  // 4. Update metadata (crucial for inference!)
  // -------------------------------------------------------------------------
  @CreateAction({
    name: "updateDataItemMetadata",
    description: `
      Update type, tags, description, agentId etc. after user clarification.
      This is how the agent "infers" from memory.
    `,
    schema: z.object({
      id: z.string(),
      type: z.enum(["corpus", "avatarVideo", "pending", "other"]).optional(),
      agentId: z.string().nullable().optional(),
      tags: z.array(z.string()).optional(),
      description: z.string().nullable().optional(),
      inferredFrom: z.string().optional().describe("query ID that triggered inference")
    })
  })
  async updateDataItemMetadata(args: {
    id: string;
    type?: DataItemType["metadata"]["type"];
    agentId?: string | null;
    tags?: string[];
    description?: string | null;
    inferredFrom?: string;
  }): Promise<string> {
    this.isOwner();

    const item = dataStore.find(i => i.id === args.id);
    if (!item) return(`Data item ${args.id} not found`);

    if (args.type !== undefined) item.metadata.type = args.type;
    if (args.agentId !== undefined) item.agentId = args.agentId;
    if (args.tags !== undefined) item.metadata.tags = args.tags;
    if (args.description !== undefined) item.description = args.description;
    if (args.inferredFrom) item.inferredFrom = args.inferredFrom;

    await saveDataStore(dataStore);
    return `Updated metadata for ${args.id}`;
  }

  // -------------------------------------------------------------------------
  // 5. Get single item (useful for avatar playback or corpus loading)
  // -------------------------------------------------------------------------
  @CreateAction({
    name: "getDataItem",
    description: "Retrieve full details of a specific data item",
    schema: z.object({
      id: z.string()
    })
  })
  async getDataItem(args: { id: string }): Promise<string> {

    this.isOwner();
    const item = dataStore.find(i => i.id === args.id);
    //if (!item) throw new Error(`Data item ${args.id} not found`);
    if (!item) console.log(`Data item ${args.id} not found`);

    return JSON.stringify({
      action: "getDataItem",
      data: item
    });
  }

}

function checkAddr(addr: string): string {
    if (!addr || typeof addr !== "string") throw new Error(`Invalid address: ${String(addr)}`);
    const normalized = addr.startsWith("0x") ? addr : `0x${addr}`;
    return checksumAddress(normalized as `0x${string}`);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const dataStoreActionProvider = (ap: any, reqAddr: string, db: any) => {
  return new DataStoreActionProvider(ap, reqAddr, db);
};
