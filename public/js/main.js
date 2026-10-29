/**
 * Bengal Heritage Atlas — Main JavaScript
 * Core functionality shared across all pages
 */

'use strict';

// ============================================================
// API Configuration
// ============================================================
const API_BASE = '';

// ============================================================
// Favorites Manager (localStorage)
// ============================================================
const Favorites = {
    KEY: 'bengal_heritage_favorites',

    getAll() {
        try {
            return JSON.parse(localStorage.getItem(this.KEY)) || [];
        } catch {
            return [];
        }
    },

    has(slug) {
        return this.getAll().includes(slug);
    },

    toggle(slug) {
        const favs = this.getAll();
        const index = favs.indexOf(slug);
        if (index > -1) {
            favs.splice(index, 1);
        } else {
            favs.push(slug);
        }
        localStorage.setItem(this.KEY, JSON.stringify(favs));
        this.updateCount();
        return index === -1; // true if added, false if removed
    },

    remove(slug) {
        const favs = this.getAll().filter(f => f !== slug);
        localStorage.setItem(this.KEY, JSON.stringify(favs));
        this.updateCount();
    },

    updateCount() {
        const countElements = document.querySelectorAll('.favorites-count');
        const count = this.getAll().length;
        countElements.forEach(el => {
            el.textContent = count;
            el.classList.toggle('has-favorites', count > 0);
        });
    }
};

