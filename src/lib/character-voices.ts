export interface CharacterVoice {
  label: string;
  voiceId: string;
  gender: "female" | "male";
  description: string;
  tags: string[];
}

export const CHARACTER_VOICES: CharacterVoice[] = [
  { label: "아오에데", voiceId: "ko-KR-Chirp3-HD-Aoede", gender: "female", description: "따뜻하고 친근한 여성", tags: ["여성", "따뜻", "친근", "편안", "대화"] },
  { label: "아우토노에", voiceId: "ko-KR-Chirp3-HD-Autonoe", gender: "female", description: "밝고 또렷한 여성", tags: ["여성", "밝은", "또렷", "활기", "젊은"] },
  { label: "칼리로에", voiceId: "ko-KR-Chirp3-HD-Callirrhoe", gender: "female", description: "차분하고 부드러운 여성", tags: ["여성", "차분", "부드러운", "감성", "잔잔"] },
  { label: "데스피나", voiceId: "ko-KR-Chirp3-HD-Despina", gender: "female", description: "자신감 있고 세련된 여성", tags: ["여성", "자신감", "세련", "시크", "성인"] },
  { label: "에리노메", voiceId: "ko-KR-Chirp3-HD-Erinome", gender: "female", description: "발랄하고 귀여운 여성", tags: ["여성", "발랄", "귀여운", "캐릭터", "젊은"] },
  { label: "가크룩스", voiceId: "ko-KR-Chirp3-HD-Gacrux", gender: "female", description: "안정감 있는 성숙한 여성", tags: ["여성", "성숙", "안정", "신뢰", "내레이션"] },
  { label: "코레", voiceId: "ko-KR-Chirp3-HD-Kore", gender: "female", description: "맑고 자연스러운 여성", tags: ["여성", "맑은", "자연", "일상", "친근"] },
  { label: "제피르", voiceId: "ko-KR-Chirp3-HD-Zephyr", gender: "female", description: "경쾌하고 에너지 있는 여성", tags: ["여성", "경쾌", "에너지", "밝은", "활기"] },
  { label: "캐론", voiceId: "ko-KR-Chirp3-HD-Charon", gender: "male", description: "낮고 진중한 남성", tags: ["남성", "낮은", "진중", "무게", "내레이션"] },
  { label: "펜리르", voiceId: "ko-KR-Chirp3-HD-Fenrir", gender: "male", description: "힘 있고 활기찬 남성", tags: ["남성", "힘", "활기", "에너지", "자신감"] },
  { label: "오루스", voiceId: "ko-KR-Chirp3-HD-Orus", gender: "male", description: "차분하고 편안한 남성", tags: ["남성", "차분", "편안", "부드러운", "대화"] },
  { label: "퍽", voiceId: "ko-KR-Chirp3-HD-Puck", gender: "male", description: "재치 있고 장난스러운 남성", tags: ["남성", "재치", "장난", "코믹", "캐릭터"] },
  { label: "이아페투스", voiceId: "ko-KR-Chirp3-HD-Iapetus", gender: "male", description: "선명하고 신뢰감 있는 남성", tags: ["남성", "선명", "신뢰", "설명", "성인"] },
];

export function findCharacterVoice(voiceId: string) {
  return CHARACTER_VOICES.find((voice) => voice.voiceId === voiceId);
}

export function searchCharacterVoices(query: string) {
  const tokens = query
    .toLocaleLowerCase("ko-KR")
    .split(/[\s,./]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !["한국어", "목소리", "음성", "보이스"].includes(token));
  if (tokens.length === 0) return CHARACTER_VOICES;

  return CHARACTER_VOICES
    .map((voice, index) => {
      const haystack = [voice.label, voice.description, ...voice.tags].join(" ").toLocaleLowerCase("ko-KR");
      const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
      return { voice, score, index };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.voice);
}
