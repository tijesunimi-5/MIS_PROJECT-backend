// controllers/authController.js
const db = require("../config/db");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { encrypt, decrypt, hashData } = require("../utils/encryption");

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
    const cleanEmail = email.trim().toLowerCase();
    const emailHash = hashData(cleanEmail);

    // 🔒 1. O(1) Indexed lookup using SHA-256 blind index
    const checkQuery = "SELECT * FROM users WHERE email_hash = $1";
    const existingResult = await db.query(checkQuery, [emailHash]);

    if (existingResult.rows.length > 0) {
      return res
        .status(400)
        .json({ message: "User already exists with this email." });
    }

    const assignedRole = role === "admin" ? "admin" : "student";

    // 🔒 2. Hash Password with Bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    // 🔒 3. Encrypt ALL Plaintext Profile Fields with AES-256
    const encryptedName = encrypt(name.trim());
    const encryptedEmail = encrypt(cleanEmail);
    const encryptedRole = encrypt(assignedRole);
    const encryptedMatric = matric_no ? encrypt(matric_no.trim()) : null;
    const encryptedDept = department ? encrypt(department.trim()) : null;
    const matricHash = matric_no ? hashData(matric_no.trim()) : null;

    await db.query("BEGIN");

    const userInsertQuery = `
      INSERT INTO users (name, email, password, role, email_hash)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, email, role;
    `;
    const userResult = await db.query(userInsertQuery, [
      encryptedName,
      encryptedEmail,
      hashedPassword,
      encryptedRole,
      emailHash,
    ]);
    const newUser = userResult.rows[0];

    let createdStudentId = null;

    if (assignedRole === "student") {
      if (!matric_no || !department) {
        await db.query("ROLLBACK");
        return res.status(400).json({
          message: "Matric number and department are required for students.",
        });
      }

      const studentInsertQuery = `
        INSERT INTO students (user_id, matric_no, department, current_level, matric_no_hash)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id;
      `;
      const studentResult = await db.query(studentInsertQuery, [
        newUser.id,
        encryptedMatric,
        encryptedDept,
        current_level || 100,
        matricHash,
      ]);

      createdStudentId = studentResult.rows[0].id;
    }

    await db.query("COMMIT");

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
        name: decrypt(newUser.name),
        email: decrypt(newUser.email),
        role: decrypt(newUser.role),
      },
    });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error("Registration Error:", error);
    res.status(500).json({ message: "Server error during registration." });
  }
};

// 2. Login User (O(1) SHA-256 blind index lookup & Bcrypt password match)
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Email and password are required." });
  }

  try {
    const cleanEmail = email.trim().toLowerCase();
    const emailHash = hashData(cleanEmail);

    // 🔒 1. O(1) Fast lookup by email_hash
    let userResult = await db.query(
      "SELECT * FROM users WHERE email_hash = $1",
      [emailHash],
    );
    let user = userResult.rows[0];

    // Fallback for legacy rows created before blind indexing migration
    if (!user) {
      const allUsers = await db.query("SELECT * FROM users");
      user = allUsers.rows.find(
        (u) => decrypt(u.email).toLowerCase() === cleanEmail,
      );
      if (user && !user.email_hash) {
        // Backfill hash for future O(1) logins
        await db.query("UPDATE users SET email_hash = $1 WHERE id = $2", [
          emailHash,
          user.id,
        ]);
      }
    }

    if (!user) {
      return res.status(400).json({ message: "Invalid Credentials" });
    }

    // 🔒 2. Verify Bcrypt password hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid Credentials" });
    }

    // 🔓 3. Decrypt user profile attributes for session
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

// 3. Get Student Roster (Provides both ciphertexts and decrypted values for Admin Vault UI)
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
      enc_name: s.name, // Raw AES-256 ciphertext format
      enc_matric_no: s.matric_no, // Raw AES-256 ciphertext format
    }));

    res.json(decryptedRoster);
  } catch (error) {
    console.error("Get Students Catalog Error:", error);
    res
      .status(500)
      .json({ message: "Server error while fetching student roster." });
  }
};

