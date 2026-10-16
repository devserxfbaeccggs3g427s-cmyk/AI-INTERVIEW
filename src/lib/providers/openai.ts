import OpenAI, { toFile } from "openai";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseInput,
  ResponseInputItem,
  ResponseOutputItem,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";

import { normalizeUsage } from "../usage";
import { capabilitiesFor } from "./capabilities";
import type {
  AiConfig,
  ChatRequest,
  DocumentBlock,
  ModelInfo,
  ProviderAdapter,
  ProviderAuth,
  StructuredRequest,
  StructuredResult,
  TextDelta,
  TurnResult,
  TurnStream,
  Usage,
} from "./types";

/** Responses API: stateless input/output replay, not previous_response_id. */
function clientFor(auth: ProviderAuth): OpenAI {
  return new OpenAI({ apiKey: auth.apiKey });
}

function attachmentParts(attachments: DocumentBlock[]): Array<
  { type: "input_text"; text: string } | { type: "input_file"; file_id: string }
> {
  return attachments.map((block) => {
    if (block.kind === "text") {
      return { type: "input_text", text: `<<<CV>>>\n${block.text ?? ""}\n<<<END CV>>>` };
    }
    if (!block.fileId) throw new Error("Missing uploaded file ID");
    return { type: "input_file", file_id: block.fileId };
  });
}

function userItem(text: string, attachments: DocumentBlock[] = []): ResponseInputItem {
  return {
    role: "user",
    content: [{ type: "input_text", text }, ...attachmentParts(attachments)],
  };
}

function buildInput(req: ChatRequest | StructuredRequest, finalInstruction: string): ResponseInput {
  // OpenAI does not accept mid-conversation system messages. A changed session
  // config therefore changes the beginning of the cacheable prompt prefix.
  const input: ResponseInput = [
    { role: "developer", content: `${req.coreSystem}\n\n${req.sessionConfig}` },
  ];
  let attached = false;
  for (const turn of req.history) {
    if (turn.role === "assistant") {
      // Keep every response output item, including encrypted reasoning and phase.
      // A text-only reconstruction loses the reasoning context in stateless mode.
      // Output and input SDK unions differ for a few tool item statuses; the
      // unmodified JSON items are the documented replay format.
      input.push(...(turn.blocks as ResponseOutputItem[] as ResponseInputItem[]));
    } else {
      const docs = "synthetic" in turn && turn.synthetic && !attached ? req.attachments : undefined;
      input.push(userItem(turn.text, docs));
      if (docs?.length) attached = true;
    }
  }
  input.push(userItem(finalInstruction, attached ? [] : req.attachments));
  return input;
}

function reasoningFor(req: ChatRequest | StructuredRequest) {
  const caps = capabilitiesFor("openai", req.model);
  // In particular, never send `none` to a model whose accepted levels do not
  // include it; omitting the parameter lets OpenAI use that model's default.
  return caps.reasoningLevels.includes(req.reasoning) && req.reasoning !== "off"
    ? { effort: req.reasoning }
    : undefined;
}

function params(req: ChatRequest | StructuredRequest, instruction: string): ResponseCreateParamsNonStreaming {
  const reasoning = reasoningFor(req);
  return {
    model: req.model,
    input: buildInput(req, instruction),
    max_output_tokens: req.maxTokens,
    store: false,
    include: ["reasoning.encrypted_content"],
    ...(reasoning ? { reasoning } : {}),
  };
}

function usageOf(response: Response): Usage {
  return normalizeUsage({
    input: response.usage?.input_tokens,
    output: response.usage?.output_tokens,
    cacheRead: response.usage?.input_tokens_details?.cached_tokens,
    cacheWrite: response.usage?.input_tokens_details?.cache_write_tokens,
  });
}

function isRefusal(response: Response): boolean {
  return response.output.some(
    (item) => item.type === "message" && item.content.some((part) => part.type === "refusal"),
  );
}

function stopReason(response: Response): TurnResult["stopReason"] {
  if (response.status === "incomplete") {
    if (response.incomplete_details?.reason === "max_output_tokens") return "max_tokens";
    if (response.incomplete_details?.reason === "content_filter") return "refusal";
    return "other";
  }
  if (isRefusal(response)) return "refusal";
  return response.status === "completed" ? "end_turn" : "other";
}

function textOf(response: Response): string {
  return response.output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content)
    .filter((part) => part.type === "output_text")
    .map((part) => part.text)
    .join("");
}

function resultOf(response: Response): TurnResult {
  if (response.status === "failed" || response.error) {
    throw new Error("OpenAI response failed");
  }
  const reason = stopReason(response);
  return {
    blocks: response.output,
    text: reason === "refusal" ? "" : textOf(response),
    stopReason: reason,
    usage: usageOf(response),
  };
}

function streamResponse(auth: ProviderAuth, req: ChatRequest): TurnStream {
  let resolveFinal!: (result: TurnResult) => void;
  let rejectFinal!: (error: unknown) => void;
  const final = new Promise<TurnResult>((resolve, reject) => {
    resolveFinal = resolve;
    rejectFinal = reject;
  });
  const client = clientFor(auth);

  async function* iterate(): AsyncGenerator<TextDelta> {
    let terminal: Response | undefined;
    try {
      const stream = await client.responses.create({
        ...params(req, req.newTurn),
        stream: true,
      });
      for await (const event of stream as AsyncIterable<ResponseStreamEvent>) {
        if (event.type === "response.output_text.delta") {
          yield { text: event.delta };
        } else if (
          event.type === "response.completed" ||
          event.type === "response.incomplete" ||
          event.type === "response.failed"
        ) {
          terminal = event.response;
        } else if (event.type === "error") {
          throw new Error("OpenAI stream failed");
        }
      }
      if (!terminal) throw new Error("OpenAI stream ended without a final response");
      resolveFinal(resultOf(terminal));
    } catch (error) {
      rejectFinal(error);
      throw error;
    }
  }

  return { [Symbol.asyncIterator]: iterate, final };
}

export function createOpenAIAdapter(): ProviderAdapter {
  return {
    id: "openai",
    capabilities: capabilitiesFor("openai", "gpt-5"),
    stream: streamResponse,

    async structured(auth: ProviderAuth, req: StructuredRequest): Promise<StructuredResult> {
      const client = clientFor(auth);
      const response = await client.responses.create({
        ...params(req, req.instruction),
        text: {
          format: {
            type: "json_schema",
            name: "interview_evaluation",
            schema: req.jsonSchema,
            strict: true,
          },
        },
      });
      const outcome = resultOf(response);
      if (outcome.stopReason !== "end_turn") {
        throw new Error(`OpenAI structured response stopped: ${outcome.stopReason}`);
      }
      // Still validated against the product's Zod schema by the caller.
      return { data: JSON.parse(outcome.text) as unknown, blocks: outcome.blocks, usage: outcome.usage };
    },

    async upload(auth: ProviderAuth, file: Blob) {
      const client = clientFor(auth);
      const uploaded = await client.files.create({
        file: await toFile(file, "cv.pdf"),
        purpose: "user_data",
      });
      return { id: uploaded.id };
    },

    async deleteFile(auth: ProviderAuth, id: string): Promise<void> {
      await clientFor(auth).files.delete(id);
    },

    async listModels(auth: ProviderAuth, _cfg: AiConfig): Promise<ModelInfo[]> {
      const page = await clientFor(auth).models.list();
      return page.data.map((model) => ({
        id: model.id,
        displayName: model.id,
        // /models returns no model-specific capability metadata.
        verified: null,
      }));
    },
  };
}
