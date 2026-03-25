// === 냉장고 셰프 — Static Site Version ===

let ALL_RECIPES = [];
let ALL_CHANNELS = [];
let QUICK_INGREDIENTS = [];

const ingredients = new Set();
let allResults = [];
let currentPage = 1;

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

// === Load Data ===

async function init() {
    try {
        const [recipesRes, channelsRes, quickRes] = await Promise.all([
            fetch('recipes.json'),
            fetch('channels.json'),
            fetch('quick_ingredients.json'),
        ]);
        ALL_RECIPES = await recipesRes.json();
        ALL_CHANNELS = await channelsRes.json();
        QUICK_INGREDIENTS = await quickRes.json();

        document.getElementById('recipeCount').textContent = ALL_RECIPES.length.toLocaleString();
        document.getElementById('loading').style.display = 'none';
        document.getElementById('searchSection').style.display = 'block';
        document.getElementById('emptyState').style.display = 'block';

        renderQuickButtons();
        renderChannels();
    } catch (e) {
        document.getElementById('loading').innerHTML = `<div class="empty-icon">😥</div><p>데이터 로딩 실패: ${e.message}</p>`;
    }
}

// === Quick Buttons ===

function renderQuickButtons() {
    const container = document.getElementById('quickButtons');
    container.innerHTML = QUICK_INGREDIENTS.map(item =>
        `<button class="quick-btn" data-ing="${item.name}">${item.emoji} ${item.name}</button>`
    ).join('');

    container.querySelectorAll('.quick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const ing = btn.dataset.ing;
            if (ingredients.has(ing)) removeIngredient(ing);
            else addIngredient(ing);
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
    const tagsEl = document.getElementById('tags');
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
    document.getElementById('searchBtn').disabled = ingredients.size === 0;
}

// === Events ===

document.querySelector('.tag-input-area').addEventListener('click', () =>
    document.getElementById('ingredientInput').focus()
);

document.getElementById('ingredientInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        e.target.value.split(/[,，\s]+/).filter(Boolean).forEach(addIngredient);
        e.target.value = '';
    }
    if (e.key === 'Backspace' && !e.target.value && ingredients.size > 0) {
        removeIngredient([...ingredients].pop());
    }
});

document.getElementById('tags').addEventListener('click', (e) => {
    if (e.target.classList.contains('tag-remove')) removeIngredient(e.target.dataset.name);
});

// === Search (client-side) ===

document.getElementById('searchBtn').addEventListener('click', doSearch);

function doSearch() {
    if (ingredients.size === 0) return;

    const ingList = [...ingredients];
    document.getElementById('emptyState').style.display = 'none';

    // Score each recipe
    const scored = [];
    for (const r of ALL_RECIPES) {
        let matchCount = 0;
        for (const ing of ingList) {
            if (r.i.includes(ing)) matchCount++;
        }
        if (matchCount > 0) {
            scored.push({ ...r, match_count: matchCount, total_searched: ingList.length });
        }
    }

    // Sort by match count desc
    scored.sort((a, b) => b.match_count - a.match_count);

    allResults = scored.slice(0, 60); // max 60
    currentPage = 1;
    renderResults(ingList);
}

function renderResults(query) {
    const pageSize = getPageSize();
    const totalPages = Math.ceil(allResults.length / pageSize);
    const start = (currentPage - 1) * pageSize;
    const pageResults = allResults.slice(start, start + pageSize);

    const resultsTitle = document.getElementById('resultsTitle');
    const youtubeLink = document.getElementById('youtubeLink');
    const recipeCards = document.getElementById('recipeCards');
    const pagination = document.getElementById('pagination');

    resultsTitle.textContent = allResults.length > 0
        ? `📋 ${allResults.length}개의 레시피를 찾았어요`
        : '📋 검색 결과';

    const q = (query || [...ingredients]).join(' ') + ' 레시피';
    youtubeLink.innerHTML = `<a href="https://www.youtube.com/results?search_query=${encodeURIComponent(q)}" target="_blank">▶ 유튜브에서 레시피 보기</a>`;

    if (allResults.length === 0) {
        recipeCards.innerHTML = `<div class="no-results" style="grid-column:1/-1"><div class="no-results-icon">🤔</div><p>매칭되는 레시피가 없어요. 다른 재료를 넣어보세요!</p></div>`;
        pagination.innerHTML = '';
    } else {
        recipeCards.innerHTML = pageResults.map(r => {
            const matchPct = Math.round((r.match_count / r.total_searched) * 100);
            const matchClass = matchPct >= 80 ? 'match-high' : matchPct >= 40 ? 'match-mid' : 'match-low';
            const thumb = r.th || '';
            const thumbHtml = thumb
                ? `<img class="card-thumb" src="${thumb}" alt="${esc(r.t)}" loading="lazy" onerror="this.style.display='none'">`
                : `<div class="card-thumb" style="display:flex;align-items:center;justify-content:center;font-size:2rem;color:var(--text-muted)">🍽️</div>`;

            const meta = [];
            if (r.ct) meta.push(`⏱ ${r.ct}`);
            if (r.d) meta.push(`👨‍🍳 ${r.d}`);
            if (r.s) meta.push(`🍽 ${r.s}`);

            const sourceLabel = r.st && r.st !== '만개의레시피' ? `<span class="card-source">${r.st}</span>` : '';

            return `
                <a class="recipe-card" href="${r.u}" target="_blank" rel="noopener">
                    ${thumbHtml}
                    <div class="card-body">
                        <div class="card-title">${esc(r.t)}</div>
                        <div class="card-meta">
                            <span class="card-match ${matchClass}">${matchPct}% 일치</span>
                            ${sourceLabel}
                            ${meta.map(m => `<span class="card-badge">${m}</span>`).join('')}
                        </div>
                        <div class="card-ingredients">${esc(r.i)}</div>
                    </div>
                </a>`;
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

document.getElementById('pagination').addEventListener('click', (e) => {
    const btn = e.target.closest('.page-btn');
    if (!btn) return;
    currentPage = parseInt(btn.dataset.page);
    renderResults();
    document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// Start
init();
