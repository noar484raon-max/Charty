"use client";

import { useRef, useEffect, useCallback, useState } from "react";
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
function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// 감성 → 색상
function sentimentToHex(score: number): number {
  if (score >= 60) return 0x22c55e;
  if (score >= 50) return 0xeab308;
  return 0xef4444;
}

// ─── 간략화된 대륙 좌표 데이터 (도트 매트릭스용) ───
// 대략적인 육지 범위를 위도/경도 직사각형으로 정의
const LAND_REGIONS: { latMin: number; latMax: number; lngMin: number; lngMax: number }[] = [
  // 북미
  { latMin: 25, latMax: 50, lngMin: -130, lngMax: -60 },
  { latMin: 50, latMax: 72, lngMin: -170, lngMax: -55 },
  { latMin: 15, latMax: 25, lngMin: -110, lngMax: -80 },
  { latMin: 60, latMax: 75, lngMin: -170, lngMax: -140 },
  // 중미/카리브
  { latMin: 7, latMax: 20, lngMin: -90, lngMax: -60 },
  // 남미
  { latMin: -56, latMax: 12, lngMin: -82, lngMax: -34 },
  { latMin: -40, latMax: -15, lngMin: -72, lngMax: -40 },
  // 유럽
  { latMin: 36, latMax: 71, lngMin: -10, lngMax: 40 },
  { latMin: 55, latMax: 70, lngMin: 10, lngMax: 30 },
  // 아프리카
  { latMin: -35, latMax: 37, lngMin: -18, lngMax: 52 },
  { latMin: -10, latMax: 15, lngMin: -18, lngMax: 45 },
  // 러시아/중앙아시아
  { latMin: 40, latMax: 75, lngMin: 40, lngMax: 180 },
  { latMin: 50, latMax: 70, lngMin: 60, lngMax: 180 },
  // 중동
  { latMin: 12, latMax: 42, lngMin: 25, lngMax: 65 },
  // 남아시아
  { latMin: 8, latMax: 35, lngMin: 68, lngMax: 97 },
  // 동남아시아
  { latMin: -10, latMax: 25, lngMin: 95, lngMax: 140 },
  // 동아시아
  { latMin: 20, latMax: 55, lngMin: 100, lngMax: 145 },
  { latMin: 30, latMax: 46, lngMin: 125, lngMax: 145 },
  // 호주
  { latMin: -45, latMax: -10, lngMin: 112, lngMax: 155 },
  // 뉴질랜드
  { latMin: -47, latMax: -34, lngMin: 166, lngMax: 178 },
  // 그린란드
  { latMin: 60, latMax: 84, lngMin: -73, lngMax: -12 },
  // 영국/아일랜드
  { latMin: 50, latMax: 59, lngMin: -11, lngMax: 2 },
  // 마다가스카르
  { latMin: -26, latMax: -12, lngMin: 43, lngMax: 50 },
  // 인도네시아
  { latMin: -8, latMax: 5, lngMin: 95, lngMax: 141 },
];

function isLand(lat: number, lng: number): boolean {
  return LAND_REGIONS.some(
    (r) => lat >= r.latMin && lat <= r.latMax && lng >= r.lngMin && lng <= r.lngMax
  );
}

