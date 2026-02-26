import mongoose, { Schema, Types } from "mongoose";

type Punch = {
  _id: Types.ObjectId;
  at: Date;
};

type Computed = {
  workedMinutes: number;
  late: boolean;
  earlyLeave: boolean;
  inAt: Date | null;
  outAt: Date | null;
  evaluatedAt: Date | null;
};

export type AttendanceDayDoc = mongoose.Document & {
  userId: string;
  date: string; // YYYY-MM-DD
  punches: Punch[];
  status: string;
  computed: Computed; // <- made non-optional (recommended)
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
    date: { type: String, required: true, index: true },
    punches: { type: [PunchSchema], default: [] },
    status: { type: String, default: "PENDING", index: true },

    computed: {
      workedMinutes: { type: Number, default: 0 },
      late: { type: Boolean, default: false },
      earlyLeave: { type: Boolean, default: false },
      inAt: { type: Date, default: null },
      outAt: { type: Date, default: null },
      evaluatedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

// One doc per user per date
AttendanceDaySchema.index({ userId: 1, date: 1 }, { unique: true });

export const Attendance =
  mongoose.models.Attendance ||
  mongoose.model<AttendanceDayDoc>("Attendance", AttendanceDaySchema, "attendance");