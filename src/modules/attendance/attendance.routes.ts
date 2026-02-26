import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../../middlewares/auth";
import { Attendance } from "./attendance.model";
import { prisma } from "../../db/prisma";
import mongoose from "mongoose";
import { evaluateAndUpdateAttendance } from "./attendance.service";

const router = Router();

function dateKeyUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const IST_OFFSET_MIN = 330; // +05:30

function toISTDateKey(d: Date): string {
  const istMs = d.getTime() + IST_OFFSET_MIN * 60_000;
  const ist = new Date(istMs);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const day = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`; // YYYY-MM-DD in IST
}

function toISTISOString(d: Date): string {
  const istMs = d.getTime() + IST_OFFSET_MIN * 60_000;
  const ist = new Date(istMs);

  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const day = String(ist.getUTCDate()).padStart(2, "0");
  const hh = String(ist.getUTCHours()).padStart(2, "0");
  const mm = String(ist.getUTCMinutes()).padStart(2, "0");
  const ss = String(ist.getUTCSeconds()).padStart(2, "0");
  const ms = String(ist.getUTCMilliseconds()).padStart(3, "0");

  return `${y}-${m}-${day}T${hh}:${mm}:${ss}.${ms}+05:30`;
}

/**
 * ✅ Common Punch Endpoint (unlimited punches)
 * - Upsert Attendance by (userId, date)
 * - Append a punch with {at: now}
 * - Status will be computed immediately after punch (policy-driven)
 */
router.post("/punch", requireAuth, async (req, res) => {
  const schema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // optional override for testing
  });

  const { date } = schema.parse(req.body ?? {});
  const now = new Date();
  const userId = req.auth!.userId;

  const dayKey = date ?? toISTDateKey(now);

  const updated = await Attendance.findOneAndUpdate(
    { userId, date: dayKey },
    {
      $setOnInsert: { userId, date: dayKey, status: "PENDING" },
      $push: { punches: { at: now } },
      $set: { updatedAt: now },
    },
    { upsert: true, returnDocument: "after" }
  ).lean();

  // ✅ NEW: compute status after punch
  await evaluateAndUpdateAttendance(userId, dayKey);
  const finalDoc = await Attendance.findOne({ userId, date: dayKey }).lean();

  const punchesRaw = (updated?.punches ?? [])
    .map((p: any) => ({
      id: String(p._id),
      at: new Date(p.at),
    }))
    .sort((a: any, b: any) => a.at.getTime() - b.at.getTime());

  const punchCount = punchesRaw.length;
  const inPunchAt = punchCount >= 1 ? punchesRaw[0].at : null;
  const outPunchAt = punchCount >= 2 ? punchesRaw[punchCount - 1].at : null;

  return res.status(201).json({
    message: "Punch recorded",
    userId,
    date: dayKey, // IST date key already
    punchCount,

    // IST formatted times
    inPunchAt: inPunchAt ? toISTISOString(inPunchAt) : null,
    outPunchAt: outPunchAt ? toISTISOString(outPunchAt) : null,

    // full punch log (IST formatted)
    punches: punchesRaw.map((p: any) => ({
      id: p.id,
      at: toISTISOString(p.at),
    })),

    // ✅ evaluated status + computed block
    status: finalDoc?.status ?? updated?.status ?? "PENDING",
    computed: finalDoc?.computed ?? null,
  });
});

/**
 * ✅ View Attendance (role-scoped)
 * Query:
 * - date=YYYY-MM-DD (optional)
 * - from=YYYY-MM-DD&to=YYYY-MM-DD (optional)
 * - userId=<uuid> (optional; enforced by role scope)
 */
router.get("/", requireAuth, async (req, res) => {
  const qSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    userId: z.string().uuid().optional(),
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
  });

  const { date, from, to, userId, page, limit } = qSchema.parse(req.query);
  const { userId: me, role } = req.auth!;

  const _page = Math.max(page ?? 1, 1);
  const _limit = Math.min(Math.max(limit ?? 10, 1), 50);
  const skip = (_page - 1) * _limit;

  // Allowed user scope
  let allowedUserIds: string[] | "ALL";
  if (role === "ADMIN" || role === "MANAGER") {
    allowedUserIds = "ALL";
  } else if (role === "TEAM_LEAD") {
    const reportees = await prisma.user.findMany({
      where: { managerId: me },
      select: { id: true },
    });
    allowedUserIds = [me, ...reportees.map((r) => r.id)];
  } else {
    allowedUserIds = [me];
  }

  // Enforce userId filter within scope
  if (userId && allowedUserIds !== "ALL" && !allowedUserIds.includes(userId)) {
    return res.status(403).json({ message: "Forbidden: cannot view this user's attendance" });
  }

  const filter: any = {};

  // user filtering
  if (userId) filter.userId = userId;
  else if (allowedUserIds !== "ALL") filter.userId = { $in: allowedUserIds };

  // date filtering (IST keys)
  if (date) {
    filter.date = date;
  } else if (from && to) {
    filter.date = { $gte: from, $lte: to };
  }

  const [total, docs] = await Promise.all([
    Attendance.countDocuments(filter),
    Attendance.find(filter).sort({ date: -1, updatedAt: -1 }).skip(skip).limit(_limit).lean(),
  ]);

  const items = (docs ?? []).map((d: any) => {
    const punchesRaw = (d.punches ?? [])
      .map((p: any) => ({ id: String(p._id), at: new Date(p.at) }))
      .sort((a: any, b: any) => a.at.getTime() - b.at.getTime());

    const punchCount = punchesRaw.length;
    const inPunchAt = punchCount >= 1 ? punchesRaw[0].at : null;
    const outPunchAt = punchCount >= 2 ? punchesRaw[punchCount - 1].at : null;

    return {
      id: String(d._id),
      userId: d.userId,
      date: d.date,
      punchCount,
      inPunchAt: inPunchAt ? toISTISOString(inPunchAt) : null,
      outPunchAt: outPunchAt ? toISTISOString(outPunchAt) : null,
      punches: punchesRaw.map((p: any) => ({ id: p.id, at: toISTISOString(p.at) })),
      status: d.status ?? "PENDING",
      computed: d.computed ?? null,
    };
  });

  return res.json({ page: _page, limit: _limit, total, items });
});

router.patch(
  "/:userId/:date/punches/:punchId",
  requireAuth,
  requireRoles(["ADMIN", "MANAGER"]),
  async (req, res) => {
    const paramsSchema = z.object({
      userId: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      punchId: z.string().regex(/^[a-fA-F0-9]{24}$/),
    });

    const bodySchema = z.object({
      at: z.string().refine(
        (s) => !Number.isNaN(Date.parse(s)),
        "Invalid datetime (must be ISO string with Z or timezone like +05:30)"
      ),
    });

    const { userId, date, punchId } = paramsSchema.parse(req.params);
    const { at } = bodySchema.parse(req.body);

    const punchObjectId = new mongoose.Types.ObjectId(punchId);
    const newAt = new Date(at);

    const updated = await Attendance.findOneAndUpdate(
      { userId, date, "punches._id": punchObjectId },
      { $set: { "punches.$.at": newAt, updatedAt: new Date() } },
      { returnDocument: "after" }
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: "Punch not found for this user/date" });
    }

    // ✅ NEW: re-evaluate after punch edit
    await evaluateAndUpdateAttendance(userId, date);
    const finalDoc = await Attendance.findOne({ userId, date }).lean();

    const punchesRaw = (updated.punches ?? [])
      .map((p: any) => ({ id: String(p._id), at: new Date(p.at) }))
      .sort((a: any, b: any) => a.at.getTime() - b.at.getTime());

    const punchCount = punchesRaw.length;
    const inPunchAt = punchCount >= 1 ? punchesRaw[0].at : null;
    const outPunchAt = punchCount >= 2 ? punchesRaw[punchCount - 1].at : null;

    return res.json({
      message: "Punch updated",
      userId: updated.userId,
      date: updated.date,
      punchCount,
      inPunchAt: inPunchAt ? toISTISOString(inPunchAt) : null,
      outPunchAt: outPunchAt ? toISTISOString(outPunchAt) : null,
      punches: punchesRaw.map((p: any) => ({ id: p.id, at: toISTISOString(p.at) })),

      status: finalDoc?.status ?? updated.status ?? "PENDING",
      computed: finalDoc?.computed ?? null,
    });
  }
);

router.delete(
  "/:userId/:date/punches/:punchId",
  requireAuth,
  requireRoles(["ADMIN", "MANAGER"]),
  async (req, res) => {
    const paramsSchema = z.object({
      userId: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      punchId: z.string().regex(/^[a-fA-F0-9]{24}$/),
    });

    const { userId, date, punchId } = paramsSchema.parse(req.params);
    const punchObjectId = new mongoose.Types.ObjectId(punchId);

    const updated = await Attendance.findOneAndUpdate(
      { userId, date },
      { $pull: { punches: { _id: punchObjectId } }, $set: { updatedAt: new Date() } },
      { returnDocument: "after" }
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: "Attendance not found for this user/date" });
    }

    // ✅ NEW: re-evaluate after punch delete
    await evaluateAndUpdateAttendance(userId, date);
    const finalDoc = await Attendance.findOne({ userId, date }).lean();

    const punchesRaw = (updated.punches ?? [])
      .map((p: any) => ({ id: String(p._id), at: new Date(p.at) }))
      .sort((a: any, b: any) => a.at.getTime() - b.at.getTime());

    const punchCount = punchesRaw.length;
    const inPunchAt = punchCount >= 1 ? punchesRaw[0].at : null;
    const outPunchAt = punchCount >= 2 ? punchesRaw[punchCount - 1].at : null;

    return res.json({
      message: "Punch deleted",
      userId: updated.userId,
      date: updated.date,
      punchCount,
      inPunchAt: inPunchAt ? toISTISOString(inPunchAt) : null,
      outPunchAt: outPunchAt ? toISTISOString(outPunchAt) : null,
      punches: punchesRaw.map((p: any) => ({ id: p.id, at: toISTISOString(p.at) })),

      status: finalDoc?.status ?? updated.status ?? "PENDING",
      computed: finalDoc?.computed ?? null,
    });
  }
);

export default router;