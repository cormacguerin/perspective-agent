// agentkit/providers/configActionProvider.ts
import { ActionProvider, CreateAction } from "@coinbase/agentkit";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

// ---------------------------------------------------------------------------
// Types & Schemas
// ---------------------------------------------------------------------------

interface VideoArgs {
  name: string;
  path: string;
  description: string;
}

const VideoSchema = z.object({
  name: z.string().describe("Original name of the video, e.g. arnie_laugh.mp4"),
  path: z.string().describe("Relative web-accessible path, e.g. /videos/arnie_laugh.mp4"),
  description: z.string().describe("When this video should be triggered"),
});

const AvatarVideoKeySchema = z.string().regex(/^[a-zA-Z0-9_]+$/).describe("Unique key for the avatar video (e.g. idleListening, getToTheChopper)");

// Full config shape (mirrors your example)
interface LLMConfig {
  baseAgentDescription: string;
  topics: string[];
  rules: string[];
  functions: {
    catchEmail?: boolean;
    [key: string]: any;
  };
  avatarVideos: Record<
    string,
    {
      video: string;
      description: string;
    }
  >;
}

// Path to the persistent config file
const CONFIG_PATH = path.resolve(process.cwd(), "llm_config.json");

// Helper: load config with defaults
async function loadConfig(): Promise<LLMConfig> {
  try {
    const data = await fs.readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(data) as LLMConfig;
  } catch (err: any) {
    if (err.code === "ENOENT") {
      // Return a sensible default if file doesn't exist yet
      const defaultConfig: LLMConfig = {
        baseAgentDescription:
          "You are Arnold Schwarzenegger, a legendary action hero and bodybuilder with an over-the-top Austrian accent.",
        topics: ["action movies", "bodybuilding", "motivation", "80s cinema"],
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
      await saveConfig(defaultConfig);
      return defaultConfig;
    }
    throw err;
  }
}

// Helper: atomically save config
async function saveConfig(config: LLMConfig): Promise<void> {
  const tmpPath = CONFIG_PATH + ".tmp";
  await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), "utf-8");
  await fs.rename(tmpPath, CONFIG_PATH);
}

// ---------------------------------------------------------------------------
// ConfigActionProvider
// ---------------------------------------------------------------------------

export class ConfigActionProvider extends ActionProvider {
  supportsNetwork = () => true;

  constructor() {
    super("config", []); // "config" is a good namespace
  }

  // -------------------------------------------------------------------------
  // 1. Add / Update a video trigger
  // -------------------------------------------------------------------------
  @CreateAction({
    name: "addOrUpdateAvatarVideo",
    description: "Add a new avatar video or update an existing one. Use this whenever the user wants Arnold to play a specific clip on certain triggers.",
    schema: VideoSchema.and(
      z.object({
        key: AvatarVideoKeySchema.describe(
          "Unique identifier for this video trigger (e.g. goodJoke, getToTheChoppa, angry). Use camelCase or snake_case."
        ),
      })
    ),
  })
  async addOrUpdateAvatarVideo(
    args: VideoArgs & { key: string }
  ): Promise<string> {
    const { key, name, path, description } = args;
    const config = await loadConfig();

    config.avatarVideos[key] = {
      video: path.startsWith("/") ? path : `/${path.replace(/^\/+/, "")}`,
      description,
    };

    await saveConfig(config);
    return `Successfully saved avatar video "${name}" under key "${key}". It will now play when the trigger "${key}" is used.`;
  }

  // -------------------------------------------------------------------------
  // 2. Remove a video trigger
  // -------------------------------------------------------------------------
  @CreateAction({
    name: "removeAvatarVideo",
    description: "Remove an avatar video trigger by its key.",
    schema: z.object({
      key: AvatarVideoKeySchema,
    }),
  })
  async removeAvatarVideo(args: { key: string }): Promise<string> {
    const config = await loadConfig();
    if (!config.avatarVideos[args.key]) {
      return `No video found with key "${args.key}". Nothing was removed.`;
    }

    delete config.avatarVideos[args.key];
    await saveConfig(config);
    return `Removed avatar video trigger "${args.key}".`;
  }

