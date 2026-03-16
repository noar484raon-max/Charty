/**
 * Global News Service — NewsAPI.org 기반 글로벌 뉴스
 * 12개 지역: 미국, 캐나다, 남미, 오세아니아, 동남아, 한국, 일본, 러시아, 중국, 중동, EU, 아프리카
 * 무료 플랜: 100 req/day, 30분 서버 캐시
 */

const NEWSAPI_KEY = process.env.NEWSAPI_KEY || "";

// ─── 12개 지역 정의 ───

export interface RegionInfo {
  code: string;           // 고유 지역 코드
  name: string;           // 한국어 이름
  nameEn: string;         // 영어 이름
  lat: number;            // 지도 마커 위치
  lng: number;
  flag: string;           // 이모지
  apiCountry: string;     // NewsAPI country 파라미터 (대표 국가)
  isRegion: boolean;      // true면 지역(대륙/권역), false면 개별 국가
}

export const REGIONS: RegionInfo[] = [
  { code: "us", name: "미국", nameEn: "United States", lat: 38.9, lng: -95.0, flag: "🇺🇸", apiCountry: "us", isRegion: false },
  { code: "ca", name: "캐나다", nameEn: "Canada", lat: 56.0, lng: -96.0, flag: "🇨🇦", apiCountry: "ca", isRegion: false },
  { code: "south_america", name: "남아메리카", nameEn: "South America", lat: -15.0, lng: -55.0, flag: "🌎", apiCountry: "br", isRegion: true },
  { code: "oceania", name: "오세아니아", nameEn: "Oceania", lat: -28.0, lng: 140.0, flag: "🌏", apiCountry: "au", isRegion: true },
  { code: "southeast_asia", name: "동남아시아", nameEn: "Southeast Asia", lat: 10.0, lng: 106.0, flag: "🌏", apiCountry: "sg", isRegion: true },
  { code: "kr", name: "한국", nameEn: "South Korea", lat: 36.5, lng: 128.0, flag: "🇰🇷", apiCountry: "kr", isRegion: false },
  { code: "jp", name: "일본", nameEn: "Japan", lat: 36.0, lng: 138.0, flag: "🇯🇵", apiCountry: "jp", isRegion: false },
  { code: "ru", name: "러시아", nameEn: "Russia", lat: 60.0, lng: 90.0, flag: "🇷🇺", apiCountry: "ru", isRegion: false },
  { code: "cn", name: "중국", nameEn: "China", lat: 35.0, lng: 105.0, flag: "🇨🇳", apiCountry: "cn", isRegion: false },
  { code: "middle_east", name: "중동", nameEn: "Middle East", lat: 26.0, lng: 45.0, flag: "🕌", apiCountry: "ae", isRegion: true },
  { code: "eu", name: "EU", nameEn: "European Union", lat: 50.0, lng: 10.0, flag: "🇪🇺", apiCountry: "de", isRegion: true },
  { code: "africa", name: "아프리카", nameEn: "Africa", lat: 5.0, lng: 20.0, flag: "🌍", apiCountry: "za", isRegion: true },
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

export interface RegionNewsResult {
  region: RegionInfo;
  articles: GlobalNewsItem[];
  overallSentiment: number; // 0~100
  sentimentLabel: string;
  fetchedAt: number;
}

// backward compat
export type CountryNewsResult = RegionNewsResult;

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

  const normalized = Math.max(-1, Math.min(1, score / 3));
  const sentiment = normalized > 0.1 ? "positive" : normalized < -0.1 ? "negative" : "neutral";

  return { sentiment, score: normalized };
}

// ─── 캐시 ───

