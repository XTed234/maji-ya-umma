import express from "express";
import dotenv from "dotenv";

import firebaseServices from './firebase.js';
import {createUser} from './signup.js';
import {getUsers} from './fetchUsers.js'
import {loginWithEmail} from './login.js';

const app = express();

const {db} = firebaseServices;

app.use(express.json()); // Middleware to parse JSON requests

dotenv.config(); // Load environment variables

// Get all users 
app.get("/api/users", async (req, res) => {
  try {
    const users = await getUsers();

    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: "Error fetching users", error: error.message });
  }
});

// Create user API
app.post("/api/signup", async (req, res) => {
  try {
    const { firstName, lastName, email, phoneNumber, idNumber, password } = req.body;

    const newUser = await createUser(firstName, lastName, email, phoneNumber, idNumber, password);
    
    res.status(201).json({ message: "User created successfully", user: newUser });
  } catch (error) {
    res.status(400).json({ message: "Error creating user", error: error.message });
  }
});

//Login API
app.post("/api/login", async(req, res) =>{
  try{
    const { email, password} = req.body;

    if(!email || !password){
      res.status(400).json({message: "Both email and password are required"});
    }

    const userData = await loginWithEmail(email, password);
    res.status(200).json({message: "Login Successful", user: userData });
  }catch(error) {
    res.status(401).json({message: "Invalid credentials"});
  }
});


app.get("/", async (req, res) => {
  res.send("Welcome");  
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port http://localhost:${PORT}`));
