import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GoogleGenAI } from "@google/genai";

const PRIMARY_KEY = process.env.GEMINI_API_KEY!;
const FALLBACK_KEY = process.env.GEMINI_API_KEY_FALLBACK!;

const genaiPrimary = new GoogleGenAI({ apiKey: PRIMARY_KEY });
const genaiFallback = FALLBACK_KEY
  ? new GoogleGenAI({ apiKey: FALLBACK_KEY })
  : null;

async function buildSystemPrompt(userId: string): Promise<string> {
  const [knowledgeItems, recentPosts, user] = await Promise.all([
    prisma.chatKnowledge.findMany(),
    prisma.boardPost.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { title: true, content: true, _count: { select: { likes: true, comments: true } } },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, tier: true, credits: true },
    }),
  ]);

  const knowledgeSection = knowledgeItems.length
    ? knowledgeItems
        .map((k) => `[${k.category}] ${k.title}\n${k.content}`)
        .join("\n\n")
    : "등록된 지식 베이스가 없습니다.";

  const postsSection = recentPosts.length
    ? recentPosts
        .map(
          (p) => {
            const counts = (p as unknown as { _count: { likes: number; comments: number } })._count;
            return `- ${p.title} (❤️${counts.likes} 💬${counts.comments}): ${p.content.length > 80 ? p.content.slice(0, 80) + "..." : p.content}`;
          }
        )
        .join("\n")
    : "최근 게시글이 없습니다.";

  const userInfo = user
    ? `사용자 이름: ${user.name ?? "미설정"}, 등급: ${user.tier}, 잔여 크레딧: ${user.credits}`
    : "사용자 정보 없음";

  return `너는 "워니봇"이야. "워니바나나봇" 서비스의 AI 도우미야.
서비스 이용 방법, 기능, 요금제, 크레딧, 커뮤니티 관련 질문에 한국어로 친절하게 답변해.
아래 지식 베이스와 커뮤니티 게시글을 참고해서 답변해줘.
답을 모르면 솔직하게 모른다고 말하고, 고객센터 연결을 안내해.
사용자가 화가 나 있거나 "사람 연결", "상담원", "도움" 등 사람 도움을 요청하면, 답변 끝에 반드시 [NEED_HUMAN] 마커를 포함해.

--- 지식 베이스 ---
${knowledgeSection}

--- 최근 커뮤니티 게시글 ---
${postsSection}

--- 현재 사용자 정보 ---
${userInfo}
`;
}

async function generateReply(
  genai: GoogleGenAI,
  systemPrompt: string,
  history: { role: string; content: string }[],
  message: string
): Promise<string> {
  const contents = [
    { role: "user" as const, parts: [{ text: systemPrompt }] },
    { role: "model" as const, parts: [{ text: "네, 워니봇으로서 도와드리겠습니다!" }] },
    ...history.map((m) => ({
      role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
      parts: [{ text: m.content }],
    })),
    { role: "user" as const, parts: [{ text: message }] },
  ];

  const config: Record<string, unknown> = {
    temperature: 1.5,
    thinkingConfig: {
      thinkingLevel: "MINIMAL",
    },
  };

  const response = await genai.models.generateContentStream({
    model: "gemini-3.1-flash-lite-preview",
    contents,
    config,
  });

  let text = "";
  for await (const chunk of response) {
    if (chunk.text) text += chunk.text;
  }
  return text;
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await req.json();
    const { message, history } = body as {
      message: string;
      history: { role: string; content: string }[];
    };

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "message는 필수입니다." },
        { status: 400 }
      );
    }

    const systemPrompt = await buildSystemPrompt(session.userId);

    let reply: string;
    try {
      reply = await generateReply(
        genaiPrimary,
        systemPrompt,
        history ?? [],
        message
      );
    } catch (primaryError) {
      if (!genaiFallback) throw primaryError;
      console.warn("Primary Gemini key failed, trying fallback:", primaryError);
      reply = await generateReply(
        genaiFallback,
        systemPrompt,
        history ?? [],
        message
      );
    }

    const needHuman = reply.includes("[NEED_HUMAN]");
    const cleanReply = reply.replace(/\[NEED_HUMAN\]/g, "").trim();

    return NextResponse.json({ reply: cleanReply, needHuman });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Chat error:", error);
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