// ============================================================
// Toast Notifications
// ============================================================
const Toast = {
    container: null,

    init() {
        this.container = document.getElementById('toastContainer');
    },

    show(message, type = 'info', duration = 3000) {
        if (!this.container) this.init();
        if (!this.container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', 'alert');

        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${this.escapeHtml(message)}</span>
            <button class="toast-close" aria-label="Dismiss">&times;</button>
        `;

        toast.querySelector('.toast-close').addEventListener('click', () => {
            this.dismiss(toast);
        });

        this.container.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('toast-visible');
        });

        if (duration > 0) {
            setTimeout(() => this.dismiss(toast), duration);
        }

        return toast;
    },

    dismiss(toast) {
        toast.classList.remove('toast-visible');
        toast.classList.add('toast-leaving');
        toast.addEventListener('transitionend', () => {
            toast.remove();
        }, { once: true });
        // Fallback removal
        setTimeout(() => toast.remove(), 500);
    },

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};

// ============================================================
// API Helper
// ============================================================
const API = {
    async get(endpoint) {
        try {
            const response = await fetch(`${API_BASE}${endpoint}`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('Unable to connect to the server. Please ensure the backend is running.');
            }
            throw error;
        }
    },

    async post(endpoint, data, token = null) {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data)
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        return result;
    },

    async put(endpoint, data, token = null) {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(data)
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        return result;
    },

    async delete(endpoint, token = null) {
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'DELETE',
            headers
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        return result;
    }
};

// ============================================================
// Navigation
// ============================================================
function initNavigation() {
    const navbar = document.getElementById('navbar');
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');

    // Scroll behavior — solid navbar
    if (navbar && !navbar.classList.contains('navbar-solid')) {
        let lastScroll = 0;
        window.addEventListener('scroll', () => {
            const scrollY = window.scrollY;
            if (scrollY > 60) {
                navbar.classList.add('nav-scrolled');
            } else {
                navbar.classList.remove('nav-scrolled');
            }
            lastScroll = scrollY;
        }, { passive: true });
    }

    // Mobile toggle
    if (navToggle && navMenu) {
        navToggle.addEventListener('click', () => {
            const isOpen = navMenu.classList.toggle('nav-menu-open');
            navToggle.classList.toggle('nav-toggle-active', isOpen);
            navToggle.setAttribute('aria-expanded', isOpen);
            document.body.classList.toggle('nav-open', isOpen);
        });

        // Close on link click
        navMenu.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('nav-menu-open');
                navToggle.classList.remove('nav-toggle-active');
                navToggle.setAttribute('aria-expanded', 'false');
                document.body.classList.remove('nav-open');
            });
        });
    }
}

// ============================================================
// Search Overlay
// ============================================================
function initSearchOverlay() {
    const searchBtn = document.getElementById('navSearchBtn');
    const overlay = document.getElementById('searchOverlay');
    const closeBtn = document.getElementById('searchCloseBtn');
    const input = document.getElementById('searchOverlayInput');
    const results = document.getElementById('searchOverlayResults');

    if (!searchBtn || !overlay) return;

    let searchTimeout = null;

    searchBtn.addEventListener('click', () => {
        overlay.classList.add('search-overlay-active');
        overlay.setAttribute('aria-hidden', 'false');
        setTimeout(() => input?.focus(), 200);
    });

    const closeOverlay = () => {
        overlay.classList.remove('search-overlay-active');
        overlay.setAttribute('aria-hidden', 'true');
        if (input) input.value = '';
        if (results) results.innerHTML = '';
    };

    closeBtn?.addEventListener('click', closeOverlay);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeOverlay();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('search-overlay-active')) {
            closeOverlay();
        }
        // Ctrl/Cmd + K to open search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            searchBtn.click();
        }
    });

    // Live search
    input?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();

        if (query.length < 2) {
            results.innerHTML = '';
            return;
        }

        searchTimeout = setTimeout(async () => {
            try {
                const data = await API.get(`/api/destinations?search=${encodeURIComponent(query)}&limit=6`);
                if (data.destinations && data.destinations.length > 0) {
                    results.innerHTML = data.destinations.map(d => `
                        <a href="/destination.html?slug=${d.slug}" class="search-result-item">
                            <div class="search-result-image">
                                <img src="${d.featured_image_url || '/assets/images/placeholder.jpg'}" 
                                     alt="${escapeHtml(d.name)}" loading="lazy"
                                     onerror="this.src='/assets/images/placeholder.jpg'">
                            </div>
                            <div class="search-result-info">
                                <span class="search-result-name">${escapeHtml(d.name)}</span>
                                <span class="search-result-district">${escapeHtml(d.district)}</span>
                            </div>
                            <svg class="search-result-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                        </a>
                    `).join('');
                } else {
                    results.innerHTML = '<div class="search-no-results">No destinations found</div>';
                }
            } catch (err) {
                results.innerHTML = '<div class="search-no-results">Search unavailable</div>';
            }
        }, 300);
    });
}

// ============================================================
// Scroll Reveal Animations
// ============================================================
function initScrollReveal() {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
        // Show all elements immediately
        document.querySelectorAll('.reveal-fade, .reveal-slide-up, .reveal-slide-left, .reveal-slide-right, .reveal-scale').forEach(el => {
            el.classList.add('revealed');
        });
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const delay = parseFloat(entry.target.style.getPropertyValue('--delay') || 0);
                setTimeout(() => {
                    entry.target.classList.add('revealed');
                }, delay * 1000);
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });

    document.querySelectorAll('.reveal-fade, .reveal-slide-up, .reveal-slide-left, .reveal-slide-right, .reveal-scale').forEach(el => {
        observer.observe(el);
    });
}

// ============================================================
// Animated Counters
// ============================================================
function animateCounter(element, target, duration = 2000) {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
        element.textContent = target;
        return;
    }

    const startTime = performance.now();
    const start = 0;

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(start + (target - start) * eased);
        element.textContent = current;

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

function initCounters() {
    const statsSection = document.getElementById('stats-section');
    if (!statsSection) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                loadStats();
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.3 });

    observer.observe(statsSection);
}

async function loadStats() {
    try {
        const stats = await API.get('/api/stats');
        const destinations = document.getElementById('statDestinations');
        const unesco = document.getElementById('statUnesco');
        const districts = document.getElementById('statDistricts');
        const categories = document.getElementById('statCategories');

        if (destinations) animateCounter(destinations, stats.totalDestinations || 0);
        if (unesco) animateCounter(unesco, stats.totalUnesco || 0);
        if (districts) animateCounter(districts, stats.totalDistricts || 0);
        if (categories) animateCounter(categories, stats.totalCategories || 0);
    } catch (err) {
        console.warn('Could not load stats:', err.message);
    }
}

// ============================================================
// Destination Card Renderer
// ============================================================
function createDestinationCard(dest, options = {}) {
    const isFavorite = Favorites.has(dest.slug);
    const categoryColors = {
        'Temple & Religious Site': 'var(--terracotta)',
        'Palace & Royal Architecture': 'var(--warm-gold)',
        'Monument & Memorial': 'var(--forest-green)',
        'Museum & Gallery': 'var(--burgundy)',
        'Colonial Architecture': 'var(--charcoal)',
        'Natural Heritage': 'var(--sage)',
        'UNESCO World Heritage': 'var(--warm-gold)',
        'Cultural & Literary Heritage': 'var(--terracotta-light)',
        'Fort & Military Architecture': 'var(--forest-green-light)',
        'Bridge & Engineering Marvel': 'var(--charcoal)'
    };

    const badgeColor = categoryColors[dest.category_name] || 'var(--forest-green)';

    const card = document.createElement('article');
    card.className = `destination-card ${options.featured ? 'destination-card-featured' : ''}`;
    card.setAttribute('data-slug', dest.slug);

    card.innerHTML = `
        <a href="/destination.html?slug=${dest.slug}" class="card-image-link">
            <div class="card-image-wrap">
                <img src="${dest.featured_image_url || '/assets/images/placeholder.jpg'}" 
                     alt="${escapeHtml(dest.name)}" 
                     class="card-image" 
                     loading="lazy"
                     onerror="this.src='/assets/images/placeholder.jpg'">
                <div class="card-image-overlay"></div>
                ${dest.unesco_status && dest.unesco_status !== 'None' ? `
                    <span class="card-unesco-badge" title="${escapeHtml(dest.unesco_status)}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
                        ${dest.unesco_status === 'World Heritage Site' ? 'UNESCO' : 'Tentative'}
                    </span>
                ` : ''}
            </div>
        </a>
        <div class="card-content">
            <div class="card-meta">
                <span class="card-category-badge" style="--badge-color: ${badgeColor}">${escapeHtml(dest.category_name || 'Heritage')}</span>
                <span class="card-district">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    ${escapeHtml(dest.district)}
                </span>
            </div>
            <h3 class="card-title">
                <a href="/destination.html?slug=${dest.slug}">${escapeHtml(dest.name)}</a>
            </h3>
            <p class="card-description">${escapeHtml(dest.short_description || '')}</p>
            <div class="card-footer">
                <a href="/destination.html?slug=${dest.slug}" class="card-link">
                    Discover More
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </a>
                <button class="card-favorite-btn ${isFavorite ? 'is-favorite' : ''}" 
                        data-slug="${dest.slug}" 
                        aria-label="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}"
                        title="${isFavorite ? 'Remove from favorites' : 'Save to favorites'}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="${isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                </button>
            </div>
        </div>
    `;

    // Favorite button handler
    const favBtn = card.querySelector('.card-favorite-btn');
    favBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const added = Favorites.toggle(dest.slug);
        favBtn.classList.toggle('is-favorite', added);
        const svg = favBtn.querySelector('svg path');
        favBtn.querySelector('svg').setAttribute('fill', added ? 'currentColor' : 'none');
        favBtn.setAttribute('aria-label', added ? 'Remove from favorites' : 'Add to favorites');
        Toast.show(added ? `${dest.name} saved to favorites` : `${dest.name} removed from favorites`, added ? 'success' : 'info');
    });

    return card;
}

// ============================================================
// Featured Destinations (Homepage)
// ============================================================
async function loadFeaturedDestinations() {
    const grid = document.getElementById('featuredGrid');
    if (!grid) return;

    try {
        const data = await API.get('/api/destinations?sort=featured&limit=6');
        grid.innerHTML = '';

        if (data.destinations && data.destinations.length > 0) {
            data.destinations.forEach((dest, i) => {
                const card = createDestinationCard(dest, { featured: i === 0 });
                card.classList.add('reveal-slide-up');
                card.style.setProperty('--delay', `${0.1 + i * 0.1}s`);
                grid.appendChild(card);
            });
            initScrollReveal(); // Re-init for new elements
        } else {
            grid.innerHTML = `
                <div class="empty-state">
                    <p>No destinations available yet. Add some through the <a href="/admin.html">admin dashboard</a>.</p>
                </div>
            `;
        }
    } catch (err) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚠️</div>
                <h3 class="empty-state-title">Unable to load destinations</h3>
                <p class="empty-state-text">${escapeHtml(err.message)}</p>
            </div>
        `;
    }
}

// ============================================================
// Categories (Homepage)
// ============================================================
async function loadCategories() {
    const grid = document.getElementById('categoriesGrid');
    if (!grid) return;

    const categoryIcons = {
        'Temple & Religious Site': '🛕',
        'Palace & Royal Architecture': '🏰',
        'Monument & Memorial': '🏛️',
        'Museum & Gallery': '🖼️',
        'Colonial Architecture': '⛪',
        'Natural Heritage': '🌿',
        'UNESCO World Heritage': '🏆',
        'Cultural & Literary Heritage': '📚',
        'Fort & Military Architecture': '🏰',
        'Bridge & Engineering Marvel': '🌉'
    };

    try {
        const categories = await API.get('/api/categories');
        grid.innerHTML = '';

        categories.forEach((cat, i) => {
            const icon = categoryIcons[cat.category_name] || '📍';
            const card = document.createElement('a');
            card.href = `/destinations.html?category=${cat.category_id}`;
            card.className = 'category-card reveal-scale';
            card.style.setProperty('--delay', `${0.1 + i * 0.08}s`);
            card.innerHTML = `
                <span class="category-card-icon">${icon}</span>
                <h3 class="category-card-title">${escapeHtml(cat.category_name)}</h3>
                <p class="category-card-count">${cat.destination_count || 0} destination${(cat.destination_count || 0) !== 1 ? 's' : ''}</p>
            `;
            grid.appendChild(card);
        });

        initScrollReveal();
    } catch (err) {
        grid.innerHTML = `<div class="empty-state"><p>Categories unavailable</p></div>`;
    }
}

// ============================================================
// Timeline (Homepage)
// ============================================================
async function loadTimeline() {
    const container = document.getElementById('timelineContainer');
    if (!container) return;

    try {
        const events = await API.get('/api/timeline');
        const loader = document.getElementById('timelineLoader');
        if (loader) loader.remove();

        if (events && events.length > 0) {
            events.forEach((event, i) => {
                const side = i % 2 === 0 ? 'left' : 'right';
                const item = document.createElement('div');
                item.className = `timeline-item timeline-item-${side} reveal-slide-${side === 'left' ? 'left' : 'right'}`;
                item.style.setProperty('--delay', `${0.1 + i * 0.1}s`);
                item.innerHTML = `
                    <div class="timeline-dot"></div>
                    <div class="timeline-card">
                        <span class="timeline-period">${escapeHtml(event.period || '')}</span>
                        <span class="timeline-year">${escapeHtml(event.year_label)}</span>
                        <h3 class="timeline-title">${escapeHtml(event.title)}</h3>
                        <p class="timeline-desc">${escapeHtml(event.description || '')}</p>
                    </div>
                `;
                container.appendChild(item);
            });
            initScrollReveal();
        }
    } catch (err) {
        const loader = document.getElementById('timelineLoader');
        if (loader) {
            loader.innerHTML = '<p>Timeline unavailable</p>';
        }
    }
}

// ============================================================
// UNESCO Section (Homepage)
// ============================================================
async function loadUnescoSection() {
    const grid = document.getElementById('unescoGrid');
    if (!grid) return;

    try {
        const data = await API.get('/api/destinations?unesco=true&limit=10');
        grid.innerHTML = '';

        if (data.destinations && data.destinations.length > 0) {
            data.destinations.forEach((dest, i) => {
                const card = document.createElement('article');
                card.className = 'unesco-card reveal-slide-up';
                card.style.setProperty('--delay', `${0.1 + i * 0.15}s`);
                card.innerHTML = `
                    <a href="/destination.html?slug=${dest.slug}" class="unesco-card-link">
                        <div class="unesco-card-image-wrap">
                            <img src="${dest.featured_image_url || '/assets/images/placeholder.jpg'}" 
                                 alt="${escapeHtml(dest.name)}" 
                                 class="unesco-card-image" loading="lazy"
                                 onerror="this.src='/assets/images/placeholder.jpg'">
                            <div class="unesco-card-overlay"></div>
                        </div>
                        <div class="unesco-card-content">
                            <span class="unesco-card-badge">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
                                ${escapeHtml(dest.unesco_status)}
                            </span>
                            <h3 class="unesco-card-title">${escapeHtml(dest.name)}</h3>
                            <p class="unesco-card-location">${escapeHtml(dest.district)}</p>
                            <p class="unesco-card-desc">${escapeHtml(dest.short_description || '')}</p>
                        </div>
                    </a>
                `;
                grid.appendChild(card);
            });
            initScrollReveal();
        } else {
            grid.innerHTML = '<div class="empty-state"><p>No UNESCO sites available</p></div>';
        }
    } catch (err) {
        grid.innerHTML = '';
    }
}

// ============================================================
// Interactive Map (Homepage)
// ============================================================
async function initMap() {
    const mapVisual = document.getElementById('mapVisual');
    const mapListContent = document.getElementById('mapListContent');
    const mapMarkers = document.getElementById('mapMarkers');
    const mapPreview = document.getElementById('mapPreview');
    const regionFilter = document.getElementById('mapRegionFilter');
    const categoryFilter = document.getElementById('mapCategoryFilter');

    if (!mapVisual || !mapListContent) return;

    let allDestinations = [];

    // Load categories into filter
    try {
        const categories = await API.get('/api/categories');
        if (categoryFilter) {
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.category_id;
                opt.textContent = cat.category_name;
                categoryFilter.appendChild(opt);
            });
        }
    } catch (e) { /* ignore */ }

    async function loadMapDestinations(filters = {}) {
        try {
            let url = '/api/destinations?limit=50';
            if (filters.region) url += `&region=${encodeURIComponent(filters.region)}`;
            if (filters.category) url += `&category=${filters.category}`;

            const data = await API.get(url);
            allDestinations = data.destinations || [];
            renderMapMarkers();
            renderMapList();
        } catch (err) {
            mapListContent.innerHTML = '<p class="map-error">Unable to load destinations</p>';
        }
    }

    function renderMapMarkers() {
        if (!mapMarkers) return;
        mapMarkers.innerHTML = '';

        // West Bengal approximate bounds:
        // Lat: 21.5 (south) to 27.2 (north) → Y
        // Lng: 86.5 (west) to 89.9 (east) → X
        const latMin = 21.5, latMax = 27.2;
        const lngMin = 86.5, lngMax = 89.9;
        const svgWidth = 500, svgHeight = 700;
        const padding = 50;

        allDestinations.forEach(dest => {
            if (!dest.latitude || !dest.longitude) return;

            // Map lat/lng to SVG coordinates
            const x = padding + ((dest.longitude - lngMin) / (lngMax - lngMin)) * (svgWidth - 2 * padding);
            const y = padding + ((latMax - dest.latitude) / (latMax - latMin)) * (svgHeight - 2 * padding);

            // Clamp within SVG
            const cx = Math.max(padding, Math.min(svgWidth - padding, x));
            const cy = Math.max(padding, Math.min(svgHeight - padding, y));

            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            marker.classList.add('map-marker');
            marker.setAttribute('data-slug', dest.slug);
            marker.setAttribute('role', 'button');
            marker.setAttribute('tabindex', '0');
            marker.setAttribute('aria-label', dest.name);
            marker.innerHTML = `
                <circle cx="${cx}" cy="${cy}" r="8" class="marker-dot" fill="var(--terracotta)" stroke="white" stroke-width="2"/>
                <circle cx="${cx}" cy="${cy}" r="14" class="marker-pulse" fill="var(--terracotta)" opacity="0.3"/>
            `;

            marker.addEventListener('click', () => showMapPreview(dest));
            marker.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    showMapPreview(dest);
                }
            });

            mapMarkers.appendChild(marker);
        });
    }

    function renderMapList() {
        mapListContent.innerHTML = '';

        if (allDestinations.length === 0) {
            mapListContent.innerHTML = '<p class="map-empty">No destinations found for this filter.</p>';
            return;
        }

        allDestinations.forEach(dest => {
            const item = document.createElement('button');
            item.className = 'map-list-item';
            item.innerHTML = `
                <span class="map-list-item-name">${escapeHtml(dest.name)}</span>
                <span class="map-list-item-district">${escapeHtml(dest.district)}</span>
            `;
            item.addEventListener('click', () => showMapPreview(dest));
            mapListContent.appendChild(item);
        });
    }

    function showMapPreview(dest) {
        if (!mapPreview) return;
        mapPreview.innerHTML = `
            <div class="map-preview-card">
                <img src="${dest.featured_image_url || '/assets/images/placeholder.jpg'}" 
                     alt="${escapeHtml(dest.name)}" 
                     class="map-preview-image"
                     onerror="this.src='/assets/images/placeholder.jpg'">
                <div class="map-preview-content">
                    <h4 class="map-preview-title">${escapeHtml(dest.name)}</h4>
                    <p class="map-preview-district">${escapeHtml(dest.district)}, ${escapeHtml(dest.region || 'West Bengal')}</p>
                    <p class="map-preview-desc">${escapeHtml(dest.short_description || '')}</p>
                    <a href="/destination.html?slug=${dest.slug}" class="btn btn-sm btn-primary">View Details</a>
                </div>
                <button class="map-preview-close" aria-label="Close preview">&times;</button>
            </div>
        `;
        mapPreview.setAttribute('aria-hidden', 'false');
        mapPreview.classList.add('map-preview-visible');

        mapPreview.querySelector('.map-preview-close').addEventListener('click', () => {
            mapPreview.classList.remove('map-preview-visible');
            mapPreview.setAttribute('aria-hidden', 'true');
        });

        // Highlight marker
        document.querySelectorAll('.map-marker').forEach(m => m.classList.remove('map-marker-active'));
        const activeMarker = document.querySelector(`.map-marker[data-slug="${dest.slug}"]`);
        if (activeMarker) activeMarker.classList.add('map-marker-active');
    }

    // Filter handlers
    regionFilter?.addEventListener('change', () => {
        loadMapDestinations({
            region: regionFilter.value,
            category: categoryFilter?.value || ''
        });
    });

    categoryFilter?.addEventListener('change', () => {
        loadMapDestinations({
            region: regionFilter?.value || '',
            category: categoryFilter.value
        });
    });

    // Initial load
    await loadMapDestinations();
}

