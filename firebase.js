// This file configures and initializes the Firebase SDK.

// Fix: Use named imports for "firebase/app" to resolve module export errors.
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBwmCZDOADkNOnO4ar_Kb5VDbx4JXWq0AY",
  authDomain: "solid-sun-455713-d7.firebaseapp.com",
  projectId: "solid-sun-455713-d7",
  storageBucket: "solid-sun-455713-d7.appspot.com",
  messagingSenderId: "527651787746"
};

// Initialize Firebase, but only if it hasn't been initialized already.
// This prevents errors in environments with hot-reloading.
// Fix: Use named imports `getApps` and `initializeApp` directly instead of via a namespace.
const app = !getApps().length
  ? initializeApp(firebaseConfig)
  : getApps()[0];


// Export the initialized Firebase services.
// These are used throughout the application for authentication and database operations.
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
