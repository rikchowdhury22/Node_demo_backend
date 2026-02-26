import mongoose, { Schema, Document } from "mongoose";

const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface IAttendancePolicy extends Document {
  key: string; // singleton key: "DEFAULT"

  startTime: string;
  endTime: string;

  lateExemptMinutes: number;
  earlyExitThresholdMinutes: number;

  allowedLateCountPerMonth: number;
  allowedEarlyCountPerMonth: number;

  halfDayMinWorkMinutes: number;
  fullDayMinWorkMinutes: number;

  isActive: boolean;

  updatedBy?: string | null; // store prisma userId (uuid) as string
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IAttendancePolicy>(
  {
    key: { type: String, required: true, unique: true, index: true }, // "DEFAULT"

    startTime: { type: String, required: true, match: HHMM_REGEX },
    endTime: { type: String, required: true, match: HHMM_REGEX },

    lateExemptMinutes: { type: Number, required: true, min: 0, max: 240 },
    earlyExitThresholdMinutes: { type: Number, required: true, min: 0, max: 240 },

    allowedLateCountPerMonth: { type: Number, required: true, min: 0, max: 60 },
    allowedEarlyCountPerMonth: { type: Number, required: true, min: 0, max: 60 },

    halfDayMinWorkMinutes: { type: Number, required: true, min: 0, max: 900 },
    fullDayMinWorkMinutes: { type: Number, required: true, min: 0, max: 900 },

    isActive: { type: Boolean, default: true },

    updatedBy: { type: String, default: null },
  },
  { timestamps: true }
);

export const AttendancePolicy =
  mongoose.models.AttendancePolicy ||
  mongoose.model<IAttendancePolicy>("AttendancePolicy", schema, "attendance_policies");