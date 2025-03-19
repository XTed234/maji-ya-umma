import express from "express";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import firebaseServices from "../firebase.js";
import {getUserDetailsByEmail} from "../email.js";

const router = express.Router();
const { db } = firebaseServices;

router.post("/", async (req, res) => {
    try {
        const {email} = req.body;

        const user = await getUserDetailsByEmail(email);

        // Creates request entry in Firestore
        const docRef = await addDoc(collection(db, "connectionRequests"), {
            firstName: user.firstName,
            email: user.email,
            phoneNumber: user.phoneNumber,
            address: user.address,
            status: "Pending",
            assignedTo: "Plumbing & Installation Unit", 
            createdAt: serverTimestamp()
        });

        res.status(201).json({ message: "Request submitted successfully", requestId: docRef.id });
    } catch (error) {
        res.status(500).json({ message: "Error submitting request", error: error.message });
    }
});

export default router;
