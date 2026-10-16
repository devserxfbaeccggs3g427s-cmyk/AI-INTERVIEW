/**
 * Kiểu dùng chung cho cả hai đường gọi (server `proxy` và trình duyệt `direct`).
 *
 * File này KHÔNG import SDK của hãng nào: nó nằm trong đồ thị import của trình duyệt
 * qua `capabilities.ts`, và một import SDK ở đây sẽ kéo cả key-handling của server
 * vào bundle người dùng. Xem docs/02-DESIGN.md §2.1.
 */

export type ProviderId = "anthropic" | "openai" | "gemini" | "custom";

export type ReasoningLevel = "off" | "low" | "medium" | "high";

export type CallMode = "proxy" | "direct";

export type Language = "vi" | "en";

export type StopReason =
  | "end_turn"
  | "max_tokens"
  | "refusal"
  | "other";

/**
 * Cấu hình đi trong body request.
 *
 * Cố ý KHÔNG có `apiKey`. Một trường key ở đây rất dễ bị `JSON.stringify` vào body,
 * vào `localStorage` phiên, hay vào log của một `console.log(config)` vô tâm.
 * Key đi riêng: header `x-provider-key` ở đường proxy, tham số lời gọi ở đường direct.
 * Xem docs/02-DESIGN.md §3.1.
 */
export interface AiConfig {
  provider: ProviderId;
  /** ID thô, không ép vào danh sách — người dùng tự nhập được (FR-14). */
  model: string;
  /** Chỉ dùng cho provider "custom". */
  baseUrl?: string;
  reasoning: ReasoningLevel;
  callMode: CallMode;
  /** false → key chỉ sống trong tab hiện tại, không ghi xuống `localStorage`. */
  persistKey: boolean;
}

export interface ProviderAuth {
  apiKey: string;
}

/**
 * Năng lực của một cặp provider + model.
 *
 * Mọi cờ mặc định `false`. Xem docs/02-DESIGN.md §4.3: một cờ `true` chỉ được đặt
 * khi tài liệu hãng xác nhận, và năng lực có thể thuộc về *model* chứ không thuộc hãng.
 */
export interface Capability {
  streaming: boolean;
  structuredOutput: boolean;
  readsPdf: boolean;
  reasoning: boolean;
  /** Message `role: "system"` giữa cuộc trò chuyện — chỉ Anthropic có. */
  midConversationSystem: boolean;
  /**
   * Cấu hình phiên đứng **sau** lịch sử, nên đổi nó không viết lại tiền tố cache.
   * Provider khác phải đặt nó ở chỉ thị đầu → tiền tố cache phải viết lại mỗi phiên.
   * Xem docs/02-DESIGN.md §5.2.
   */
  cacheableSessionConfig: boolean;
  /** Đặt `cache_control` tường minh được. Khác với "có cache". */
  explicitCache: boolean;
  /** Provider có trả số token đã cache hay không. Khác với `explicitCache`. */
  reportsCacheUsage: boolean;
  /** Endpoint danh sách model có kèm cờ năng lực từng model hay không. */
  modelListCarriesCapabilities: boolean;
  /**
   * Đường gọi `direct` từ trình duyệt dùng được không. Custom luôn `false`:
   * URL của nó tùy ý, và trình duyệt không có chỗ để kiểm tra địa chỉ đích.
   */
  supportsDirect: boolean;
  /**
   * Mức suy luận mà model này thực sự nhận. Rỗng nghĩa là không đổi được mức —
   * adapter phải bỏ qua tham số thay vì gửi một giá trị bị hãng từ chối.
   */
  reasoningLevels: readonly ReasoningLevel[];
}

export interface Usage {
  input: number;
  output: number;
  /** `null` = provider không công bố. Hiển thị "—", không phải `0`. */
  cacheRead: number | null;
  /** `null` = provider không công bố. */
  cacheWrite: number | null;
}

export interface DocumentBlock {
  kind: "file" | "text";
  /** Chỉ dùng khi `kind === "file"`. */
  fileId?: string;
  /** Chỉ dùng khi `kind === "text"`. */
  text?: string;
  mediaType?: string;
}

/**
 * Lượt của transcript. `blocks` là nội dung nguyên vẹn của lượt trước theo định dạng
 * **của provider đã dùng**, giữ luôn khối thinking / parts để phát lại được.
 * Xem docs/02-DESIGN.md §4.5.
 */
export type TranscriptTurn =
  | { role: "assistant"; blocks: unknown[] }
  | { role: "user"; text: string }
  /**
   * Lượt `user` tổng hợp mở đầu (lệnh mở đầu + khối CV). **Không** tính vào số
   * câu đã hỏi — nếu không, phiên 5 câu sẽ kết thúc sớm một lượt. Xem §8.2.
   */
  | { role: "user"; text: string; synthetic?: true };

export interface ChatRequest {
  model: string;
  /** Prompt lõi bất biến. Không nội suy, không timestamp. */
  coreSystem: string;
  /** Cấu hình phiên đã dựng sẵn thành văn bản. */
  sessionConfig: string;
  attachments?: DocumentBlock[];
  history: TranscriptTurn[];
  /** Câu trả lời của người dùng, hoặc lệnh mở đầu ở lượt đầu. */
  newTurn: string;
  reasoning: ReasoningLevel;
  maxTokens: number;
  language: Language;
}

export interface StructuredRequest extends Omit<ChatRequest, "newTurn"> {
  instruction: string;
  jsonSchema: Record<string, unknown>;
}

export interface StructuredResult {
  /** Chưa kiểm schema — thuộc giai đoạn 4. */
  data: unknown;
  blocks: unknown[];
  usage: Usage;
}

export interface UploadedFile {
  /**
   * KHÔNG trả thẳng giá trị này cho trình duyệt: file của Anthropic/Gemini có phạm vi
   * theo workspace, nên `file_id` thô là đường đọc chéo tệp giữa những người dùng khác
   * cùng key. Route handler phải phát ra token đã ký. Xem docs/02-DESIGN.md §7.4.
   */
  id: string;
  expiresAt?: string;
}

export interface ModelInfo {
  id: string;
  displayName: string;
  /**
   * `null` = danh sách model không kèm cờ năng lực, hoặc chưa xác nhận được.
   * FR-16: không ngầm khẳng định mọi model trong danh sách hỗ trợ đủ tính năng.
   */
  verified: Capability | null;
}

export interface TextDelta {
  text: string;
}

export interface TurnResult {
  /** Phải serialize được bằng JSON và phát lại nguyên vẹn. */
  blocks: unknown[];
  text: string;
  stopReason: StopReason;
  refusalCategory?: string;
  usage: Usage;
}

export interface TurnStream extends AsyncIterable<TextDelta> {
  final: Promise<TurnResult>;
}

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly capabilities: Capability;

  stream(auth: ProviderAuth, req: ChatRequest): TurnStream;

  structured(
    auth: ProviderAuth,
    req: StructuredRequest,
  ): Promise<StructuredResult>;

  /** Chỉ provider có Files API. */
  upload?(auth: ProviderAuth, file: Blob): Promise<UploadedFile>;
  deleteFile?(auth: ProviderAuth, id: string): Promise<void>;

  listModels?(auth: ProviderAuth, cfg: AiConfig): Promise<ModelInfo[]>;
}