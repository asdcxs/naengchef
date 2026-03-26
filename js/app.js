// === 냉장고 셰프 — Static Site Version ===

let ALL_RECIPES = [];
let ALL_CHANNELS = [];
let QUICK_DATA = {};
let INGREDIENT_INDEX = [];
const ingredients = new Set();
const excludeIngredients = new Set();
let allResults = [];
let currentPage = 1;
let matchMode = 'or';
let showFavoritesOnly = false;

const THUMB_PREFIX = 'https://recipe1.ezmember.co.kr/cache/recipe/2024/';
const URL_PREFIX = 'https://www.10000recipe.com/recipe/';
const COUPANG_SEARCH = '';

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

// === Favorites ===
function getFavorites() { try { return JSON.parse(localStorage.getItem('fridge_chef_favs') || '{}'); } catch { return {}; } }
function saveFavorites(f) { localStorage.setItem('fridge_chef_favs', JSON.stringify(f)); }
function toggleFavorite(r) {
    const f = getFavorites(), k = r.sid || r.u;
    if (f[k]) delete f[k];
    else f[k] = { t:r.t, i:r.i, u:r.u, img:r.img||'', sv:r.sv||'', ct:r.ct||'', df:r.df||'', st:r.st||'', sid:r.sid||'', saved_at:Date.now() };
    saveFavorites(f); return !!f[k];
}
function isFavorite(r) { return !!getFavorites()[r.sid || r.u]; }
function getFavoriteCount() { return Object.keys(getFavorites()).length; }
function getFavoritesList() { return Object.values(getFavorites()).sort((a,b) => (b.saved_at||0) - (a.saved_at||0)); }
function updateFavBadge() { const c = getFavoriteCount(), el = document.getElementById('favCount'); if (el) el.textContent = c > 0 ? c : ''; }

// === Recent Searches (localStorage) ===
function getRecentSearches() { try { return JSON.parse(localStorage.getItem('fridge_chef_recent') || '[]'); } catch { return []; } }
function saveRecentSearch(ingList) {
    const key = [...ingList].sort().join(',');
    let recent = getRecentSearches();
    recent = recent.filter(r => r.key !== key);
    recent.unshift({ key, ingredients: [...ingList], timestamp: Date.now() });
    if (recent.length > 8) recent = recent.slice(0, 8);
    localStorage.setItem('fridge_chef_recent', JSON.stringify(recent));
    renderRecentSearches();
}
function renderRecentSearches() {
    const container = document.getElementById('recentSearches');
    if (!container) return;
    const recent = getRecentSearches();
    if (recent.length === 0) { container.style.display = 'none'; return; }
    container.style.display = 'block';
    container.innerHTML = `<div class="recent-header"><span class="recent-label">🕐 최근 검색</span><button class="recent-clear">지우기</button></div><div class="recent-tags">${
        recent.map((r,i) => `<button class="recent-tag" data-idx="${i}" data-ings='${JSON.stringify(r.ingredients)}'>${r.ingredients.join(' + ')}<span class="recent-del" data-idx="${i}">&times;</span></button>`).join('')
    }</div>`;
    container.querySelectorAll('.recent-tag').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (e.target.classList.contains('recent-del')) return;
            ingredients.clear();
            JSON.parse(btn.dataset.ings).forEach(i => ingredients.add(i));
            render();
            doSearch();
        });
    });
    container.querySelectorAll('.recent-del').forEach(del => {
        del.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(del.dataset.idx);
            const r = getRecentSearches();
            r.splice(idx, 1);
            localStorage.setItem('fridge_chef_recent', JSON.stringify(r));
            renderRecentSearches();
        });
    });
    container.querySelector('.recent-clear')?.addEventListener('click', () => {
        localStorage.removeItem('fridge_chef_recent');
        renderRecentSearches();
    });
}

