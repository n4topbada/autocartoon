export interface CharacterDesignDetail {
  label: string;
  value: string;
}

export interface CharacterDesignSection {
  key: string;
  title: string;
  summary: string;
  details: CharacterDesignDetail[];
}

export interface CharacterDesign {
  characterName: string;
  sections: CharacterDesignSection[];
}

export interface CharacterDesignerResult extends CharacterDesign {
  reply: string;
  nextQuestions: string[];
}

export interface CharacterDesignerMessage {
  role: "user" | "assistant";
  content: string;
}

export const CORE_CHARACTER_SECTIONS = [
  { key: "appearance", title: "외모" },
  { key: "profile", title: "신상" },
  { key: "personality", title: "성격" },
  { key: "speech", title: "말투" },
  { key: "knowledge", title: "지식" },
  { key: "special", title: "특이사항" },
] as const;

export function createEmptyCharacterDesign(): CharacterDesign {
  return {
    characterName: "이름 미정",
    sections: CORE_CHARACTER_SECTIONS.map((section) => ({
      ...section,
      summary: "아직 정해지지 않았습니다.",
      details: [],
    })),
  };
}
