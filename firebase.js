// This file configures and initializes the Firebase SDK.
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC4MxzEnQNFG6kNVzQ-JPc_aE4h5wQ9W-8",
  authDomain: "solid-sun-455713-d7.firebaseapp.com",
  projectId: "solid-sun-455713-d7",
  storageBucket: "solid-sun-455713-d7.firebasestorage.app",
  messagingSenderId: "527651787746",
  appId: "1:527651787746:web:ff167d69add4a2ed019fbb",
  measurementId: "G-66WW3MFRE8"
};

// Initialize Firebase, but only if it hasn't been initialized already.
// This prevents errors in environments with hot-reloading.
const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApps()[0];


// Export the initialized Firebase services.
// These are used throughout the application for authentication and database operations.
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

export { auth, db, functions };