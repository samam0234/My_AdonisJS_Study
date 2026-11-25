# AdonisJS 작업 안내

- `demo/`는 study0~10과 studyMidpoint의 SQLite·Edge 게시판이다. `project/`는 study11~18과 studyFinal의 완성본으로 DB 선택·외부 연동·AI 작업실을 포함한다.
- 루트의 `study0.md`부터 `study18.md`, `studyMidpoint.md`, `studyFinal.md`까지 21개 문서를 진도 순서로 읽는다.
- 학습 기준은 [Notion AdonisJS](https://app.notion.com/p/41fd7dec5e2e81b1a18fcf3a82d793d4)와 [공통 API 스펙 v1](https://app.notion.com/p/3d6d7dec5e2e8139adbfd36dd506c65e)이다. 문서에 포함한 원문 체크를 임의로 바꾸지 않는다.
- 코드와 전체 코드 예제를 함께 갱신한다. 두 앱에서 각각 `npm run lint`, `npm run build`, `npm test`를 실행하고 기동 후 `npm run test:smoke`로 HTTP 흐름을 확인한다. Docker Compose와 이미지 발행 대상은 `project/`다.
- 한글 문서 및 커밋 설명을 사용하고 코드는 영어 식별자를 쓴다. 환경 파일과 빌드 출력, 로컬 DB는 Git에 추가하지 않는다.
- 커밋 규칙은 [COMMIT_GUIDE.md](COMMIT_GUIDE.md)를 따른다.
