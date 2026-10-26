# MKU 리부트 (Project MK-ULTRA) — 개발 가이드

MKU를 **소울나이트식 방 탐색 던전 슈터**로 다시 만드는 2D 탑다운 웹 게임이다.
한 런 = 3챕터 × 5스테이지, 보스는 각 챕터의 X-2·X-5. 스테이지를 넘길 때마다 스킬/스탯 카드를 번갈아 고른다.
세계관은 MGTRPG. PC(키보드)와 모바일(터치)을 모두 지원한다.

## 기준 문서 (가장 중요)

- `docs/MKU_REBOOT.md`가 기획서이자 **기준**이다. 코드와 충돌하면 문서가 맞다.
- 문서가 길다. 작업 전에 **해당 마일스톤과 관련된 섹션만** 헤딩으로 찾아 읽어라.
- `(제안)`이 붙은 내용은 구현하되, 더 나은 안이 있으면 바꾸자고 제안해도 된다. 붙지 않은 내용은 확정이다.
- 문서에 없는 **규칙**은 임의로 정하지 말고 질문해라. 내부 구조, 변수명, 임시 수치 같은 **구현 세부**는 직접 정하고 `docs/DECISIONS.md`에 한 줄씩 기록해라.
- 문서끼리 충돌하면 멈추고 질문해라.
- 세계관 미공개 설정(식광의 기원, ██의 과거, 과거의 기억 내용, 식광 처치·엔딩 대사 등)은 지어내지 말고 자리만 비워둬라.
- **오버플로우 모드는 이번 범위가 아니다.** 구현하지 마라. 나중에 붙일 수 있게 구조만 막지 마라.
- 문서의 태그 표는 "12종"이라 적혀 있지만 실제로 나열된 것은 11개다. 표의 11개로 만들고, 12번째가 있으면 내가 알려준다.

## 기술 스택

- TypeScript(strict) + Phaser 3 + Vite, 테스트는 Vitest. 패키지 매니저는 npm.
- 웹 우선, PC·모바일 브라우저(가로 화면). 서버 없음. 저장은 localStorage(영구 강화 저장은 M5).
- 명령어: `npm run dev` / `npm run build` / `npm test` / `npm run typecheck`

## 폴더 구조

```
CLAUDE.md
docs/
  MKU_REBOOT.md     기획서 (기준)
  DECISIONS.md      기획서에 없어 내가 정한 구현 결정 기록
  PROGRESS.md       마일스톤 체크리스트
src/
  main.ts
  core/             설정, 시드 RNG, 이벤트 버스, ActionCommand 타입
  input/            keyboard, touch(가상 조이스틱·버튼), inputManager
  scenes/           Boot, Run(전투 씬), UI(HUD)
  systems/          mapgen, combat, weapons, ai, damage(태그 계산)
  entities/         player, enemy, projectile, pickup, door
  ui/               hud, minimap, joystick, buttons
  data/             *.json (수치·확률·정의)  text/ko.json (UI 문구·대사)
  types/
tests/
public/assets/
```

## 설계 원칙

1. **데이터 주도**: 수치·확률·이름·설명은 `src/data/*.json`에 둔다. 코드에 숫자를 박지 마라. 아이템·무기 효과는 `기준값 × 그룹 배율`로 계산하고, 그룹 배율 표도 데이터로 둔다(초기값은 임시, 밸런스는 나중에).
2. **입력과 로직 분리**: 키보드·터치는 `input/`에서 `ActionCommand`로 바꾼다. 명령은 `move, attack, skill1~4, ultimate, swapWeapon, interact, inventory, map, pause`. 게임 로직은 명령만 받고, 키 이름이나 터치 좌표를 직접 읽지 않는다.
3. **순수 함수 + 테스트 먼저**: 맵 생성, 피해·태그 배율, 확률, 전직 변환, 결정 산식 같은 공식은 Phaser에 의존하지 않는 순수 함수로 만들고 테스트를 먼저 쓴다.
4. **시드 RNG**: 모든 랜덤은 시드 가능한 RNG(`core/rng.ts`)를 쓴다. `?seed=123`으로 재현할 수 있어야 한다.
5. **텍스트 분리**: UI 문구와 대사는 `src/data/text/ko.json`에 둔다. 한국어가 기본이다.
6. **미구현 기능**은 비활성 UI(흐리게)와 확장 지점만 남기고 로직은 만들지 않는다.
7. **화면**: 기준 해상도 480×270, 정수 배 스케일, `pixelArt: true`, 가로 고정. 모바일에서 스크롤·확대·길게 누르기 메뉴를 막는다.
8. **아트**: 지금은 색 사각형·도형을 쓴다. 스프라이트 키는 데이터에서 참조해 나중에 도트 아트로 바꾸기 쉽게 한다.

