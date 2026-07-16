// controllers/courseController.js
const db = require("../config/db");
const { encrypt, decrypt } = require("../utils/encryption"); // 🔒 Import AES-256 helpers

// 1. Create a New Course (Admin Only - All fields AES-256 encrypted)
exports.createCourse = async (req, res) => {
  const { course_code, course_title, unit_counts } = req.body;

  if (!course_code || !course_title) {
    return res
      .status(400)
      .json({ message: "Course code and title are required." });
  }

  try {
    const formattedCode = course_code.trim().toUpperCase();

    // ⚡ Auto-migrate course table column types to TEXT for long ciphertext
    await db
      .query(
        `
      ALTER TABLE courses ALTER COLUMN course_code TYPE TEXT;
      ALTER TABLE courses ALTER COLUMN course_title TYPE TEXT;
    `,
      )
      .catch((err) => console.log("Schema migration note:", err.message));

    // 🔒 1. Check if course_code exists (Decryption-assisted lookup in Node.js)
    const allCourses = await db.query("SELECT * FROM courses");
    const existingCourse = allCourses.rows.find(
      (c) => decrypt(c.course_code).toUpperCase() === formattedCode,
    );

    if (existingCourse) {
      return res
        .status(400)
        .json({ message: "A course with this code already exists." });
    }

    // 🔒 2. Encrypt ALL text fields before database insertion
    const encryptedCode = encrypt(formattedCode);
    const encryptedTitle = encrypt(course_title.trim());

    const insertQuery = `
      INSERT INTO courses (course_code, course_title, unit_counts)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const result = await db.query(insertQuery, [
      encryptedCode, // AES-256 Ciphertext in Postgres!
      encryptedTitle, // AES-256 Ciphertext in Postgres!
      unit_counts || 3,
    ]);

    const createdCourse = result.rows[0];

    res.status(201).json({
      message: "Course created successfully",
      course: {
        ...createdCourse,
        course_code: decrypt(createdCourse.course_code), // 🔓 Decrypted for UI
        course_title: decrypt(createdCourse.course_title), // 🔓 Decrypted for UI
      },
    });
  } catch (error) {
    console.error("Create Course Error:", error);
    res.status(500).json({ message: "Server error while creating course." });
  }
};

// 2. Get All Courses Catalog (Decrypted for Admin and Student UI)
exports.getAllCourses = async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM courses ORDER BY id ASC");

    // 🔓 Decrypt ALL text fields before sending JSON response to frontend
    const decryptedCourses = result.rows.map((course) => ({
      ...course,
      course_code: decrypt(course.course_code),
      course_title: decrypt(course.course_title),
    }));

    res.json(decryptedCourses);
  } catch (error) {
    console.error("Get Courses Error:", error);
    res.status(500).json({ message: "Server error while fetching courses." });
  }
};

// 3. Get Student Roster (Decrypted for Admin Dropdowns)
exports.getAllStudents = async (req, res) => {
  try {
    const queryText = `
      SELECT s.id AS student_id, u.name, s.matric_no 
      FROM students s
      JOIN users u ON s.user_id = u.id
      ORDER BY u.id ASC;
    `;

    const result = await db.query(queryText);

    // 🔓 Decrypt student profile details dynamically
    const decryptedRoster = result.rows.map((s) => ({
      student_id: s.student_id,
      name: decrypt(s.name),
      matric_no: decrypt(s.matric_no),
    }));

    res.json(decryptedRoster);
  } catch (error) {
    console.error("Get Students Catalog Error:", error);
    res
      .status(500)
      .json({ message: "Server error while fetching student roster." });
  }
};
