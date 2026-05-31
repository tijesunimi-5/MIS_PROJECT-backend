// routes/authRoutes.js
const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

// Pure routing layer calling our Postgres controllers
router.post("/register", authController.register);
router.post("/login", authController.login);

module.exports = router;
