/*
---
title: Your Local Guide
emoji: 🗺️
colorFrom: indigo
colorTo: blue
sdk: google-genai
sdk_version: 1.20.0
app_file: index.tsx
pinned: false
---
*/
import { GoogleGenAI, Type } from "@google/genai";
import { auth, db } from './firebase';
import { User, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { 
    collection, query, where, limit, getDocs, doc, setDoc, arrayUnion, 
    addDoc, serverTimestamp, updateDoc, getDoc, Timestamp, documentId, 
    orderBy, arrayRemove, runTransaction, writeBatch, increment
} from "firebase/firestore";


// --- STATE MANAGEMENT ---
type View = 'home' | 'search' | 'library' | 'explore';
let currentView: View = 'home';
let currentUser: User | null = null;
// Holds the flat array of restaurant objects for the current guide
let currentGuideData: any[] = [];
let currentSearchParams: Record<string, any> | null = null;
let currentGuideId: string | null = null; // ID of the currently viewed guide from Firestore
let isCurrentGuideLiked: boolean = false;


// --- GEMINI API SETUP ---
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const model = "gemini-2.5-flash";

// --- SYSTEM INSTRUCTIONS ---
const baseSystemInstruction = `You are an AI assistant creating a premium JSON food guide.
Goal: Return a JSON array for a city, split into three categories with a specific structure.
Categories & Rules:
1. "Trending Spots" (13 places):
    - First 8 places: Trendy, highly-rated spots based on a meta-analysis of local reviews and buzz.
    - Next 5 places: The single best spot for each of the following: Best Pizza, Best Burger, Best Sushi, Best Breakfast, Best Coffee. For these 5, you MUST set "is_best_of" to true and provide a "best_of_title" like "Best Pizza in Town".
2. "Local Favorites" (6 places): Authentic, beloved spots popular with locals.
3. "Fine Dining" (3 places): High-end, acclaimed restaurants.

CRITICAL: When selecting restaurants for each category, you MUST strictly adhere to the user's specified preferences for price, vibe, and dietary needs. If the user specifies a dietary need, ensure the restaurants you select can accommodate it.

For each place, provide all of the following fields: category, name, cuisine, description, food_story, price_range, atmosphere, recommended_dishes (as a string array), special_experience, address, is_best_of (boolean), best_of_title (string, can be empty).
The food_story should be a brief, engaging story about the restaurant's signature dish, its origin, or its culinary philosophy.
The address must be a complete, real-world street address for the location.
The price_range field should accurately reflect the cost: $ (inexpensive), $$ (moderate), $$$ (expensive), $$$$ (luxury). Provide a variety of price ranges unless a specific one is requested by the user.
Your response MUST be ONLY the raw JSON array. Do not add any other text or markdown formatting.`;

const topTenSystemInstruction = `You are an AI assistant creating a "Top 10" list for a specific food or cuisine in a city.
Goal: Return a JSON array of the 10 best places for the requested item.
CRITICAL: The list must be strictly focused on the user's request. You MUST consider their specified preferences for price, vibe, and especially any dietary needs.

For each place, provide all of the following fields: category, name, cuisine, description, food_story, price_range, atmosphere, recommended_dishes (as a string array), special_experience, address. is_best_of and best_of_title should be false and empty respectively.
The food_story should be a brief, engaging story about the restaurant's signature dish, its origin, or its culinary philosophy.
The address must be a complete, real-world street address for the location.
The price_range field should accurately reflect the cost: $ (inexpensive), $$ (moderate), $$$ (expensive), $$$$ (luxury). Provide a variety of price ranges unless a specific one is requested by the user.
Every object in the array MUST have a "category" field with the exact value "Top 10".
Your response MUST be ONLY the raw JSON array. Do not add any other text or markdown formatting.`;

const findMoreSystemInstruction = `You are an AI assistant finding 5 more restaurants in a city.
Goal: Return a JSON array of 5 new places, excluding a provided list of names.
For each place, provide all of the following fields: category (e.g., "Hidden Gem", "Trendy Spot", "Breakfast Place"), name, cuisine, description, food_story, price_range, atmosphere, recommended_dishes (as a string array), special_experience, address. is_best_of and best_of_title should be false and empty respectively.
The food_story should be a brief, engaging story about the restaurant's signature dish, its origin, or its culinary philosophy.
The address must be a complete, real-world street address for the location.
Your response MUST be ONLY the raw JSON array. Do not add any other text or markdown formatting.`;


const responseSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      category: { type: Type.STRING },
      name: { type: Type.STRING },
      cuisine: { type: Type.STRING },
      description: { type: Type.STRING },
      food_story: { type: Type.STRING },
      price_range: { type: Type.STRING, description: "Price range from '$' to '$$$$'." },
      atmosphere: { type: Type.STRING },
      recommended_dishes: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      },
      special_experience: { type: Type.STRING },
      address: { type: Type.STRING },
      is_best_of: { type: Type.BOOLEAN },
      best_of_title: { type: Type.STRING },
    },
    required: ["category", "name", "cuisine", "description", "food_story", "price_range", "atmosphere", "recommended_dishes", "special_experience", "address", "is_best_of", "best_of_title"],
  }
};


