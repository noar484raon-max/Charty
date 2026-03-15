"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import * as THREE from "three";

interface CountryPoint {
  code: string;
  name: string;
  flag: string;
  lat: number;
  lng: number;
  sentiment: number; // 0~100
  label: string;
  articleCount: number;
}

interface InteractiveGlobeProps {
  countries: CountryPoint[];
  selectedCountry: string | null;
  onSelectCountry: (code: string) => void;
}

// 위도/경도 → 3D 좌표 변환
function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// 감성 점수 → 색상
function sentimentToColor(score: number): THREE.Color {
  if (score >= 60) return new THREE.Color(0x22c55e); // 초록
  if (score >= 50) return new THREE.Color(0xeab308); // 노랑
  return new THREE.Color(0xef4444); // 빨강
}

export default function InteractiveGlobe({ countries, selectedCountry, onSelectCountry }: InteractiveGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const globeRef = useRef<THREE.Group | null>(null);
  const markersRef = useRef<THREE.Group | null>(null);
  const frameRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const rotationRef = useRef({ x: 0.3, y: -0.5 }); // 초기 회전 (아시아 방향)
  const autoRotateRef = useRef(true);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);

  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // ─── 초기화 ───
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 3.2;
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 3, 5);
    scene.add(directionalLight);
    const backLight = new THREE.DirectionalLight(0x4488ff, 0.3);
    backLight.position.set(-5, -3, -5);
    scene.add(backLight);

    // Globe group
    const globeGroup = new THREE.Group();
    scene.add(globeGroup);
    globeRef.current = globeGroup;

    // 지구본 구체 — 다크 스타일
    const sphereGeometry = new THREE.SphereGeometry(1, 64, 64);
    const sphereMaterial = new THREE.MeshPhongMaterial({
      color: 0x1a1a2e,
      emissive: 0x0a0a15,
      specular: 0x333355,
      shininess: 15,
      transparent: true,
      opacity: 0.95,
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    globeGroup.add(sphere);

    // 대기 글로우 효과
    const glowGeometry = new THREE.SphereGeometry(1.03, 64, 64);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.08,
      side: THREE.BackSide,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    globeGroup.add(glow);

    // 위도/경도 그리드 라인
    const gridMaterial = new THREE.LineBasicMaterial({ color: 0x2a2a4a, transparent: true, opacity: 0.3 });

    // 위도 라인
    for (let lat = -60; lat <= 60; lat += 30) {
      const points: THREE.Vector3[] = [];
      for (let lng = 0; lng <= 360; lng += 5) {
        points.push(latLngToVector3(lat, lng - 180, 1.005));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      globeGroup.add(new THREE.Line(geometry, gridMaterial));
    }

    // 경도 라인
    for (let lng = -180; lng < 180; lng += 30) {
      const points: THREE.Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 5) {
        points.push(latLngToVector3(lat, lng, 1.005));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      globeGroup.add(new THREE.Line(geometry, gridMaterial));
    }

    // Markers group
    const markers = new THREE.Group();
    globeGroup.add(markers);
    markersRef.current = markers;

    // 초기 회전 적용
    globeGroup.rotation.x = rotationRef.current.x;
    globeGroup.rotation.y = rotationRef.current.y;

    // Resize handler
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
      if (autoRotateRef.current && !isDraggingRef.current) {
        rotationRef.current.y += 0.002;
        globeGroup.rotation.y = rotationRef.current.y;
      }
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

  // ─── 국가 마커 업데이트 ───
  useEffect(() => {
    const markers = markersRef.current;
    if (!markers) return;

    // 기존 마커 제거
    while (markers.children.length > 0) {
      const child = markers.children[0];
      markers.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }

    // 새 마커 추가
    countries.forEach((c) => {
      const pos = latLngToVector3(c.lat, c.lng, 1.02);
      const isSelected = c.code === selectedCountry;
      const size = isSelected ? 0.04 : 0.025;

      // 마커 구체
      const geometry = new THREE.SphereGeometry(size, 16, 16);
      const color = sentimentToColor(c.sentiment);
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: isSelected ? 1.0 : 0.8,
      });
      const marker = new THREE.Mesh(geometry, material);
      marker.position.copy(pos);
      marker.userData = { countryCode: c.code };
      markers.add(marker);

      // 선택된 국가는 링 추가
      if (isSelected) {
        const ringGeometry = new THREE.RingGeometry(0.05, 0.065, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.position.copy(pos);
        ring.lookAt(new THREE.Vector3(0, 0, 0));
        markers.add(ring);
      }

      // 펄스 이펙트 (뉴스 있는 국가)
      if (c.articleCount > 0 && !isSelected) {
        const pulseGeometry = new THREE.RingGeometry(0.03, 0.04, 32);
        const pulseMaterial = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide,
        });
        const pulse = new THREE.Mesh(pulseGeometry, pulseMaterial);
        pulse.position.copy(pos);
        pulse.lookAt(new THREE.Vector3(0, 0, 0));
        markers.add(pulse);
      }
    });
  }, [countries, selectedCountry]);

  // ─── 마우스/터치 이벤트 ───
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
    // 3초 후 자동회전 재개
    setTimeout(() => { autoRotateRef.current = true; }, 3000);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current || !cameraRef.current || !markersRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    const intersects = raycasterRef.current.intersectObjects(markersRef.current.children);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      if (hit.userData.countryCode) {
        onSelectCountry(hit.userData.countryCode);
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
      {/* 국가 라벨 오버레이 — 선택된 국가 */}
      {selectedCountry && (
        <div className="absolute top-3 left-3 bg-surface/90 backdrop-blur-sm border border-white/[0.08] rounded-xl px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {countries.find((c) => c.code === selectedCountry)?.flag}
            </span>
            <span className="text-sm font-bold text-zinc-200">
              {countries.find((c) => c.code === selectedCountry)?.name}
            </span>
          </div>
        </div>
      )}
      {/* 조작 힌트 */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-zinc-600 pointer-events-none">
        드래그하여 회전 · 국가를 클릭하여 뉴스 보기
      </div>
    </div>
  );
}
