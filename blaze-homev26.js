(function () {
    'use strict';

    const DATA = window.DATA || [];
    const CFG = window.CONFIG || {};

    // Construir caché de búsqueda para optimizar rendimiento de "Explorar"
    function buildSearchCache() {
        if (window._searchCacheBuilt) return;
        DATA.forEach(d => {
            const tagsText = Array.isArray(d.tags) ? d.tags.join(' ') : (d.tags || '');
            d._searchText = `${d.title || ''} ${d.description || ''} ${tagsText} ${d.category || ''}`.toLowerCase();
        });
        window._searchCacheBuilt = true;
    }

    // Aplicar configuración
    (function applyConfig() {
        const name = CFG.appName || 'ANiGo';
        document.title = name;

        // Welcome Modal
        const welcomeTitle = document.getElementById('welcome-title-text');
        if (welcomeTitle) welcomeTitle.textContent = `¡Bienvenido a ${name}!`;

        const welcomeDesc = document.getElementById('welcome-desc-text');
        if (welcomeDesc) welcomeDesc.textContent = CFG.aboutDescription || `${name} es tu plataforma personal para descubrir y seguir el anime que más te gusta.`;

        const welcomeLogoContainer = document.getElementById('welcome-logo-container');
        if (welcomeLogoContainer) {
            const actualLogoUrl = CFG.aboutLogoUrl || (document.querySelector('link[rel*="icon"]') ? document.querySelector('link[rel*="icon"]').href : null);
            if (actualLogoUrl) {
                welcomeLogoContainer.innerHTML = `<img src="${actualLogoUrl}" alt="${name}" style="height:48px;max-width:100%;object-fit:contain">`;
                welcomeLogoContainer.style.background = 'none';
                welcomeLogoContainer.style.boxShadow = 'none';
            } else {
                welcomeLogoContainer.innerHTML = `<span id="welcome-logo-icon" style="font-size: 36px; padding-bottom: 2px; color: #000;">${name.charAt(0).toUpperCase()}</span>`;
            }
        }

        // Nuestras Apps Modal (Render dinámico y scrollable)
        const projectsContainer = document.getElementById('projects-list-container');
        if (projectsContainer && CFG.ourApps && Array.isArray(CFG.ourApps)) {
            projectsContainer.innerHTML = CFG.ourApps.map(app => `
                <div style="padding:14px 14px 12px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:14px;">
                    <div style="display:flex; align-items:center; gap:12px; margin-bottom:${app.description ? '8px' : '0'};">
                        <div style="width:42px; height:42px; border-radius:10px; overflow:hidden; flex-shrink:0;">
                            <img src="${app.logo || ''}" alt="${app.name}" style="width:100%; height:100%; object-fit:contain;">
                        </div>
                        <div style="font-size:15px; font-weight:700; flex:1;">${app.name}</div>
                        <button style="background:var(--accent); border:none; padding:7px 14px; border-radius:20px; color:#000; font-size:12px; font-weight:700; cursor:pointer; flex-shrink:0;" onclick="window.open('${app.url}', '_blank')">Descargar</button>
                    </div>
                    ${app.description ? `<p style="margin:0; font-size:13px; color:var(--text2); line-height:1.55; word-break:break-word;">${app.description}</p>` : ''}
                </div>
            `).join('');
        }

        // Header & Sidebar: logo imagen o texto
        const logos = document.querySelectorAll('.logo');
        logos.forEach(logoEl => {
            if (CFG.headerLogoUrl) {
                logoEl.innerHTML = `<img src="${CFG.headerLogoUrl}" alt="${name}" style="height:32px;object-fit:contain;vertical-align:middle">`;
            } else {
                logoEl.textContent = name;
            }
        });

        // Banner hero
        if (CFG.bannerUrl) {
            const hero = document.querySelector('.hero');
            if (hero) {
                hero.classList.add('lazy-bg');
                hero.dataset.bg = `url('${CFG.bannerUrl}')`;
                hero.style.backgroundSize = 'cover';
                hero.style.backgroundPosition = 'center';
            }
        }

        // Hero configurable — ahora es dinámico (alimentado por DATA), applyConfig no lo toca

        // Banner de perfil
        const profileBanner = document.getElementById('profile-banner');
        if (profileBanner) {
            if (CFG.profileBannerUrl) {
                profileBanner.classList.add('lazy-bg');
                profileBanner.dataset.bg = `url('${CFG.profileBannerUrl}')`;
            }
        }

        // Foto y nombre de perfil
        const avatar = document.getElementById('profile-avatar');
        if (avatar) {
            if (CFG.profilePhotoUrl) {
                avatar.innerHTML = `<img src="${CFG.profilePhotoUrl}" alt="perfil" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
            } else {
                avatar.textContent = (CFG.profileName || name).charAt(0).toUpperCase();
            }
        }
        const profileNameEl = document.querySelector('.profile-hero h2');
        if (profileNameEl) profileNameEl.textContent = CFG.profileName || 'Otaku User';

        const memberLabel = document.getElementById('profile-member-label');
        if (memberLabel) memberLabel.textContent = `Miembro de ${name}`;
    })();

    const FAVS_KEY = 'favorites_v1';
    const WATCH_STATUS_KEY = 'watch_status_v1';
    let favs = JSON.parse(localStorage.getItem(FAVS_KEY) || '[]');
    // watchStatus: { [id]: 'Viendo' | 'Completado' }
    let watchStatus = JSON.parse(localStorage.getItem(WATCH_STATUS_KEY) || '{}');
    const APP_STATE_KEY = 'wolfanime_last_state';
    let state = { view: null, prev: null, detail: null, catFilter: null, searchQ: '', favFilter: 'all' };
    let _pendingCWDeleteId = null;
    let navHistory = [];

    let viewScrolls = {};

    // Hybrid Lazy Load Persisted URL Cache
    window.loadedImageCache = new Set();
    try {
        const stored = JSON.parse(localStorage.getItem('wolfanime_img_cache_v1') || '[]');
        window.loadedImageCache = new Set(stored);
    } catch (e) { }

    function saveImageCache(url) {
        if (!url || url === 'undefined' || url.includes('var(--')) return;
        if (!window.loadedImageCache.has(url)) {
            window.loadedImageCache.add(url);
            try {
                let arr = [...window.loadedImageCache];
                if (arr.length > 300) {
                    arr = arr.slice(arr.length - 300);
                    window.loadedImageCache = new Set(arr);
                }
                localStorage.setItem('wolfanime_img_cache_v1', JSON.stringify(arr));
            } catch (e) { }
        }
    }

    function getLazyBgAttrs(classes, bgStr) {
        let match = (bgStr || '').match(/url\(['"]?([^'"\)]+)['"]?\)/);
        let key = match ? match[1] : bgStr;
        if (key && key !== 'undefined' && window.loadedImageCache.has(key)) {
            return `class="${classes} loaded" style="background: ${bgStr} !important; animation: none !important;"`;
        }
        return `class="${classes} lazy-bg" data-bg="${bgStr}"`;
    }

    // --- Lazy Loading Hybrid System ---
    function forceLoadImage(el) {
        if (el.dataset.loading === '1') return;
        el.dataset.loading = '1';

        const bgStr = el.dataset.bg;
        if (!bgStr || bgStr === 'undefined') return;

        const match = bgStr.match(/url\(['"]?([^'"\)]+)['"]?\)/);
        if (match && match[1]) {
            const img = new Image();
            const applyBg = () => {
                el.style.backgroundImage = `url('${match[1]}')`;
                if (el.classList.contains('cat-card')) {
                    el.style.setProperty('background-size', '100% 100%', 'important');
                    el.style.setProperty('background-position', 'center', 'important');
                }
                el.style.backgroundRepeat = 'no-repeat';

                const currentAnim = el.style.animation || '';
                if (currentAnim.includes('shimmer')) {
                    el.style.animation = currentAnim.split(',').filter(a => !a.includes('shimmer')).join(',').trim() || 'none';
                } else if (!el.style.animation) {
                    el.style.animation = 'none';
                }

                el.classList.add('loaded');
                if (match && match[1]) saveImageCache(match[1]);
            };
            img.onload = applyBg;
            img.onerror = applyBg;
            img.src = match[1];

            if (img.complete) {
                applyBg();
            } else {
                setTimeout(applyBg, 3000); // Failsafe
            }
        } else {
            el.style.setProperty('background-color', bgStr, 'important');
            el.classList.add('loaded');
        }
    }

    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                forceLoadImage(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, { rootMargin: '1000px' });

    function unstickImagesInView(view) {
        if (!view) return;
        const els = view.querySelectorAll('.lazy-bg:not(.loaded):not([data-loading])');
        let processed = 0;
        els.forEach(el => {
            if (processed < 30) {
                forceLoadImage(el);
                processed++;
            }
        });
    }

    function observeImages() {
        document.querySelectorAll('.lazy-bg:not(.loaded)').forEach(el => {
            imageObserver.observe(el);
        });
        unstickImagesInView(document.querySelector('.view.active'));
    }

    const domObserver = new MutationObserver(() => {
        observeImages();
    });

    const saveWatchStatus = () => localStorage.setItem(WATCH_STATUS_KEY, JSON.stringify(watchStatus));
    const getWatchStatus = id => watchStatus[id] || null;
    const setWatchStatus = (id, status) => {
        if (status) watchStatus[id] = status;
        else delete watchStatus[id];
        saveWatchStatus();
    };

    // ── Historial de búsqueda ──────────────────────────────────
    const SEARCH_HISTORY_KEY = 'search_history_v1';
    const SEARCH_HISTORY_MAX = 10;
    let searchHistory = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');

    function saveSearchHistory() {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory));
    }

    function addToSearchHistory(query) {
        const q = query.trim();
        if (!q || q.length < 2) return;
        searchHistory = searchHistory.filter(h => h !== q);
        searchHistory.unshift(q);
        if (searchHistory.length > SEARCH_HISTORY_MAX) searchHistory = searchHistory.slice(0, SEARCH_HISTORY_MAX);
        saveSearchHistory();
    }

    let _pendingHistoryDeleteQuery = null;

    function clearSearchHistory() {
        searchHistory = [];
        saveSearchHistory();
        renderSearchHistory();
        showToast('Historial de búsqueda borrado');
        closeHistoryClearModal();
    }

    function removeFromSearchHistory(query) {
        searchHistory = searchHistory.filter(h => h !== query);
        saveSearchHistory();
        renderSearchHistory();
    }

    function openHistoryClearModal() {
        const overlay = $('history-clear-confirm-overlay');
        if (overlay) {
            overlay.classList.add('open');
            overlay.setAttribute('aria-hidden', 'false');
        }
    }

    function closeHistoryClearModal() {
        const overlay = $('history-clear-confirm-overlay');
        if (overlay) {
            overlay.classList.remove('open');
            overlay.setAttribute('aria-hidden', 'true');
        }
    }

    function openSingleHistoryDeleteModal(query) {
        _pendingHistoryDeleteQuery = query;
        const textEl = $('history-single-confirm-query-text');
        if (textEl) textEl.textContent = `¿Deseas eliminar "${query}" de tu historial?`;

        const overlay = $('history-single-confirm-overlay');
        if (overlay) {
            overlay.classList.add('open');
            overlay.setAttribute('aria-hidden', 'false');
        }
    }

    function closeSingleHistoryDeleteModal() {
        _pendingHistoryDeleteQuery = null;
        const overlay = $('history-single-confirm-overlay');
        if (overlay) {
            overlay.classList.remove('open');
            overlay.setAttribute('aria-hidden', 'true');
        }
    }

    function updateSearchHistoryCountLabel() {
        const lbl = $('search-history-count-label');
        if (!lbl) return;
        const n = searchHistory.length;
        lbl.textContent = n > 0 ? `${n} búsqueda${n !== 1 ? 's' : ''} guardada${n !== 1 ? 's' : ''}` : 'Historial vacío';
    }

    function renderSearchHistory() {
        const list = $('search-history-list');
        const empty = $('search-history-empty');
        if (!list || !empty) return;

        if (!searchHistory.length) {
            list.innerHTML = '';
            empty.style.display = 'flex';
            return;
        }

        empty.style.display = 'none';
        list.innerHTML = searchHistory.map(q => `
            <div class="history-item" data-history-q="${q}">
                <div class="history-item-left">
                    <div class="history-item-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                        </svg>
                    </div>
                    <span class="history-item-text">${q}</span>
                </div>
                <button class="history-item-remove" data-history-remove="${q}" aria-label="Quitar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6"/>
                    </svg>
                </button>
            </div>
        `).join('');

        list.onclick = (e) => {
            const removeBtn = e.target.closest('.history-item-remove');
            if (removeBtn) {
                e.stopPropagation();
                openSingleHistoryDeleteModal(removeBtn.dataset.historyRemove);
                return;
            }

            const row = e.target.closest('.history-item');
            if (row) {
                const q = row.dataset.historyQ;
                $('search-input').value = q;
                navigateTo('search');
                renderSearch(q, state.catFilter);
            }
        };
    }
    // ────────────────────────────────────────────────────────────

    const $ = id => document.getElementById(id);
    const saveFavs = () => {
        localStorage.setItem(FAVS_KEY, JSON.stringify(favs));
        renderProfile();
    };
    const isFav = id => favs.includes(id);

    function showToast(msg, iconHTML = '') {
        const toast = $('toast');
        if (!toast) return;
        toast.innerHTML = (iconHTML || `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`) + `<span>${msg}</span>`;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    const openModal = id => {
        const modal = $(id);
        if (modal) {
            modal.classList.add('open');
            modal.setAttribute('aria-hidden', 'false');
        }
    };

    const closeModal = id => {
        const modal = $(id);
        if (modal) {
            modal.classList.remove('open');
            modal.setAttribute('aria-hidden', 'true');
        }
    };

    function generateTextBackup() {
        try {
            const cwData = {};
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k.startsWith('cw_meta_') || k.startsWith('resume_') || k.startsWith('watched_')) {
                    cwData[k] = localStorage.getItem(k);
                }
            }

            const data = {
                favs: favs,
                watchStatus: watchStatus,
                history: searchHistory,
                cw: cwData,
                settings: { h: hCatEnabled },
                v: '1.2',
                app: 'WolfStream'
            };
            const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
            const area = $('backup-text-area');
            if (area) area.value = b64;
            openModal('backup-text-overlay');
        } catch (e) {
            showToast('Error al generar respaldo', '<span style="color:#ff4d6d">!</span>');
        }
    }

    function restoreFromTextBackup() {
        const area = $('restore-text-area');
        if (!area || !area.value.trim()) {
            showToast('Pega el código primero', '<span style="color:#ff4d6d">!</span>');
            return;
        }
        try {
            const json = decodeURIComponent(escape(atob(area.value.trim())));
            const data = JSON.parse(json);
            if (data.favs) { favs = data.favs; saveFavs(); }
            if (data.watchStatus) { watchStatus = data.watchStatus; saveWatchStatus(); }
            if (data.history) { searchHistory = data.history; saveSearchHistory(); }
            if (data.cw) {
                Object.entries(data.cw).forEach(([k, v]) => {
                    localStorage.setItem(k, v);
                });
            }

            if (data.settings) {
                if (data.settings.h !== undefined) {
                    hCatEnabled = !!data.settings.h;
                    localStorage.setItem('blaze_h_enabled', hCatEnabled ? '1' : '0');
                }
            }
            showToast('Restauración completada');
            closeModal('restore-text-overlay');

            // Refrescar UI dinámicamente
            renderHome();
            renderContinueWatching();
            renderFavorites();
            renderProfile();
            renderCategories();
            if (state.view === 'all-library') renderAllLibrary();
            if (state.view === 'search') renderSearch($('search-input').value, state.catFilter);
        } catch (e) {
            showToast('Código de respaldo inválido', '<span style="color:#ff4d6d">!</span>');
        }
    }

    function clearFavorites() {
        if (confirm('¿Estás seguro de que deseas borrar todos tus favoritos?')) {
            favs = [];
            saveFavs();
            renderFavorites();
            renderProfile();
            renderHome();
            showToast('Favoritos borrados');
        }
    }

    function clearWatchHistory() {
        if (confirm('¿Estás seguro de que deseas borrar todo tu historial de visto?')) {
            watchStatus = {};
            saveWatchStatus();
            renderHome();
            renderSearch();
            renderProfile();
            showToast('Historial borrado');
        }
    }

    function exportUserData() {
        try {
            const cwData = {};
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k.startsWith('cw_meta_') || k.startsWith('resume_') || k.startsWith('watched_')) {
                    cwData[k] = localStorage.getItem(k);
                }
            }

            const data = {
                favorites: favs,
                watchStatus: watchStatus,
                searchHistory: searchHistory,
                cw: cwData,
                settings: {
                    hCatEnabled: hCatEnabled,
                },
                exportDate: new Date().toISOString(),
                app: 'WolfStream'
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `wolfanime_data_${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Datos exportados');
        } catch (e) {
            showToast('Error al exportar', '<span style="color:#ff4d6d">!</span>');
        }
    }

    function importUserData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = event => {
                try {
                    const data = JSON.parse(event.target.result);
                    if (data.favorites) {
                        favs = data.favorites;
                        saveFavs();
                    }
                    if (data.watchStatus) {
                        watchStatus = data.watchStatus;
                        saveWatchStatus();
                    }
                    if (data.cw) {
                        Object.entries(data.cw).forEach(([k, v]) => {
                            localStorage.setItem(k, v);
                        });
                    }
                    if (data.settings) {
                        if (data.settings.hCatEnabled !== undefined) {
                            localStorage.setItem('blaze_h_enabled', data.settings.hCatEnabled ? '1' : '0');
                        }
                    }
                    if (data.searchHistory) {
                        searchHistory = data.searchHistory;
                        saveSearchHistory();
                    }
                    showToast('Datos importados correctamente');
                    setTimeout(() => location.reload(), 1500);
                } catch (err) {
                    showToast('Error al importar', '<span style="color:#ff4d6d">!</span>');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    const toggleFav = id => {
        favs = isFav(id) ? favs.filter(f => f !== id) : [...favs, id];
        saveFavs();
    };

    function debounce(fn, ms) {
        let t;
        return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    }

    function getURLParams() {
        const params = new URLSearchParams(window.location.search);
        return Object.fromEntries(params.entries());
    }

    function updateURL(newParams = {}) {
        const url = new URL(window.location.href);
        const params = new URLSearchParams();

        Object.entries(newParams).forEach(([k, v]) => {
            if (v !== null && v !== undefined && v !== '') params.set(k, v);
        });

        const newUrl = params.toString() ? `${url.pathname}?${params.toString()}` : url.pathname;
        window.history.replaceState({}, '', newUrl);

        localStorage.setItem(APP_STATE_KEY, JSON.stringify(newParams));
    }

    function handleURLParams() {
        let p = getURLParams();
        const hasRelevantParams = p.id || p.cat || p.q || p.view;

        if (!hasRelevantParams) {
            const saved = localStorage.getItem(APP_STATE_KEY);
            if (saved) {
                try {
                    const sp = JSON.parse(saved);
                    if (sp && Object.keys(sp).length > 0) p = sp;
                } catch (e) { }
            }
        }

        if (p.id) {
            openDetail(+p.id);
            return true;
        }
        if (p.cat) {
            state.catFilter = p.cat;
            renderCatLibrary(p.cat);
            navigateTo('cat-library');
            return true;
        }
        if (p.q) {
            if ($('search-input')) $('search-input').value = p.q;
            renderSearch(p.q, p.cat || null);
            navigateTo('search');
            return true;
        }
        if (p.view) {
            navigateTo(p.view);
            return true;
        }
        return false;
    }

    const CATS_CFG = window.CATEGORIES_CONFIG || [];
    const CATEGORIES = CATS_CFG.filter(c => !c.isH).map(c => c.name);
    const CAT_COLORS = Object.fromEntries(CATS_CFG.map(c => [c.name, c.color]));
    const CAT_ACCENT = Object.fromEntries(CATS_CFG.map(c => [c.name, c.accent]));
    const CAT_ICONS_MAP = Object.fromEntries(CATS_CFG.map(c => [c.name, c.icon]));

    let hCatEnabled = localStorage.getItem('blaze_h_enabled') === '1';
    // Inicializar autoplay como activo por defecto en la primera visita
    if (localStorage.getItem('blaze_autoplay_enabled') === null) {
        localStorage.setItem('blaze_autoplay_enabled', '1');
    }
    let autoplayEnabled = localStorage.getItem('blaze_autoplay_enabled') !== '0';

    const isMovie = item => item.type === 'pelicula' || item.episodes === 1;

    const isH = item => {
        if (!item || !item.category) return false;
        return item.category.split(/,\s*/).map(c => c.trim()).some(c => c === '+18' || c === 'H');
    };

    const visibleDATA = () => hCatEnabled ? DATA : DATA.filter(d => {
        const cats = d.category ? d.category.split(/,\s*/).map(c => c.trim()) : [];
        return !cats.includes('+18') && !cats.includes('H');
    });

    const saveHEnabled = () => localStorage.setItem('blaze_h_enabled', hCatEnabled ? '1' : '0');
    const saveAutoplayEnabled = () => localStorage.setItem('blaze_autoplay_enabled', autoplayEnabled ? '1' : '0');

    function formatAdded(d) {
        if (!d) return '';
        const [y, m, day] = d.split('-');
        const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        return `${parseInt(day)} ${months[parseInt(m) - 1]} ${y}`;
    }

    function getStatusClass(s) {
        return '';
    }

    function posterBg(item) {
        if (item.poster) return `url('${item.poster}') center/cover no-repeat`;
        if (item.image && (item.image.startsWith('http') || item.image.startsWith('//'))) {
            return `url('${item.image}') center/cover no-repeat`;
        }
        return item.image || 'var(--card-bg)';
    }

    function backdropBg(item) {
        const url = item.backdrop || item.poster || item.image;
        if (url && (url.startsWith('http') || url.startsWith('//'))) {
            return `url('${url}') center/cover no-repeat`;
        }
        return url || 'var(--card-bg)';
    }

    function cardHTML(item, mini = false) {
        const fav = isFav(item.id);
        const h = isH(item);
        if (mini) {
            return `<div class="mini-card${h ? ' scard-h' : ''}" data-id="${item.id}">
      <div ${getLazyBgAttrs('mini-card-img', posterBg(item))}></div>
      <div class="mini-card-body">
        <div class="mini-card-title">${item.title}</div>
        <div style="font-size:11px;color:var(--text3)">${isMovie(item) ? 'Película' : `Serie • ${item.episodes} eps`}</div>
      </div>
    </div>`;
        }
        return `<div class="card${h ? ' card-h' : ''}" data-id="${item.id}">
    <div ${getLazyBgAttrs('card-img', posterBg(item))}>
      ${item.addedDate ? `<div style="position:absolute;bottom:8px;left:8px;background:rgba(255,170,0,0.18);border:1px solid rgba(255,170,0,0.35);border-radius:20px;padding:3px 8px;font-size:10px;font-weight:600;color:#FFAA00">+ ${formatAdded(item.addedDate)}</div>` : ''}
      ${h ? '<span class="h-badge">18+</span>' : ''}
    </div>
    <div class="card-body">
      <div class="card-title">${item.title}</div>
      <div class="card-meta">
        <div class="meta-item">${isMovie(item) ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>Película' : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>Serie'}</div>
        <div class="meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${item.readTime}</div>
        ${!isMovie(item) ? `<div class="meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>${item.episodes} eps</div>` : ''}
      </div>
      <div class="card-desc">${item.description}</div>
      <div class="card-actions">
        <button class="cta-btn" data-cta="${item.id}">Ver contenido</button>
        <button class="mylist-add-btn${(isFav(item.id) || getWatchStatus(item.id)) ? ' in-list' : ''}" data-mylist="${item.id}" aria-label="Agregar a Mi Lista">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>${(isFav(item.id) || getWatchStatus(item.id)) ? 'En Mi Lista' : 'Mi Lista'}</span>
        </button>
      </div>
    </div>
  </div>`;
    }

    // ── Continuar Viendo ───────────────────────────────────────
    function getCWItems() {
        const items = [];
        const seenIds = new Set();
        const allKeys = Object.keys(localStorage);

        console.log('CW: Scanning ' + allKeys.length + ' keys in localStorage');

        // 1. Primary: Rich metadata (cw_meta_)
        allKeys.forEach(k => {
            if (!k.startsWith('cw_meta_')) return;
            try {
                const m = JSON.parse(localStorage.getItem(k));
                if (m && m.resumeKey) {
                    if (!m.serieUrl && m.serieId) m.serieUrl = 'go:' + m.serieId;
                    items.push(m);
                    seenIds.add(String(m.serieId));
                    console.log('CW: Found meta for ' + m.serieId);
                } else if (m) {
                    console.log('CW: Removing stale meta for ' + m.serieId);
                    localStorage.removeItem(k);
                }
            } catch (e) {
                console.error('CW: Error parsing metadata for key ' + k, e);
                localStorage.removeItem(k);
            }
        });

        // 2. Secondary: Legacy resume_ keys without metadata
        allKeys.forEach(k => {
            if (!k.startsWith('resume_')) return;

            const parts = k.split('_');
            if (parts.length < 3) return;

            const rawId = parts[1];
            if (seenIds.has(rawId)) return;

            const info = (window.DATA || []).find(d => String(d.id) === rawId || d.url === 'go:' + rawId);
            if (info) {
                const seasonStr = parts[2] || 's0';
                const epStr = parts[3] || 'e1';
                const epNum = epStr.startsWith('e') ? parseInt(epStr.slice(1)) : 1;

                items.push({
                    serieId: rawId,
                    serieTitle: info.title,
                    poster: info.poster || info.image || '',
                    serieUrl: 'go:' + rawId,
                    seasonLabel: '',
                    epNum: epNum,
                    epTitle: '',
                    progress: 50,
                    updatedAt: 0,
                    resumeKey: k
                });
                seenIds.add(rawId);
                console.log('CW: Found legacy progress for ' + rawId);
            }
        });

        const sorted = items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        console.log('CW: Total items to show: ' + sorted.length);
        return sorted;
    }

    function fmtCWTime(s) {
        if (!s) return '';
        s = Math.floor(s);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const ss = String(s % 60).padStart(2, '0');
        if (h > 0) return `${h}h ${m}m`;
        return m > 0 ? `${m}m` : `${ss}s`;
    }

    function navigateToSerie(serieUrl) {
        console.log('navigateToSerie called with URL:', serieUrl);
        if (!serieUrl || serieUrl === '#' || serieUrl === '') {
            console.log('Navegación abortada: URL vacía o inválida');
            return;
        }

        // Si es una URL "go:ID", abrir detalle directamente (sub-navegación)
        if (serieUrl.startsWith('go:')) {
            console.log('Es un go:ID, abriendo detalles internally');
            const idStr = serieUrl.split(':')[1];
            openDetail(+idStr);
            return;
        }

        console.log('Intentando abrir URL real:', serieUrl);
        // Navegación directa para URLs externas (Botón Reproducir)
        if (serieUrl.startsWith('http')) {
            console.log('URL HTTP detectada, usando window.location.href');
            window.location.href = serieUrl;
        } else {
            console.log('URL local o relativa detectada, intentando window.top.location.href');
            try {
                window.top.location.href = serieUrl;
            } catch(e) {
                console.error('Error al usar window.top:', e, 'Usando fallback window.location.href');
                try {
                    window.location.href = serieUrl;
                } catch(e2) {
                    console.error('Error al usar window.location:', e2, 'Usando fallback window.open');
                    window.open(serieUrl, '_blank');
                }
            }
        }
    }

    function cwCardHTML(m, idx) {
        let poster = m.poster;
        if (!poster && window.DATA) {
            const info = window.DATA.find(d => String(d.id) === String(m.serieId) || d.url === 'go:' + m.serieId);
            if (info) poster = info.poster || info.image || '';
        }

        const posterStyle = poster
            ? `background-image:url('${poster}');background-size:cover;background-position:center`
            : 'background:linear-gradient(135deg,#0a1628,#001a0d)';
        const pct = Math.min(100, Math.max(2, m.progress || 0));
        const timeLeft = m.duration && m.currentTime ? fmtCWTime(m.duration - m.currentTime) : '';
        const subLabel = m.epType === 'movie'
            ? `Película`
            : `${m.seasonLabel ? m.seasonLabel + ' · ' : ''}Ep. ${m.epNum}${m.epTitle ? ' — ' + m.epTitle : ''}`;

        return `<div class="cw-card" data-cw-idx="${idx}" data-cw-key="${m.serieId}" style="animation:revealIn 0.4s cubic-bezier(0.16,1,0.3,1) forwards;animation-delay:${idx * 0.06}s;opacity:0">
  <div class="cw-thumb" style="${posterStyle}">
    <div class="cw-thumb-overlay"></div>
    <div class="cw-play-btn">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
    </div>
    <button class="cw-remove-btn" data-cw-remove="${m.serieId}" aria-label="Quitar de Continuar Viendo">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
    <div class="cw-progress-bar"><div class="cw-progress-fill" style="width:${pct}%"></div></div>
  </div>
  <div class="cw-info">
    <div class="cw-title">${m.serieTitle}</div>
    <div class="cw-sub">${subLabel}</div>
    ${timeLeft ? `<div class="cw-time-left">${timeLeft} restante</div>` : ''}
  </div>
</div>`;
    }

    function renderContinueWatching(isSync = false) {
        const section = $('cw-section');
        const track = $('cw-track');
        if (!section || !track) return;

        let items = getCWItems();

        // Filter H content if disabled
        if (!hCatEnabled) {
            items = items.filter(m => {
                const info = (window.DATA || []).find(d => String(d.id) === String(m.serieId) || d.url === 'go:' + m.serieId);
                return !isH(info);
            });
        }

        if (!items.length) {
            section.style.display = 'none';
            console.log('CW: No items to show');
            return;
        }

        console.log('CW: Total items found: ' + items.length);
        section.style.display = '';

        if (isSync && track.children.length === items.length) {
            let matches = 0;
            items.forEach((m, i) => {
                const card = track.querySelector(`.cw-card[data-cw-key="${m.serieId}"]`);
                if (card) {
                    matches++;
                    card.dataset.cwIdx = i; // Asegurar que el índice esté fresco
                    const fill = card.querySelector('.cw-progress-fill');
                    if (fill) fill.style.width = `${Math.min(100, Math.max(2, m.progress || 0))}%`;
                    const sub = card.querySelector('.cw-sub');
                    const subLabel = m.epType === 'movie' ? `Película` : `${m.seasonLabel ? m.seasonLabel + ' · ' : ''}Ep. ${m.epNum}${m.epTitle ? ' — ' + m.epTitle : ''}`;
                    if (sub && sub.textContent !== subLabel) sub.textContent = subLabel;
                    const tl = card.querySelector('.cw-time-left');
                    if (tl && m.duration) {
                        const timeText = `${fmtCWTime(m.duration - m.currentTime)} restante`;
                        if (tl.textContent !== timeText) tl.textContent = timeText;
                    }
                }
            });
            if (matches === items.length) {
                // Incluso si saltamos el render, actualizamos el handler para que use los nuevos "items"
                updateCWClickHandler(items);
                return;
            }
        }

        console.log('CW: Full render (' + items.length + ' items)');
        track.innerHTML = items.map((m, i) => cwCardHTML(m, i)).join('');
        updateCWClickHandler(items);
    }

    function updateCWClickHandler(items) {
        const track = $('cw-track');
        if (!track) return;

        track.onclick = (e) => {
            const removeBtn = e.target.closest('.cw-remove-btn');
            if (removeBtn) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                _pendingCWDeleteId = removeBtn.dataset.cwRemove;
                openModal('cw-delete-confirm-overlay');
                return;
            }

            const card = e.target.closest('.cw-card');
            if (card) {
                const idx = parseInt(card.dataset.cwIdx);
                const m = items[idx];
                if (m) {
                    console.log('CW: Navegando a URL de continuar viendo:', m.serieUrl);
                    if (!m.serieUrl || m.serieUrl === '#') return;
                    try {
                        window.top.location.href = m.serieUrl;
                    } catch(e) {
                        try { window.location.href = m.serieUrl; } catch(e2) { window.open(m.serieUrl, '_blank'); }
                    }
                }
            }
        };
    }

    function renderHome() {

        const featured = visibleDATA().filter(d => d.featured);
        // Películas: 1 episodio o tipo película
        const movies = visibleDATA().filter(d => isMovie(d)).slice(0, 12);
        // Series: no es película
        const series = visibleDATA().filter(d => !isMovie(d)).slice(0, 12);

        initSlider('featured-track', 'featured-dots', featured, true, 'horizontal', true);
        initSlider('movies-track', 'movies-dots', movies, false, 'vertical', false);
        initSlider('series-track', 'series-dots', series, false, 'vertical', false);

        renderContinueWatching();

        const grid = $('home-grid');

        if (!grid) return;
        const sorted = [...visibleDATA()].sort((a, b) => (b.addedDate || '').localeCompare(a.addedDate || '')).slice(0, 5);
        grid.innerHTML = sorted.map((d, i) => recentCardHTML(d, i + 1, i)).join('');
        renderHomeFavs();
        initDynamicHero(featured.length ? featured : visibleDATA().slice(0, 5));
    }

    // ── Hero dinámico alimentado de la base ──
    let _heroItems = [];
    let _heroIdx = 0;
    let _heroTimer = null;

    function initDynamicHero(items) {
        const heroSection = $('hero-section');
        if (!items || !items.length) {
            if (heroSection) heroSection.style.display = 'none';
            clearInterval(_heroTimer);
            return;
        }

        if (heroSection) heroSection.style.display = '';
        _heroItems = items;
        _heroIdx = 0;
        clearInterval(_heroTimer);

        // Dots
        const dotsEl = $('hero-dots');
        if (dotsEl) {
            dotsEl.innerHTML = items.map((_, i) =>
                `<div class="hero-dot${i === 0 ? ' active' : ''}" data-hi="${i}"></div>`
            ).join('');
            dotsEl.onclick = e => {
                const dot = e.target.closest('.hero-dot');
                if (dot) { _heroIdx = +dot.dataset.hi; showHeroItem(_heroIdx); resetHeroTimer(); }
            };
        }

        // Swipe / drag support
        const heroEl = $('hero-section');
        if (heroEl && !heroEl._swipeInit) {
            heroEl._swipeInit = true;
            let startX = 0, startY = 0, dragging = false;
            const onStart = e => {
                const t = e.touches ? e.touches[0] : e;
                startX = t.clientX; startY = t.clientY; dragging = true;
            };
            const onEnd = e => {
                if (!dragging) return;
                dragging = false;
                const t = e.changedTouches ? e.changedTouches[0] : e;
                const dx = t.clientX - startX;
                const dy = t.clientY - startY;
                if (Math.abs(dx) < 30 || Math.abs(dx) < Math.abs(dy)) return;
                if (dx < 0) _heroIdx = (_heroIdx + 1) % _heroItems.length;
                else _heroIdx = (_heroIdx - 1 + _heroItems.length) % _heroItems.length;
                showHeroItem(_heroIdx);
                resetHeroTimer();
            };
            heroEl.addEventListener('touchstart', onStart, { passive: true });
            heroEl.addEventListener('touchend', onEnd, { passive: true });
            heroEl.addEventListener('mousedown', onStart);
            heroEl.addEventListener('mouseup', onEnd);
        }

        showHeroItem(0);
        resetHeroTimer();
    }

    function resetHeroTimer() {
        clearInterval(_heroTimer);
        if (_heroItems.length > 1) {
            _heroTimer = setInterval(() => {
                _heroIdx = (_heroIdx + 1) % _heroItems.length;
                showHeroItem(_heroIdx);
            }, 6000);
        }
    }

    function showHeroItem(idx) {
        const item = _heroItems[idx];
        if (!item) return;

        // Fondo
        const heroBg = $('hero-bg');
        if (heroBg) {
            const bgUrl = item.backdrop || item.poster || item.image;
            if (bgUrl && (bgUrl.startsWith('http') || bgUrl.startsWith('//'))) {
                heroBg.style.backgroundImage = `url('${bgUrl}')`;
                heroBg.style.backgroundSize = 'cover';
                heroBg.style.backgroundPosition = 'center';
            } else {
                heroBg.style.background = bgUrl || 'linear-gradient(135deg,#0a1628,#1a0a2e)';
            }
        }

        // Badge tipo
        const badge = $('hero-badge');
        if (badge) {
            const isMovie = item.type === 'pelicula' || item.episodes === 1;
            badge.innerHTML = isMovie
                ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:5px"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>Película`
                : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:5px"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>Serie`;
            badge.style.display = '';
        }

        // Título
        const titleEl = $('hero-title');
        if (titleEl) titleEl.textContent = item.title || '';

        // Subtítulo / descripción
        const subEl = $('hero-subtitle');
        if (subEl) subEl.textContent = item.description || '';

        // Meta pills: estado + año + género principal
        const metaEl = $('hero-meta');
        if (metaEl) {
            const year = item.date ? item.date.slice(0, 4) : '';
            const statusClass = '';
            const genres = (item.genre || item.category || '').split(',').slice(0, 2).map(g => {
                const trimmed = g.trim();
                return (trimmed.toLowerCase() === 'h' || trimmed.toLowerCase() === 'hentai') ? '+18' : trimmed;
            }).filter(Boolean);
            metaEl.innerHTML = [
                year ? `<span class="hero-meta-pill">${year}</span>` : '',
                ...genres.map(g => `<span class="hero-meta-pill">${g}</span>`)
            ].join('');
        }

        // Botón Ver ahora
        const ctaBtn = $('hero-cta-primary');
        if (ctaBtn) {
            ctaBtn.onclick = () => openDetail(item.id);
        }

        // Botón Mi Lista
        const listBtn = $('hero-cta-secondary');
        if (listBtn) {
            const inList = isFav(item.id) || getWatchStatus(item.id);
            listBtn.innerHTML = inList
                ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>En Mi Lista</span>`
                : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Mi Lista</span>`;
            listBtn.onclick = () => openMyListModal(item.id);
        }

        // Animación contenido
        const content = document.querySelector('.hero-content');
        if (content) {
            content.classList.remove('animating');
            void content.offsetWidth;
            content.classList.add('animating');
        }

        // Dots activos
        const dots = document.querySelectorAll('.hero-dot');
        dots.forEach((d, i) => d.classList.toggle('active', i === idx));
    }

    function initSlider(trackId, dotsId, data, isAutoPlay, layout = 'horizontal', showPagination = true) {
        const track = $(trackId);
        const dotsEl = $(dotsId);
        if (!track || !dotsEl) return;

        // Clear existing content immediately to support real-time filtering updates
        track.innerHTML = '';
        dotsEl.innerHTML = '';

        if (!data || !data.length) {
            // Find common section containers (.home-section or parent) to hide the whole block
            const section = track.closest('.home-section') || track.parentElement;
            if (section) section.style.display = 'none';
            if (track._sliderTimer) clearInterval(track._sliderTimer);
            return;
        }

        const section = track.closest('.home-section') || track.parentElement;
        if (section) section.style.display = '';

        if (!showPagination) {
            dotsEl.style.display = 'none';
        } else {
            dotsEl.style.display = '';
        }
        track.scrollLeft = 0;   // reset any saved scroll position
        const frag = document.createDocumentFragment();
        data.forEach((item, index) => {
            const h = isH(item);
            const div = document.createElement('div');
            div.className = `slider-card ${layout}${h ? ' slider-card-h' : ''}`;
            div.dataset.id = item.id;
            const statusColor = '';
            const year = item.date ? item.date.substring(0, 4) : '';
            const bg = layout === 'horizontal' ? backdropBg(item) : posterBg(item);

            div.innerHTML = `<div class="slider-poster">
                <div ${getLazyBgAttrs('slider-poster-bg', bg)}></div>
                <div class="slider-poster-overlay"></div>
                ${h ? '<span class="h-badge">18+</span>' : ''}
                ${layout === 'vertical' ? '' : (!isMovie(item) ? `<span class="slider-poster-eps">${item.episodes} eps</span>` : `<span class="slider-poster-eps">Película</span>`)}
                <div class="slider-poster-info">
                    <div class="slider-poster-title">${item.title}</div>
                    <div class="slider-poster-meta">
                        <span class="slider-poster-dot">•</span>
                        <span class="slider-poster-year">${year}</span>
                    </div>
                </div>
            </div>`;
            frag.appendChild(div);
        });
        track.appendChild(frag);

        dotsEl.innerHTML = `
            <div class="slider-counter ${showPagination ? '' : 'hidden'}">
                <span class="slider-counter-current">01</span>
                <span class="slider-counter-sep">/</span>
                <span class="slider-counter-total">${String(data.length).padStart(2, '0')}</span>
            </div>
            <div class="slider-progress-bar"><div class="slider-progress-fill"></div></div>
            <div class="slider-dots-row">${data.map((_, i) => `<div class="dot${i === 0 ? ' active' : ''}" data-dot="${i}"></div>`).join('')}</div>
        `;

        let autoIdx = 0;
        let timer = null;

        function updateUI(idx) {
            const dots = dotsEl.querySelectorAll('.dot');
            dots.forEach((d, i) => d.classList.toggle('active', i === idx));
            const current = dotsEl.querySelector('.slider-counter-current');
            if (current) {
                current.textContent = String(idx + 1).padStart(2, '0');
                current.classList.remove('animating');
                void current.offsetWidth;
                current.classList.add('animating');
            }
            const fill = dotsEl.querySelector('.slider-progress-fill');
            if (fill) fill.style.width = ((idx + 1) / data.length * 100) + '%';
        }

        function scrollToIndex(idx) {
            const cards = track.querySelectorAll('.slider-card');
            if (!cards[idx]) return;
            const card = cards[idx];
            const scrollLeft = card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2;
            track.scrollTo({ left: scrollLeft, behavior: 'smooth' });
            updateUI(idx);
            autoIdx = idx;
        }

        let isScrolling = false;
        track.addEventListener('scroll', () => {
            if (isScrolling) return;
            isScrolling = true;
            setTimeout(() => {
                const card = track.querySelector('.slider-card');
                const cardW = card?.offsetWidth || 200;
                const idx = Math.round(track.scrollLeft / (cardW + 12));
                if (idx !== autoIdx && idx >= 0 && idx < data.length) {
                    autoIdx = idx;
                    updateUI(idx);
                }
                isScrolling = false;
            }, 150);
        }, { passive: true });

        dotsEl.onclick = (e) => {
            const dot = e.target.closest('.dot');
            if (dot) scrollToIndex(parseInt(dot.dataset.dot));
        };

        if (isAutoPlay) {
            const startAuto = () => {
                if (track._sliderTimer) clearInterval(track._sliderTimer);
                track._sliderTimer = setInterval(() => {
                    autoIdx = (autoIdx + 1) % data.length;
                    scrollToIndex(autoIdx);
                }, 5000);
            };
            startAuto();
            track.addEventListener('touchstart', () => clearInterval(track._sliderTimer), { passive: true });
            track.addEventListener('touchend', startAuto, { passive: true });
        } else {
            if (track._sliderTimer) {
                clearInterval(track._sliderTimer);
                delete track._sliderTimer;
            }
        }
    }

    function recentCardHTML(item, num, index = 0) {
        const h = isH(item);
        return `<div class="recent-card${h ? ' recent-card-h' : ''}" data-id="${item.id}" style="animation: revealIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; animation-delay: ${index * 0.05}s; opacity: 0;">
    <div class="recent-poster">
      <div ${getLazyBgAttrs('recent-poster-img', posterBg(item))}></div>
      <div class="recent-poster-num">#${num}</div>
      ${h ? '<span class="h-badge">18+</span>' : ''}
    </div>
    <div class="recent-body">
      <div class="recent-title">${item.title}</div>
      <div class="recent-meta">
        <span class="recent-pill">${isMovie(item) ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>Película' : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>Serie'}</span>
      </div>
      <div class="recent-date">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        ${formatAdded(item.addedDate)}
      </div>
    </div>
  </div>`;
    }

    function renderHomeFavs() {
        const container = $('home-favs');
        if (!container) return;
        const favItems = visibleDATA().filter(d => isFav(d.id));
        if (!favItems.length) {
            container.innerHTML = '<div style="padding:8px 0;font-size:13px;color:var(--text3)">Aún no tienes favoritos</div>';
            return;
        }
        container.innerHTML = favItems.map(d => cardHTML(d, true)).join('');
    }

    // SCROLL INFINITO MEJORADO PARA RENDERINCHUNKS
    let _chunkObserver = null;
    function renderInChunks(items, container, rendererFunc, chunkSize = 24) {
        if (!container) return;
        container.innerHTML = '';
        if (_chunkObserver) {
            _chunkObserver.disconnect();
            _chunkObserver = null;
        }
        if (!items || items.length === 0) return;

        let pos = 0;
        function renderNextChunk() {
            const chunk = items.slice(pos, pos + chunkSize);
            if (chunk.length === 0) return;

            // Render HTML
            const html = chunk.map((item, i) => rendererFunc(item, pos + i)).join('');
            container.insertAdjacentHTML('beforeend', html);
            pos += chunkSize;

            // Trigger eager load on visible new elements
            setTimeout(observeImages, 10);

            // Set up IntersectionObserver to load the next chunk when scrolled near bottom
            if (pos < items.length) {
                const sentinel = document.createElement('div');
                sentinel.className = 'scroll-sentinel';
                sentinel.style.height = '1px';
                sentinel.style.width = '100%';
                sentinel.style.gridColumn = '1 / -1'; // Ensure it spans the whole grid
                container.appendChild(sentinel);

                _chunkObserver = new IntersectionObserver((entries) => {
                    if (entries[0].isIntersecting) {
                        _chunkObserver.disconnect();
                        sentinel.remove();
                        requestAnimationFrame(renderNextChunk);
                    }
                }, { rootMargin: '400px' }); // Load early 
                _chunkObserver.observe(sentinel);
            }
        }
        renderNextChunk();
    }

    function searchCardHTML(item, index = 0, purple = false, eager = false) {
        const h = purple || isH(item);
        let bgStr = posterBg(item);
        let bgAttrs = getLazyBgAttrs('scard-poster', bgStr);
        if (eager && bgAttrs.includes('lazy-bg')) {
            bgAttrs = `class="scard-poster loaded" style="background: ${bgStr} !important; animation: none !important;"`;
        }
        // Cap stagger delay heavily to prevent massive lag
        const delay = (index % 24) * 0.04;
        return `<div class="scard${h ? ' scard-h' : ''}" data-id="${item.id}" style="animation: revealIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; animation-delay: ${delay}s; opacity: 0;">
    <div ${bgAttrs}>
      ${h ? '<span class="h-badge">18+</span>' : ''}
    </div>
    <div class="scard-body">
      <div class="scard-title">${item.title}</div>
      <div class="scard-pills">
        <span class="scard-pill">${isMovie(item) ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>Película' : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>Serie'}</span>
        <span class="scard-pill">${item.readTime}</span>
        <span class="scard-pill">${item.date ? item.date.slice(0, 4) : ''}</span>
      </div>
    </div>
  </div>`;
    }

    function renderSearch(q = '', cat = null) {
        const grid = $('search-grid');
        const empty = $('search-empty');
        const meta = $('search-meta');

        const trimmedQ = q.trim();
        const lower = trimmedQ.toLowerCase();
        let results = visibleDATA();

        // Uso la caché pre-computada de búsqueda (muy rápido)
        if (trimmedQ) {
            results = results.filter(d => (d._searchText || '').includes(lower));
        }

        if (cat && trimmedQ) results = results.filter(d => {
            const cats = d.category ? d.category.split(/,\s*/).map(c => c.trim()) : [];
            return cats.includes(cat);
        });

        if (!results.length) {
            grid.innerHTML = '';
            empty.style.display = 'flex';
            meta.textContent = '';
        } else {
            empty.style.display = 'none';
            renderInChunks(results, grid, (d, i) => searchCardHTML(d, i, false, !!trimmedQ));
            meta.textContent = `${results.length} resultado${results.length !== 1 ? 's' : ''}${trimmedQ ? ' para "' + trimmedQ + '"' : ''}`;
        }
    }

    let lastRenderedHState = null;
    function renderExploreCards() {
        const primaryContainer = $('explore-top-cards');
        const secondaryContainer = $('explore-secondary-cards');
        if (!primaryContainer || primaryContainer.children.length > 0) return;
        const conf = window.CONFIG?.exploreCards || {};
        const getConf = (key) => conf[key] || {};

        const makeCard = (card, i) => {
            const bg = card.conf.backgroundUrl || '';
            const icon = card.conf.icon || '';
            return `
                <div class="explore-card" onclick="navigateTo('${card.nav}')"
                    style="animation: revealIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; animation-delay: ${i * 0.06}s; opacity: 0;">
                    ${bg ? `<img class="explore-card-bg" src="${bg}" alt="">` : ''}
                    <div class="explore-card-overlay"></div>
                    <div class="explore-card-content">
                        <div class="explore-card-icon">${icon}</div>
                        <span class="explore-card-title">${card.title}</span>
                    </div>
                    <div class="explore-card-shine"></div>
                </div>
            `;
        };

        const allCards = [
            { nav: 'movies-all', title: 'Pel\u00edculas', conf: getConf('movies') },
            { nav: 'series-all', title: 'Series', conf: getConf('series') },
            { nav: 'genres', title: 'G\u00e9neros', conf: getConf('genres') },
            { nav: 'classics-all', title: 'M\u00e1s Antiguos', conf: getConf('classics') },
            { nav: 'recent-all', title: '\u00daltimos Agregados', conf: getConf('recentAdded') },
            { nav: 'trending-all', title: 'Tendencias', conf: getConf('trending') }
        ];

        primaryContainer.innerHTML = allCards.map(makeCard).join('');
        if (secondaryContainer) secondaryContainer.innerHTML = '';
    }

    function renderCategories() {
        renderExploreCards();
        const catGrid = $('cat-grid');
        if (!catGrid) return;

        if (catGrid.children.length > 0 && lastRenderedHState === hCatEnabled) return;
        lastRenderedHState = hCatEnabled;

        const data = visibleDATA();
        const counts = {};
        data.forEach(item => {
            if (!item.category) return;
            const itemCats = item.category.split(/,\s*/);
            itemCats.forEach(c => {
                const trimmed = c.trim();
                counts[trimmed] = (counts[trimmed] || 0) + 1;
            });
        });

        const visibleCats = hCatEnabled ? [...CATEGORIES, '+18'] : CATEGORIES;
        catGrid.innerHTML = visibleCats.map((cat, index) => {
            const count = counts[cat] || 0;
            const cfg = (window.CATEGORIES_CONFIG || []).find(x => x.name.toLowerCase().replace(':', '') === cat.toLowerCase().replace(':', '')) || { name: cat, iconName: 'film' };
            const iconName = cfg.iconName || 'film';
            const accent = cfg.accent || 'var(--accent)';

            return `
                <div class="cat-card${cfg.backdrop ? ' cat-has-bg' : ''}" data-cat="${cat}">
                    <div class="cat-card-bg"${cfg.backdrop ? ` data-bg="${cfg.backdrop}"` : ''}></div>
                    <div class="cat-card-icon" style="color:${accent}; border-color:${accent}44; background: ${accent}11;"><i data-lucide="${iconName}" style="width:20px;height:20px"></i></div>
                    <div class="cat-card-info">
                        <h3>${cat}</h3>
                        <div class="cat-card-count" style="background:${accent}; color:#000">${count} título${count !== 1 ? 's' : ''}</div>
                    </div>
                </div>
            `;
        }).join('');

        // Lazy load de backdrops con IntersectionObserver
        catGrid.querySelectorAll('.cat-card-bg[data-bg]').forEach((el, i) => {
            const obs = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    observer.unobserve(el);
                    const src = el.dataset.bg;
                    if (!src) return;
                    const img = new Image();
                    img.onload = img.onerror = () => {
                        el.style.backgroundImage = `url('${src}')`;
                        setTimeout(() => el.classList.add('cat-bg-loaded'), i * 35);
                    };
                    img.src = src;
                });
            }, { rootMargin: '400px' });
            obs.observe(el);
        });

        // Inicializar iconos Lucide después de insertar el HTML
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    function renderCatLibrary(cat) {
        $('cat-library-title').textContent = cat === '+18' ? 'Contenido +18' : cat;
        const items = visibleDATA().filter(d => d.category === cat || (d.category && d.category.split(/,\s*/).map(c => c.trim()).includes(cat)));
        if (items.length === 0) {
            $('cat-library-grid').innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;padding:60px 20px;text-align:center">
        <span style="font-size:48px">📭</span>
        <p style="margin-top:12px;font-size:16px;font-weight:700;color:var(--text2)">Sin contenido aún</p>
        <small style="color:var(--text3);font-size:13px">No hay series en esta categoría todavía</small>
      </div>`;
        } else {
            renderInChunks(items, $('cat-library-grid'), (d, i) => searchCardHTML(d, i, cat === '+18'));
        }
    }

    function renderAllLibrary() {
        let items = visibleDATA();
        let title = 'Últimos agregados';
        const grid = $('all-library-grid');
        if (!grid) return;

        grid.classList.remove('layout-horizontal');

        if (state.filterType === 'featured') {
            items = items.filter(d => d.featured);
            title = 'Todos los Destacados';
        } else if (state.filterType === 'airing') {
            title = 'En Emisión';
        } else if (state.filterType === 'movies') {
            items = items.filter(d => isMovie(d));
            title = 'Todas las Películas';
        } else if (state.filterType === 'series') {
            items = items.filter(d => !isMovie(d));
            title = 'Todas las Series';
        } else if (state.filterType === 'classics') {
            items = items.filter(d => d.date && parseInt(d.date.slice(0, 4)) <= 2010);
            title = 'Más Antiguos';
        } else if (state.filterType === 'recent') {
            title = 'Últimos Agregados';
            // no additional filtering - already sorted by addedDate below
        } else if (state.filterType === 'trending') {
            items = items.filter(d => d.featured);
            title = 'Tendencias';
        }

        const sorted = [...items].sort((a, b) => (b.addedDate || '').localeCompare(a.addedDate || ''));
        const titleEl = document.querySelector('#view-all-library .cat-library-title');
        if (titleEl) titleEl.textContent = title;

        const countEl = $('all-library-count');
        if (countEl) countEl.textContent = `${items.length} títulos`;

        renderInChunks(sorted, grid, (d, i) => searchCardHTML(d, i, false));
    }

    function myListCardHTML(item, index = 0) {
        const ws = getWatchStatus(item.id);
        const fav = isFav(item.id);
        const h = isH(item);
        const delay = (index % 24) * 0.04;
        const isMovie = item.type === 'pelicula' || item.episodes === 1;
        const bgStyle = `background: ${posterBg(item)} !important; background-size: cover !important; background-position: center !important;`;

        return `<div class="scard${h ? ' scard-h' : ''}" data-id="${item.id}" style="animation: revealIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; animation-delay: ${delay}s; opacity: 0;">
    <div class="scard-poster loaded" style="${bgStyle}">
      ${h ? '<span class="h-badge">18+</span>' : ''}
    </div>
    <div class="scard-body">
      <div class="scard-title">${item.title}</div>
      <div class="scard-pills">
        <span class="scard-pill">${isMovie ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>Película' : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>Serie'}</span>
        <span class="scard-pill">${item.readTime}</span>
        <span class="scard-pill">${item.date ? item.date.slice(0, 4) : ''}</span>
      </div>
      <div class="fav-watch-btns">
        <button class="ws-btn${ws === 'Viendo' ? ' active' : ''}" data-ws="Viendo" data-ws-item="${item.id}">▶ Viendo</button>
        <button class="ws-btn${ws === 'Completado' ? ' active' : ''}" data-ws="Completado" data-ws-item="${item.id}">✓ Completado</button>
        <button class="ws-btn${ws === 'Pendiente' ? ' active' : ''}" data-ws="Pendiente" data-ws-item="${item.id}">⏱ Pendiente</button>
      </div>
    </div>
    <button class="mylist-remove-btn" data-remove="${item.id}" aria-label="Eliminar de Mi Lista">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
    </button>
  </div>`;
    }

    function renderFavorites() {
        const grid = $('fav-grid');
        const empty = $('fav-empty');
        const countEl = $('mylist-count');

        let items = visibleDATA().filter(d => isFav(d.id) || getWatchStatus(d.id));

        const filter = state.favFilter;
        if (filter === 'fav') {
            items = items.filter(d => isFav(d.id));
        } else if (filter === 'Viendo' || filter === 'Completado') {
            items = items.filter(d => getWatchStatus(d.id) === filter);
        } else if (filter === 'pelicula') {
            items = items.filter(d => isMovie(d));
        } else if (filter === 'serie') {
            items = items.filter(d => !isMovie(d));
        }

        const total = items.length;
        if (countEl) {
            if (total) {
                const movies = items.filter(d => isMovie(d)).length;
                const series = total - movies;
                const parts = [];
                if (movies) parts.push(`${movies} película${movies !== 1 ? 's' : ''}`);
                if (series) parts.push(`${series} serie${series !== 1 ? 's' : ''}`);
                countEl.textContent = parts.join(' · ');
            } else {
                countEl.textContent = '';
            }
        }

        if (!total) {
            grid.innerHTML = '';
            empty.style.display = 'flex';
        } else {
            empty.style.display = 'none';
            grid.innerHTML = items.map((d, i) => myListCardHTML(d, i)).join('');
        }
    }

    function renderProfile() {
        const favCount = favs.length;
        const badge = $('fav-badge-profile');
        if (badge) badge.textContent = favCount;

        const visibleCategories = hCatEnabled
            ? CATS_CFG.map(c => c.name)
            : CATS_CFG.filter(c => !c.isH).map(c => c.name);

        const stats = $('profile-stats');
        if (stats) {
            stats.innerHTML = `
                <div class="stat-item"><div class="stat-num">${visibleDATA().length}</div><div class="stat-label">Títulos</div></div>
                <div class="stat-item"><div class="stat-num">${favCount}</div><div class="stat-label">Favoritos</div></div>
                <div class="stat-item"><div class="stat-num">${visibleCategories.length}</div><div class="stat-label">Géneros</div></div>
            `;
        }
        const pill = $('h-toggle-pill');
        if (pill) pill.classList.toggle('active', hCatEnabled);

        const apPill = $('autoplay-toggle-pill');
        if (apPill) apPill.classList.toggle('active', autoplayEnabled);

        const langSel = $('preferred-lang-select');
        if (langSel) {
            const saved = localStorage.getItem('blaze_preferred_lang');
            if (!saved) {
                localStorage.setItem('blaze_preferred_lang', 'Latino');
                langSel.value = 'Latino';
            } else {
                langSel.value = saved;
            }
        }

        const versionEl = $('profile-version');
        if (versionEl) versionEl.textContent = CFG.version || '1.0.0';

        const reqBtn = $('request-content-btn');
        const reqGrp = $('request-content-group');
        if (reqBtn) {
            if (CFG.requestContentUrl) {
                if (reqGrp) reqGrp.style.display = 'block';
                reqBtn.style.display = '';
                reqBtn.onclick = () => location.href = CFG.requestContentUrl;
            } else {
                if (reqGrp) reqGrp.style.display = 'none';
                reqBtn.style.display = 'none';
            }
        }
    }

    function renderAboutInfo() {
        const appName = CFG.appName || 'WolfStream';
        const version = CFG.version || '1.0.0';

        const titleEl = $('info-app-name');
        const versionEl = $('info-app-version');
        const descEl = $('info-description');
        const iconEl = $('info-app-icon');
        const featuresEl = $('info-features-list');
        const versionTextEl = $('info-version-text');
        const developerTextEl = $('info-developer-text');

        if (titleEl) titleEl.textContent = appName;
        if (versionEl) versionEl.textContent = `v${version}`;
        if (versionTextEl) versionTextEl.textContent = version;
        if (developerTextEl) developerTextEl.textContent = CFG.developerName || 'WolfStream Team';
        if (descEl) descEl.textContent = CFG.aboutDescription || `${appName} es tu plataforma personal para descubrir y seguir el anime que más te gusta.`;

        if (iconEl) {
            const actualLogoUrl = CFG.aboutLogoUrl || (document.querySelector('link[rel*="icon"]') ? document.querySelector('link[rel*="icon"]').href : null);
            if (actualLogoUrl) {
                iconEl.innerHTML = `<img src="${actualLogoUrl}" alt="${appName}" style="height:36px;object-fit:contain">`;
                iconEl.style.background = 'none';
            } else {
                iconEl.innerHTML = `<span style="font-size:24px;font-weight:900;background:linear-gradient(90deg,var(--accent),#FFD060);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">${appName.charAt(0)}</span>`;
            }
        }

        if (featuresEl && CFG.aboutFeatures && CFG.aboutFeatures.length) {
            featuresEl.innerHTML = CFG.aboutFeatures.map(f =>
                `<div class="about-feature">${f.icon || `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`}<span>${f.text || f}</span></div>`
            ).join('');
        }
    }

    function renderDetail(item) {
        const fav = isFav(item.id);
        const castHTML = item.cast && item.cast.length
            ? item.cast.map(c => {
                const [name, role] = c.split('(');
                return `<div class="cast-item">
          <div class="cast-avatar">${name.trim().charAt(0)}</div>
          <div class="cast-info">
            <div class="cast-name">${name.trim()}</div>
            ${role ? `<div class="cast-role">${role.replace(')', '')}</div>` : ''}
          </div>
        </div>`;
            }).join('')
            : `<div class="detail-cast-empty"><span>🎭</span><p>Sin reparto disponible</p></div>`;

        $('detail-inner').innerHTML = `
    <div class="cat-library-header">
      <button class="detail-back" id="detail-back-btn" aria-label="Volver">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
    </div>
    <div ${getLazyBgAttrs('detail-img', backdropBg(item))}>
      <div ${getLazyBgAttrs('detail-poster', posterBg(item))}></div>
      <button class="detail-fav-btn${fav ? ' active' : ''}" id="detail-fav-btn" aria-label="Favorito">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      </button>
    </div>
    <div class="detail-content">
      <div class="detail-badges">
        ${isH(item) ? '<span class="detail-h-badge">🔞 18+</span>' : ''}
        <span class="detail-badge status-off">${item.date ? item.date.slice(0, 4) : ''}</span>
      </div>
      <h1 class="detail-title">${item.title}</h1>
      <div class="detail-cta">
        <button class="detail-cta-main" id="detail-cta-main">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Reproducir
        </button>
        <button class="detail-mylist-btn${getWatchStatus(item.id) ? ' in-list' : ''}" id="detail-mylist-btn" data-mylist="${item.id}" aria-label="Añadir a Mi Lista">
          ${getWatchStatus(item.id)
                ? ({ Viendo: '▶ Viendo', Completado: '✓ Completado', Pendiente: '⏱ Pendiente' }[getWatchStatus(item.id)] || getWatchStatus(item.id))
                : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Añadir a Mi Lista`}
        </button>
      </div>

      <div class="detail-tabs">
        <button class="detail-tab active" data-tab="synopsis">Sinopsis</button>
        <button class="detail-tab" data-tab="cast">Reparto</button>
        <button class="detail-tab" data-tab="info">Información</button>
      </div>

      <div class="detail-tab-panel" id="tab-synopsis">
        <div class="detail-tags">${(() => {
                const maxTags = 5;
                const visibleTags = item.tags.slice(0, maxTags);
                const hiddenTags = item.tags.slice(maxTags);
                let html = visibleTags.map(t => {
                    const tag = (t.toLowerCase() === 'h' || t.toLowerCase() === 'hentai') ? '+18' : t;
                    return `<span class="tag">${tag}</span>`;
                }).join('');
                if (hiddenTags.length > 0) {
                    html += hiddenTags.map(t => {
                        const tag = (t.toLowerCase() === 'h' || t.toLowerCase() === 'hentai') ? '+18' : t;
                        return `<span class="tag tag-hidden">${tag}</span>`;
                    }).join('');
                    html += `<button class="tag-show-more" data-show-tags>Ver más (${hiddenTags.length})</button>`;
                }
                return html;
            })()}</div>
        <p class="detail-desc">${item.description}</p>
      </div>

      <div class="detail-tab-panel" id="tab-cast" style="display:none">
        <div class="cast-list">${castHTML}</div>
      </div>

      <div class="detail-tab-panel" id="tab-info" style="display:none">
        <div class="detail-meta-grid" style="grid-template-columns: repeat(${isMovie(item) ? 3 : 4}, 1fr);">
          <div class="detail-meta-item"><div class="val" style="font-size:14px;">${isMovie(item) ? 'Película' : 'Serie'}</div><div class="lbl">Tipo</div></div>
          ${!isMovie(item) ? `<div class="detail-meta-item"><div class="val">${item.episodes}</div><div class="lbl">Episodios</div></div>` : ''}
          <div class="detail-meta-item"><div class="val">${item.readTime}</div><div class="lbl">Duración</div></div>
          <div class="detail-meta-item"><div class="val">${item.date ? item.date.slice(0, 4) : '—'}</div><div class="lbl">Año</div></div>
        </div>
        <div class="detail-info-list">
          <div class="detail-info-row detail-info-genres">
            <span>Géneros</span>
            <div class="detail-genres-tags">
              ${(() => {
                let genres = [];
                if (item.genre.includes(' / ')) {
                    genres = item.genre.split(' / ').map(g => g.trim());
                } else if (item.genre.includes('/')) {
                    genres = item.genre.split('/').map(g => g.trim());
                } else if (item.genre.includes(',')) {
                    genres = item.genre.split(',').map(g => g.trim());
                } else {
                    genres = [item.genre];
                }

                const maxGenres = 3;
                const visibleGenres = genres.slice(0, maxGenres);
                const hiddenGenres = genres.slice(maxGenres);

                let html = visibleGenres.map(g => {
                    const genre = (g.toLowerCase() === 'h' || g.toLowerCase() === 'hentai') ? '+18' : g;
                    return `<span class="tag">${genre}</span>`;
                }).join('');
                if (hiddenGenres.length > 0) {
                    html += hiddenGenres.map(g => {
                        const genre = (g.toLowerCase() === 'h' || g.toLowerCase() === 'hentai') ? '+18' : g;
                        return `<span class="tag tag-hidden">${genre}</span>`;
                    }).join('');
                    html += `<button class="tag-show-more" data-show-genres>Ver más (${hiddenGenres.length})</button>`;
                }
                return html;
            })()}
            </div>
          </div>
          <div class="detail-info-row"><span>Estreno</span><span>${item.date}</span></div>
        </div>
      </div>
    </div>`;

        $('detail-inner').querySelectorAll('.detail-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                $('detail-inner').querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
                $('detail-inner').querySelectorAll('.detail-tab-panel').forEach(p => p.style.display = 'none');
                tab.classList.add('active');
                document.getElementById('tab-' + tab.dataset.tab).style.display = '';
            });
        });

        document.getElementById('detail-back-btn').addEventListener('click', () => navigateTo(state.prev || 'home', true));
        document.getElementById('detail-cta-main').addEventListener('click', () => { 
            console.log('Botón Reproducir presionado. Navegando a URL configurada:', item.url);
            if (!item.url || item.url === '#') return;
            sessionStorage.setItem('wolfblaze_last_detail', item.id);
            try {
                window.top.location.href = item.url;
            } catch(e) {
                try { window.location.href = item.url; } catch(e2) { window.open(item.url, '_blank'); }
            }
        });

        document.getElementById('detail-fav-btn').addEventListener('click', () => {
            toggleFav(item.id);
            const btn = document.getElementById('detail-fav-btn');
            const active = isFav(item.id);
            btn.classList.toggle('active', active);
            btn.querySelector('svg').setAttribute('fill', active ? 'currentColor' : 'none');
        });

        document.getElementById('detail-mylist-btn').addEventListener('click', () => {
            openMyListModal(item.id);
        });

        const showTagsBtn = $('detail-inner').querySelector('[data-show-tags]');
        if (showTagsBtn) {
            showTagsBtn.addEventListener('click', (e) => {
                const btn = e.target;
                const container = btn.parentElement;
                const allTags = Array.from(container.querySelectorAll('.tag')).filter(t => !t.classList.contains('tag-show-more'));
                const maxVisible = 5;
                const isExpanded = btn.dataset.expanded === 'true';

                if (isExpanded) {
                    allTags.forEach((tag, index) => {
                        if (index >= maxVisible) {
                            tag.classList.add('tag-hidden');
                        }
                    });
                    btn.textContent = `Ver más (${allTags.length - maxVisible})`;
                    btn.dataset.expanded = 'false';
                } else {
                    allTags.forEach(tag => tag.classList.remove('tag-hidden'));
                    btn.textContent = 'Ver menos';
                    btn.dataset.expanded = 'true';
                }
            });
        }

        const showGenresBtn = $('detail-inner').querySelector('[data-show-genres]');
        if (showGenresBtn) {
            showGenresBtn.addEventListener('click', (e) => {
                const btn = e.target;
                const container = btn.parentElement;
                const allTags = Array.from(container.querySelectorAll('.tag')).filter(t => !t.classList.contains('tag-show-more'));
                const maxVisible = 3;
                const isExpanded = btn.dataset.expanded === 'true';

                if (isExpanded) {
                    allTags.forEach((tag, index) => {
                        if (index >= maxVisible) {
                            tag.classList.add('tag-hidden');
                        }
                    });
                    btn.textContent = `Ver más (${allTags.length - maxVisible})`;
                    btn.dataset.expanded = 'false';
                } else {
                    allTags.forEach(tag => tag.classList.remove('tag-hidden'));
                    btn.textContent = 'Ver menos';
                    btn.dataset.expanded = 'true';
                }
            });
        }
    }

    function navigateTo(view, back = false) {
        if (view === 'featured-all') {
            state.filterType = 'featured';
            view = 'all-library';
        } else if (view === 'airing-all') {
            state.filterType = 'airing';
            view = 'all-library';
        } else if (view === 'movies-all') {
            state.filterType = 'movies';
            view = 'all-library';
        } else if (view === 'series-all') {
            state.filterType = 'series';
            view = 'all-library';
        } else if (view === 'classics-all') {
            state.filterType = 'classics';
            view = 'all-library';
        } else if (view === 'recent-all') {
            state.filterType = 'recent';
            view = 'all-library';
        } else if (view === 'trending-all') {
            state.filterType = 'trending';
            view = 'all-library';
        } else if (view === 'all-library') {
            state.filterType = null;
        }
        const views = document.querySelectorAll('.view');
        const current = state.view ? document.getElementById('view-' + state.view) : null;
        const next = document.getElementById('view-' + view);
        if (!next || (state.view === view && next.classList.contains('active'))) return;

        if (current) {
            current.classList.remove('active');
            current.classList.add('slide-left');
            setTimeout(() => { current.classList.remove('slide-left'); }, 350);
        }

        if (state.view) {
            const oldView = document.getElementById(`view-${state.view}`);
            if (oldView) viewScrolls[state.view] = oldView.scrollTop;
        }

        if (back) {
            const idx = navHistory.lastIndexOf(view);
            if (idx !== -1) navHistory = navHistory.slice(0, idx);
        } else if (state.view && state.view !== view) {
            navHistory.push(state.view);
        }

        state.prev = navHistory.length > 0 ? navHistory[navHistory.length - 1] : (view === 'home' ? null : 'home');
        state.view = view;
        next.classList.add('active');

        if (viewScrolls[view] !== undefined) {
            next.scrollTop = viewScrolls[view];
        } else {
            next.scrollTop = 0;
        }

        document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === view || (view === 'cat-library' && b.dataset.nav === 'categories') || (view === 'genres' && b.dataset.nav === 'categories') || (view === 'all-library' && (((state.filterType === 'movies' || state.filterType === 'series') && state.prev === 'categories') ? b.dataset.nav === 'categories' : b.dataset.nav === 'home'))));

        if (view === 'settings-info') renderAboutInfo();
        if (view === 'settings-data') updateSearchHistoryCountLabel();

        const header = document.getElementById('header');
        const main = document.getElementById('main');
        const isFullscreenView = ['search', 'search-history', 'categories', 'genres', 'cat-library', 'all-library', 'detail', 'favorites'].includes(view) || view.startsWith('settings');

        if (isFullscreenView) {
            header.style.display = 'none';
            main.style.marginTop = '0';
        } else {
            header.style.display = '';
            main.style.marginTop = '';
        }

        if (view === 'home') renderHomeFavs();
        if (view === 'search') { renderSearch($('search-input').value, state.catFilter); updateSearchHistoryCountLabel(); }
        if (view === 'search-history') renderSearchHistory();
        if (view === 'categories' || view === 'genres') renderCategories();
        if (view === 'all-library') renderAllLibrary();
        if (view === 'favorites') renderFavorites();
        if (view === 'profile') {
            renderProfile();
            const pb = document.getElementById('profile-banner');
            if (pb) forceLoadImage(pb);
        }

        setTimeout(() => unstickImagesInView(document.getElementById(`view-${view}`)), 50);
        setTimeout(() => unstickImagesInView(document.getElementById(`view-${view}`)), 300);

        const params = { view: view };
        if (view === 'search' && $('search-input')?.value) params.q = $('search-input').value;
        if (view === 'cat-library') params.cat = state.catFilter;
        if (view === 'detail' && state.detail) params.id = state.detail.id;
        updateURL(params);
    }
    window.navigateTo = navigateTo;

    function openDetail(id) {
        const item = DATA.find(d => d.id === id);
        if (!item) return;
        state.detail = item;
        renderDetail(item);
        navigateTo('detail');
        setTimeout(() => unstickImagesInView(document.getElementById('view-detail')), 50);
        setTimeout(() => unstickImagesInView(document.getElementById('view-detail')), 300);
    }

    // ── Modal Mi Lista ──────────────────────────────────────────
    let modalItemId = null;
    let modalPendingStatus = undefined;

    function openMyListModal(id) {
        const item = DATA.find(d => d.id === id);
        if (!item) return;
        modalItemId = id;
        modalPendingStatus = undefined;

        document.getElementById('modal-poster').style.background = posterBg(item);
        document.getElementById('modal-title').textContent = item.title;
        document.getElementById('modal-genre').textContent = item.genre;

        updateModalChecks();

        const overlay = $('mylist-modal-overlay');
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
    }

    function updateModalChecks() {
        const ws = modalPendingStatus !== undefined ? modalPendingStatus : getWatchStatus(modalItemId);
        const keys = ['Viendo', 'Completado', 'Pendiente'];
        keys.forEach(key => {
            const btn = document.querySelector(`[data-modal-ws="${key}"]`);
            const radio = document.getElementById(`modal-check-${key}`);
            if (!btn || !radio) return;
            btn.classList.toggle('active', ws === key);
            radio.classList.toggle('checked', ws === key);
        });
        const saved = getWatchStatus(modalItemId);
        const confirmBtn = $('modal-confirm-btn');
        if (confirmBtn) confirmBtn.disabled = modalPendingStatus === undefined || modalPendingStatus === saved;
    }

    function closeMyListModal() {
        const overlay = $('mylist-modal-overlay');
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
        if (state.view === 'favorites') renderFavorites();
        if (state.view === 'home') renderHome();
        if (state.view === 'search') renderSearch($('search-input').value, state.catFilter);
        renderProfile();

        if (state.view === 'detail' && state.detail) {
            const btn = document.getElementById('detail-mylist-btn');
            if (btn) {
                const ws = getWatchStatus(state.detail.id);
                const statusIcons = { Viendo: '▶ Viendo', Completado: '✓ Completado', Pendiente: '⏱ Pendiente' };
                btn.classList.toggle('in-list', !!ws);
                btn.innerHTML = ws
                    ? (statusIcons[ws] || ws)
                    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Añadir a Mi Lista`;
            }
        }
        modalItemId = null;
        modalPendingStatus = undefined;
    }

    $('mylist-modal-overlay').addEventListener('click', e => {
        if (e.target === $('mylist-modal-overlay')) closeMyListModal();
    });
    $('modal-close-btn').addEventListener('click', closeMyListModal);

    document.getElementById('mylist-modal').addEventListener('click', e => {
        const opt = e.target.closest('[data-modal-ws]');
        if (!opt || modalItemId === null) return;
        const key = opt.dataset.modalWs;
        const saved = getWatchStatus(modalItemId);
        const current = modalPendingStatus !== undefined ? modalPendingStatus : saved;
        modalPendingStatus = current === key ? null : key;
        updateModalChecks();
    });

    $('modal-confirm-btn').addEventListener('click', () => {
        if (modalItemId === null || modalPendingStatus === undefined) return;
        setWatchStatus(modalItemId, modalPendingStatus || null);
        closeMyListModal();
    });

    function renderFilterChips() {
        const chips = $('filter-chips');
        const visibleCats = hCatEnabled ? [...CATEGORIES, '+18'] : CATEGORIES;
        if (!hCatEnabled && state.catFilter === '+18') state.catFilter = null;
        chips.innerHTML = `<div class="chip${!state.catFilter ? ' active' : ''}" data-chip="">Todos</div>` +
            visibleCats.map(c => {
                const cfg = CATS_CFG.find(x => x.name === c);
                const accent = cfg ? cfg.accent : '#fff';
                const active = state.catFilter === c ? ' active' : '';
                return `<div class="chip${active}" data-chip="${c}" style="--chip-accent:${accent}">${c}</div>`;
            }).join('');
    }

    // ── Modal Confirmar Eliminación ──
    let _removeTargetId = null;
    let _removeSelFav = false;
    let _removeSelWs = false;

    function _updateRemoveAcceptBtn() {
        const btn = document.getElementById('remove-confirm-accept');
        if (btn) btn.disabled = !_removeSelFav && !_removeSelWs;
    }

    function openRemoveConfirm(id) {
        const item = DATA.find(d => d.id === id);
        if (!item) return;
        _removeTargetId = id;
        const hasFav = isFav(id);
        const hasWs = !!getWatchStatus(id);
        const filter = state.favFilter;

        const desc = document.getElementById('remove-confirm-desc');
        if (desc) desc.textContent = item.title;

        const title = document.querySelector('.remove-confirm-title');
        const optFav = document.getElementById('remove-opt-fav');
        const optWs = document.getElementById('remove-opt-ws');
        const wsLabel = document.getElementById('remove-opt-ws-label');
        const acceptBtn = document.getElementById('remove-confirm-accept');
        const options = document.getElementById('remove-confirm-options');

        const tabNames = { fav: 'Favoritos', Viendo: 'Viendo', Completado: 'Completado', Pendiente: 'Pendiente' };

        if (filter !== 'all') {
            if (title) title.textContent = `¿Eliminar de ${tabNames[filter] || filter}?`;
            if (options) options.style.display = 'none';
            if (acceptBtn) { acceptBtn.textContent = 'Eliminar'; acceptBtn.disabled = false; }
            _removeSelFav = filter === 'fav';
            _removeSelWs = filter !== 'fav';
        } else {
            if (title) title.textContent = '¿Qué deseas eliminar?';
            if (options) options.style.display = '';
            if (optFav) optFav.style.display = hasFav ? '' : 'none';
            if (optWs) optWs.style.display = hasWs ? '' : 'none';
            if (wsLabel && hasWs) wsLabel.textContent = `Quitar estado "${getWatchStatus(id)}"`;
            _removeSelFav = hasFav;
            _removeSelWs = hasWs;
            const chkFav = document.getElementById('remove-chk-fav');
            const chkWs = document.getElementById('remove-chk-ws');
            if (chkFav) chkFav.classList.toggle('checked', _removeSelFav);
            if (chkWs) chkWs.classList.toggle('checked', _removeSelWs);
            if (acceptBtn) acceptBtn.textContent = 'Eliminar';
            _updateRemoveAcceptBtn();
        }

        const o = document.getElementById('remove-confirm-overlay');
        o.classList.add('open');
        o.setAttribute('aria-hidden', 'false');
    }

    function closeRemoveConfirm() {
        const o = document.getElementById('remove-confirm-overlay');
        o.classList.remove('open');
        o.setAttribute('aria-hidden', 'true');
        _removeTargetId = null;
        _removeSelFav = false;
        _removeSelWs = false;
    }

    document.addEventListener('click', e => {
        const heroBtn = e.target.closest('[data-hero-nav]');
        if (heroBtn) { navigateTo(heroBtn.dataset.heroNav); return; }

        const navBtn = e.target.closest('.nav-btn');
        if (navBtn) { navigateTo(navBtn.dataset.nav); return; }

        const seeAll = e.target.closest('.see-all');
        if (seeAll) {
            navigateTo(seeAll.dataset.nav);
            return;
        }

        const mylistBtn = e.target.closest('[data-mylist]');
        if (mylistBtn) {
            e.stopPropagation();
            openMyListModal(+mylistBtn.dataset.mylist);
            return;
        }

        const favBtn = e.target.closest('[data-fav]');
        if (favBtn) {
            e.stopPropagation();
            const id = +favBtn.dataset.fav;
            toggleFav(id);
            const active = isFav(id);
            favBtn.classList.toggle('active', active);
            favBtn.querySelector('svg').setAttribute('fill', active ? 'currentColor' : 'none');
            if (state.view === 'favorites') renderFavorites();
            renderProfile();
            return;
        }

        const removeBtn = e.target.closest('[data-remove]');
        if (removeBtn) {
            e.stopPropagation();
            openRemoveConfirm(+removeBtn.dataset.remove);
            return;
        }

        const ctaBtn = e.target.closest('[data-cta]');
        if (ctaBtn) {
            e.stopPropagation();
            const id = +ctaBtn.dataset.cta;
            openDetail(id);
            return;
        }

        const card = e.target.closest('.card, .slider-card, .mini-card, .recent-card, .scard');
        if (card && card.dataset.id) {
            const id = +card.dataset.id;
            openDetail(id);
            return;
        }

        const catCard = e.target.closest('.cat-card');
        if (catCard && catCard.dataset.cat) {
            state.catFilter = catCard.dataset.cat;
            renderCatLibrary(state.catFilter);
            navigateTo('cat-library');
            return;
        }

        const chip = e.target.closest('[data-chip]');
        if (chip) {
            state.catFilter = chip.dataset.chip || null;
            document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.chip === (chip.dataset.chip)));
            renderSearch($('search-input').value, state.catFilter);
            return;
        }

        const favChip = e.target.closest('[data-fav-filter]');
        if (favChip) {
            state.favFilter = favChip.dataset.favFilter || 'all';
            document.querySelectorAll('[data-fav-filter]').forEach(c => c.classList.toggle('active', c.dataset.favFilter === favChip.dataset.favFilter));
            renderFavorites();
            return;
        }

        const wsBtn = e.target.closest('[data-ws]');
        if (wsBtn) {
            e.stopPropagation();
            const id = +wsBtn.dataset.wsItem;
            const newStatus = wsBtn.dataset.ws;
            const current = getWatchStatus(id);
            setWatchStatus(id, current === newStatus ? null : newStatus);
            renderFavorites();
            renderProfile();
            return;
        }

        const dot = e.target.closest('[data-dot]');
        if (dot) {
            const idx = +dot.dataset.dot;
            const track = $('slider-track');
            if (track._sliderGoTo) track._sliderGoTo(idx);
            return;
        }

        const tag = e.target.closest('.tag');
        if (tag && !tag.classList.contains('tag-show-more')) {
            const q = tag.textContent.trim();
            const input = $('search-input');
            const clear = $('search-clear');
            if (input) input.value = q;
            if (clear) clear.classList.add('visible');
            state.catFilter = null;
            renderSearch(q, null);
            renderFilterChips();
            navigateTo('search');
            return;
        }
    });

    function init() {
        buildSearchCache(); // Construir caché de búsqueda

        function handleWelcomeClose() {
            const cb = $('welcome-dont-show-cb');
            if (cb && cb.checked) {
                localStorage.setItem('wolfanime_welcome_seen_v1', '1');
            } else {
                localStorage.removeItem('wolfanime_welcome_seen_v1');
            }
            closeModal('welcome-modal-overlay');
        }

        if (!localStorage.getItem('wolfanime_welcome_seen_v1')) {
            openModal('welcome-modal-overlay');
        }

        const btnWelcomeStart = $('welcome-start-btn');
        if (btnWelcomeStart) {
            btnWelcomeStart.addEventListener('click', handleWelcomeClose);
        }

        const btnWelcomeProjects = $('welcome-projects-btn');
        if (btnWelcomeProjects) {
            btnWelcomeProjects.addEventListener('click', () => {
                handleWelcomeClose();
                openModal('projects-modal-overlay');
            });
        }

        const btnWelcomeClose = $('welcome-close-btn');
        if (btnWelcomeClose) {
            btnWelcomeClose.addEventListener('click', handleWelcomeClose);
        }

        const btnProjectsBack = $('projects-back-btn');
        if (btnProjectsBack) {
            btnProjectsBack.addEventListener('click', () => {
                closeModal('projects-modal-overlay');
                openModal('welcome-modal-overlay');
            });
        }

        const overlayProjects = $('projects-modal-overlay');
        if (overlayProjects) {
            overlayProjects.addEventListener('click', e => {
                if (e.target.id === 'projects-modal-overlay') closeModal('projects-modal-overlay');
            });
        }

        const overlayWelcome = $('welcome-modal-overlay');
        if (overlayWelcome) {
            overlayWelcome.addEventListener('click', e => {
                if (e.target.id === 'welcome-modal-overlay') {
                    handleWelcomeClose();
                }
            });
        }

        renderFilterChips();
        renderHome();
        renderSearch();
        renderCategories();
        renderFavorites();
        renderProfile();
        renderSearchHistory();

        if (!handleURLParams()) {
            navigateTo('home');
        }

        document.getElementById('cat-library-back').addEventListener('click', () => navigateTo('genres', true));
        document.getElementById('all-library-back').addEventListener('click', () => navigateTo(state.prev || 'home', true));

        const historyBtn = $('search-history-btn');
        if (historyBtn) {
            historyBtn.addEventListener('click', () => {
                navigateTo('search-history');
            });
        }

        // ── Buscador ──
        const searchInputEl = $('search-input');
        const searchClearEl = $('search-clear');

        if (searchInputEl && searchClearEl) {
            searchInputEl.setAttribute('type', 'text');
            searchInputEl.addEventListener('search', (e) => e.preventDefault());

            searchInputEl.addEventListener('input', debounce(e => {
                const q = e.target.value;
                searchClearEl.classList.toggle('visible', q.length > 0);

                if (q.length > 0 && state.catFilter) {
                    state.catFilter = null;
                    renderFilterChips();
                }

                renderSearch(q, state.catFilter);
                if (state.view === 'search-history') navigateTo('search');
                if (state.view === 'search') {
                    updateURL({ view: 'search', q: q, cat: state.catFilter });
                }
            }, 300));

            searchInputEl.addEventListener('blur', () => {
                const q = searchInputEl.value.trim();
                if (q.length >= 2) addToSearchHistory(q);
            });

            searchInputEl.addEventListener('focus', () => {
                if (!searchInputEl.value.trim()) renderSearchHistory();
            });

            searchClearEl.addEventListener('click', () => {
                searchInputEl.value = '';
                searchClearEl.classList.remove('visible');
                renderSearch('', state.catFilter);
                renderSearchHistory();
                if (state.view === 'search') {
                    updateURL({ view: 'search', q: '', cat: state.catFilter });
                }
                searchInputEl.focus();
            });
        }

        const clearHistoryDedicated = $('search-history-clear-dedicated');
        if (clearHistoryDedicated) {
            clearHistoryDedicated.addEventListener('click', () => {
                if (searchHistory.length === 0) return;
                openHistoryClearModal();
            });
        }

        const hClearCancel = $('history-clear-cancel');
        if (hClearCancel) hClearCancel.addEventListener('click', closeHistoryClearModal);

        const hClearConfirm = $('history-clear-confirm');
        if (hClearConfirm) hClearConfirm.addEventListener('click', clearSearchHistory);

        const hClearOverlay = $('history-clear-confirm-overlay');
        if (hClearOverlay) {
            hClearOverlay.addEventListener('click', (e) => {
                if (e.target === hClearOverlay) closeHistoryClearModal();
            });
        }

        const hSingleCancel = $('history-single-cancel');
        if (hSingleCancel) hSingleCancel.addEventListener('click', closeSingleHistoryDeleteModal);

        const hSingleConfirm = $('history-single-confirm');
        if (hSingleConfirm) {
            hSingleConfirm.addEventListener('click', () => {
                if (_pendingHistoryDeleteQuery) {
                    removeFromSearchHistory(_pendingHistoryDeleteQuery);
                    closeSingleHistoryDeleteModal();
                }
            });
        }

        const hSingleOverlay = $('history-single-confirm-overlay');
        if (hSingleOverlay) {
            hSingleOverlay.addEventListener('click', (e) => {
                if (e.target === hSingleOverlay) closeSingleHistoryDeleteModal();
            });
        }

        function applyHToggle() {
            saveHEnabled();
            renderProfile();
            renderCategories();
            renderFilterChips();
            renderHome();
            renderSearch($('search-input').value, state.catFilter);
            renderFavorites();
            if (!hCatEnabled && state.view === 'cat-library' && state.catFilter === '+18') {
                navigateTo('categories', true);
            }
            if (state.view === 'all-library') renderAllLibrary();
        }

        document.getElementById('h-toggle-item').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            if (hCatEnabled) {
                hCatEnabled = false;
                applyHToggle();
            } else {
                const o = $('h-confirm-overlay');
                o.classList.add('open');
                o.setAttribute('aria-hidden', 'false');
            }

            return false;
        });

        document.getElementById('h-confirm-accept').addEventListener('click', () => {
            hCatEnabled = true;
            const o = $('h-confirm-overlay');
            o.classList.remove('open');
            o.setAttribute('aria-hidden', 'true');
            applyHToggle();
        });

        document.getElementById('h-confirm-cancel').addEventListener('click', () => {
            const o = $('h-confirm-overlay');
            o.classList.remove('open');
            o.setAttribute('aria-hidden', 'true');
        });

        const autoplayToggle = document.getElementById('autoplay-toggle-item');
        if (autoplayToggle) {
            autoplayToggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                const actionText = autoplayEnabled ? 'Desactivar' : 'Activar';
                const descText = autoplayEnabled 
                    ? 'Si desactivas esta opción, el siguiente episodio no se reproducirá automáticamente al terminar el actual.'
                    : 'Si activas esta opción, el siguiente episodio se reproducirá automáticamente sin pausas al finalizar el actual.';
                
                const actionSpan = document.getElementById('autoplay-modal-action-text');
                const descP = document.getElementById('autoplay-modal-desc-text');
                if (actionSpan) actionSpan.textContent = actionText;
                if (descP) descP.textContent = descText;
                
                const o = document.getElementById('autoplay-confirm-overlay');
                if (o) {
                    o.classList.add('open');
                    o.setAttribute('aria-hidden', 'false');
                }
            });
        }

        const apAcceptBtn = document.getElementById('autoplay-confirm-accept');
        if (apAcceptBtn) {
            apAcceptBtn.addEventListener('click', () => {
                autoplayEnabled = !autoplayEnabled;
                saveAutoplayEnabled();
                renderProfile();
                showToast(autoplayEnabled ? 'Autoplay activado' : 'Autoplay desactivado');
                const o = document.getElementById('autoplay-confirm-overlay');
                if (o) {
                    o.classList.remove('open');
                    o.setAttribute('aria-hidden', 'true');
                }
            });
        }

        const apCancelBtn = document.getElementById('autoplay-confirm-cancel');
        if (apCancelBtn) {
            apCancelBtn.addEventListener('click', () => {
                const o = document.getElementById('autoplay-confirm-overlay');
                if (o) {
                    o.classList.remove('open');
                    o.setAttribute('aria-hidden', 'true');
                }
            });
        }

        const apOverlay = document.getElementById('autoplay-confirm-overlay');
        if (apOverlay) {
            apOverlay.addEventListener('click', (e) => {
                if (e.target === apOverlay) {
                    apOverlay.classList.remove('open');
                    apOverlay.setAttribute('aria-hidden', 'true');
                }
            });
        }

        $('h-confirm-overlay').addEventListener('click', e => {
            if (e.target === $('h-confirm-overlay')) {
                $('h-confirm-overlay').classList.remove('open');
                $('h-confirm-overlay').setAttribute('aria-hidden', 'true');
            }
        });

        $('remove-confirm-cancel').addEventListener('click', closeRemoveConfirm);
        $('remove-confirm-overlay').addEventListener('click', e => {
            if (e.target === $('remove-confirm-overlay')) closeRemoveConfirm();
        });

        document.getElementById('remove-opt-fav').addEventListener('click', () => {
            _removeSelFav = !_removeSelFav;
            document.getElementById('remove-chk-fav').classList.toggle('checked', _removeSelFav);
            _updateRemoveAcceptBtn();
        });
        document.getElementById('remove-opt-ws').addEventListener('click', () => {
            _removeSelWs = !_removeSelWs;
            document.getElementById('remove-chk-ws').classList.toggle('checked', _removeSelWs);
            _updateRemoveAcceptBtn();
        });

        $('remove-confirm-accept').addEventListener('click', () => {
            if (_removeTargetId === null) return;
            if (_removeSelFav) {
                favs = favs.filter(f => f !== _removeTargetId);
                saveFavs();
            }
            if (_removeSelWs) {
                delete watchStatus[_removeTargetId];
                saveWatchStatus();
            }
            closeRemoveConfirm();
            renderFavorites();
            renderProfile();
        });

        let hTaps = 0, hTimer;
        const catTitle = document.getElementById('cat-page-title');
        if (catTitle) {
            catTitle.addEventListener('click', () => {
                hTaps++;
                clearTimeout(hTimer);
                hTimer = setTimeout(() => { hTaps = 0; }, 1500);
                if (hTaps >= 5) {
                    hTaps = 0;
                    hCatEnabled = !hCatEnabled;
                    applyHToggle();
                }
            });
        }



        const langSelect = document.getElementById('preferred-lang-select');
        if (langSelect) {
            langSelect.addEventListener('change', (e) => {
                localStorage.setItem('blaze_preferred_lang', e.target.value);
            });
        }

        const clearFavsBtn = $('clear-favs-btn');
        if (clearFavsBtn) clearFavsBtn.addEventListener('click', clearFavorites);

        const clearWatchedBtn = $('clear-watched-btn');
        if (clearWatchedBtn) clearWatchedBtn.addEventListener('click', clearWatchHistory);

        const exportDataBtn = $('export-data-btn');
        if (exportDataBtn) exportDataBtn.addEventListener('click', exportUserData);

        const importDataBtn = $('import-data-btn');
        if (importDataBtn) importDataBtn.addEventListener('click', importUserData);

        const bkCreateBtn = $('backup-create-btn');
        if (bkCreateBtn) bkCreateBtn.addEventListener('click', generateTextBackup);

        const bkRestoreBtn = $('backup-restore-btn');
        if (bkRestoreBtn) bkRestoreBtn.addEventListener('click', () => openModal('restore-text-overlay'));

        const bkCloseBtn = $('backup-close-btn');
        if (bkCloseBtn) bkCloseBtn.addEventListener('click', () => closeModal('backup-text-overlay'));

        const rsCloseBtn = $('restore-close-btn');
        if (rsCloseBtn) rsCloseBtn.addEventListener('click', () => closeModal('restore-text-overlay'));

        const bkCopyBtn = $('backup-copy-btn');
        if (bkCopyBtn) {
            bkCopyBtn.addEventListener('click', () => {
                const area = $('backup-text-area');
                if (area) {
                    area.select();
                    document.execCommand('copy');
                    showToast('Copiado al portapapeles');
                }
            });
        }

        const rsSubmitBtn = $('restore-submit-btn');
        if (rsSubmitBtn) rsSubmitBtn.addEventListener('click', restoreFromTextBackup);

        const catGrid = $('cat-grid');
        if (catGrid) {
            catGrid.addEventListener('click', (e) => {
                const card = e.target.closest('.cat-card');
                if (card) {
                    const cat = card.dataset.cat;
                    navigateTo("cat-library", { cat });
                }
            });
        }

        const helpBtn = $("help-backup-btn");
        if (helpBtn) helpBtn.addEventListener("click", () => navigateTo("settings-help"));

        // CW Delete
        const cwDeleteCancel = $('cw-delete-cancel');
        if (cwDeleteCancel) cwDeleteCancel.addEventListener('click', () => closeModal('cw-delete-confirm-overlay'));

        const cwDeleteConfirm = $('cw-delete-confirm');
        if (cwDeleteConfirm) {
            cwDeleteConfirm.addEventListener('click', () => {
                if (_pendingCWDeleteId) {
                    console.log('CW: Deleting metadata for', _pendingCWDeleteId);
                    localStorage.removeItem('cw_meta_' + _pendingCWDeleteId);
                    // Also check for legacy resume keys
                    const allKeys = Object.keys(localStorage);
                    allKeys.forEach(k => {
                        if (k.startsWith('resume_' + _pendingCWDeleteId + '_')) {
                            localStorage.removeItem(k);
                        }
                    });
                    closeModal('cw-delete-confirm-overlay');
                    renderContinueWatching();
                    showToast('Eliminado de Continuar Viendo');
                }
            });
        }

        const cwDeleteOverlay = $('cw-delete-confirm-overlay');
        if (cwDeleteOverlay) {
            cwDeleteOverlay.addEventListener('click', (e) => {
                if (e.target === cwDeleteOverlay) closeModal('cw-delete-confirm-overlay');
            });
        }

        ["backup-text-overlay", "restore-text-overlay", "h-confirm-overlay"].forEach(id => {

            const o = $(id);
            if (o) o.addEventListener("click", e => { if (e.target === o) closeModal(id); });
        });

        window.addEventListener('storage', (e) => {
            if (!e.key) {
                // localStorage.clear()
                favs = [];
                watchStatus = {};
                renderContinueWatching();
                renderFavorites();
            } else if (e.key.startsWith('cw_') || e.key.startsWith('resume_') || e.key.startsWith('watched_')) {
                renderContinueWatching(true); // Actualización en tiempo real sin reiniciar el carrusel
            } else if (e.key === FAVS_KEY) {
                favs = JSON.parse(e.newValue || '[]');
                renderFavorites();
            } else if (e.key === WATCH_STATUS_KEY) {
                watchStatus = JSON.parse(e.newValue || '{}');
                renderFavorites();
            }
        });

        setTimeout(observeImages, 300);

        // Restaurar la vista de detalle al regresar de una entrada
        const lastDetailId = sessionStorage.getItem('wolfblaze_last_detail');
        if (lastDetailId) {
            sessionStorage.removeItem('wolfblaze_last_detail');
            openDetail(+lastDetailId);
        }
    }

    init();
})();