// === Load Data ===
async function init() {
    const prog = document.getElementById('loadProgress');
    try {
        prog.textContent = '데이터 다운로드 중...';
        const [recipesRes, channelsRes, quickRes] = await Promise.all([
            fetch('recipes.json'), fetch('channels.json'), fetch('quick_ingredients.json'),
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
        renderRecentSearches();
        loadExcludes();
        updateFavBadge();
        updateShoppingBadge();
        renderShoppingList();

        // Register service worker for PWA
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        }
    } catch (e) {
        document.getElementById('loading').innerHTML = `<div class="empty-icon">😥</div><p>데이터 로딩 실패: ${e.message}</p>`;
    }
}

// === Custom Quick Ingredients ===
function getCustomQuick() { try { return JSON.parse(localStorage.getItem('fridge_chef_custom_quick') || '{"ingredients":[],"sauces":[]}'); } catch { return {ingredients:[],sauces:[]}; } }
function saveCustomQuick(d) { localStorage.setItem('fridge_chef_custom_quick', JSON.stringify(d)); }
function getRemovedQuick() { try { return JSON.parse(localStorage.getItem('fridge_chef_removed_quick') || '[]'); } catch { return []; } }
function saveRemovedQuick(a) { localStorage.setItem('fridge_chef_removed_quick', JSON.stringify(a)); }

// === Quick Buttons ===
let editingQuick = false;
function renderQuickButtons() {
    const ingList = Array.isArray(QUICK_DATA) ? QUICK_DATA : (QUICK_DATA.ingredients || []);
    const sauceList = QUICK_DATA.sauces || [];
    const custom = getCustomQuick(), removed = getRemovedQuick();
    const finalIng = ingList.filter(i => !removed.includes(i.name)).concat(custom.ingredients);
    const finalSauce = sauceList.filter(i => !removed.includes(i.name)).concat(custom.sauces);
    const ic = document.getElementById('quickButtons');
    ic.innerHTML = finalIng.map(item => `<button class="quick-btn${editingQuick?' editing':''}" data-ing="${item.name}">${item.emoji} ${item.name}<span class="quick-del" data-name="${item.name}">&times;</span></button>`).join('');
    const sc = document.getElementById('quickSauceButtons');
    sc.innerHTML = finalSauce.map(item => `<button class="quick-btn quick-btn--sauce${editingQuick?' editing':''}" data-ing="${item.name}">${item.emoji} ${item.name}<span class="quick-del" data-name="${item.name}">&times;</span></button>`).join('');
    document.querySelectorAll('.quick-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { if (e.target.classList.contains('quick-del')) return; const ing = btn.dataset.ing; if (ingredients.has(ing)) removeIngredient(ing); else addIngredient(ing); });
    });
    document.querySelectorAll('.quick-del').forEach(del => {
        del.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            const name = del.dataset.name, custom = getCustomQuick();
            let wasCustom = false;
            for (const sec of ['ingredients','sauces']) { const idx = custom[sec].findIndex(i => i.name === name); if (idx !== -1) { custom[sec].splice(idx,1); saveCustomQuick(custom); wasCustom = true; break; } }
            if (!wasCustom) { const rm = getRemovedQuick(); if (!rm.includes(name)) { rm.push(name); saveRemovedQuick(rm); } }
            ingredients.delete(name); renderQuickButtons(); render();
        });
    });
}

// === Autocomplete ===
function buildIngredientIndex() {
    const counter = {};
    for (const r of ALL_RECIPES) {
        for (let item of r.i.split(',')) {
            item = item.trim();
            if (!item || item.length > 10 || item.length < 2) continue;
            let name = item.replace(/\s+[\d./½⅓¼⅔¾~].*$/, '').replace(/\s*\(.*?\)/, '').trim();
            if (name.length < 2 || name.length > 8 || /^[\d./\s]+$/.test(name)) continue;
            const key = name.replace(/\s+/g, '');
            counter[key] = (counter[key] || 0) + 1;
        }
    }
    INGREDIENT_INDEX = Object.entries(counter).sort((a,b) => b[1]-a[1]).slice(0,500).map(e => e[0]);
}

