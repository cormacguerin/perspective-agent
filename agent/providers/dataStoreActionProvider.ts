// agentkit/providers/dataStoreActionProvider.ts
import { ActionProvider, CreateAction } from "@coinbase/agentkit";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { auth } from '../Auth.js';
//import { AuthProvider } from './AuthProvider.js';

// ---------------------------------------------------------------------------
// Types & Schemas
// ---------------------------------------------------------------------------

export interface DataItem {
  id: string;                    // e.g. data-1733401234567-abc123
  name: string;                  // original filename
  path: string;                  // disk or cloud path
  owner: string;                 // 0x address (on-chain identity)
  agentId: string | null;        // which agent this belongs to (can be shared)
  metadata: {
    uploadTimestamp: string;     // ISO string
    //mimetype: string;
    size?: number;
    type: "corpus" | "avatarVideo" | "pending" | "other";
    tags?: string[];
    inferredFrom?: string | null;
    description?: string | null;
    fileHash?: string;           // sha256 of file content (for deduplication)
    media_id?: string; // postgres row reference
  };
}

type DataStore = DataItem[];

// Path to persistent JSON file
const DATASTORE_PATH = path.resolve(process.cwd(), "datastore.json");

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

async function computeFileHash(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// ---------------------------------------------------------------------------
// DataStoreActionProvider
// ---------------------------------------------------------------------------

export class DataStoreActionProvider extends ActionProvider {

  supportsNetwork = () => true;

  constructor(private readonly authProvider: any, private readonly userAddress: string) {
    super("dataStore", []);
    //this.userAddress = reqAddr;
    //this.authProvider = authProvider;
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
    description: "List all uploaded files. Supports filtering by type, agentId, etc.",
    schema: z.object({
      type: z.enum(["corpus", "avatarVideo", "pending", "other"]).optional(),
      agentId: z.string().optional(),
      owner: z.string().optional(),
      raw: z.boolean().default(false).optional().describe("Return full raw objects")
    })
  })
  async listDataStore(args: {
    type?: DataItem["metadata"]["type"];
    agentId?: string;
    owner?: string;
    raw?: boolean;
  }): Promise<string> {
    this.isOwner();

    let filtered = dataStore;

    if (args.type) filtered = filtered.filter(i => i.metadata.type === args.type);
    if (args.agentId) filtered = filtered.filter(i => i.agentId === args.agentId);
    if (args.owner) filtered = filtered.filter(i => i.owner === args.owner);

    const result = {
      action: "listDataStore",
      count: filtered.length,
      data: args.raw ? filtered : filtered.map(i => ({
        id: i.id,
        name: i.name,
        type: i.metadata.type,
        agentId: i.agentId,
        tags: i.metadata.tags,
        uploadTimestamp: i.metadata.uploadTimestamp,
        description: i.metadata.description
      }))
    };

    return JSON.stringify(result);
  }

  // -------------------------------------------------------------------------
  // 2. Add new file (core upload action)
  // -------------------------------------------------------------------------
  @CreateAction({
    name: "addDataItem",
    description: `
      Add a new file to the datastore.
      If a file with identical hash + name exists → replaces it (auto-dedupe).
      You can force type/description via user intent in the same query.
    `,
    schema: z.object({
      name: z.string().describe("Original filename"),
      path: z.string().describe("Full path on disk or cloud URL"),
      owner: z.string().describe("0x address of uploader"),
      agentId: z.string().nullable().optional().describe("Assign to specific agent"),
      type: z.enum(["corpus", "avatarVideo", "pending", "other"]).optional().default("pending"),
      tags: z.array(z.string()).optional(),
      description: z.string().optional(),
      fileHash: z.string().optional().describe("Optional pre-computed sha256")
    })
  })
  async addDataItem(args: {
    name: string;
    path: string;
    owner: string;
    agentId?: string | null;
    type?: DataItem["metadata"]["type"];
    tags?: string[];
    description?: string;
    fileHash?: string;
  }, ctx?: any): Promise<string> {
    this.isOwner();

    const hash = args.fileHash || await computeFileHash(args.path).catch(() => undefined);

    // --- Smart Replace Logic ---
    // Replace if: same hash AND same filename (strong match)
    // OR same hash + same type + similar description (fuzzy user intent – optional later)
    const existingIndex = dataStore.findIndex(item =>
      item.metadata.fileHash === hash &&
      item.name === args.name
    );

    const newDataItemId = `data-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    //const cleanPath = args.path.split("?")[0]; // remove query string if present
    //const mimeType = mime.lookup(cleanPath) || "application/octet-stream";

    const newItem: DataItem = {
      id: existingIndex !== -1
        ? dataStore[existingIndex].id  // keep same ID on replace
        : newDataItemId,
      name: args.name,
      path: args.path,
      owner: args.owner,
      agentId: args.agentId ?? null,
      metadata: {
        uploadTimestamp: new Date().toISOString(),
        //mimetype: mimeType,
        size: (await fs.stat(args.path).catch(() => ({ size: undefined }))).size,
        type: args.type ?? "pending",
        tags: args.tags ?? [],
        description: args.description ?? null,
        fileHash: hash,
        inferredFrom: null
      }
    };

    if (existingIndex !== -1) {
      // Replace in place
      dataStore[existingIndex] = {
        ...dataStore[existingIndex],
        ...newItem,
        metadata: {
          ...dataStore[existingIndex].metadata,
          ...newItem.metadata,
          uploadTimestamp: newItem.metadata.uploadTimestamp // update timestamp on replace
        }
      };
      await saveDataStore(dataStore);
      return `Replaced existing item ${newItem.id} (same file + name)`;
    } else {
      dataStore.push(newItem);
      await saveDataStore(dataStore);
      return `Added new data item ${newItem.id}`;
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
      throw new Error(`Data item ${args.id} not found`);
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
        // throw new Error(`Removed from datastore but failed to delete file: ${err.message}`);
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
    type?: DataItem["metadata"]["type"];
    agentId?: string | null;
    tags?: string[];
    description?: string | null;
    inferredFrom?: string;
  }): Promise<string> {
    this.isOwner();

    const item = dataStore.find(i => i.id === args.id);
    if (!item) throw new Error(`Data item ${args.id} not found`);

    if (args.type !== undefined) item.metadata.type = args.type;
    if (args.agentId !== undefined) item.agentId = args.agentId;
    if (args.tags !== undefined) item.metadata.tags = args.tags;
    if (args.description !== undefined) item.metadata.description = args.description;
    if (args.inferredFrom) item.metadata.inferredFrom = args.inferredFrom;

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
    if (!item) throw new Error(`Data item ${args.id} not found`);

    return JSON.stringify({
      action: "getDataItem",
      data: item
    });
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const dataStoreActionProvider = (ap: any, reqAddr: string) => {
  return new DataStoreActionProvider(ap, reqAddr);
};
