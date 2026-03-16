import { query } from "../db/kuzu.js";
import { nextId } from "../db/ids.js";
import { regenerateSummary } from "../summary.js";

export async function logEnvFact(args: {
  key: string;
  value: string;
  category?: string;
}): Promise<{ message: string }> {
  const category = args.category ?? "general";

  // Check if key already exists
  const existing = await query(`MATCH (e:EnvFact {key: $key}) RETURN e.id AS id`, { key: args.key });

  if (existing.length > 0) {
    // Update existing
    await query(
      `MATCH (e:EnvFact {key: $key}) SET e.value = $value, e.category = $category`,
      { key: args.key, value: args.value, category }
    );
  } else {
    // Create new
    const id = await nextId("envfact");
    await query(
      `CREATE (e:EnvFact {id: $id, key: $key, value: $value, category: $category})`,
      { id, key: args.key, value: args.value, category }
    );
  }

  await regenerateSummary();
  return { message: `EnvFact '${args.key}' set to '${args.value}'` };
}

export async function getEnvFacts(args: {
  category?: string;
}): Promise<Record<string, unknown>[]> {
  if (args.category) {
    return await query(
      `MATCH (e:EnvFact {category: $category}) RETURN e.id AS id, e.key AS key, e.value AS value, e.category AS category`,
      { category: args.category }
    );
  }
  return await query(
    `MATCH (e:EnvFact) RETURN e.id AS id, e.key AS key, e.value AS value, e.category AS category`
  );
}