// --- DOM ELEMENT SELECTORS ---
const viewElements = {
  home: document.getElementById('home-view')!,
  search: document.getElementById('search-view')!,
  library: document.getElementById('library-view')!,
  explore: document.getElementById('explore-view')!,
};
const siteTitleLink = document.querySelector('.site-title-link')!;
const allNavButtons = document.querySelectorAll<HTMLButtonElement>('.nav-button');
const authContainer = document.getElementById('auth-container')!;
const mobileAuthContainer = document.getElementById('mobile-auth-container')!;
const searchForm = document.getElementById('search-form') as HTMLFormElement;
const searchPanel = document.getElementById('search-panel')!;
const resultsContainer = document.getElementById('results-container')!;
const guideContent = document.getElementById('guide-content')!;
const guideTitleEl = document.getElementById('guide-title')!;
const guideDescriptionEl = document.getElementById('guide-description')!;
const libraryContent = document.getElementById('library-content')!;
const exploreContent = document.getElementById('explore-content')!;
const useLocationBtn = document.getElementById('use-location-btn') as HTMLButtonElement;
const cityInput = document.getElementById('city-input') as HTMLInputElement;
const locationMessage = document.getElementById('location-message') as HTMLParagraphElement;
const newGuideButton = document.getElementById('new-guide-button')!;
const shareButton = document.getElementById('share-button') as HTMLButtonElement;
const findMoreButton = document.getElementById('find-more-button') as HTMLButtonElement;
const likeButton = document.getElementById('like-button') as HTMLButtonElement;
const likeCountEl = document.getElementById('like-count') as HTMLSpanElement;
const commentsSection = document.getElementById('comments-section')!;
const commentsList = document.getElementById('comments-list')!;
const commentForm = document.getElementById('comment-form') as HTMLFormElement;
const commentInput = document.getElementById('comment-input') as HTMLTextAreaElement;
const commentSubmitBtn = document.getElementById('comment-submit-btn') as HTMLButtonElement;
const commentUserAvatar = document.getElementById('comment-user-avatar') as HTMLImageElement;
const commentLoginPrompt = document.getElementById('comment-login-prompt') as HTMLParagraphElement;
const mobileMenuToggle = document.getElementById('mobile-menu-toggle')!;
const mobileNavContainer = document.getElementById('mobile-nav-container')!;
const homeCtaButton = document.getElementById('home-cta-button')!;
const finalCtaButton = document.getElementById('final-cta-button')!;


// --- NAVIGATION ---
function toggleMobileMenu(forceClose = false) {
    const isExpanded = mobileMenuToggle.getAttribute('aria-expanded') === 'true';
    if (forceClose || isExpanded) {
        mobileMenuToggle.setAttribute('aria-expanded', 'false');
        mobileNavContainer.classList.remove('open');
        document.body.classList.remove('no-scroll');
    } else {
        mobileMenuToggle.setAttribute('aria-expanded', 'true');
        mobileNavContainer.classList.add('open');
        document.body.classList.add('no-scroll');
    }
}

function navigateTo(view: View) {
    currentView = view;
    
    (Object.keys(viewElements) as View[]).forEach(key => {
        viewElements[key].hidden = key !== view;
    });

    allNavButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    if (view === 'search') {
        // Reset the main search/home view
        resultsContainer.hidden = true;
        searchPanel.removeAttribute('hidden');
    } else if (view === 'explore') {
        loadAllGuides();
    } else if (view === 'library') {
        loadUserLibrary();
    }
    
    toggleMobileMenu(true); // Always close menu on navigation
    window.scrollTo(0, 0);
}


// --- DYNAMIC PROMPT BUILDER ---
function buildUserPrompt(params: Record<string, any>): string {
    const preferences: string[] = [];

    if (params.price) {
        preferences.push(`- Desired price range is "${params.price}".`);
    }
    if (params.audience) {
        preferences.push(`- The guide should be tailored for a "${params.audience}" audience.`);
    }
    if (params.vibes && params.vibes.length > 0) {
        preferences.push(`- The desired vibe is: ${params.vibes.join(', ')}.`);
    }
    if (params.diets && params.diets.length > 0) {
        preferences.push(`- IMPORTANT: The guide MUST include options suitable for the following dietary needs: ${params.diets.join(', ')}.`);
    }

    let prompt;
    if (params.dish) {
        prompt = `Create a "Top 10" list for the best "${params.dish}" in ${params.city}.`;
    } else {
        prompt = `Create a guide for ${params.city}.`;
    }

    if (preferences.length > 0) {
        prompt += "\n\nPlease adhere to the following user preferences:\n" + preferences.join('\n');
    }
    
    return prompt;
}

