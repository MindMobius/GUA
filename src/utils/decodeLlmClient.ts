export type DecodeMode = "result_current" | "model_current" | "result_history" | "llm_direct";

export type DecodeOptions = {
  model?: string | null;
  stream?: boolean;
  thinking?: boolean;
};

export async function streamDecode(
  args: {
    mode: DecodeMode;
    context: unknown;
    options?: DecodeOptions;
    signal: AbortSignal;
    onContent: (delta: string) => void;
    onReasoning: (delta: string) => void;
  },
) {
  const res = await fetch("/api/llm/decode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: args.mode,
      context: args.context,
      options: {
        model: args.options?.model ?? undefined,
        stream: args.options?.stream ?? undefined,
        thinking: args.options?.thinking ?? undefined,
      },
    }),
    signal: args.signal,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `解码请求失败（HTTP ${res.status}）`);
  }
  if (!res.body) throw new Error("解码响应缺少 body。");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const consume = () => {
    while (true) {
      const sep = buffer.indexOf("\n\n");
      if (sep < 0) break;
      const event = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const lines = event.split("\n");
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          const parsed = JSON.parse(payload) as { t?: string; d?: string };
          if (parsed.t === "c" && typeof parsed.d === "string") args.onContent(parsed.d);
          if (parsed.t === "r" && typeof parsed.d === "string") args.onReasoning(parsed.d);
        } catch {
          continue;
        }
      }
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    buffer += decoder.decode(value, { stream: true });
    consume();
  }

  if (buffer.trim()) {
    buffer += "\n\n";
    consume();
  }
}

