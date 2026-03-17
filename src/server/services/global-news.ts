/**
 * Global News Service — GNews API (gnews.io) 기반 글로벌 뉴스
 * 무료 플랜: 100 req/day, 프로덕션 서버에서 작동
 * 12개 지역, 30분 서버 캐시
 *
 * GNews API 문서: https://gnews.io/docs/v4
 * - top-headlines: country, category, lang, max 파라미터
 * - search: q, country, lang 파라미터
 */

const GNEWS_KEY = process.env.GNEWS_API_KEY || process.env.NEWSAPI_KEY || "";

// ─── 12개 지역 정의 ───

export interface RegionInfo {
  code: string;
  name: string;
  nameEn: string;
  lat: number;
  lng: number;
  flag: string;
  apiCountry: string;   // GNews country 파라미터 (ISO 2-letter)
  apiLang: string;       // GNews lang 파라미터
  isRegion: boolean;
}

export const REGIONS: RegionInfo[] = [
  { code: "us", name: "미국", nameEn: "United States", lat: 38.9, lng: -95.0, flag: "🇺🇸", apiCountry: "us", apiLang: "en", isRegion: false },
  { code: "ca", name: "캐나다", nameEn: "Canada", lat: 56.0, lng: -96.0, flag: "🇨🇦", apiCountry: "ca", apiLang: "en", isRegion: false },
  { code: "south_america", name: "남아메리카", nameEn: "South America", lat: -15.0, lng: -55.0, flag: "🌎", apiCountry: "br", apiLang: "pt", isRegion: true },
  { code: "oceania", name: "오세아니아", nameEn: "Oceania", lat: -28.0, lng: 140.0, flag: "🌏", apiCountry: "au", apiLang: "en", isRegion: true },
  { code: "southeast_asia", name: "동남아시아", nameEn: "Southeast Asia", lat: 10.0, lng: 106.0, flag: "🌏", apiCountry: "sg", apiLang: "en", isRegion: true },
  { code: "kr", name: "한국", nameEn: "South Korea", lat: 36.5, lng: 128.0, flag: "🇰🇷", apiCountry: "kr", apiLang: "ko", isRegion: false },
  { code: "jp", name: "일본", nameEn: "Japan", lat: 36.0, lng: 138.0, flag: "🇯🇵", apiCountry: "jp", apiLang: "ja", isRegion: false },
  { code: "ru", name: "러시아", nameEn: "Russia", lat: 60.0, lng: 90.0, flag: "🇷🇺", apiCountry: "ru", apiLang: "ru", isRegion: false },
  { code: "cn", name: "중국", nameEn: "China", lat: 35.0, lng: 105.0, flag: "🇨🇳", apiCountry: "cn", apiLang: "zh", isRegion: false },
  { code: "middle_east", name: "중동", nameEn: "Middle East", lat: 26.0, lng: 45.0, flag: "🕌", apiCountry: "ae", apiLang: "ar", isRegion: true },
  { code: "eu", name: "EU", nameEn: "European Union", lat: 50.0, lng: 10.0, flag: "🇪🇺", apiCountry: "de", apiLang: "de", isRegion: true },
  { code: "africa", name: "아프리카", nameEn: "Africa", lat: 5.0, lng: 20.0, flag: "🌍", apiCountry: "za", apiLang: "en", isRegion: true },
];

// ─── 타입 ───

export interface GlobalNewsItem {
  title: string;
  description: string | null;
  url: string;
  source: string;
  publishedAt: string;
  imageUrl: string | null;
  sentiment: "positive" | "negative" | "neutral";
  sentimentScore: number;
}

export interface RegionNewsResult {
  region: RegionInfo;
  articles: GlobalNewsItem[];
  overallSentiment: number;
  sentimentLabel: string;
  fetchedAt: number;
}

export type CountryNewsResult = RegionNewsResult;

// ─── 감성 분석 ───

const POSITIVE_KEYWORDS = [
  "surge", "soar", "rally", "gain", "rise", "growth", "boom", "record high",
  "optimism", "recovery", "bullish", "profit", "beat", "upgrade", "strong",
  "peace", "deal", "agreement", "cooperat", "stability", "breakthrough",
  "expand", "invest", "innovation", "success", "prosper",
  // 한국어
  "상승", "호조", "성장", "돌파", "흑자", "수익", "회복", "강세", "낙관",
];

