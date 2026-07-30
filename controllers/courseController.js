// controllers/courseController.js
const db = require("../config/db");
const { encrypt, decrypt, hashData } = require("../utils/encryption");

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
    const codeHash = hashData(formattedCode);

    // 🔒 1. O(1) Indexed lookup using SHA-256 blind index
    const checkQuery = "SELECT * FROM courses WHERE course_code_hash = $1";
    const existingResult = await db.query(checkQuery, [codeHash]);

    if (existingResult.rows.length > 0) {
      return res
        .status(400)
        .json({ message: "A course with this code already exists." });
    }

    // 🔒 2. Encrypt ALL text fields before database insertion
    const encryptedCode = encrypt(formattedCode);
    const encryptedTitle = encrypt(course_title.trim());

    const insertQuery = `
      INSERT INTO courses (course_code, course_title, unit_counts, course_code_hash)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const result = await db.query(insertQuery, [
      encryptedCode,
      encryptedTitle,
      unit_counts || 3,
      codeHash,
    ]);

    const createdCourse = result.rows[0];

    res.status(201).json({
      message: "Course created successfully",
      course: {
        ...createdCourse,
        course_code: decrypt(createdCourse.course_code),
        course_title: decrypt(createdCourse.course_title),
        enc_course_code: createdCourse.course_code,
        enc_course_title: createdCourse.course_title,
      },
    });
  } catch (error) {
    console.error("Create Course Error:", error);
    res.status(500).json({ message: "Server error while creating course." });
  }
};

// 2. Get All Courses Catalog (Provides both ciphertexts and decrypted values for Admin Vault UI)
exports.getAllCourses = async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM courses ORDER BY id ASC");

    const decryptedCourses = result.rows.map((course) => ({
      ...course,
      course_code: decrypt(course.course_code),
      course_title: decrypt(course.course_title),
      enc_course_code: course.course_code,
      enc_course_title: course.course_title,
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

    const decryptedRoster = result.rows.map((s) => ({
      student_id: s.student_id,
      name: decrypt(s.name),
      matric_no: decrypt(s.matric_no),
      enc_name: s.name,
      enc_matric_no: s.matric_no,
    }));

    res.json(decryptedRoster);
  } catch (error) {
    console.error("Get Students Catalog Error:", error);
    res
      .status(500)
      .json({ message: "Server error while fetching student roster." });
  }
};

