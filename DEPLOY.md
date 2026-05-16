# 배포하기

이 앱은 Google Sheet를 서버에서 읽고 엑셀 파일을 즉시 생성하는 Node.js 서버 앱입니다.
GitHub Pages는 정적 사이트용이라 이 앱을 그대로 실행할 수 없습니다.

대신 GitHub 저장소를 Render에 연결하면 배포용 웹 링크를 만들 수 있습니다.

## Render로 배포

아래 버튼을 누르면 이 GitHub 저장소 기준으로 Render 배포를 시작할 수 있습니다.

[Deploy to Render](https://render.com/deploy?repo=https://github.com/rlarudfla-creator/mixxo-shipping-list)

Render 설정 화면에서 `SHIPPING_LIST_PASSWORD` 환경변수를 입력합니다.
현재 팀 공용 비밀번호를 그대로 쓰려면 `1234`를 입력하면 됩니다.

배포가 끝나면 Render가 `https://mixxo-shipping-list.onrender.com` 형태의 주소를 발급합니다.
그 주소가 팀에서 사용할 배포용 링크입니다.

## 배포 후 수정 흐름

1. 이 저장소의 `main` 브랜치에 수정사항을 push합니다.
2. Render가 GitHub 변경사항을 감지해 자동으로 다시 배포합니다.
3. 배포 링크는 유지되고, 내용만 최신 버전으로 바뀝니다.

무료 플랜에서는 접속이 한동안 없으면 서버가 잠들 수 있습니다.
잠든 뒤 처음 접속할 때는 화면이 뜨기까지 시간이 조금 걸릴 수 있습니다.
