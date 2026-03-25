// === 냉장고 셰프 — Frontend ===

const ingredients = new Set();
let allResults = [];
let currentPage = 1;
let showFavoritesOnly = false;

// === Favorites (localStorage) ===

function getFavorites() {
    try { return JSON.parse(localStorage.getItem('fridge_chef_favs') || '{}'); }
    catch { return {}; }
}

function saveFavorites(favs) {
    localStorage.setItem('fridge_chef_favs', JSON.stringify(favs));
}

function toggleFavorite(recipe) {
    const favs = getFavorites();
    const key = recipe.source_id || recipe.source_url;
    if (favs[key]) {
        delete favs[key];
    } else {
        favs[key] = {
            id: recipe.id,
            source_id: recipe.source_id,
            title: recipe.title,
            ingredients: recipe.ingredients,
            thumbnail_url: recipe.thumbnail_url,
            source_url: recipe.source_url,
            servings: recipe.servings,
            cook_time: recipe.cook_time,
            difficulty: recipe.difficulty,
            source_type: recipe.source_type,
            tags: recipe.tags,
            saved_at: Date.now(),
        };
    }
    saveFavorites(favs);
    return !!favs[key];
}

function isFavorite(recipe) {
    const favs = getFavorites();
    const key = recipe.source_id || recipe.source_url;
    return !!favs[key];
}

function getFavoriteCount() {
    return Object.keys(getFavorites()).length;
}

function getFavoritesList() {
    const favs = getFavorites();
    return Object.values(favs).sort((a, b) => (b.saved_at || 0) - (a.saved_at || 0));
}

function getPageSize() {
    const width = window.innerWidth;
    if (width >= 760) return 9;   // 3열 × 3줄
    if (width >= 500) return 10;  // 2열 × 5줄
    return 5;                     // 1열 × 5줄
}

// Recalculate on resize
window.addEventListener('resize', () => {
    if (allResults.length > 0) {
        const newSize = getPageSize();
        const maxPage = Math.ceil(allResults.length / newSize);
        if (currentPage > maxPage) currentPage = maxPage;
        renderResults();
    }
});

const input = document.getElementById('ingredientInput');
const tagsEl = document.getElementById('tags');
const searchBtn = document.getElementById('searchBtn');
const btnText = searchBtn.querySelector('.search-btn-text');
const btnLoading = searchBtn.querySelector('.search-btn-loading');
const resultsSection = document.getElementById('results');
const resultsTitle = document.getElementById('resultsTitle');
const youtubeLink = document.getElementById('youtubeLink');
const recipeCards = document.getElementById('recipeCards');
const pagination = document.getElementById('pagination');
const emptyState = document.getElementById('emptyState');
const crawlBtn = document.getElementById('crawlBtn');
const crawlStatus = document.getElementById('crawlStatus');
const crawlText = document.getElementById('crawlText');

// === Ingredient Tags ===

function addIngredient(name) {
    name = name.trim();
    if (!name || ingredients.has(name)) return;
    ingredients.add(name);
    render();
}

function removeIngredient(name) {
    ingredients.delete(name);
    render();
}

function render() {
    tagsEl.innerHTML = '';
    ingredients.forEach(name => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.innerHTML = `${name}<span class="tag-remove" data-name="${name}">&times;</span>`;
        tagsEl.appendChild(span);
    });
    document.querySelectorAll('.quick-btn').forEach(btn => {
        btn.classList.toggle('active', ingredients.has(btn.dataset.ing));
    });
    searchBtn.disabled = ingredients.size === 0;
}

// === Events ===

document.querySelector('.tag-input-area').addEventListener('click', () => input.focus());

input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        input.value.split(/[,，\s]+/).filter(Boolean).forEach(addIngredient);
        input.value = '';
    }
    if (e.key === 'Backspace' && !input.value && ingredients.size > 0) {
        removeIngredient([...ingredients].pop());
    }
});

