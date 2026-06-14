// routes/authRoutes.js
const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

// Authentication Entry Gates
router.post("/register", authController.register);
router.post("/login", authController.login);

// Clean relational student roster endpoint path
router.get("/students-roster", authMiddleware, authController.getAllStudents);

module.exports = router;
