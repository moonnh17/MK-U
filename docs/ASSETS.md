# 도트 아트 목록

`npm run assets`로 데이터에서 다시 만든다. 직접 고치지 말 것.

- 그림 파일: `public/assets/` 아래 PNG. 키마다 한 장, 프레임은 가로로 이어 붙인다.
- 등록: `src/data/art.json`의 `sprites`에 `"키": { "file", "frameWidth", "frameHeight", "frames", "anchor" }`. 적지 않은 키는 색 사각형 그대로.
- 크기: 권장 캔버스 = 판정 크기. 더 크게 그려도 판정은 그대로다. 기준점 feet는 판정이 그림 아래쪽에, center는 가운데에 놓인다.
- 애니메이션(플레이어·적): `"anims": { "idle": { "from", "to", "fps" }, "move": { ... } }`(프레임 번호 0부터). 그림은 오른쪽을 보게 그리고(왼쪽이면 `"facing": "left"`), 움직이는 방향에 따라 좌우로 뒤집는다.
- item·icon은 게임 화면이 아니라 카드·인벤토리·HUD 아이콘이다. tile은 한 장을 반복해서 깐다(문은 잠겼을 때만 보인다).

전체 125개 · 그림 있음 0개

## player (1)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `player_human` | 플레이어 | 10×10 | feet | #e8e2d0 | — |

## weapon (16)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `weapon_pistol` | 권총 | 6×6 | center | #c8c8c8 | — |
| `weapon_shotgun` | 산탄총 | 8×8 | center | #c89a5a | — |
| `weapon_longsword` | 장검 | 10×10 | center | #e0e8ff | — |
| `weapon_smg` | 기관단총 | 7×7 | center | #9ab0c8 | — |
| `weapon_rifle` | 소총 | 9×9 | center | #7a9a6a | — |
| `weapon_sniper` | 저격총 | 10×10 | center | #5a6a8a | — |
| `weapon_grenade_launcher` | 유탄발사기 | 9×9 | center | #8a7a3a | — |
| `weapon_dagger` | 단검 | 6×6 | center | #d0d8e8 | — |
| `weapon_greatsword` | 대검 | 12×12 | center | #b0b8d0 | — |
| `weapon_spear` | 창 | 12×12 | center | #c8b07a | — |
| `weapon_hammer` | 해머 | 10×10 | center | #8a8a9a | — |
| `weapon_handi` | 신궁 환디 | 12×12 | center | #ff3b3b | — |
| `weapon_rasalgethi_club` | 라스알게티의 곤봉 | 11×11 | center | #b0583a | — |
| `weapon_avior_staff` | 아비오르의 지팡이 | 11×11 | center | #8a6aff | — |
| `weapon_rasalhague_sword` | 라스알히게의 검 | 11×11 | center | #e8d24a | — |
| `weapon_fist` | 주먹 | 6×6 | center | #e8c8a0 | — |

## projectile (2)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `projectile_player` | 플레이어 탄 | 3×3 | center | #fff3a0 | — |
| `enemy_bullet` | 적 탄 | 4×4 | center | #ff5a5a | — |

## enemy (10)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `enemy_tomakki` | 토마끼 | 8×8 | feet | #8fd16a | — |
| `enemy_gaedeulgae` | 개들개 | 11×11 | feet | #c9a24a | — |
| `enemy_akgwi` | 악귀 | 15×15 | feet | #b0383a | — |
| `enemy_hectar_trooper` | 헥타르 전투원 | 12×12 | feet | #3a7bff | — |
| `enemy_magi_beetle` | 마기갑충 | 15×15 | feet | #5a8a3a | — |
| `enemy_a_memory` | 어느 기억 | 13×13 | feet | #8a7ab0 | — |
| `enemy_ancient_one` | ██ 이름을 빼앗긴 고대인 | 13×13 | feet | #c8b8a0 | — |
| `enemy_hatred_shard` | 증오의 파편 | 8×8 | feet | #ff3a4a | — |
| `enemy_executor` | 집행자 | 18×18 | feet | #a0a8b8 | — |
| `enemy_archon` | 집정관 | 16×16 | feet | #e8c860 | — |

## boss (10)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `enemy_fusion_akgwi` | 융합악귀 | 26×26 | feet | #7a1f3a | — |
| `enemy_electric_ring` | 전기환띠 | 28×28 | feet | #3a9ad9 | — |
| `enemy_training_dummy` | 보스 자리(임시 표적) | 24×24 | feet | #8a5ad9 | — |
| `enemy_ancestor_echo` | 선조의 잔상 | 28×28 | feet | #b0583a | — |
| `enemy_royal_mage` | 왕실특무마기법사 외 1곳 | 22×22 | feet | #6a4ad9 | — |
| `enemy_orion_crusader` | 오리온의 성전사 | 28×28 | feet | #d9c25a | — |
| `enemy_hectar_chief` | 헥타르 수석 연구원 | 24×24 | feet | #3a9aff | — |
| `enemy_magi_golem` | 마기골렘 | 32×32 | feet | #8a6a4a | — |
| `enemy_eclipse` | 식광 | 28×28 | feet | #c8a8ff | — |
| `enemy_magi_kaiser` | 마기카이저 | 34×34 | feet | #d02828 | — |