tagsEl.addEventListener('click', (e) => {
    if (e.target.classList.contains('tag-remove')) removeIngredient(e.target.dataset.name);
});

// Quick buttons — handled by quickBtnHandler below

// === Quick Ingredient Editing ===

const editQuickToggle = document.getElementById('editQuickToggle');
const addQuickForm = document.getElementById('addQuickForm');
const addQuickBtn = document.getElementById('addQuickBtn');
const quickButtonsContainer = document.getElementById('quickButtons');
let editingQuick = false;

editQuickToggle.addEventListener('click', () => {
    editingQuick = !editingQuick;
    editQuickToggle.textContent = editingQuick ? '✅ 완료' : '✏️ 편집';
    addQuickForm.style.display = editingQuick ? 'flex' : 'none';
    quickButtonsContainer.querySelectorAll('.quick-btn').forEach(btn => {
        btn.classList.toggle('editing', editingQuick);
    });
    if (quickSauceContainer) {
        quickSauceContainer.querySelectorAll('.quick-btn').forEach(btn => {
            btn.classList.toggle('editing', editingQuick);
        });
    }
});

// Emoji dropdown
let selectedEmoji = '🍴';
const emojiToggle = document.getElementById('emojiToggle');
const emojiList = document.getElementById('emojiList');

emojiToggle.addEventListener('click', () => {
    emojiList.style.display = emojiList.style.display === 'none' ? 'grid' : 'none';
});

document.querySelectorAll('.emoji-opt').forEach(btn => {
    btn.addEventListener('click', () => {
        selectedEmoji = btn.dataset.emoji;
        emojiToggle.textContent = selectedEmoji;
        emojiList.style.display = 'none';
    });
});

// Close emoji list on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('.emoji-dropdown')) emojiList.style.display = 'none';
});

// Add quick ingredient
addQuickBtn.addEventListener('click', async () => {
    const name = document.getElementById('qIngName').value.trim();
    if (!name) { alert('재료 이름을 입력해주세요'); return; }

    try {
        const res = await fetch('/api/quick-ingredients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, emoji: selectedEmoji })
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error); return; }

        const btn = document.createElement('button');
        btn.className = 'quick-btn' + (editingQuick ? ' editing' : '');
        btn.dataset.ing = name;
        btn.innerHTML = `${selectedEmoji} ${name}<span class="quick-del" data-name="${name}">&times;</span>`;
        btn.addEventListener('click', quickBtnHandler);
        quickButtonsContainer.appendChild(btn);

        document.getElementById('qIngName').value = '';
    } catch { alert('추가 실패'); }
});

// Delete quick ingredient
quickButtonsContainer.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('quick-del')) return;
    e.preventDefault();
    e.stopPropagation();

    const name = e.target.dataset.name;
    try {
        const res = await fetch(`/api/quick-ingredients/${encodeURIComponent(name)}`, { method: 'DELETE' });
        if (res.ok) {
            const btn = e.target.closest('.quick-btn');
            if (btn) btn.remove();
            ingredients.delete(name);
            render();
        }
    } catch { alert('삭제 실패'); }
});

function quickBtnHandler(e) {
    if (e.target.classList.contains('quick-del')) return;
    const ing = this.dataset.ing;
    if (ingredients.has(ing)) removeIngredient(ing);
    else addIngredient(ing);
}

quickButtonsContainer.querySelectorAll('.quick-btn').forEach(btn => {
    const name = btn.dataset.ing;
    if (!btn.querySelector('.quick-del')) {
        const del = document.createElement('span');
        del.className = 'quick-del';
        del.dataset.name = name;
        del.innerHTML = '&times;';
        btn.appendChild(del);
    }
    btn.addEventListener('click', quickBtnHandler);
});

