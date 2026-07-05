# 네이버 로그인 도우미

사용자가 터미널 없이 네이버 계정을 연결할 수 있는 Windows 전용 프로그램입니다.

## 빌드 방법

```bash
cd naver-login-app
npm install
npx playwright install chromium   # 개발 환경에서 테스트용
npm run build                      # naver-login.exe 생성
```

빌드 후 `naver-login.exe`를 `../public/downloads/` 폴더에 복사해 서버에서 배포합니다.

```bash
cp naver-login.exe ../public/downloads/naver-login.exe
```

## 동작 방식

1. 실행 시 사이트 이메일/비밀번호 입력
2. Chrome 또는 Edge 브라우저 자동 실행 (설치된 것 사용)
3. 네이버 로그인 페이지에서 직접 로그인
4. 세션을 서버로 자동 전송

## 브라우저 우선순위

Chrome → Edge → Playwright 내장 순으로 시도합니다.
Chrome 또는 Edge가 설치되어 있으면 별도 다운로드 불필요합니다.
