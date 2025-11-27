// app/providers/pythActionProvider.js
import { ActionProvider, CreateAction, Network } from "@coinbase/agentkit";
import { z } from "zod";
import { EventSource } from "eventsource";
// import { broadcastPrice } from "@/app/utils/priceBroadcast";

// Define schema for fetching price
const FetchPriceSchema = z.object({
  tokenSymbol: z.string().describe("Asset ticker/symbol, e.g., BTC, ETH, COIN, XAU, EUR"),
  quoteCurrency: z.string().default("USD").describe("Quote currency, defaults to USD"),
  assetType: z.enum(["crypto", "equity", "fx", "metal"]).default("crypto").describe("Asset type"),
});

/*
const SubscribePriceSchema = z.object({
  feedId: z.string().describe("Price Feed Id"),
});
*/

// Price feed cache interface
interface PriceFeedCache {
  id?: string;
  tokenSymbol: string;
  quoteCurrency: string;
  assetType: string;
  feedType: string;
  timestamp: number;
}

// Price data interface for pub/sub
interface PriceData {
  tokenSymbol: string;
  quoteCurrency: string;
  price: string;
  priceFeedID: string;
  timestamp: number;
}

export class NewPythActionProvider extends ActionProvider {

  private priceFeedCache: Map<string, PriceFeedCache>;
  private subscribers: ((data: PriceData) => void)[];
  private running: boolean;
  private _interval: NodeJS.Timeout | null;
  supportsNetwork: (network: Network) => boolean;

  constructor() {
    super("pyth", []);
    this.supportsNetwork = () => true;
    this.priceFeedCache = new Map();
    this.subscribers = [];
    this.running = false;
    this._interval = null;
  }

