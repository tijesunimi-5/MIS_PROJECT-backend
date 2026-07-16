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

// ⚡ AUTOMATIC COLUMN EXTENSION MIGRATION
// Runs on startup to ensure PostgreSQL allows long encrypted/hashed strings
const autoMigrateSchema = async () => {
  try {
    const client = await pool.connect();

    await client.query(`
      ALTER TABLE users ALTER COLUMN password TYPE VARCHAR(255);
      ALTER TABLE users ALTER COLUMN name TYPE TEXT;
      ALTER TABLE students ALTER COLUMN matric_no TYPE VARCHAR(255);
      ALTER TABLE students ALTER COLUMN department TYPE TEXT;
      ALTER TABLE courses ALTER COLUMN course_title TYPE TEXT;
    `);

    client.release();
    console.log(
      "⚡ Database schema auto-migration complete: Columns resized for AES-256 & Bcrypt!",
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

// Run column expansion on boot
// autoMigrateSchema();

module.exports = {
  query: (text, params) => pool.query(text, params),
};
