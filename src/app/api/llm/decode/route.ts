export const runtime = "nodejs";
export async function POST(req: Request) {
  const { runBigmodelDecode } = await import("@/server/llm/bigmodel");

  let body: unknown = null;
  try {
    body = (await req.json()) as unknown;
  } catch {
    body = null as unknown;
  }
  const obj = body as { mode?: unknown; context?: unknown; options?: unknown } | null;
  const mode = typeof obj?.mode === "string" ? obj.mode : null;
  if (!mode) return new Response("缺少 mode。", { status: 400 });
  if (mode !== "result_current" && mode !== "model_current" && mode !== "result_history" && mode !== "llm_direct") {
    return new Response("mode 不支持。", { status: 400 });
  }
  if (!obj?.context) return new Response("缺少 context。", { status: 400 });

  return runBigmodelDecode({
    mode,
    context: obj.context,
    options: (obj.options as { model?: string; stream?: boolean; thinking?: boolean } | undefined) ?? undefined,
  });
}
