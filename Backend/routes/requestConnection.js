import express from "express";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import firebaseServices from "../firebase.js";

const router = express.Router();
const { db } = firebaseServices;

// Request Water Connection API
router.post("/", async (req, res) => {
    try {
        const { fullName, email, phoneNumber, address } = req.body;

        // Create request entry in Firestore
        const docRef = await addDoc(collection(db, "connectionRequests"), {
            fullName,
            email,
            phoneNumber,
            address,
            status: "Pending", // Initial status
            assignedTo: "Plumbing & Installation Unit", // Assign department
            createdAt: serverTimestamp()
        });

        res.status(201).json({ message: "Request submitted successfully", requestId: docRef.id });
    } catch (error) {
        res.status(500).json({ message: "Error submitting request", error: error.message });
    }
});

export default router;
