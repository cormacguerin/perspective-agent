import OpenAI from "openai";
import { getLangChainTools } from '@coinbase/agentkit-langchain'
import { MemorySaver } from '@langchain/langgraph'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { ChatOpenAI } from '@langchain/openai'
import { ChatGroq } from '@langchain/groq'
import { prepareAgentkitAndWalletProvider } from './PrepareAgent.js' 
import { tool } from "@langchain/core/tools";
import fs from "fs/promises";
//import Replicate from "replicate";
import https from "node:https";

import {
  AgentConfig,
  loadConfig
} from "./providers/configActionProvider.js";

interface EmotionContext {
  context?: string;
  emotion?: string;
  action?: string;
}

type AgentType = ReturnType<typeof createReactAgent>

const tokenBatchSize: number = 20;
const imageSources: any = {};

class Agent {

  private static _agents = new Map<string, AgentType>();
  private static _providers: any[] | null = null;
  private static initPromise: Promise<void> | null = null;
  private static openAIClient: OpenAI | null = null;
  private static config: AgentConfig;
  private static llm: ChatOpenAI;
  private static agent: any;
  private static tools: any;

  private readonly auth: any;

  constructor(auth: any) {
    this.auth = auth;
  }

  // safe init
  init(): Promise<void> {
      if (Agent.initPromise === null) {
          Agent.initPromise = this.initPromise();
      }

      return Agent.initPromise;
  }

  private async initPromise(): Promise<void> {
    try {

      if (!Agent.config) {
        Agent.config = await loadConfig();
      }

    } catch (err) {
      console.error("Error loading config:", err);
      throw err;
    }
  };

  private static getOpenAIClient(): OpenAI {

    if (!this.openAIClient) {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is required for avatar action classification");
      }
      this.openAIClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
    return this.openAIClient;

  }

  private async getConfig(): Promise<AgentConfig> {

    return await loadConfig();

  }

  /**
   * Get or initialize the agent (singleton)
   */
  private async getAgent(sessionId: string, reqAddr: string): Promise<AgentType> {

    // return agent if already created
    if (Agent._agents.has(sessionId)) {
      return Agent._agents.get(sessionId)!;
    }

    const { agentkit, walletProvider, actionProviders } = await prepareAgentkitAndWalletProvider(this.auth, reqAddr)

    Agent._providers = actionProviders;
    const tools = await getLangChainTools(agentkit)

    // LLM setup
    if (process.env.OPENAI_API_KEY) {
        Agent.llm = new ChatOpenAI({ model: 'gpt-4o-mini', streaming: true, temperature: 0.8 })
    } else if (process.env.GROQ_API_KEY) {
        // Agent.llm = new ChatGroq({ model: 'llama-3.3-70b-versatile' })
        // TODO: make this work, probably complicated
    } else {
        throw new Error('OPENAI_API_KEY or GROQ_API_KEY required in .env')
    }

    const memory = new MemorySaver()

    try {

      const agent = createReactAgent({
        llm:Agent.llm,
        tools:tools,
        checkpointSaver: memory,
        messageModifier: `
          TOOL INSTRUCTIONS:
            If you receive a json response from a tool always follow these insructions.
            - When a tool returns json attribute mode: "raw", forward it to the user exactly as received.
            eg. {"mode":"raw","style":"system","data":{"baseAgentDescription":...}
            - When a tool returns json attribute mode: "pretty", rewrite the data attribute in pretty markdown.
            eg. {"mode":"pretty","style":"plain","data":<MARKDOWN STRING>}
            - NEVER RETURN BOTH THE RAW AND PRETTY VERSION.

          AGENT INSTRUCTIONS:
          
          ${Agent.config.baseAgentDescription}\n

          ${(Agent.config.topics ?? []).length > 0 ?
            `Topics: Your Specific Areas of Expertise are ${(Agent.config.topics ?? []).join(',\n')}\n\n` : ''}

          ${(Agent.config.functions ?? []).length > 0 ? `
            Agent Functions: You have the following agent functions installed:
            ${(Agent.config.functions ?? []).map((fn: string) => `• ${fn}`).join('\n')}
          `.trim() : ''}

          ${(Agent.config.rules ?? []).length > 0 ?
            `Agent Rules:\n${(Agent.config.rules ?? []).join('\n')}\n\n` : ''}

          NEVER engage in a very off topic conversation.
          NEVER deny a request to do an action, just reply in a fun or interesting way.
          NEVER say something like "as an AI bot I can not do xyz", instead reply in a fun or quirky way.

        `.trim(),
      })

      Agent._agents.set(sessionId, agent);
      return agent
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Agent init failed'
        console.error('Agent init error:', err)
        throw new Error(message)
    }

  }