// --- API CALL & RENDERING ---

/**
 * Creates a deterministic, unique string key from a set of search parameters.
 * This is used to cache and retrieve previously generated guides.
 */
function createSearchKey(params: Record<string, any>): string {
    const sortedParams: Record<string, any> = {};
    // Sort keys to ensure consistent string output
    Object.keys(params).sort().forEach(key => {
        const value = params[key];
        if (Array.isArray(value)) {
            // Sort arrays to handle different checkbox selection orders
            sortedParams[key] = [...value].sort();
        } else {
            sortedParams[key] = value;
        }
    });
    // Use JSON.stringify for a consistent, readable key.
    return JSON.stringify(sortedParams);
}

async function handleSearch(event?: Event) {
    event?.preventDefault();
    navigateTo('search');
    
    currentGuideId = null;
    commentsSection.hidden = true;
    searchPanel.setAttribute('hidden', 'true');
    resultsContainer.hidden = false;
    guideContent.innerHTML = '<div class="loader"></div><p class="loading-text">Checking for existing guides...</p>';

    const formData = new FormData(searchForm);
    currentSearchParams = {
        city: formData.get('city') as string,
        dish: formData.get('dish') as string,
        price: formData.get('price') as string,
        audience: formData.get('audience') as string,
        vibes: formData.getAll('vibe') as string[],
        diets: formData.getAll('diet') as string[],
    };

    const searchKey = createSearchKey(currentSearchParams);
    
    try {
        const guidesRef = collection(db, 'guides');
        const q = query(guidesRef, where('searchKey', '==', searchKey), limit(1));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            // A guide for this exact search already exists. Load it.
            const existingGuideDoc = querySnapshot.docs[0];
            const guideId = existingGuideDoc.id;
            
            await loadGuideById(guideId);

            // If a user is logged in, ensure this guide is in their library.
            if (currentUser) {
                const userRef = doc(db, 'users', currentUser.uid);
                await setDoc(userRef, {
                    library: arrayUnion(guideId)
                }, { merge: true });
            }
            return; // Search is complete.
        }

        // No existing guide found. Generate a new one.
        location.hash = ''; // Clear hash for new search
        await callGemini(currentSearchParams, false, searchKey);

    } catch (error) {
        console.error("Search failed:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        guideContent.innerHTML = `<div class="error-message"><h3>Oops! Something went wrong.</h3><p>${errorMessage}</p></div>`;
    }
}

