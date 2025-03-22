import express from "express";
import cors from "cors";
import userRoutes from "./routes/fetchUsers.js"
import signUpRouter from './routes/signup.js';
import loginRouter from './routes/login.js';
import requestConnectionRoute from './routes/requestConnection.js';
import profileRouter from "./routes/profile.js"; // Import Profile Route

const app = express();

app.use(express.json());

app.use(cors());

app.use("/api/signup", signUpRouter);
app.use('/api/login', loginRouter);
app.use('/api/users', userRoutes);
app.use('/api/request-connection', requestConnectionRoute);
app.use("/api/profile", profileRouter); // Add Profile Route

app.get("/", async (req, res) => {
  res.send("Welcome");  
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port http://localhost:${PORT}`));
