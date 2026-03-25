/**
 * AvatarCanvasWeb — 웹 브라우저용 3D 아바타 (React Three Fiber)
 *
 * expo-gl이 필요 없는 순수 WebGL 기반.
 * GLB를 원격 URL에서 직접 로드 (로컬 캐시 불필요).
 *
 * Platform.OS === 'web' 인 경우에만 import됨.
 */
import React, { Suspense, useEffect, useRef } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { AvatarState } from "../hooks/useAvatarAnimation";

const MOUTH_TARGETS = ["mouthOpen", "viseme_aa", "jawOpen"];

// ── 아바타 씬 내부 컴포넌트 ─────────────────────────────────────
interface ModelProps {
  url: string;
  avatarState: AvatarState;
  mouthOpen: number;
}

function AvatarModel({ url, avatarState, mouthOpen }: ModelProps) {
  const gltf = useLoader(GLTFLoader, url);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const meshesRef = useRef<THREE.SkinnedMesh[]>([]);

  useEffect(() => {
    const model = gltf.scene;

    // 중앙 정렬
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    model.position.y += 0.5;

    // SkinnedMesh 수집
    const skinned: THREE.SkinnedMesh[] = [];
    model.traverse((obj: any) => {
      if (obj.isSkinnedMesh) skinned.push(obj as THREE.SkinnedMesh);
    });
    meshesRef.current = skinned;

    // AnimationMixer
    if (gltf.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(model);
      mixerRef.current = mixer;
      const idleClip =
        gltf.animations.find((c) => c.name.toLowerCase().includes("idle")) ??
        gltf.animations[0];
      mixer.clipAction(idleClip).setLoop(THREE.LoopRepeat, Infinity).play();
    }

    return () => {
      mixerRef.current?.stopAllAction();
    };
  }, [gltf]);

  // 립싱크 morph target 반영
  useEffect(() => {
    for (const mesh of meshesRef.current) {
      if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) continue;
      for (const name of MOUTH_TARGETS) {
        const idx = mesh.morphTargetDictionary[name];
        if (idx !== undefined) mesh.morphTargetInfluences[idx] = mouthOpen;
      }
    }
  }, [mouthOpen]);

  useFrame((_, delta) => {
    mixerRef.current?.update(delta);
  });

  return <primitive object={gltf.scene} />;
}

// ── 플레이스홀더 (GLB 로딩 중) ──────────────────────────────────
function Placeholder() {
  return (
    <mesh>
      <sphereGeometry args={[0.3, 16, 16]} />
      <meshStandardMaterial color="#312e81" />
    </mesh>
  );
}

// ── 퍼블릭 컴포넌트 ─────────────────────────────────────────────
interface Props {
  url: string | null;
  avatarState: AvatarState;
  mouthOpen: number;
  style?: React.CSSProperties;
}

export default function AvatarCanvasWeb({ url, avatarState, mouthOpen, style }: Props) {
  return (
    <Canvas
      camera={{ position: [0, 1.5, 2.5], fov: 35 }}
      style={{
        background: "#141414",
        borderRadius: 12,
        ...style,
      }}
    >
      <ambientLight intensity={1.2} />
      <directionalLight position={[1, 3, 2]} intensity={1.5} />
      <directionalLight position={[-2, 1, 1]} intensity={0.6} color="#aac8ff" />

      <Suspense fallback={<Placeholder />}>
        {url ? (
          <AvatarModel url={url} avatarState={avatarState} mouthOpen={mouthOpen} />
        ) : (
          <Placeholder />
        )}
      </Suspense>
    </Canvas>
  );
}
