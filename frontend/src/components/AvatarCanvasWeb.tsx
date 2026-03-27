/**
 * AvatarCanvasWeb — 웹 브라우저용 3D 아바타 (순수 Three.js, R3F 없음)
 *
 * @react-three/fiber 없이 Three.js를 직접 사용.
 * React Native Web reconciler와 R3F reconciler 충돌을 우회.
 * Platform.OS === 'web' 인 경우에만 import됨.
 */
import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { AvatarState } from "../hooks/useAvatarAnimation";

const MOUTH_TARGETS = ["mouthOpen", "viseme_aa", "jawOpen"];

interface Props {
  url: string | null;
  avatarState: AvatarState;
  mouthOpen: number;
  style?: React.CSSProperties;
}

interface SceneState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  clock: THREE.Clock;
  mixer: THREE.AnimationMixer | null;
  meshes: THREE.SkinnedMesh[];
  rafId: number;
  placeholder: THREE.Mesh | null;
  model: THREE.Object3D | null;
}

export default function AvatarCanvasWeb({
  url,
  avatarState,
  mouthOpen,
  style,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneState | null>(null);
  const mouthOpenRef = useRef(mouthOpen);

  // mouthOpen 최신값 ref 유지 (렌더루프에서 사용)
  useEffect(() => {
    mouthOpenRef.current = mouthOpen;
    if (!sceneRef.current) return;
    for (const mesh of sceneRef.current.meshes) {
      if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) continue;
      for (const name of MOUTH_TARGETS) {
        const idx = mesh.morphTargetDictionary[name];
        if (idx !== undefined) mesh.morphTargetInfluences[idx] = mouthOpen;
      }
    }
  }, [mouthOpen]);

  // Three.js 초기화
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const W = container.clientWidth || 320;
    const H = container.clientHeight || 180;

    // ── 렌더러
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.domElement.style.cssText =
      "display:block;width:100%;height:100%;border-radius:12px;";
    container.appendChild(renderer.domElement);

    // ── 씬 & 카메라
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 100);
    camera.position.set(0, 1.5, 2.5);
    camera.lookAt(0, 1.4, 0); // 얼굴 높이 기준 (AvatarCanvas.tsx와 동일)

    // ── 조명
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const dir1 = new THREE.DirectionalLight(0xffffff, 1.5);
    dir1.position.set(1, 3, 2);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0xaac8ff, 0.6);
    dir2.position.set(-2, 1, 1);
    scene.add(dir2);

    // ── 플레이스홀더 구체
    const placeholder = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x4f46e5 })
    );
    scene.add(placeholder);

    const state: SceneState = {
      renderer,
      scene,
      camera,
      clock: new THREE.Clock(),
      mixer: null,
      meshes: [],
      rafId: 0,
      placeholder,
      model: null,
    };
    sceneRef.current = state;

    // ── 렌더 루프
    function animate() {
      state.rafId = requestAnimationFrame(animate);
      const delta = state.clock.getDelta();
      state.mixer?.update(delta);
      renderer.render(scene, camera);
    }
    animate();

    // ── 리사이즈 대응
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(state.rafId);
      ro.disconnect();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, []);

  // GLB URL 변경 시 모델 로드
  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;

    if (!url) {
      // URL 없으면 플레이스홀더 표시
      if (state.placeholder) state.placeholder.visible = true;
      if (state.model) {
        state.scene.remove(state.model);
        state.model = null;
      }
      return;
    }

    // 플레이스홀더 로드 중 표시
    if (state.placeholder) state.placeholder.visible = true;

    let cancelled = false;

    // MeshoptDecoder WASM 완전 초기화 대기 후 로드
    const meshoptReady: Promise<void> =
      (MeshoptDecoder as any).ready instanceof Promise
        ? (MeshoptDecoder as any).ready
        : Promise.resolve();

    meshoptReady.then(() => {
      if (cancelled) return;

      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder as any);

      loader.load(
        url,
        (gltf) => {
          if (cancelled) return;
          const s = sceneRef.current;
          if (!s) return;

          // 이전 모델 제거
          if (s.model) s.scene.remove(s.model);
          if (s.mixer) { s.mixer.stopAllAction(); s.mixer = null; }

          const model = gltf.scene;

          // 스케일 정규화: GLB가 cm 단위인 경우(키 > 3 유닛) 1.7m로 축소
          const box0 = new THREE.Box3().setFromObject(model);
          const rawHeight = box0.max.y - box0.min.y;
          if (rawHeight > 3) {
            model.scale.setScalar(1.7 / rawHeight);
          }

          // 중앙 정렬 (스케일 적용 후 재계산)
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          model.position.sub(center);
          model.position.y += 0.5;

          // SkinnedMesh 수집
          const skinned: THREE.SkinnedMesh[] = [];
          model.traverse((obj: any) => {
            if (obj.isSkinnedMesh) skinned.push(obj as THREE.SkinnedMesh);
          });
          s.meshes = skinned;

          // AnimationMixer
          if (gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(model);
            s.mixer = mixer;
            const idleClip =
              gltf.animations.find((c) => c.name.toLowerCase().includes("idle")) ??
              gltf.animations[0];
            mixer.clipAction(idleClip).setLoop(THREE.LoopRepeat, Infinity).play();
          }

          s.scene.add(model);
          s.model = model;
          if (s.placeholder) s.placeholder.visible = false;
        },
        undefined,
        (err) => {
          console.warn("[AvatarCanvasWeb] GLB 로드 실패:", err);
        }
      );
    });

    return () => { cancelled = true; };
  }, [url]);

  return (
    <div
      ref={containerRef}
      style={{
        background: "#141414",
        borderRadius: 12,
        overflow: "hidden",
        width: "100%",
        height: 180,
        display: "block",
        ...style,
      }}
    />
  );
}
