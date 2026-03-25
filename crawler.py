"""
fridge_chef/crawler.py
Crawls recipes from 만개의레시피 + 뚝딱이형 블로그, stores in SQLite DB.

Usage:
    python crawler.py                    # 최신 업데이트 (빠름)
    python crawler.py --full             # 전체 카테고리 대량 크롤링
    python crawler.py --ttokttak         # 뚝딱이형 블로그 크롤링
    python crawler.py --all              # 전부 대량 크롤링
"""
import requests
from bs4 import BeautifulSoup
import time
import re
import argparse
from database import init_db, insert_recipe, get_recipe_count, recipe_exists

BASE_URL = "https://www.10000recipe.com"
TTOKTTAK_URL = "https://chef-choice.tistory.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36"
}
REQUEST_DELAY = 0.3

# 연속 중복 몇 개 나오면 멈출지 (업데이트 모드)
SKIP_THRESHOLD = 5

SITUATION_CATEGORIES = {
    "12": "일상", "18": "초스피드", "13": "손님접대", "19": "술안주",
    "21": "다이어트", "15": "도시락", "43": "영양식", "17": "간식",
    "45": "야식", "46": "해장", "44": "명절",
}

TYPE_CATEGORIES = {
    "63": "밑반찬", "56": "메인반찬", "54": "국/탕", "55": "찌개",
    "60": "디저트", "53": "면/만두", "52": "밥/죽/떡", "65": "양식",
    "64": "샐러드",
}


def fetch_page(url: str) -> BeautifulSoup | None:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        return BeautifulSoup(resp.text, "html.parser")
    except requests.RequestException as e:
        print(f"  [WARN] {e}")
        return None


# ========================
# 만개의레시피
# ========================

def get_recipe_ids_from_list(page: int, cat_type: str = "", cat_id: str = "") -> list[str]:
    params = f"order=reco&page={page}"
    if cat_type and cat_id:
        params = f"{cat_type}={cat_id}&{params}"
    url = f"{BASE_URL}/recipe/list.html?{params}"
    soup = fetch_page(url)
    if not soup:
        return []
    ids = []
    for item in soup.select(".common_sp_list_li"):
        link = item.select_one("a.common_sp_link")
        if link and link.get("href"):
            rid = link["href"].strip("/").split("/")[-1]
            if rid.isdigit():
                ids.append(rid)
    return ids


def crawl_recipe_detail(recipe_id: str) -> dict | None:
    url = f"{BASE_URL}/recipe/{recipe_id}"
    soup = fetch_page(url)
    if not soup:
        return None

    title_el = soup.select_one(".view2_summary h3")
    if not title_el:
        return None

    ingr_elements = soup.select(".ready_ingre3 ul li") or soup.select(".cont_ingre2 li")
    ingredients = [" ".join(el.text.split()).strip() for el in ingr_elements]
    ingredients = [i for i in ingredients if i]
    if not ingredients:
        return None

    thumb_el = soup.select_one(".centeredcrop img") or soup.select_one(".view2_pic img")
    info_spans = soup.select(".view2_summary_info span")

    return {
        "source_id": f"10000recipe_{recipe_id}",
        "title": title_el.text.strip(),
        "ingredients": ", ".join(ingredients),
        "thumbnail_url": thumb_el.get("src", "") if thumb_el else "",
        "source_url": url,
        "servings": info_spans[0].text.strip() if len(info_spans) > 0 else "",
        "cook_time": info_spans[1].text.strip() if len(info_spans) > 1 else "",
        "difficulty": info_spans[2].text.strip() if len(info_spans) > 2 else "",
        "source_type": "만개의레시피",
    }


