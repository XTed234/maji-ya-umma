import { collection, getDocs } from "firebase/firestore";
import firebaseServices from "./firebase.js";

const { db } = firebaseServices;

export const getUsers = async () => {
    try {
        const usersCollection = collection(db, "user");
        const querySnapshot = await getDocs(usersCollection);
        
        let users = [];
        querySnapshot.forEach((doc) => {
            users.push({ id: doc.id, ...doc.data() });
        });

        return users;
    } catch (error) {
        console.error("Error fetching users:", error.message);
        throw new Error(error.message);
    }
};
