# 계산중이쥐 PWA 배포본

## 1. GitHub Pages
ZIP 내용물의 `index.html`, `app.js`, `shared.js`, `calc.js`, `styles.css`, `manifest.webmanifest`, `sw.js`, `icon-*.png` 등을 새 GitHub 저장소의 루트에 업로드합니다. Settings → Pages → Deploy from a branch → main / (root)를 선택합니다. 배포 URL을 Chrome에서 열어 메뉴 → 앱 설치 또는 홈 화면에 추가를 선택합니다. HTTPS가 필요합니다.

## 2. 공용 서버 설정 (운영자)
`server/Code.gs`의 `setupServer()`에 서로 다른 20자 이상의 읽기/관리자 비밀 키를 설정하고 Apps Script에서 한 번 실행한 후 웹 앱(나로 실행, 모든 사용자)으로 배포합니다. `/exec` 주소를 복사합니다. **원본 사이트 공용 시트와는 별개**입니다.

## 3. 브라우저용 CORS 프록시 (필수)
Apps Script ContentService는 브라우저에서 교차 출처 POST를 직접 호출하기 어려우므로 Cloudflare Workers 프록시를 포함했습니다. Cloudflare Workers에서 `worker.js` 코드를 배포하고 환경 변수 `APPS_SCRIPT_URL`에 `/exec` 주소를 설정합니다. `https://...workers.dev` 주소를 앱의 공용 서버 주소에 입력합니다. 읽기 키는 길드원에게, 관리자 수정 키는 관리자에게만 제공합니다. **Worker는 사용자 입력 URL로 프록시하지 않고 운영자가 지정한 Apps Script URL로만 전달합니다.**

## 4. 저장과 주의사항
길드원 목록·격추값은 공용 Google Sheets에 저장됩니다. 계산 입력과 개인 설정은 기기 내부에 남습니다. 오프라인에서는 캐시된 계산 화면을 사용할 수 있지만 공용 데이터 수정은 불가능합니다. 서버 키는 각 기기의 localStorage에 저장되므로 공용 기기에는 관리자 키를 입력하지 마세요. 비밀 키가 포함된 `Code.gs`를 공개 GitHub에 업로드하지 마세요. 배포 전 `setupServer()`에 입력한 키는 별도 보관하고, 공개 저장소에는 예시 키만 남겨 두세요.

**검증 한계:** 이 배포본은 파일 구성과 JS 구문을 검증했으며 실제 GitHub Pages/Cloudflare/Apps Script 배포와 다중 기기 실통신은 아직 검증하지 않았습니다.
