import type { DecodeMode } from "@/server/llm/decodePrompts";
import { buildDecodeUserContent, getDecodeSystemPrompt } from "@/server/llm/decodePrompts";
import { resolveBigmodelConfig } from "@/server/llm/config";

type DecodeOptions = {
  model?: string;
  stream?: boolean;
  thinking?: boolean;
};

type DecodeRequest = {
  mode: DecodeMode;
  context: unknown;
  options?: DecodeOptions;
};

type UpstreamDelta = {
  choices?: Array<{
    delta?: { content?: string; reasoning_content?: string; text?: string };
    message?: { content?: string; reasoning_content?: string };
    reasoning_content?: string;
    text?: string;
  }>;
  output_text?: string;
  content?: string;
  reasoning_content?: string;
};

function extractParts(payload: unknown): { content: string; reasoning: string } {
  const obj = payload as UpstreamDelta;
  const c0 = Array.isArray(obj?.choices) ? obj.choices[0] : undefined;
  const delta = c0?.delta;
  const content =
    delta?.content ??
    delta?.text ??
    c0?.message?.content ??
    c0?.text ??
    obj?.output_text ??
    obj?.content ??
    "";
  const reasoning =
    delta?.reasoning_content ?? c0?.message?.reasoning_content ?? c0?.reasoning_content ?? obj?.reasoning_content ?? "";
  return {
    content: typeof content === "string" ? content : "",
    reasoning: typeof reasoning === "string" ? reasoning : "",
  };
}

function sseLine(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function runBigmodelDecode(req: DecodeRequest): Promise<Response> {
  const resolved = resolveBigmodelConfig();
  if ("response" in resolved) return resolved.response;
  const cfg = resolved.config;

  const selectedModel = (req.options?.model || cfg.defaultModel || cfg.availableModels[0] || "").trim();
  if (!selectedModel) return new Response("缺少 model。", { status: 400 });
  if (!cfg.availableModels.includes(selectedModel)) return new Response("model 不在允许列表中。", { status: 400 });

  const streamEnabled = typeof req.options?.stream === "boolean" ? req.options.stream : cfg.streamDefault;
  const thinkingRequested = typeof req.options?.thinking === "boolean" ? req.options.thinking : cfg.thinkingDefault;
  const thinkingEnabled = cfg.thinkingModels.has(selectedModel) ? thinkingRequested : false;

  const system = getDecodeSystemPrompt(req.mode);
  const userContent = buildDecodeUserContent(req.mode, req.context);

  const body: Record<string, unknown> = {
    model: selectedModel,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    stream: streamEnabled,
    max_tokens: Number.isFinite(cfg.maxTokens) ? cfg.maxTokens : 4096,
    temperature: Number.isFinite(cfg.temperature) ? cfg.temperature : 1.0,
  };
  if (thinkingEnabled) body.thinking = { type: "enabled" };

  const upstream = await fetch(cfg.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return new Response(text || `上游请求失败（HTTP ${upstream.status}）`, { status: 502 });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const contentType = upstream.headers.get("content-type") || "";

  if (!streamEnabled || !contentType.includes("text/event-stream")) {
    const text = await upstream.text().catch(() => "");
    let content = "";
    let reasoning = "";
    try {
      const json = JSON.parse(text) as unknown;
      const parts = extractParts(json);
      content = parts.content;
      reasoning = parts.reasoning;
    } catch {
      content = text;
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        if (reasoning) controller.enqueue(encoder.encode(sseLine({ t: "r", d: reasoning })));
        if (content) controller.enqueue(encoder.encode(sseLine({ t: "c", d: content })));
        controller.enqueue(encoder.encode(sseLine({ t: "done" })));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  if (!upstream.body) return new Response("上游响应缺少 body。", { status: 502 });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buffer = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          buffer += decoder.decode(value, { stream: true });

          while (true) {
            const nl = buffer.indexOf("\n");
            if (nl < 0) break;
            const rawLine = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            const line = rawLine.trim();
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data) continue;
            if (data === "[DONE]") {
              controller.enqueue(encoder.encode(sseLine({ t: "done" })));
              controller.close();
              return;
            }
            try {
              const json = JSON.parse(data) as unknown;
              const { content, reasoning } = extractParts(json);
              if (reasoning) controller.enqueue(encoder.encode(sseLine({ t: "r", d: reasoning })));
              if (content) controller.enqueue(encoder.encode(sseLine({ t: "c", d: content })));
            } catch {
              continue;
            }
          }
        }
      } catch {
        controller.enqueue(encoder.encode(sseLine({ t: "done" })));
        controller.close();
      } finally {
        reader.releaseLock();
      }

      if (buffer.trim()) {
        const lines = buffer.split("\n");
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data) continue;
          if (data === "[DONE]") break;
          try {
            const json = JSON.parse(data) as unknown;
            const { content, reasoning } = extractParts(json);
            if (reasoning) controller.enqueue(encoder.encode(sseLine({ t: "r", d: reasoning })));
            if (content) controller.enqueue(encoder.encode(sseLine({ t: "c", d: content })));
          } catch {
            continue;
          }
        }
      }

      controller.enqueue(encoder.encode(sseLine({ t: "done" })));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
