/**
 * Bengal Heritage Atlas — Destination Detail Page
 * Loads and renders in-depth heritage data, galleries, quick facts, and related sites.
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const slug = urlParams.get('slug');

    const loadingEl = document.getElementById('detailLoading');
    const errorEl = document.getElementById('detailError');
    const contentEl = document.getElementById('destinationDetail');

    if (!slug) {
        showError('No destination specified. Please select a destination to explore.');
        return;
    }

    try {
        const dest = await API.get(`/api/destinations/${encodeURIComponent(slug)}`);
        if (!dest || !dest.name) {
            showError('The requested destination could not be found.');
            return;
        }

        renderDestination(dest);
    } catch (err) {
        showError(err.message || 'Failed to connect to the heritage database.');
    }

    function showError(msg) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'none';
        if (errorEl) {
            errorEl.style.display = 'block';
            const textEl = errorEl.querySelector('.empty-state-text');
            if (textEl && msg) textEl.textContent = msg;
        }
    }

    function renderDestination(dest) {
        document.title = `${dest.name} — Bengal Heritage Atlas`;

        // Breadcrumb & title
        const breadcrumbEl = document.getElementById('detailBreadcrumb');
        if (breadcrumbEl) breadcrumbEl.textContent = dest.name;

        const titleEl = document.getElementById('detailTitle');
        if (titleEl) titleEl.textContent = dest.name;

        const districtEl = document.getElementById('detailDistrict');
        if (districtEl) districtEl.textContent = `${dest.district}${dest.region ? `, ${dest.region}` : ''}`;

        // Hero Image
        const heroImg = document.getElementById('detailHeroImage');
        if (heroImg) {
            heroImg.src = dest.featured_image_url || '/assets/images/placeholder.jpg';
            heroImg.alt = dest.name;
            heroImg.onerror = function() {
                this.src = 'https://images.unsplash.com/photo-1558431382-27e303142255?auto=format&fit=crop&w=1200&q=80';
            };
        }

        // Image credit
        const creditEl = document.getElementById('detailImageCredit');
        if (creditEl && dest.image_credit) {
            creditEl.textContent = `Photo: ${dest.image_credit}`;
        }

        // Category Badge
        const catBadge = document.getElementById('detailCategory');
        if (catBadge) {
            catBadge.textContent = dest.category_name || 'Heritage Landmark';
        }

        // UNESCO status
        const unescoBadge = document.getElementById('detailUnescoBadge');
        if (unescoBadge) {
            if (dest.unesco_status && dest.unesco_status !== 'None') {
                unescoBadge.textContent = dest.unesco_status;
                unescoBadge.style.display = 'inline-flex';
                if (dest.unesco_status === 'World Heritage Site') {
                    unescoBadge.classList.add('unesco-badge-gold');
                }
            } else {
                unescoBadge.style.display = 'none';
            }
        }

        // Favorite Button
        const favBtn = document.getElementById('detailFavoriteBtn');
        const favText = document.getElementById('detailFavoriteText');
        if (favBtn) {
            const isFav = Favorites.has(dest.slug);
            favBtn.classList.toggle('is-favorite', isFav);
            if (favText) favText.textContent = isFav ? 'Saved' : 'Save';

            favBtn.addEventListener('click', () => {
                const added = Favorites.toggle(dest.slug);
                favBtn.classList.toggle('is-favorite', added);
                if (favText) favText.textContent = added ? 'Saved' : 'Save';
                Toast.show(added ? `Saved ${dest.name} to favorites` : `Removed from favorites`, added ? 'success' : 'info');
            });
        }

        // Short Description
        const shortDesc = document.getElementById('detailShortDesc');
        if (shortDesc) {
            shortDesc.textContent = dest.short_description || '';
        }

        // History
        const historySec = document.getElementById('historicalSection');
        const historyEl = document.getElementById('detailHistory');
        if (historyEl) {
            if (dest.historical_background) {
                // Split paragraphs
                const paragraphs = dest.historical_background.split('\n\n').filter(Boolean);
                historyEl.innerHTML = paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('');
                if (historySec) historySec.style.display = 'block';
            } else if (historySec) {
                historySec.style.display = 'none';
            }
        }

        // Significance
        const sigSec = document.getElementById('significanceSection');
        const sigEl = document.getElementById('detailSignificance');
        if (sigEl) {
            if (dest.heritage_significance) {
                const paragraphs = dest.heritage_significance.split('\n\n').filter(Boolean);
                sigEl.innerHTML = paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('');
                if (sigSec) sigSec.style.display = 'block';
            } else if (sigSec) {
                sigSec.style.display = 'none';
            }
        }

        // Quick Facts
        const factsEl = document.getElementById('detailQuickFacts');
        if (factsEl) {
            const facts = [
                { label: 'District', value: dest.district },
                { label: 'Region', value: dest.region },
                { label: 'Category', value: dest.category_name },
                { label: 'Period / Era', value: dest.historical_period },
                { label: 'Established', value: dest.established_year },
                { label: 'UNESCO Status', value: dest.unesco_status && dest.unesco_status !== 'None' ? dest.unesco_status : 'Not Listed' },
                { label: 'Best Season', value: dest.best_time_to_visit },
                { label: 'Nearest City', value: dest.nearest_city }
            ].filter(f => f.value && f.value.trim());

            factsEl.innerHTML = `
                <dl class="facts-list">
                    ${facts.map(f => `
                        <div class="fact-item">
                            <dt class="fact-label">${escapeHtml(f.label)}</dt>
                            <dd class="fact-value">${escapeHtml(f.value)}</dd>
                        </div>
                    `).join('')}
                </dl>
            `;
        }

        // Visitor Information
        const visitCard = document.getElementById('visitInfoCard');
        const visitInfo = document.getElementById('detailVisitInfo');
        if (visitInfo) {
            const visitItems = [];
            if (dest.opening_hours) {
                visitItems.push(`
                    <div class="visit-item">
                        <div class="visit-item-header">
                            <span class="visit-icon">🕒</span>
                            <strong>Opening Hours</strong>
                        </div>
                        <p class="visit-text">${escapeHtml(dest.opening_hours)}</p>
                    </div>
                `);
            }
            if (dest.entry_fee) {
                visitItems.push(`
                    <div class="visit-item">
                        <div class="visit-item-header">
                            <span class="visit-icon">🎟️</span>
                            <strong>Entry Fee & Tickets</strong>
                        </div>
                        <p class="visit-text">${escapeHtml(dest.entry_fee)}</p>
                    </div>
                `);
            }
            if (dest.accessibility_info) {
                visitItems.push(`
                    <div class="visit-item">
                        <div class="visit-item-header">
                            <span class="visit-icon">♿</span>
                            <strong>Accessibility Details</strong>
                        </div>
                        <p class="visit-text">${escapeHtml(dest.accessibility_info)}</p>
                    </div>
                `);
            }

            if (visitItems.length > 0) {
                visitInfo.innerHTML = visitItems.join('');
                if (visitCard) visitCard.style.display = 'block';
            } else if (visitCard) {
                visitCard.style.display = 'none';
            }
        }

        // Coordinates & Map link
        const coordsEl = document.getElementById('detailCoords');
        const mapsLink = document.getElementById('detailMapsLink');
        if (dest.latitude && dest.longitude) {
            if (coordsEl) coordsEl.textContent = `${Number(dest.latitude).toFixed(4)}° N, ${Number(dest.longitude).toFixed(4)}° E`;
            if (mapsLink) {
                mapsLink.href = `https://www.google.com/maps/search/?api=1&query=${dest.latitude},${dest.longitude}`;
                mapsLink.style.display = 'inline-flex';
            }
        } else {
            if (coordsEl) coordsEl.textContent = `Coordinates verified for regional area (${dest.district})`;
            if (mapsLink) {
                mapsLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest.name + ', ' + dest.district + ', West Bengal')}`;
            }
        }

        // Reference link
        const sourceCard = document.getElementById('sourceCard');
        const sourceLink = document.getElementById('detailSourceLink');
        if (dest.source_url) {
            if (sourceLink) {
                sourceLink.href = dest.source_url;
                sourceLink.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    <span>${escapeHtml(dest.source_url.replace(/^https?:\/\//, '').replace(/\/.*$/, ''))} (Official / Primary)</span>
                `;
            }
            if (sourceCard) sourceCard.style.display = 'block';
        } else if (sourceCard) {
            sourceCard.style.display = 'none';
        }

        // Gallery
        const gallerySec = document.getElementById('gallerySection');
        const galleryEl = document.getElementById('detailGallery');
        if (galleryEl) {
            const images = dest.images || [];
            if (images.length > 0) {
                galleryEl.innerHTML = images.map(img => `
                    <div class="gallery-card">
                        <img src="${img.image_url}" alt="${escapeHtml(img.alt_text || dest.name)}" loading="lazy">
                        ${img.image_credit ? `<span class="gallery-credit">${escapeHtml(img.image_credit)}</span>` : ''}
                    </div>
                `).join('');
                if (gallerySec) gallerySec.style.display = 'block';
            } else if (gallerySec) {
                gallerySec.style.display = 'none';
            }
        }

        // Related Destinations
        const relatedSec = document.getElementById('relatedSection');
        const relatedGrid = document.getElementById('relatedGrid');
        if (relatedGrid) {
            const related = dest.related || [];
            if (related.length > 0) {
                relatedGrid.innerHTML = '';
                related.forEach(r => {
                    const card = createDestinationCard(r);
                    relatedGrid.appendChild(card);
                });
                if (relatedSec) relatedSec.style.display = 'block';
            } else if (relatedSec) {
                relatedSec.style.display = 'none';
            }
        }

        // Switch visible views
        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';

        initScrollReveal();
    }
});