// Sauce quick buttons — same click behavior
const quickSauceContainer = document.getElementById('quickSauceButtons');
if (quickSauceContainer) {
    quickSauceContainer.querySelectorAll('.quick-btn').forEach(btn => {
        const name = btn.dataset.ing;
        if (!btn.querySelector('.quick-del')) {
            const del = document.createElement('span');
            del.className = 'quick-del';
            del.dataset.name = name;
            del.innerHTML = '&times;';
            btn.appendChild(del);
        }
        btn.addEventListener('click', quickBtnHandler);
    });

    // Delete sauce quick ingredient
    quickSauceContainer.addEventListener('click', async (e) => {
        if (!e.target.classList.contains('quick-del')) return;
        e.preventDefault();
        e.stopPropagation();

        const name = e.target.dataset.name;
        try {
            const res = await fetch(`/api/quick-ingredients/${encodeURIComponent(name)}`, { method: 'DELETE' });
            if (res.ok) {
                const btn = e.target.closest('.quick-btn');
                if (btn) btn.remove();
                ingredients.delete(name);
                render();
            }
        } catch { alert('삭제 실패'); }
    });
}

// === Match Mode Toggle ===

document.querySelectorAll('.match-opt').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.match-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        matchMode = btn.dataset.mode;
    });
});

// === Search ===

searchBtn.addEventListener('click', doSearch);

async function doSearch() {
    if (ingredients.size === 0) return;

    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';
    searchBtn.disabled = true;
    emptyState.style.display = 'none';

    try {
        const res = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ingredients: [...ingredients], match_mode: matchMode })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '검색 실패');

        allResults = data.results;
        currentPage = 1;
        renderResults(data.query);
    } catch (err) {
        recipeCards.innerHTML = `<div class="no-results"><div class="no-results-icon">😥</div><p>${err.message}</p></div>`;
        pagination.innerHTML = '';
        resultsSection.style.display = 'block';
    } finally {
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
        searchBtn.disabled = ingredients.size === 0;
    }
}