  // -------------------------------------------------------------------------
  // 3. List all current avatar videos
  // -------------------------------------------------------------------------
  @CreateAction({
    name: "listAvatarVideos",
    description: "Return all currently configured avatar video triggers and their descriptions.",
    schema: z.object({}),
  })
  async listAvatarVideos(): Promise<string> {
    const config = await loadConfig();
    if (Object.keys(config.avatarVideos).length === 0) {
      return "No avatar videos configured yet.";
    }

    const lines = Object.entries(config.avatarVideos).map(
      ([key, { video, description }]) =>
        `• ${key} → ${video}\n  Description: ${description}`
    );

    return (
      "Current avatar video triggers:\n\n" + lines.join("\n\n") + "\n"
    );
  }

  // -------------------------------------------------------------------------
  // 4. Update base agent description
  // -------------------------------------------------------------------------
  @CreateAction({
    name: "updateBaseAgentDescription",
    description: "Change the core personality description of the agent.",
    schema: z.object({
      description: z.string().min(10).describe("New full personality description"),
    }),
  })
  async updateBaseAgentDescription(args: { description: string }): Promise<string> {
    const config = await loadConfig();
    config.baseAgentDescription = args.description.trim();
    await saveConfig(config);
    return "Base agent description updated successfully.";
  }

  // -------------------------------------------------------------------------
  // 5. Add a new rule
  // -------------------------------------------------------------------------
  @CreateAction({
    name: "addRule",
    description: "Add a new behavioral rule that Arnold must follow.",
    schema: z.object({
      rule: z.string().min(5),
    }),
  })
  async addRule(args: { rule: string }): Promise<string> {
    const config = await loadConfig();
    const cleaned = args.rule.trim();
    if (config.rules.includes(cleaned)) {
      return "This rule already exists.";
    }
    config.rules.push(cleaned);
    await saveConfig(config);
    return `Added new rule: "${cleaned}"`;
  }

  // -------------------------------------------------------------------------
  // 6. Remove a rule
  // -------------------------------------------------------------------------
  @CreateAction({
    name: "removeRule",
    description: "Remove an existing rule by its exact text.",
    schema: z.object({
      rule: z.string(),
    }),
  })
  async removeRule(args: { rule: string }): Promise<string> {
    const config = await loadConfig();
    const idx = config.rules.findIndex((r) => r === args.rule.trim());
    if (idx === -1) {
      return "Rule not found.";
    }
    config.rules.splice(idx, 1);
    await saveConfig(config);
    return "Rule removed.";
  }

  // -------------------------------------------------------------------------
  // 7. Toggle function flags (e.g. email capture)
  // -------------------------------------------------------------------------
  @CreateAction({
    name: "toggleFunction",
    description: "Enable or disable built-in functions like email capture.",
    schema: z.object({
      functionName: z.enum(["catchEmail"]),
      enabled: z.boolean(),
    }),
  })
  async toggleFunction(args: { functionName: string; enabled: boolean }): Promise<string> {
    const config = await loadConfig();
    config.functions[args.functionName] = args.enabled;
    await saveConfig(config);
    return `${args.functionName} is now ${args.enabled ? "enabled" : "disabled"}.`;
  }

  // -------------------------------------------------------------------------
  // 8. Get full current config (for debugging / transparency)
  // -------------------------------------------------------------------------
  @CreateAction({
    name: "getCurrentConfig",
    description: "Return the entire current LLM configuration (useful for transparency or debugging).",
    schema: z.object({}),
  })
  async getCurrentConfig(): Promise<string> {
    const config = await loadConfig();
    return "```json\n" + JSON.stringify(config, null, 2) + "\n```";
  }
}

// ---------------------------------------------------------------------------
// Export factory
// ---------------------------------------------------------------------------
export const configActionProvider = () => new ConfigActionProvider();
