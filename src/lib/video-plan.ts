export interface PlannedDialogue {
  id: string;
  text: string;
  speakerPresetId: string | null;
}

export interface PlannedCutDialogue {
  cutId: string;
  dialogues: PlannedDialogue[];
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeVideoPlan(
  value: unknown,
  validCutIds: Set<string>,
  characterIdByName: Map<string, string>
) {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const rawCuts = Array.isArray(record.cuts) ? record.cuts : [];
  const seen = new Set<string>();
  return rawCuts.flatMap((item): PlannedCutDialogue[] => {
    const cut = item && typeof item === "object" && !Array.isArray(item)
      ? item as Record<string, unknown>
      : {};
    const cutId = text(cut.cutId, 128);
    if (!validCutIds.has(cutId) || seen.has(cutId)) return [];
    seen.add(cutId);
    const dialogues = (Array.isArray(cut.dialogues) ? cut.dialogues : [])
      .slice(0, 12)
      .flatMap((entry, index): PlannedDialogue[] => {
        const dialogue = entry && typeof entry === "object" && !Array.isArray(entry)
          ? entry as Record<string, unknown>
          : {};
        const value = text(dialogue.text, 1_000);
        if (!value) return [];
        return [{
          id: `dialogue_${index}_${crypto.randomUUID()}`,
          text: value,
          speakerPresetId: characterIdByName.get(text(dialogue.speakerName, 100)) ?? null,
        }];
      });
    return [{ cutId, dialogues }];
  });
}

export const VIDEO_PLAN_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    cuts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          cutId: { type: "string" },
          dialogues: {
            type: "array",
            maxItems: 12,
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                speakerName: { type: "string" },
              },
              required: ["text", "speakerName"],
            },
          },
        },
        required: ["cutId", "dialogues"],
      },
    },
  },
  required: ["cuts"],
} as const;
