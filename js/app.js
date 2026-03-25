// === 냉장고 셰프 — Static Site Version ===

let ALL_RECIPES = [];
let ALL_CHANNELS = [];
let QUICK_DATA = {};
let INGREDIENT_INDEX = []; // unique ingredient names for autocomplete
const ingredients = new Set();
let allResults = [];
let currentPage = 1;
let matchMode = 'or';
let showFavoritesOnly = false;

const THUMB_PREFIX = 'https://recipe1.ezmember.co.kr/cache/recipe/2024/';
const URL_PREFIX = 'https://www.10000recipe.com/recipe/';
const COUPANG_SEARCH = ''; // 쿠팡 파트너스 링크 (비워두면 일반 쿠팡 검색)

function getPageSize() {
    const w = window.innerWidth;
    if (w >= 760) return 9;
    if (w >= 500) return 10;
    return 5;
}

window.addEventListener('resize', () => {
    if (allResults.length > 0) {
        const max = Math.ceil(allResults.length / getPageSize());
        if (currentPage > max) currentPage = max;
        renderResults();
    }
});

// === Favorites (localStorage) ===

function getFavorites() {
    try { return JSON.parse(localStorage.getItem('fridge_chef_favs') || '{}'); } catch { return {}; }
}
function saveFavorites(favs) { localStorage.setItem('fridge_chef_favs', JSON.stringify(favs)); }
function toggleFavorite(recipe) {
    const favs = getFavorites();
    const key = recipe.sid || recipe.u;
    if (favs[key]) { delete favs[key]; }
    else {
        favs[key] = {
            t: recipe.t, i: recipe.i, u: recipe.u, img: recipe.img || '',
            sv: recipe.sv || '', ct: recipe.ct || '', df: recipe.df || '',
            st: recipe.st || '', sid: recipe.sid || '', saved_at: Date.now(),
        };
    }
    saveFavorites(favs);
    return !!favs[key];
}
function isFavorite(recipe) { return !!getFavorites()[recipe.sid || recipe.u]; }
function getFavoriteCount() { return Object.keys(getFavorites()).length; }
function getFavoritesList() {
    return Object.values(getFavorites()).sort((a, b) => (b.saved_at || 0) - (a.saved_at || 0));
}
function updateFavBadge() {
    const c = getFavoriteCount();
    const el = document.getElementById('favCount');
    if (el) el.textContent = c > 0 ? c : '';
}

// === Load Data ===

async function init() {
    const prog = document.getElementById('loadProgress');
    try {
        prog.textContent = '데이터 다운로드 중...';
        const [recipesRes, channelsRes, quickRes] = await Promise.all([
            fetch('recipes.json'),
            fetch('channels.json'),
            fetch('quick_ingredients.json'),
        ]);
        prog.textContent = '레시피 파싱 중...';
        ALL_RECIPES = await recipesRes.json();
        ALL_CHANNELS = await channelsRes.json();
        QUICK_DATA = await quickRes.json();

        document.getElementById('recipeCount').textContent = ALL_RECIPES.length.toLocaleString();
        document.getElementById('loading').style.display = 'none';
        document.getElementById('searchSection').style.display = 'block';
        document.getElementById('emptyState').style.display = 'block';

        buildIngredientIndex();
        renderQuickButtons();
        renderChannels();
        updateFavBadge();
        updateShoppingBadge();
        renderShoppingList();
    } catch (e) {
        document.getElementById('loading').innerHTML =
            `<div class="empty-icon">😥</div><p>데이터 로딩 실패: ${e.message}</p>`;
    }
}

// === Custom Quick Ingredients (localStorage) ===

function getCustomQuick() {
    try { return JSON.parse(localStorage.getItem('fridge_chef_custom_quick') || '{"ingredients":[],"sauces":[]}'); }
    catch { return { ingredients: [], sauces: [] }; }
}
function saveCustomQuick(data) { localStorage.setItem('fridge_chef_custom_quick', JSON.stringify(data)); }
function getRemovedQuick() {
    try { return JSON.parse(localStorage.getItem('fridge_chef_removed_quick') || '[]'); }
    catch { return []; }
}
function saveRemovedQuick(arr) { localStorage.setItem('fridge_chef_removed_quick', JSON.stringify(arr)); }

