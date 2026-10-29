/**
 * Bengal Heritage Atlas — Administrator Portal
 * Complete CRUD management, authentication, statistics, and validation.
 */

'use strict';

(function() {
    const TOKEN_KEY = 'bengal_admin_token';
    let token = localStorage.getItem(TOKEN_KEY) || null;
    let allDestinations = [];
    let allCategories = [];
    let deleteTargetId = null;

    // DOM Elements
    const loginSection = document.getElementById('loginSection');
    const dashboardSection = document.getElementById('dashboardSection');
    const loginForm = document.getElementById('loginForm');
    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');
    const loginError = document.getElementById('loginError');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    // Dashboard Elements
    const addDestinationBtn = document.getElementById('addDestinationBtn');
    const adminSearch = document.getElementById('adminSearch');
    const adminCategoryFilter = document.getElementById('adminCategoryFilter');
    const adminTableBody = document.getElementById('adminTableBody');

    // Stats
    const adminStatTotal = document.getElementById('adminStatTotal');
    const adminStatFeatured = document.getElementById('adminStatFeatured');
    const adminStatUnesco = document.getElementById('adminStatUnesco');
    const adminStatCategories = document.getElementById('adminStatCategories');

    // Modal
    const modal = document.getElementById('destinationModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalClose = document.getElementById('modalClose');
    const modalCancelBtn = document.getElementById('modalCancelBtn');
    const modalSaveBtn = document.getElementById('modalSaveBtn');
    const destinationForm = document.getElementById('destinationForm');

    // Delete Modal
    const deleteModal = document.getElementById('deleteModal');
    const deleteModalClose = document.getElementById('deleteModalClose');
    const deleteCancelBtn = document.getElementById('deleteCancelBtn');
    const deleteConfirmBtn = document.getElementById('deleteConfirmBtn');
    const deleteDestName = document.getElementById('deleteDestName');

    // Initialize
    async function init() {
        setupEventListeners();

        if (token) {
            try {
                const verified = await API.get(`/api/admin/verify?token=${encodeURIComponent(token)}`);
                if (verified && verified.valid) {
                    showDashboard();
                    return;
                }
            } catch (err) {
                // Token expired or invalid
                localStorage.removeItem(TOKEN_KEY);
                token = null;
            }
        }
        showLogin();
    }

    function setupEventListeners() {
        loginForm?.addEventListener('submit', handleLogin);
        logoutBtn?.addEventListener('click', handleLogout);
        addDestinationBtn?.addEventListener('click', openAddModal);

        modalClose?.addEventListener('click', closeModal);
        modalCancelBtn?.addEventListener('click', closeModal);
        modalSaveBtn?.addEventListener('click', handleSaveDestination);

        deleteModalClose?.addEventListener('click', closeDeleteModal);
        deleteCancelBtn?.addEventListener('click', closeDeleteModal);
        deleteConfirmBtn?.addEventListener('click', handleConfirmDelete);

        adminSearch?.addEventListener('input', debounce(renderTable, 300));
        adminCategoryFilter?.addEventListener('change', renderTable);

        // Escape key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal();
                closeDeleteModal();
            }
        });
    }

    function showLogin() {
        if (loginSection) loginSection.style.display = 'block';
        if (dashboardSection) dashboardSection.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'none';
    }

    async function showDashboard() {
        if (loginSection) loginSection.style.display = 'none';
        if (dashboardSection) dashboardSection.style.display = 'block';
        if (logoutBtn) logoutBtn.style.display = 'inline-flex';

        await loadCategories();
        await loadDashboardData();
    }

    // ============================================================
    // Authentication
    // ============================================================
    async function handleLogin(e) {
        e.preventDefault();
        loginError.textContent = '';
        const username = loginUsername.value.trim();
        const password = loginPassword.value;

        if (!username || !password) {
            loginError.textContent = 'Please enter both username and password.';
            return;
        }

        const btnText = loginBtn.querySelector('.btn-text');
        const btnLoader = loginBtn.querySelector('.btn-loader');
        if (btnText) btnText.style.display = 'none';
        if (btnLoader) btnLoader.style.display = 'inline-flex';
        loginBtn.disabled = true;

        try {
            const res = await API.post('/api/admin/login', { username, password });
            if (res && res.token) {
                token = res.token;
                localStorage.setItem(TOKEN_KEY, token);
                Toast.show('Welcome back! Signed in successfully.', 'success');
                showDashboard();
            } else {
                throw new Error('Invalid authentication response from server.');
            }
        } catch (err) {
            loginError.textContent = err.message || 'Invalid username or password.';
        } finally {
            if (btnText) btnText.style.display = '';
            if (btnLoader) btnLoader.style.display = 'none';
            loginBtn.disabled = false;
        }
    }

    async function handleLogout() {
        try {
            if (token) {
                await API.post('/api/admin/logout', {}, token);
            }
        } catch (e) {
            // silent ignore
        }
        localStorage.removeItem(TOKEN_KEY);
        token = null;
        Toast.show('Signed out successfully.', 'info');
        showLogin();
    }

    // ============================================================
    // Load Data
    // ============================================================
    async function loadCategories() {
        try {
            allCategories = await API.get('/api/categories');
            const selectEls = [adminCategoryFilter, document.getElementById('formCategory')];
            selectEls.forEach(sel => {
                if (!sel) return;
                const currentVal = sel.value;
                sel.innerHTML = sel === adminCategoryFilter ? '<option value="">All Categories</option>' : '<option value="">Select Category</option>';
                allCategories.forEach(cat => {
                    const opt = document.createElement('option');
                    opt.value = cat.category_id;
                    opt.textContent = cat.category_name;
                    sel.appendChild(opt);
                });
                if (currentVal) sel.value = currentVal;
            });
        } catch (err) {
            console.error('Failed to load categories', err);
        }
    }

    async function loadDashboardData() {
        adminTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="admin-table-loading">
                    <div class="spinner"></div>
                    <p>Loading destination records...</p>
                </td>
            </tr>
        `;

        try {
            const [destsRes, statsRes] = await Promise.all([
                API.get('/api/admin/destinations', token),
                API.get('/api/stats')
            ]);

            allDestinations = destsRes.destinations || destsRes || [];

            // Update stats
            if (adminStatTotal) adminStatTotal.textContent = statsRes.totalDestinations || allDestinations.length;
            if (adminStatFeatured) adminStatFeatured.textContent = allDestinations.filter(d => d.is_featured).length;
            if (adminStatUnesco) adminStatUnesco.textContent = statsRes.totalUnesco || 0;
            if (adminStatCategories) adminStatCategories.textContent = statsRes.totalCategories || allCategories.length;

            renderTable();
        } catch (err) {
            adminTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="admin-table-error">
                        <p>Error loading records: ${escapeHtml(err.message)}</p>
                    </td>
                </tr>
            `;
        }
    }

    // ============================================================
    // Render Table
    // ============================================================
    function renderTable() {
        const query = (adminSearch?.value || '').toLowerCase().trim();
        const selectedCat = adminCategoryFilter?.value;

        const filtered = allDestinations.filter(d => {
            const matchesQuery = !query || 
                d.name.toLowerCase().includes(query) || 
                d.district.toLowerCase().includes(query) ||
                (d.region && d.region.toLowerCase().includes(query));
            const matchesCategory = !selectedCat || String(d.category_id) === String(selectedCat);
            return matchesQuery && matchesCategory;
        });

        if (filtered.length === 0) {
            adminTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="admin-table-empty">
                        <p>No matching destinations found.</p>
                    </td>
                </tr>
            `;
            return;
        }

        adminTableBody.innerHTML = filtered.map(d => `
            <tr>
                <td>
                    <div class="table-dest-cell">
                        <img src="${d.featured_image_url || '/assets/images/placeholder.jpg'}" alt="${escapeHtml(d.name)}" class="table-dest-thumb" onerror="this.src='/assets/images/placeholder.jpg'">
                        <div>
                            <strong>${escapeHtml(d.name)}</strong>
                            <div class="table-dest-sub">/${escapeHtml(d.slug)}</div>
                        </div>
                    </div>
                </td>
                <td><span class="table-district-badge">${escapeHtml(d.district)}</span></td>
                <td>${escapeHtml(d.category_name || 'N/A')}</td>
                <td>
                    ${d.unesco_status && d.unesco_status !== 'None' 
                        ? `<span class="badge ${d.unesco_status === 'World Heritage Site' ? 'badge-gold' : 'badge-sand'}">${escapeHtml(d.unesco_status)}</span>` 
                        : '<span class="text-muted">—</span>'}
                </td>
                <td>
                    ${d.is_featured 
                        ? '<span class="badge badge-success">Featured</span>' 
                        : '<span class="text-muted">Standard</span>'}
                </td>
                <td>
                    <div class="table-actions">
                        <a href="/destination.html?slug=${d.slug}" target="_blank" class="btn btn-icon btn-sm" title="View destination">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        </a>
                        <button class="btn btn-icon btn-sm edit-btn" data-id="${d.destination_id}" title="Edit destination">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="btn btn-icon btn-sm btn-icon-danger delete-btn" data-id="${d.destination_id}" data-name="${escapeHtml(d.name)}" title="Delete destination">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        // Wire up buttons
        adminTableBody.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', () => openEditModal(btn.dataset.id));
        });
        adminTableBody.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => openDeleteModal(btn.dataset.id, btn.dataset.name));
        });
    }

    // ============================================================
    // Add / Edit Modal
    // ============================================================
    function openAddModal() {
        destinationForm.reset();
        document.getElementById('formDestinationId').value = '';
        modalTitle.textContent = 'Add New Heritage Destination';
        modal.classList.add('modal-visible');
        modal.setAttribute('aria-hidden', 'false');
    }

    function openEditModal(destId) {
        const dest = allDestinations.find(d => String(d.destination_id) === String(destId));
        if (!dest) return;

        destinationForm.reset();
        document.getElementById('formDestinationId').value = dest.destination_id;
        document.getElementById('formName').value = dest.name || '';
        document.getElementById('formDistrict').value = dest.district || '';
        document.getElementById('formRegion').value = dest.region || '';
        document.getElementById('formCategory').value = dest.category_id || '';
        document.getElementById('formShortDesc').value = dest.short_description || '';
        document.getElementById('formHistory').value = dest.historical_background || '';
        document.getElementById('formSignificance').value = dest.heritage_significance || '';
        document.getElementById('formPeriod').value = dest.historical_period || '';
        document.getElementById('formEstablished').value = dest.established_year || '';
        document.getElementById('formUnesco').value = dest.unesco_status || 'None';
        document.getElementById('formFeatured').value = dest.is_featured ? '1' : '0';
        document.getElementById('formLatitude').value = dest.latitude || '';
        document.getElementById('formLongitude').value = dest.longitude || '';
        document.getElementById('formOpeningHours').value = dest.opening_hours || '';
        document.getElementById('formEntryFee').value = dest.entry_fee || '';
        document.getElementById('formBestTime').value = dest.best_time_to_visit || '';
        document.getElementById('formNearestCity').value = dest.nearest_city || '';
        document.getElementById('formImageUrl').value = dest.featured_image_url || '';
        document.getElementById('formImageCredit').value = dest.image_credit || '';
        document.getElementById('formSourceUrl').value = dest.source_url || '';
        document.getElementById('formAccessibility').value = dest.accessibility_info || '';

        modalTitle.textContent = `Edit Destination: ${dest.name}`;
        modal.classList.add('modal-visible');
        modal.setAttribute('aria-hidden', 'false');
    }

    function closeModal() {
        modal.classList.remove('modal-visible');
        modal.setAttribute('aria-hidden', 'true');
    }

    async function handleSaveDestination(e) {
        e.preventDefault();

        const id = document.getElementById('formDestinationId').value;
        const name = document.getElementById('formName').value.trim();
        const district = document.getElementById('formDistrict').value.trim();
        const categoryId = document.getElementById('formCategory').value;
        const shortDesc = document.getElementById('formShortDesc').value.trim();

        if (!name || !district || !categoryId || !shortDesc) {
            Toast.show('Please fill in all required fields marked with *', 'error');
            return;
        }

        const payload = {
            name,
            district,
            region: document.getElementById('formRegion').value.trim() || null,
            category_id: parseInt(categoryId, 10),
            short_description: shortDesc,
            historical_background: document.getElementById('formHistory').value.trim() || null,
            heritage_significance: document.getElementById('formSignificance').value.trim() || null,
            historical_period: document.getElementById('formPeriod').value.trim() || null,
            established_year: document.getElementById('formEstablished').value.trim() || null,
            unesco_status: document.getElementById('formUnesco').value || 'None',
            is_featured: document.getElementById('formFeatured').value === '1',
            latitude: document.getElementById('formLatitude').value ? parseFloat(document.getElementById('formLatitude').value) : null,
            longitude: document.getElementById('formLongitude').value ? parseFloat(document.getElementById('formLongitude').value) : null,
            opening_hours: document.getElementById('formOpeningHours').value.trim() || null,
            entry_fee: document.getElementById('formEntryFee').value.trim() || null,
            best_time_to_visit: document.getElementById('formBestTime').value.trim() || null,
            nearest_city: document.getElementById('formNearestCity').value.trim() || null,
            featured_image_url: document.getElementById('formImageUrl').value.trim() || null,
            image_credit: document.getElementById('formImageCredit').value.trim() || null,
            source_url: document.getElementById('formSourceUrl').value.trim() || null,
            accessibility_info: document.getElementById('formAccessibility').value.trim() || null
        };

        const btnText = modalSaveBtn.querySelector('.btn-text');
        const btnLoader = modalSaveBtn.querySelector('.btn-loader');
        if (btnText) btnText.style.display = 'none';
        if (btnLoader) btnLoader.style.display = 'inline-flex';
        modalSaveBtn.disabled = true;

        try {
            if (id) {
                // Update
                await API.put(`/api/admin/destinations/${id}`, payload, token);
                Toast.show(`Successfully updated "${name}"`, 'success');
            } else {
                // Create
                await API.post('/api/admin/destinations', payload, token);
                Toast.show(`Successfully added "${name}"`, 'success');
            }
            closeModal();
            await loadDashboardData();
        } catch (err) {
            Toast.show(err.message || 'Error saving destination record.', 'error');
        } finally {
            if (btnText) btnText.style.display = '';
            if (btnLoader) btnLoader.style.display = 'none';
            modalSaveBtn.disabled = false;
        }
    }

    // ============================================================
    // Delete Confirmation
    // ============================================================
    function openDeleteModal(destId, destName) {
        deleteTargetId = destId;
        if (deleteDestName) deleteDestName.textContent = destName;
        deleteModal.classList.add('modal-visible');
        deleteModal.setAttribute('aria-hidden', 'false');
    }

    function closeDeleteModal() {
        deleteModal.classList.remove('modal-visible');
        deleteModal.setAttribute('aria-hidden', 'true');
        deleteTargetId = null;
    }

    async function handleConfirmDelete() {
        if (!deleteTargetId) return;

        const btnText = deleteConfirmBtn.querySelector('.btn-text');
        const btnLoader = deleteConfirmBtn.querySelector('.btn-loader');
        if (btnText) btnText.style.display = 'none';
        if (btnLoader) btnLoader.style.display = 'inline-flex';
        deleteConfirmBtn.disabled = true;

        try {
            await API.delete(`/api/admin/destinations/${deleteTargetId}`, token);
            Toast.show('Destination removed successfully.', 'success');
            closeDeleteModal();
            await loadDashboardData();
        } catch (err) {
            Toast.show(err.message || 'Failed to delete record.', 'error');
        } finally {
            if (btnText) btnText.style.display = '';
            if (btnLoader) btnLoader.style.display = 'none';
            deleteConfirmBtn.disabled = false;
        }
    }

    // Run on ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