function renderResults(query) {
    const displayResults = showFavoritesOnly ? getFavoritesList() : allResults;
    const pageSize = getPageSize();
    const totalPages = Math.ceil(displayResults.length / pageSize);
    const start = (currentPage - 1) * pageSize;
    const pageResults = displayResults.slice(start, start + pageSize);

    if (showFavoritesOnly) {
        resultsTitle.textContent = displayResults.length > 0
            ? `⭐ 즐겨찾기 ${displayResults.length}개`
            : '⭐ 즐겨찾기';
        youtubeLink.innerHTML = '';
    } else {
        resultsTitle.textContent = displayResults.length > 0
            ? `📋 ${displayResults.length}개의 레시피를 찾았어요`
            : '📋 검색 결과';

        const ytQuery = (query || [...ingredients]).join(' ') + ' 레시피';
        youtubeLink.innerHTML = `<a href="https://www.youtube.com/results?search_query=${encodeURIComponent(ytQuery)}" target="_blank">▶ 유튜브에서 레시피 보기</a>`;
    }

    if (displayResults.length === 0) {
        const emptyMsg = showFavoritesOnly
            ? '아직 즐겨찾기한 레시피가 없어요. ⭐를 눌러 추가해보세요!'
            : '매칭되는 레시피가 없어요. 다른 재료를 넣어보세요!';
        recipeCards.innerHTML = `<div class="no-results" style="grid-column:1/-1"><div class="no-results-icon">🤔</div><p>${emptyMsg}</p></div>`;
        pagination.innerHTML = '';
    } else {
        recipeCards.innerHTML = pageResults.map(r => {
            const matchPct = r.total_searched ? Math.round((r.match_count / r.total_searched) * 100) : 0;
            const matchClass = matchPct >= 80 ? 'match-high' : matchPct >= 40 ? 'match-mid' : 'match-low';
            const showMatch = r.total_searched ? `<span class="card-match ${matchClass}">${matchPct}% 일치</span>` : '';
            const thumb = r.thumbnail_url || '';
            const thumbHtml = thumb
                ? `<img class="card-thumb" src="${thumb}" alt="${esc(r.title)}" loading="lazy" onerror="this.style.display='none'">`
                : `<div class="card-thumb" style="display:flex;align-items:center;justify-content:center;font-size:2rem;color:var(--text-muted)">🍽️</div>`;

            const meta = [];
            if (r.cook_time) meta.push(`⏱ ${r.cook_time}`);
            if (r.difficulty) meta.push(`👨‍🍳 ${r.difficulty}`);
            if (r.servings) meta.push(`🍽 ${r.servings}`);

            const sourceLabel = r.source_type && r.source_type !== '만개의레시피' ? `<span class="card-source">${r.source_type}</span>` : '';
            const favActive = isFavorite(r) ? ' fav-active' : '';
            const favStar = isFavorite(r) ? '★' : '☆';
            const rKey = esc(r.source_id || r.source_url);

            return `
                <div class="recipe-card-wrap">
                    <a class="recipe-card" href="${r.source_url}" target="_blank" rel="noopener">
                        ${thumbHtml}
                        <div class="card-body">
                            <div class="card-title">${esc(r.title)}</div>
                            <div class="card-meta">
                                ${showMatch}
                                ${sourceLabel}
                                ${meta.map(m => `<span class="card-badge">${m}</span>`).join('')}
                            </div>
                            <div class="card-ingredients">${esc(r.ingredients)}</div>
                        </div>
                    </a>
                    <button class="fav-btn${favActive}" data-idx="${pageResults.indexOf(r)}" title="즐겨찾기">${favStar}</button>
                </div>`;
        }).join('');

        // Pagination
        if (totalPages > 1) {
            let html = '';
            if (currentPage > 1) html += `<button class="page-btn nav" data-page="${currentPage - 1}">◀</button>`;
            for (let p = 1; p <= totalPages; p++) {
                html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
            }
            if (currentPage < totalPages) html += `<button class="page-btn nav" data-page="${currentPage + 1}">▶</button>`;
            pagination.innerHTML = html;
        } else {
            pagination.innerHTML = '';
        }
    }

    resultsSection.style.display = 'block';
    if (currentPage === 1) {
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Pagination click
document.getElementById('pagination').addEventListener('click', (e) => {
    const btn = e.target.closest('.page-btn');
    if (!btn) return;
    currentPage = parseInt(btn.dataset.page);
    renderResults();
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// Favorite button click (delegated)
recipeCards.addEventListener('click', (e) => {
    const favBtn = e.target.closest('.fav-btn');
    if (!favBtn) return;
    e.preventDefault();
    e.stopPropagation();

    const idx = parseInt(favBtn.dataset.idx);
    const pageSize = getPageSize();
    const start = (currentPage - 1) * pageSize;
    const displayResults = showFavoritesOnly ? getFavoritesList() : allResults;
    const recipe = displayResults[start + idx];
    if (!recipe) return;

    const isNowFav = toggleFavorite(recipe);
    favBtn.classList.toggle('fav-active', isNowFav);
    favBtn.textContent = isNowFav ? '★' : '☆';
    updateFavBadge();

    // If viewing favorites only and unfavorited, re-render
    if (showFavoritesOnly && !isNowFav) {
        renderResults();
    }
});

// Favorites filter button
const favFilterBtn = document.getElementById('favFilterBtn');
if (favFilterBtn) {
    favFilterBtn.addEventListener('click', () => {
        showFavoritesOnly = !showFavoritesOnly;
        favFilterBtn.classList.toggle('active', showFavoritesOnly);
        currentPage = 1;

        if (showFavoritesOnly) {
            resultsSection.style.display = 'block';
            emptyState.style.display = 'none';
            renderResults();
        } else if (allResults.length > 0) {
            renderResults();
        } else {
            resultsSection.style.display = 'none';
            emptyState.style.display = 'block';
        }
    });
}

function updateFavBadge() {
    const count = getFavoriteCount();
    const badge = document.getElementById('favCount');
    if (badge) badge.textContent = count > 0 ? count : '';
}
updateFavBadge();

// === Crawl Button ===

crawlBtn.addEventListener('click', async () => {
    if (crawlBtn.disabled) return;
    crawlBtn.disabled = true;
    crawlStatus.style.display = 'block';
    crawlText.textContent = '크롤링 시작 중...';

    try {
        await fetch('/api/crawl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        pollCrawlStatus();
    } catch {
        crawlText.textContent = '크롤링 시작 실패';
        crawlBtn.disabled = false;
    }
});

async function pollCrawlStatus() {
    try {
        const res = await fetch('/api/crawl/status');
        const data = await res.json();
        crawlText.textContent = `${data.progress} (총 ${data.total_recipes}개)`;

        if (data.running) {
            setTimeout(pollCrawlStatus, 3000);
        } else {
            crawlBtn.disabled = false;
            if (data.stats) {
                crawlText.textContent = `✅ 완료! 새 레시피 ${data.stats.new}개 추가 (총 ${data.total_recipes}개)`;
                setTimeout(() => { crawlStatus.style.display = 'none'; }, 8000);
                setTimeout(() => location.reload(), 10000);
            }
        }
    } catch {
        crawlBtn.disabled = false;
    }
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// === Channel Management ===

const addChannelToggle = document.getElementById('addChannelToggle');
const addChannelForm = document.getElementById('addChannelForm');
const addChannelBtn = document.getElementById('addChannelBtn');
const channelsGrid = document.getElementById('channelsGrid');

// Render channels from data
function renderChannels() {
    channelsGrid.innerHTML = ALL_CHANNELS.map(ch => `
        <div class="channel-card-wrap" data-id="${ch.id}">
            <a class="channel-card" href="${ch.url}" target="_blank" rel="noopener">
                <span class="channel-emoji">${ch.emoji}</span>
                <div class="channel-info">
                    <div class="channel-name">${esc(ch.name)}</div>
                    <div class="channel-desc">${esc(ch.desc)}</div>
                </div>
            </a>
            <button class="channel-delete" data-id="${ch.id}" title="삭제">&times;</button>
        </div>`).join('');
}
renderChannels();

addChannelToggle.addEventListener('click', () => {
    const visible = addChannelForm.style.display !== 'none';
    addChannelForm.style.display = visible ? 'none' : 'flex';
    addChannelToggle.textContent = visible ? '+ 추가' : '취소';
});

addChannelBtn.addEventListener('click', async () => {
    const name = document.getElementById('chName').value.trim();
    const url = document.getElementById('chUrl').value.trim();
    const desc = document.getElementById('chDesc').value.trim();

    if (!name || !url) { alert('이름과 URL을 입력해주세요'); return; }

    try {
        const res = await fetch('/api/channels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, url, desc })
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error); return; }

        ALL_CHANNELS.push(data.channel);
        renderChannels();
        document.getElementById('chName').value = '';
        document.getElementById('chUrl').value = '';
        document.getElementById('chDesc').value = '';
        addChannelForm.style.display = 'none';
        addChannelToggle.textContent = '+ 추가';
    } catch { alert('추가 실패'); }
});

channelsGrid.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('channel-delete')) return;
    e.preventDefault();
    e.stopPropagation();

    const id = e.target.dataset.id;
    if (!confirm('이 채널을 삭제할까요?')) return;

    try {
        const res = await fetch(`/api/channels/${id}`, { method: 'DELETE' });
        if (res.ok) {
            const idx = ALL_CHANNELS.findIndex(ch => ch.id === id);
            if (idx !== -1) ALL_CHANNELS.splice(idx, 1);
            renderChannels();
        }
    } catch { alert('삭제 실패'); }
});
