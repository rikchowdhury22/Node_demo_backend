import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../../middlewares/auth";
import { AttendancePolicy } from "./attendancePolicy.model";
import { ensureDefaultAttendancePolicy } from "./attendancePolicy.seed";

const router = Router();

/**
 * GET /attendance/policy
 * Seeds default if missing
 */
router.get("/policy", requireAuth, async (req, res) => {
  try {
    const policy = await ensureDefaultAttendancePolicy();
    return res.json({ ok: true, data: policy, seeded: policy.key === "DEFAULT" });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: "Failed to fetch policy", error: err.message });
  }
});

/**
 * PATCH /attendance/policy
 * Admin/Manager only
 */
router.patch(
  "/policy",
  requireAuth,
  requireRoles(["ADMIN", "MANAGER"]),
  async (req, res) => {
    try {
      await ensureDefaultAttendancePolicy();

      const bodySchema = z.object({
        startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
        endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),

        lateExemptMinutes: z.number().int().min(0).max(240).optional(),
        earlyExitThresholdMinutes: z.number().int().min(0).max(240).optional(),

        allowedLateCountPerMonth: z.number().int().min(0).max(60).optional(),
        allowedEarlyCountPerMonth: z.number().int().min(0).max(60).optional(),

        halfDayMinWorkMinutes: z.number().int().min(0).max(900).optional(),
        fullDayMinWorkMinutes: z.number().int().min(0).max(900).optional(),

        isActive: z.boolean().optional(),
      });

      const patch = bodySchema.parse(req.body ?? {});

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ ok: false, message: "No fields provided for update" });
      }

      // extra guardrail
      if (
        patch.fullDayMinWorkMinutes !== undefined &&
        patch.halfDayMinWorkMinutes !== undefined &&
        patch.fullDayMinWorkMinutes < patch.halfDayMinWorkMinutes
      ) {
        return res.status(400).json({
          ok: false,
          message: "fullDayMinWorkMinutes must be >= halfDayMinWorkMinutes",
        });
      }

      const updated = await AttendancePolicy.findOneAndUpdate(
        { key: "DEFAULT" },
        { $set: { ...patch, updatedBy: req.auth!.userId } },
        { new: true, runValidators: true }
      ).lean();

      return res.json({ ok: true, data: updated });
    } catch (err: any) {
      return res.status(500).json({ ok: false, message: "Failed to update policy", error: err.message });
    }
  }
);

export default router;