let acHighlight = -1;
function showAutocomplete(query) {
    const list = document.getElementById('autocompleteList');
    if (!query || query.length < 1) { list.style.display = 'none'; return; }
    const q = query.toLowerCase();
    const matches = INGREDIENT_INDEX.filter(n => n.includes(q) && !ingredients.has(n)).slice(0,8);
    if (!matches.length) { list.style.display = 'none'; return; }
    acHighlight = -1;
    list.innerHTML = matches.map((name,i) => {
        const hl = name.replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'), '<mark>$1</mark>');
        return `<div class="autocomplete-item" data-name="${name}" data-idx="${i}">${hl}</div>`;
    }).join('');
    list.style.display = 'block';
    list.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => { addIngredient(item.dataset.name); document.getElementById('ingredientInput').value = ''; list.style.display = 'none'; });
    });
}
function navigateAutocomplete(dir) {
    const items = document.getElementById('autocompleteList').querySelectorAll('.autocomplete-item');
    if (!items.length) return;
    items.forEach(i => i.classList.remove('highlighted'));
    acHighlight += dir;
    if (acHighlight < 0) acHighlight = items.length - 1;
    if (acHighlight >= items.length) acHighlight = 0;
    items[acHighlight].classList.add('highlighted');
}
function selectAutocomplete() {
    const items = document.getElementById('autocompleteList').querySelectorAll('.autocomplete-item');
    if (acHighlight >= 0 && acHighlight < items.length) { addIngredient(items[acHighlight].dataset.name); document.getElementById('ingredientInput').value = ''; document.getElementById('autocompleteList').style.display = 'none'; return true; }
    return false;
}

// === Shopping List ===
function getShoppingList() { try { return JSON.parse(localStorage.getItem('fridge_chef_shopping') || '[]'); } catch { return []; } }
function saveShoppingList(l) { localStorage.setItem('fridge_chef_shopping', JSON.stringify(l)); }
function addToShoppingList(recipe) {
    const list = getShoppingList();
    for (let item of recipe.i.split(',')) { item = item.trim(); if (!item || item.length < 2) continue; if (list.some(s => s.name === item)) continue; list.push({name:item,checked:false}); }
    saveShoppingList(list); updateShoppingBadge(); renderShoppingList();
}
function updateShoppingBadge() { const c = getShoppingList().length, el = document.getElementById('shoppingCount'); if (el) el.textContent = c > 0 ? c : ''; }
function openShoppingSidebar() { document.getElementById('shoppingSidebar')?.classList.add('open'); document.getElementById('shoppingOverlay')?.classList.add('open'); }
function closeShoppingSidebar() { document.getElementById('shoppingSidebar')?.classList.remove('open'); document.getElementById('shoppingOverlay')?.classList.remove('open'); }
function renderShoppingList() {
    const list = getShoppingList(), container = document.getElementById('shoppingItems'), empty = document.getElementById('shoppingEmpty');
    if (!container) return;
    if (!list.length) { container.innerHTML = ''; if (empty) empty.style.display = 'block'; return; }
    if (empty) empty.style.display = 'none';
    container.innerHTML = `<div class="shop-summary">${list.length}개 재료</div>` +
        list.map(item => `<div class="shop-row" data-name="${esc(item.name)}"><span class="shop-name">${esc(item.name)}</span><button class="shop-done" data-name="${esc(item.name)}" title="구매 완료">✓ 완료</button></div>`).join('');
    container.querySelectorAll('.shop-done').forEach(btn => {
        btn.addEventListener('click', () => { const row = btn.closest('.shop-row'); row.classList.add('removing'); setTimeout(() => { const l = getShoppingList().filter(i => i.name !== btn.dataset.name); saveShoppingList(l); updateShoppingBadge(); renderShoppingList(); }, 150); });
    });
}

