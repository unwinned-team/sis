import express from "express";
import categoriesRouter from "./categories.js";
import productsRouter from "./products.js";
import customersRouter from "./customers.js";
import ordersRouter from "./orders.js";

const router = express.Router();

router.use("/categories", categoriesRouter);
router.use("/products", productsRouter);
router.use("/customers", customersRouter);
router.use("/orders", ordersRouter);

export default router;
