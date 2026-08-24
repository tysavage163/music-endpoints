import { Router, type IRouter } from "express";
import healthRouter from "./health";
import musicRouter from "./music";
import uiRouter from "./ui";

const router: IRouter = Router();

router.use(uiRouter);
router.use(healthRouter);
router.use(musicRouter);

export default router;