  // Subscribe to price updates
  subscribeToPriceUpdates(callback: (data: PriceData) => void) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter((sub) => sub !== callback);
    };
  }

  /*
  // Publish price updates to subscribers
  private publishPriceUpdate(data: PriceData) {
    this.subscribers.forEach((callback) => callback(data));
  }
 */

  // Helper to get cache key
  private getCacheKey(args: { tokenSymbol: string; quoteCurrency: string; assetType: string }) {
    return `${args.tokenSymbol.toLowerCase()}/${args.quoteCurrency.toLowerCase()}/${args.assetType}`;
  }

  @CreateAction({
    name: "getPrice",
    description: `
      This action MUST ALWAYS be used whenever the user asks for the price,
      value, or exchange rate of any asset — even if the asset is unknown,
      newly launched, or not in the provider's cache.

      Never attempt to answer prices manually in text, Always use getPrice.
      Instead, always call this action with the tokenSymbol provided.

      Example triggers: "what is the price of ..",
                        "can you get me the price of ..",
                        "how much is .. ",
                        "price of ..", "fetch X/USD", etc.

      Always return an accurate price with the correct decimal point.
      
      Inputs:
      - tokenSymbol: The asset ticker/symbol (e.g., BTC, ETH, COIN, XAU, EUR)
      - quoteCurrency: The quote currency (defaults to USD)
      - assetType: The asset type (crypto, equity, fx, metal) - defaults to crypto
      
      Examples:
      - Crypto: BTC, ETH, SOL
      - Equities: COIN, AAPL, TSLA
      - FX: EUR, GBP, JPY
      - Metals: XAU (Gold), XAG (Silver), XPT (Platinum), XPD (Palladium)
    `,
    //schema: zodToJsonSchema(FetchPriceSchema),
    schema: FetchPriceSchema,
  })
  async getPrice(args = { tokenSymbol: "", quoteCurrency: "USD", assetType: "crypto" }) {
    const { tokenSymbol, quoteCurrency, assetType } = args;

    if (!tokenSymbol) {
      throw new Error("getPrice requires { tokenSymbol }");
    }

    let baseSymbol = args.tokenSymbol.split("/")[0];

    const cacheKey = this.getCacheKey(args);
    let priceFeedID = this.priceFeedCache.get(cacheKey)?.id;

    // Fetch price feed ID if not cached
    if (!priceFeedID) {
      const url = `https://hermes.pyth.network/v2/price_feeds?query=${baseSymbol}&asset_type=${assetType}`;
      const response = await fetch(url);

      if (!response.ok) {
        return JSON.stringify({
          success: false,
          error: `HTTP error! status: ${response.status}`,
        });
      }

      const data = await response.json();
      if (data.length === 0) {
        return JSON.stringify({
          success: false,
          error: `No price feed found for ${baseSymbol}`,
        });
      }

      const filteredData = data.filter(
        (item: any) =>
          item.attributes.base.toLowerCase() === baseSymbol.toLowerCase() &&
          item.attributes.quote_currency.toLowerCase() === quoteCurrency.toLowerCase()
      );

      if (filteredData.length === 0) {
        return JSON.stringify({
          success: false,
          error: `No price feed found for ${baseSymbol}/${quoteCurrency}`,
        });
      }

      let selectedFeed = filteredData[0];
      if (assetType === "equity") {
        const regularMarketFeed = filteredData.find(
          (item: any) =>
            !item.attributes.symbol.includes(".PRE") &&
            !item.attributes.symbol.includes(".POST") &&
            !item.attributes.symbol.includes(".ON") &&
            !item.attributes.symbol.includes(".EXT")
        );
        if (regularMarketFeed) {
          selectedFeed = regularMarketFeed;
        }
      }

      priceFeedID = selectedFeed.id == undefined ? "" : selectedFeed.id;
      this.priceFeedCache.set(cacheKey, {
        id: priceFeedID,
        tokenSymbol: baseSymbol,
        quoteCurrency,
        assetType,
        feedType: selectedFeed.attributes.display_symbol,
        timestamp: Date.now(),
      });
    }

    if (!priceFeedID) {
        return;
    }

    // Fetch price using the price feed ID
    const url = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${priceFeedID}`;
    const response = await fetch(url);

    if (!response.ok) {
      return JSON.stringify({
        success: false,
        error: `HTTP error! status: ${response.status}`,
      });
    }

    const data = await response.json();
    const parsedData = data.parsed;

    if (parsedData.length === 0) {
      return JSON.stringify({
        success: false,
        error: `No price data found for ${priceFeedID}`,
      });
    }

    // Format price
    const priceInfo = parsedData[0].price;
    const price = this.formatPrice(priceInfo);

    // Prepare result
    const result: PriceData = {
      tokenSymbol,
      quoteCurrency,
      price,
      priceFeedID,
      timestamp: Date.now(),
    };

    // Publish to subscribers
    // this.publishPriceUpdate(result);

    return JSON.stringify({
      success: true,
      ...result,
    });
  }

  // Helper function to format price (updated to preseve decimals)
  private formatPrice(priceInfo: any): string {
    const price = BigInt(priceInfo.price);
    const exponent = Number(priceInfo.expo);

    // negative exponent → price < 1
    if (exponent < 0) {
      const divisor = BigInt(10) ** BigInt(-exponent);
      // multiply price by 1 (no rounding)
      let scaled = price.toString().padStart(-exponent + 1, "0"); // ensure enough digits
      const decimalPos = scaled.length + exponent; // exponent is negative
      const formatted =
        scaled.slice(0, decimalPos) + "." + scaled.slice(decimalPos);
      return formatted.replace(/^0+(?=\d)/, ""); // strip leading zeros safely
    }

    // positive exponent → price > 1
    const scaled = price * BigInt(10) ** BigInt(exponent);
    return scaled.toString();
  }

  /**
   * Subscribe to a live Pyth price feed using Server-Sent Events (SSE).
   * Requires a valid priceFeedID (from getPrice).
   */
  async subscribeToPriceFeed(priceFeedID: string, tokenSymbol: string, strategyId: string) {
    const streamUrl = `https://hermes.pyth.network/v2/updates/price/stream?ids[]=${priceFeedID}`;

    // Note: EventSource is browser-native; for Node, use:
    // import EventSource from "eventsource";
    const eventSource = new EventSource(streamUrl);

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        const priceInfo = parsed.parsed?.[0]?.price;
        if (!priceInfo) return;

        const price = this.formatPrice(priceInfo);
        console.log("price",price)

        const priceData = {
          strategyId,
          tokenSymbol,
          quoteCurrency: "USD",
          price,
          priceFeedID,
          timestamp: Date.now(),
        };

        // broadcastPrice(priceData);
        //this.publishPriceUpdate(priceData);
      } catch (err) {
        console.error("Error parsing Pyth SSE message:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("Pyth SSE stream error:", err);
      eventSource.close();
    };

    console.log(`[Pyth] Subscribed to live updates for ${priceFeedID}`);
    return eventSource;
  }

  /*
  // Lightweight background loop to refresh prices
  runLoop(intervalMs = 60_000) {
    if (this.running) return;
    this.running = true;
    console.log("NewPythActionProvider: starting price refresh loop every", intervalMs, "ms");
    this._interval = setInterval(async () => {
      for (const [cacheKey, cache] of this.priceFeedCache) {
        const [tokenSymbol, quoteCurrency, assetType] = cacheKey.split("/");
        await this.getPrice({ tokenSymbol, quoteCurrency, assetType });
      }
    }, intervalMs);
  }

  stopLoop() {
    if (this._interval) clearInterval(this._interval);
    this.running = false;
    this._interval = null;
  }
 */

}

export const newPythActionProvider = () => {
  const p = new NewPythActionProvider();
  // p.runLoop();
  return p;
};
