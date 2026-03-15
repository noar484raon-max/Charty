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

// 실제 지구 텍스처 URL (public domain / free CDN)
const EARTH_TEXTURE_URL = "https://unpkg.com/three-globe@2.31.1/example/img/earth-night.jpg";
const EARTH_TOPO_URL = "https://unpkg.com/three-globe@2.31.1/example/img/earth-topology.png";

export default function InteractiveGlobe({ countries, selectedCountry, onSelectCountry }: InteractiveGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const markersGroupRef = useRef<THREE.Group | null>(null);
  const markerMeshesRef = useRef<THREE.Mesh[]>([]);
  const globeRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const rotRef = useRef({ x: 0.25, y: -1.8 });
  const autoRotRef = useRef(true);
  const timeRef = useRef(0);
  const hasDraggedRef = useRef(false);

  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  // ─── 씬 초기화 ───
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const W = el.clientWidth;
    const H = el.clientHeight;

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
    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dl = new THREE.DirectionalLight(0xffffff, 0.5);
    dl.position.set(5, 3, 5);
    scene.add(dl);

    // Globe group
    const globe = new THREE.Group();
    scene.add(globe);
    globeRef.current = globe;

    // ── 지구 구체 (텍스처 로드) ──
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";

    // 먼저 기본 구체 생성 (텍스처 로드 전)
    const earthGeo = new THREE.SphereGeometry(1, 64, 64);
    const earthMat = new THREE.MeshPhongMaterial({
      color: 0x1a2030,
      emissive: 0x050810,
      specular: 0x333355,
      shininess: 15,
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    globe.add(earthMesh);

    // 텍스처 로드 (비동기)
    loader.load(
      EARTH_TEXTURE_URL,
      (texture) => {
        earthMat.map = texture;
        earthMat.color.set(0xffffff);
        earthMat.emissive.set(0x112244);
        earthMat.emissiveIntensity = 0.15;
        earthMat.needsUpdate = true;
      },
      undefined,
      (err) => {
        console.warn("Earth texture load failed, using fallback color", err);
      }
    );

    // ── 대기 글로우 ──
    const atmosGeo = new THREE.SphereGeometry(1.05, 64, 64);
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
          float intensity = pow(0.55 - dot(vNormal, vec3(0,0,1)), 2.0);
          gl_FragColor = vec4(0.3, 0.6, 1.0, intensity * 0.45);
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
        rotRef.current.y += 0.0012;
        globe.rotation.y = rotRef.current.y;
      }

      // 마커 펄스
      markerMeshesRef.current.forEach((m) => {
        if (m.userData.pulse) {
          const s = 1 + Math.sin(timeRef.current * 3 + m.userData.phase) * 0.3;
          m.scale.set(s, s, s);
          (m.material as THREE.MeshBasicMaterial).opacity =
            0.5 - Math.sin(timeRef.current * 3 + m.userData.phase) * 0.2;
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  // ─── 마커 업데이트 ───
  useEffect(() => {
    const mg = markersGroupRef.current;
    if (!mg) return;

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
      const pos = latLngToVec3(c.lat, c.lng, 1.015);
      const sel = c.code === selectedCountry;
      const col = sentimentToHex(c.sentiment);
      const hasNews = c.articleCount > 0;

      // 메인 마커
      const sz = sel ? 0.05 : hasNews ? 0.032 : 0.016;
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

      // 펄스 링
      if (hasNews || sel) {
        const rg = new THREE.RingGeometry(sz * 1.8, sz * 2.4, 32);
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

      // 선택 빔
      if (sel) {
        const outerPos = latLngToVec3(c.lat, c.lng, 1.2);
        const mid = pos.clone().lerp(outerPos, 0.5);
        const beamLen = outerPos.clone().sub(pos).length();
        const bg = new THREE.CylinderGeometry(0.004, 0.004, beamLen, 8);
        const bm = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7 });
        const beam = new THREE.Mesh(bg, bm);
        beam.position.copy(mid);
        beam.lookAt(0, 0, 0);
        beam.rotateX(Math.PI / 2);
        mg.add(beam);

        const opGeo = new THREE.SphereGeometry(0.018, 12, 12);
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
    hasDraggedRef.current = false;
    autoRotRef.current = false;
    prevMouseRef.current = { x: e.clientX, y: e.clientY };
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current || !globeRef.current) return;
    const dx = e.clientX - prevMouseRef.current.x;
    const dy = e.clientY - prevMouseRef.current.y;

    if (Math.abs(e.clientX - dragStartRef.current.x) > 5 || Math.abs(e.clientY - dragStartRef.current.y) > 5) {
      hasDraggedRef.current = true;
    }

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
    // 드래그 후 클릭 방지
    if (hasDraggedRef.current) return;
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

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-zinc-600 pointer-events-none">
        드래그하여 회전 · 마커 클릭하여 뉴스 보기
      </div>
    </div>
  );
}