export default function InteractiveGlobe({ countries, selectedCountry, onSelectCountry }: InteractiveGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const globeRef = useRef<THREE.Group | null>(null);
  const markersGroupRef = useRef<THREE.Group | null>(null);
  const markerMeshesRef = useRef<THREE.Mesh[]>([]);
  const frameRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const rotationRef = useRef({ x: 0.3, y: -1.8 }); // 아시아 쪽
  const autoRotateRef = useRef(true);
  const timeRef = useRef(0);

  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // ─── 초기화 ───
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 3.0;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 조명
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 3, 5);
    scene.add(dirLight);

    // Globe group
    const globeGroup = new THREE.Group();
    scene.add(globeGroup);
    globeRef.current = globeGroup;

    // ─── 1) 바다 구체 (어두운 네이비) ───
    const oceanGeo = new THREE.SphereGeometry(0.98, 64, 64);
    const oceanMat = new THREE.MeshPhongMaterial({
      color: 0x0a0f1e,
      emissive: 0x050a14,
      specular: 0x111133,
      shininess: 20,
    });
    globeGroup.add(new THREE.Mesh(oceanGeo, oceanMat));

    // ─── 2) 대기 글로우 (외곽 블루) ───
    const atmosGeo = new THREE.SphereGeometry(1.08, 64, 64);
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
          float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);
          gl_FragColor = vec4(0.3, 0.6, 1.0, intensity * 0.6);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
    });
    globeGroup.add(new THREE.Mesh(atmosGeo, atmosMat));

    // ─── 3) 도트 매트릭스 대륙 ───
    const dotPositions: number[] = [];
    const dotColors: number[] = [];
    const landColor = new THREE.Color(0x2dd4bf); // 민트/시안
    const oceanDotColor = new THREE.Color(0x1a1a3e);
    const dotRadius = 1.002;
    const step = 2.5; // 도트 간격 (작을수록 촘촘)

    for (let lat = -85; lat <= 85; lat += step) {
      // 위도에 따라 경도 스텝 조절 (극지방에서 밀집 방지)
      const lngStep = step / Math.cos((lat * Math.PI) / 180);
      for (let lng = -180; lng < 180; lng += lngStep) {
        const pos = latLngToVector3(lat, lng, dotRadius);
        if (isLand(lat, lng)) {
          dotPositions.push(pos.x, pos.y, pos.z);
          dotColors.push(landColor.r, landColor.g, landColor.b);
        } else {
          // 바다 도트 (매우 희미하게)
          if (Math.random() > 0.65) {
            dotPositions.push(pos.x, pos.y, pos.z);
            dotColors.push(oceanDotColor.r, oceanDotColor.g, oceanDotColor.b);
          }
        }
      }
    }

    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute("position", new THREE.Float32BufferAttribute(dotPositions, 3));
    dotGeo.setAttribute("color", new THREE.Float32BufferAttribute(dotColors, 3));
    const dotMat = new THREE.PointsMaterial({
      size: 0.018,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
    });
    globeGroup.add(new THREE.Points(dotGeo, dotMat));

    // ─── 4) 위도/경도 그리드 (희미하게) ───
    const gridMat = new THREE.LineBasicMaterial({ color: 0x1a1a3e, transparent: true, opacity: 0.15 });
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lng = 0; lng <= 360; lng += 5) {
        pts.push(latLngToVector3(lat, lng - 180, 1.001));
      }
      globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }
    for (let lng = -180; lng < 180; lng += 60) {
      const pts: THREE.Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 5) {
        pts.push(latLngToVector3(lat, lng, 1.001));
      }
      globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }

    // ─── 5) 마커 그룹 ───
    const markersGroup = new THREE.Group();
    globeGroup.add(markersGroup);
    markersGroupRef.current = markersGroup;

    // 초기 회전
    globeGroup.rotation.x = rotationRef.current.x;
    globeGroup.rotation.y = rotationRef.current.y;

    // Resize
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // Animate
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      timeRef.current += 0.016;

      if (autoRotateRef.current && !isDraggingRef.current) {
        rotationRef.current.y += 0.001;
        globeGroup.rotation.y = rotationRef.current.y;
      }

      // 마커 펄스 애니메이션
      markerMeshesRef.current.forEach((mesh) => {
        if (mesh.userData.isRing) {
          const scale = 1 + Math.sin(timeRef.current * 2 + mesh.userData.phase) * 0.3;
          mesh.scale.set(scale, scale, scale);
          (mesh.material as THREE.MeshBasicMaterial).opacity =
            0.4 - Math.sin(timeRef.current * 2 + mesh.userData.phase) * 0.2;
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // ─── 마커 업데이트 ───
  useEffect(() => {
    const markersGroup = markersGroupRef.current;
    if (!markersGroup) return;

    // 기존 제거
    while (markersGroup.children.length > 0) {
      const child = markersGroup.children[0];
      markersGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
    markerMeshesRef.current = [];

    countries.forEach((c, idx) => {
      const pos = latLngToVector3(c.lat, c.lng, 1.025);
      const isSelected = c.code === selectedCountry;
      const color = sentimentToHex(c.sentiment);
      const hasNews = c.articleCount > 0;

      // 메인 마커 (큰 구체)
      const size = isSelected ? 0.045 : hasNews ? 0.03 : 0.015;
      const geo = new THREE.SphereGeometry(size, 16, 16);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: isSelected ? 1.0 : hasNews ? 0.9 : 0.4,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.userData = { countryCode: c.code };
      markersGroup.add(mesh);
      markerMeshesRef.current.push(mesh);

      // 펄스 링 (뉴스 있는 국가)
      if (hasNews) {
        const ringGeo = new THREE.RingGeometry(size * 1.5, size * 2.0, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(pos);
        ring.lookAt(new THREE.Vector3(0, 0, 0));
        ring.userData = { isRing: true, phase: idx * 0.7 };
        markersGroup.add(ring);
        markerMeshesRef.current.push(ring);
      }

      // 선택된 국가: 더 큰 외곽 링
      if (isSelected) {
        const selRingGeo = new THREE.RingGeometry(0.06, 0.075, 32);
        const selRingMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide,
        });
        const selRing = new THREE.Mesh(selRingGeo, selRingMat);
        selRing.position.copy(pos);
        selRing.lookAt(new THREE.Vector3(0, 0, 0));
        selRing.userData = { isRing: true, phase: 0 };
        markersGroup.add(selRing);
        markerMeshesRef.current.push(selRing);
      }

      // 수직 빔 (선택된 국가)
      if (isSelected) {
        const beamGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.15, 8);
        const beamMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.7,
        });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        const outerPos = latLngToVector3(c.lat, c.lng, 1.1);
        beam.position.copy(pos).lerp(outerPos, 0.5);
        beam.lookAt(new THREE.Vector3(0, 0, 0));
        beam.rotateX(Math.PI / 2);
        markersGroup.add(beam);
      }
    });
  }, [countries, selectedCountry]);

  // ─── 이벤트 핸들러 ───
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = true;
    autoRotateRef.current = false;
    prevMouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current || !globeRef.current) return;
    const dx = e.clientX - prevMouseRef.current.x;
    const dy = e.clientY - prevMouseRef.current.y;
    rotationRef.current.y += dx * 0.005;
    rotationRef.current.x += dy * 0.005;
    rotationRef.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotationRef.current.x));
    globeRef.current.rotation.y = rotationRef.current.y;
    globeRef.current.rotation.x = rotationRef.current.x;
    prevMouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
    setTimeout(() => { autoRotateRef.current = true; }, 3000);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current || !cameraRef.current || !markersGroupRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    const intersects = raycasterRef.current.intersectObjects(markersGroupRef.current.children);

    for (const hit of intersects) {
      if (hit.object.userData.countryCode) {
        onSelectCountry(hit.object.userData.countryCode);
        return;
      }
    }
  }, [onSelectCountry]);

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClick={handleClick}
      />
      {/* 선택 국가 뱃지 */}
      {selectedCountry && (
        <div className="absolute top-4 left-4 bg-surface/90 backdrop-blur-sm border border-white/[0.08] rounded-xl px-3 py-2 shadow-lg">
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {countries.find((c) => c.code === selectedCountry)?.flag}
            </span>
            <div>
              <div className="text-sm font-bold text-zinc-200">
                {countries.find((c) => c.code === selectedCountry)?.name}
              </div>
              <div className="text-[10px] text-zinc-500">
                뉴스 {countries.find((c) => c.code === selectedCountry)?.articleCount || 0}건 분석
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 범례 */}
      <div className="absolute bottom-3 right-3 bg-surface/80 backdrop-blur-sm border border-white/[0.06] rounded-lg px-2.5 py-2 text-[10px]">
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
      {/* 조작 힌트 */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-zinc-600 pointer-events-none">
        드래그하여 회전 · 마커를 클릭하여 뉴스 보기
      </div>
    </div>
  );
}
