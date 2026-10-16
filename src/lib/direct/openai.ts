import OpenAI, { toFile } from "openai";
import { toResponseInputItems } from "openai/lib/responses/ResponseInputItems";
import type { Response, ResponseInput } from "openai/resources/responses/responses";
import { capabilitiesFor } from "../providers/capabilities";
import type { ChatRequest, ProviderAdapter, ProviderAuth, StructuredRequest, TurnResult } from "../providers/types";
import { normalizeUsage } from "../usage";
import { browserError, browserTurnStream, DirectError, requireBrowserKey } from "./browser-fetch";

const id = "openai" as const;

function client(auth: ProviderAuth): OpenAI {
  requireBrowserKey(auth.apiKey, id);
  return new OpenAI({ apiKey: auth.apiKey, dangerouslyAllowBrowser: true });
}

function input(req: ChatRequest): ResponseInput {
  const history: ResponseInput = [];
  for (const turn of req.history) {
    if (turn.role === "user") history.push({ role: "user", content: turn.text });
    else history.push(...toResponseInputItems(turn.blocks as Response["output"]));
  }
  const content: Array<{ type: "input_text"; text: string } | { type: "input_file"; file_id: string }> = [
    { type: "input_text", text: req.newTurn },
  ];
  for (const attachment of req.attachments ?? []) {
    if (attachment.kind === "text") content.push({ type: "input_text", text: attachment.text ?? "" });
    else if (attachment.fileId && capabilitiesFor(id, req.model).readsPdf) {
      content.push({ type: "input_file", file_id: attachment.fileId });
    } else throw new DirectError("request", id);
  }
  // OpenAI has no mid-conversation system role. Session config precedes the transcript.
  return [{ role: "developer", content: req.coreSystem + "\n" + req.sessionConfig }, ...history,
    { role: "user", content }];
}

function options(req: ChatRequest) {
  const caps = capabilitiesFor(id, req.model);
  return {
    model: req.model, max_output_tokens: req.maxTokens, input: input(req), store: false,
    include: ["reasoning.encrypted_content" as const],
    ...(caps.reasoningLevels.includes(req.reasoning) && req.reasoning !== "off"
      ? { reasoning: { effort: req.reasoning } } : {}),
  };
}

function stop(response: Response): TurnResult["stopReason"] {
  if (response.status === "incomplete" && response.incomplete_details?.reason === "max_output_tokens") return "max_tokens";
  if (response.output.some((item) => item.type === "message" &&
    item.content.some((part) => part.type === "refusal"))) return "refusal";
  return response.status === "completed" ? "end_turn" : "other";
}

function usage(response: Response) {
  return normalizeUsage({ input: response.usage?.input_tokens, output: response.usage?.output_tokens,
    cacheRead: response.usage?.input_tokens_details?.cached_tokens,
    cacheWrite: response.usage?.input_tokens_details?.cache_write_tokens });
}

function result(response: Response): TurnResult {
  const stopReason = stop(response);
  return { blocks: response.output, text: stopReason === "refusal" ? "" : response.output_text,
    stopReason, usage: usage(response) };
}

export function createDirectOpenAI(): ProviderAdapter {
  return {
    id, capabilities: capabilitiesFor(id, "gpt-5"),
    stream(auth, req) {
      return browserTurnStream(id, async function* () {
        const events = await client(auth).responses.create({ ...options(req), stream: true });
        let complete: Response | undefined;
        for await (const event of events) {
          if (event.type === "response.output_text.delta") yield { text: event.delta };
          else if (event.type === "response.completed" || event.type === "response.incomplete" || event.type === "response.failed") complete = event.response;
        }
        if (!complete || complete.status === "failed") throw new DirectError("provider", id);
        return result(complete);
      });
    },
    async structured(auth, req: StructuredRequest) {
      // Model không có structured output thì trả lỗi **trước khi gọi mạng**: đường
      // dự phòng §6.3 của ứng dụng phải chịu trách nhiệm parse, không phải
      // `JSON.parse` trên văn bản tự do. Xem docs/02-DESIGN.md §6.3.
      if (!capabilitiesFor(id, req.model).structuredOutput) throw new DirectError("request", id);
      try {
        const response = await client(auth).responses.create({
          ...options({ ...req, newTurn: req.instruction }),
          text: {
            format: { type: "json_schema", name: "interview_evaluation", schema: req.jsonSchema, strict: true },
          },
        });
        if (stop(response) !== "end_turn") throw new DirectError("provider", id);
        return { data: JSON.parse(response.output_text) as unknown, blocks: response.output, usage: usage(response) };
      } catch (error) { throw browserError(id, error); }
    },
    async upload(auth, file) {
      try {
        const uploaded = await client(auth).files.create({
          file: await toFile(file, "cv.pdf"), purpose: "user_data",
        });
        return { id: uploaded.id };
      } catch (error) { throw browserError(id, error); }
    },
    async deleteFile(auth, fileId) {
      try { await client(auth).files.delete(fileId); }
      catch (error) { throw browserError(id, error); }
    },
    async listModels(auth) {
      try {
        const page = await client(auth).models.list();
        return page.data.map((model) => ({ id: model.id, displayName: model.id,
          verified: null }));
      } catch (error) { throw browserError(id, error); }
    },
  };
}
