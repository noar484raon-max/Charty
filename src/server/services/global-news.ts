/**
 * Global News Service — NewsAPI.org 기반 글로벌 뉴스
 * 무료 플랜: 100 req/day, 국가별 top headlines 지원
 */

const NEWSAPI_KEY = process.env.NEWSAPI_KEY || "";

// ─── 지원 국가 목록 ───

export interface CountryInfo {
  code: string;       // ISO 2-letter (NewsAPI country param)
  name: string;       // 한국어 이름
  nameEn: string;     // 영어 이름
  lat: number;
  lng: number;
  flag: string;       // 이모지 국기
}

export const COUNTRIES: CountryInfo[] = [
  { code: "us", name: "미국", nameEn: "United States", lat: 38.9, lng: -77.0, flag: "🇺🇸" },
  { code: "gb", name: "영국", nameEn: "United Kingdom", lat: 51.5, lng: -0.1, flag: "🇬🇧" },
  { code: "de", name: "독일", nameEn: "Germany", lat: 52.5, lng: 13.4, flag: "🇩🇪" },
  { code: "fr", name: "프랑스", nameEn: "France", lat: 48.9, lng: 2.3, flag: "🇫🇷" },
  { code: "jp", name: "일본", nameEn: "Japan", lat: 35.7, lng: 139.7, flag: "🇯🇵" },
  { code: "kr", name: "한국", nameEn: "South Korea", lat: 37.6, lng: 127.0, flag: "🇰🇷" },
  { code: "cn", name: "중국", nameEn: "China", lat: 39.9, lng: 116.4, flag: "🇨🇳" },
  { code: "in", name: "인도", nameEn: "India", lat: 28.6, lng: 77.2, flag: "🇮🇳" },
  { code: "au", name: "호주", nameEn: "Australia", lat: -33.9, lng: 151.2, flag: "🇦🇺" },
  { code: "ca", name: "캐나다", nameEn: "Canada", lat: 45.4, lng: -75.7, flag: "🇨🇦" },
  { code: "br", name: "브라질", nameEn: "Brazil", lat: -15.8, lng: -47.9, flag: "🇧🇷" },
  { code: "ru", name: "러시아", nameEn: "Russia", lat: 55.8, lng: 37.6, flag: "🇷🇺" },
  { code: "sa", name: "사우디", nameEn: "Saudi Arabia", lat: 24.7, lng: 46.7, flag: "🇸🇦" },
  { code: "il", name: "이스라엘", nameEn: "Israel", lat: 31.8, lng: 35.2, flag: "🇮🇱" },
  { code: "tw", name: "대만", nameEn: "Taiwan", lat: 25.0, lng: 121.5, flag: "🇹🇼" },
  { code: "sg", name: "싱가포르", nameEn: "Singapore", lat: 1.3, lng: 103.8, flag: "🇸🇬" },
  { code: "mx", name: "멕시코", nameEn: "Mexico", lat: 19.4, lng: -99.1, flag: "🇲🇽" },
  { code: "za", name: "남아공", nameEn: "South Africa", lat: -33.9, lng: 18.4, flag: "🇿🇦" },
];

// ─── 뉴스 아이템 타입 ───

export interface GlobalNewsItem {
  title: string;
  description: string | null;
  url: string;
  source: string;
  publishedAt: string;
  imageUrl: string | null;
  sentiment: "positive" | "negative" | "neutral";
  sentimentScore: number; // -1 ~ 1
}

export interface CountryNewsResult {
  country: CountryInfo;
  articles: GlobalNewsItem[];
  overallSentiment: number; // 0~100
  sentimentLabel: string;
  fetchedAt: number;
}

// ─── 감성 분석 (키워드 기반) ───

const POSITIVE_KEYWORDS = [
  "surge", "soar", "rally", "gain", "rise", "growth", "boom", "record high",
  "optimism", "recovery", "bullish", "profit", "beat", "upgrade", "strong",
  "peace", "deal", "agreement", "cooperat", "stability", "breakthrough",
  "expand", "invest", "innovation", "success", "prosper",
];

const NEGATIVE_KEYWORDS = [
  "crash", "plunge", "fall", "decline", "drop", "loss", "recession", "crisis",
  "war", "conflict", "attack", "bomb", "missile", "sanction", "threat",
  "inflation", "bankrupt", "default", "fraud", "scandal", "fear", "panic",
  "collapse", "layoff", "shutdown", "strike", "protest", "tension",
  "downturn", "bearish", "sell-off", "risk", "warn", "danger",
];

function analyzeNewsSentiment(title: string, desc: string | null): { sentiment: "positive" | "negative" | "neutral"; score: number } {
  const text = `${title} ${desc || ""}`.toLowerCase();
  let score = 0;

  for (const kw of POSITIVE_KEYWORDS) {
    if (text.includes(kw)) score += 1;
  }
  for (const kw of NEGATIVE_KEYWORDS) {
    if (text.includes(kw)) score -= 1;
  }

  // Clamp to -1 ~ 1
  const normalized = Math.max(-1, Math.min(1, score / 3));
  const sentiment = normalized > 0.1 ? "positive" : normalized < -0.1 ? "negative" : "neutral";

  return { sentiment, score: normalized };
}

// ─── 캐시 ───

