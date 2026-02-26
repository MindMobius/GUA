export const runtime = "nodejs";

export async function GET() {
  const { resolveBigmodelConfig, toClientConfig } = await import("@/server/llm/config");
  const resolved = resolveBigmodelConfig();
  if ("response" in resolved) return resolved.response;
  return Response.json(toClientConfig(resolved.config));
}
