import { HfInference } from "@huggingface/inference";
import { HF_API_KEY, HF_MAX_TOKENS } from "../config";

if (!HF_API_KEY) {
  throw new Error("HF_API_KEY not set in environment variables");
}

// Initialize HuggingFace Inference API
const hf = new HfInference(HF_API_KEY);

// -------------------- TEXT GENERATION --------------------
export async function generateText(prompt: string, model = "mistralai/Mistral-7B-Instruct-v0.2", max_new_tokens?: number): Promise<string> {
  const maxTokens = typeof max_new_tokens === 'number' ? max_new_tokens : HF_MAX_TOKENS;
  console.debug(`[hfClient] generateText model=${model} promptLen=${prompt.length} maxTokens=${maxTokens}`);

  try {
    const response = await hf.chatCompletion({
      model,
      messages: [
        { role: "user", content: prompt }
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    });

    const text = response.choices?.[0]?.message?.content || "";

    console.debug(`[hfClient] generateText success, responseLen=${text.length}`);
    return text;
  } catch (err: any) {
    console.error(`[hfClient] generateText failed: ${err?.message ?? err}`);
    throw new Error(`HuggingFace text generation failed: ${err?.message ?? err}`);
  }
}

// -------------------- EMBEDDINGS --------------------
export async function getEmbedding(text: string, model = "sentence-transformers/all-mpnet-base-v2"): Promise<number[]> {
  console.debug(`[hfClient] getEmbedding model=${model} textLen=${text.length}`);
  
  try {
    const response = await hf.featureExtraction({
      model,
      inputs: text,
    });
    
    // The response can be a nested array, flatten if needed
    let embedding: number[];
    if (Array.isArray(response) && Array.isArray(response[0])) {
      // Sometimes returns [[...values]] for single input
      embedding = response[0] as number[];
    } else if (Array.isArray(response)) {
      embedding = response as number[];
    } else {
      throw new Error("Invalid embedding response from HuggingFace");
    }
    
    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      throw new Error("Invalid embedding response from HuggingFace");
    }
    
    console.debug(`[hfClient] getEmbedding success, embeddingLen=${embedding.length}`);
    return embedding;
  } catch (err: any) {
    console.error(`[hfClient] getEmbedding failed: ${err.message}`);
    throw new Error(`HuggingFace embedding failed: ${err.message}`);
  }
}
