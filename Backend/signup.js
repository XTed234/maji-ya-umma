import { createUserWithEmailAndPassword } from "firebase/auth";
import firebaseServices from './firebase.js'
import{collection, addDoc} from 'firebase/firestore';

const {auth, db} = firebaseServices;

export const createUser = async(firstName, lastName, email, phoneNumber, idNumber,  password,) => {
    try{
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const userCollection = collection(db, "user");
        const docRef = await addDoc(userCollection, {email, firstName, lastName, phoneNumber, idNumber} );
        console.log('User created with User ID:', docRef.id);
        return user;
    }catch(error) {
        console.error('Error creating user:', error.message);
        throw new Error(error.message);
    }
}