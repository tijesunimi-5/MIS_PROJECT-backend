// controllers/authController.js
const db = require("../config/db");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { encrypt, decrypt } = require("../utils/encryption"); // 🔒 Import AES-256 helpers

// 1. Register User (Works for both Admin and Student roles)
exports.register = async (req, res) => {
  const { name, email, password, role, matric_no, department, current_level } =
    req.body;

  if (!email || !password || !name) {
    return res
      .status(400)
      .json({ message: "Missing required core registration fields." });
  }

  try {
    // ⚡ Auto-migrate table column types to TEXT to hold long AES ciphertext
    await db
      .query(
        `
      ALTER TABLE users ALTER COLUMN password TYPE TEXT;
      ALTER TABLE users ALTER COLUMN name TYPE TEXT;
      ALTER TABLE users ALTER COLUMN email TYPE TEXT;
      ALTER TABLE users ALTER COLUMN role TYPE TEXT;
      ALTER TABLE students ALTER COLUMN matric_no TYPE TEXT;
      ALTER TABLE students ALTER COLUMN department TYPE TEXT;
    `,
      )
      .catch((err) => console.log("Schema migration note:", err.message));

    // 🔒 1. Check if user already exists (Decryption-assisted email lookup)
    const allUsers = await db.query("SELECT * FROM users");
    const existingUser = allUsers.rows.find(
      (u) => decrypt(u.email).toLowerCase() === email.trim().toLowerCase(),
    );

    if (existingUser) {
      return res
        .status(400)
        .json({ message: "User already exists with this email." });
    }

    const assignedRole = role === "admin" ? "admin" : "student";

    // 🔒 2. Hash Password with Bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    // 🔒 3. Encrypt ALL Plaintext Profile Fields with AES-256
    const encryptedName = encrypt(name.trim());
    const encryptedEmail = encrypt(email.trim().toLowerCase());
    const encryptedRole = encrypt(assignedRole);
    const encryptedMatric = matric_no ? encrypt(matric_no.trim()) : null;
    const encryptedDept = department ? encrypt(department.trim()) : null;

    await db.query("BEGIN");

    const userInsertQuery = `
      INSERT INTO users (name, email, password, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, role;
    `;
    const userResult = await db.query(userInsertQuery, [
      encryptedName, // AES-256 Ciphertext
      encryptedEmail, // AES-256 Ciphertext
      hashedPassword, // Bcrypt Hash
      encryptedRole, // AES-256 Ciphertext
    ]);
    const newUser = userResult.rows[0];

    let createdStudentId = null;

    if (assignedRole === "student") {
      if (!matric_no || !department) {
        await db.query("ROLLBACK");
        return res
          .status(400)
          .json({
            message: "Matric number and department are required for students.",
          });
      }

      const studentInsertQuery = `
        INSERT INTO students (user_id, matric_no, department, current_level)
        VALUES ($1, $2, $3, $4)
        RETURNING id;
      `;
      const studentResult = await db.query(studentInsertQuery, [
        newUser.id,
        encryptedMatric, // AES-256 Ciphertext
        encryptedDept, // AES-256 Ciphertext
        current_level || 100,
      ]);

      createdStudentId = studentResult.rows[0].id;
    }

    await db.query("COMMIT");

    // JWT token receives clean role string for API authorization middleware
    const token = jwt.sign(
      { id: newUser.id, role: assignedRole },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    res.status(201).json({
      token,
      user: {
        id: newUser.id,
        student_id: createdStudentId,
        name: decrypt(newUser.name), // 🔓 Decrypted for UI
        email: decrypt(newUser.email), // 🔓 Decrypted for UI
        role: decrypt(newUser.role), // 🔓 Decrypted for UI
      },
    });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error("Registration Error:", error);
    res.status(500).json({ message: "Server error during registration." });
  }
};

// 2. Login User (Decryption-assisted email lookup & Bcrypt password match)
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // 🔒 1. Retrieve users & match decrypted email
    const allUsers = await db.query("SELECT * FROM users");
    const user = allUsers.rows.find(
      (u) => decrypt(u.email).toLowerCase() === email.trim().toLowerCase(),
    );

    if (!user) {
      return res.status(400).json({ message: "Invalid Credentials" });
    }

    // 🔒 2. Verify Bcrypt password hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid Credentials" });
    }

    // 🔓 3. Decrypt user profile attributes for application response
    const decryptedRole = decrypt(user.role);

    let dynamicUserData = {
      id: user.id,
      name: decrypt(user.name),
      email: decrypt(user.email),
      role: decryptedRole,
    };

    if (decryptedRole === "student") {
      const studentResult = await db.query(
        "SELECT * FROM students WHERE user_id = $1",
        [user.id],
      );
      if (studentResult.rows.length > 0) {
        dynamicUserData.student_id = studentResult.rows[0].id;
        dynamicUserData.matric_no = decrypt(studentResult.rows[0].matric_no);
        dynamicUserData.department = decrypt(studentResult.rows[0].department);
        dynamicUserData.current_level = studentResult.rows[0].current_level;
      }
    }

    const token = jwt.sign(
      { id: user.id, role: decryptedRole },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    res.json({ token, user: dynamicUserData });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Server error during authentication." });
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

    // 🔓 Decrypt student name & matric number before sending to admin UI
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
