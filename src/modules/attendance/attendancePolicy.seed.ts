import { AttendancePolicy } from "./attendancePolicy.model";

export const DEFAULT_POLICY = {
  key: "DEFAULT",

  startTime: "09:30",
  endTime: "18:30",

  lateExemptMinutes: 10,
  earlyExitThresholdMinutes: 10,

  allowedLateCountPerMonth: 3,
  allowedEarlyCountPerMonth: 3,

  halfDayMinWorkMinutes: 240,
  fullDayMinWorkMinutes: 480,

  isActive: true,

  updatedBy: null as string | null,
};

export async function ensureDefaultAttendancePolicy() {
  const existing = await AttendancePolicy.findOne({ key: "DEFAULT" });
  if (existing) return existing;

  return AttendancePolicy.create(DEFAULT_POLICY);
}