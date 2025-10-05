import { db } from './firebase.js';
import { 
    collection, query, where, limit, getDocs, doc, setDoc, arrayUnion, 
    addDoc, serverTimestamp, updateDoc, getDoc, documentId, 
    orderBy, arrayRemove, runTransaction, writeBatch, increment
} from "firebase/firestore";
import * as ui from './ui.js';
import { state } from './main.js';
import { getCurrentUser } from './auth.js';

// --- DATABASE (FIRESTORE) ---

export async function saveGuide(guide) {
    if (!guide) throw new Error("No guide data to save.");
    const currentUser = getCurrentUser();
    try {
        const newGuide = {
            params: guide.params,
            data: guide.data,
            searchKey: guide.searchKey || null,
            creatorUid: currentUser?.uid || null,
            createdAt: serverTimestamp(),
            likeCount: 0,
            commentCount: 0,
        };
        const docRef = await addDoc(collection(db, 'guides'), newGuide);
        return docRef.id;
    } catch (error) {
        console.error("Error saving guide:", error);
        throw new Error("Could not save the new guide.");
    }
}

export async function loadUserLibrary() {
    ui.elements.libraryContent.innerHTML = '<div class="loader"></div>';
    const currentUser = getCurrentUser();

    if (!currentUser) {
        ui.renderLibrary([], false);
        return;
    }

    try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
            ui.renderLibrary([], true);
            return;
        }
        const userData = userDocSnap.data();
        const guideIds = userData?.library || [];

        if (guideIds.length === 0) {
            ui.renderLibrary([], true);
            return;
        }
        
        const guidesQuery = query(collection(db, 'guides'), where(documentId(), 'in', guideIds));
        const guidesSnapshot = await getDocs(guidesQuery);
        const libraryGuides = guidesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        libraryGuides.sort((a, b) => guideIds.indexOf(b.id) - guideIds.indexOf(a.id));
        
        ui.renderLibrary(libraryGuides, true);
        addCardEventListeners();
    } catch (error) {
        console.error("Error loading library:", error);
        ui.elements.libraryContent.innerHTML = `<div class="error-message"><p>Could not load your library.</p></div>`;
    }
}

export async function loadAllGuides() {
    ui.elements.exploreContent.innerHTML = '<div class="loader"></div>';
    try {
        const guidesQuery = query(collection(db, 'guides'), orderBy('createdAt', 'desc'));
        const guidesSnapshot = await getDocs(guidesQuery);
        const allGuides = guidesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        ui.renderAllGuides(allGuides);
        addCardEventListeners();
    } catch (error) {
        console.error("Error loading all guides:", error);
        ui.elements.exploreContent.innerHTML = `<div class="error-message"><p>Could not load guides.</p></div>`;
    }
}

function addCardEventListeners() {
    document.querySelectorAll('.view-guide-btn, .library-card-info').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const guideId = e.currentTarget.dataset.id;
            loadGuideById(guideId);
        });
    });
    
    document.querySelectorAll('.delete-guide-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const guideId = e.currentTarget.dataset.id;
            const currentUser = getCurrentUser();
            if (confirm("Are you sure you want to remove this guide from your library?")) {
                 try {
                    const userRef = doc(db, 'users', currentUser.uid);
                    await updateDoc(userRef, {
                        library: arrayRemove(guideId)
                    });
                    loadUserLibrary();
                } catch (error) {
                    console.error("Error removing guide from library:", error);
                    alert("Could not remove guide. Please try again.");
                }
            }
        });
    });
}

export async function handleLikeClick() {
    const currentUser = getCurrentUser();
    if (!currentUser || !state.currentGuideId) return;

    ui.elements.likeButton.disabled = true;
    
    const guideRef = doc(db, 'guides', state.currentGuideId);
    const likeRef = doc(db, 'likes', `${state.currentGuideId}_${currentUser.uid}`);

    try {
        await runTransaction(db, async (transaction) => {
            const guideDoc = await transaction.get(guideRef);
            const likeDoc = await transaction.get(likeRef);

            if (!guideDoc.exists()) throw "Guide does not exist!";

            const currentLikeCount = guideDoc.data()?.likeCount || 0;
            let newLikeCount;
            let newIsLiked;

            if (likeDoc.exists()) { // Unliking
                transaction.delete(likeRef);
                newLikeCount = currentLikeCount - 1;
                newIsLiked = false;
            } else { // Liking
                transaction.set(likeRef, { guideId: state.currentGuideId, userId: currentUser.uid, createdAt: serverTimestamp() });
                newLikeCount = currentLikeCount + 1;
                newIsLiked = true;
            }

            const finalLikeCount = Math.max(0, newLikeCount);
            transaction.update(guideRef, { likeCount: finalLikeCount });
            state.isCurrentGuideLiked = newIsLiked;
            ui.updateLikeButtonUI(finalLikeCount, newIsLiked, currentUser, state.currentGuideId);
        });
    } catch (error) {
        console.error("Error handling like:", error);
    } finally {
        ui.elements.likeButton.disabled = !currentUser;
    }
}