def crawl_10000recipe(pages: int = 25, cat_type: str = "", cat_id: str = "", tag: str = "일상", stop_on_dup: bool = False):
    """
    stop_on_dup=True: 연속 중복 SKIP_THRESHOLD개 나오면 해당 카테고리 중단 (업데이트 모드)
    stop_on_dup=False: 중복이어도 끝까지 진행 (대량 크롤링 모드)
    """
    stats = {"new": 0, "skipped": 0, "failed": 0}
    consecutive_skips = 0

    for page in range(1, pages + 1):
        recipe_ids = get_recipe_ids_from_list(page, cat_type, cat_id)
        if not recipe_ids:
            break

        for rid in recipe_ids:
            sid = f"10000recipe_{rid}"
            if recipe_exists(sid):
                stats["skipped"] += 1
                consecutive_skips += 1
                if stop_on_dup and consecutive_skips >= SKIP_THRESHOLD:
                    print(f"  ⏩ 연속 {SKIP_THRESHOLD}개 중복 — 최신 상태입니다")
                    return stats
                continue

            consecutive_skips = 0
            time.sleep(REQUEST_DELAY)
            recipe = crawl_recipe_detail(rid)
            if not recipe:
                stats["failed"] += 1
                continue
            recipe["tags"] = tag
            if insert_recipe(recipe):
                stats["new"] += 1
                print(f"  ✓ [{tag}] {recipe['title'][:45]}")
            else:
                stats["skipped"] += 1
        time.sleep(REQUEST_DELAY)
    return stats


def crawl_basic(pages: int = 25, stop_on_dup: bool = False):
    print(f"\n=== 만개의레시피 기본 크롤링 ({pages}p) ===")
    return crawl_10000recipe(pages=pages, tag="일상", stop_on_dup=stop_on_dup)


def crawl_full_categories(pages_per_cat: int = 4, stop_on_dup: bool = False):
    print("\n=== 만개의레시피 카테고리별 크롤링 ===")
    total = {"new": 0, "skipped": 0, "failed": 0}

    for cat_id, tag in SITUATION_CATEGORIES.items():
        print(f"\n--- [{tag}] ---")
        s = crawl_10000recipe(pages=pages_per_cat, cat_type="cat2", cat_id=cat_id, tag=tag, stop_on_dup=stop_on_dup)
        for k in total:
            total[k] += s[k]

    for cat_id, tag in TYPE_CATEGORIES.items():
        print(f"\n--- [{tag}] ---")
        s = crawl_10000recipe(pages=pages_per_cat, cat_type="cat4", cat_id=cat_id, tag=tag, stop_on_dup=stop_on_dup)
        for k in total:
            total[k] += s[k]

    return total


# ========================
# 뚝딱이형 블로그
# ========================

def get_ttokttak_post_ids() -> list[int]:
    ids = set()
    for page in range(1, 100):
        url = f"{TTOKTTAK_URL}/?page={page}"
        soup = fetch_page(url)
        if not soup:
            break
        found = False
        for a in soup.find_all("a", href=True):
            match = re.search(r'chef-choice\.tistory\.com/(\d+)', a["href"])
            if match:
                ids.add(int(match.group(1)))
                found = True
        if not found:
            break
        time.sleep(REQUEST_DELAY)
    return sorted(ids, reverse=True)


