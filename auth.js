import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { auth } from './firebase.js';

let currentUser = null;

// --- AUTHENTICATION ---
function handleLogin() {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch(error => {
        console.error("Login failed:", error);
        alert(`Login failed: ${error.message}`);
    });
}

function handleLogout() {
    signOut(auth);
}

function initAuth(onAuthStateChangeCallback) {
    onAuthStateChanged(auth, user => {
        currentUser = user;
        onAuthStateChangeCallback(user);
    });
}

function getCurrentUser() {
    return currentUser;
}

export { initAuth, handleLogin, handleLogout, getCurrentUser };
