import { Router } from "express";
import { isMongoReady } from "../../db/mongo";

const router = Router();

router.get("/health", (_req, res) => {
    const mongo = isMongoReady();

    // readiness = can we actually serve requests depending on Mongo?
    // for now, we only check Mongo; Postgres comes next with Prisma.
    const ready = mongo;

    res.status(ready ? 200 : 503).json({
      status: "ok",
      readiness: ready ? "ready" : "not_ready",
      dependencies: {
        mongo: mongo ? "up" : "down",
      },
      timestamp: new Date().toISOString(),
    });
  });

  export default router;