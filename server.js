// server.js
const express = require("express");
const cors = require("cors");
const authMiddleware = require("./middleware/authMiddleware");
require("dotenv").config();

const app = express();

// Middleware Injections
app.use(cors());
app.use(express.json());

// Main Routes Linkage
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/courses", require("./routes/courseRoutes"));
app.use("/api/results", require("./routes/resultRoutes"));

app.get("/live", async (req, res) => {
  res.status(200).send({ message: "The server is working"})
})

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running dynamically on port ${PORT}`),
);
