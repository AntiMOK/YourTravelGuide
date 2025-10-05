import { httpsCallable } from "firebase/functions";
import { functions, db } from './firebase.js';
import { collection, query, where, limit, getDocs, doc, setDoc, arrayUnion, updateDoc } from "firebase/firestore";
import { saveGuide, loadGuideById } from './firestore.js';
import * as ui from './ui.js';
import { state } from './main.js';
import { getCurrentUser } from './auth.js';


/**
 * Creates a deterministic, unique string key from a set of search parameters.
 */
function createSearchKey(params) {
    const sortedParams = {};
    Object.keys(params).sort().forEach(key => {
        const value = params[key];
        if (Array.isArray(value)) {
            sortedParams[key] = [...value].sort();
        } else {
            sortedParams[key] = value;
        }
    });
    return JSON.stringify(sortedParams);
}

export async function handleSearch(event) {
    event?.preventDefault();
    state.currentView = 'search';
    ui.updateView('search');
    
    state.currentGuideId = null;
    ui.elements.commentsSection.hidden = true;
    ui.elements.searchPanel.setAttribute('hidden', 'true');
    ui.elements.resultsContainer.hidden = false;
    ui.elements.guideContent.innerHTML = '<div class="loader"></div><p class="loading-text">Checking for existing guides...</p>';

    const formData = new FormData(ui.elements.searchForm);
    state.currentSearchParams = {
        city: formData.get('city'),
        dish: formData.get('dish'),
        price: formData.get('price'),
        audience: formData.get('audience'),
        vibes: formData.getAll('vibe'),
        diets: formData.getAll('diet'),
    };

    const searchKey = createSearchKey(state.currentSearchParams);
    
    try {
        const guidesRef = collection(db, 'guides');
        const q = query(guidesRef, where('searchKey', '==', searchKey), limit(1));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const existingGuideDoc = querySnapshot.docs[0];
            await loadGuideById(existingGuideDoc.id);
            const currentUser = getCurrentUser();
            if (currentUser) {
                const userRef = doc(db, 'users', currentUser.uid);
                await setDoc(userRef, { library: arrayUnion(existingGuideDoc.id) }, { merge: true });
            }
            return;
        }

        location.hash = '';
        await callCloudFunction(state.currentSearchParams, false, searchKey);

    } catch (error) {
        console.error("Search failed:", error);
        const msg = error instanceof Error ? error.message : "An unknown error occurred.";
        ui.elements.guideContent.innerHTML = `<div class="error-message"><h3>Oops!</h3><p>${msg}</p></div>`;
    }
}

export async function callCloudFunction(params, isFindingMore, searchKey) {
    ui.elements.findMoreButton.hidden = true;
    ui.elements.findMoreButton.disabled = false;
    ui.elements.findMoreButton.querySelector('span').textContent = 'Find More';
    ui.updateLikeButtonUI(0, false, null, null);

    if (!isFindingMore) {
        ui.elements.guideContent.innerHTML = '<div class="loader"></div><p class="loading-text">Creating your guide...</p>';
        ui.elements.guideTitleEl.textContent = '';
        ui.elements.guideDescriptionEl.textContent = '';
        ui.elements.resultsContainer.hidden = false;
        ui.elements.commentsSection.hidden = true;
        state.currentGuideData = [];
        state.currentGuideId = null;
        ui.elements.shareButton.disabled = true;
    } else {
        ui.elements.findMoreButton.disabled = true;
        ui.elements.findMoreButton.querySelector('span').textContent = 'Searching...';
        params.existingNames = state.currentGuideData.map(r => r.name).join(', ');
    }
    
    const generateGuide = httpsCallable(functions, 'generateGuide');

    try {
        const result = await generateGuide({ params, isFindingMore });
        const data = result.data;

        if (!data) throw new Error("Received an empty response from the server.");

        if (isFindingMore) {
            state.currentGuideData.push(...data);
            if (state.currentGuideId) {
                const guideRef = doc(db, 'guides', state.currentGuideId);
                await updateDoc(guideRef, { data: state.currentGuideData });
            }
            ui.renderResults(state.currentGuideData, state.currentSearchParams);
        } else {
            state.currentGuideData = data;
            const newGuideId = await saveGuide({ params, data: state.currentGuideData, searchKey });
            state.currentGuideId = newGuideId;
            await loadGuideById(newGuideId); // Load the full guide to set all state correctly
        }
        
        ui.elements.shareButton.disabled = false;
        ui.elements.findMoreButton.hidden = false;

    } catch (error) {
        console.error("Cloud function error:", error);
        const msg = error.message || "An unknown error occurred while generating the guide.";
        ui.elements.guideContent.innerHTML = `<div class="error-message"><h3>Oops!</h3><p>${msg}</p></div>`;
    } finally {
        if(isFindingMore){
            ui.elements.findMoreButton.disabled = false;
            ui.elements.findMoreButton.querySelector('span').textContent = 'Find More';
        }
    }
}

export function handleUseLocationClick() {
  ui.elements.locationMessage.classList.remove('visible');

  if (navigator.geolocation) {
    const originalContent = ui.elements.useLocationBtn.innerHTML;
    ui.elements.useLocationBtn.disabled = true;
    ui.elements.useLocationBtn.innerHTML = '<div class="loader-small"></div>';

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        let cityName = 'Current Location';
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
            const data = await response.json();
            cityName = data.address.city || data.address.town || data.address.village || 'Current Location';
        } catch (error) {
            console.error('Reverse geocoding fetch failed:', error);
        }
        
        ui.elements.cityInput.value = cityName;
        ui.elements.locationMessage.textContent = `📍 Location set to ${cityName}.`;
        ui.elements.locationMessage.classList.add('visible');

        ui.elements.useLocationBtn.disabled = false;
        ui.elements.useLocationBtn.innerHTML = originalContent;
      },
      (error) => {
        console.error("Geolocation error:", error);
        alert("Could not get your location. Please ensure location services are enabled.");
        ui.elements.useLocationBtn.disabled = false;
        ui.elements.useLocationBtn.innerHTML = originalContent;
      }
    );
  } else {
    alert("Geolocation is not supported by your browser.");
  }
}

function generateShareUrl() {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.search = ''; 
    cleanUrl.hash = state.currentGuideId ? `guide=${state.currentGuideId}` : '';
    return cleanUrl.toString();
}

export async function handleShareClick() {
    if (!state.currentGuideId) return;

    const shareUrl = generateShareUrl();
    const shareData = {
        title: `Restaurant Guide for ${state.currentSearchParams?.city || 'a cool city'}`,
        text: `Check out this guide I made!`,
        url: shareUrl,
    };

    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            await navigator.clipboard.writeText(shareData.url);
            const originalText = ui.elements.shareButton.querySelector('span').textContent;
            ui.elements.shareButton.querySelector('span').textContent = 'Copied!';
            ui.elements.shareButton.disabled = true;
            setTimeout(() => {
                 ui.elements.shareButton.querySelector('span').textContent = originalText;
                 ui.elements.shareButton.disabled = false;
            }, 2000);
        }
    } catch (err) { console.error('Share failed:', err); }
}
