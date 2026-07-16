export type CharacterBackground = "white" | "scene";

export interface CharacterCreatorSettings {
  name: string;
  gender: string;
  age: string;
  mood: string;
  hair: string;
  outfit: string;
  style: string;
  details: string;
  background: CharacterBackground;
}

function line(label: string, value: string) {
  const normalized = value.trim();
  return normalized ? `- ${label}: ${normalized}` : null;
}

export function buildOriginalCharacterPrompt(settings: CharacterCreatorSettings) {
  const profile = [
    line("이름", settings.name),
    line("성별 표현", settings.gender),
    line("연령대", settings.age),
    line("인상과 분위기", settings.mood),
    line("헤어스타일", settings.hair),
    line("의상", settings.outfit),
    line("그림 스타일", settings.style),
    line("추가 디테일", settings.details),
  ].filter(Boolean);
  const background = settings.background === "white"
    ? "순수한 흰색 배경, 소품과 풍경 없음, 캐릭터 전신 실루엣이 선명하게 분리됨"
    : "캐릭터의 콘셉트에 어울리는 절제된 장면 배경, 캐릭터보다 배경의 시각적 밀도를 훨씬 낮게 유지";

  return [
    "새로운 오리지널 웹툰 캐릭터의 정면 전신 기준 이미지를 제작한다.",
    "동일 캐릭터를 이후 여러 장면과 시점에서 일관되게 재현할 수 있도록 얼굴, 헤어, 체형, 의상 디자인을 명확하고 고유하게 만든다.",
    "",
    "[캐릭터 설정]",
    ...profile,
    `- 배경: ${background}`,
    "",
    "[출력 기준]",
    "- 한 명의 캐릭터만 화면 중앙에 배치한다.",
    "- 머리끝부터 발끝까지 잘리지 않는 자연스러운 정면 전신 포즈로 그린다.",
    "- 얼굴과 손의 형태를 정확하게 유지하고, 글자·로고·워터마크·말풍선을 넣지 않는다.",
    "- 캐릭터 시트에 바로 사용할 수 있는 깔끔한 완성 이미지로 출력한다.",
  ].join("\n");
}
