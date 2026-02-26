import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import authRoutes from "./modules/auth/auth.routes";
import userRoutes from "./modules/users/users.routes";
import health from "./modules/health/health.routes";
import attendanceRoutes from "./modules/attendance/attendance.routes";
import attendancePolicyRoutes from "./modules/attendance/attendancePolicy.routes";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev"));
  app.use("/auth", authRoutes);
  app.use("/users", userRoutes);
  app.use(("/"), health);
  app.use("/attendance", attendanceRoutes);
  app.use("/attendance", attendancePolicyRoutes);


  return app;
}