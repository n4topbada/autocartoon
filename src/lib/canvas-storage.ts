export function getCanvasBlobUrls(canvas: unknown) {
  if (!canvas || typeof canvas !== "object" || Array.isArray(canvas)) return [];
  const layers = (canvas as { layers?: unknown }).layers;
  if (!Array.isArray(layers)) return [];
  return layers.flatMap((layer) => {
    if (!layer || typeof layer !== "object" || Array.isArray(layer)) return [];
    const pixelUrl = (layer as { pixelUrl?: unknown }).pixelUrl;
    return typeof pixelUrl === "string" && pixelUrl.trim() ? [pixelUrl] : [];
  });
}