// === Quick Buttons ===

let editingQuick = false;

function renderQuickButtons() {
    const ingList = Array.isArray(QUICK_DATA) ? QUICK_DATA : (QUICK_DATA.ingredients || []);
    const sauceList = QUICK_DATA.sauces || [];
    const custom = getCustomQuick();
    const removed = getRemovedQuick();

    // Merge: default (minus removed) + custom
    const finalIng = ingList.filter(i => !removed.includes(i.name)).concat(custom.ingredients);
    const finalSauce = sauceList.filter(i => !removed.includes(i.name)).concat(custom.sauces);

    const ingContainer = document.getElementById('quickButtons');
    ingContainer.innerHTML = finalIng.map(item =>
        `<button class="quick-btn${editingQuick ? ' editing' : ''}" data-ing="${item.name}">${item.emoji} ${item.name}<span class="quick-del" data-name="${item.name}">&times;</span></button>`
    ).join('');

    const sauceContainer = document.getElementById('quickSauceButtons');
    sauceContainer.innerHTML = finalSauce.map(item =>
        `<button class="quick-btn quick-btn--sauce${editingQuick ? ' editing' : ''}" data-ing="${item.name}">${item.emoji} ${item.name}<span class="quick-del" data-name="${item.name}">&times;</span></button>`
    ).join('');

    // Bind click handlers
    document.querySelectorAll('.quick-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (e.target.classList.contains('quick-del')) return;
            const ing = btn.dataset.ing;
            if (ingredients.has(ing)) removeIngredient(ing);
            else addIngredient(ing);
        });
    });

    // Bind delete handlers
    document.querySelectorAll('.quick-del').forEach(del => {
        del.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const name = del.dataset.name;

            // Remove from custom if it's custom, otherwise add to removed list
            const custom = getCustomQuick();
            let wasCustom = false;
            for (const section of ['ingredients', 'sauces']) {
                const idx = custom[section].findIndex(i => i.name === name);
                if (idx !== -1) {
                    custom[section].splice(idx, 1);
                    saveCustomQuick(custom);
                    wasCustom = true;
                    break;
                }
            }
            if (!wasCustom) {
                const removed = getRemovedQuick();
                if (!removed.includes(name)) {
                    removed.push(name);
                    saveRemovedQuick(removed);
                }
            }

            ingredients.delete(name);
            renderQuickButtons();
            render();
        });
    });
}

// === Autocomplete Index ===

function buildIngredientIndex() {
    const counter = {};
    for (const r of ALL_RECIPES) {
        for (let item of r.i.split(',')) {
            item = item.trim();
            if (!item || item.length > 10 || item.length < 2) continue;
            let name = item.replace(/\s+[\d./½⅓¼⅔¾~].*$/, '').replace(/\s*\(.*?\)/, '').trim();
            if (name.length < 2 || name.length > 8) continue;
            if (/^[\d./\s]+$/.test(name)) continue;
            counter[name] = (counter[name] || 0) + 1;
        }
    }
    INGREDIENT_INDEX = Object.entries(counter)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 500)
        .map(e => e[0]);
}

let acHighlight = -1;

function showAutocomplete(query) {
    const list = document.getElementById('autocompleteList');
    if (!query || query.length < 1) { list.style.display = 'none'; return; }
    const q = query.toLowerCase();
    const matches = INGREDIENT_INDEX
        .filter(name => name.includes(q) && !ingredients.has(name))
        .slice(0, 8);
    if (matches.length === 0) { list.style.display = 'none'; return; }
    acHighlight = -1;
    list.innerHTML = matches.map((name, i) => {
        const hl = name.replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>');
        return `<div class="autocomplete-item" data-name="${name}" data-idx="${i}">${hl}</div>`;
    }).join('');
    list.style.display = 'block';
    list.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
            addIngredient(item.dataset.name);
            document.getElementById('ingredientInput').value = '';
            list.style.display = 'none';
        });
    });
}

