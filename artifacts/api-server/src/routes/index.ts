import { Router, type IRouter } from "express";
import healthRouter from "./health";
import trafficRouter from "./traffic";
import historyRouter from "./history";
import externalDataRouter from "./externalData";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/traffic", trafficRouter);
router.use("/traffic", historyRouter);
router.use(externalDataRouter);

export default router;
