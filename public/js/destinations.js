/**
 * Bengal Heritage Atlas — Destinations Explorer
 * Handles filtering, searching, pagination, and favorites for the explore page
 */

'use strict';

(function() {
    // State
    let currentPage = 1;
    const pageSize = 12;
    let totalResults = 0;
    let showFavoritesOnly = false;
    let isLoading = false;

    // DOM Elements
    const grid = document.getElementById('destinationsGrid');
    const loader = document.getElementById('destinationsLoader');
    const emptyState = document.getElementById('emptyState');
    const pagination = document.getElementById('pagination');
    const searchInput = document.getElementById('searchInput');
    const categoryFilter = document.getElementById('categoryFilter');
    const districtFilter = document.getElementById('districtFilter');
    const sortFilter = document.getElementById('sortFilter');
    const clearFiltersBtn = document.getElementById('clearFilters');
    const toggleFavoritesBtn = document.getElementById('toggleFavoritesFilter');
    const activeFiltersEl = document.getElementById('activeFilters');
    const resultsInfo = document.getElementById('resultsInfo');
    const emptyStateClear = document.getElementById('emptyStateClear');

    // ============================================================
    // Initialize
    // ============================================================
    async function init() {
        // Parse URL params for initial state
        const params = new URLSearchParams(window.location.search);
        if (params.get('category') && categoryFilter) {
            // Will be set after categories load
            categoryFilter.dataset.initial = params.get('category');
        }
        if (params.get('search') && searchInput) {
            searchInput.value = params.get('search');
        }
        if (params.get('district') && districtFilter) {
            districtFilter.dataset.initial = params.get('district');
        }

        // Check for #favorites hash
        if (window.location.hash === '#favorites') {
            showFavoritesOnly = true;
            toggleFavoritesBtn?.classList.add('btn-active');
        }

        // Load filter options
        await Promise.all([loadCategoryOptions(), loadDistrictOptions()]);

        // Set initial values from URL
        if (categoryFilter?.dataset.initial) {
            categoryFilter.value = categoryFilter.dataset.initial;
        }
        if (districtFilter?.dataset.initial) {
            districtFilter.value = districtFilter.dataset.initial;
        }

        // Attach event listeners
        searchInput?.addEventListener('input', debounce(handleSearch, 400));
        categoryFilter?.addEventListener('change', handleFilterChange);
        districtFilter?.addEventListener('change', handleFilterChange);
        sortFilter?.addEventListener('change', handleFilterChange);
        clearFiltersBtn?.addEventListener('click', clearAllFilters);
        toggleFavoritesBtn?.addEventListener('click', toggleFavorites);
        emptyStateClear?.addEventListener('click', clearAllFilters);

        // Show favorites button
        const showFavBtn = document.getElementById('showFavoritesBtn');
        showFavBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            showFavoritesOnly = !showFavoritesOnly;
            toggleFavoritesBtn?.classList.toggle('btn-active', showFavoritesOnly);
            currentPage = 1;
            loadDestinations();
        });

        // Load destinations
        loadDestinations();
    }

    // ============================================================
    // Load Filter Options
    // ============================================================
    async function loadCategoryOptions() {
        if (!categoryFilter) return;
        try {
            const categories = await API.get('/api/categories');
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.category_id;
                opt.textContent = `${cat.category_name} (${cat.destination_count || 0})`;
                categoryFilter.appendChild(opt);
            });
        } catch (err) {
            console.warn('Could not load categories:', err.message);
        }
    }

    async function loadDistrictOptions() {
        if (!districtFilter) return;
        try {
            const districts = await API.get('/api/districts');
            districts.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.district;
                opt.textContent = `${d.district} (${d.count})`;
                districtFilter.appendChild(opt);
            });
        } catch (err) {
            console.warn('Could not load districts:', err.message);
        }
    }

    // ============================================================
    // Load Destinations
    // ============================================================
    async function loadDestinations() {
        if (isLoading) return;
        isLoading = true;

        // Show loading
        if (loader) loader.style.display = '';
        if (emptyState) emptyState.style.display = 'none';

        // Build query
        const params = new URLSearchParams();
        const search = searchInput?.value?.trim();
        if (search) params.set('search', search);
        if (categoryFilter?.value) params.set('category', categoryFilter.value);
        if (districtFilter?.value) params.set('district', districtFilter.value);
        if (sortFilter?.value) params.set('sort', sortFilter.value);
        params.set('page', currentPage);
        params.set('limit', pageSize);

        try {
            const data = await API.get(`/api/destinations?${params.toString()}`);
            let destinations = data.destinations || [];
            totalResults = data.total || 0;

            // Client-side favorites filter
            if (showFavoritesOnly) {
                const favs = Favorites.getAll();
                destinations = destinations.filter(d => favs.includes(d.slug));
                totalResults = destinations.length;
            }

            renderDestinations(destinations);
            renderPagination();
            renderResultsInfo();
            updateActiveFilters();

            // Update URL without reload
            const url = new URL(window.location);
            if (search) url.searchParams.set('search', search);
            else url.searchParams.delete('search');
            if (categoryFilter?.value) url.searchParams.set('category', categoryFilter.value);
            else url.searchParams.delete('category');
            if (districtFilter?.value) url.searchParams.set('district', districtFilter.value);
            else url.searchParams.delete('district');
            window.history.replaceState({}, '', url);

        } catch (err) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <div class="empty-state-icon">⚠️</div>
                    <h3 class="empty-state-title">Unable to load destinations</h3>
                    <p class="empty-state-text">${escapeHtml(err.message)}</p>
                </div>
            `;
            if (loader) loader.style.display = 'none';
        }

        isLoading = false;
    }

    // ============================================================
    // Render Destinations Grid
    // ============================================================
    function renderDestinations(destinations) {
        if (loader) loader.style.display = 'none';

        // Remove existing cards (not the loader)
        grid.querySelectorAll('.destination-card').forEach(c => c.remove());

        if (destinations.length === 0) {
            emptyState.style.display = '';
            return;
        }

        emptyState.style.display = 'none';

        destinations.forEach((dest, i) => {
            const card = createDestinationCard(dest);
            card.classList.add('reveal-slide-up');
            card.style.setProperty('--delay', `${0.03 + i * 0.05}s`);
            grid.appendChild(card);
        });

        // Re-init scroll reveal for new cards
        initScrollReveal();
    }

    // ============================================================
    // Pagination
    // ============================================================
    function renderPagination() {
        if (!pagination) return;
        pagination.innerHTML = '';

        const totalPages = Math.ceil(totalResults / pageSize);
        if (totalPages <= 1) return;

        // Previous button
        if (currentPage > 1) {
            const prev = createPageBtn('← Previous', currentPage - 1, 'pagination-prev');
            pagination.appendChild(prev);
        }

        // Page numbers
        const maxVisible = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);
        if (endPage - startPage < maxVisible - 1) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }

        if (startPage > 1) {
            pagination.appendChild(createPageBtn('1', 1));
            if (startPage > 2) {
                const dots = document.createElement('span');
                dots.className = 'pagination-dots';
                dots.textContent = '...';
                pagination.appendChild(dots);
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            pagination.appendChild(createPageBtn(String(i), i, i === currentPage ? 'pagination-active' : ''));
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                const dots = document.createElement('span');
                dots.className = 'pagination-dots';
                dots.textContent = '...';
                pagination.appendChild(dots);
            }
            pagination.appendChild(createPageBtn(String(totalPages), totalPages));
        }

        // Next button
        if (currentPage < totalPages) {
            const next = createPageBtn('Next →', currentPage + 1, 'pagination-next');
            pagination.appendChild(next);
        }
    }

    function createPageBtn(label, page, extraClass = '') {
        const btn = document.createElement('button');
        btn.className = `pagination-btn ${extraClass}`;
        btn.textContent = label;
        btn.addEventListener('click', () => {
            currentPage = page;
            loadDestinations();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        return btn;
    }

    // ============================================================
    // Results Info
    // ============================================================
    function renderResultsInfo() {
        if (!resultsInfo) return;
        if (totalResults === 0) {
            resultsInfo.textContent = '';
            return;
        }
        const start = (currentPage - 1) * pageSize + 1;
        const end = Math.min(currentPage * pageSize, totalResults);
        resultsInfo.textContent = `Showing ${start}–${end} of ${totalResults} destinations`;
    }

    // ============================================================
    // Active Filters Display
    // ============================================================
    function updateActiveFilters() {
        if (!activeFiltersEl) return;
        activeFiltersEl.innerHTML = '';

        const filters = [];
        if (searchInput?.value?.trim()) {
            filters.push({ label: `Search: "${searchInput.value.trim()}"`, clear: () => { searchInput.value = ''; } });
        }
        if (categoryFilter?.value) {
            const text = categoryFilter.options[categoryFilter.selectedIndex].textContent;
            filters.push({ label: `Category: ${text}`, clear: () => { categoryFilter.value = ''; } });
        }
        if (districtFilter?.value) {
            filters.push({ label: `District: ${districtFilter.value}`, clear: () => { districtFilter.value = ''; } });
        }
        if (showFavoritesOnly) {
            filters.push({ label: 'Favorites Only', clear: () => { showFavoritesOnly = false; toggleFavoritesBtn?.classList.remove('btn-active'); } });
        }

        filters.forEach(f => {
            const pill = document.createElement('button');
            pill.className = 'active-filter-pill';
            pill.innerHTML = `${escapeHtml(f.label)} <span class="pill-remove">&times;</span>`;
            pill.addEventListener('click', () => {
                f.clear();
                currentPage = 1;
                loadDestinations();
            });
            activeFiltersEl.appendChild(pill);
        });
    }

    // ============================================================
    // Event Handlers
    // ============================================================
    function handleSearch() {
        currentPage = 1;
        loadDestinations();
    }

    function handleFilterChange() {
        currentPage = 1;
        loadDestinations();
    }

    function clearAllFilters() {
        if (searchInput) searchInput.value = '';
        if (categoryFilter) categoryFilter.value = '';
        if (districtFilter) districtFilter.value = '';
        if (sortFilter) sortFilter.value = 'featured';
        showFavoritesOnly = false;
        toggleFavoritesBtn?.classList.remove('btn-active');
        currentPage = 1;
        loadDestinations();
    }

    function toggleFavorites() {
        showFavoritesOnly = !showFavoritesOnly;
        toggleFavoritesBtn?.classList.toggle('btn-active', showFavoritesOnly);
        currentPage = 1;
        loadDestinations();
    }

    // ============================================================
    // Start
    // ============================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

