// config/db.js
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
});

// ⚡ AUTOMATIC SCHEMA MIGRATION & BLIND INDEX INITIALIZATION
const autoMigrateSchema = async () => {
  try {
    const client = await pool.connect();

    // 1. Create tables if they do not exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        email_hash VARCHAR(64)
      );

      CREATE TABLE IF NOT EXISTS students (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        matric_no TEXT NOT NULL,
        department TEXT NOT NULL,
        current_level INT DEFAULT 100,
        matric_no_hash VARCHAR(64)
      );

      CREATE TABLE IF NOT EXISTS courses (
        id SERIAL PRIMARY KEY,
        course_code TEXT NOT NULL,
        course_title TEXT NOT NULL,
        unit_counts INT DEFAULT 3,
        course_code_hash VARCHAR(64)
      );

      CREATE TABLE IF NOT EXISTS results (
        id SERIAL PRIMARY KEY,
        student_id INT REFERENCES students(id) ON DELETE CASCADE,
        course_id INT REFERENCES courses(id) ON DELETE CASCADE,
        ca_score NUMERIC(5,2) DEFAULT 0,
        exam_score NUMERIC(5,2) DEFAULT 0,
        letter_grade TEXT NOT NULL,
        grade_point NUMERIC(3,2) DEFAULT 0,
        semester TEXT NOT NULL,
        academic_year TEXT NOT NULL,
        semester_hash VARCHAR(64),
        academic_year_hash VARCHAR(64)
      );
    `);

    // 2. Add blind hash columns if missing in existing tables
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_hash VARCHAR(64);
      ALTER TABLE students ADD COLUMN IF NOT EXISTS matric_no_hash VARCHAR(64);
      ALTER TABLE courses ADD COLUMN IF NOT EXISTS course_code_hash VARCHAR(64);
      ALTER TABLE results ADD COLUMN IF NOT EXISTS semester_hash VARCHAR(64);
      ALTER TABLE results ADD COLUMN IF NOT EXISTS academic_year_hash VARCHAR(64);

      ALTER TABLE users ALTER COLUMN password TYPE TEXT;
      ALTER TABLE users ALTER COLUMN name TYPE TEXT;
      ALTER TABLE users ALTER COLUMN email TYPE TEXT;
      ALTER TABLE users ALTER COLUMN role TYPE TEXT;
      ALTER TABLE students ALTER COLUMN matric_no TYPE TEXT;
      ALTER TABLE students ALTER COLUMN department TYPE TEXT;
      ALTER TABLE courses ALTER COLUMN course_code TYPE TEXT;
      ALTER TABLE courses ALTER COLUMN course_title TYPE TEXT;
      ALTER TABLE results ALTER COLUMN letter_grade TYPE TEXT;
      ALTER TABLE results ALTER COLUMN semester TYPE TEXT;
      ALTER TABLE results ALTER COLUMN academic_year TYPE TEXT;
    `);

    // 3. Create indexes for O(1) performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email_hash ON users(email_hash);
      CREATE INDEX IF NOT EXISTS idx_students_matric_hash ON students(matric_no_hash);
      CREATE INDEX IF NOT EXISTS idx_courses_code_hash ON courses(course_code_hash);
      CREATE INDEX IF NOT EXISTS idx_results_lookup ON results(student_id, course_id, semester_hash, academic_year_hash);
    `);

    client.release();
    console.log(
      "⚡ Database schema auto-migration complete: Tables, SHA-256 blind indexes & column extensions verified!",
    );
  } catch (err) {
    console.error("Schema Migration Note:", err.message);
  }
};

pool.on("connect", () => {
  console.log(
    "🐘 PostgreSQL Database connection pool established successfully.",
  );
});

// Run schema migration on startup
autoMigrateSchema();

module.exports = {
  query: (text, params) => pool.query(text, params),
};