def parse_ttokttak_ingredients(text: str) -> list[str]:
    """Extract ingredients from 뚝딱이형 blog post text.
    
    Handles multiple formats:
    - [재료] 블록 형태
    - "재료" 로 시작하는 줄 다음의 콜론(:) 구분 목록
    - og:description에서 직접 파싱
    """
    ingredients = []
    in_ingredients = False
    lines = text.split("\n")

    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue

        # 패턴1: [재료], [양념], [양념장], [소스] 등 대괄호 섹션
        bracket_match = re.search(r'\[(재료|양념|양념장|소스|[가-힣]+)\]', line)
        if bracket_match:
            in_ingredients = True
            after = re.split(r'\[[^\]]+\]', line)
            # 대괄호 뒤의 모든 텍스트를 합쳐서 파싱
            remaining = ''.join(after).strip()
            if remaining:
                _parse_inline_ingredients(remaining, ingredients)
                # 콜론 구분도 시도
                for part in re.split(r'(?<=[가-힣])\s+(?=[가-힣])', remaining):
                    part = part.strip()
                    if part and len(part) > 1 and part not in ingredients:
                        if re.search(r'\d', part):
                            ingredients.append(part)
            continue

        # 패턴2: "재료" 로 시작하는 줄 (대괄호 없이)
        if re.match(r'^재료\s*$', line) or re.match(r'^<.*재료.*>', line) or re.match(r'^재료\s*[:]?\s*$', line):
            in_ingredients = True
            continue

        # 패턴3: 조리 단계 시작 → 재료 섹션 종료
        if in_ingredients:
            if re.match(r'^\d+\.\s', line) or line.startswith("만들기") or line.startswith("조리"):
                in_ingredients = False
                continue
            if line and not line.startswith(">") and not line.startswith("(") and not line.startswith("<"):
                # 콜론 구분 형태: "대파 : 100g" or "대파 100g"
                cleaned = re.sub(r'\s*구매\s*$', '', line)
                if cleaned and len(cleaned) > 1:
                    ingredients.append(cleaned)

    # 패턴4: og:description 스타일 — "재료재료명1 분량재료명2 분량" 연속
    if not ingredients:
        # "재료" 다음에 오는 "이름 : 분량" 패턴들을 잡음
        matches = re.findall(r'([가-힣a-zA-Z\s]+?)\s*[:：]\s*[\d.]+\s*(?:g|kg|ml|L|개|숟가락|캔|컵|봉|줌|모|포기|장|큰술|작은술|약간|조금|적당량|팩|알)', text)
        for m in matches:
            name = m.strip()
            if name and len(name) >= 1 and len(name) <= 20:
                ingredients.append(name)

    # 패턴5: 연속 텍스트에서 "재료명 분량재료명 분량" 형태 파싱
    if not ingredients:
        _parse_inline_ingredients(text[:500], ingredients)

    return ingredients[:30]


def _parse_inline_ingredients(text: str, ingredients: list):
    """Parse inline ingredient text like '대파 150g숙주 200g느타리버섯 100g'"""
    # 분량 패턴(숫자+단위) 뒤에 바로 한글이 오는 지점에서 분리
    units = r'(?:g|kg|ml|L|개|숟가락|캔|컵|봉|줌|모|포기|장|큰술|작은술|팩|알)'
    # findall로 "재료명 + 분량" 묶음을 찾음
    pattern = rf'([가-힣a-zA-Z\s]+?\s*(?:[:：]\s*)?\d[\d./]*\s*{units})'
    matches = re.findall(pattern, text)
    for m in matches:
        m = m.strip()
        if m and len(m) > 1 and len(m) < 50:
            if not re.match(r'^(재료|영상|레시피|만들기|방법|조리)', m):
                ingredients.append(m)


def crawl_ttokttak_post(post_id: int) -> dict | None:
    url = f"{TTOKTTAK_URL}/{post_id}"
    soup = fetch_page(url)
    if not soup:
        return None

    og_title = soup.select_one('meta[property="og:title"]')
    title = og_title["content"].strip() if og_title else None
    if not title:
        return None

    content_el = soup.select_one(".contents_style") or soup.select_one(".tt_article_useless_p_margin")
    if not content_el:
        return None

    text = content_el.get_text("\n")
    ingredients = parse_ttokttak_ingredients(text)
    if not ingredients:
        og_desc = soup.select_one('meta[property="og:description"]')
        if og_desc:
            ingredients = parse_ttokttak_ingredients(og_desc["content"])

    if not ingredients:
        return None

    og_img = soup.select_one('meta[property="og:image"]')
    thumbnail = og_img["content"] if og_img else ""

    return {
        "source_id": f"ttokttak_{post_id}",
        "title": title,
        "ingredients": ", ".join(ingredients),
        "thumbnail_url": thumbnail,
        "source_url": url,
        "servings": "",
        "cook_time": "",
        "difficulty": "",
        "tags": "뚝딱이형,자취요리",
        "source_type": "뚝딱이형",
    }


