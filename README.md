# Charty (Next.js + Tailwind + Chart.js)

## What’s implemented (so far)

- CoinGecko 무료 API로 코인 가격 차트 표시
- 차트의 특정 시점(포인트) 클릭 → 메모 입력 모달 표시
- 메모는 현재 로컬 상태에 임시 저장 (Supabase 연결은 다음 단계)

## Requirements

- Node.js 20+ (권장: 20 LTS 또는 22 LTS)

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Notes

- CoinGecko 호출은 `src/app/api/coingecko/market-chart/route.ts`에서 프록시합니다.
- 다음 단계에서 Supabase 저장/공개/커뮤니티 피드(좋아요/댓글)를 붙이면 됩니다.