function navigateAutocomplete(dir) {
    const items = document.getElementById('autocompleteList').querySelectorAll('.autocomplete-item');
    if (items.length === 0) return;
    items.forEach(i => i.classList.remove('highlighted'));
    acHighlight += dir;
    if (acHighlight < 0) acHighlight = items.length - 1;
    if (acHighlight >= items.length) acHighlight = 0;
    items[acHighlight].classList.add('highlighted');
}

function selectAutocomplete() {
    const items = document.getElementById('autocompleteList').querySelectorAll('.autocomplete-item');
    if (acHighlight >= 0 && acHighlight < items.length) {
        addIngredient(items[acHighlight].dataset.name);
        document.getElementById('ingredientInput').value = '';
        document.getElementById('autocompleteList').style.display = 'none';
        return true;
    }
    return false;
}

// === Shopping List (localStorage) ===

function getShoppingList() {
    try { return JSON.parse(localStorage.getItem('fridge_chef_shopping') || '[]'); } catch { return []; }
}
function saveShoppingList(list) { localStorage.setItem('fridge_chef_shopping', JSON.stringify(list)); }

function addToShoppingList(recipe) {
    const list = getShoppingList();
    for (let item of recipe.i.split(',')) {
        item = item.trim();
        if (!item || item.length < 2) continue;
        if (list.some(s => s.name === item)) continue;
        list.push({ name: item, checked: false });
    }
    saveShoppingList(list);
    updateShoppingBadge();
    renderShoppingList();
}

function updateShoppingBadge() {
    const count = getShoppingList().filter(i => !i.checked).length;
    const el = document.getElementById('shoppingCount');
    if (el) el.textContent = count > 0 ? count : '';
}

function openShoppingSidebar() {
    document.getElementById('shoppingSidebar')?.classList.add('open');
    document.getElementById('shoppingOverlay')?.classList.add('open');
}
function closeShoppingSidebar() {
    document.getElementById('shoppingSidebar')?.classList.remove('open');
    document.getElementById('shoppingOverlay')?.classList.remove('open');
}

function renderShoppingList() {
    const list = getShoppingList();
    const container = document.getElementById('shoppingItems');
    const empty = document.getElementById('shoppingEmpty');
    if (!container) return;
    if (list.length === 0) {
        container.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }
    if (empty) empty.style.display = 'none';
    const sorted = [...list].sort((a, b) => (a.checked ? 1 : 0) - (b.checked ? 1 : 0));
    container.innerHTML = sorted.map(item => {
        const cls = item.checked ? ' checked' : '';
        return `<div class="shop-row${cls}" data-name="${esc(item.name)}">
            <input type="checkbox" class="shop-check" ${item.checked ? 'checked' : ''}>
            <span class="shop-name">${esc(item.name)}</span>
            <button class="shop-del" data-name="${esc(item.name)}">&times;</button>
        </div>`;
    }).join('');
    container.querySelectorAll('.shop-check').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const name = e.target.closest('.shop-row').dataset.name;
            const l = getShoppingList();
            const it = l.find(i => i.name === name);
            if (it) it.checked = e.target.checked;
            saveShoppingList(l);
            updateShoppingBadge();
            renderShoppingList();
        });
    });
    container.querySelectorAll('.shop-del').forEach(del => {
        del.addEventListener('click', () => {
            const l = getShoppingList().filter(i => i.name !== del.dataset.name);
            saveShoppingList(l);
            updateShoppingBadge();
            renderShoppingList();
        });
    });
}

// === Channels ===

function renderChannels() {
    document.getElementById('channelsGrid').innerHTML = ALL_CHANNELS.map(ch => `
        <a class="channel-card" href="${ch.url}" target="_blank" rel="noopener">
            <span class="channel-emoji">${ch.emoji}</span>
            <div class="channel-info">
                <div class="channel-name">${esc(ch.name)}</div>
                <div class="channel-desc">${esc(ch.desc)}</div>
            </div>
        </a>`).join('');
}

// === Ingredient Tags ===

