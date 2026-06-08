const express = require("express");
const router = express.Router();
const resultController = require("../controllers/resultController");
const authMiddleware = require("../middleware/authMiddleware");
const authController = require("../controllers/courseController")

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
// Inside your routes file (e.g., routes/authRoutes.js)
router.get("/students-roster", authMiddleware, authController.getAllStudents); 

module.exports = router;
