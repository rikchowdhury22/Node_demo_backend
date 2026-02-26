import mongoose, { Schema, Types } from "mongoose";

type Punch = {
  _id: Types.ObjectId;
  at: Date;
};

export type AttendanceDayDoc = mongoose.Document & {
  userId: string;
  date: string; // YYYY-MM-DD
  punches: Punch[];
  status: string; // we'll finalize enum later
  createdAt: Date;
  updatedAt: Date;
};

const PunchSchema = new Schema<Punch>(
  {
    at: { type: Date, required: true },
  },
  { _id: true }
);

const AttendanceDaySchema = new Schema<AttendanceDayDoc>(
  {
    userId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    punches: { type: [PunchSchema], default: [] },
    status: { type: String, default: "PENDING", index: true },
  },
  { timestamps: true }
);

// One doc per user per date
AttendanceDaySchema.index({ userId: 1, date: 1 }, { unique: true });

export const Attendance =
  mongoose.models.Attendance ||
  mongoose.model<AttendanceDayDoc>("Attendance", AttendanceDaySchema, "attendance");