// ============================================================
// Gallery Section (Homepage)
// ============================================================
async function loadGallery() {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;

    try {
        const data = await API.get('/api/destinations?limit=9&sort=featured');
        grid.innerHTML = '';

        if (data.destinations && data.destinations.length > 0) {
            data.destinations.forEach((dest, i) => {
                const item = document.createElement('a');
                item.href = `/destination.html?slug=${dest.slug}`;
                item.className = `gallery-item ${i === 0 ? 'gallery-item-large' : ''} reveal-scale`;
                item.style.setProperty('--delay', `${0.05 + i * 0.08}s`);
                item.innerHTML = `
                    <img src="${dest.featured_image_url || '/assets/images/placeholder.jpg'}" 
                         alt="${escapeHtml(dest.name)}" 
                         class="gallery-image" loading="lazy"
                         onerror="this.src='/assets/images/placeholder.jpg'">
                    <div class="gallery-overlay">
                        <span class="gallery-item-title">${escapeHtml(dest.name)}</span>
                        <span class="gallery-item-location">${escapeHtml(dest.district)}</span>
                    </div>
                `;
                grid.appendChild(item);
            });
            initScrollReveal();
        }
    } catch (err) {
        grid.innerHTML = '';
    }
}

// ============================================================
// Parallax Effect
// ============================================================
function initParallax() {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const hero = document.querySelector('.hero');
    if (!hero) return;

    let ticking = false;
    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(() => {
                const scrollY = window.scrollY;
                const heroHeight = hero.offsetHeight;
                if (scrollY < heroHeight) {
                    const parallaxAmount = scrollY * 0.3;
                    hero.style.setProperty('--parallax-y', `${parallaxAmount}px`);
                }
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });
}

