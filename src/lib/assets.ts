export type AssetType = "us_stock" | "crypto";

export type AssetInfo = {
  symbol: string;
  name: string;
  ticker: string;
  type: AssetType;
};

export const ASSET_TYPES: { key: AssetType; label: string }[] = [
  { key: "us_stock", label: "미국 주식" },
  { key: "crypto", label: "암호화폐" },
];

export const ASSETS: AssetInfo[] = [
  // ── US Stocks (50) ──
  // Tech
  { symbol: "AAPL", name: "Apple", ticker: "AAPL", type: "us_stock" },
  { symbol: "NVDA", name: "NVIDIA", ticker: "NVDA", type: "us_stock" },
  { symbol: "MSFT", name: "Microsoft", ticker: "MSFT", type: "us_stock" },
  { symbol: "GOOGL", name: "Alphabet", ticker: "GOOGL", type: "us_stock" },
  { symbol: "META", name: "Meta", ticker: "META", type: "us_stock" },
  { symbol: "AMZN", name: "Amazon", ticker: "AMZN", type: "us_stock" },
  { symbol: "TSLA", name: "Tesla", ticker: "TSLA", type: "us_stock" },
  { symbol: "AMD", name: "AMD", ticker: "AMD", type: "us_stock" },
  { symbol: "AVGO", name: "Broadcom", ticker: "AVGO", type: "us_stock" },
  { symbol: "ADBE", name: "Adobe", ticker: "ADBE", type: "us_stock" },
  { symbol: "CRM", name: "Salesforce", ticker: "CRM", type: "us_stock" },
  { symbol: "INTC", name: "Intel", ticker: "INTC", type: "us_stock" },
  { symbol: "CSCO", name: "Cisco", ticker: "CSCO", type: "us_stock" },
  { symbol: "ORCL", name: "Oracle", ticker: "ORCL", type: "us_stock" },
  { symbol: "QCOM", name: "Qualcomm", ticker: "QCOM", type: "us_stock" },
  { symbol: "NFLX", name: "Netflix", ticker: "NFLX", type: "us_stock" },
  { symbol: "AMAT", name: "Applied Materials", ticker: "AMAT", type: "us_stock" },
  { symbol: "SHOP", name: "Shopify", ticker: "SHOP", type: "us_stock" },
  { symbol: "SQ", name: "Block", ticker: "SQ", type: "us_stock" },
  { symbol: "PYPL", name: "PayPal", ticker: "PYPL", type: "us_stock" },
  // Finance
  { symbol: "JPM", name: "JPMorgan", ticker: "JPM", type: "us_stock" },
  { symbol: "V", name: "Visa", ticker: "V", type: "us_stock" },
  { symbol: "MA", name: "Mastercard", ticker: "MA", type: "us_stock" },
  { symbol: "GS", name: "Goldman Sachs", ticker: "GS", type: "us_stock" },
  { symbol: "BLK", name: "BlackRock", ticker: "BLK", type: "us_stock" },
  // Healthcare
  { symbol: "LLY", name: "Eli Lilly", ticker: "LLY", type: "us_stock" },
  { symbol: "UNH", name: "UnitedHealth", ticker: "UNH", type: "us_stock" },
  { symbol: "JNJ", name: "Johnson & Johnson", ticker: "JNJ", type: "us_stock" },
  { symbol: "ABBV", name: "AbbVie", ticker: "ABBV", type: "us_stock" },
  { symbol: "MRK", name: "Merck", ticker: "MRK", type: "us_stock" },
  { symbol: "TMO", name: "Thermo Fisher", ticker: "TMO", type: "us_stock" },
  { symbol: "ABT", name: "Abbott Labs", ticker: "ABT", type: "us_stock" },
  { symbol: "ISRG", name: "Intuitive Surgical", ticker: "ISRG", type: "us_stock" },
  { symbol: "GILD", name: "Gilead", ticker: "GILD", type: "us_stock" },
  // Consumer
  { symbol: "WMT", name: "Walmart", ticker: "WMT", type: "us_stock" },
  { symbol: "COST", name: "Costco", ticker: "COST", type: "us_stock" },
  { symbol: "HD", name: "Home Depot", ticker: "HD", type: "us_stock" },
  { symbol: "PG", name: "Procter & Gamble", ticker: "PG", type: "us_stock" },
  { symbol: "KO", name: "Coca-Cola", ticker: "KO", type: "us_stock" },
  { symbol: "PEP", name: "PepsiCo", ticker: "PEP", type: "us_stock" },
  { symbol: "MCD", name: "McDonald's", ticker: "MCD", type: "us_stock" },
  { symbol: "SBUX", name: "Starbucks", ticker: "SBUX", type: "us_stock" },
  { symbol: "NKE", name: "Nike", ticker: "NKE", type: "us_stock" },
  { symbol: "DIS", name: "Disney", ticker: "DIS", type: "us_stock" },
  { symbol: "BKNG", name: "Booking Holdings", ticker: "BKNG", type: "us_stock" },
  // Industrial / Others
  { symbol: "BA", name: "Boeing", ticker: "BA", type: "us_stock" },
  { symbol: "UBER", name: "Uber", ticker: "UBER", type: "us_stock" },
  { symbol: "LIN", name: "Linde", ticker: "LIN", type: "us_stock" },
  { symbol: "RTX", name: "RTX Corp", ticker: "RTX", type: "us_stock" },
  { symbol: "NEE", name: "NextEra Energy", ticker: "NEE", type: "us_stock" },

  // ── Crypto (10) ──
  { symbol: "bitcoin", name: "Bitcoin", ticker: "BTC", type: "crypto" },
  { symbol: "ethereum", name: "Ethereum", ticker: "ETH", type: "crypto" },
  { symbol: "solana", name: "Solana", ticker: "SOL", type: "crypto" },
  { symbol: "ripple", name: "XRP", ticker: "XRP", type: "crypto" },
  { symbol: "cardano", name: "Cardano", ticker: "ADA", type: "crypto" },
  { symbol: "dogecoin", name: "Dogecoin", ticker: "DOGE", type: "crypto" },
  { symbol: "avalanche-2", name: "Avalanche", ticker: "AVAX", type: "crypto" },
  { symbol: "chainlink", name: "Chainlink", ticker: "LINK", type: "crypto" },
  { symbol: "polkadot", name: "Polkadot", ticker: "DOT", type: "crypto" },
  { symbol: "polygon", name: "Polygon", ticker: "MATIC", type: "crypto" },
];

export function getAsset(symbol: string): AssetInfo | undefined {
  return ASSETS.find((a) => a.symbol === symbol);
}
