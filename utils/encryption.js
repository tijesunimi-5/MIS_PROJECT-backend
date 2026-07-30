// utils/encryption.js
const crypto = require("crypto");

const ALGORITHM = "aes-256-cbc";
// Ensure the key is 32 bytes
const SECRET_KEY = Buffer.from(
  process.env.AES_SECRET_KEY || "12345678901234567890123456789012",
);
const IV_LENGTH = 16; // AES requires a 16-byte Initialization Vector

// Encrypts plain text to AES-256-CBC hex string
function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  let encrypted = cipher.update(String(text), "utf8", "hex");
  encrypted += cipher.final("hex");
  // Return IV prepended to ciphertext so we can use it during decryption
  return `${iv.toString("hex")}:${encrypted}`;
}

// Decrypts AES-256-CBC hex string back to clear text
function decrypt(text) {
  if (!text || typeof text !== "string" || !text.includes(":")) return text;
  try {
    const [ivHex, encryptedText] = text.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error.message);
    return text; // Fallback if data wasn't encrypted
  }
}

// SHA-256 Blind Index Hashing for O(1) SQL queries
function hashData(text) {
  if (!text) return null;
  return crypto
    .createHash("sha256")
    .update(String(text).trim().toLowerCase())
    .digest("hex");
}

module.exports = { encrypt, decrypt, hashData };

