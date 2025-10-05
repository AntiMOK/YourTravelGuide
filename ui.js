// --- DOM ELEMENT SELECTORS ---
export const elements = {
  homeView: document.getElementById('home-view'),
  searchView: document.getElementById('search-view'),
  libraryView: document.getElementById('library-view'),
  exploreView: document.getElementById('explore-view'),
  siteTitleLink: document.querySelector('.site-title-link'),
  allNavButtons: document.querySelectorAll('.nav-button'),
  authContainer: document.getElementById('auth-container'),
  mobileAuthContainer: document.getElementById('mobile-auth-container'),
  searchForm: document.getElementById('search-form'),
  searchPanel: document.getElementById('search-panel'),
  resultsContainer: document.getElementById('results-container'),
  guideContent: document.getElementById('guide-content'),
  guideTitleEl: document.getElementById('guide-title'),
  guideDescriptionEl: document.getElementById('guide-description'),
  libraryContent: document.getElementById('library-content'),
  exploreContent: document.getElementById('explore-content'),
  useLocationBtn: document.getElementById('use-location-btn'),
  cityInput: document.getElementById('city-input'),
  locationMessage: document.getElementById('location-message'),
  newGuideButton: document.getElementById('new-guide-button'),
  shareButton: document.getElementById('share-button'),
  findMoreButton: document.getElementById('find-more-button'),
  likeButton: document.getElementById('like-button'),
  likeCountEl: document.getElementById('like-count'),
  commentsSection: document.getElementById('comments-section'),
  commentsList: document.getElementById('comments-list'),
  commentForm: document.getElementById('comment-form'),
  commentInput: document.getElementById('comment-input'),
  commentSubmitBtn: document.getElementById('comment-submit-btn'),
  commentUserAvatar: document.getElementById('comment-user-avatar'),
  commentLoginPrompt: document.getElementById('comment-login-prompt'),
  mobileMenuToggle: document.getElementById('mobile-menu-toggle'),
  mobileNavContainer: document.getElementById('mobile-nav-container'),
  homeCtaButton: document.getElementById('home-cta-button'),
  finalCtaButton: document.getElementById('final-cta-button'),
};

const viewElements = {
  home: elements.homeView,
  search: elements.searchView,
  library: elements.libraryView,
  explore: elements.exploreView,
};

// --- UI & RENDERING FUNCTIONS ---

export function toggleMobileMenu(forceClose = false) {
    const isExpanded = elements.mobileMenuToggle.getAttribute('aria-expanded') === 'true';
    if (forceClose || isExpanded) {
        elements.mobileMenuToggle.setAttribute('aria-expanded', 'false');
        elements.mobileNavContainer.classList.remove('open');
        document.body.classList.remove('no-scroll');
    } else {
        elements.mobileMenuToggle.setAttribute('aria-expanded', 'true');
        elements.mobileNavContainer.classList.add('open');
        document.body.classList.add('no-scroll');
    }
}

export function updateView(view) {
    Object.keys(viewElements).forEach(key => {
        viewElements[key].hidden = key !== view;
    });

    elements.allNavButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    if (view === 'search') {
        elements.resultsContainer.hidden = true;
        elements.searchPanel.removeAttribute('hidden');
    }
}


export function renderResults(data, searchParams) {
    elements.guideContent.innerHTML = '';
    
    if (searchParams?.dish) {
        elements.guideTitleEl.textContent = `Top 10 ${searchParams.dish} in ${searchParams.city}`;
        elements.guideDescriptionEl.textContent = `Our curated list of the absolute best places to find ${searchParams.dish}.`;
    } else {
        elements.guideTitleEl.textContent = `Your Custom Guide to ${searchParams?.city}`;
        elements.guideDescriptionEl.textContent = `A personalized selection of top restaurants based on your preferences.`;
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
        const restaurantGrid = document.createElement('div');
        restaurantGrid.className = 'restaurant-grid';
        restaurantsInCategory.forEach(resto => {
            restaurantGrid.appendChild(createRestaurantCard(resto));
        });
        categoryEl.appendChild(restaurantGrid);
        
        elements.guideContent.appendChild(categoryEl);
    });
}

