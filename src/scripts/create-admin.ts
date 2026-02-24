import "dotenv/config";
import { prisma } from "../db/prisma";
import { hashPassword } from "../utils/auth";

async function main() {
  const email = "admin@example.com";
  const password = "Admin@123";
  const fullName = "Super Admin";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Admin already exists:", email);
    return;
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      fullName,
      email,
      passwordHash,
      role: "ADMIN",
    },
    select: { id: true, email: true, role: true },
  });

  console.log("✅ Admin created:", user);
  console.log("Login with:", { email, password });
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });