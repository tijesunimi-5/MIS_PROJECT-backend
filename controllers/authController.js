// // controllers/authController.js
// const db = require("../config/db");
// const jwt = require("jsonwebtoken");
// const bcrypt = require("bcrypt"); // 🔒 Step 1: Import bcrypt

// // 1. Register a User (Password gets safely hashed via bcrypt)
// exports.register = async (req, res) => {
//   const { name, email, password, role, matric_no, department, current_level } =
//     req.body;

//   if (!email || !password || !name) {
//     return res
//       .status(400)
//       .json({ message: "Missing required core registration fields." });
//   }

//   try {
//     const userCheck = await db.query("SELECT * FROM users WHERE email = $1", [
//       email,
//     ]);
//     if (userCheck.rows.length > 0) {
//       return res
//         .status(400)
//         .json({ message: "User already exists with this email." });
//     }

//     const assignedRole = role === "admin" ? "admin" : "student";

//     // 🔒 Step 2: Hash the password securely with 10 salt rounds before saving
//     const saltRounds = 10;
//     const hashedPassword = await bcrypt.hash(password, saltRounds);

//     await db.query("BEGIN");

//     const userInsertQuery = `
//       INSERT INTO users (name, email, password, role)
//       VALUES ($1, $2, $3, $4)
//       RETURNING id, name, email, role;
//     `;
//     const userResult = await db.query(userInsertQuery, [
//       name,
//       email,
//       hashedPassword, // Save the secure hash, never the raw text
//       assignedRole,
//     ]);
//     const newUser = userResult.rows[0];

//     if (assignedRole === "student") {
//       if (!matric_no || !department) {
//         await db.query("ROLLBACK");
//         return res.status(400).json({
//           message: "Matric number and department are required for students.",
//         });
//       }

//       const studentInsertQuery = `
//         INSERT INTO students (user_id, matric_no, department, current_level)
//         VALUES ($1, $2, $3, $4);
//       `;
//       await db.query(studentInsertQuery, [
//         newUser.id,
//         matric_no,
//         department,
//         current_level || 100,
//       ]);
//     }

//     await db.query("COMMIT");

//     const token = jwt.sign(
//       { id: newUser.id, role: newUser.role },
//       process.env.JWT_SECRET,
//       { expiresIn: "1d" },
//     );

//     res.status(201).json({
//       token,
//       user: {
//         id: newUser.id,
//         name: newUser.name,
//         email: newUser.email,
//         role: newUser.role,
//       },
//     });
//   } catch (error) {
//     await db.query("ROLLBACK");
//     console.error("Registration Error:", error);
//     res.status(500).json({ message: "Server error during registration." });
//   }
// };

// // 2. Login User (Verifies against bcrypt hash match)
// exports.login = async (req, res) => {
//   const { email, password } = req.body;

//   try {
//     const userResult = await db.query("SELECT * FROM users WHERE email = $1", [
//       email,
//     ]);
//     if (userResult.rows.length === 0) {
//       return res.status(400).json({ message: "Invalid Credentials" });
//     }

//     const user = userResult.rows[0];

//     // 🔒 Step 3: Compare the incoming raw/base64 string password with the hashed database password
//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) {
//       return res.status(400).json({ message: "Invalid Credentials" });
//     }

//     let dynamicUserData = {
//       id: user.id,
//       name: user.name,
//       email: user.email,
//       role: user.role,
//     };

//     if (user.role === "student") {
//       const studentResult = await db.query(
//         "SELECT * FROM students WHERE user_id = $1",
//         [user.id],
//       );
//       if (studentResult.rows.length > 0) {
//         dynamicUserData.student_id = studentResult.rows[0].id;
//         dynamicUserData.matric_no = studentResult.rows[0].matric_no;
//         dynamicUserData.department = studentResult.rows[0].department;
//         dynamicUserData.current_level = studentResult.rows[0].current_level;
//       }
//     }

//     const token = jwt.sign(
//       { id: user.id, role: user.role },
//       process.env.JWT_SECRET,
//       { expiresIn: "1d" },
//     );

//     res.json({ token, user: dynamicUserData });
//   } catch (error) {
//     console.error("Login Error:", error);
//     res.status(500).json({ message: "Server error during authentication." });
//   }
// };

