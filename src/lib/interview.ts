import { capabilitiesFor } from "./providers/capabilities";
import type {
  ChatRequest, DocumentBlock, ProviderId,
} from "./providers/types";

export type ResolvedCv =
  | { kind: "none" }
  | { kind: "text"; text: string }
  | { kind: "file"; mode: "extract"; text: string }
  | { kind: "file"; mode: "direct"; fileId: string };

/** Receives only verified, server-resolved CV data; never a browser upload token. */
export function buildCvBlocks(cv: ResolvedCv, provider: ProviderId, model: string): DocumentBlock[] {
  if (cv.kind === "none") return [];
  if (cv.kind === "file" && cv.mode === "direct") {
    if (!capabilitiesFor(provider, model).readsPdf) throw new Error("Model không hỗ trợ đọc PDF trực tiếp");
    if (!cv.fileId.trim()) throw new Error("Thiếu tham chiếu PDF đã xác minh");
    return [{ kind: "file", fileId: cv.fileId, mediaType: "application/pdf" }];
  }
  const text = cv.text.trim();
  if (!text) throw new Error("CV không có văn bản để đọc");
  return [{ kind: "text", text: `<<<CV>>>\n${text}\n<<<END CV>>>` }];
}

export type PromptMessage =
  | { role: "user"; content: DocumentBlock[] }
  | { role: "assistant"; blocks: unknown[] }
  | { role: "system"; text: string };

export type PromptLayout = {
  /** Provider's leading system/developer instruction; never includes the CV. */
  leadingInstruction: string;
  messages: PromptMessage[];
};

/**
 * The one authority for prompt ordering. An adapter only translates these turns
 * into its SDK's wire format. The opening user message and its CV stay at index
 * zero on every subsequent turn; the Anthropic system turn stays immediately
 * after it, not at the moving end of the conversation.
 */
export function buildMessages(
  req: ChatRequest,
  provider: ProviderId,
  instruction: string = req.newTurn,
): PromptLayout {
  const caps = capabilitiesFor(provider, req.model);
  const midSystem = caps.midConversationSystem;
  const messages: PromptMessage[] = [];
  let opening = false;
  for (const turn of req.history) {
    if (turn.role === "assistant") {
      messages.push({ role: "assistant", blocks: turn.blocks });
      continue;
    }
    if ("synthetic" in turn && turn.synthetic) {
      if (opening || messages.length !== 0) throw new Error("Lượt mở đầu không hợp lệ");
      opening = true;
      messages.push({ role: "user", content: [{ kind: "text", text: turn.text }, ...(req.attachments ?? [])] });
      if (midSystem) messages.push({ role: "system", text: req.sessionConfig });
    } else {
      messages.push({ role: "user", content: [{ kind: "text", text: turn.text }] });
    }
  }
  if (req.history.length > 0 && !opening) throw new Error("Thiếu lượt mở đầu tổng hợp");
  if (req.history.length === 0) {
    messages.push({ role: "user", content: [{ kind: "text", text: instruction }, ...(req.attachments ?? [])] });
    if (midSystem) messages.push({ role: "system", text: req.sessionConfig });
  } else {
    messages.push({ role: "user", content: [{ kind: "text", text: instruction }] });
  }
  return {
    leadingInstruction: midSystem ? req.coreSystem : `${req.coreSystem}\n\n${req.sessionConfig}`,
    messages,
  };
}

/** Parse only the completed text, never an SSE delta or stored provider blocks. */
export function splitInterviewText(text: string, mode: "strict" | "coaching"):
  { feedback: string | null; question: string } {
  if (mode === "coaching") {
    const match = /^\s*<feedback>([^<>]+)<\/feedback>\s*<question>([^<>]+)<\/question>\s*$/.exec(text);
    if (match && match[1].trim() && match[2].trim()) {
      return { feedback: match[1].trim(), question: match[2].trim() };
    }
  }
  return { feedback: null, question: text };
}
