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


interface EmotionContext {
  context?: string;
  emotion?: string;
  action?: string;
}

type AgentType = ReturnType<typeof createReactAgent>

const tokenBatchSize: number = 20;
const imageSources: any = {};

const videoSources = {
  idleListening: {
    video: "/video/idle-listen.mp4",
    depthVideo: "/video/idle-listen_depth.mp4",
    description: "Uchan is calmly listening, ears perked, head slightly tilted, showing attention and curiosity."
  },
  idleMoveEars: {
    video: "/video/idle-move-ears.mp4",
    depthVideo: "/video/idle-move-ears_depth.mp4",
    description: "Uchan is relaxed but alert, subtly moving ears independently to scan for sounds."
  },
  idleSmell: {
    video: "/video/idle-smell.mp4",
    depthVideo: "/video/idle-smell_depth.mp4",
    description: "Uchan is sniffing the air gently, nose twitching, exploring scents in the environment."
  },
  chatting: {
    video: "/video/chatting.mp4",
    depthVideo: "/video/chatting_depth.mp4",
    description: "Uchan is animated and expressive, as if talking or reacting playfully to conversation."
  },
  talking: {
    video: "/video/talking.mp4",
    depthVideo: "/video/talking_depth.mp4",
    description: "Uchan is speaking or making vocal sounds, mouth moving, engaged in dialogue."
  },
  lookAround: {
    video: "/video/look-around.mp4",
    depthVideo: "/video/look-around_depth.mp4",
    description: "Uchan is slowly turning head side to side, scanning surroundings with calm curiosity."
  },
  yawn: {
    video: "/video/yawn.mp4",
    depthVideo: "/video/yawn_depth.mp4",
    description: "Uchan lets out a big, cute yawn, mouth wide, eyes half-closed, showing relaxation or sleepiness."
  },
  liedown: {
    video: "/video/liedown.mp4",
    depthVideo: "/video/liedown_depth.mp4",
    description: "Uchan gently lies down, folding legs, settling into a comfortable resting position."
  },
  hopForward: {
    video: "/video/hop-forward.mp4",
    depthVideo: "/video/hop-forward_depth.mp4",
    description: "Uchan performs a small, bouncy hop forward, full of energy and playfulness."
  },
  jumpUp: {
    video: "/video/jump-up.mp4",
    depthVideo: "/video/jump-up_depth.mp4",
    description: "Uchan leaps upward with excitement, ears flapping, full of joyful energy."
  },
  niceRun: {
    video: "/video/nice-run.mp4",
    depthVideo: "/video/nice-run_depth.mp4",
    description: "Uchan runs smoothly and gracefully in a wide arc, showing confident and happy movement."
  },
  runAround: {
    video: "/video/run-around.mp4",
    depthVideo: "/video/run-around_depth.mp4",
    description: "Uchan runs in playful circles, full of energy, chasing or exploring with delight."
  },
  runBackwards: {
    video: "/video/run-backwards.mp4",
    depthVideo: "/video/run-backwards_depth.mp4",
    description: "Uchan runs backward in a silly, comedic way, ears bouncing, being playful and goofy."
  },
  runRightLeft: {
    video: "/video/run-right-left.mp4",
    depthVideo: "/video/run-right-left_depth.mp4",
    description: "Uchan zigzags quickly left and right, dodging or playing, very energetic and fast."
  },
  runRight: {
    video: "/video/run-right.mp4",
    depthVideo: "/video/run-right_depth.mp4",
    description: "Uchan runs steadily to the right, ears back, focused and determined in motion."
  },
  carrot1: {
    video: "/video/carrot1.mp4",
    depthVideo: "/video/carrot1_depth.mp4",
    description: "Uchan happily munches on a carrot, ears forward, showing contentment and joy."
  },
  carrot2: {
    video: "/video/carrot2.mp4",
    depthVideo: "/video/carrot2_depth.mp4",
    description: "Uchan nibbles a carrot from a different angle, focused and satisfied while eating."
  },
  rabbitHole: {
    video: "/video/rabbit-hole.mp4",
    depthVideo: "/video/rabbit-hole_depth.mp4",
    description: "Uchan curiously peers into or emerges from a rabbit hole, full of wonder and adventure."
  },
  uchanEnergetic: {
    video: "/video/uchan-energetic.mp4",
    depthVideo: "/video/uchan-energetic_depth.mp4",
    description: "Uchan is bursting with energy, bouncing, ears flapping, radiating pure excitement."
  }
}

class AgentKitNode {

  private static agentPromise: Promise<AgentType> | null = null
  private static openAIClient: OpenAI | null = null;
  private static isInitializing = false
  private static isInitialized = false
  private static error: string | null = null
  private static config = "{}";

  constructor() {
      this.config = getConfig();
  }

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