const tagsEl = () => document.getElementById('tags');
const searchBtn = () => document.getElementById('searchBtn');

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
    tagsEl().innerHTML = '';
    ingredients.forEach(name => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.innerHTML = `${name}<span class="tag-remove" data-name="${name}">&times;</span>`;
        tagsEl().appendChild(span);
    });
    document.querySelectorAll('.quick-btn').forEach(btn => {
        btn.classList.toggle('active', ingredients.has(btn.dataset.ing));
    });
    searchBtn().disabled = ingredients.size === 0;
}

// === Events (deferred until DOM ready) ===

document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.tag-input-area')?.addEventListener('click', () =>
        document.getElementById('ingredientInput').focus()
    );

    document.getElementById('ingredientInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); navigateAutocomplete(1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); navigateAutocomplete(-1); return; }
        if (e.key === 'Enter') {
            e.preventDefault();
            if (!selectAutocomplete()) {
                e.target.value.split(/[,，\s]+/).filter(Boolean).forEach(addIngredient);
            }
            e.target.value = '';
            document.getElementById('autocompleteList').style.display = 'none';
        }
        if (e.key === 'Escape') {
            document.getElementById('autocompleteList').style.display = 'none';
        }
        if (e.key === 'Backspace' && !e.target.value && ingredients.size > 0) {
            removeIngredient([...ingredients].pop());
        }
    });

    document.getElementById('ingredientInput')?.addEventListener('input', (e) => {
        showAutocomplete(e.target.value.trim());
    });

    // Close autocomplete on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.tag-input-area')) {
            document.getElementById('autocompleteList').style.display = 'none';
        }
    });

    document.getElementById('tags')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('tag-remove')) removeIngredient(e.target.dataset.name);
    });

    // Match mode toggle
    document.querySelectorAll('.match-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.match-opt').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            matchMode = btn.dataset.mode;
        });
    });

    // Edit quick toggle
    const editToggle = document.getElementById('editQuickToggle');
    const addForm = document.getElementById('addQuickForm');
    if (editToggle) {
        editToggle.addEventListener('click', () => {
            editingQuick = !editingQuick;
            editToggle.textContent = editingQuick ? '✅ 완료' : '✏️ 편집';
            if (addForm) addForm.style.display = editingQuick ? 'flex' : 'none';
            document.querySelectorAll('.quick-btn').forEach(btn => {
                btn.classList.toggle('editing', editingQuick);
            });
        });
    }

    // Emoji dropdown
    let selectedEmoji = '🍴';
    const emojiToggle = document.getElementById('emojiToggle');
    const emojiList = document.getElementById('emojiList');
    if (emojiToggle) {
        emojiToggle.addEventListener('click', () => {
            emojiList.style.display = emojiList.style.display === 'none' ? 'grid' : 'none';
        });
    }
    document.querySelectorAll('.emoji-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedEmoji = btn.dataset.emoji;
            if (emojiToggle) emojiToggle.textContent = selectedEmoji;
            if (emojiList) emojiList.style.display = 'none';
        });
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.emoji-dropdown') && emojiList) emojiList.style.display = 'none';
    });

    // Add quick ingredient
    const addQuickBtn = document.getElementById('addQuickBtn');
    if (addQuickBtn) {
        addQuickBtn.addEventListener('click', () => {
            const nameEl = document.getElementById('qIngName');
            const sectionEl = document.getElementById('qIngSection');
            const name = nameEl.value.trim();
            if (!name) { alert('재료 이름을 입력해주세요'); return; }

            const section = sectionEl.value; // 'ingredients' or 'sauces'
            const custom = getCustomQuick();

            // Check duplicates
            const allNames = [
                ...(QUICK_DATA.ingredients || []),
                ...(QUICK_DATA.sauces || []),
                ...custom.ingredients,
                ...custom.sauces,
            ].map(i => i.name);
            if (allNames.includes(name)) { alert('이미 등록된 재료입니다'); return; }

            custom[section].push({ name, emoji: selectedEmoji });
            saveCustomQuick(custom);

            // Remove from removed list if it was there
            const removed = getRemovedQuick();
            const idx = removed.indexOf(name);
            if (idx !== -1) { removed.splice(idx, 1); saveRemovedQuick(removed); }

            nameEl.value = '';
            renderQuickButtons();
        });
    }

    document.getElementById('searchBtn')?.addEventListener('click', doSearch);

    // Pagination
    document.getElementById('pagination')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.page-btn');
        if (!btn) return;
        currentPage = parseInt(btn.dataset.page);
        renderResults();
        document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Favorite button click (delegated)
    document.getElementById('recipeCards')?.addEventListener('click', (e) => {
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

        if (showFavoritesOnly && !isNowFav) renderResults();
    });

    // Favorites filter
    document.getElementById('favFilterBtn')?.addEventListener('click', () => {
        showFavoritesOnly = !showFavoritesOnly;
        document.getElementById('favFilterBtn').classList.toggle('active', showFavoritesOnly);
        currentPage = 1;
        if (showFavoritesOnly) {
            document.getElementById('results').style.display = 'block';
            document.getElementById('emptyState').style.display = 'none';
            renderResults();
        } else if (allResults.length > 0) {
            renderResults();
        } else {
            document.getElementById('results').style.display = 'none';
            document.getElementById('emptyState').style.display = 'block';
        }
    });

    // Shopping sidebar toggle
    document.getElementById('shoppingToggleBtn')?.addEventListener('click', () => {
        const sidebar = document.getElementById('shoppingSidebar');
        if (sidebar.classList.contains('open')) closeShoppingSidebar();
        else openShoppingSidebar();
    });
    document.getElementById('closeSidebar')?.addEventListener('click', closeShoppingSidebar);
    document.getElementById('shoppingOverlay')?.addEventListener('click', closeShoppingSidebar);

    // Copy shopping list
    document.getElementById('copyShoppingBtn')?.addEventListener('click', () => {
        const list = getShoppingList().filter(i => !i.checked);
        if (list.length === 0) { alert('장보기 목록이 비어있어요'); return; }
        const text = '🛒 장보기 목록\n' + list.map(i => `☐ ${i.name}`).join('\n');
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById('copyShoppingBtn');
            btn.textContent = '✅ 복사됨!';
            setTimeout(() => { btn.textContent = '📋 복사'; }, 1500);
        }).catch(() => alert('복사 실패'));
    });

    // Clear shopping list
    document.getElementById('clearShoppingBtn')?.addEventListener('click', () => {
        if (!confirm('장보기 목록을 비울까요?')) return;
        saveShoppingList([]);
        updateShoppingBadge();
        renderShoppingList();
    });

    // Cart button click (delegated on recipeCards)
    document.getElementById('recipeCards')?.addEventListener('click', (e) => {
        const cartBtn = e.target.closest('.cart-btn');
        if (!cartBtn) return;
        e.preventDefault();
        e.stopPropagation();

        const idx = parseInt(cartBtn.dataset.idx);
        const pageSize = getPageSize();
        const start = (currentPage - 1) * pageSize;
        const displayResults = showFavoritesOnly ? getFavoritesList() : allResults;
        const recipe = displayResults[start + idx];
        if (!recipe) return;

        addToShoppingList(recipe);
        cartBtn.classList.add('cart-added');
        cartBtn.textContent = '✓';
        openShoppingSidebar();
    });

    init();
});

