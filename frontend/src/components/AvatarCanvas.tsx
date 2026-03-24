/**
 * AvatarCanvas — Three.js + expo-gl GLB 렌더러
 *
 * 기능:
 *   - expo-gl WebGL 컨텍스트 위에 Three.js Scene 구성
 *   - Ready Player Me .glb 로드 (로컬 캐시 경로 사용)
 *   - AnimationMixer로 idle/talking/thinking 클립 전환
 *   - mouthOpen(0~1) → "mouthOpen" morph target 실시간 반영 (립싱크)
 *   - 렌더 루프: requestAnimationFrame
 *
 * 제약:
 *   - expo-gl은 WebGL1 기준이므로 physically-based 셰이더보다 MeshToonMaterial/MeshLambertMaterial 권장
 *   - DRACOLoader는 워커 의존성 문제로 제외 (gltf-transform으로 사전 드라코 해제)
 */
import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { GLView, ExpoWebGLRenderingContext } from "expo-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { AvatarState, useAvatarAnimation } from "../hooks/useAvatarAnimation";

interface Props {
  glbUri: string | null;        // 로컬 file:// 경로 (avatarCache에서 받은 값)
  avatarState: AvatarState;     // "idle" | "talking" | "thinking"
  mouthOpen: number;            // 0~1 (useLipSync에서 전달)
  style?: object;
}

// Ready Player Me morph target 이름 목록 (표준 기준, 실제 export에 따라 조정)
const MOUTH_OPEN_TARGETS = ["mouthOpen", "viseme_aa", "jawOpen"];

export default function AvatarCanvas({ glbUri, avatarState, mouthOpen, style }: Props) {
  const glRef = useRef<ExpoWebGLRenderingContext | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const clockRef = useRef(new THREE.Clock());
  const meshesRef = useRef<THREE.SkinnedMesh[]>([]);
  const clipsRef = useRef<THREE.AnimationClip[]>([]);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  // 애니메이션 상태 관리
  const { transitionTo } = useAvatarAnimation(mixerRef.current, clipsRef.current);

  // avatarState 변경 시 애니메이션 전환
  useEffect(() => {
    transitionTo(avatarState);
  }, [avatarState, transitionTo]);

  // mouthOpen → morph target 반영 (매 프레임이 아닌 값이 바뀔 때만)
  useEffect(() => {
    for (const mesh of meshesRef.current) {
      if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) continue;
      for (const targetName of MOUTH_OPEN_TARGETS) {
        const idx = mesh.morphTargetDictionary[targetName];
        if (idx !== undefined) {
          mesh.morphTargetInfluences[idx] = mouthOpen;
        }
      }
    }
  }, [mouthOpen]);

  function setupScene(gl: ExpoWebGLRenderingContext) {
    const { drawingBufferWidth: w, drawingBufferHeight: h } = gl;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: {
        width: w,
        height: h,
        style: {},
        addEventListener: () => {},
        removeEventListener: () => {},
        clientHeight: h,
      } as any,
      context: gl as any,
      antialias: false,     // expo-gl 성능 최적화
      powerPreference: "low-power",
    });
    renderer.setSize(w, h);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x141414);
    sceneRef.current = scene;

    // Camera — 상반신 포트레이트 뷰
    const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100);
    camera.position.set(0, 1.5, 2.5);
    camera.lookAt(0, 1.4, 0);
    cameraRef.current = camera;

    // 조명
    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(1, 3, 2);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xaac8ff, 0.6);
    fillLight.position.set(-2, 1, 1);
    scene.add(fillLight);
  }

  function loadGlb(uri: string) {
    if (!sceneRef.current) return;

    const loader = new GLTFLoader();

    // expo-gl 환경에서 로컬 파일 로드
    loader.load(
      uri,
      (gltf) => {
        if (!mountedRef.current || !sceneRef.current) return;

        const model = gltf.scene;

        // 상반신 중심으로 위치 조정
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
        model.position.y += 0.5;  // 살짝 위로

        sceneRef.current.add(model);

        // SkinnedMesh 수집 (morph target용)
        const skinned: THREE.SkinnedMesh[] = [];
        model.traverse((obj) => {
          if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
            skinned.push(obj as THREE.SkinnedMesh);
          }
        });
        meshesRef.current = skinned;

        // AnimationMixer 설정
        if (gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(model);
          mixerRef.current = mixer;
          clipsRef.current = gltf.animations;

          // idle 클립 즉시 시작
          const idleClip =
            gltf.animations.find((c) => c.name.toLowerCase().includes("idle")) ??
            gltf.animations[0];
          mixer.clipAction(idleClip).setLoop(THREE.LoopRepeat, Infinity).play();
        }
      },
      undefined,
      (err) => console.error("[AvatarCanvas] GLB 로드 실패:", err)
    );
  }

  function startRenderLoop() {
    const render = () => {
      if (!mountedRef.current) return;
      rafRef.current = requestAnimationFrame(render);

      const delta = clockRef.current.getDelta();
      mixerRef.current?.update(delta);

      rendererRef.current?.render(sceneRef.current!, cameraRef.current!);

      // expo-gl: endFrameEXP 필수
      (glRef.current as any)?.endFrameEXP?.();
    };
    render();
  }

  function onContextCreate(gl: ExpoWebGLRenderingContext) {
    glRef.current = gl;
    setupScene(gl);
    if (glbUri) loadGlb(glbUri);
    startRenderLoop();
  }

  // glbUri가 바뀌면 씬에서 기존 모델 제거 후 재로드
  useEffect(() => {
    if (!sceneRef.current || !glbUri) return;

    // 기존 모델 제거
    const toRemove: THREE.Object3D[] = [];
    sceneRef.current.traverse((obj) => {
      if (obj.type === "Group" || (obj as THREE.SkinnedMesh).isSkinnedMesh) {
        toRemove.push(obj);
      }
    });
    toRemove.forEach((obj) => sceneRef.current?.remove(obj));
    meshesRef.current = [];
    mixerRef.current?.stopAllAction();
    mixerRef.current = null;

    loadGlb(glbUri);
  }, [glbUri]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rendererRef.current?.dispose();
    };
  }, []);

  return (
    <View style={[styles.container, style]}>
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: "hidden", backgroundColor: "#141414" },
});