const newsCache = new Map<string, { data: RegionNewsResult; expiry: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30분

// ─── API 호출 ───

export async function fetchRegionNews(regionCode: string): Promise<RegionNewsResult | null> {
  const region = REGIONS.find((r) => r.code === regionCode);
  if (!region) return null;

  // 캐시 확인
  const cached = newsCache.get(regionCode);
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }

  if (!NEWSAPI_KEY) {
    console.warn("[GlobalNews] NEWSAPI_KEY not set, returning mock data");
    return getMockNewsResult(region);
  }

  try {
    const url = `https://newsapi.org/v2/top-headlines?country=${region.apiCountry}&category=business&pageSize=15&apiKey=${NEWSAPI_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!res.ok) {
      console.error(`[GlobalNews] API error ${res.status} for ${regionCode}`);
      if (res.status === 429) {
        return cached?.data || getMockNewsResult(region);
      }
      return getMockNewsResult(region);
    }

    const json = await res.json();
    const rawArticles = json.articles || [];

    const articles: GlobalNewsItem[] = rawArticles
      .filter((a: any) => a.title && a.title !== "[Removed]")
      .slice(0, 15)
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

    const avgScore = articles.length > 0
      ? articles.reduce((sum, a) => sum + a.sentimentScore, 0) / articles.length
      : 0;
    const overallSentiment = Math.round((avgScore + 1) * 50);

    const label = overallSentiment >= 65 ? "긍정적"
      : overallSentiment >= 55 ? "약간 긍정"
      : overallSentiment >= 45 ? "중립"
      : overallSentiment >= 35 ? "약간 부정"
      : "부정적";

    const result: RegionNewsResult = {
      region,
      articles,
      overallSentiment,
      sentimentLabel: label,
      fetchedAt: Date.now(),
    };

    newsCache.set(regionCode, { data: result, expiry: Date.now() + CACHE_TTL });
    return result;
  } catch (e) {
    console.error(`[GlobalNews] Fetch error for ${regionCode}:`, e);
    return cached?.data || getMockNewsResult(region);
  }
}

// backward compat
export async function fetchCountryNews(code: string): Promise<RegionNewsResult | null> {
  return fetchRegionNews(code);
}

// ─── 모든 지역 요약 (지도 마커용) ───

export interface CountrySummary {
  code: string;
  name: string;
  nameEn: string;
  lat: number;
  lng: number;
  flag: string;
  sentiment: number;
  label: string;
  articleCount: number;
}

const summaryCache: { data: CountrySummary[] | null; expiry: number } = { data: null, expiry: 0 };

export async function fetchAllCountrySummaries(): Promise<CountrySummary[]> {
  if (summaryCache.data && Date.now() < summaryCache.expiry) {
    return summaryCache.data;
  }

  // 모든 12개 지역 API 호출 (캐시 덕분에 실제 API 호출은 최소화)
  const results: CountrySummary[] = [];

  for (const region of REGIONS) {
    const news = await fetchRegionNews(region.code);
    if (news) {
      results.push({
        code: news.region.code,
        name: news.region.name,
        nameEn: news.region.nameEn,
        lat: news.region.lat,
        lng: news.region.lng,
        flag: news.region.flag,
        sentiment: news.overallSentiment,
        label: news.sentimentLabel,
        articleCount: news.articles.length,
      });
    }
  }

  summaryCache.data = results;
  summaryCache.expiry = Date.now() + CACHE_TTL;
  return results;
}

// ─── Mock Data ───

function getMockNewsResult(region: RegionInfo): RegionNewsResult {
  const mockArticles: GlobalNewsItem[] = [
    {
      title: `${region.nameEn} markets show mixed signals amid global uncertainty`,
      description: `Investors in ${region.nameEn} are watching key economic indicators closely as global markets navigate uncertain terrain.`,
      url: "#",
      source: "Mock News",
      publishedAt: new Date().toISOString(),
      imageUrl: null,
      sentiment: "neutral",
      sentimentScore: 0,
    },
    {
      title: `${region.nameEn} economic outlook remains cautiously optimistic`,
      description: `Analysts maintain a positive but measured view on ${region.nameEn}'s economic prospects for the coming quarter.`,
      url: "#",
      source: "Mock Finance",
      publishedAt: new Date().toISOString(),
      imageUrl: null,
      sentiment: "positive",
      sentimentScore: 0.3,
    },
  ];

  return {
    region,
    articles: mockArticles,
    overallSentiment: 55,
    sentimentLabel: "약간 긍정",
    fetchedAt: Date.now(),
  };
}
