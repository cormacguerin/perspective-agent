// agentkit/providers/configActionProvider.ts
import { ActionProvider, CreateAction } from "@coinbase/agentkit";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
//import { auth } from './Auth.js';

dotenv.config();
// ---------------------------------------------------------------------------
// Interface & Schemas
// ---------------------------------------------------------------------------
const AvatarVideoSchema = z.object({
  path: z.string(),
  description: z.string(),
  idle: z.boolean().default(false),
  talking: z.boolean().default(false),
  bored: z.boolean().default(false)
});

const AgentConfigTemplate = {
  baseAgentDescription: "",
  topics: [] as string[],
  rules: [] as string[],
  functions: {} as Record<string, object>,
  avatarVideo: {} as Record<string, z.infer<typeof AvatarVideoSchema>>
};
export type AgentConfig = typeof AgentConfigTemplate;

const AgentConfigSchema = z.object({
  op: z.enum(["set", "remove"]),
  key: z.enum(Object.keys(AgentConfigTemplate) as [string, ...string[]]),
  match: z.record(z.any()).optional(),
  value: z.string()
});

interface AgentConfigArgs {
  op: "remove" | "set";
  key: keyof AgentConfig;
  value: string;
  match?: Record<string, any>;
}

// Path to the persistent config file
const CONFIG_PATH = path.resolve(process.cwd(), "agent_config.json");
const VITE_SERVER_URL = process.env.VITE_SERVER_URL;
const VITE_AGENT_INSTANCE = process.env.VITE_AGENT_INSTANCE;

export async function loadConfig(): Promise<AgentConfig> {

  try {

    const data = await fs.readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(data) as AgentConfig;

  } catch (err: any) {

    if (err.code === "ENOENT") {

      // Return a sensible default if file doesn't exist yet
      const defaultConfig: AgentConfig = {
        baseAgentDescription:
          "You are the perspective AI Agent, a helpful and insightful agent.",
        topics: ["AI", "on-chain", "builder"],
        rules: [
          "Always try to help the user achieve their goals.",
        ],
        functions: {
          catchEmail: {
              enabled: true,
              email: "contact@perspective.xyz"
          }
        },
        avatarVideo: {
        },
      }
      const arnieConfig: AgentConfig = {
        baseAgentDescription:
          "You are Arnold Schwarzenegger, a legendary action hero and bodybuilder with an over-the-top Austrian accent.",
        topics: ["action hero", "bodybuilding", "motivation", "80s cinema"],
        rules: [
          "Always be over-the-top and dramatic.",
          "Use famous Arnold quotes frequently and randomly.",
          "Mock weakness and praise strength.",
        ],
        functions: {
          catchEmail: {
              enabled: true,
              email: "contact@perspective.xyz"
          }
        },
        avatarVideo: {
          idleTalking: {
            path: "${VITE_SERVER_URL}/${VITE_AGENT_INSTANCE}/dataStore/<DATASTORE_ID>",
            description: "Arine talks",
            idle: false,
            talking: true,
            bored: false,
          },
          idleListening: {
            path: "${VITE_SERVER_URL}/${VITE_AGENT_INSTANCE}/dataStore/<DATASTORE_ID>",
            description: "Arnold calmly listening with slight head tilt",
            idle: true,
            talking: false,
            bored: false,
          },
        },
      };
      return defaultConfig;

    }

    throw err;
  }
}

const _config: AgentConfig = await loadConfig();

// ---------------------------------------------------------------------------
// ConfigActionProvider
// ---------------------------------------------------------------------------

export class ConfigActionProvider extends ActionProvider {

  private static configLock = false;
  private static config = _config;
  private static configAtom: Promise<void> | null = null;

  
  //private static config: AgentConfig;
  supportsNetwork = () => true;

  constructor(private readonly authProvider: any, private readonly userAddress: string) {
    super("config", []);
    //this.authProvider = authProvider;
    //this.userAddress = reqAddr;
  }