// === Exclude Ingredients ===
function addExclude(name) { name = name.trim(); if (!name || excludeIngredients.has(name)) return; excludeIngredients.add(name); renderExcludes(); }
function removeExclude(name) { excludeIngredients.delete(name); renderExcludes(); }
function renderExcludes() {
    const container = document.getElementById('excludeTags');
    if (!container) return;
    container.innerHTML = [...excludeIngredients].map(name =>
        `<span class="exclude-tag">🚫 ${esc(name)}<span class="ex-del" data-name="${name}">&times;</span></span>`
    ).join('');
    container.querySelectorAll('.ex-del').forEach(del => {
        del.addEventListener('click', () => removeExclude(del.dataset.name));
    });
    // Save to localStorage
    localStorage.setItem('fridge_chef_excludes', JSON.stringify([...excludeIngredients]));
}
function loadExcludes() {
    try { const saved = JSON.parse(localStorage.getItem('fridge_chef_excludes') || '[]'); saved.forEach(n => excludeIngredients.add(n)); renderExcludes(); } catch {}
}

// === Channels ===
function renderChannels() {
    document.getElementById('channelsGrid').innerHTML = ALL_CHANNELS.map(ch => `
        <a class="channel-card" href="${ch.url}" target="_blank" rel="noopener">
            <span class="channel-emoji">${ch.emoji}</span>
            <div class="channel-info"><div class="channel-name">${esc(ch.name)}</div><div class="channel-desc">${esc(ch.desc)}</div></div>
        </a>`).join('');
}

// === Ingredient Tags ===
const tagsEl = () => document.getElementById('tags');
const searchBtn = () => document.getElementById('searchBtn');
function addIngredient(name) { name = name.trim(); if (!name || ingredients.has(name)) return; ingredients.add(name); render(); }
function removeIngredient(name) { ingredients.delete(name); render(); }
function render() {
    tagsEl().innerHTML = '';
    ingredients.forEach(name => { const s = document.createElement('span'); s.className = 'tag'; s.innerHTML = `${name}<span class="tag-remove" data-name="${name}">&times;</span>`; tagsEl().appendChild(s); });
    document.querySelectorAll('.quick-btn').forEach(btn => btn.classList.toggle('active', ingredients.has(btn.dataset.ing)));
    const disabled = ingredients.size === 0;
    searchBtn().disabled = disabled;
    const ytBtn = document.getElementById('youtubeBtn');
    if (ytBtn) ytBtn.disabled = disabled;
}

// === Recipe Detail Modal ===
function showRecipeModal(recipe) {
    const url = resolveUrl(recipe);
    const thumb = resolveThumb(recipe);
    const ingList = recipe.i.split(',').map(s => s.trim()).filter(Boolean);
    const modal = document.getElementById('recipeModal');
    const content = document.getElementById('recipeModalContent');

    const meta = [];
    if (recipe.ct) meta.push(`⏱ ${recipe.ct}`);
    if (recipe.df) meta.push(`👨‍🍳 ${recipe.df}`);
    if (recipe.sv) meta.push(`🍽 ${recipe.sv}`);

    content.innerHTML = `
        ${thumb ? `<img class="modal-thumb" src="${thumb}" alt="${esc(recipe.t)}" onerror="this.style.display='none'">` : ''}
        <h3 class="modal-title">${esc(recipe.t)}</h3>
        ${meta.length ? `<div class="modal-meta">${meta.map(m => `<span class="card-badge">${m}</span>`).join('')}</div>` : ''}
        <div class="modal-section">
            <h4>📝 재료</h4>
            <ul class="modal-ingredients">${ingList.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
        </div>
        <div class="modal-actions">
            <a href="${url}" target="_blank" rel="noopener" class="modal-btn primary">📖 레시피 보기</a>
            <button class="modal-btn" id="modalCartBtn">🛒 장보기 담기</button>
            <button class="modal-btn" id="modalShareBtn">📤 공유</button>
        </div>`;
    modal.style.display = 'flex';
    document.getElementById('modalCartBtn').addEventListener('click', () => {
        addToShoppingList(recipe); openShoppingSidebar();
        document.getElementById('modalCartBtn').textContent = '✓ 담았어요';
    });
    document.getElementById('modalShareBtn').addEventListener('click', () => shareRecipe(recipe));
}
function closeRecipeModal() { document.getElementById('recipeModal').style.display = 'none'; }