export async function loadAndRenderComments(guideId) {
    ui.elements.commentsSection.hidden = false;
    ui.updateCommentFormUI(getCurrentUser());
    ui.elements.commentsList.innerHTML = '<div class="loader"></div>';
    try {
        const q = query(collection(db, 'comments'), where('guideId', '==', guideId), orderBy('createdAt', 'asc'));
        const commentsSnapshot = await getDocs(q);
        const comments = commentsSnapshot.docs.map(doc => doc.data());
        ui.renderComments(comments);
    } catch (e) {
        ui.elements.commentsList.innerHTML = `<p class="error-message">Could not load comments.</p>`;
    }
}

export async function handleCommentSubmit(event) {
    event.preventDefault();
    const currentUser = getCurrentUser();
    if (!currentUser || !state.currentGuideId) return;

    const commentText = ui.elements.commentInput.value.trim();
    if (!commentText) return;

    ui.elements.commentSubmitBtn.disabled = true;
    
    const guideRef = doc(db, 'guides', state.currentGuideId);
    const newCommentRef = doc(collection(db, 'comments'));

    const newComment = {
        guideId: state.currentGuideId,
        userId: currentUser.uid,
        userName: currentUser.displayName,
        userAvatar: currentUser.photoURL,
        text: commentText,
        createdAt: serverTimestamp(),
    };

    try {
        const guideDoc = await getDoc(guideRef);
        if (!guideDoc.exists()) throw new Error("Guide not found");
        
        const batch = writeBatch(db);
        batch.set(newCommentRef, newComment);
        batch.update(guideRef, { commentCount: increment(1) });
        await batch.commit();
        
        ui.elements.commentInput.value = '';
        await loadAndRenderComments(state.currentGuideId);
    } catch (error) {
        console.error("Failed to post comment:", error);
        alert("Sorry, we couldn't post your comment. Please try again.");
    } finally {
        ui.elements.commentSubmitBtn.disabled = false;
    }
}

export async function loadGuideById(guideId) {
    state.currentView = 'search';
    ui.updateView('search');
    ui.elements.searchPanel.setAttribute('hidden', 'true');
    ui.elements.resultsContainer.hidden = false;
    ui.elements.guideContent.innerHTML = '<div class="loader"></div><p class="loading-text">Loading your guide...</p>';
    ui.elements.commentsSection.hidden = true;

    try {
        const guideRef = doc(db, 'guides', guideId);
        const guideDoc = await getDoc(guideRef);

        if (guideDoc.exists()) {
            const guide = { id: guideDoc.id, ...guideDoc.data() };
            state.currentGuideData = guide.data;
            state.currentSearchParams = guide.params;
            state.currentGuideId = guide.id;
            
            ui.renderResults(state.currentGuideData, state.currentSearchParams);
            loadAndRenderComments(guideId);

            let isLiked = false;
            const currentUser = getCurrentUser();
            if (currentUser) {
                const likeRef = doc(db, 'likes', `${guideId}_${currentUser.uid}`);
                const likeDoc = await getDoc(likeRef);
                isLiked = likeDoc.exists();
            }
            state.isCurrentGuideLiked = isLiked;
            ui.updateLikeButtonUI(guide.likeCount || 0, isLiked, currentUser, guideId);

            ui.elements.shareButton.disabled = false;
            ui.elements.findMoreButton.hidden = false;
            location.hash = `guide=${guideId}`;
        } else {
            console.warn(`Guide with ID "${guideId}" not found.`);
            location.hash = '';
            state.currentView = 'home';
            ui.updateView('home');
        }
    } catch (error) {
        console.error("Error loading guide:", error);
        const msg = error instanceof Error ? error.message : "An unknown error occurred.";
        ui.elements.guideContent.innerHTML = `<div class="error-message"><h3>Oops!</h3><p>${msg}</p></div>`;
        ui.elements.commentsSection.hidden = true;
    }
}
