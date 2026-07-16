export const CAMERA_ANGLES = [
  { id: "front", label: "정면", description: "눈높이에서 정면으로" },
  { id: "three-quarter", label: "3/4 사선", description: "비스듬한 45도 옆에서" },
  { id: "side", label: "측면", description: "바로 옆 90도에서" },
  { id: "low", label: "로우 앵글", description: "아래에서 위로 올려다보며" },
  { id: "high", label: "하이 앵글", description: "위에서 아래로 내려다보며" },
  { id: "bird", label: "조감도", description: "머리 바로 위에서 수직으로" },
  { id: "over-shoulder", label: "오버 숄더", description: "다른 인물의 어깨 너머에서" },
  { id: "dutch", label: "더치 앵글", description: "카메라를 살짝 기울여서" },
  { id: "close-up", label: "클로즈업", description: "얼굴이 화면을 가득 채우게" },
  { id: "extreme-close", label: "익스트림 클로즈", description: "눈이나 입 같은 부위에 바짝" },
] as const;

export type CameraAngleId = typeof CAMERA_ANGLES[number]["id"];
export type GestureLayout = "single" | "two";
export type BackgroundMode = "scene" | "none";

export interface StudioSceneSettings {
  cameraAngle: CameraAngleId;
  gestureLayout: GestureLayout;
  backgroundMode: BackgroundMode;
  characterDirections: Record<string, string>;
  characterPresetIds: string[];
  referenceAssetIds: string[];
}

export const DEFAULT_STUDIO_SCENE: StudioSceneSettings = {
  cameraAngle: "front",
  gestureLayout: "single",
  backgroundMode: "scene",
  characterDirections: {},
  characterPresetIds: [],
  referenceAssetIds: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeStudioSceneSettings(value: unknown): StudioSceneSettings {
  const record = isRecord(value) ? value : {};
  const angleIds = new Set<string>(CAMERA_ANGLES.map((angle) => angle.id));
  const rawDirections = isRecord(record.characterDirections) ? record.characterDirections : {};
  const characterDirections = Object.fromEntries(
    Object.entries(rawDirections)
      .filter(([id, direction]) => id.length <= 128 && typeof direction === "string")
      .map(([id, direction]) => [id, (direction as string).trim().slice(0, 1_000)])
  );
  const referenceAssetIds = Array.isArray(record.referenceAssetIds)
    ? record.referenceAssetIds
        .filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 128)
        .filter((id, index, ids) => ids.indexOf(id) === index)
        .slice(0, 3)
    : [];
  const characterPresetIds = Array.isArray(record.characterPresetIds)
    ? record.characterPresetIds
        .filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 128)
        .filter((id, index, ids) => ids.indexOf(id) === index)
        .slice(0, 4)
    : [];

  return {
    cameraAngle: typeof record.cameraAngle === "string" && angleIds.has(record.cameraAngle)
      ? record.cameraAngle as CameraAngleId
      : DEFAULT_STUDIO_SCENE.cameraAngle,
    gestureLayout: record.gestureLayout === "two" ? "two" : "single",
    backgroundMode: record.backgroundMode === "none" ? "none" : "scene",
    characterDirections,
    characterPresetIds,
    referenceAssetIds,
  };
}

export function buildStudioGenerationPrompt(input: {
  prompt: string;
  mode: "scene" | "gesture";
  settings: StudioSceneSettings;
  characters: Array<{ id: string; name: string }>;
}) {
  const angle = CAMERA_ANGLES.find((item) => item.id === input.settings.cameraAngle) ?? CAMERA_ANGLES[0];
  const directionLines = input.characters
    .map((character) => {
      const direction = input.settings.characterDirections[character.id]?.trim();
      return direction ? `- ${character.name}: ${direction}` : "";
    })
    .filter(Boolean);
  const modeInstruction = input.mode === "gesture"
    ? input.settings.gestureLayout === "two"
      ? "두 캐릭터를 서로 구분해 각 인물의 표정과 포즈를 정확히 반영한다."
      : "주인공의 전신 포즈, 손동작, 표정을 분명하게 표현한다."
    : "장면의 이야기와 캐릭터 일관성을 우선한다.";
  const backgroundInstruction = input.settings.backgroundMode === "none"
    ? "배경은 순수 흰색 또는 투명으로 두고 인물 외의 장면 요소를 넣지 않는다."
    : "배경은 장면을 이해하는 데 필요한 큰 구조만 사용하고 시각적 밀도를 낮게 유지한다.";

  return `${input.prompt.trim()}

[촬영 및 생성 지시]
- 카메라: ${angle.label} (${angle.description})
- ${modeInstruction}
- ${backgroundInstruction}
- 말풍선, 자막, 글자, 워터마크는 이미지에 그리지 않는다.${directionLines.length ? `
[캐릭터별 지시]
${directionLines.join("\n")}` : ""}`;
}