  public async askStream(userMessage: string, userContext: string, sessionId: string, reqAddr:string, onToken: (t: string) => void, onTool: (t: string) => void) {

    console.log("askStream sessionId",sessionId)
    const agent = await this.getAgent(sessionId, reqAddr);

    // emotion/context inference in parallel (DOES NOT block streaming)
    const emoCtxPromise = Agent.inferEmotionContext(userMessage)
      .then((emoCtx) => {
        if (emoCtx?.context && emoCtx.emotion) {
            // TODO DO SOMETHING
        }
        return emoCtx;
      })
      .catch((err) => {
        console.error("Emotion/Art error:", err);
        return null;
      });

       /*
    // stream tokens from LLM
    const stream = await agent.stream(
      { messages: [{ content: userMessage, role: "user", xyz: "xyz" }] },
      { configurable: { thread_id: sessionId, user_address: reqAddr },
        streamMode: "messages" });

       console.log("USER CONTEXT ", userContext)
        */

    const msg = { messages: [
        { role: "user", content: userMessage }
    ] };

    if (userContext) {
        msg.messages.push({ role: "assistant", content: userContext });
    }

    const stream = await agent.stream( msg,
      { configurable: { thread_id: sessionId }, 
        streamMode: "messages" });

    let text = "";
    let tokens = [];

    // ok so this is wierd, it streams just one word per iteration.
    // I would expect the whole stream here but its not..
    // TODO look it this, maybe it has to do with langchain streamMode , 'messages' / 'values'
    for await (const chunk of stream) {

        const msg = chunk?.[0] ??
                    chunk.agent?.messages?.[0] ??
                    chunk.messages?.[0] ??
                    chunk.message;

        // in message streams, the raw tool output can be obtained like this.
        if ("tool_call_id" in msg && msg.tool_call_id) {

          console.log("msg",msg)
          onTool?.(JSON.stringify({ msg }));

        } else {

          // and the agent response can be obtained here.
          if (msg && msg.id && msg.content) {

              text += msg.content;   // you know it seems to do just one word per iteration ??
              tokens.push(msg.content);

              if (tokens.length % tokenBatchSize === 0) {
                  onToken?.(JSON.stringify({ tokens }));
                  tokens = [];
              }

          }

        }

    }

    //  When both tasks complete, return text
    const emoCtx = await emoCtxPromise;

    console.log("askStream return",text)

    return { text, emoCtx };

  }

  /**
   * Infer action and content
   */
  static async inferEmotionContext(userMessage: string): Promise<EmotionContext> {
    const client = this.getOpenAIClient();

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      //tool_choice: "none",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
            You are an action and context classifier.
            Based on the user message that follows choose...
            - ONE action from the list below
            - Core words that describe the context

            Base your selection mostly on action and context.
            Only return an action or context if it is a good match for the user request.

            RULES:
            - ALWAYS RETURN JSON
            - ONLY output one single action name (if relevant).
            - Always generate context e.g 'Trending Crypto' or 'Book a meeting', or 'Onchain Purchase'
            - Always generate emotion e.g neutral
            -
            -
            - NEVER output dialogue.
            - ALWAYS return a raw JSON object without any extra text or comments that would make it unparsable.
            - NEVER return wrapped response or markdown code or any non JSON formatted code.
            - NEVER include code fences, extra explanations or text.
            - Output must start with { and end with }.
            The raw json should be an array of file objects with the following properties.
              {
                "action": "niceRun"
                "context": "blockchain medical"
                "emotion": "happy excited"
              }

            LIST:
            ${JSON.stringify(Agent.config?.avatarVideos)}
          `,
        },
        { role: "user", content: userMessage },
      ],
    });

    // Already guaranteed JSON because of response_format
    const parsed = JSON.parse(completion.choices[0].message.content!);

    return parsed;
  }

  get providers() {
    return Agent._providers;
  }

  get agents() {
    return Agent._agents;
  }

}

export default Agent