async function callGemini(params: Record<string, any>, isFindingMore: boolean, searchKey?: string) {
    findMoreButton.hidden = true;
    findMoreButton.disabled = false;
    (findMoreButton.querySelector('span') as HTMLElement).textContent = 'Find More';
    updateLikeButtonUI(0, false); // Reset like button

    if (!isFindingMore) {
        guideContent.innerHTML = '<div class="loader"></div><p class="loading-text">Creating your guide...</p>';
        guideTitleEl.textContent = '';
        guideDescriptionEl.textContent = '';
        resultsContainer.hidden = false;
        commentsSection.hidden = true;
        currentGuideData = [];
        currentGuideId = null;
        shareButton.disabled = true;
    } else {
        findMoreButton.disabled = true;
        (findMoreButton.querySelector('span') as HTMLElement).textContent = 'Searching...';
    }

    let systemInstruction: string;
    let prompt: string;

    if (isFindingMore) {
        const existingNames = currentGuideData.map(r => r.name).join(', ');
        systemInstruction = findMoreSystemInstruction;
        prompt = `Find 5 more restaurants in ${params.city}, excluding these: ${existingNames}.`;
    } else {
        prompt = buildUserPrompt(params);
        systemInstruction = params.dish ? topTenSystemInstruction : baseSystemInstruction;
    }

    const combinedPrompt = `${systemInstruction}\n\n---\n\n# USER REQUEST:\n\n${prompt}`;

    try {
        const result = await ai.models.generateContent({
            model: model, 
            contents: combinedPrompt,
            config: { responseMimeType: 'application/json', responseSchema }
        });

        const jsonString = result.text;
        if (!jsonString) throw new Error("Received an empty response from the API.");

        let data;
        try {
            data = JSON.parse(jsonString);
        } catch (parseError) {
            throw new Error("The AI couldn't create a valid guide. Please try a more general search.");
        }

        if (isFindingMore) {
            currentGuideData.push(...data);
            if (currentGuideId) {
                // Update the guide in Firestore
                const guideRef = doc(db, 'guides', currentGuideId);
                await updateDoc(guideRef, { data: currentGuideData });
            }
            renderResults(currentGuideData);
        } else {
            currentGuideData = data;
            const newGuideId = await saveGuide({ params, data: currentGuideData, searchKey });
            currentGuideId = newGuideId;
            updateLikeButtonUI(0, false);
            
            if (currentGuideId) {
                location.hash = `guide=${currentGuideId}`;
                if (currentUser) {
                    const userRef = doc(db, 'users', currentUser.uid);
                    await setDoc(userRef, {
                        library: arrayUnion(currentGuideId)
                    }, { merge: true });
                }
                loadAndRenderComments(currentGuideId);
            }
            renderResults(currentGuideData); // Render after saving and getting ID
        }
        
        shareButton.disabled = false;
        findMoreButton.hidden = false;

    } catch (error) {
        console.error(error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        guideContent.innerHTML = `<div class="error-message"><h3>Oops! Something went wrong.</h3><p>${errorMessage}</p></div>`;
    } finally {
        if(isFindingMore){
            findMoreButton.disabled = false;
            (findMoreButton.querySelector('span') as HTMLElement).textContent = 'Find More';
        }
    }
}


function renderResults(data: any[]) {
    guideContent.innerHTML = '';
    
    if (currentSearchParams?.dish) {
        guideTitleEl.textContent = `Top 10 ${currentSearchParams.dish} in ${currentSearchParams.city}`;
        guideDescriptionEl.textContent = `Our curated list of the absolute best places to find ${currentSearchParams.dish}.`;
    } else {
        guideTitleEl.textContent = `Your Custom Guide to ${currentSearchParams?.city}`;
        guideDescriptionEl.textContent = `A personalized selection of top restaurants based on your preferences.`;
    }
    
    const groupedByCategory = data.reduce((acc, resto) => {
        (acc[resto.category] = acc[resto.category] || []).push(resto);
        return acc;
    }, {});

    const categoryOrder = ["Trending Spots", "Local Favorites", "Fine Dining", "Top 10"];

    Object.keys(groupedByCategory).sort((a,b) => {
        const indexA = categoryOrder.indexOf(a) > -1 ? categoryOrder.indexOf(a) : 99;
        const indexB = categoryOrder.indexOf(b) > -1 ? categoryOrder.indexOf(b) : 99;
        return indexA - indexB;
    }).forEach(categoryTitle => {
        const categoryEl = document.createElement('div');
        categoryEl.className = 'result-category';

        const categoryTitleEl = document.createElement('h3');
        categoryTitleEl.textContent = categoryTitle;
        categoryEl.appendChild(categoryTitleEl);

        const restaurantsInCategory = groupedByCategory[categoryTitle];

        if (categoryTitle === "Trending Spots") {
            const regularTrending = restaurantsInCategory.filter((r: any) => !r.is_best_of);
            const bestOfTrending = restaurantsInCategory.filter((r: any) => r.is_best_of);

            const restaurantGrid = document.createElement('div');
            restaurantGrid.className = 'restaurant-grid';
            regularTrending.forEach((resto: any) => {
                restaurantGrid.appendChild(createRestaurantCard(resto));
            });
            categoryEl.appendChild(restaurantGrid);

            if (bestOfTrending.length > 0) {
                const bestOfContainer = document.createElement('div');
                bestOfContainer.className = 'best-of-container';
                const bestOfTitle = document.createElement('h4');
                bestOfTitle.className = 'best-of-section-title';
                bestOfTitle.textContent = 'Community Bests';
                bestOfContainer.appendChild(bestOfTitle);

                const bestOfGrid = document.createElement('div');
                bestOfGrid.className = 'best-of-grid';
                const bestOfColors = ['yellow', 'blue', 'red', 'green'];
                bestOfTrending.forEach((resto: any, index: number) => {
                    const color = bestOfColors[index % bestOfColors.length];
                    bestOfGrid.appendChild(createRestaurantCard(resto, true, color));
                });
                bestOfContainer.appendChild(bestOfGrid);
                categoryEl.appendChild(bestOfContainer);
            }
        } else {
            const restaurantGrid = document.createElement('div');
            restaurantGrid.className = 'restaurant-grid';
            restaurantsInCategory.forEach((resto: any) => {
                restaurantGrid.appendChild(createRestaurantCard(resto));
            });
            categoryEl.appendChild(restaurantGrid);
        }
        guideContent.appendChild(categoryEl);
    });
}

function createRestaurantCard(resto: any, isBestOfCard: boolean = false, bestOfColor: string = 'yellow'): HTMLElement {
    const card = document.createElement('div');
    card.className = `restaurant-card ${isBestOfCard ? `best-of-card color-${bestOfColor}` : ''}`;
    const price = resto.price_range || resto.price || '';

    const mapQuery = encodeURIComponent(`${resto.name}, ${resto.address}`);
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;

    const recommendedDishesHtml = (resto.recommended_dishes || []).map((dish: string) => `<li>${dish}</li>`).join('');

    card.innerHTML = `
        <div class="card-content">
            ${isBestOfCard ? `<h5 class="best-of-title">${resto.best_of_title}</h5>` : ''}
            <h4>${resto.name}</h4>
             <div class="tags">
                <span class="tag tag-price price-${price.length || 1}">${price}</span>
                <span class="tag tag-cuisine">${resto.cuisine}</span>
                <span class="tag tag-atmosphere">${resto.atmosphere}</span>
            </div>
            <p class="description">${resto.description}</p>
            <div class="card-details">
                <div class="detail-item">
                    <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20"><path d="M0 0h24v24H0z" fill="none"/><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7s2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/></svg>
                    <div class="recommended-dishes-container">
                        <strong>Recommended:</strong>
                        <ul class="recommended-dishes-list">${recommendedDishesHtml}</ul>
                    </div>
                </div>
                <div class="detail-item">
                   <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20"><path d="M0 0h24v24H0z" fill="none"/><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    <span>${resto.special_experience}</span>
                </div>
                 <div class="detail-item">
                    <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20"><path d="M0 0h24v24H0z" fill="none"/><path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5V15c1.45-1.1 3.55-1.5 5.5-1.5 1.17 0 2.39.15 3.5.5V5zm-3.5 8.5c-1.1 0-2.15-.15-3.15-.45v-2.43c1-.26 2.05-.42 3.15-.42 1.1 0 2.05.16 3 .42v2.43c-1-.3-2-.45-3-.45zM3 19c1.11-.35 2.33-.5 3.5-.5 1.95 0 4.05.4 5.5 1.5V6.5c-1.45-1.1-3.55-1.5-5.5-1.5S2.95 5.15 2 5.5v13c.33-.17.67-.33 1-.5z"/></svg>
                    <span>${resto.food_story}</span>
                </div>
                <div class="card-action-item">
                    <a href="${mapUrl}" target="_blank" rel="noopener noreferrer" class="map-button button-secondary">
                         <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20"><path d="M0 0h24v24H0z" fill="none"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                        <span>View on Map</span>
                    </a>
                </div>
            </div>
        </div>
    `;
    
    return card;
}


// --- DATABASE (FIRESTORE) ---

async function saveGuide(guide: { params: Record<string, any>, data: any[], searchKey?: string }): Promise<string> {
    if (!guide) throw new Error("No guide data to save.");
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

async function loadUserLibrary() {
    libraryContent.innerHTML = '<div class="loader"></div>';
    if (!currentUser) {
        renderLibrary([]);
        return;
    }

    try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
            renderLibrary([]);
            return;
        }
        const userData = userDocSnap.data();
        const guideIds = userData?.library || [];

        if (guideIds.length === 0) {
            renderLibrary([]);
            return;
        }
        
        const guidesQuery = query(collection(db, 'guides'), where(documentId(), 'in', guideIds));
        const guidesSnapshot = await getDocs(guidesQuery);
        const libraryGuides = guidesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Sort guides to match the order in the user's library (most recent first)
        libraryGuides.sort((a, b) => guideIds.indexOf(b.id) - guideIds.indexOf(a.id));
        
        renderLibrary(libraryGuides as any[]);
    } catch (error) {
        console.error("Error loading library:", error);
        libraryContent.innerHTML = `<div class="error-message"><p>Could not load your library.</p></div>`;
    }
}