  private isOwner(): boolean {
    const isOwner_ = this.authProvider.isOwnerAddress(this.userAddress);
    if (!isOwner_) return false;
    return true;
  }

  // List Config
  // NEVER include comments, explanations, markdown or code fences,
  @CreateAction({
    name: "listConfig",
    description: `
      LISTS the agent's configuration.
      ACCEPTS params to format as raw or pretty, default is pretty.
       - Raw mode must ONLY be used when explicitly requested using raw:true.
      RETURNS a JSON string response as below
      {
        mode: "<raw or pretty>",
        style: "style",
        action: "listConfig",
        data: <the config in json format>
      }
    `,
    schema: z.object({
      raw: z.boolean().default(false).optional().describe("Set true to show full raw JSON config"),
    })
  })
  async listConfig(args: { raw?: boolean }): Promise<string> {

    this.isOwner();

    const cfg = ConfigActionProvider.config;
    if (args.raw) {
      return  JSON.stringify({
          mode: "raw",
          style: "system",
          data: cfg
      })
    } else {
      return  JSON.stringify({
          mode: "pretty",
          style: "system",
          data: cfg
      })
    }

  }

  // Add / Update a video trigger
  @CreateAction({
    name: "updateAgentConfig",
    description: `
      Adds or Updates the agent 

      including agent description topics, rules, avatar videos, or functions.

      - "op" determines how to modify the field (set, remove)
      - "key" selects which part of the config to edit
      - "match" optionally filters which items to remove
      - "value" is the value to set add or remove

      For description, topics, this is a plain text entry, for functions and avatars it MUST be JSON

      Use this action whenever the user wants to modify the agent's core,
      When updating avatars, infer the description, idle, talking, bored fields from the conversation or file name if descriptive.
      ALWAYS use this function if the user talks about avatars or avatar videos.

      Examples:
      - Change my description to be an expert in blockchain
      - Add a new topic around onchain data
      - Upload/Add this new avatar file for me.

      Functions: Are specific functiosn supported by the agent.
        They ALWAYS have an enable or disable flag
        eg.
      catchEmail {
          enabled: true,
          email: contact@perspectiveai.xyz
      }

      Avatar Videos:

      avatarVideo it is a keyed object that describes an avatar.

      1. You need the data-source-id of the video. It MUST be present or we fail.
      2. Construct the video URL EXACTLY as: "${VITE_SERVER_URL}/${VITE_AGENT_INSTANCE}/dataStore/<data-store-id>"
      3. ALWAYS USE THE EXACT SAME DATA STORE ID AS THE DATASTORE ID. 
      4. NEVER set idle, talking or bored unless its clear from the name or user context.

      ALWAYS FORMAT AVATAR VIDEOS IN THIS FORMAT

      "avatarVideo": {
        "paichan-star-wars-light-saber": {
          "url": "${VITE_SERVER_URL}/${VITE_AGENT_INSTANCE}/dataStore/<data-store-id>" eg. data-1765709884453-ipt6n,
          "description": "the avatar is using a light saber",
          "idle": true, // only true if context suggests
          "talking": false, // only true if context suggests
          "bored": false // only true if context suggests
        },
        ...
      }

    `,
    schema: AgentConfigSchema
  })
  async updateAgent(args: AgentConfigArgs): Promise<string> {

    this.isOwner();

    // threadsafe just incase
    if (ConfigActionProvider.configAtom) {
        await ConfigActionProvider.configAtom;
    }

    const { op, key, value } = args;
    const cfg = ConfigActionProvider.config;

    console.log("update agent args", args)

    if (!(key in cfg)) {
        return(`Key "${key}" not found in config`);
    }

    if (key === "topics" || key === "rules") {

      const target = cfg[key] as string[];
      switch (op) {
        case "set":
          if (!Array.isArray(value)) return("Set requires an array");
          cfg[key] = value;
          break;
        case "remove":
          if (value === undefined) return("Remove requires a value");
          cfg[key] = target.filter((v: any) => v !== value);
          break;
        default:
          return(`Operation "${op}" not supported on array key "${key}"`);
      }

    } else if (key === "avatarVideo" || key === "functions") {

      const target = cfg[key] as object;
      switch (op) {
        case "set":
          console.log("set")
          var item;
          try {
              item = JSON.parse(value);
          } catch (e) {
              return("Set requires a keyed JSON string");
          }
          console.log("item",item)
          for (const k of Object.keys(item)) {
            console.log("item[k]",item[k])
            if (!(item[k].url && item[k].description && key === "avatarVideo"))
              return("Avatar Object missing path and description properties");
          }
          console.log("set done")
          cfg[key] = { ...target, ...item };
          break;
        case "remove":
          let keysToRemove: string[];

          try {
            const parsed = JSON.parse(value);
            if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
              keysToRemove = Object.keys(parsed);
            } else {
              console.log("remove input not json");
              keysToRemove = [String(value).trim()];
            }
          } catch {
            keysToRemove = [value.trim()];
          }

          if (keysToRemove.length === 0) {
            return("No keys specified to remove");
          }

          for (const k of keysToRemove) {
            if (cfg[key][k]) {
              delete cfg[key][k];
            } else {
              console.warn(`Key not found, skipping: ${k}`);
            }
          }
          break;
        default:
          return(`Operation "${op}" not supported on object key "${key}"`);
      }

    } else {

      const target = cfg[key] as string;
      switch (op) {
        case "set":
          cfg[key] = value as string;
          break;
        case "remove":
          cfg[key] = "";
          break;
        default:
          return(`Operation "${op}" not supported on primitive key "${key}"`);
      }

    }