// === Share ===
function shareRecipe(recipe) {
    const url = resolveUrl(recipe);
    const text = `🍳 ${recipe.t}\n재료: ${recipe.i.split(',').slice(0,5).join(', ')}...\n${url}`;

    if (navigator.share) {
        navigator.share({ title: recipe.t, text: text, url: url }).catch(() => {});
    } else {
        navigator.clipboard.writeText(text).then(() => alert('링크가 복사되었어요!')).catch(() => {});
    }
}

// === Events ===
document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.tag-input-area')?.addEventListener('click', () => document.getElementById('ingredientInput').focus());

    document.getElementById('ingredientInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); navigateAutocomplete(1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); navigateAutocomplete(-1); return; }
        if (e.key === 'Enter') { e.preventDefault(); if (!selectAutocomplete()) { e.target.value.split(/[,，\s]+/).filter(Boolean).forEach(addIngredient); } e.target.value = ''; document.getElementById('autocompleteList').style.display = 'none'; }
        if (e.key === 'Escape') document.getElementById('autocompleteList').style.display = 'none';
        if (e.key === 'Backspace' && !e.target.value && ingredients.size > 0) removeIngredient([...ingredients].pop());
    });
    document.getElementById('ingredientInput')?.addEventListener('input', (e) => showAutocomplete(e.target.value.trim()));
    document.addEventListener('click', (e) => { if (!e.target.closest('.tag-input-area')) document.getElementById('autocompleteList').style.display = 'none'; });
    document.getElementById('tags')?.addEventListener('click', (e) => { if (e.target.classList.contains('tag-remove')) removeIngredient(e.target.dataset.name); });

    // Match mode
    document.querySelectorAll('.match-opt').forEach(btn => { btn.addEventListener('click', () => { document.querySelectorAll('.match-opt').forEach(b => b.classList.remove('active')); btn.classList.add('active'); matchMode = btn.dataset.mode; }); });

    // Edit quick
    const editToggle = document.getElementById('editQuickToggle'), addForm = document.getElementById('addQuickForm');
    if (editToggle) { editToggle.addEventListener('click', () => { editingQuick = !editingQuick; editToggle.textContent = editingQuick ? '✅ 완료' : '✏️ 편집'; if (addForm) addForm.style.display = editingQuick ? 'flex' : 'none'; document.querySelectorAll('.quick-btn').forEach(btn => btn.classList.toggle('editing', editingQuick)); }); }

    // Emoji dropdown
    let selectedEmoji = '🍴';
    const emojiToggle = document.getElementById('emojiToggle'), emojiListEl = document.getElementById('emojiList');
    if (emojiToggle) emojiToggle.addEventListener('click', () => { emojiListEl.style.display = emojiListEl.style.display === 'none' ? 'grid' : 'none'; });
    document.querySelectorAll('.emoji-opt').forEach(btn => { btn.addEventListener('click', () => { selectedEmoji = btn.dataset.emoji; if (emojiToggle) emojiToggle.textContent = selectedEmoji; if (emojiListEl) emojiListEl.style.display = 'none'; }); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.emoji-dropdown') && emojiListEl) emojiListEl.style.display = 'none'; });

    // Add quick
    const addQuickBtn = document.getElementById('addQuickBtn');
    if (addQuickBtn) { addQuickBtn.addEventListener('click', () => {
        const nameEl = document.getElementById('qIngName'), sectionEl = document.getElementById('qIngSection'), name = nameEl.value.trim();
        if (!name) { alert('재료 이름을 입력해주세요'); return; }
        const section = sectionEl.value, custom = getCustomQuick();
        const allNames = [...(QUICK_DATA.ingredients||[]),...(QUICK_DATA.sauces||[]),...custom.ingredients,...custom.sauces].map(i => i.name);
        if (allNames.includes(name)) { alert('이미 등록된 재료입니다'); return; }
        custom[section].push({name, emoji:selectedEmoji}); saveCustomQuick(custom);
        const rm = getRemovedQuick(), idx = rm.indexOf(name); if (idx !== -1) { rm.splice(idx,1); saveRemovedQuick(rm); }
        nameEl.value = ''; renderQuickButtons();
    }); }

    document.getElementById('searchBtn')?.addEventListener('click', doSearch);
    document.getElementById('youtubeBtn')?.addEventListener('click', () => {
        if (ingredients.size === 0) return;
        const q = [...ingredients].join(' ') + ' 레시피';
        window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, '_blank');
    });

    // Exclude input
    document.getElementById('excludeInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.target.value.split(/[,，\s]+/).filter(Boolean).forEach(addExclude);
            e.target.value = '';
        }
    });

    // Pagination
    document.getElementById('pagination')?.addEventListener('click', (e) => { const btn = e.target.closest('.page-btn'); if (!btn) return; currentPage = parseInt(btn.dataset.page); renderResults(); document.getElementById('results').scrollIntoView({behavior:'smooth',block:'start'}); });

    // Sort select
    document.getElementById('sortSelect')?.addEventListener('change', (e) => {
        sortResults(e.target.value);
        currentPage = 1;
        renderResults();
    });

    // Favorite click
    document.getElementById('recipeCards')?.addEventListener('click', (e) => {
        const favBtn = e.target.closest('.fav-btn');
        if (favBtn) { e.preventDefault(); e.stopPropagation(); const idx = parseInt(favBtn.dataset.idx), ps = getPageSize(), start = (currentPage-1)*ps, dr = showFavoritesOnly ? getFavoritesList() : allResults, recipe = dr[start+idx]; if (!recipe) return; const isNow = toggleFavorite(recipe); favBtn.classList.toggle('fav-active', isNow); favBtn.textContent = isNow ? '★' : '☆'; updateFavBadge(); if (showFavoritesOnly && !isNow) renderResults(); return; }
        // Card click → modal (not the link)
        const card = e.target.closest('.recipe-card');
        if (card) { e.preventDefault(); const wrap = card.closest('.recipe-card-wrap'); const idx = parseInt(wrap.querySelector('.fav-btn')?.dataset.idx); const ps = getPageSize(), start = (currentPage-1)*ps, dr = showFavoritesOnly ? getFavoritesList() : allResults, recipe = dr[start+idx]; if (recipe) showRecipeModal(recipe); }
    });

    // Favorites filter
    document.getElementById('favFilterBtn')?.addEventListener('click', () => {
        showFavoritesOnly = !showFavoritesOnly;
        document.getElementById('favFilterBtn').classList.toggle('active', showFavoritesOnly);
        currentPage = 1;
        if (showFavoritesOnly) { document.getElementById('results').style.display = 'block'; document.getElementById('emptyState').style.display = 'none'; renderResults(); }
        else if (allResults.length > 0) renderResults();
        else { document.getElementById('results').style.display = 'none'; document.getElementById('emptyState').style.display = 'block'; }
    });

    // Shopping sidebar
    document.getElementById('shoppingToggleBtn')?.addEventListener('click', () => { const sb = document.getElementById('shoppingSidebar'); if (sb.classList.contains('open')) closeShoppingSidebar(); else openShoppingSidebar(); });
    document.getElementById('closeSidebar')?.addEventListener('click', closeShoppingSidebar);
    document.getElementById('shoppingOverlay')?.addEventListener('click', closeShoppingSidebar);
    document.getElementById('copyShoppingBtn')?.addEventListener('click', () => {
        const list = getShoppingList(); if (!list.length) { alert('장보기 목록이 비어있어요'); return; }
        const text = '🛒 장보기 목록\n' + list.map(i => `☐ ${i.name}`).join('\n');
        navigator.clipboard.writeText(text).then(() => { const btn = document.getElementById('copyShoppingBtn'); btn.textContent = '✅ 복사됨!'; setTimeout(() => btn.textContent = '📋 복사', 1500); }).catch(() => alert('복사 실패'));
    });
    document.getElementById('clearShoppingBtn')?.addEventListener('click', () => { if (!confirm('장보기 목록을 비울까요?')) return; saveShoppingList([]); updateShoppingBadge(); renderShoppingList(); });
    document.getElementById('recipeCards')?.addEventListener('click', (e) => {
        const cartBtn = e.target.closest('.cart-btn'); if (!cartBtn) return; e.preventDefault(); e.stopPropagation();
        const idx = parseInt(cartBtn.dataset.idx), ps = getPageSize(), start = (currentPage-1)*ps, dr = showFavoritesOnly ? getFavoritesList() : allResults, recipe = dr[start+idx]; if (!recipe) return;
        addToShoppingList(recipe); cartBtn.classList.add('cart-added'); cartBtn.textContent = '✓'; openShoppingSidebar();
    });

    // Modal close
    document.getElementById('recipeModal')?.addEventListener('click', (e) => { if (e.target === e.currentTarget || e.target.classList.contains('modal-close')) closeRecipeModal(); });

    init();
});

