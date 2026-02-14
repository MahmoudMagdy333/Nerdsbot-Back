import express from "express";
import cors from "cors";
import assistantRouter from "./routes/assistant";
import { connectDB } from "./services/db";
import { PORT } from "./config";

async function start() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Try to connect to MongoDB but don't crash the server on auth/indexing errors.
  try {
    await connectDB();
    console.log("Connected to MongoDB");
  } catch (err: any) {
    console.warn("Warning: could not connect to MongoDB — RAG will be disabled. Check MONGODB_URI and Atlas network/user settings.", err && err.message ? err.message : err);
  }

  app.get("/api/health", (_, res) => res.json({ status: "ok" }));
  app.use("/api", assistantRouter);

  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
