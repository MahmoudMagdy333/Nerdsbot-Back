# NerdAlert — Backend (Node + TypeScript)

This backend provides an LLM assistant endpoint using HuggingFace (text generation + embeddings), plus a RAG flow backed by MongoDB Atlas vector search.

## Features
- POST `/api/assistant` — generates LLM reply; `useRag` (default true) augments responses with nearest knowledge docs
- POST `/api/assistant/upsert-knowledge` — add/update knowledge doc (auto-embeds)
- Seed script inserts example docs including a editable `Who are you?` entry
- Uses `.env` for secrets and MongoDB Atlas

## Quick start
1. Copy `.env.example` → `.env` and fill values (HF_API_KEY, MONGODB_URI).
2. Install & run:
   - npm install
   - npm run seed    # seeds two docs (includes "Who are you?")
   - npm run dev

## Important: Atlas Search index (vector)
Create an Atlas Search index on the `knowledge` collection mapping the `embedding` field as a knnVector. Example index definition (Atlas UI or Atlas Admin API):

{
  "fields": [
    {
      "type": "knnVector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    }
  ]
}

Note: `numDimensions` must match your embedding model (HuggingFace `sentence-transformers/all-mpnet-base-v2` -> 768).

## Edit the seeded response
Open your MongoDB Atlas cluster, `nerdalert` DB → `knowledge` collection, and edit the `answer` or `comment` field for question "Who are you?" — that text will be surfaced by RAG.

## Environment variables
See `.env.example`.

## Models
- Text generation and embedding models can be changed via `.env`.

## Security / production notes
- Keep `HF_API_KEY` secret
- For production, add rate limiting, authentication and error monitoring