function renderLibrary(guides: any[]) {
    libraryContent.innerHTML = '';
    if (!currentUser) {
        libraryContent.innerHTML = '<p class="empty-library-message">Please log in to view your saved guides.</p>';
        return;
    }
    if (guides.length === 0) {
        libraryContent.innerHTML = '<p class="empty-library-message">You haven\'t saved any guides yet.</p>';
        return;
    }
    renderGuideCards(libraryContent, guides, true); // true for showing delete button
}

async function loadAllGuides() {
    exploreContent.innerHTML = '<div class="loader"></div>';
    try {
        const guidesQuery = query(collection(db, 'guides'), orderBy('createdAt', 'desc'));
        const guidesSnapshot = await getDocs(guidesQuery);
        const allGuides = guidesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAllGuides(allGuides as any[]);
    } catch (error) {
        console.error("Error loading all guides:", error);
        exploreContent.innerHTML = `<div class="error-message"><p>Could not load guides.</p></div>`;
    }
}

function renderAllGuides(guides: any[]) {
    exploreContent.innerHTML = '';
     if (guides.length === 0) {
        exploreContent.innerHTML = '<p class="empty-library-message">No guides have been created yet. Be the first!</p>';
        return;
    }
    renderGuideCards(exploreContent, guides, false); // false for not showing delete button
}