## prop (7)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `chest_weapon` | 무기 상자 | 14×14 | feet | #a07a3a | — |
| `chest_item` | 아이템 상자 | 14×14 | feet | #5a8ad9 | — |
| `merchant_stand` | 상인 진열대 | 12×12 | feet | #4a5a6a | — |
| `spire_small` | 마기수집첨탑(소형) | 10×44 | feet | #15151c | — |
| `spire_medium` | 마기수집첨탑(중형) | 16×48 | feet | #3a0e12 | — |
| `prop_exit_portal` | 출구 포털 | 20×20 | feet | #5ae0ff | — |
| `prop_encounter_core` | 조우 칸 코어 | 14×14 | feet | #ffd23f | — |

## pickup (2)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `pickup_energy` | 에너지 구슬 | 4×4 | center | #3fc8e0 | — |
| `pickup_coin` | 코인 | 4×4 | center | #ffd23f | — |

## skill (12)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `skill_turret` | 마기 자동포탑 (turret) | 8×8 | center | #4fb3d9 | — |
| `skill_turret_big` | 마기 자동포탑 (bigTurret) | 16×16 | center | #8ae0ff | — |
| `skill_turret_shell` | 마기 자동포탑 (shell) | 5×5 | center | #ffb04a | — |
| `skill_mine` | 마기 지뢰 (mine) | 5×5 | center | #d9a03b | — |
| `skill_mine_chain` | 마기 지뢰 (chainMine) | 5×5 | center | #ff6ad9 | — |
| `skill_antimatter_charge` | 반물질포 (charge) | 4×4 | center | #c98aff | — |
| `skill_antimatter_shell` | 반물질포 (shell) | 9×9 | center | #a05ad9 | — |
| `skill_drone` | 전투 드론 (drone) | 5×5 | center | #5ad9c0 | — |
| `skill_subject` | 불안정 실험체 (subject) | 7×7 | center | #9ad94a | — |
| `skill_experiment_shell` | 실험 병기 (shell) | 6×6 | center | #d9d03b | — |
| `ult_first_law` | 열역학 제1법칙 (particle) | 8×8 | center | #ff9a3c | — |
| `ult_singularity` | 특이점 실험 (core) | 10×10 | center | #ff3a4a | — |

## lab (7)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `lab_capsule` | 실험체 캡슐 | 22×26 | feet | #9ad8e0 | — |
| `lab_job_device` | 직업 선택 장치 | 28×18 | feet | #e0c060 | — |
| `lab_portal` | 시뮬레이션 포털 | 34×22 | feet | #7a5aff | — |
| `lab_codex` | 도감 단말 | 20×24 | feet | #5a9ab0 | — |
| `lab_archive` | 기억조각 보관대 | 24×26 | feet | #b07ae0 | — |
| `lab_gemini` | 미모사 제미니 | 14×22 | feet | #7ae0e0 | — |
| `lab_window` | 관측창 | 100×12 | feet | #06090c | — |

