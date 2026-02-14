import express from "express";
import { generateText, getEmbedding } from "../services/hfClient";
import { searchByVector, upsertKnowledge } from "../services/db";
import { HF_TEXT_MODEL, HF_EMBEDDING_MODEL, HF_API_KEY, HF_MAX_TOKENS } from "../config";

const router = express.Router();

// POST /api/assistant
// body: { message: string, useRag?: boolean }
router.post("/assistant", async (req, res) => {
  try {
    const { message, useRag = true } = req.body;
    if (!message) return res.status(400).json({ error: "message is required" });

    console.debug('[assistant] received message length=', String(message).length, 'useRag=', useRag);

    // 1) Get embedding for the user query (fail gracefully — proceed without RAG)
    let qEmbedding: number[] = [];
    try {
      qEmbedding = await getEmbedding(message, HF_EMBEDDING_MODEL);
      console.debug('[assistant] embedding success length=', qEmbedding.length);
    } catch (embedErr: any) {
      console.warn("Embedding failed — continuing without RAG. Reason:", embedErr && embedErr.message ? embedErr.message : embedErr);
      qEmbedding = [];
    }

    // 2) If RAG requested and embedding available, search similar docs from MongoDB
    let contexts: string[] = [];
    let sources: Array<{ question: string; answer: string; comment?: string; score?: number }> = [];
    if (useRag && qEmbedding.length > 0) {
      try {
        const results = await searchByVector(qEmbedding, 3);
        console.debug('[assistant] RAG results count=', results.length);
        sources = results.map((r: any) => ({ question: r.question, answer: r.answer, comment: r.comment, score: r.score }));
        contexts = results.map((r: any) => `Q: ${r.question}\nA: ${r.answer}`);

        // If top result is a high-confidence match, return the stored answer verbatim
        if (sources.length > 0 && typeof sources[0].score === 'number' && sources[0].score >= 0.75) {
          console.debug('[assistant] high-confidence RAG hit — returning stored answer verbatim');
          return res.json({ reply: sources[0].answer, sources });
        }
      } catch (dbErr: any) {
        console.warn("RAG search failed — continuing without RAG. Reason:", dbErr && dbErr.message ? dbErr.message : dbErr);
        // leave contexts/sources empty and proceed with generation-only
      }
    } else {
      console.debug('[assistant] skipping RAG (useRag=', useRag, ', embeddingLen=', qEmbedding.length, ')');
    }

    // 3) Build prompt
    const prompt = `You are a helpful assistant. Use the context when available.\n\nContext:\n${contexts.join("\n---\n")}\n\nUser: ${message}\nAssistant:`;

    // 4) Query HuggingFace model (if unavailable, return a safe fallback message)
    let generated = '';
    try {
      generated = await generateText(prompt, HF_TEXT_MODEL, HF_MAX_TOKENS);
      console.debug('[assistant] generation success length=', String(generated).length);
    } catch (genErr: any) {
      console.error('Text generation failed:', genErr && genErr.message ? genErr.message : genErr);
      generated = "Sorry — the assistant is temporarily unavailable. Try again later.";
    }

    // 5) Return the result + sources
    res.json({ reply: generated, sources });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// POST /api/assistant/upsert-knowledge
// add a knowledge doc (question, answer, comment) — will compute embedding and store
router.post("/assistant/upsert-knowledge", async (req, res) => {
  try {
    const { question, answer, comment } = req.body;
    if (!question || !answer) return res.status(400).json({ error: "question and answer are required" });
    const embedding = await getEmbedding(`${question}\n${answer}`);
    await upsertKnowledge({ question, answer, comment, embedding });
    res.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    const msg = err && err.message ? err.message : String(err);
    if (msg.includes("DB not connected") || msg.toLowerCase().includes("could not connect") || msg.toLowerCase().includes("authentication failed")) {
      return res.status(503).json({ error: "Database unavailable — check MONGODB_URI, Atlas user/whitelist settings." });
    }
    res.status(500).json({ error: msg });
  }
});

// Diagnostic endpoint to test HuggingFace API access and models
router.get('/debug/hf', async (_req, res) => {
  try {
    const key = HF_API_KEY || process.env.HF_API_KEY || '';
    
    if (!key || key === 'YOUR_HF_API_KEY_HERE') {
      return res.json({ 
        error: 'HF_API_KEY not configured',
        instructions: 'Get your API key from https://huggingface.co/settings/tokens and set it in .env'
      });
    }

    // HuggingFace doesn't provide a public model listing API like this,
    // so we'll just return the configured models
    const configuredModels = {
      textModel: HF_TEXT_MODEL,
      embeddingModel: HF_EMBEDDING_MODEL
    };

    // Test text generation
    let textTest: any = { model: HF_TEXT_MODEL };
    try {
      const text = await generateText("Say hello!", HF_TEXT_MODEL, 50);
      textTest.success = true;
      textTest.response = text;
    } catch (err: any) {
      textTest.error = String(err?.message ?? err);
    }

    // Test embedding
    let embedTest: any = { model: HF_EMBEDDING_MODEL };
    try {
      const embedding = await getEmbedding("Test embedding", HF_EMBEDDING_MODEL);
      embedTest.success = true;
      embedTest.dimensionality = embedding.length;
    } catch (err: any) {
      embedTest.error = String(err?.message ?? err);
    }

    res.json({ 
      apiKeyConfigured: true,
      configuredModels,
      textGeneration: textTest,
      embeddings: embedTest
    });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message ?? err) });
  }
});

export default router;