function renderGuideCards(container: HTMLElement, guides: any[], showDelete: boolean) {
    container.innerHTML = '';
    guides.forEach((guide) => {
        if (!guide) return;
        const card = document.createElement('div');
        card.className = 'library-card';
        const title = guide.params.dish ? `Top 10 ${guide.params.dish}` : `Guide to ${guide.params.city}`;
        const likeCount = guide.likeCount || 0;
        const commentCount = guide.commentCount || 0;
        card.innerHTML = `
            <div class="library-card-content">
                <div class="library-card-info" data-id="${guide.id}">
                    <h4>${title}</h4>
                    <p>❤️ ${likeCount} | 💬 ${commentCount} | ${guide.data.length} places in ${guide.params.city}</p>
                </div>
                <div class="library-card-actions">
                    <button class="button-secondary view-guide-btn" data-id="${guide.id}">View</button>
                    ${showDelete ? `<button class="button-danger delete-guide-btn" data-id="${guide.id}">Delete</button>` : ''}
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    container.querySelectorAll('.view-guide-btn, .library-card-info').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const guideId = (e.currentTarget as HTMLElement).dataset.id!;
            loadGuideById(guideId);
        });
    });
    
    if (showDelete) {
        container.querySelectorAll('.delete-guide-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const guideId = (e.currentTarget as HTMLButtonElement).dataset.id!;
                if (confirm("Are you sure you want to remove this guide from your library? This will not delete the guide for other users.")) {
                     try {
                        const userRef = doc(db, 'users', currentUser!.uid);
                        await updateDoc(userRef, {
                            library: arrayRemove(guideId)
                        });
                        loadUserLibrary(); // Reload to reflect changes
                    } catch (error) {
                        console.error("Error removing guide from library:", error);
                        alert("Could not remove guide. Please try again.");
                    }
                }
            });
        });
    }
}


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

function updateAuthUI(user: User | null) {
    const desktopHtml = user ? `
        <div class="user-profile">
            <img src="${user.photoURL || ''}" alt="User avatar" class="user-avatar">
            <span class="user-name">${user.displayName || 'User'}</span>
            <button id="logout-button-desktop" class="button-secondary">Logout</button>
        </div>
    ` : `<button id="login-button-desktop" class="button-primary">Login</button>`;
    
    const mobileHtml = user ? `
        <div class="user-profile">
            <img src="${user.photoURL || ''}" alt="User avatar" class="user-avatar">
            <span class="user-name">${user.displayName || 'User'}</span>
            <button id="logout-button-mobile" class="button-secondary">Logout</button>
        </div>
    ` : `<button id="login-button-mobile" class="button-primary">Login</button>`;

    authContainer.innerHTML = desktopHtml;
    mobileAuthContainer.innerHTML = mobileHtml;

    if (user) {
        document.getElementById('logout-button-desktop')!.addEventListener('click', handleLogout);
        document.getElementById('logout-button-mobile')!.addEventListener('click', handleLogout);
    } else {
        document.getElementById('login-button-desktop')!.addEventListener('click', handleLogin);
        document.getElementById('login-button-mobile')!.addEventListener('click', handleLogin);
    }
}


function initAuth() {
    onAuthStateChanged(auth, user => {
        currentUser = user;
        updateAuthUI(user);
        updateCommentFormUI();
        if (currentView === 'library') {
            loadUserLibrary();
        } else if (currentView === 'explore') {
            loadAllGuides();
        }
        // If a guide is loaded, refresh its like status
        if (currentGuideId) {
            loadGuideById(currentGuideId);
        }
    });
}

// --- LIKES & COMMENTS ---

function updateLikeButtonUI(likeCount: number, isLiked: boolean) {
    if (!currentGuideId) {
        likeButton.disabled = true;
        likeButton.classList.remove('liked');
        likeCountEl.textContent = '0';
        return;
    }
    
    likeButton.disabled = !currentUser;
    likeCountEl.textContent = String(likeCount);
    isCurrentGuideLiked = isLiked;
    if (isLiked) {
        likeButton.classList.add('liked');
        likeButton.setAttribute('aria-label', 'Unlike Guide');
    } else {
        likeButton.classList.remove('liked');
        likeButton.setAttribute('aria-label', 'Like Guide');
    }
}

async function handleLikeClick() {
    if (!currentUser || !currentGuideId) return;

    likeButton.disabled = true;
    
    const guideRef = doc(db, 'guides', currentGuideId);
    const likeRef = doc(db, 'likes', `${currentGuideId}_${currentUser.uid}`);

    try {
        await runTransaction(db, async (transaction) => {
            const guideDoc = await transaction.get(guideRef);
            const likeDoc = await transaction.get(likeRef);

            if (!guideDoc.exists()) {
                throw "Guide does not exist!";
            }

            const currentLikeCount = guideDoc.data()?.likeCount || 0;
            let newLikeCount;

            if (likeDoc.exists()) {
                // Unliking
                transaction.delete(likeRef);
                newLikeCount = currentLikeCount - 1;
                isCurrentGuideLiked = false;
            } else {
                // Liking
                transaction.set(likeRef, { guideId: currentGuideId, userId: currentUser.uid, createdAt: serverTimestamp() });
                newLikeCount = currentLikeCount + 1;
                isCurrentGuideLiked = true;
            }

            const finalLikeCount = Math.max(0, newLikeCount);
            transaction.update(guideRef, { likeCount: finalLikeCount });
            updateLikeButtonUI(finalLikeCount, isCurrentGuideLiked);
        });
    } catch (error) {
        console.error("Error handling like:", error);
    } finally {
        likeButton.disabled = !currentUser;
    }
}

function updateCommentFormUI() {
    if (currentUser) {
        commentInput.disabled = false;
        commentSubmitBtn.disabled = false;
        commentLoginPrompt.hidden = true;
        commentUserAvatar.src = currentUser.photoURL!;
        commentUserAvatar.hidden = false;
        commentInput.placeholder = 'Add a comment...';
    } else {
        commentInput.disabled = true;
        commentSubmitBtn.disabled = true;
        commentLoginPrompt.hidden = false;
        commentUserAvatar.hidden = true;
        commentInput.placeholder = 'Log in to leave a comment';
    }
}

async function loadAndRenderComments(guideId: string) {
    commentsSection.hidden = false;
    updateCommentFormUI();
    commentsList.innerHTML = '<div class="loader"></div>';
    try {
        const q = query(collection(db, 'comments'), where('guideId', '==', guideId), orderBy('createdAt', 'asc'));
        const commentsSnapshot = await getDocs(q);
        const comments = commentsSnapshot.docs.map(doc => doc.data());
        renderComments(comments as any[]);
    } catch (e) {
        commentsList.innerHTML = `<p class="error-message">Could not load comments.</p>`;
    }
}

function renderComments(comments: any[]) {
    commentsList.innerHTML = '';
    if (comments.length === 0) {
        commentsList.innerHTML = `<p class="empty-library-message">No comments yet. Be the first to share your thoughts!</p>`;
        return;
    }

    comments.forEach(comment => {
        const commentEl = document.createElement('div');
        commentEl.className = 'comment-item';
        
        const timeAgo = comment.createdAt ? new Date((comment.createdAt as Timestamp).toMillis()).toLocaleString() : 'Just now';

        commentEl.innerHTML = `
            <img src="${comment.userAvatar}" alt="${comment.userName}'s avatar" class="user-avatar">
            <div class="comment-content">
                <div class="comment-header">
                    <span class="comment-user-name">${comment.userName}</span>
                    <span class="comment-timestamp">${timeAgo}</span>
                </div>
                <p class="comment-text">${comment.text}</p>
            </div>
        `;
        commentsList.appendChild(commentEl);
    });
}

async function handleCommentSubmit(event: Event) {
    event.preventDefault();
    if (!currentUser || !currentGuideId) return;

    const commentText = commentInput.value.trim();
    if (!commentText) return;

    commentSubmitBtn.disabled = true;
    
    const guideRef = doc(db, 'guides', currentGuideId);
    const newCommentRef = doc(collection(db, 'comments'));

    const newComment = {
        guideId: currentGuideId,
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
        
        commentInput.value = '';
        await loadAndRenderComments(currentGuideId); // Refresh comments
    } catch (error) {
        console.error("Failed to post comment:", error);
        alert("Sorry, we couldn't post your comment. Please try again.");
    } finally {
        commentSubmitBtn.disabled = false;
    }
}


// --- UTILITY & SHARING ---
function handleUseLocationClick() {
  locationMessage.classList.remove('visible');

  if (navigator.geolocation) {
    const originalContent = useLocationBtn.innerHTML;
    useLocationBtn.disabled = true;
    useLocationBtn.innerHTML = '<div class="loader-small"></div>';

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        let cityName = 'Current Location';
        try {
            // Replaced Nominatim with Google's Geocoding API for a more robust, production-grade integration
            // that aligns with the app's existing Google-based technology stack.
            // NOTE: This requires the "Geocoding API" to be enabled in your Google Cloud project for the same API key.
            const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${process.env.API_KEY}`);
            const data = await response.json();

            if (data.status === 'OK' && data.results && data.results.length > 0) {
                // Find the city name from the address components
                const result = data.results[0]; // Use the first, most specific result
                const cityComponent = result.address_components.find(comp => 
                    comp.types.includes('locality') || // Standard city
                    comp.types.includes('postal_town') || // Common in the UK
                    comp.types.includes('administrative_area_level_3') // Fallback
                );
                cityName = cityComponent ? cityComponent.long_name : 'Current Location';
            } else {
                 console.error('Google Geocoding API failed:', data.status, data.error_message);
            }
        } catch (error) {
            console.error('Reverse geocoding fetch failed:', error);
        }
        
        cityInput.value = cityName;
        locationMessage.textContent = `📍 Location set to ${cityName}.`;
        locationMessage.classList.add('visible');

        useLocationBtn.disabled = false;
        useLocationBtn.innerHTML = originalContent;
      },
      (error) => {
        console.error("Geolocation error:", error);
        alert("Could not get your location. Please ensure location services are enabled.");
        useLocationBtn.disabled = false;
        useLocationBtn.innerHTML = originalContent;
      }
    );
  } else {
    alert("Geolocation is not supported by your browser.");
  }
}

