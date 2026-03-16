import { EmbeddingModel, FlagEmbedding } from "fastembed";

let model: FlagEmbedding | null = null;

async function getModel(): Promise<FlagEmbedding> {
  if (model) return model;
  model = await FlagEmbedding.init({
    model: EmbeddingModel.AllMiniLML6V2,
  });
  return model;
}

/**
 * Embed a single text string. Returns a 384-dim float32 array.
 */
export async function embed(text: string): Promise<number[]> {
  const m = await getModel();
  const results = m.embed([text]);
  for await (const batch of results) {
    return Array.from(batch[0]);
  }
  throw new Error("Embedding produced no results");
}

/**
 * Embed multiple texts in batch. Returns array of 384-dim float32 arrays.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const m = await getModel();
  const allEmbeddings: number[][] = [];
  const results = m.embed(texts);
  for await (const batch of results) {
    for (const vec of batch) {
      allEmbeddings.push(Array.from(vec));
    }
  }
  return allEmbeddings;
}
