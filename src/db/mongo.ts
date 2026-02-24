import mongoose from "mongoose";

let mongoReady = false;

export async function connectMongo(): Promise<void> {
  const mongoUrl = process.env.MONGO_URL;

  if (!mongoUrl) {
    throw new Error("MONGO_URL is missing in environment variables");
  }

  // Optional: Basic hardening for dev logs (less noise)
  mongoose.set("strictQuery", true);

  try {
    await mongoose.connect(mongoUrl, {
      serverSelectionTimeoutMS: 5000, // fail fast if server unreachable
    });

    mongoReady = true;
    console.log("✅ MongoDB connected");
  } catch (err) {
    mongoReady = false;
    console.error("❌ MongoDB connection failed");
    throw err;
  }

  // Track ongoing connection state changes (useful in real life)
  mongoose.connection.on("disconnected", () => {
    mongoReady = false;
    console.warn("⚠️ MongoDB disconnected");
  });

  mongoose.connection.on("reconnected", () => {
    mongoReady = true;
    console.log("✅ MongoDB reconnected");
  });
}

export function isMongoReady(): boolean {
  // mongoose.connection.readyState:
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  return mongoReady && mongoose.connection.readyState === 1;
}

export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
    mongoReady = false;
    console.log("🛑 MongoDB disconnected cleanly");
  }
}