function generateShareUrl(): string {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.search = ''; 
    cleanUrl.hash = currentGuideId ? `guide=${currentGuideId}` : '';
    return cleanUrl.toString();
}

async function handleShareClick() {
    if (!currentGuideId) return;

    const shareUrl = generateShareUrl();
    const shareData = {
        title: `Restaurant Guide for ${currentSearchParams?.city || 'a cool city'}`,
        text: `Check out this guide I made!`,
        url: shareUrl,
    };

    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            await navigator.clipboard.writeText(shareData.url);
            const originalText = shareButton.querySelector('span')!.textContent;
            shareButton.querySelector('span')!.textContent = 'Copied!';
            shareButton.disabled = true;
            setTimeout(() => {
                 shareButton.querySelector('span')!.textContent = originalText;
                 shareButton.disabled = false;
            }, 2000);
        }
    } catch (err) { console.error('Share failed:', err); }
}

async function loadGuideById(guideId: string) {
    navigateTo('search');
    searchPanel.setAttribute('hidden', 'true');
    resultsContainer.hidden = false;
    guideContent.innerHTML = '<div class="loader"></div><p class="loading-text">Loading your guide...</p>';
    commentsSection.hidden = true;

    try {
        const guideRef = doc(db, 'guides', guideId);
        const guideDoc = await getDoc(guideRef);

        if (guideDoc.exists()) {
            const guide = { id: guideDoc.id, ...guideDoc.data() } as any;
            currentGuideData = guide.data;
            currentSearchParams = guide.params;
            currentGuideId = guide.id;
            renderResults(currentGuideData);
            loadAndRenderComments(guideId);

            let isLiked = false;
            if (currentUser) {
                const likeRef = doc(db, 'likes', `${guideId}_${currentUser.uid}`);
                const likeDoc = await getDoc(likeRef);
                isLiked = likeDoc.exists();
            }
            updateLikeButtonUI(guide.likeCount || 0, isLiked);

            shareButton.disabled = false;
            findMoreButton.hidden = false;
            location.hash = `guide=${guideId}`;
        } else {
            console.warn(`Guide with ID "${guideId}" not found. Resetting to home.`);
            location.hash = ''; // Clear the invalid hash from the URL
            navigateTo('home'); // This resets the UI to the default home screen
        }
    } catch (error) {
        console.error("Error loading shared guide:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        guideContent.innerHTML = `<div class="error-message"><h3>Oops! Something went wrong.</h3><p>${errorMessage}</p></div>`;
        commentsSection.hidden = true;
    }
}

function parseUrlAndSearch() {
    const hash = window.location.hash.substring(1);
    if (!hash) return;
    
    const urlParams = new URLSearchParams(hash);
    const guideId = urlParams.get('guide');

    if (guideId) {
        loadGuideById(guideId);
    } 
}


// --- INITIALIZATION ---
function init() {
    initAuth();
    
    siteTitleLink.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('home')
    });
    allNavButtons.forEach(btn => btn.addEventListener('click', () => navigateTo(btn.dataset.view as View)));
    searchForm.addEventListener('submit', handleSearch);
    useLocationBtn.addEventListener('click', handleUseLocationClick);
    cityInput.addEventListener('input', () => locationMessage.classList.remove('visible'));
    newGuideButton.addEventListener('click', () => {
        currentGuideData = [];
        currentSearchParams = null;
        currentGuideId = null;
        searchForm.reset();
        location.hash = '';
        navigateTo('search');
    });
    shareButton.addEventListener('click', handleShareClick);
    likeButton.addEventListener('click', handleLikeClick);
    findMoreButton.addEventListener('click', () => callGemini(currentSearchParams!, true));
    commentForm.addEventListener('submit', handleCommentSubmit);
    mobileMenuToggle.addEventListener('click', () => toggleMobileMenu());
    homeCtaButton.addEventListener('click', () => navigateTo('search'));
    finalCtaButton.addEventListener('click', () => navigateTo('search'));
    
    navigateTo('home');
    parseUrlAndSearch();
}

init();