  private static async getConfig()  {

    try {
      return JSON.parse(await fs.readFile("agent_config.json", "utf8"));
    } catch (e) {
      console.log(e);
    }

  }

  /**
   * Get or initialize the agent (singleton)
   */
  static async getAgent(): Promise<AgentType> {
    if (this.agentPromise) return this.agentPromise

    this.isInitializing = true;
    this.error = null;

    try {

      const { agentkit, walletProvider } = await prepareAgentkitAndWalletProvider()

      // LLM setup
      let llm
      if (process.env.OPENAI_API_KEY) {
          llm = new ChatOpenAI({ model: 'gpt-4o-mini', streaming: true, temperature: 0.8 })
      } else if (process.env.GROQ_API_KEY) {
          llm = new ChatGroq({ model: 'llama-3.3-70b-versatile' })
      } else {
          throw new Error('OPENAI_API_KEY or GROQ_API_KEY required in .env')
      }

      const tools = await getLangChainTools(agentkit)
      const memory = new MemorySaver()

      const agent = createReactAgent({
        llm,
        //tools: tools as any[], // Safe cast — LangGraph handles StructuredTool[]
        tools,
        checkpointSaver: memory,
        messageModifier: `
          
          ${baseAgentDescription}\n

          ${functions?.length > 0 ? 
            `Functions: You have the following agent functions installed ${functions.join('\n')}\n\n` : ''}

          ${topics?.length > 0 ? 
            `Topics: Your Speicific Areas of Expertise are ${topics.join(',\n')}\n\n` : ''}

          ${catchEmail?.trim() ? `${catchEmail.trim()}\n\n` : ''}

          ${rules?.length > 0 ? 
            `Rules:  ${rules.join('\n')}\n\n` : ''}

          NEVER engage in a very off topic conversation.
          NEVER deny a request to do an action, just reply in a fun or interesting way.
          NEVER say something like "as an AI bot I can not do xyz", instead reply in a fun or quirky way.

        `.trim(),
      })

      this.isInitialized = true
      this.agentPromise = Promise.resolve(agent)
      return agent
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Agent init failed'
        this.error = message
        console.error('AgentKitNode init error:', err)
        throw new Error(message)
    } finally {
        this.isInitializing = false
    }
  }
   /**
   * Send message and get full response
   */
  static async ask(userMessage: string) {

    const agent = await this.getAgent();

    // Fire both calls in parallel
    const [text, emoCtx] = await Promise.all([
      this.processStream(
        await agent.stream(
          { messages: [{ content: userMessage, role: "user" }] },
          { configurable: { thread_id: "agentkit-node" },
            streamMode: "updates" })
      ),
      this.inferEmotionContext(userMessage),
    ]) as [string,EmotionContext];

    if (emoCtx.context && emoCtx.emotion) {
        // DO SOMETHING
    }

    console.log("return", {text,emoCtx})

    return {
      text,
      emoCtx,
    };

  }

  static async askStream(userMessage: string, onToken: (t: string) => void) {

    // emotion/context inference in parallel (DOES NOT block streaming)
    const emoCtxPromise = this.inferEmotionContext(userMessage)
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

    const agent = await this.getAgent();

    // stream tokens from LLM
    const stream = await agent.stream(
      { messages: [{ content: userMessage, role: "user" }] },
      { configurable: { thread_id: "agentkit-node" },
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

        if (msg && msg.id && msg.content) {

            text += msg.content;   // you know it seems to do just one word per iteration ??
            // onToken?.(JSON.stringify({ text: msg.content }));

            tokens.push(msg.content);

            if (tokens.length % tokenBatchSize === 0) {
                onToken?.(JSON.stringify({ tokens }));
                tokens = [];
            }

        } else if (msg?.content) {

            text = msg.content; // return the full text at the end, useful for rendering and parsing.

        }

    }

    //  When both tasks complete, return text
    const emoCtx = await emoCtxPromise;

    return { text, emoCtx };

  }


  private static async processStream(
    stream: AsyncIterable<any>,
    ): Promise<string> {

    let result = "";

    for await (const chunk of stream) {
      const msg =
        chunk.agent?.messages?.[0] ??
        chunk.messages?.[0] ??
        chunk.message;

      if (msg?.content) {
        const token = msg.content;
      }
    }

    return result.trim();
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
            - Always generate context e.g AI Agents
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
            ${JSON.stringify(videoSources)}
          `,
        },
        { role: "user", content: userMessage },
      ],
    });

    // Already guaranteed JSON because of response_format
    const parsed = JSON.parse(completion.choices[0].message.content!);

    return parsed;
  }

  // Optional: Expose status (for logging or API)
  static getStatus() {
    return {
      isInitializing: this.isInitializing,
      isInitialized: this.isInitialized,
      error: this.error,
    }
  }

}

export default AgentKitNode
