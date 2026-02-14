import { MongoClient, Db, Document } from "mongodb";
import { MONGODB_URI, MONGO_DB_NAME } from "../config";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectDB() {
  if (db) return db;
  if (!MONGODB_URI) throw new Error("MONGODB_URI is not set in .env");

  // Basic validation to catch common placeholder/format mistakes early
  const placeholderPatterns = ["<", ">", "your_password", "<password>", "PASSWORD"];
  if (placeholderPatterns.some((p) => MONGODB_URI.includes(p))) {
    throw new Error(
      "MONGODB_URI looks like a placeholder or contains invalid characters. Please update the .env file with a valid MongoDB connection string (replace the <password> placeholder)."
    );
  }

  client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
  } catch (err: any) {
    // Surface a clearer error message for auth/network problems
    const msg = err && err.message ? err.message : String(err);
    throw new Error(`Failed to connect to MongoDB: ${msg}`);
  }

  db = client.db(MONGO_DB_NAME);
  return db;
}

export function getDB() {
  if (!db) throw new Error("DB not connected. Call connectDB() first.");
  return db as Db;
}

export async function upsertKnowledge(doc: { question: string; answer: string; embedding: number[]; comment?: string }) {
  const collection = getDB().collection("knowledge");
  await collection.updateOne({ question: doc.question }, { $set: doc }, { upsert: true });
}

export async function searchByVector(vector: number[], k = 3) {
  const collection = getDB().collection("knowledge");

  // Basic sanity checks
  if (!Array.isArray(vector)) throw new Error("searchByVector: vector must be an array");
  console.debug(`[db] searchByVector vectorLen=${vector.length} k=${k}`);

  // Try using Atlas default index first (do not hard-code `index` so Atlas will use the active default)
  const pipelineDefaultIndex = [
    {
      $search: {
        knnBeta: {
          vector,
          path: "embedding",
          k,
        },
      },
    },
    { $project: { question: 1, answer: 1, comment: 1, score: { $meta: "searchScore" } } },
  ];

  try {
    const cursor = collection.aggregate(pipelineDefaultIndex);
    const results = await cursor.toArray();
    console.debug(`[db] searchByVector returned ${results.length} rows using default index`);
    if (results.length > 0) return results as Array<Document & { score?: number }>;
  } catch (err: any) {
    console.warn('[db] searchByVector (default index) failed:', err?.message ?? err);
  }

  // Fallback: try explicit index name "default" (useful if Atlas default index isn't selected)
  const pipelineExplicit = [
    {
      $search: {
        index: "default",
        knnBeta: {
          vector,
          path: "embedding",
          k,
        },
      },
    },
    { $project: { question: 1, answer: 1, comment: 1, score: { $meta: "searchScore" } } },
  ];

  try {
    const cursor2 = collection.aggregate(pipelineExplicit);
    const results2 = await cursor2.toArray();
    console.debug(`[db] searchByVector returned ${results2.length} rows using explicit index 'default'`);
    if (results2.length > 0) return results2 as Array<Document & { score?: number }>;
  } catch (err: any) {
    console.warn('[db] searchByVector (explicit index) failed:', err?.message ?? err);
  }

  // --- BRUTE-FORCE FALLBACK ---
  // If Atlas Search returns no rows (index not present/misconfigured), perform an in-app
  // nearest-neighbour scan over stored embeddings. This keeps RAG working for small corpora.
  console.warn('[db] searchByVector: falling back to local cosine-scan (documents count may be small)');
  const docs = await collection.find({ embedding: { $exists: true } }).project({ question: 1, answer: 1, comment: 1, embedding: 1 }).toArray();

  function cosine(a: number[], b: number[]) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return -1;
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      const y = b[i];
      dot += x * y;
      na += x * x;
      nb += y * y;
    }
    if (na === 0 || nb === 0) return -1;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  const scored = docs
    .map((d: any) => ({ ...d, score: typeof d.embedding === 'object' && Array.isArray(d.embedding) ? cosine(vector, d.embedding) : -1 }))
    .filter((s: any) => typeof s.score === 'number')
    .sort((a: any, b: any) => (b.score ?? -1) - (a.score ?? -1))
    .slice(0, k);

  console.debug(`[db] searchByVector (local-scan) returning ${scored.length} rows`);
  return scored as Array<Document & { score?: number }>;
}
