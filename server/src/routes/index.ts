import express from "express";
import categoriesRouter from "./categories.js";

const router = express.Router();

router.use("/categories", categoriesRouter);

export default router;
