// controllers/courseController.js
const db = require("../config/db");

// 1. Create a New Course (Admin Only)
exports.createCourse = async (req, res) => {
  const { course_code, course_title, unit_counts } = req.body;

  if (!course_code || !course_title) {
    return res
      .status(400)
      .json({ message: "Course code and title are required." });
  }

  try {
    const checkCourse = await db.query(
      "SELECT * FROM courses WHERE course_code = $1",
      [course_code.toUpperCase()],
    );
    if (checkCourse.rows.length > 0) {
      return res
        .status(400)
        .json({ message: "A course with this code already exists." });
    }

    const insertQuery = `
      INSERT INTO courses (course_code, course_title, unit_counts)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const result = await db.query(insertQuery, [
      course_code.toUpperCase(),
      course_title,
      unit_counts || 3,
    ]);

    res
      .status(201)
      .json({ message: "Course created successfully", course: result.rows[0] });
  } catch (error) {
    console.error("Create Course Error:", error);
    res.status(500).json({ message: "Server error while creating course." });
  }
};

// 2. Get All Courses Catalog (Accessible by Admin and Student)
exports.getAllCourses = async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM courses ORDER BY course_code ASC",
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get Courses Error:", error);
    res.status(500).json({ message: "Server error while fetching courses." });
  }
};

// Add to your backend controllers
exports.getAllStudents = async (req, res) => {
  try {
    // Select the primary keys, names, and matric numbers from the relational join
    const queryText = `
      SELECT s.id AS student_id, u.name, s.matric_no 
      FROM students s
      JOIN users u ON s.user_id = u.id
      ORDER BY u.name ASC;
    `;
    
    const result = await db.query(queryText);
    res.json(result.rows);
  } catch (error) {
    console.error("Get Students Catalog Error:", error);
    res.status(500).json({ message: "Server error while fetching student roster." });
  }
}