import "dotenv/config";
import { createApp } from "./app";
import { connectMongo, disconnectMongo } from "./db/mongo";

const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;

async function bootstrap() {
  // 1) Connect dependencies first
  await connectMongo();

  // 2) Create app after dependencies (optional, but clean)
  const app = createApp();

  // 3) Start server
  const server = app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
  });

  // 4) Graceful shutdown (Ctrl+C, termination signals)
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      try {
        await disconnectMongo();
        console.log("✅ Shutdown complete");
        process.exit(0);
      } catch (err) {
        console.error("❌ Error during shutdown", err);
        process.exit(1);
      }
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

bootstrap().catch((err) => {
  console.error("❌ Fatal startup error:", err);
  process.exit(1);
});