function createRestaurantCard(resto) {
    const card = document.createElement('div');
    const isBestOfCard = resto.is_best_of;
    const bestOfColor = ['yellow', 'blue', 'red', 'green'][Math.floor(Math.random() * 4)];
    card.className = `restaurant-card ${isBestOfCard ? `best-of-card color-${bestOfColor}` : ''}`;
    const price = resto.price_range || resto.price || '';

    const mapQuery = encodeURIComponent(`${resto.name}, ${resto.address}`);
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;

    const recommendedDishesHtml = (resto.recommended_dishes || []).map(dish => `<li>${dish}</li>`).join('');

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


export function renderLibrary(guides, currentUser) {
    elements.libraryContent.innerHTML = '';
    if (!currentUser) {
        elements.libraryContent.innerHTML = '<p class="empty-library-message">Please log in to view your saved guides.</p>';
        return;
    }
    if (guides.length === 0) {
        elements.libraryContent.innerHTML = '<p class="empty-library-message">You haven\'t saved any guides yet.</p>';
        return;
    }
    renderGuideCards(elements.libraryContent, guides, true); // true for showing delete button
}


export function renderAllGuides(guides) {
    elements.exploreContent.innerHTML = '';
     if (guides.length === 0) {
        elements.exploreContent.innerHTML = '<p class="empty-library-message">No guides have been created yet. Be the first!</p>';
        return;
    }
    renderGuideCards(elements.exploreContent, guides, false); // false for not showing delete button
}

export function renderGuideCards(container, guides, showDelete) {
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
                    <!-- The event listeners for these buttons are in firestore.js -->
                    <button class="button-secondary view-guide-btn" data-id="${guide.id}">View</button>
                    ${showDelete ? `<button class="button-danger delete-guide-btn" data-id="${guide.id}">Delete</button>` : ''}
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}


export function updateAuthUI(user, loginHandler, logoutHandler) {
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

    elements.authContainer.innerHTML = desktopHtml;
    elements.mobileAuthContainer.innerHTML = mobileHtml;

    if (user) {
        document.getElementById('logout-button-desktop').addEventListener('click', logoutHandler);
        document.getElementById('logout-button-mobile').addEventListener('click', logoutHandler);
    } else {
        document.getElementById('login-button-desktop').addEventListener('click', loginHandler);
        document.getElementById('login-button-mobile').addEventListener('click', loginHandler);
    }
}


export function updateLikeButtonUI(likeCount, isLiked, currentUser, guideId) {
    if (!guideId) {
        elements.likeButton.disabled = true;
        elements.likeButton.classList.remove('liked');
        elements.likeCountEl.textContent = '0';
        return;
    }
    
    elements.likeButton.disabled = !currentUser;
    elements.likeCountEl.textContent = String(likeCount);
    if (isLiked) {
        elements.likeButton.classList.add('liked');
        elements.likeButton.setAttribute('aria-label', 'Unlike Guide');
    } else {
        elements.likeButton.classList.remove('liked');
        elements.likeButton.setAttribute('aria-label', 'Like Guide');
    }
}


export function updateCommentFormUI(user) {
    if (user) {
        elements.commentInput.disabled = false;
        elements.commentSubmitBtn.disabled = false;
        elements.commentLoginPrompt.hidden = true;
        elements.commentUserAvatar.src = user.photoURL;
        elements.commentUserAvatar.hidden = false;
        elements.commentInput.placeholder = 'Add a comment...';
    } else {
        elements.commentInput.disabled = true;
        elements.commentSubmitBtn.disabled = true;
        elements.commentLoginPrompt.hidden = false;
        elements.commentUserAvatar.hidden = true;
        elements.commentInput.placeholder = 'Log in to leave a comment';
    }
}

export function renderComments(comments) {
    elements.commentsList.innerHTML = '';
    if (comments.length === 0) {
        elements.commentsList.innerHTML = `<p class="empty-library-message">No comments yet. Be the first to share your thoughts!</p>`;
        return;
    }

    comments.forEach(comment => {
        const commentEl = document.createElement('div');
        commentEl.className = 'comment-item';
        
        const timeAgo = comment.createdAt ? new Date(comment.createdAt.toMillis()).toLocaleString() : 'Just now';

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
        elements.commentsList.appendChild(commentEl);
    });
}
