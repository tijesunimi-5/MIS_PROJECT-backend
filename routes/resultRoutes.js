// routes/resultRoutes.js
const express = require("express");
const router = express.Router();
const resultController = require("../controllers/resultController");
const authMiddleware = require("../middleware/authMiddleware");

const isAdmin = (req, res, next) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ message: "Admin access required." });
  next();
};

// Result Metrics Engines
router.post("/score", authMiddleware, isAdmin, resultController.uploadScore);
router.get(
  "/report/:student_id",
  authMiddleware,
  resultController.getStudentReportCard,
);

module.exports = router;
