import { initAuth, getCurrentUser } from './auth.js';
import { loadGuideById, handleLikeClick, handleCommentSubmit, loadUserLibrary, loadAllGuides } from './firestore.js';
import { handleSearch, callCloudFunction, handleUseLocationClick, handleShareClick } from './api.js';
import * as ui from './ui.js';

// --- STATE MANAGEMENT ---
export const state = {
    currentView: 'home',
    currentUser: null,
    // Holds the flat array of restaurant objects for the current guide
    currentGuideData: [],
    currentSearchParams: null,
    currentGuideId: null, // ID of the currently viewed guide from Firestore
    isCurrentGuideLiked: false,
};

// --- NAVIGATION ---
function navigateTo(view) {
    state.currentView = view;
    ui.updateView(view);

    if (view === 'explore') {
        loadAllGuides();
    } else if (view === 'library') {
        loadUserLibrary();
    }
    
    ui.toggleMobileMenu(true); // Always close menu on navigation
    window.scrollTo(0, 0);
}

// --- INITIALIZATION ---
function init() {
    // Initialize authentication and set up a listener for user state changes
    initAuth((user) => {
        state.currentUser = user;
        ui.updateAuthUI(user);
        ui.updateCommentFormUI(user);
        
        // Refresh views that depend on user state
        if (state.currentView === 'library') {
            loadUserLibrary();
        }
        if (state.currentGuideId) {
            // Re-load guide to get correct like status for the new user
            loadGuideById(state.currentGuideId);
        }
    });
    
    // --- EVENT LISTENERS ---
    
    // Navigation
    ui.elements.siteTitleLink.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('home');
    });
    ui.elements.allNavButtons.forEach(btn => btn.addEventListener('click', () => navigateTo(btn.dataset.view)));
    ui.elements.mobileMenuToggle.addEventListener('click', () => ui.toggleMobileMenu());
    ui.elements.homeCtaButton.addEventListener('click', () => navigateTo('search'));
    ui.elements.finalCtaButton.addEventListener('click', () => navigateTo('search'));

    // Search & Results
    ui.elements.searchForm.addEventListener('submit', handleSearch);
    ui.elements.useLocationBtn.addEventListener('click', handleUseLocationClick);
    ui.elements.cityInput.addEventListener('input', () => ui.elements.locationMessage.classList.remove('visible'));
    ui.elements.newGuideButton.addEventListener('click', () => {
        state.currentGuideData = [];
        state.currentSearchParams = null;
        state.currentGuideId = null;
        ui.elements.searchForm.reset();
        location.hash = '';
        navigateTo('search');
    });
    ui.elements.findMoreButton.addEventListener('click', () => callCloudFunction(state.currentSearchParams, true));

    // Guide Actions (Like, Share, Comment)
    ui.elements.shareButton.addEventListener('click', handleShareClick);
    ui.elements.likeButton.addEventListener('click', handleLikeClick);
    ui.elements.commentForm.addEventListener('submit', handleCommentSubmit);
    
    // Initial Load
    navigateTo('home');
    parseUrlAndLoadGuide();
}

/**
 * Checks the URL hash on page load for a guide ID and loads it if present.
 */
function parseUrlAndLoadGuide() {
    const hash = window.location.hash.substring(1);
    if (!hash) return;
    
    const urlParams = new URLSearchParams(hash);
    const guideId = urlParams.get('guide');

    if (guideId) {
        loadGuideById(guideId);
    } 
}

// Start the application
init();
