# 배포: Cloudflare Pages

서버 없는 웹 게임이라 빌드한 파일(`dist/`)만 올리면 된다. 깃허브 저장소를 Cloudflare Pages에 연결해 두면, 깃허브에 올릴(push) 때마다 자동으로 새 버전이 배포된다.

## 1. 깃허브 저장소 만들기 (한 번)

1. https://github.com/new 에서 새 저장소를 만든다.
   - 이름 예: `mku-reboot`
   - **Private(비공개)** 로 만들어도 된다 (Cloudflare Pages는 비공개 저장소도 무료로 배포한다).
   - README·.gitignore·라이선스는 **추가하지 않는다** (이 프로젝트에 이미 있다).
2. 만든 저장소 주소(예: `https://github.com/아이디/mku-reboot.git`)를 복사한다.
3. 이 폴더에서 연결하고 올린다:

```bash
git remote add origin https://github.com/아이디/mku-reboot.git
git push -u origin main
```

처음 올릴 때 깃허브 로그인 창이 뜬다(윈도우 Git Credential Manager).

## 2. Cloudflare Pages 연결 (한 번)

1. https://dash.cloudflare.com 에 가입·로그인한다.
2. **Workers & Pages → 만들기(Create) → Pages → Git에 연결(Connect to Git)**.
3. 깃허브 계정을 연결하고 위 저장소를 고른다.
4. 빌드 설정:

| 항목 | 값 |
| --- | --- |
| 프레임워크 프리셋 | 없음(None) 또는 Vite |
| 빌드 명령 | `npm run build` |
| 빌드 출력 디렉터리 | `dist` |
| 프로덕션 브랜치 | `main` |

   Node 버전은 저장소의 `.nvmrc`(22)를 자동으로 읽는다. 안 읽히면 환경 변수 `NODE_VERSION` = `22` 를 넣는다.
5. **저장 후 배포**. 1~2분 뒤 `https://프로젝트이름.pages.dev` 주소가 생긴다.

### Workers 화면이 나올 때

Cloudflare가 Pages 대신 Workers 만들기 화면(빌드 명령 + `npx wrangler deploy`)을 보여 주면 그대로 써도 된다. 저장소의 `wrangler.jsonc`가 `dist` 폴더를 정적 사이트로 올리게 되어 있다.

| 항목 | 값 |
| --- | --- |
| 빌드 명령 | `npm run build` |
| 배포 명령 | `npx wrangler deploy` |
| 미리보기 명령 | `npx wrangler versions upload` (기본값 그대로도 된다) |

주소는 `https://mk-u.계정이름.workers.dev` 형태가 된다.

## 3. 이후 업데이트

코드를 고치고 `git push` 하면 자동으로 다시 빌드·배포된다. 빌드는 `tsc --noEmit && vite build`라 타입 오류가 있으면 배포가 멈춘다(이전 버전이 그대로 남는다).

## 선택

- **내 도메인**: Pages 프로젝트 → 사용자 지정 도메인(Custom domains)에서 산 도메인을 연결한다. HTTPS는 자동.
- **접속 제한**: Cloudflare Zero Trust → Access에서 이 주소에 이메일 로그인(허용한 사람만)을 걸 수 있다.

## 알아둘 것

- 저장(마기력 결정·도감 등)은 브라우저마다 따로 남는다(localStorage). 기기 사이에 이어지지 않는다.
- `?seed=123&debug=1` 같은 디버그 주소도 배포된 사이트에서 그대로 쓸 수 있다.
- 그림을 다시 뽑는 원본 폴더(Documents 쪽)는 저장소에 없다. 배포에는 필요 없다.