const newsCache = new Map<string, { data: CountryNewsResult; expiry: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30분 (무료 플랜 100 req/day 절약)

// ─── API 호출 ───

export async function fetchCountryNews(countryCode: string): Promise<CountryNewsResult | null> {
  const country = COUNTRIES.find((c) => c.code === countryCode);
  if (!country) return null;

  // 캐시 확인
  const cached = newsCache.get(countryCode);
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }

  if (!NEWSAPI_KEY) {
    console.warn("[GlobalNews] NEWSAPI_KEY not set, returning mock data");
    return getMockNewsResult(country);
  }

  try {
    const url = `https://newsapi.org/v2/top-headlines?country=${countryCode}&category=business&pageSize=10&apiKey=${NEWSAPI_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!res.ok) {
      console.error(`[GlobalNews] API error ${res.status} for ${countryCode}`);
      // API 실패 시 general 카테고리로 fallback
      if (res.status === 429) {
        console.warn("[GlobalNews] Rate limited, returning cached or mock");
        return cached?.data || getMockNewsResult(country);
      }
      return getMockNewsResult(country);
    }

    const json = await res.json();
    const rawArticles = json.articles || [];

    const articles: GlobalNewsItem[] = rawArticles
      .filter((a: any) => a.title && a.title !== "[Removed]")
      .slice(0, 10)
      .map((a: any) => {
        const { sentiment, score } = analyzeNewsSentiment(a.title, a.description);
        return {
          title: a.title,
          description: a.description,
          url: a.url,
          source: a.source?.name || "Unknown",
          publishedAt: a.publishedAt,
          imageUrl: a.urlToImage,
          sentiment,
          sentimentScore: score,
        };
      });

    // 전체 감성 점수 계산 (0~100)
    const avgScore = articles.length > 0
      ? articles.reduce((sum, a) => sum + a.sentimentScore, 0) / articles.length
      : 0;
    const overallSentiment = Math.round((avgScore + 1) * 50); // -1~1 → 0~100

    const label = overallSentiment >= 65 ? "긍정적"
      : overallSentiment >= 55 ? "약간 긍정"
      : overallSentiment >= 45 ? "중립"
      : overallSentiment >= 35 ? "약간 부정"
      : "부정적";

    const result: CountryNewsResult = {
      country,
      articles,
      overallSentiment,
      sentimentLabel: label,
      fetchedAt: Date.now(),
    };

    newsCache.set(countryCode, { data: result, expiry: Date.now() + CACHE_TTL });
    return result;
  } catch (e) {
    console.error(`[GlobalNews] Fetch error for ${countryCode}:`, e);
    return cached?.data || getMockNewsResult(country);
  }
}

// ─── 모든 국가 요약 (지구본 색상용) ───

export interface CountrySummary {
  code: string;
  name: string;
  nameEn: string;
  lat: number;
  lng: number;
  flag: string;
  sentiment: number; // 0~100
  label: string;
  articleCount: number;
}

const summaryCache: { data: CountrySummary[] | null; expiry: number } = { data: null, expiry: 0 };

export async function fetchAllCountrySummaries(): Promise<CountrySummary[]> {
  if (summaryCache.data && Date.now() < summaryCache.expiry) {
    return summaryCache.data;
  }

  // 주요 국가만 실제 API 호출 (API 한도 절약)
  const primaryCountries = ["us", "gb", "jp", "kr", "cn", "de", "fr", "in"];
  const results: CountrySummary[] = [];

  for (const code of primaryCountries) {
    const news = await fetchCountryNews(code);
    if (news) {
      results.push({
        code: news.country.code,
        name: news.country.name,
        nameEn: news.country.nameEn,
        lat: news.country.lat,
        lng: news.country.lng,
        flag: news.country.flag,
        sentiment: news.overallSentiment,
        label: news.sentimentLabel,
        articleCount: news.articles.length,
      });
    }
  }

  // 나머지 국가는 기본값
  for (const c of COUNTRIES) {
    if (!primaryCountries.includes(c.code)) {
      results.push({
        code: c.code,
        name: c.name,
        nameEn: c.nameEn,
        lat: c.lat,
        lng: c.lng,
        flag: c.flag,
        sentiment: 50,
        label: "중립",
        articleCount: 0,
      });
    }
  }

  summaryCache.data = results;
  summaryCache.expiry = Date.now() + CACHE_TTL;
  return results;
}

// ─── Mock Data (API키 없을 때) ───

function getMockNewsResult(country: CountryInfo): CountryNewsResult {
  const mockArticles: GlobalNewsItem[] = [
    {
      title: `${country.nameEn} markets show mixed signals amid global uncertainty`,
      description: `Investors in ${country.nameEn} are watching key economic indicators closely as global markets navigate uncertain terrain.`,
      url: "#",
      source: "Mock News",
      publishedAt: new Date().toISOString(),
      imageUrl: null,
      sentiment: "neutral",
      sentimentScore: 0,
    },
    {
      title: `${country.nameEn} economic outlook remains cautiously optimistic`,
      description: `Analysts maintain a positive but measured view on ${country.nameEn}'s economic prospects for the coming quarter.`,
      url: "#",
      source: "Mock Finance",
      publishedAt: new Date().toISOString(),
      imageUrl: null,
      sentiment: "positive",
      sentimentScore: 0.3,
    },
  ];

  return {
    country,
    articles: mockArticles,
    overallSentiment: 55,
    sentimentLabel: "약간 긍정",
    fetchedAt: Date.now(),
  };
}
