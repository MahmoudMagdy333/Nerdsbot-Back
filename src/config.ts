import dotenv from "dotenv";
dotenv.config();

export const PORT = process.env.PORT || 4000;
export const MONGODB_URI = process.env.MONGODB_URI || "";
export const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "nerdalert";
export const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";
export const HF_API_KEY = process.env.HF_API_KEY || "";
export const HF_TEXT_MODEL = process.env.HF_TEXT_MODEL || "mistralai/Mistral-7B-Instruct-v0.2";
export const HF_EMBEDDING_MODEL = process.env.HF_EMBEDDING_MODEL || "sentence-transformers/all-mpnet-base-v2";
export const HF_MAX_TOKENS = Number(process.env.HF_MAX_TOKENS || "450");
