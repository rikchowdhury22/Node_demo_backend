import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { hashPassword, signAccessToken, verifyPassword } from "../../utils/auth";
import { requireAuth, requireRoles } from "../../middlewares/auth";

const router = Router();

// ✅ Admin creates users (in-house)
router.post(
  "/register",
  requireAuth,
  requireRoles(["ADMIN","MANAGER"]),
  async (req, res) => {
    const schema = z.object({
      fullName: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.enum(["ADMIN", "MANAGER", "TEAM_LEAD", "MEMBER"]).optional(),
      managerId: z.string().uuid().optional().nullable(),
    });

    const data = schema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const passwordHash = await hashPassword(data.password);

    const user = await prisma.user.create({
      data: {
        fullName: data.fullName,
        email: data.email,
        passwordHash,
        role: data.role ?? "MEMBER",
        managerId: data.managerId ?? null,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        managerId: true,
        createdAt: true,
      },
    });

    return res.status(201).json({ message: "User created", user });
  }
);

// ✅ Login
router.post("/login", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  const data = schema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email: data.email } });

  if (!user || !user.isActive) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const ok = await verifyPassword(data.password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = signAccessToken({ userId: user.id, role: user.role });

  return res.json({
    accessToken: token,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    },
  });
});

// ✅ Me
router.get("/me", requireAuth, async (req, res) => {
  const userId = req.auth!.userId;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      managerId: true,
      createdAt: true,
    },
  });

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  return res.json({ user });
});

export default router;