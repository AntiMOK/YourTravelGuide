// This file configures and initializes the Firebase SDK.

// Fix: Use namespace import to address module resolution issue with firebase/app.
// FIX: Switched from namespace import to named imports for Firebase v9+ SDK.
// FIX: Changed import to use scoped package to resolve module export error.
// FIX: Switched to namespace import for firebase/app to work around module resolution issues.
// FIX: Use named imports for Firebase v9+ modular SDK to resolve module property access errors.
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
// FIX: Use the imported `getApps` and `initializeApp` functions from the namespace import.
// FIX: Use direct function calls with named imports for Firebase v9+ modular SDK.
const app = !getApps().length
  ? initializeApp(firebaseConfig)
  // FIX: Called getApps as a function. It was previously being accessed as an array.
  : getApps()[0];


// Export the initialized Firebase services.
// These are used throughout the application for authentication and database operations.
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
