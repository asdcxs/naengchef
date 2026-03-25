"""
fridge_chef/database.py
SQLite DB for recipe storage and ingredient-based search.
"""
import sqlite3
import os
import sys

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "recipes.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = get_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS recipes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id TEXT UNIQUE,
            title TEXT NOT NULL,
            ingredients TEXT NOT NULL,
            thumbnail_url TEXT,
            source_url TEXT NOT NULL,
            servings TEXT,
            cook_time TEXT,
            difficulty TEXT,
            tags TEXT DEFAULT '',
            source_type TEXT DEFAULT '만개의레시피',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ingredients ON recipes(ingredients)")
    # Migrate existing DBs — add columns before creating indexes on them
    for col, default in [("tags", "''"), ("source_type", "'만개의레시피'")]:
        try:
            conn.execute(f"ALTER TABLE recipes ADD COLUMN {col} TEXT DEFAULT {default}")
        except sqlite3.OperationalError:
            pass
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tags ON recipes(tags)")
    conn.commit()
    conn.close()


def insert_recipe(recipe: dict) -> bool:
    conn = get_connection()
    try:
        conn.execute("""
            INSERT OR IGNORE INTO recipes 
            (source_id, title, ingredients, thumbnail_url, source_url, servings, cook_time, difficulty, tags, source_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            recipe.get("source_id", ""),
            recipe["title"],
            recipe["ingredients"],
            recipe.get("thumbnail_url", ""),
            recipe["source_url"],
            recipe.get("servings", ""),
            recipe.get("cook_time", ""),
            recipe.get("difficulty", ""),
            recipe.get("tags", ""),
            recipe.get("source_type", "만개의레시피"),
        ))
        conn.commit()
        inserted = conn.total_changes > 0
        return inserted
    except sqlite3.Error as e:
        print(f"[DB ERROR] {e}")
        return False
    finally:
        conn.close()


def recipe_exists(source_id: str) -> bool:
    conn = get_connection()
    row = conn.execute("SELECT 1 FROM recipes WHERE source_id = ?", (source_id,)).fetchone()
    conn.close()
    return row is not None


def search_by_ingredients(ingredients: list[str], tags: list[str] = None, limit: int = 30) -> list[dict]:
    if not ingredients:
        return []

    conn = get_connection()

    case_parts = []
    params = []
    for ing in ingredients:
        ing = ing.strip()
        if ing:
            case_parts.append("(CASE WHEN ingredients LIKE ? THEN 1 ELSE 0 END)")
            params.append(f"%{ing}%")

    if not case_parts:
        conn.close()
        return []

    match_expr = " + ".join(case_parts)

    tag_clause = ""
    tag_params = []
    if tags:
        tag_conditions = []
        for tag in tags:
            tag = tag.strip()
            if tag:
                tag_conditions.append("tags LIKE ?")
                tag_params.append(f"%{tag}%")
        if tag_conditions:
            tag_clause = " AND (" + " OR ".join(tag_conditions) + ")"

    query = f"""
        SELECT *, ({match_expr}) AS match_count
        FROM recipes
        WHERE ({match_expr}) > 0{tag_clause}
        ORDER BY match_count DESC, id DESC
        LIMIT ?
    """
    all_params = params + params + tag_params + [limit]

    rows = conn.execute(query, all_params).fetchall()
    conn.close()

    results = []
    for row in rows:
        results.append({
            "id": row["id"],
            "source_id": row["source_id"],
            "title": row["title"],
            "ingredients": row["ingredients"],
            "thumbnail_url": row["thumbnail_url"],
            "source_url": row["source_url"],
            "servings": row["servings"],
            "cook_time": row["cook_time"],
            "difficulty": row["difficulty"],
            "tags": row["tags"] if row["tags"] else "",
            "source_type": row["source_type"] if "source_type" in row.keys() else "만개의레시피",
            "match_count": row["match_count"],
            "total_searched": len(ingredients),
        })

    return results


def get_recipe_count() -> int:
    conn = get_connection()
    count = conn.execute("SELECT COUNT(*) FROM recipes").fetchone()[0]
    conn.close()
    return count


def get_source_counts() -> dict:
    conn = get_connection()
    rows = conn.execute("SELECT source_type, COUNT(*) as cnt FROM recipes GROUP BY source_type").fetchall()
    conn.close()
    return {row["source_type"]: row["cnt"] for row in rows}


def get_all_tags() -> list[str]:
    conn = get_connection()
    rows = conn.execute("SELECT DISTINCT tags FROM recipes WHERE tags != ''").fetchall()
    conn.close()
    tag_set = set()
    for row in rows:
        for tag in row["tags"].split(","):
            tag = tag.strip()
            if tag:
                tag_set.add(tag)
    return sorted(tag_set)


if __name__ == "__main__":
    init_db()
    if len(sys.argv) < 2:
        print(f"Total recipes: {get_recipe_count()}")
        print(f"Sources: {get_source_counts()}")
        print(f"Tags: {', '.join(get_all_tags())}")
        print("Usage: python database.py '계란 김치'")
        sys.exit(0)

    query = sys.argv[1]
    ingredients = [i.strip() for i in query.replace(",", " ").split() if i.strip()]
    print(f"Searching for: {ingredients}")
    results = search_by_ingredients(ingredients)
    if not results:
        print("No matching recipes found.")
    else:
        print(f"\nFound {len(results)} recipes:\n")
        for r in results:
            match_pct = int(r["match_count"] / r["total_searched"] * 100)
            print(f"  [{match_pct}%] {r['title']} [{r['tags']}]")