## item (31)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `item_slime_stew` | 슬라임 스튜 | 8×8 | center | #8fd16a | — |
| `item_magicasol` | 마기카솔 | 8×8 | center | #5ac8e0 | — |
| `item_nameless_sword` | 이름 없는 검 | 8×8 | center | #d0d8e8 | — |
| `item_nameless_helm` | 이름 없는 투구 | 8×8 | center | #9aa4b0 | — |
| `item_broken_blade` | 부러진 칼날 | 8×8 | center | #b0b0b0 | — |
| `item_broken_hilt` | 망가진 손잡이 | 8×8 | center | #8a7a5a | — |
| `item_elegant_magi` | 엘러건트 마기 | 8×8 | center | #4a8cff | — |
| `item_antimatter_sample` | 실험용 반물질 | 8×8 | center | #a05ad9 | — |
| `item_combat_theory` | 마력 전투 응용법 | 8×8 | center | #5a8ad9 | — |
| `item_oak_heart` | 참나무의 심장 | 8×8 | center | #6a9a3a | — |
| `item_hanwoo_steak` | 한우촌의 생등심 | 8×8 | center | #c85a5a | — |
| `item_lee_seal` | 이씨 가문의 증표 | 8×8 | center | #ffd23f | — |
| `item_magowiki_codex` | 마고위키 필사본 | 8×8 | center | #e0c060 | — |
| `item_lsd_r` | LSD-R | 8×8 | center | #e070c0 | — |
| `item_hanabi` | 한아비 | 8×8 | center | #ffb04a | — |
| `item_gisup_stone` | 기숲 비석의 조각 | 8×8 | center | #7a8a9a | — |
| `item_afro_belt` | 아프로 씨의 벨트 | 8×8 | center | #a45cff | — |
| `item_regulus_shard` | 레굴루스의 의식조각 | 8×8 | center | #8a6aff | — |
| `item_caesar_crown` | 카이사르의 왕관 | 8×8 | center | #ffd23f | — |
| `item_acrux_cross` | 아크룩스의 십자가 | 8×8 | center | #e0e0ff | — |
| `item_orion_belt` | 오리온의 허리띠 | 8×8 | center | #5ad9ff | — |
| `item_divine_sword` | 신검 영디·마기 | 8×8 | center | #ff3b3b | — |
| `item_al_gul_blade` | 알 굴 참마검 | 8×8 | center | #ffe08a | — |
| `item_wonhon_lump` | 원혼 덩어리 | 8×8 | center | #7a1f3a | — |
| `item_gihwan_arm` | 기환의 팔 | 8×8 | center | #3a9ad9 | — |
| `item_death_whistle` | 바바리안 데스 휘슬 | 8×8 | center | #c86a3a | — |
| `item_royal_seal` | 특무 인장 | 8×8 | center | #6a4ad9 | — |
| `item_orion_shield` | 오리온의 방패 | 8×8 | center | #d9c25a | — |
| `item_hectar_ram` | 헥타르 RAM | 8×8 | center | #3a9aff | — |
| `item_ancient_core` | 고대병기의 코어 | 8×8 | center | #9a4aff | — |
| `item_eclipse_core` | 식광의 핵 | 8×8 | center | #c8a8ff | — |

## icon (17)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `icon_skill_magiTurret` | 마기 자동포탑 | 16×16 | center | #4fb3d9 | — |
| `icon_skill_magiMine` | 마기 지뢰 | 16×16 | center | #d9a03b | — |
| `icon_skill_antimatterCannon` | 반물질포 | 16×16 | center | #a05ad9 | — |
| `icon_skill_magiField` | 마기역장 | 16×16 | center | #8aa4c8 | — |
| `icon_skill_railgun` | 레일건 | 16×16 | center | #3ba7d9 | — |
| `icon_skill_combatDrone` | 전투 드론 | 16×16 | center | #5ad9c0 | — |
| `icon_skill_unstableSubject` | 불안정 실험체 | 16×16 | center | #9ad94a | — |
| `icon_skill_magiCorruption` | 마기 변질 | 16×16 | center | #c83a5a | — |
| `icon_skill_experimentalWeapon` | 실험 병기 | 16×16 | center | #d9d03b | — |
| `icon_skill_purifyingWings` | 정화의 날개 | 16×16 | center | #d93a3a | — |
| `icon_skill_mkPrototype` | MK : 프로토타입 | 16×16 | center | #d9783b | — |
| `icon_skill_reductionist` | 환원주의자 | 16×16 | center | #5ad95a | — |
| `icon_ult_firstLaw` | 열역학 제1법칙 | 16×16 | center | #ff9a3c | — |
| `icon_ult_thunderbolt` | 벼락 | 16×16 | center | #4ab0ff | — |
| `icon_ult_singularity` | 특이점 실험 | 16×16 | center | #ff3a4a | — |
| `icon_gemini` | 미모사 제미니 (icon) | 16×16 | center | #4ab0ff | — |
| `portrait_gemini` | 미모사 제미니 (portrait) | 48×64 | center | #4ab0ff | — |

## tile (10)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `tile_floor_c1` | 방 바닥 (1장) | 16×16 | center | #1c2430 | — |
| `tile_corridor_c1` | 복도 바닥 (1장) | 16×16 | center | #18202a | — |
| `tile_wall_c1` | 벽 (1장) | 16×16 | center | #3a4656 | — |
| `tile_floor_c2` | 방 바닥 (2장) | 16×16 | center | #1e2630 | — |
| `tile_corridor_c2` | 복도 바닥 (2장) | 16×16 | center | #182028 | — |
| `tile_wall_c2` | 벽 (2장) | 16×16 | center | #5a6a7a | — |
| `tile_floor_c3` | 방 바닥 (3장) | 16×16 | center | #1a0c0e | — |
| `tile_corridor_c3` | 복도 바닥 (3장) | 16×16 | center | #120708 | — |
| `tile_wall_c3` | 벽 (3장) | 16×16 | center | #5a1a1e | — |
| `tile_door` | 잠긴 문 | 16×16 | center | #c8643a | — |
