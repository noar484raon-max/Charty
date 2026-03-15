// ─── 뉴스 기반 감성 분석 서비스 ───
// Finnhub 무료 뉴스 API + 규칙 기반 키워드 감성 분석

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";

// ─── 타입 ───

export interface NewsItem {
  id: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number; // unix timestamp
  image: string;
  sentiment: "positive" | "negative" | "neutral";
  score: number; // -1 ~ +1
}

export interface SentimentResult {
  symbol: string;
  overallScore: number; // 0 ~ 100 (50 = 중립)
  overallLabel: "매우 긍정" | "긍정" | "중립" | "부정" | "매우 부정";
  positive: number; // 긍정 뉴스 수
  negative: number; // 부정 뉴스 수
  neutral: number;  // 중립 뉴스 수
  total: number;
  news: NewsItem[]; // 최근 뉴스 (최대 10개)
  updatedAt: number;
}

// ─── 캐시 ───

type CacheEntry = { data: SentimentResult; ts: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 15 * 60_000; // 15분

// ─── 감성 분석 키워드 사전 ───

const POSITIVE_KEYWORDS = [
  // 실적/성장
  "beat", "beats", "exceeded", "surpass", "record", "all-time high", "ath",
  "growth", "growing", "surge", "surging", "soar", "soaring", "rally", "rallies",
  "profit", "profitable", "earnings beat", "revenue beat", "strong earnings",
  "outperform", "outperforms", "upgrade", "upgraded", "buy rating",
  // 경영/전략
  "partnership", "deal", "acquisition", "merger", "expand", "expansion",
  "launch", "launched", "innovation", "breakthrough", "patent",
  "dividend", "buyback", "share repurchase",
  // 시장 반응
  "bullish", "optimistic", "confidence", "positive", "upbeat",
  "momentum", "breakout", "recovery", "rebound", "bounce",
  "upside", "opportunity", "catalyst", "tailwind",
  // AI/기술
  "ai revolution", "artificial intelligence", "machine learning",
  "game changer", "disruptive", "market leader",
];

const NEGATIVE_KEYWORDS = [
  // 실적/하락
  "miss", "missed", "decline", "declining", "drop", "drops", "fell", "fall",
  "loss", "losses", "disappointing", "weak", "weaker", "below expectations",
  "underperform", "downgrade", "downgraded", "sell rating",
  "revenue miss", "earnings miss", "profit warning",
  // 리스크
  "lawsuit", "investigation", "fraud", "scandal", "controversy",
  "layoff", "layoffs", "restructuring", "bankruptcy", "default",
  "recall", "fine", "fined", "penalty", "sanction", "sanctions",
  "debt", "overvalued",
  // 시장 반응
  "bearish", "pessimistic", "fear", "panic", "crash", "plunge", "plunging",
  "selloff", "sell-off", "correction", "downturn", "recession",
  "headwind", "risk", "threat", "warning", "concern", "concerns",
  "volatile", "volatility", "uncertainty",
  // 규제
  "regulation", "antitrust", "ban", "banned", "restrict", "restriction",
];

// 강한 키워드는 가중치 2배
const STRONG_POSITIVE = [
  "beat", "beats", "record", "all-time high", "upgrade", "breakthrough",
  "bullish", "soar", "soaring", "surge", "surging",
];

const STRONG_NEGATIVE = [
  "crash", "plunge", "fraud", "scandal", "bankruptcy", "panic",
  "selloff", "sell-off", "downgrade", "recall",
];

// ─── 단일 뉴스 감성 분석 ───

function analyzeSentiment(headline: string, summary: string): { sentiment: "positive" | "negative" | "neutral"; score: number } {
  const text = `${headline} ${summary}`.toLowerCase();

  let score = 0;

  for (const kw of POSITIVE_KEYWORDS) {
    if (text.includes(kw)) {
      score += STRONG_POSITIVE.includes(kw) ? 2 : 1;
    }
  }

  for (const kw of NEGATIVE_KEYWORDS) {
    if (text.includes(kw)) {
      score -= STRONG_NEGATIVE.includes(kw) ? 2 : 1;
    }
  }

  // 정규화: -10 ~ +10 범위를 -1 ~ +1로
  const normalized = Math.max(-1, Math.min(1, score / 5));

  let sentiment: "positive" | "negative" | "neutral";
  if (normalized > 0.15) sentiment = "positive";
  else if (normalized < -0.15) sentiment = "negative";
  else sentiment = "neutral";

  return { sentiment, score: normalized };
}

// ─── 종합 점수 → 라벨 ───

function getOverallLabel(score: number): SentimentResult["overallLabel"] {
  if (score >= 70) return "매우 긍정";
  if (score >= 55) return "긍정";
  if (score >= 45) return "중립";
  if (score >= 30) return "부정";
  return "매우 부정";
}

// ─── Finnhub 뉴스 가져오기 ───

async function fetchFinnhubNews(symbol: string): Promise<any[]> {
  if (!FINNHUB_KEY) {
    console.warn("[Sentiment] FINNHUB_API_KEY not set");
    return [];
  }

  // 최근 7일간의 뉴스
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fromStr = from.toISOString().split("T")[0];
  const toStr = to.toISOString().split("T")[0];

  const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${fromStr}&to=${toStr}&token=${FINNHUB_KEY}`;

  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (r.status === 429) {
      console.warn("[Sentiment] Finnhub rate limited");
      return [];
    }

    if (!r.ok) {
      console.warn(`[Sentiment] Finnhub news HTTP ${r.status}`);
      return [];
    }

    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("[Sentiment] Finnhub news error:", e);
    return [];
  }
}

// ─── 메인 함수 ───

export async function fetchSentiment(symbol: string): Promise<SentimentResult> {
  const cacheKey = `sentiment_${symbol}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const rawNews = await fetchFinnhubNews(symbol);

  // 최신순 정렬, 최대 30개 분석
  const sorted = rawNews
    .sort((a: any, b: any) => (b.datetime || 0) - (a.datetime || 0))
    .slice(0, 30);

  // 감성 분석 적용
  const analyzedNews: NewsItem[] = sorted.map((n: any) => {
    const { sentiment, score } = analyzeSentiment(n.headline || "", n.summary || "");
    return {
      id: n.id || 0,
      headline: n.headline || "",
      summary: n.summary || "",
      source: n.source || "",
      url: n.url || "",
      datetime: n.datetime || 0,
      image: n.image || "",
      sentiment,
      score,
    };
  });

  // 통계 계산
  const positive = analyzedNews.filter((n) => n.sentiment === "positive").length;
  const negative = analyzedNews.filter((n) => n.sentiment === "negative").length;
  const neutral = analyzedNews.filter((n) => n.sentiment === "neutral").length;
  const total = analyzedNews.length;

  // 종합 점수: 각 뉴스의 score 평균 → 0~100 변환
  let overallScore = 50; // 뉴스 없으면 중립
  if (total > 0) {
    const avgScore = analyzedNews.reduce((sum, n) => sum + n.score, 0) / total;
    // -1~+1을 0~100으로 변환
    overallScore = Math.round(Math.max(0, Math.min(100, (avgScore + 1) * 50)));
  }

  const result: SentimentResult = {
    symbol,
    overallScore,
    overallLabel: getOverallLabel(overallScore),
    positive,
    negative,
    neutral,
    total,
    news: analyzedNews.slice(0, 10), // UI에는 최대 10개만
    updatedAt: Date.now(),
  };

  // 캐시 저장
  cache.set(cacheKey, { data: result, ts: Date.now() });
  if (cache.size > 100) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }

  console.log(`[Sentiment] ${symbol}: score=${overallScore} (${result.overallLabel}), +${positive} -${negative} =${neutral}, total=${total}`);

  return result;
}