// === Search ===
function sortResults(mode) {
    switch(mode) {
        case 'popular':
            // 크롤링 순서상 id(index) 낮을수록 인기 → ALL_RECIPES에서의 원래 인덱스 기준
            allResults.sort((a,b) => {
                if (b.match_count !== a.match_count) return b.match_count - a.match_count;
                return ALL_RECIPES.indexOf(a) - ALL_RECIPES.indexOf(b);
            });
            break;
        case 'newest':
            allResults.sort((a,b) => {
                if (b.match_count !== a.match_count) return b.match_count - a.match_count;
                return ALL_RECIPES.indexOf(b) - ALL_RECIPES.indexOf(a);
            });
            break;
        case 'quick':
            allResults.sort((a,b) => {
                if (b.match_count !== a.match_count) return b.match_count - a.match_count;
                const timeA = parseTime(a.ct), timeB = parseTime(b.ct);
                return timeA - timeB;
            });
            break;
        default: // match
            allResults.sort((a,b) => b.match_count - a.match_count);
    }
}

function parseTime(str) {
    if (!str) return 999;
    const m = str.match(/(\d+)/);
    return m ? parseInt(m[1]) : 999;
}

function doSearch() {
    if (ingredients.size === 0) return;
    const ingList = [...ingredients];
    document.getElementById('emptyState').style.display = 'none';
    saveRecentSearch(ingList);

    const scored = [], minMatch = matchMode === 'and' ? ingList.length : 1;
    const exList = [...excludeIngredients];
    for (const r of ALL_RECIPES) {
        // 제외 재료가 포함되면 스킵
        if (exList.length && exList.some(ex => r.i.includes(ex))) continue;
        let mc = 0;
        for (const ing of ingList) if (r.i.includes(ing)) mc++;
        if (mc >= minMatch) scored.push({...r, match_count:mc, total_searched:ingList.length});
    }
    scored.sort((a,b) => b.match_count - a.match_count);
    allResults = scored.slice(0, 200);
    const sortSel = document.getElementById('sortSelect');
    if (sortSel && sortSel.value !== 'match') sortResults(sortSel.value);
    currentPage = 1;
    renderResults(ingList);
}

