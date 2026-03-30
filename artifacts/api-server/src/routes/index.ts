import { Router, type IRouter } from "express";
import healthRouter from "./health";
import trafficRouter from "./traffic";
import historyRouter from "./history";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/traffic", trafficRouter);
router.use("/traffic", historyRouter);

export default router;
