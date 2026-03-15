/**
 * Node.js 스크립트: 지구 텍스처를 Base64 데이터로 생성
 * Canvas 없이 PPM 포맷으로 생성 후 변환
 *
 * 실행: node scripts/generate-earth-texture.mjs
 * 출력: public/earth-texture.js (base64 인코딩된 PNG data URL)
 */

import { writeFileSync, mkdirSync } from "fs";

const W = 512;
const H = 256;

// 대략적 대륙 영역 [latMin, latMax, lngMin, lngMax]
const LAND = [
  // 북미
  [25,50,-130,-65],[50,72,-168,-55],[15,30,-110,-80],[60,75,-168,-140],
  // 중미
  [7,20,-92,-60],
  // 남미
  [-55,12,-82,-34],[-20,-5,-80,-45],
  // 유럽
  [36,60,-10,30],[55,71,10,40],[50,59,-8,2],
  // 스칸디나비아
  [56,71,5,30],
  // 이탈리아/이베리아
  [37,46,7,18],[36,44,-10,3],
  // 아프리카
  [-35,37,-18,52],[0,15,30,52],
  // 러시아
  [50,75,40,180],[42,55,40,80],
  // 중동
  [12,42,25,65],
  // 남아시아
  [8,35,68,97],
  // 동남아
  [-8,20,95,140],
  // 동아시아
  [20,55,100,145],[30,46,125,145],[33,43,124,130],
  // 호주
  [-40,-11,113,154],
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
];

function isLand(lat, lng) {
  return LAND.some(([la1,la2,lo1,lo2]) => lat >= la1 && lat <= la2 && lng >= lo1 && lng <= lo2);
}

// BMP 파일 생성 (순수 Node.js, 외부 의존성 없음)
function createBMP(width, height, pixels) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;

  const buf = Buffer.alloc(fileSize);

  // BMP Header
  buf.write("BM", 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10); // offset to pixel data
  // DIB Header
  buf.writeUInt32LE(40, 14); // header size
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26); // planes
  buf.writeUInt16LE(24, 28); // bpp
  buf.writeUInt32LE(0, 30); // compression
  buf.writeUInt32LE(pixelDataSize, 34);

  // Pixel data (BMP is bottom-up, BGR)
  for (let y = 0; y < height; y++) {
    const srcRow = height - 1 - y; // flip
    for (let x = 0; x < width; x++) {
      const srcIdx = (srcRow * width + x) * 3;
      const dstIdx = 54 + y * rowSize + x * 3;
      buf[dstIdx] = pixels[srcIdx + 2]; // B
      buf[dstIdx + 1] = pixels[srcIdx + 1]; // G
      buf[dstIdx + 2] = pixels[srcIdx]; // R
    }
  }

  return buf;
}

// 픽셀 데이터 생성
const pixels = Buffer.alloc(W * H * 3);

for (let py = 0; py < H; py++) {
  for (let px = 0; px < W; px++) {
    const lat = 90 - (py / H) * 180;
    const lng = (px / W) * 360 - 180;
    const idx = (py * W + px) * 3;

    if (isLand(lat, lng)) {
      // 대륙: 어두운 초록/시안
      pixels[idx] = 15;     // R
      pixels[idx+1] = 80;   // G
      pixels[idx+2] = 65;   // B
    } else {
      // 바다: 매우 어두운 네이비
      pixels[idx] = 8;
      pixels[idx+1] = 12;
      pixels[idx+2] = 28;
    }
  }
}

// BMP 생성 및 저장
const bmp = createBMP(W, H, pixels);
mkdirSync("public", { recursive: true });
writeFileSync("public/earth-texture.bmp", bmp);
console.log(`Generated earth-texture.bmp (${W}x${H}, ${bmp.length} bytes)`);

// Base64 인라인 데이터도 생성 (TextureLoader 대신 사용 가능)
const base64 = bmp.toString("base64");
const dataUrl = `data:image/bmp;base64,${base64}`;

// JS 모듈로 저장
writeFileSync(
  "src/components/globe/earth-texture-data.ts",
  `// Auto-generated earth texture data\nexport const EARTH_TEXTURE_DATA = "${dataUrl}";\n`
);
console.log("Generated earth-texture-data.ts");
