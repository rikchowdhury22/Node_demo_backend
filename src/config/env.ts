export const env = {
  PORT: process.env.PORT ? Number(process.env.PORT) : 5000,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || "",
};

if (!env.JWT_ACCESS_SECRET) {
  throw new Error("JWT_ACCESS_SECRET is missing in .env");
}