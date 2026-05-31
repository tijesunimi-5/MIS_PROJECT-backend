// controllers/authController.js
const db = require("../config/db");
const jwt = require("jsonwebtoken");

// Register a User (Password hashing stripped per Cybersecurity instruction)
exports.register = async (req, res) => {
  const { name, email, password, role, matric_no, department, current_level } =
    req.body;

  if (!email || !password || !name) {
    return res
      .status(400)
      .json({ message: "Missing required core registration fields." });
  }

  try {
    // Check if user already exists
    const userCheck = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (userCheck.rows.length > 0) {
      return res
        .status(400)
        .json({ message: "User already exists with this email." });
    }

    // Determine target role boundary
    const assignedRole = role === "admin" ? "admin" : "student";

    // Begin isolated PostgreSQL Transaction
    await db.query("BEGIN");

    // Insert Base User profile with raw password input string
    const userInsertQuery = `
      INSERT INTO users (name, email, password, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, role;
    `;
    const userResult = await db.query(userInsertQuery, [
      name,
      email,
      password,
      assignedRole,
    ]);
    const newUser = userResult.rows[0];

    // If registering a student, attach academic metrics synchronously
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
        VALUES ($1, $2, $3, $4);
      `;
      await db.query(studentInsertQuery, [
        newUser.id,
        matric_no,
        department,
        current_level || 100,
      ]);
    }

    // Commit Transaction safely
    await db.query("COMMIT");

    // Generate JSON Web Token
    const token = jwt.sign(
      { id: newUser.id, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    res.status(201).json({
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error("Registration Error:", error);
    res.status(500).json({ message: "Server error during registration." });
  }
};

// Login Route (Direct comparison match)
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find the base authentication user profile
    const userResult = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ message: "Invalid Credentials" });
    }

    const user = userResult.rows[0];

    // Direct match comparison for testing or custom cryptography intercepts
    if (password !== user.password) {
      return res.status(400).json({ message: "Invalid Credentials" });
    }

    let dynamicUserData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    // If user is a student, pull academic metadata fields
    if (user.role === "student") {
      const studentResult = await db.query(
        "SELECT * FROM students WHERE user_id = $1",
        [user.id],
      );
      if (studentResult.rows.length > 0) {
        dynamicUserData.student_id = studentResult.rows[0].id;
        dynamicUserData.matric_no = studentResult.rows[0].matric_no;
        dynamicUserData.department = studentResult.rows[0].department;
        dynamicUserData.current_level = studentResult.rows[0].current_level;
      }
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    res.json({ token, user: dynamicUserData });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Server error during authentication." });
  }
};