def crawl_ttokttak(stop_on_dup: bool = False):
    print("\n=== 뚝딱이형 블로그 크롤링 ===")
    stats = {"new": 0, "skipped": 0, "failed": 0}
    consecutive_skips = 0

    print("  포스트 목록 수집 중...")
    post_ids = get_ttokttak_post_ids()

    if not post_ids:
        print("  목록 파싱 실패, ID 범위로 시도 (1~790)")
        post_ids = list(range(790, 0, -1))

    print(f"  {len(post_ids)}개 포스트 발견")

    for pid in post_ids:
        sid = f"ttokttak_{pid}"
        if recipe_exists(sid):
            stats["skipped"] += 1
            consecutive_skips += 1
            if stop_on_dup and consecutive_skips >= SKIP_THRESHOLD:
                print(f"  ⏩ 연속 {SKIP_THRESHOLD}개 중복 — 최신 상태입니다")
                return stats
            continue

        consecutive_skips = 0
        time.sleep(REQUEST_DELAY)
        recipe = crawl_ttokttak_post(pid)
        if not recipe:
            stats["failed"] += 1
            continue

        if insert_recipe(recipe):
            stats["new"] += 1
            print(f"  ✓ [뚝딱이형] {recipe['title'][:45]}")
        else:
            stats["skipped"] += 1

    return stats


# ========================
# 크롤링 모드
# ========================

def crawl_update() -> dict:
    """업데이트 모드: 최신 페이지만 확인, 중복 나오면 빠르게 멈춤."""
    init_db()
    before = get_recipe_count()
    print(f"[UPDATE] DB has {before} recipes. 최신 레시피만 확인합니다...")

    total = {"new": 0, "skipped": 0, "failed": 0}

    # 만개의레시피 최신순 5페이지만
    print("\n=== 만개의레시피 최신 확인 ===")
    s = crawl_10000recipe(pages=5, tag="일상", stop_on_dup=True)
    for k in total:
        total[k] += s[k]

    # 뚝딱이형 최신 확인
    s = crawl_ttokttak(stop_on_dup=True)
    for k in total:
        total[k] += s[k]

    after = get_recipe_count()
    print(f"\n[UPDATE DONE] New: {total['new']} | Skipped: {total['skipped']}")
    print(f"[UPDATE DONE] Total: {after} recipes")
    return {"before": before, "after": after, **total}


def crawl_all_sources() -> dict:
    """대량 크롤링: 전체 카테고리 + 뚝딱이형."""
    init_db()
    before = get_recipe_count()
    print(f"[FULL] DB has {before} recipes. 전체 크롤링...")

    total = {"new": 0, "skipped": 0, "failed": 0}

    s = crawl_basic(pages=50)
    for k in total:
        total[k] += s[k]

    s = crawl_full_categories(pages_per_cat=10)
    for k in total:
        total[k] += s[k]

    s = crawl_ttokttak()
    for k in total:
        total[k] += s[k]

    after = get_recipe_count()
    print(f"\n[FULL DONE] New: {total['new']} | Skipped: {total['skipped']} | Failed: {total['failed']}")
    print(f"[FULL DONE] Total: {after} recipes")
    return {"before": before, "after": after, **total}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Crawl recipes")
    parser.add_argument("--pages", type=int, default=25)
    parser.add_argument("--full", action="store_true", help="전체 카테고리 대량 크롤링")
    parser.add_argument("--ttokttak", action="store_true", help="뚝딱이형 블로그")
    parser.add_argument("--all", action="store_true", help="전부 대량 크롤링")
    parser.add_argument("--update", action="store_true", help="최신만 빠르게 업데이트")
    args = parser.parse_args()

    init_db()

    if args.all:
        crawl_all_sources()
    elif args.update:
        crawl_update()
    elif args.ttokttak:
        s = crawl_ttokttak()
        print(f"New: {s['new']} | Skipped: {s['skipped']} | Failed: {s['failed']}")
    elif args.full:
        s = crawl_full_categories()
        print(f"New: {s['new']} | Skipped: {s['skipped']} | Failed: {s['failed']}")
    else:
        crawl_basic(pages=args.pages)
    print(f"Total: {get_recipe_count()}")
