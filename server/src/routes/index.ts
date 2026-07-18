import express from "express";
import authRouter from "./auth.js";
import categoriesRouter from "./categories.js";
import productsRouter from "./products.js";
import customersRouter from "./customers.js";
import ordersRouter from "./orders.js";
import imagesRouter from "./images.js";

const router = express.Router();

router.use("/auth", authRouter);
router.use("/categories", categoriesRouter);
router.use("/products", productsRouter);
router.use("/customers", customersRouter);
router.use("/orders", ordersRouter);
router.use("/images", imagesRouter);

export default router;
