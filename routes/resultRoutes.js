// routes/resultRoutes.js
const express = require("express");
const router = express.Router();
const resultController = require("../controllers/resultController");
const authMiddleware = require("../middleware/authMiddleware");

// 🎯 FIX: Import from authController instead of courseController
const authController = require("../controllers/authController");

const isAdmin = (req, res, next) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ message: "Admin access required." });
  next();
};

router.post("/score", authMiddleware, isAdmin, resultController.uploadScore);
router.get(
  "/report/:student_id",
  authMiddleware,
  resultController.getStudentReportCard,
);

// This matches perfectly with our frontend change!
router.get("/students-roster", authMiddleware, authController.getAllStudents);

module.exports = router;