const NEGATIVE_KEYWORDS = [
  "crash", "plunge", "fall", "decline", "drop", "loss", "recession", "crisis",
  "war", "conflict", "attack", "bomb", "missile", "sanction", "threat",
  "inflation", "bankrupt", "default", "fraud", "scandal", "fear", "panic",
  "collapse", "layoff", "shutdown", "strike", "protest", "tension",
  "downturn", "bearish", "sell-off", "risk", "warn", "danger",
  // 한국어
  "하락", "폭락", "위기", "전쟁", "갈등", "인플레", "파산", "적자", "공포", "불안",
];

function analyzeNewsSentiment(title: string, desc: string | null) {
  const text = `${title} ${desc || ""}`.toLowerCase();
  let score = 0;
  for (const kw of POSITIVE_KEYWORDS) if (text.includes(kw)) score += 1;
  for (const kw of NEGATIVE_KEYWORDS) if (text.includes(kw)) score -= 1;
  const normalized = Math.max(-1, Math.min(1, score / 3));
  const sentiment: "positive" | "negative" | "neutral" =
    normalized > 0.1 ? "positive" : normalized < -0.1 ? "negative" : "neutral";
  return { sentiment, score: normalized };
}

// ─── 캐시 ───

const newsCache = new Map<string, { data: RegionNewsResult; expiry: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30분

// ─── GNews API 호출 ───

async function callGNewsAPI(url: string): Promise<any[] | null> {
  try {
    console.log(`[GNews] Calling: ${url.replace(/apikey=[^&]+/, "apikey=***")}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[GNews] HTTP ${res.status}: ${body.slice(0, 300)}`);
      return null;
    }

    const json = await res.json();
    console.log(`[GNews] Got ${json.totalArticles || 0} total, ${(json.articles || []).length} returned`);
    return json.articles || [];
  } catch (e) {
    console.error(`[GNews] Fetch error:`, e);
    return null;
  }
}

function parseArticles(rawArticles: any[]): GlobalNewsItem[] {
  return rawArticles
    .filter((a: any) => a.title)
    .slice(0, 10)
    .map((a: any) => {
      const { sentiment, score } = analyzeNewsSentiment(a.title, a.description);
      return {
        title: a.title,
        description: a.description || null,
        url: a.url,
        source: a.source?.name || "Unknown",
        publishedAt: a.publishedAt,
        imageUrl: a.image || null,
        sentiment,
        sentimentScore: score,
      };
    });
}

function buildResult(region: RegionInfo, articles: GlobalNewsItem[]): RegionNewsResult {
  const avgScore = articles.length > 0
    ? articles.reduce((sum, a) => sum + a.sentimentScore, 0) / articles.length
    : 0;
  const overallSentiment = Math.round((avgScore + 1) * 50);
  const label = overallSentiment >= 65 ? "긍정적"
    : overallSentiment >= 55 ? "약간 긍정"
    : overallSentiment >= 45 ? "중립"
    : overallSentiment >= 35 ? "약간 부정"
    : "부정적";

  return { region, articles, overallSentiment, sentimentLabel: label, fetchedAt: Date.now() };
}

// ─── 개별 지역 뉴스 (상세 보기) ───

