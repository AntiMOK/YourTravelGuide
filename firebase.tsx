// This file configures and initializes the Firebase SDK.
// FIX: Use named imports for Firebase v9+ modular SDK instead of a namespace import.
// FIX: Use a namespace import for `firebase/app` to resolve module export errors.
import * as firebaseApp from "firebase/app";
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
// FIX: Updated to use `getApps` and `initializeApp` directly as required by Firebase v9+.
const app = !firebaseApp.getApps().length
  ? firebaseApp.initializeApp(firebaseConfig)
  : firebaseApp.getApps()[0];


// Export the initialized Firebase services.
// These are used throughout the application for authentication and database operations.
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };