// app/providers/dexScreenerActionProvider.ts
import { ActionProvider, CreateAction, Network } from "@coinbase/agentkit";
import { z } from "zod";

// Dexscreener base API URL
const DEXSCREENER_URL = "https://api.dexScreener.com/latest/dex/search?q=";

// Token info interface
interface DexToken {
  baseToken: { name: string; symbol: string; address: string };
  quoteToken: { symbol: string };
  chainId: string;
  dexId: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  fdv?: number;
}

const TokenDetailSchema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      "Search query such as a token symbol or name, e.g., PEPE, DEGEN, BRETT. Optional if using filters."
    ),
  chain: z
    .enum(["base", "ethereum", "bsc", "arbitrum", "solana"])
    .default("base")
    .describe("Blockchain network to filter results on, defaults to Base."),
  capTier: z
    .enum(["top", "mid", "low"])
    .default("top")
    .describe(
      "Market-cap or liquidity tier: top (liquidity > $5M), mid ($100k–$5M), low (< $100k)"
    ),
});



/**
 * Dexscreener Action Provider
 */
export class DexscreenerActionProvider extends ActionProvider {
    supportsNetwork: (network: Network) => boolean;

    constructor() {
        super("dexScreener", []);
        this.supportsNetwork = () => true;
    }

    private async fetchDexscreener(query: string): Promise<DexToken[]> {
        const res = await fetch(`${DEXSCREENER_URL}${encodeURIComponent(query)}`);
        if (!res.ok) {
            throw new Error(`Dexscreener API error: ${res.status}`);
        }
        const data = await res.json();
        return data.pairs || [];
    }

    private filterByTier(tokens: DexToken[], tier: "top" | "mid" | "low"): DexToken[] {

        const liquidity = (t: DexToken) => t.liquidity?.usd || 0;

        switch (tier) {
          case "top":
            return tokens.filter((t) => liquidity(t) > 5_000_000);
          case "mid":
            return tokens.filter((t) => liquidity(t) >= 100_000 && liquidity(t) <= 5_000_000);
          case "low":
            return tokens.filter((t) => liquidity(t) < 100_000);
          default:
            return tokens;
        }
      }

    /*
     * Token pair detail with dexscreener
     */
    @CreateAction({
        name: "tokenDetail",
        description: `
          get crypto token details.

          This action can be used to:
          - Search for a token by name or symbol (e.g. "PEPE")
          - Returns top/mid/low cap tokens on a specific chain (e.g. "BRETT on Base, or PENGU on Solana")

          Use this action when asked about specific token information.

          Example user prompts:
          - "Show me some memecoins on Base"
          - "What is trending in crypto"
          - "Give me midcap tokens trading on Base"
        `,
        schema: TokenDetailSchema,
    })
    async tokenDetail(args = { query: "", chain: "base", capTier: "top" }) {

        const { query, chain, capTier } = args;
        const searchTerm = query || chain; // if no query, search chain for all
        const tokens = await this.fetchDexscreener(searchTerm);

        console.log("DexScreenerActionProvider : tokenDetail", {query,chain,capTier});

        const filtered = tokens
          .filter((t) => t.chainId === chain)
          .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));

        // Compute tier for each token individually
        const annotated = filtered.map((t) => {
            const value = t.fdv || t.liquidity?.usd || 0;
            console.log("value",value)
            let computedTier: "low" | "mid" | "top" = "low";
            if (value > 1_000_000_000) computedTier = "top";
            else if (value >= 10_000_000) computedTier = "mid";

            return { ...t, computedTier };
        });

        const tiered = annotated.filter((t) => t.computedTier === capTier);

        var final;
        if (tiered.length === 0 && annotated.length > 0) { final = annotated; } else { final = tiered }

        console.log("tiered",tiered)

        // Format results
        const results = final.slice(0, 10).map((t) => ({
          name: t.baseToken.name,
          symbol: t.baseToken.symbol,
          address: t.baseToken.address,
          chain: t.chainId,
          priceUsd: t.priceUsd,
          liquidityUsd: t.liquidity?.usd,
          volume24h: t.volume?.h24,
          fdv: t.fdv,
          dex: t.dexId,
        }));

        console.log("results",results)

        return JSON.stringify({
          success: true,
          query: query || null,
          chain,
          capTier,
          count: results.length,
          results,
        });
    }
}

// Factory
export const dexScreenerActionProvider = () => new DexscreenerActionProvider();