// === Search (client-side) ===

function doSearch() {
    if (ingredients.size === 0) return;
    const ingList = [...ingredients];
    document.getElementById('emptyState').style.display = 'none';

    const scored = [];
    const minMatch = matchMode === 'and' ? ingList.length : 1;

    for (const r of ALL_RECIPES) {
        let matchCount = 0;
        for (const ing of ingList) {
            if (r.i.includes(ing)) matchCount++;
        }
        if (matchCount >= minMatch) {
            scored.push({ ...r, match_count: matchCount, total_searched: ingList.length });
        }
    }

    scored.sort((a, b) => b.match_count - a.match_count);
    allResults = scored.slice(0, 100);
    currentPage = 1;
    renderResults(ingList);
}

// === Render Results ===

function resolveUrl(r) {
    if (r.sid && r.sid.startsWith('10000recipe_')) return URL_PREFIX + r.u;
    return r.u;
}

function resolveThumb(r) {
    if (!r.img) return '';
    if (r.img.startsWith('http')) return r.img;
    return THUMB_PREFIX + r.img;
}

function renderResults(query) {
    const displayResults = showFavoritesOnly ? getFavoritesList() : allResults;
    const pageSize = getPageSize();
    const totalPages = Math.ceil(displayResults.length / pageSize);
    const start = (currentPage - 1) * pageSize;
    const pageResults = displayResults.slice(start, start + pageSize);

    const resultsTitle = document.getElementById('resultsTitle');
    const youtubeLink = document.getElementById('youtubeLink');
    const recipeCards = document.getElementById('recipeCards');
    const pagination = document.getElementById('pagination');

    if (showFavoritesOnly) {
        resultsTitle.textContent = displayResults.length > 0
            ? `⭐ 즐겨찾기 ${displayResults.length}개` : '⭐ 즐겨찾기';
        youtubeLink.innerHTML = '';
    } else {
        resultsTitle.textContent = displayResults.length > 0
            ? `📋 ${displayResults.length}개의 레시피를 찾았어요` : '📋 검색 결과';
        const ytQuery = (query || [...ingredients]).join(' ') + ' 레시피';
        youtubeLink.innerHTML = `<a href="https://www.youtube.com/results?search_query=${encodeURIComponent(ytQuery)}" target="_blank">▶ 유튜브에서 레시피 보기</a>`;
    }

    if (displayResults.length === 0) {
        const msg = showFavoritesOnly
            ? '아직 즐겨찾기한 레시피가 없어요. ⭐를 눌러 추가해보세요!'
            : '매칭되는 레시피가 없어요. 다른 재료를 넣어보세요!';
        recipeCards.innerHTML = `<div class="no-results" style="grid-column:1/-1"><div class="no-results-icon">🤔</div><p>${msg}</p></div>`;
        pagination.innerHTML = '';
    } else {
        recipeCards.innerHTML = pageResults.map((r, i) => {
            const matchPct = r.total_searched ? Math.round((r.match_count / r.total_searched) * 100) : 0;
            const matchClass = matchPct >= 80 ? 'match-high' : matchPct >= 40 ? 'match-mid' : 'match-low';
            const showMatch = r.total_searched ? `<span class="card-match ${matchClass}">${matchPct}% 일치</span>` : '';
            const url = resolveUrl(r);
            const thumb = resolveThumb(r);
            const thumbHtml = thumb
                ? `<img class="card-thumb" src="${thumb}" alt="${esc(r.t)}" loading="lazy" onerror="this.style.display='none'">`
                : `<div class="card-thumb" style="display:flex;align-items:center;justify-content:center;font-size:2rem;color:var(--text-muted)">🍽️</div>`;

            const meta = [];
            if (r.ct) meta.push(`⏱ ${r.ct}`);
            if (r.df) meta.push(`👨‍🍳 ${r.df}`);
            if (r.sv) meta.push(`🍽 ${r.sv}`);
            const sourceLabel = r.st ? `<span class="card-source">${r.st}</span>` : '';
            const favActive = isFavorite(r) ? ' fav-active' : '';
            const favStar = isFavorite(r) ? '★' : '☆';

            return `
                <div class="recipe-card-wrap">
                    <a class="recipe-card" href="${url}" target="_blank" rel="noopener">
                        ${thumbHtml}
                        <div class="card-body">
                            <div class="card-title">${esc(r.t)}</div>
                            <div class="card-meta">
                                ${showMatch}${sourceLabel}
                                ${meta.map(m => `<span class="card-badge">${m}</span>`).join('')}
                            </div>
                            <div class="card-ingredients">${esc(r.i)}</div>
                        </div>
                    </a>
                    <button class="cart-btn" data-idx="${i}" title="장보기 목록에 담기">🛒</button>
                    <button class="fav-btn${favActive}" data-idx="${i}" title="즐겨찾기">${favStar}</button>
                </div>`;
        }).join('');

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

    document.getElementById('results').style.display = 'block';
    if (currentPage === 1) {
        document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}
