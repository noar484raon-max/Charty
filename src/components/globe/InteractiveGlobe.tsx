"use client";

import { useRef, useEffect, useCallback } from "react";
import * as THREE from "three";

interface CountryPoint {
  code: string;
  name: string;
  flag: string;
  lat: number;
  lng: number;
  sentiment: number;
  label: string;
  articleCount: number;
}

interface InteractiveGlobeProps {
  countries: CountryPoint[];
  selectedCountry: string | null;
  onSelectCountry: (code: string) => void;
}

// 위도/경도 → 3D 좌표
function latLngToVec3(lat: number, lng: number, r: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

function sentimentToHex(score: number): number {
  if (score >= 60) return 0x22c55e;
  if (score >= 50) return 0xeab308;
  return 0xef4444;
}

// ─── 대륙 영역 (Canvas 텍스처용) ───
// 각 영역은 [latMin, latMax, lngMin, lngMax]
const LAND: number[][] = [
  // 북미
  [30,50,-130,-65], [50,72,-168,-55], [25,30,-115,-80], [60,75,-168,-140],
  [15,25,-105,-80],
  // 중미
  [7,18,-92,-60],
  // 남미
  [-55,12,-82,-34], [-20,-5,-80,-45],
  // 유럽
  [36,60,-10,30], [55,71,10,40], [60,70,20,32],
  // 영국
  [50,59,-8,2],
  // 아프리카
  [-35,37,-18,52], [0,15,30,52],
  // 러시아/중앙아시아
  [50,75,40,180], [42,55,40,80],
  // 중동
  [12,42,25,65],
  // 남아시아 (인도)
  [8,35,68,97],
  // 동남아
  [-8,20,95,140],
  // 동아시아
  [20,55,100,145], [30,46,125,145],
  // 한반도
  [33,43,124,130],
  // 호주
  [-40,-11,113,154],
  // 뉴질랜드
  [-47,-34,166,178],
  // 그린란드
  [60,83,-73,-12],
  // 마다가스카르
  [-26,-12,43,50],
  // 스칸디나비아
  [56,71,5,30],
  // 이탈리아
  [37,46,7,18],
  // 스페인/포르투갈
  [36,44,-10,3],
  // 알래스카
  [55,72,-170,-130],
  // 멕시코
  [15,32,-117,-87],
  // 캐나다 북극 군도
  [65,83,-125,-60],
];

/**
 * Canvas에 지구 텍스처를 생성
 */
function createEarthTexture(): HTMLCanvasElement {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // 바다 배경
  ctx.fillStyle = "#0c1020";
  ctx.fillRect(0, 0, w, h);

  // 바다 그리드 (희미)
  ctx.strokeStyle = "rgba(40, 60, 100, 0.15)";
  ctx.lineWidth = 0.5;
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = ((90 - lat) / 180) * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  for (let lng = -180; lng < 180; lng += 30) {
    const x = ((lng + 180) / 360) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // 대륙 그리기
  for (const [latMin, latMax, lngMin, lngMax] of LAND) {
    const x = ((lngMin + 180) / 360) * w;
    const y = ((90 - latMax) / 180) * h;
    const rw = ((lngMax - lngMin) / 360) * w;
    const rh = ((latMax - latMin) / 180) * h;

    // 대륙 면
    ctx.fillStyle = "rgba(30, 120, 100, 0.7)";
    ctx.fillRect(x, y, rw, rh);

    // 대륙 테두리 (밝은 시안)
    ctx.strokeStyle = "rgba(45, 212, 191, 0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, rw, rh);
  }

  // 도트 패턴 오버레이 (대륙 위에)
  for (let lat = -85; lat <= 85; lat += 3) {
    const lngStep = 3 / Math.max(0.3, Math.cos((lat * Math.PI) / 180));
    for (let lng = -180; lng < 180; lng += lngStep) {
      const onLand = LAND.some(
        ([la1, la2, lo1, lo2]) => lat >= la1 && lat <= la2 && lng >= lo1 && lng <= lo2
      );
      if (onLand) {
        const px = ((lng + 180) / 360) * w;
        const py = ((90 - lat) / 180) * h;
        ctx.fillStyle = "rgba(45, 212, 191, 0.6)";
        ctx.beginPath();
        ctx.arc(px, py, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  return canvas;
}

export default function InteractiveGlobe({ countries, selectedCountry, onSelectCountry }: InteractiveGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // 마커 저장
  const markersGroupRef = useRef<THREE.Group | null>(null);
  const markerMeshesRef = useRef<THREE.Mesh[]>([]);
  const globeRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // 드래그/회전
  const isDraggingRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const rotRef = useRef({ x: 0.25, y: -1.8 });
  const autoRotRef = useRef(true);
  const timeRef = useRef(0);

  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  // ─── 씬 초기화 ───
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const W = el.clientWidth;
    const H = el.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.z = 2.8;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    // 조명
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dl = new THREE.DirectionalLight(0xffffff, 0.6);
    dl.position.set(5, 3, 5);
    scene.add(dl);

    // Globe group
    const globe = new THREE.Group();
    scene.add(globe);
    globeRef.current = globe;

    // ── 지구 구체 (Canvas 텍스처) ──
    const tex = new THREE.CanvasTexture(createEarthTexture());
    tex.needsUpdate = true;
    const earthGeo = new THREE.SphereGeometry(1, 64, 64);
    const earthMat = new THREE.MeshPhongMaterial({
      map: tex,
      specular: 0x222244,
      shininess: 15,
    });
    globe.add(new THREE.Mesh(earthGeo, earthMat));

    // ── 대기 글로우 ──
    const atmosGeo = new THREE.SphereGeometry(1.06, 64, 64);
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.6 - dot(vNormal, vec3(0,0,1)), 2.5);
          gl_FragColor = vec4(0.3, 0.6, 1.0, intensity * 0.5);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
    });
    globe.add(new THREE.Mesh(atmosGeo, atmosMat));

    // ── 마커 그룹 ──
    const mGroup = new THREE.Group();
    globe.add(mGroup);
    markersGroupRef.current = mGroup;

    // 초기 회전
    globe.rotation.x = rotRef.current.x;
    globe.rotation.y = rotRef.current.y;

    // 리사이즈
    const onResize = () => {
      const w2 = el.clientWidth, h2 = el.clientHeight;
      camera.aspect = w2 / h2;
      camera.updateProjectionMatrix();
      renderer.setSize(w2, h2);
    };
    window.addEventListener("resize", onResize);

    // 애니메이션
    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      timeRef.current += 0.016;

      if (autoRotRef.current && !isDraggingRef.current) {
        rotRef.current.y += 0.0015;
        globe.rotation.y = rotRef.current.y;
      }

      // 마커 펄스
      markerMeshesRef.current.forEach((m) => {
        if (m.userData.pulse) {
          const s = 1 + Math.sin(timeRef.current * 3 + m.userData.phase) * 0.25;
          m.scale.set(s, s, s);
          (m.material as THREE.MeshBasicMaterial).opacity =
            0.5 - Math.sin(timeRef.current * 3 + m.userData.phase) * 0.2;
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    cleanupRef.current = () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };

    return () => cleanupRef.current?.();
  }, []);

  // ─── 마커 업데이트 ───
  useEffect(() => {
    const mg = markersGroupRef.current;
    if (!mg) return;

    // 기존 제거
    while (mg.children.length) {
      const c = mg.children[0];
      mg.remove(c);
      if (c instanceof THREE.Mesh) {
        c.geometry.dispose();
        (c.material as THREE.Material).dispose();
      }
    }
    markerMeshesRef.current = [];

    countries.forEach((c, i) => {
      const pos = latLngToVec3(c.lat, c.lng, 1.02);
      const sel = c.code === selectedCountry;
      const col = sentimentToHex(c.sentiment);
      const hasNews = c.articleCount > 0;

      // ─ 메인 마커 ─
      const sz = sel ? 0.055 : hasNews ? 0.035 : 0.018;
      const geo = new THREE.SphereGeometry(sz, 16, 16);
      const mat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: sel ? 1 : hasNews ? 0.9 : 0.5,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.userData = { countryCode: c.code };
      mg.add(mesh);
      markerMeshesRef.current.push(mesh);

      // ─ 펄스 링 (뉴스 있는 국가) ─
      if (hasNews || sel) {
        const rg = new THREE.RingGeometry(sz * 1.8, sz * 2.3, 32);
        const rm = new THREE.MeshBasicMaterial({
          color: sel ? 0xffffff : col,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(rg, rm);
        ring.position.copy(pos);
        ring.lookAt(0, 0, 0);
        ring.userData = { pulse: true, phase: i * 0.8 };
        mg.add(ring);
        markerMeshesRef.current.push(ring);
      }

      // ─ 선택 빔 ─
      if (sel) {
        const outerPos = latLngToVec3(c.lat, c.lng, 1.18);
        const beamLen = outerPos.clone().sub(pos).length();
        const bg = new THREE.CylinderGeometry(0.004, 0.004, beamLen, 8);
        const bm = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7 });
        const beam = new THREE.Mesh(bg, bm);
        beam.position.copy(pos).lerp(outerPos, 0.5);
        beam.lookAt(0, 0, 0);
        beam.rotateX(Math.PI / 2);
        mg.add(beam);

        // 외곽 포인트
        const opGeo = new THREE.SphereGeometry(0.02, 12, 12);
        const opMat = new THREE.MeshBasicMaterial({ color: col });
        const op = new THREE.Mesh(opGeo, opMat);
        op.position.copy(outerPos);
        mg.add(op);
      }
    });
  }, [countries, selectedCountry]);

  // ─── 이벤트 ───
  const onDown = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = true;
    autoRotRef.current = false;
    prevMouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current || !globeRef.current) return;
    const dx = e.clientX - prevMouseRef.current.x;
    const dy = e.clientY - prevMouseRef.current.y;
    rotRef.current.y += dx * 0.005;
    rotRef.current.x += dy * 0.005;
    rotRef.current.x = Math.max(-1.2, Math.min(1.2, rotRef.current.x));
    globeRef.current.rotation.y = rotRef.current.y;
    globeRef.current.rotation.x = rotRef.current.x;
    prevMouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onUp = useCallback(() => {
    isDraggingRef.current = false;
    setTimeout(() => { autoRotRef.current = true; }, 3000);
  }, []);

  const onClick = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current || !cameraRef.current || !markersGroupRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.current.setFromCamera(mouse.current, cameraRef.current);
    const hits = raycaster.current.intersectObjects(markersGroupRef.current.children);
    for (const h of hits) {
      if (h.object.userData.countryCode) {
        onSelectCountry(h.object.userData.countryCode);
        return;
      }
    }
  }, [onSelectCountry]);

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        onClick={onClick}
      />

      {/* 선택 국가 뱃지 */}
      {selectedCountry && (() => {
        const c = countries.find((x) => x.code === selectedCountry);
        return c ? (
          <div className="absolute top-4 left-4 bg-surface/90 backdrop-blur-sm border border-white/[0.08] rounded-xl px-3 py-2 shadow-lg">
            <div className="flex items-center gap-2">
              <span className="text-xl">{c.flag}</span>
              <div>
                <div className="text-sm font-bold text-zinc-200">{c.name}</div>
                <div className="text-[10px] text-zinc-500">뉴스 {c.articleCount}건 분석</div>
              </div>
            </div>
          </div>
        ) : null;
      })()}

      {/* 범례 */}
      <div className="absolute bottom-12 right-3 bg-surface/80 backdrop-blur-sm border border-white/[0.06] rounded-lg px-2.5 py-2 text-[10px]">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-zinc-400">긍정</span>
        </div>
        <div className="flex items-center gap-1.5 mb-1">
          <span className="w-2 h-2 rounded-full bg-yellow-500" />
          <span className="text-zinc-400">중립</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-zinc-400">부정</span>
        </div>
      </div>

      {/* 힌트 */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-zinc-600 pointer-events-none">
        드래그하여 회전 · 마커 클릭하여 뉴스 보기
      </div>
    </div>
  );
}
