import StudioWorkspace from "@/components/StudioWorkspace";

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const params = await searchParams;
  const mode = params.mode === "gesture" || params.mode === "video" ? params.mode : "scene";
  return <StudioWorkspace initialMode={mode} />;
}
