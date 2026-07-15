import express from "express";
import categoriesRouter from "./categories.js";
import productsRouter from "./products.js";

const router = express.Router();

router.use("/categories", categoriesRouter);
router.use("/products", productsRouter);

export default router;