## 용어 ↔ 코드 이름

| 기획서 | 코드 | 기획서 | 코드 |
| --- | --- | --- | --- |
| 마기학자 | `magiScholar` | 전투 칸 | `combatRoom` |
| 마기법사 | `magiMage` | 조우 칸 | `encounterRoom` |
| 전사 | `warrior` | 시작방 / 보스방 / 출구 | `startRoom` / `bossRoom` / `exitRoom` |
| 헥타르 / 아크로 | `hectar` / `acro` | 마기수집첨탑 | `magiSpire` |
| 액티브 / 패시브 / 궁극기 | `active` / `passive` / `ultimate` | 마기력 결정 | `magiCrystal` |
| 각성 / 전직 | `awakening` / `advancement` | 기억조각 | `memoryShard` |
| 엘리트 / 히든보스 | `elite` / `hiddenBoss` | 미모사 제미니 | `gemini` |
| 총 / 칼 | `gun` / `blade` | 실험장(시작 방) | `lab` |

태그 id: `physical, magic, tech, chance, charging, targeted, ranged, melee, buff, space, bleed`

## 작업 방식

- 마일스톤(M0~M6)을 **한 번에 하나씩** 진행한다. 시작 전에 계획을 보여주고, 내가 승인하면 구현한다.
- 끝나면 보고해라: 확인 방법(`npm run dev`에서 무엇을 해보면 되는지), 바뀐 점, 미룬 것, 질문.
- `npm test`와 `npm run typecheck`가 통과해야 완료다.
- 마일스톤 단위로 커밋하고, 중간 커밋도 의미 단위로 나눈다. 메시지는 `feat:` `fix:` `test:` `docs:` 접두사 + 한 줄.
- 파일 삭제, 대규모 리팩터, 의존성 추가는 먼저 물어라.
- 끝낸 항목은 `docs/PROGRESS.md`에 체크한다.
- 아직 안 만드는 기능은 타입·스키마만 만들 수 있고, 로직·화면은 만들지 않는다.

## 마일스톤

| 단계 | 내용 |
| --- | --- |
| M0 | 프로젝트 뼈대, 입력 계층(PC/모바일), 데이터 스키마 |
| M1 | 방 생성, 전투 칸, 기본 무기, 자동 조준, 에너지 |
| M2 | 스탯, 태그 계산, 카드 보상, 스킬 슬롯, 마기학자 스킬·패시브, 각성 |
| M3 | 챕터1 적·보스(융합악귀·전기환띠), 엘리트 3종, 전직과 연출 |
| M4 | 아이템, 상인, 마기수집첨탑, 히든보스 |
| M5 | 인벤토리, 결산, 마기력 결정 강화, 실험장 |
| M6 | 챕터2·3, 미모사 제미니 대화 |

## 하지 말 것

- 기획서의 수치·이름·규칙을 임의로 바꾸기
- 세계관 설정을 지어내기
- 기획서에 없는 기능 추가
- 입력 처리를 게임 로직에 섞기
- 수치를 코드에 하드코딩
- 오버플로우 모드 구현
