// agentkit/providers/configActionProvider.ts
import { ActionProvider, CreateAction } from "@coinbase/agentkit";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
//import { auth } from './Auth.js';

// ---------------------------------------------------------------------------
// Interface & Schemas
// ---------------------------------------------------------------------------
const AgentConfigTemplate = {
  baseAgentDescription: "",
  topics: [] as string[],
  rules: [] as string[],
  functions: {} as { [key: string]: any },
  avatarVideos: {} as Record<string, any>
};
export type AgentConfig = typeof AgentConfigTemplate;

const EditConfigSchema = z.object({
  op: z.enum(["append", "remove", "set"]).describe("The config edit operation."),
  key: z.enum(Object.keys(AgentConfigTemplate) as [string, ...string[]]).describe("The config key to edit"),
  value: z.any().optional().describe("The new value to append, remove or set."),
  match: z.record(z.any()).optional().describe("Optional matcher for selecting items")
});

interface EditConfigArgs {
  op: "append" | "remove" | "set";
  key: keyof AgentConfig;
  value?: any;
  match?: Record<string, any>;
}

// Path to the persistent config file
const CONFIG_PATH = path.resolve(process.cwd(), "llm_config.json");

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
          catchEmail: true,
        },
        avatarVideos: {
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
          catchEmail: true,
        },
        avatarVideos: {
          idleListening: {
            video: "/videos/idle.mp4",
            description: "Arnold calmly listening with slight head tilt",
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
    if (!isOwner_) throw new Error("Access denied: owner only");
    return true;
  }

  // List Config
  // NEVER include comments, explanations, markdown or code fences,
  @CreateAction({
    name: "listConfig",
    description: `
      ACCEPTS params to format as raw or pretty, default is pretty.
       - Raw mode must ONLY be used when explicitly requested using raw:true.
      LISTS the agent's configuration.
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
    name: "editConfig",
    description: "Edit the agent configuratiion config file.",
    schema: EditConfigSchema,
  })
  async updateAgent(args: EditConfigArgs): Promise<string> {

    this.isOwner();

    // threadsafe just incase
    if (ConfigActionProvider.configAtom) {
        await ConfigActionProvider.configAtom;
    }

    const { op, key, value } = args;
    const cfg = ConfigActionProvider.config;

    if (!(key in cfg)) {
      throw new Error(`Key "${key}" not found in config`);
    }

    if (key === "topics" || key === "rules") {
      const target = cfg[key] as string[];
      switch (op) {
        case "append":
          if (value === undefined) throw new Error("Append requires a value");
          target.push(value);
          break;
        case "remove":
          if (value === undefined) throw new Error("Remove requires a value");
          cfg[key] = target.filter((v: any) => v !== value);
          break;
        case "set":
          if (!Array.isArray(value)) throw new Error("Set requires an array");
          cfg[key] = value;
          break;
        default:
          throw new Error(`Operation "${op}" not supported on array key "${key}"`);
      }
    } else if (key === "functions" || key === "avatarVideos") {
      const target = cfg[key] as object;
      switch (op) {
        case "append":
          if (typeof value !== "object") throw new Error("Append requires an object");
          cfg[key] = { ...target, ...value };
          break;
        case "set":
          if (typeof value !== "object") throw new Error("Set requires an object");
          cfg[key] = value;
          break;
        case "remove":
          if (typeof value === "string") {
            delete cfg[key][value];
          } else if (Array.isArray(value)) {
            for (const k of value) delete cfg[key][k];
          } else {
            throw new Error("Remove requires a key name or array of keys for object");
          }
          break;
        default:
          throw new Error(`Operation "${op}" not supported on object key "${key}"`);
      }
    } else {
      const target = cfg[key] as string;
      switch (op) {
        case "set":
          cfg[key] = value;
          break;
        default:
          throw new Error(`Operation "${op}" not supported on primitive key "${key}"`);
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
        console.log("saved config",newConfig) 
    })();
    ConfigActionProvider.configAtom = save.finally(() => {
      ConfigActionProvider.configAtom = null;
    });
    await save;
  }

}

// export factory
export const configActionProvider = (ap: any, reqAddr: string) => {
  return new ConfigActionProvider(ap, reqAddr);
};

