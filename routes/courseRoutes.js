const express = require("express");
const router = express.Router();
const courseController = require("../controllers/courseController");
const authMiddleware = require("../middleware/authMiddleware");

// Helper middleware to check for admin access limits
const isAdmin = (req, res, next) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ message: "Admin access required." });
  next();
};

router.post("/", authMiddleware, isAdmin, courseController.createCourse);
router.get("/", authMiddleware, courseController.getAllCourses);

module.exports = router;
