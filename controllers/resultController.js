// controllers/resultController.js
const db = require("../config/db");
const { encrypt, decrypt, hashData } = require("../utils/encryption");

// Helper function to dynamically process Nigerian standard university grading scales
const computeGradeAndPoints = (total) => {
  if (total >= 70) return { grade: "A", points: 5.0 };
  if (total >= 60) return { grade: "B", points: 4.0 };
  if (total >= 50) return { grade: "C", points: 3.0 };
  if (total >= 45) return { grade: "D", points: 2.0 };
  if (total >= 40) return { grade: "E", points: 1.0 };
  return { grade: "F", points: 0.0 };
};

// 1. Enter/Upsert Student Score (Admin Only - All text attributes encrypted with AES-256)
exports.uploadScore = async (req, res) => {
  const {
    student_id,
    course_id,
    ca_score,
    exam_score,
    semester,
    academic_year,
  } = req.body;

  if (!student_id || !course_id || !semester || !academic_year) {
    return res.status(400).json({ message: "Missing required parameters." });
  }

  const parsedCA = parseFloat(ca_score) || 0;
  const parsedExam = parseFloat(exam_score) || 0;
  const totalScore = parsedCA + parsedExam;

  if (parsedCA > 30 || parsedExam > 70) {
    return res
      .status(400)
      .json({ message: "CA cannot exceed 30 and Exam cannot exceed 70." });
  }

  const { grade, points } = computeGradeAndPoints(totalScore);

  try {
    const cleanSemester = semester.trim();
    const cleanYear = academic_year.trim();
    const semesterHash = hashData(cleanSemester);
    const yearHash = hashData(cleanYear);

    // 🔒 1. Exact SQL query lookup
    const existingRecords = await db.query(
      "SELECT * FROM results WHERE student_id = $1 AND course_id = $2 AND (semester_hash = $3 OR semester_hash IS NULL)",
      [student_id, course_id, semesterHash],
    );

    const match = existingRecords.rows.find(
      (r) =>
        decrypt(r.semester) === cleanSemester &&
        decrypt(r.academic_year) === cleanYear,
    );

    // 🔒 2. Encrypt all text fields before writing to PostgreSQL
    const encryptedGrade = encrypt(grade);
    const encryptedSemester = encrypt(cleanSemester);
    const encryptedYear = encrypt(cleanYear);

    let savedResult;

    if (match) {
      // Update existing result entry
      const updateQuery = `
        UPDATE results 
        SET ca_score = $1, exam_score = $2, letter_grade = $3, grade_point = $4, semester_hash = $5, academic_year_hash = $6
        WHERE id = $7
        RETURNING *;
      `;
      const updateRes = await db.query(updateQuery, [
        parsedCA,
        parsedExam,
        encryptedGrade,
        points,
        semesterHash,
        yearHash,
        match.id,
      ]);
      savedResult = updateRes.rows[0];
    } else {
      // Insert new result entry
      const insertQuery = `
        INSERT INTO results (student_id, course_id, ca_score, exam_score, letter_grade, grade_point, semester, academic_year, semester_hash, academic_year_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *;
      `;
      const insertRes = await db.query(insertQuery, [
        student_id,
        course_id,
        parsedCA,
        parsedExam,
        encryptedGrade,
        points,
        encryptedSemester,
        encryptedYear,
        semesterHash,
        yearHash,
      ]);
      savedResult = insertRes.rows[0];
    }

    res.status(200).json({
      message: "Score saved successfully",
      data: {
        ...savedResult,
        letter_grade: decrypt(savedResult.letter_grade),
        semester: decrypt(savedResult.semester),
        academic_year: decrypt(savedResult.academic_year),
        enc_letter_grade: savedResult.letter_grade,
        enc_semester: savedResult.semester,
        enc_academic_year: savedResult.academic_year,
      },
    });
  } catch (error) {
    console.error("Upload Score Error:", error);
    res.status(500).json({ message: "Server error while uploading score." });
  }
};

// 2. Fetch Performance & Calculate GPA/CGPA Metrics
exports.getStudentReportCard = async (req, res) => {
  const { student_id } = req.params;

  try {
    if (req.user.role === "student") {
      const accessCheck = await db.query(
        "SELECT id FROM students WHERE user_id = $1",
        [req.user.id],
      );
      if (
        accessCheck.rows.length === 0 ||
        accessCheck.rows[0].id !== parseInt(student_id)
      ) {
        return res.status(403).json({
          message: "Access Denied. Unauthorized report tracking query.",
        });
      }
    }

    const resultsQuery = `
      SELECT r.*, c.course_code, c.course_title, c.unit_counts
      FROM results r
      JOIN courses c ON r.course_id = c.id
      WHERE r.student_id = $1
      ORDER BY r.id ASC;
    `;
    const resultsData = await db.query(resultsQuery, [student_id]);

    const reportSummary = {};
    let totalCumulativePoints = 0;
    let totalCumulativeUnits = 0;

    resultsData.rows.forEach((row) => {
      const decryptedYear = decrypt(row.academic_year);
      const decryptedSemester = decrypt(row.semester);
      const decryptedGrade = decrypt(row.letter_grade);
      const decryptedCode = decrypt(row.course_code);
      const decryptedTitle = decrypt(row.course_title);

      const parsedCa = parseFloat(row.ca_score) || 0;
      const parsedExam = parseFloat(row.exam_score) || 0;
      const totalScore = parsedCa + parsedExam;

      const decryptedRow = {
        ...row,
        total_score: totalScore,
        letter_grade: decryptedGrade,
        semester: decryptedSemester,
        academic_year: decryptedYear,
        course_code: decryptedCode,
        course_title: decryptedTitle,
        enc_letter_grade: row.letter_grade,
        enc_semester: row.semester,
        enc_academic_year: row.academic_year,
        enc_course_code: row.course_code,
        enc_course_title: row.course_title,
      };

      const termKey = `${decryptedYear} - ${decryptedSemester} Semester`;

      if (!reportSummary[termKey]) {
        reportSummary[termKey] = {
          courses: [],
          totalUnits: 0,
          weightedPoints: 0,
          gpa: 0,
        };
      }

      const qualityPoints = parseFloat(row.grade_point) * row.unit_counts;

      reportSummary[termKey].courses.push(decryptedRow);
      reportSummary[termKey].totalUnits += row.unit_counts;
      reportSummary[termKey].weightedPoints += qualityPoints;

      totalCumulativeUnits += row.unit_counts;
      totalCumulativePoints += qualityPoints;
    });

    Object.keys(reportSummary).forEach((key) => {
      const summary = reportSummary[key];
      summary.gpa =
        summary.totalUnits > 0
          ? (summary.weightedPoints / summary.totalUnits).toFixed(2)
          : "0.00";
    });

    const overallCGPA =
      totalCumulativeUnits > 0
        ? (totalCumulativePoints / totalCumulativeUnits).toFixed(2)
        : "0.00";

    res.json({
      student_id,
      cgpa: overallCGPA,
      academic_records: reportSummary,
    });
  } catch (error) {
    console.error("Fetch Report Error:", error);
    res
      .status(500)
      .json({ message: "Server error compiling academic reports." });
  }
};