// // 3. Get Student Roster (For Admin drop-down picking)
// exports.getAllStudents = async (req, res) => {
//   try {
//     const queryText = `
//       SELECT s.id AS student_id, u.name, s.matric_no 
//       FROM students s
//       JOIN users u ON s.user_id = u.id
//       ORDER BY u.name ASC;
//     `;
//     const result = await db.query(queryText);
//     res.json(result.rows);
//   } catch (error) {
//     console.error("Get Students Catalog Error:", error);
//     res
//       .status(500)
//       .json({ message: "Server error while fetching student roster." });
//   }
// };

// controllers/authController.js
const db = require("../config/db");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { encrypt, decrypt } = require("../utils/encryption"); // 🔒 Import AES-256 helpers

// 1. Register a User
exports.register = async (req, res) => {
  const { name, email, password, role, matric_no, department, current_level } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ message: "Missing required core registration fields." });
  }

  try {
    const userCheck = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ message: "User already exists with this email." });
    }

    const assignedRole = role === "admin" ? "admin" : "student";

    // 🔒 1. Hash Password with Bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    // 🔒 2. Encrypt Sensitive Profile Fields with AES-256
    const encryptedName = encrypt(name);
    const encryptedMatric = encrypt(matric_no);
    const encryptedDept = encrypt(department);

    await db.query("BEGIN");

    const userInsertQuery = `
      INSERT INTO users (name, email, password, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, role;
    `;
    const userResult = await db.query(userInsertQuery, [
      encryptedName, // Saved as AES ciphertext in Postgres!
      email,
      hashedPassword, // Saved as Bcrypt Hash!
      assignedRole,
    ]);
    const newUser = userResult.rows[0];

    if (assignedRole === "student") {
      if (!matric_no || !department) {
        await db.query("ROLLBACK");
        return res.status(400).json({ message: "Matric number and department are required for students." });
      }

      const studentInsertQuery = `
        INSERT INTO students (user_id, matric_no, department, current_level)
        VALUES ($1, $2, $3, $4);
      `;
      await db.query(studentInsertQuery, [
        newUser.id,
        encryptedMatric, // Saved as AES ciphertext in Postgres!
        encryptedDept,   // Saved as AES ciphertext in Postgres!
        current_level || 100,
      ]);
    }

    await db.query("COMMIT");

    const token = jwt.sign(
      { id: newUser.id, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(201).json({
      token,
      user: {
        id: newUser.id,
        name: decrypt(newUser.name), // 🔓 Decrypt back to clear text for the client
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

// 2. Login User
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const userResult = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ message: "Invalid Credentials" });
    }

    const user = userResult.rows[0];

    // 🔒 Verify Bcrypt password hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid Credentials" });
    }

    let dynamicUserData = {
      id: user.id,
      name: decrypt(user.name), // 🔓 Decrypt name for UI display
      email: user.email,
      role: user.role,
    };

    if (user.role === "student") {
      const studentResult = await db.query("SELECT * FROM students WHERE user_id = $1", [user.id]);
      if (studentResult.rows.length > 0) {
        dynamicUserData.student_id = studentResult.rows[0].id;
        dynamicUserData.matric_no = decrypt(studentResult.rows[0].matric_no); // 🔓 Decrypt
        dynamicUserData.department = decrypt(studentResult.rows[0].department); // 🔓 Decrypt
        dynamicUserData.current_level = studentResult.rows[0].current_level;
      }
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ token, user: dynamicUserData });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Server error during authentication." });
  }
};

// 3. Get Student Roster (Decrypted for Admin Dropdown)
exports.getAllStudents = async (req, res) => {
  try {
    const queryText = `
      SELECT s.id AS student_id, u.name, s.matric_no 
      FROM students s
      JOIN users u ON s.user_id = u.id
      ORDER BY u.id ASC;
    `;
    const result = await db.query(queryText);

    // 🔓 Decrypt each student's name and matric number before returning to frontend
    const decryptedRoster = result.rows.map(s => ({
      student_id: s.student_id,
      name: decrypt(s.name),
      matric_no: decrypt(s.matric_no),
    }));

    res.json(decryptedRoster);
  } catch (error) {
    console.error("Get Students Catalog Error:", error);
    res.status(500).json({ message: "Server error while fetching student roster." });
  }
};