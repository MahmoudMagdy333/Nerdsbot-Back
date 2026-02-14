import { connectDB, getDB, searchByVector } from "../services/db";
import { getEmbedding } from "../services/hfClient";
import { HF_EMBEDDING_MODEL } from "../config";

async function inspect() {
  await connectDB();
  const db = getDB();
  const col = db.collection("knowledge");

  const count = await col.countDocuments();
  console.log("knowledge.count=", count);

  const sample = await col.findOne({});
  if (!sample) {
    console.log("No documents found in knowledge collection.");
    process.exit(1);
  }

  console.log("sample._id=", sample._id);
  console.log("sample.keys=", Object.keys(sample));
  const emb = sample.embedding;
  console.log("sample.embedding.type=", Array.isArray(emb) ? `array(len=${emb.length})` : typeof emb);
  if (Array.isArray(emb)) {
    console.log('sample.embedding[0..5]=', emb.slice(0,5));
    console.log('sample.embedding element types (first 5)=', emb.slice(0,5).map(e => typeof e));
  }

  try {
    console.log('\n-> Running searchByVector(sample.embedding)');
    const results = await searchByVector(emb, 3);
    console.log("searchByVector(sample.embedding) -> ", results.length, "rows");
    console.log(results.slice(0,3));
  } catch (err: any) {
    console.error("searchByVector(sample.embedding) failed:", err.message || err);
  }

  // Try using a generated embedding for a sample question
  try {
    const q = "Who is Clover?";
    const qEmb = await getEmbedding(q, HF_EMBEDDING_MODEL);
    console.log(`generated embedding length=${qEmb.length}`);
    const res2 = await searchByVector(qEmb, 3);
    console.log(`searchByVector(generatedEmb) -> ${res2.length} rows`);
    console.log(res2.slice(0,3));
  } catch (err: any) {
    console.error("searchByVector(generatedEmb) failed:", err.message || err);
  }

  process.exit(0);
}

inspect().catch((e) => { console.error(e); process.exit(1); });