// === Render ===
function resolveUrl(r) { if (r.sid && r.sid.startsWith('10000recipe_')) return URL_PREFIX + r.u; return r.u; }
function resolveThumb(r) { if (!r.img) return ''; if (r.img.startsWith('http')) return r.img; return THUMB_PREFIX + r.img; }

function renderResults(query) {
    const displayResults = showFavoritesOnly ? getFavoritesList() : allResults;
    const pageSize = getPageSize(), totalPages = Math.ceil(displayResults.length / pageSize);
    const start = (currentPage - 1) * pageSize, pageResults = displayResults.slice(start, start + pageSize);
    const resultsTitle = document.getElementById('resultsTitle'), youtubeLink = document.getElementById('youtubeLink');
    const recipeCards = document.getElementById('recipeCards'), pagination = document.getElementById('pagination');

    if (showFavoritesOnly) { resultsTitle.textContent = displayResults.length > 0 ? `⭐ 즐겨찾기 ${displayResults.length}개` : '⭐ 즐겨찾기'; youtubeLink.innerHTML = ''; }
    else { resultsTitle.textContent = displayResults.length > 0 ? `📋 ${displayResults.length}개의 레시피를 찾았어요` : '📋 검색 결과'; const ytQ = (query || [...ingredients]).join(' ') + ' 레시피'; youtubeLink.innerHTML = `<a href="https://www.youtube.com/results?search_query=${encodeURIComponent(ytQ)}" target="_blank">▶ 유튜브에서 보기</a>`; }

    if (!displayResults.length) {
        const msg = showFavoritesOnly ? '아직 즐겨찾기한 레시피가 없어요. ⭐를 눌러 추가해보세요!' : '매칭되는 레시피가 없어요. 다른 재료를 넣어보세요!';
        recipeCards.innerHTML = `<div class="no-results" style="grid-column:1/-1"><div class="no-results-icon">🤔</div><p>${msg}</p></div>`;
        pagination.innerHTML = '';
    } else {
        recipeCards.innerHTML = pageResults.map((r, i) => {
            const matchPct = r.total_searched ? Math.round((r.match_count / r.total_searched) * 100) : 0;
            const matchClass = matchPct >= 80 ? 'match-high' : matchPct >= 40 ? 'match-mid' : 'match-low';
            const showMatch = r.total_searched ? `<span class="card-match ${matchClass}">${matchPct}%</span>` : '';
            const thumb = resolveThumb(r);
            const thumbHtml = thumb ? `<img class="card-thumb" src="${thumb}" alt="${esc(r.t)}" loading="lazy" onerror="this.style.display='none'">` : `<div class="card-thumb" style="display:flex;align-items:center;justify-content:center;font-size:2rem;color:var(--text-muted)">🍽️</div>`;
            const meta = [];
            if (r.ct) meta.push(`⏱ ${r.ct}`);
            if (r.df) meta.push(`👨‍🍳 ${r.df}`);
            const sourceLabel = r.st ? `<span class="card-source">${r.st}</span>` : '';
            const favActive = isFavorite(r) ? ' fav-active' : '', favStar = isFavorite(r) ? '★' : '☆';
            return `<div class="recipe-card-wrap">
                    <a class="recipe-card" href="${resolveUrl(r)}" target="_blank" rel="noopener">
                        ${thumbHtml}
                        <div class="card-body">
                            <div class="card-title">${esc(r.t)}</div>
                            <div class="card-meta">${showMatch}${sourceLabel}${meta.map(m => `<span class="card-badge">${m}</span>`).join('')}</div>
                            <div class="card-ingredients">${esc(r.i)}</div>
                        </div>
                    </a>
                    <button class="cart-btn" data-idx="${i}" title="장보기 담기">🛒</button>
                    <button class="fav-btn${favActive}" data-idx="${i}" title="즐겨찾기">${favStar}</button>
                </div>`;
        }).join('');

        if (totalPages > 1) {
            let html = '';
            if (currentPage > 1) html += `<button class="page-btn nav" data-page="${currentPage-1}">◀</button>`;
            const maxShow = 7, half = Math.floor(maxShow/2);
            let pStart = Math.max(1, currentPage - half), pEnd = Math.min(totalPages, pStart + maxShow - 1);
            if (pEnd - pStart < maxShow - 1) pStart = Math.max(1, pEnd - maxShow + 1);
            if (pStart > 1) html += `<button class="page-btn" data-page="1">1</button><span class="page-dots">…</span>`;
            for (let p = pStart; p <= pEnd; p++) html += `<button class="page-btn ${p===currentPage?'active':''}" data-page="${p}">${p}</button>`;
            if (pEnd < totalPages) html += `<span class="page-dots">…</span><button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
            if (currentPage < totalPages) html += `<button class="page-btn nav" data-page="${currentPage+1}">▶</button>`;
            pagination.innerHTML = html;
        } else pagination.innerHTML = '';
    }
    document.getElementById('results').style.display = 'block';
    if (currentPage === 1) document.getElementById('results').scrollIntoView({behavior:'smooth',block:'start'});
}

function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
