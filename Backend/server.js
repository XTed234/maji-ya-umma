import express from "express";
import dotenv from "dotenv";
import userRoutes from "./routes/fetchUsers.js"
import signUpRouter from './routes/signup.js';
import loginRouter from './routes/login.js';
import requestConnectionRoute from './routes/requestConnection.js';


const app = express();

app.use(express.json()); // Middleware to parse JSON requests

dotenv.config(); // Load environment variables

app.use("/api/signup", signUpRouter);

app.use('/api/login', loginRouter);

app.use('/api/users', userRoutes);

app.use('/api/request-connection', requestConnectionRoute);

app.get("/", async (req, res) => {
  res.send("Welcome");  
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port http://localhost:${PORT}`));
