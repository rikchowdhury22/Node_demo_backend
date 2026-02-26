import { Attendance } from "./attendance.model";
import { ensureDefaultAttendancePolicy } from "./attendancePolicy.seed";

const IST_OFFSET_MIN = 330; // +05:30

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toISTMinutesOfDay(d: Date): number {
  const istMs = d.getTime() + IST_OFFSET_MIN * 60_000;
  const ist = new Date(istMs);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

function toMonthPrefix(dateKey: string): string {
  return dateKey.slice(0, 7); // YYYY-MM
}

function computeWorkedMinutes(sortedPunches: Date[]): number {
  let total = 0;
  for (let i = 0; i + 1 < sortedPunches.length; i += 2) {
    const a = sortedPunches[i].getTime();
    const b = sortedPunches[i + 1].getTime();
    if (b > a) total += Math.floor((b - a) / 60_000);
  }
  return total;
}

async function getMonthlyCounts(userId: string, monthPrefix: string) {
  const docs = await Attendance.find(
    { userId, date: { $regex: `^${monthPrefix}` } },
    { computed: 1 }
  ).lean();

  let lateCount = 0;
  let earlyCount = 0;

  for (const d of docs ?? []) {
    if (d?.computed?.late) lateCount++;
    if (d?.computed?.earlyLeave) earlyCount++;
  }

  return { lateCount, earlyCount };
}

export async function evaluateAndUpdateAttendance(userId: string, dateKey: string) {
  const policy = await ensureDefaultAttendancePolicy();

  const doc = await Attendance.findOne({ userId, date: dateKey }).lean();
  if (!doc) return null;

  const punches = (doc.punches ?? [])
    .map((p: any) => new Date(p.at))
    .sort((a: Date, b: Date) => a.getTime() - b.getTime());

  const punchCount = punches.length;
  const inAt = punchCount >= 1 ? punches[0] : null;
  const outAt = punchCount >= 2 ? punches[punchCount - 1] : null;

  let workedMinutes = 0;
  let late = false;
  let earlyLeave = false;

  if (punchCount > 0) {
    workedMinutes = computeWorkedMinutes(punches);

    const startMin = hhmmToMinutes(policy.startTime) + policy.lateExemptMinutes;
    const endMin = hhmmToMinutes(policy.endTime) - policy.earlyExitThresholdMinutes;

    const inMin = inAt ? toISTMinutesOfDay(inAt) : null;
    const outMin = outAt ? toISTMinutesOfDay(outAt) : null;

    late = inMin !== null ? inMin > startMin : false;
    earlyLeave = outMin !== null ? outMin < endMin : false;
  }

  // Base status by worked minutes + punch completeness
  let status: "PENDING" | "PRESENT" | "HALF_DAY" | "INCOMPLETE" | "EARLY_LEAVE" = "PRESENT";

  if (punchCount === 0) status = "INCOMPLETE";
  else if (punchCount % 2 === 1) status = "INCOMPLETE";
  else if (workedMinutes < policy.halfDayMinWorkMinutes) status = "INCOMPLETE";
  else if (workedMinutes < policy.fullDayMinWorkMinutes) status = "HALF_DAY";

  if (earlyLeave && status !== "INCOMPLETE") status = "EARLY_LEAVE";

  // Monthly escalation
  const monthPrefix = toMonthPrefix(dateKey);
  const { lateCount, earlyCount } = await getMonthlyCounts(userId, monthPrefix);

  const projectedLate = lateCount + (late ? 1 : 0) - (doc?.computed?.late ? 1 : 0);
  const projectedEarly = earlyCount + (earlyLeave ? 1 : 0) - (doc?.computed?.earlyLeave ? 1 : 0);

  if (
    (projectedLate > policy.allowedLateCountPerMonth ||
      projectedEarly > policy.allowedEarlyCountPerMonth) &&
    status !== "INCOMPLETE"
  ) {
    status = "HALF_DAY";
  }

  return Attendance.findOneAndUpdate(
    { userId, date: dateKey },
    {
      $set: {
        status,
        computed: {
          workedMinutes,
          late,
          earlyLeave,
          inAt,
          outAt,
          evaluatedAt: new Date(),
        },
      },
    },
    { returnDocument: "after" }
  ).lean();
}