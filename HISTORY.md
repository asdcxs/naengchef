# 냉장고 셰프 — 개발 히스토리

## 프로젝트 개요
- **사이트**: https://asdcxs.github.io/naengchef/
- **리포**: https://github.com/asdcxs/naengchef
- **구조**: GitHub Pages 정적 사이트 (HTML + JS + JSON)
- **레시피 DB**: 91,211개 (만개의레시피 90,388 + 뚝딱이형 779 + 우리의식탁 44)

---

## 작업 내역

### 1. 만개의레시피 대량 크롤링
- `crawl_all.py` 파이프라인 크롤러 제작 (v2)
- 30 workers 병렬 처리, 0.7~1.0 p/s 속도
- 91,211개 레시피 수집 (DB: recipes.db → recipes.json 변환)
- 재료 텍스트에서 "구매", 도구류 등 노이즈 제거

### 2. 빠른 추가 재료 (재료/소스 분리)
- 9만개 레시피 재료 빈도 분석 (동의어 합산, 양념 제외)
- 주재료 20개 + 소스·양념 8개로 간소화
- `quick_ingredients.json`: `{ingredients: [...], sauces: [...]}`
- 소스 버튼은 점선 테두리로 시각 구분

### 3. OR / AND 검색 모드
- "하나라도" (OR) / "모두 포함" (AND) 토글 버튼
- "냉장고에 뭐가 있나요?" 제목 옆에 한 줄 배치
- `database.py`의 `search_by_ingredients`에 `match_mode` 파라미터 추가

### 4. 즐겨찾기
- localStorage 기반 (`fridge_chef_favs`)
- 각 카드 우측 상단 ☆/★ 토글
- 헤더 ⭐ 버튼으로 즐겨찾기만 보기 모드

### 5. 재료 자동완성
- 레시피 데이터에서 빈도 기반 상위 500개 재료 인덱스
- 공백 중복 합산 ("다진 마늘" → "다진마늘")
- ↑↓ 키보드 탐색, Enter 선택, Esc 닫기
- 매칭 글자 하이라이트

### 6. 장보기 목록 (사이드바)
- 우측 슬라이드 사이드바 (340px, 오버레이)
- 카드 🛒 버튼으로 재료 담기
- "✓ 완료" 버튼 → 슬라이드 애니메이션으로 삭제 (0.15s)
- 📋 복사 / 🗑 비우기
- 쿠팡 파트너스 검색바 iframe 삽입 (`coupa.ng/cl36SR`)
- localStorage 저장

### 7. 재료 편집 기능 (정적 사이트)
- localStorage 기반 커스텀 재료 추가/삭제
- ✏️ 편집 → × 삭제 버튼 표시 + 추가 폼
- 이모지 선택 + 재료/소스 드롭다운

### 8. 정렬 옵션
- 일치율순 (기본) / 인기순 / 최신순 / 간단한순
- 검색 결과 헤더에 드롭다운

### 9. 뚝딱이형 필터
- 정렬과 분리된 체크박스 토글
- 체크 시 뚝딱이형 레시피만 표시, 해제 시 전체

### 10. 제외 재료 (알레르기 케어)
- 🚫 제외할 재료 입력란
- 빨간 태그로 표시, × 클릭 해제
- 검색 시 해당 재료 포함 레시피 자동 제외
- localStorage에 저장되어 유지

### 11. 최근 검색 기록
- 검색 시 재료 조합 자동 저장 (최대 8개)
- 입력란 아래 태그로 표시, 클릭 시 재검색
- × 개별 삭제 + "지우기" 전체 삭제

### 12. 레시피 상세 모달
- 카드 클릭 → 모달로 재료 목록 미리보기
- "📖 레시피 보기" / "🛒 장보기 담기" / "📤 공유" 버튼

### 13. 공유 기능
- 모바일: 네이티브 공유 (카카오톡, 메시지 등)
- PC: 클립보드 복사

### 14. PWA
- manifest.json + service worker (sw.js)
- 홈 화면 추가 시 앱처럼 사용
- 오프라인 캐시 (정적 파일 cache-first, recipes.json network-first)

### 15. 모바일 최적화
- 640px 이하 레이아웃 전면 조정
- 카드 2열, 버튼 축소, 사이드바 300px, 모달 풀스크린
- 검색 헤더 세로 배치, 터치 영역 확대

### 16. 기타
- 검색 결과 100개 → 200개 확대
- 페이지네이션 `…` 생략 표시
- 로고 폰트: Black Han Sans → Jua (시원시원한 스타일)
- GitHub Actions 자동 크롤링 워크플로우 (update.yml) — 토큰 권한 문제로 웹에서 수동 수정 필요

---

## 파일 구조

```
naengchef/
├── index.html          # 메인 페이지
├── css/style.css       # 스타일
├── js/app.js           # 전체 로직
├── recipes.json        # 레시피 데이터 (91k, ~36MB)
├── recipes.db          # SQLite DB (88MB)
├── channels.json       # 유튜버 채널 14개
├── quick_ingredients.json  # 빠른 추가 재료/소스
├── manifest.json       # PWA manifest
├── sw.js               # Service Worker
├── icon-192.png        # PWA 아이콘
├── icon-512.png        # PWA 아이콘
├── crawler.py          # 크롤러 (만개의레시피 + 뚝딱이형 + 우리의식탁)
├── database.py         # SQLite DB 관리
└── .github/workflows/update.yml  # 자동 크롤링 (매일 UTC 0시)
```

---

## 쿠팡 파트너스
- 검색바 iframe: `https://coupa.ng/cl36SR`
- 장보기 사이드바 상단에 배치
- `COUPANG_SEARCH` 변수에 파트너스 검색 URL 설정 가능 (현재 빈 값)

---

## 향후 개선 가능
- YouTube API 연동 (채널별 영상 제목 수집 → 재료 매칭 추천)
- 식단 플래너 (월~금 레시피 배치)
- 쿠팡 파트너스 배너 추가 (하단/검색 결과 사이)
- update.yml 업데이트 (GitHub 웹에서 수동 수정 필요)
