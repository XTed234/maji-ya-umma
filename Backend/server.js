import express from "express";
import dotenv from "dotenv";

dotenv.config(); // Load environment variables

const app = express();
app.use(express.json()); // Middleware to parse JSON requests

// Test Route
app.get("/", (req, res) => {
  res.send("Welcome to Maji Ya Umma API!");
});

// Server Listener
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
