// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCy2hOZJWTCdhl4OzHskyU6teOuN061a4Q",
  authDomain: "maji-ya-umma.firebaseapp.com",
  projectId: "maji-ya-umma",
  storageBucket: "maji-ya-umma.firebasestorage.app",
  messagingSenderId: "186912029349",
  appId: "1:186912029349:web:959c21a0859489fff82b4c"
};

const app = initializeApp(firebaseConfig); // Initialize Firebase
const db = getFirestore(firebaseApp); // Firestore Database
const auth = getAuth(firebaseApp); // Firebase Authentication

firebaseServices = { auth, app, db }; // Export Firestore database to use in other files
