import type { RagEmbeddingDocument, RagEmbeddingProvider } from "../index.js";
import { RagEmbeddingProviderError } from "../index.js";

export type GeminiQueryTask = "question_answering" | "search_result";

export interface GeminiEmbeddingProviderOptions {
  apiKey?: string | undefined;
  model?: "gemini-embedding-2" | "gemini-embedding-001" | string | undefined;
  dimensions?: number | undefined;
  queryTask?: GeminiQueryTask | undefined;
  promptPolicy?: string | undefined;
}

type GoogleGenAIConstructor = new (options: { apiKey: string }) => {
  models: {
    embedContent(input: { model: string; contents: string[]; config?: { outputDimensionality?: number | undefined; taskType?: string | undefined; title?: string | undefined } }): Promise<unknown>;
  };
};

const importDynamic = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<Record<string, unknown>>;

export class GeminiEmbeddingProvider implements RagEmbeddingProvider {
  readonly id = "gemini";
  readonly model: string;
  readonly dimensions: number;
  readonly promptPolicy: string;
  private readonly apiKey: string;
  private readonly queryTask: GeminiQueryTask;
  private client: InstanceType<GoogleGenAIConstructor> | undefined;

  constructor(options: GeminiEmbeddingProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) throw new RagEmbeddingProviderError("GEMINI_API_KEY is required for GeminiEmbeddingProvider", { retryable: false });
    this.apiKey = apiKey;
    this.model = options.model ?? "gemini-embedding-2";
    this.dimensions = options.dimensions ?? 1536;
    this.queryTask = options.queryTask ?? "question_answering";
    this.promptPolicy = options.promptPolicy ?? `gemini.${this.model}.query_document.v1`;
  }

  async embedQuery(text: string): Promise<number[]> {
    const formatted = `task: ${this.queryTask === "question_answering" ? "question answering" : "search result"} | query: ${text}`;
    return this.embedOne(formatted, this.queryTask.toUpperCase());
  }

  async embedDocuments(documents: RagEmbeddingDocument[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (const document of documents) {
      const formatted = `title: ${document.title ?? ""} | text: ${document.text}`;
      vectors.push(await this.embedOne(formatted, "RETRIEVAL_DOCUMENT", document.title));
    }
    return vectors;
  }

  private async embedOne(text: string, taskType: string, title?: string | undefined): Promise<number[]> {
    try {
      const client = await this.getClient();
      const response = await client.models.embedContent({
        model: this.model,
        contents: [text],
        config: { outputDimensionality: this.dimensions, taskType, title }
      });
      const vector = extractVector(response);
      if (!vector) throw new Error("Gemini embedding response did not contain a numeric vector");
      return vector;
    } catch (error) {
      if (error instanceof RagEmbeddingProviderError) throw error;
      throw new RagEmbeddingProviderError("Gemini embedding request failed", { cause: error, retryable: isRetryable(error) });
    }
  }

  private async getClient(): Promise<InstanceType<GoogleGenAIConstructor>> {
    if (this.client) return this.client;
    const mod = await importDynamic("@google/genai");
    const GoogleGenAI = mod.GoogleGenAI as GoogleGenAIConstructor | undefined;
    if (!GoogleGenAI) throw new RagEmbeddingProviderError("@google/genai did not export GoogleGenAI", { retryable: false });
    this.client = new GoogleGenAI({ apiKey: this.apiKey });
    return this.client;
  }
}

function extractVector(response: unknown): number[] | undefined {
  const root = response as Record<string, unknown>;
  const embeddings = root.embeddings as unknown[] | undefined;
  const first = embeddings?.[0] as Record<string, unknown> | undefined;
  const values = first?.values ?? first?.embedding ?? root.values;
  return Array.isArray(values) && values.every((value) => typeof value === "number") ? values : undefined;
}

function isRetryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("rate") || message.includes("quota") || message.includes("timeout") || message.includes("temporarily");
}