export async function fetchRegionNews(regionCode: string): Promise<RegionNewsResult | null> {
  const region = REGIONS.find((r) => r.code === regionCode);
  if (!region) return null;

  const cached = newsCache.get(regionCode);
  if (cached && Date.now() < cached.expiry) return cached.data;

  if (!GNEWS_KEY) {
    console.warn("[GNews] API key not set (GNEWS_API_KEY)");
    return getMockNewsResult(region);
  }

  // 1단계: business 카테고리 top-headlines
  console.log(`[GNews] Fetching ${regionCode} (${region.apiCountry}) - business`);
  let raw = await callGNewsAPI(
    `https://gnews.io/api/v4/top-headlines?country=${region.apiCountry}&category=business&max=10&apikey=${GNEWS_KEY}`
  );

  // 2단계: 없으면 일반 top-headlines
  if (!raw || raw.length === 0) {
    console.log(`[GNews] ${regionCode}: no business, trying general`);
    raw = await callGNewsAPI(
      `https://gnews.io/api/v4/top-headlines?country=${region.apiCountry}&max=10&apikey=${GNEWS_KEY}`
    );
  }

  // 3단계: 그래도 없으면 search (권역)
  if ((!raw || raw.length === 0) && region.isRegion) {
    console.log(`[GNews] ${regionCode}: trying search`);
    const kw = encodeURIComponent(region.nameEn + " economy");
    raw = await callGNewsAPI(
      `https://gnews.io/api/v4/search?q=${kw}&max=10&apikey=${GNEWS_KEY}`
    );
  }

  if (!raw || raw.length === 0) {
    console.log(`[GNews] ${regionCode}: all attempts empty, using mock`);
    const result = getMockNewsResult(region);
    newsCache.set(regionCode, { data: result, expiry: Date.now() + CACHE_TTL });
    return result;
  }

  const articles = parseArticles(raw);
  const result = buildResult(region, articles);
  newsCache.set(regionCode, { data: result, expiry: Date.now() + CACHE_TTL });
  return result;
}

export async function fetchCountryNews(code: string): Promise<RegionNewsResult | null> {
  return fetchRegionNews(code);
}

// ─── 빠른 호출 (요약용) ───

async function fetchRegionQuick(region: RegionInfo): Promise<RegionNewsResult> {
  if (!GNEWS_KEY) return getMockNewsResult(region);

  const cached = newsCache.get(region.code);
  if (cached && Date.now() < cached.expiry) return cached.data;

  // top-headlines (카테고리 없이, 1회만)
  const raw = await callGNewsAPI(
    `https://gnews.io/api/v4/top-headlines?country=${region.apiCountry}&max=10&apikey=${GNEWS_KEY}`
  );

  if (!raw || raw.length === 0) return getMockNewsResult(region);

  const articles = parseArticles(raw);
  const result = buildResult(region, articles);
  newsCache.set(region.code, { data: result, expiry: Date.now() + CACHE_TTL });
  return result;
}

// ─── 모든 지역 요약 ───

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

  // 주요 6개 지역 병렬 호출 (총 6 req)
  const primaryCodes = ["us", "kr", "jp", "cn", "eu", "middle_east"];
  const primaryRegions = primaryCodes.map((c) => REGIONS.find((r) => r.code === c)!);

  const newsResults = await Promise.all(
    primaryRegions.map((region) => fetchRegionQuick(region))
  );

  const results: CountrySummary[] = [];

  for (const news of newsResults) {
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

  // 나머지 지역: 기본값 (클릭 시 로드)
  for (const region of REGIONS) {
    if (!primaryCodes.includes(region.code)) {
      results.push({
        code: region.code,
        name: region.name,
        nameEn: region.nameEn,
        lat: region.lat,
        lng: region.lng,
        flag: region.flag,
        sentiment: 50,
        label: "뉴스 로드 대기",
        articleCount: 0,
      });
    }
  }

  summaryCache.data = results;
  summaryCache.expiry = Date.now() + CACHE_TTL;
  return results;
}

// ─── Mock Data ───

function getMockNewsResult(region: RegionInfo): RegionNewsResult {
  return {
    region,
    articles: [
      {
        title: `${region.nameEn} markets show mixed signals amid global uncertainty`,
        description: `Investors in ${region.nameEn} are watching key indicators closely.`,
        url: "#",
        source: "Mock News",
        publishedAt: new Date().toISOString(),
        imageUrl: null,
        sentiment: "neutral",
        sentimentScore: 0,
      },
      {
        title: `${region.nameEn} economic outlook remains cautiously optimistic`,
        description: `Analysts maintain a positive view on ${region.nameEn}'s prospects.`,
        url: "#",
        source: "Mock Finance",
        publishedAt: new Date().toISOString(),
        imageUrl: null,
        sentiment: "positive",
        sentimentScore: 0.3,
      },
    ],
    overallSentiment: 55,
    sentimentLabel: "약간 긍정",
    fetchedAt: Date.now(),
  };
}
