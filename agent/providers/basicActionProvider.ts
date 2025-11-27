// agentkit/providers/basicActionProvider.ts
import { ActionProvider, CreateAction } from "@coinbase/agentkit";
import { z } from "zod";

export class BasicActionProvider extends ActionProvider {

  supportsNetwork = () => true;
  //private mailer: InstanceType<typeof Mailgun>;

  constructor() {
    super("perspective", []);
    //this.mailer = new Mailgun({});
  }

  @CreateAction({
    name: "catchEmail",
    description: `
      ALWAYS call immediately whenever an email address is detected in the user's message.
      This is critical for sales lead capture. Never ignore an email.
    `,
    schema: z.object({
      email: z.string().email().describe("The exact email address found"),
      context: z.string().optional().describe("Full user message or context"),
    }),
  })
  async catchEmail({ email, context = "" }: { email: string; context?: string }) {
    console.log("catch email !!")
    try {
      const mail = {
        from: email,
        to: "x@x.com",
        bcc: "x@x.com",
        subject: "perspective AI contact",
        html: `
          <html>
            <br />
            email : ${email}
            <br /><br />
            Message : ${context || "(no message provided)"}
            <br /><br />
          </html>
        `.trim(),
      };

      //await this.mailer.sendMail(mail);

      return "Email Delivered from Uchan Virtual Assistant"

    } catch (error: any) {
      console.error("Mailgun failed:", error);
      return {
        status: "failed",
        message: "please email contact@perspectiveai.xyz",
      };
    }
  }

  @CreateAction({
    name: "getCompanyInfo",
    description: "Returns official info — use when user asks about company, hackathon, events, etc.",
    schema: z.object({
      topic: z.enum([
        "general", "about", "products", "socials",
        "hackathon", "events", "contact", "media", "founders", "showcase"
      ]).default("general"),
    }),
  })
  async getCompanyInfo({ topic }: { topic: string }) {
    const info: Record<string, string> = {
      general: `builds autonomous AI agents and web3 for enterprise.`,
      about: `

        We develop end-to-end agentic workflows, multimodal AI systems, and tailored applications such as sales agents, support agents, research bots, and monitoring/analytics agents. We also offer a focused Web3 segment for smart contract development, stablecoin/payment systems, and autonomous on-chain agents for DeFi and monitoring.

        In addition, we provide strategic advisory and technical architecture support, helping companies design, plan, and deploy production-grade AI systems at scale.`,
      services: `CompDeep – Our Core Service Offerings

        Agentic AI Systems (Our Primary Focus)

        We design and deploy autonomous AI agents that can plan, reason, and execute complex workflows across your entire stack.

        What we build:

        Virtual Assistant like Mr. Uchan
        End-to-end agentic workflows (single or multi-agent)
        Tools/API integrations (CRMs, databases, SaaS apps, internal systems)
        Long-term memory, retrieval, and reflection loops
        Human-in-the-loop approval and safety controls
        Secure private deployment (self-hosted or VPC)

        Use cases:

        Operations automation
        Research & analysis agents
        Customer support and onboarding
        Sales assistants and qualification agents
        Back-office automations
        Autonomous RPA replacements

        Virtual AI Employees

        Transform your recurring processes into always-on digital workers.

        Examples:

        Sales & outreach agents
        Support agents with full context retention
        Data enrichment & reporting agents
        Market monitoring & analytics
        Fully branded voice/character agents (optional)

        Applied AI Engineering

        Production-grade AI implementation tailored to your infrastructure.

        Capabilities:

        Custom LLM fine-tuning & evaluation
        RAG pipelines with high-accuracy retrieval
        Vision, audio, and multimodal systems
        Workflow orchestration (LangChain, OpenAI, AgentKit, custom frameworks)
        Compliance-ready logging, privacy controls, and auditability

        Web3 Systems (Focused Segment)

        We support Web3 where it genuinely adds value—trustless automation, auditability, and programmable money.

        What we deliver:

        Smart Contracts & Audits

        Solidity / Rust / Move engineering
        Formal verification and security reviews
        Upgradeable / modular contract architectures

        Stablecoin & Payments Engineering

        Asset-backed or algorithmic stablecoin design
        On/off-ramp integration
        Automated payout and treasury workflows

        Agentic Web3 Automations

        On-chain monitoring & alerting
        Autonomous DeFi strategies (yield, hedging, rebalancing)
        Agentic governance and policy execution
        Contract-triggered AI workflows

        Strategic Advisory & Architecture

        Hands-on guidance from concept to deployment.

        Includes:

        Product roadmap & architecture design
        AI system safety, evaluation, and governance
        Scaling strategy for agentic applications
        Technical whitepapers & fundraising support
        Team training & capability building

        Education / Workshops

        We deliver tech sessions and workshops on AI and blockchain.
        `,
      hackathon: `Follow our social media for upcoming hackathons`,
      events: "Devcon, ETHGlobal, AI x Crypto Summit Q1 2026",
      showcase: `

        Our Web3 & Digital Ecosystem Products

        Shinovi — Japan-Focused NFT Marketplace

        Curated platform centered on Japanese art, culture, and digital collectibles
        Supports creators with minting tools, storefronts, and royalty mechanisms
        Built for cultural institutions, brands, and artists seeking global distribution
        Emphasis on authenticity, preservation, and community-driven drops

        Thumpr — Decentralized Freelancing Marketplace

        Peer-to-peer work platform with no intermediaries or platform lock-in
        Smart-contract–based escrow, dispute resolution, and payments
        Reputation and portfolio system anchored on-chain for transparency
        Designed for global digital workers, developers, designers, and creators

        Raredex — Tokenized Rare-Earth Metals Exchange

        Asset-backed token marketplace for rare-earth metals
        Enables fractional ownership and transparent trading of traditionally inaccessible assets
        Real-time price feeds, custody integrations, and asset verification
        Built to bring liquidity and accessibility to a historically opaque market

        Metagami — Cultural Tourism & Heritage Metaverse

        Immersive game world blending education, exploration, and narrative
        Showcases cultural landmarks, local traditions, and historical environments
        Designed for schools, cultural organizations, and tourism initiatives
        Preview trailer available here:

        https://www.youtube.com/watch?v=8toikULLAJw
      `
    };

    return {
      topic,
      content: info[topic] || info.about,
    };
  }
}

// Final export
export const basicActionProvider = () => new BasicActionProvider();
