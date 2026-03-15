// 대략적 대륙 영역 [latMin, latMax, lngMin, lngMax]
const LAND: number[][] = [
  // 북미
  [30,50,-130,-65],[50,72,-168,-55],[25,30,-115,-80],[60,75,-168,-140],
  [15,25,-105,-80],[55,72,-170,-130],
  // 중미
  [7,18,-92,-60],[10,22,-88,-75],
  // 남미
  [-55,12,-82,-34],[-20,-5,-80,-45],[-35,5,-70,-40],[-15,5,-78,-50],
  // 유럽
  [36,60,-10,30],[55,71,10,40],[50,59,-8,2],[56,71,5,30],
  [37,46,7,18],[36,44,-10,3],[42,48,0,10],
  // 아프리카
  [-35,37,-18,52],[0,15,30,52],[-25,10,25,42],
  // 러시아/중앙아시아
  [50,75,40,180],[42,55,40,80],[55,70,30,50],
  // 중동
  [12,42,25,65],[15,38,35,55],
  // 남아시아 (인도/스리랑카)
  [8,35,68,97],[6,10,79,82],
  // 동남아
  [-8,20,95,140],[-5,8,100,120],
  // 동아시아
  [20,55,100,145],[30,46,125,145],[33,43,124,130],
  [22,28,108,120],
  // 호주
  [-40,-11,113,154],[-38,-30,135,150],
  // 뉴질랜드
  [-47,-34,166,178],
  // 그린란드
  [60,83,-73,-12],
  // 마다가스카르
  [-26,-12,43,50],
  // 알래스카
  [55,72,-170,-130],
  // 캐나다 북극
  [65,83,-125,-60],
  // 멕시코
  [15,32,-117,-87],
  // 아이슬란드
  [63,67,-24,-13],
];

function isLand(lat: number, lng: number): boolean {
  return LAND.some(([la1, la2, lo1, lo2]) =>
    lat >= la1 && lat <= la2 && lng >= lo1 && lng <= lo2
  );
}

// Mercator 투영
function project(lat: number, lng: number): [number, number] {
  const x = ((lng + 180) / 360) * 1000;
  const latRad = (lat * Math.PI) / 180;
  const mercY = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = 500 - (mercY / Math.PI) * 400;
  return [x, y];
}

// 사전 계산된 육지 도트 좌표
export function generateLandDots(): { x: number; y: number }[] {
  const dots: { x: number; y: number }[] = [];
  const step = 3;

  for (let lat = -65; lat <= 80; lat += step) {
    const lngStep = step / Math.max(0.4, Math.cos((lat * Math.PI) / 180));
    for (let lng = -180; lng < 180; lng += lngStep) {
      if (isLand(lat, lng)) {
        const [x, y] = project(lat, lng);
        if (x > 5 && x < 995 && y > 10 && y < 690) {
          dots.push({ x, y });
        }
      }
    }
  }

  return dots;
}

// 캐싱
let _cachedDots: { x: number; y: number }[] | null = null;
export function getLandDots(): { x: number; y: number }[] {
  if (!_cachedDots) _cachedDots = generateLandDots();
  return _cachedDots;
}