    await this.saveConfig(ConfigActionProvider.config);
    return `Successfully performed "${op}" on config key "${key}".`;

  }

  async saveConfig(newConfig: AgentConfig) {
    this.isOwner();

    const previous = ConfigActionProvider.configAtom;
    const save = (async () => { 
      if (previous) await previous;
        const tmp = CONFIG_PATH + '.tmp.' + Date.now();
        await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
        await fs.writeFile(tmp, JSON.stringify(newConfig, null, 2));
        await fs.rename(tmp, CONFIG_PATH);
        //await this.symlinkAvatarVideo(newConfig.avatarVideo);
    })();
    ConfigActionProvider.configAtom = save.finally(() => {
      ConfigActionProvider.configAtom = null;
    });
    await save;
  }

  /*
  async symlinkAvatarVideo(avatarVideoConfig: Record<string, z.infer<typeof AvatarVideoSchema>>) {

    await fs.mkdir(PUBLIC_AVATAR_DIR, { recursive: true });

    // Clear old symlinks
    for (const file of await fs.readdir(PUBLIC_AVATAR_DIR)) {
      const fullPath = path.join(PUBLIC_AVATAR_DIR, file);
      if ((await fs.lstat(fullPath)).isSymbolicLink()) {
        await fs.unlink(fullPath);
      }
    }

    // Create new symlinks only for local files
    for (const [key, video] of Object.entries(avatarVideoConfig)) {
      // Skip invalid or already public
      if (!video?.path || video.path.startsWith("/avatarVideo/")) {
        continue;
      }

      const source = video.path;
      const filename = path.basename(source);
      const linkPath = path.join(PUBLIC_AVATAR_DIR, filename);
      const target = path.relative(PUBLIC_AVATAR_DIR, source);

      await fs.symlink(target, linkPath).catch(() => {}); // ignore if exists

      // Make it public in config
      video.path = `/avatarVideo/${filename}`;
    }

  }
 */

}

// export factory
export const configActionProvider = (ap: any, reqAddr: string) => {
  return new ConfigActionProvider(ap, reqAddr);
};