// ============================================================
// Smooth Scroll for Anchor Links
// ============================================================
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', (e) => {
            const targetId = link.getAttribute('href');
            if (targetId === '#') return;
            const target = document.querySelector(targetId);
            if (target) {
                e.preventDefault();
                const navHeight = document.querySelector('.navbar')?.offsetHeight || 70;
                const targetPosition = target.getBoundingClientRect().top + window.scrollY - navHeight - 20;
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// ============================================================
// Utility Functions
// ============================================================
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ============================================================
// Placeholder Image Generator
// ============================================================
function generatePlaceholder() {
    // Create a simple SVG placeholder
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
        <rect fill="#E8DFD0" width="800" height="600"/>
        <text x="400" y="280" text-anchor="middle" font-family="Georgia, serif" font-size="24" fill="#1B3A2D" opacity="0.5">Bengal Heritage Atlas</text>
        <text x="400" y="320" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#1B3A2D" opacity="0.3">Image unavailable</text>
    </svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Create placeholder image file reference
const PLACEHOLDER_IMAGE = generatePlaceholder();

// ============================================================
// Initialize Everything
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // Core
    initNavigation();
    initSearchOverlay();
    initSmoothScroll();
    Favorites.updateCount();
    Toast.init();

    // Page-specific: Homepage
    const isHomepage = document.querySelector('.hero');
    if (isHomepage) {
        initParallax();
        initCounters();
        loadFeaturedDestinations();
        loadCategories();
        loadTimeline();
        loadUnescoSection();
        initMap();
        loadGallery();
    }

    // Scroll reveal (after content loaded for static elements)
    initScrollReveal();
});

// Global error handler
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});

