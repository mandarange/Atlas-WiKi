import type { RagEmbeddingDocument, RagEmbeddingProvider } from "../index.js";
import { RagEmbeddingProviderError } from "../index.js";

export type GeminiQueryTask = "retrieval_query" | "question_answering" | "search_result";

export interface GeminiEmbeddingProviderOptions {
  apiKey?: string | undefined;
  model?: "gemini-embedding-2" | "gemini-embedding-001" | string | undefined;
  dimensions?: number | undefined;
  queryTask?: GeminiQueryTask | undefined;
  promptPolicy?: string | undefined;
  client?: InstanceType<GoogleGenAIConstructor> | undefined;
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
    this.queryTask = options.queryTask ?? "retrieval_query";
    this.promptPolicy = options.promptPolicy ?? `gemini.${this.model}.query_document.v1`;
    this.client = options.client;
  }

  async embedQuery(text: string): Promise<number[]> {
    const taskType = this.queryTask === "question_answering" ? "QUESTION_ANSWERING" : "RETRIEVAL_QUERY";
    const formatted = `task: ${this.queryTask === "question_answering" ? "question answering" : "retrieval query"} | query: ${text}`;
    return this.embedOne(formatted, taskType);
  }

  async embedDocuments(documents: RagEmbeddingDocument[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (const document of documents) {
      const formatted = `title: ${document.title ?? ""} | text: ${document.text}`;
      vectors.push(await this.embedOne(formatted, "RETRIEVAL_DOCUMENT", document.title));
    }
    return vectors;
  }

  private async embedOne(text: string, taskType: "RETRIEVAL_QUERY" | "QUESTION_ANSWERING" | "RETRIEVAL_DOCUMENT", title?: string | undefined): Promise<number[]> {
    try {
      const client = await this.getClient();
      const response = await client.models.embedContent({
        model: this.model,
        contents: [text],
        config: this.buildConfig(taskType, title)
      });
      const vector = extractVector(response);
      if (!vector) throw new Error("Gemini embedding response did not contain a numeric vector");
      if (vector.length !== this.dimensions) {
        throw new RagEmbeddingProviderError(
          `Gemini embedding dimension mismatch: expected ${this.dimensions}, received ${vector.length}. Check the configured Gemini model/outputDimensionality; Supabase RAG uses atlas_wiki_default_1536 unless you maintain a custom migration.`,
          { retryable: false }
        );
      }
      return vector;
    } catch (error) {
      if (error instanceof RagEmbeddingProviderError) throw error;
      throw new RagEmbeddingProviderError("Gemini embedding request failed", { cause: error, retryable: isRetryable(error) });
    }
  }

  private async getClient(): Promise<InstanceType<GoogleGenAIConstructor>> {
    if (this.client) return this.client;
    let mod: Record<string, unknown>;
    try {
      mod = await importDynamic("@google/genai");
    } catch (error) {
      throw new RagEmbeddingProviderError("@google/genai optional peer dependency is required for GeminiEmbeddingProvider", { cause: error, retryable: false });
    }
    const GoogleGenAI = mod.GoogleGenAI as GoogleGenAIConstructor | undefined;
    if (!GoogleGenAI) throw new RagEmbeddingProviderError("@google/genai did not export GoogleGenAI", { retryable: false });
    this.client = new GoogleGenAI({ apiKey: this.apiKey });
    return this.client;
  }

  private buildConfig(taskType: "RETRIEVAL_QUERY" | "QUESTION_ANSWERING" | "RETRIEVAL_DOCUMENT", title?: string | undefined): { outputDimensionality?: number | undefined; taskType?: string | undefined; title?: string | undefined } {
    if (this.isGeminiEmbedding2()) return { outputDimensionality: this.dimensions };
    if (this.isGeminiEmbedding001()) return taskType === "RETRIEVAL_DOCUMENT" ? { taskType, title } : { taskType };
    return { outputDimensionality: this.dimensions };
  }

  private isGeminiEmbedding2(): boolean {
    return /(^|\/)gemini-embedding-2$/.test(this.model);
  }

  private isGeminiEmbedding001(): boolean {
    return /(^|\/)gemini-embedding-001$/.test(this.model);
  }
}

function extractVector(response: unknown): number[] | undefined {
  const root = response as Record<string, unknown>;
  const embeddings = root.embeddings as unknown[] | undefined;
  const first = embeddings?.[0] as Record<string, unknown> | undefined;
  const firstEmbedding = first?.embedding as Record<string, unknown> | undefined;
  const rootEmbedding = root.embedding as Record<string, unknown> | undefined;
  const values = first?.values ?? firstEmbedding?.values ?? rootEmbedding?.values ?? root.values;
  return Array.isArray(values) && values.every((value) => typeof value === "number") ? values : undefined;
}

function isRetryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("rate") || message.includes("quota") || message.includes("timeout") || message.includes("temporarily");
}
