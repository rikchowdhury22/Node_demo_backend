import { Router } from "express";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middlewares/auth";

const router = Router();

// ✅ My profile
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
      updatedAt: true,
    },
  });

  if (!user) return res.status(404).json({ message: "User not found" });

  return res.json({ user });
});

// ✅ List users with RBAC visibility
router.get("/", requireAuth, async (req, res) => {
  const { userId, role } = req.auth!;

  // Basic pagination (real-life must-have)
  const page = Math.max(Number(req.query.page ?? 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit ?? 10), 1), 50);
  const skip = (page - 1) * limit;

  // Role-based filter
  let where: any = {};

  if (role === "ADMIN" || role === "MANAGER") {
    where = {}; // all users
  } else if (role === "TEAM_LEAD") {
    where = {
      OR: [{ id: userId }, { managerId: userId }],
    };
  } else {
    // MEMBER
    where = { id: userId };
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        managerId: true,
        createdAt: true,
      },
    }),
  ]);

  return res.json({
    page,
    limit,
    total,
    items: users,
  });
});

// ✅ Get user by id with RBAC visibility
router.get("/:id", requireAuth, async (req, res) => {
  const targetId = req.params.id;
  // Validate targetId is a string
if (typeof targetId !== "string") {
    return res.status(400).json({ message: "Invalid user ID format" });
}

  const { userId, role } = req.auth!;

  // permission check
  const allowed =
    role === "ADMIN" ||
    role === "MANAGER" ||
    targetId === userId ||
    (role === "TEAM_LEAD" &&
      (await prisma.user.count({ where: { id: targetId, managerId: userId } })) > 0);

  if (!allowed) {
    return res.status(403).json({ message: "Forbidden: cannot access this user" });
  }

  const user = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      managerId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) return res.status(404).json({ message: "User not found" });

  return res.json({ user });
});

export default router;