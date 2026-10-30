# 도트 아트 목록

`npm run assets`로 데이터에서 다시 만든다. 직접 고치지 말 것.

- 그림 파일: `public/assets/` 아래 PNG. 키마다 한 장, 프레임은 가로로 이어 붙인다.
- 등록: `src/data/art.json`의 `sprites`에 `"키": { "file", "frameWidth", "frameHeight", "frames", "anchor" }`. 적지 않은 키는 색 사각형 그대로.
- 크기: 권장 캔버스 = 판정 크기. 더 크게 그려도 판정은 그대로다. 기준점 feet는 판정이 그림 아래쪽에, center는 가운데에 놓인다.
- 애니메이션(플레이어·적): `"anims": { "idle": { "from", "to", "fps" }, "move": { ... } }`(프레임 번호 0부터). 그림은 오른쪽을 보게 그리고(왼쪽이면 `"facing": "left"`), 움직이는 방향에 따라 좌우로 뒤집는다.
- item·icon은 게임 화면이 아니라 카드·인벤토리·HUD 아이콘이다. tile은 한 장을 반복해서 깐다(문은 잠겼을 때만 보인다).

전체 216개 · 그림 있음 201개

## player (3)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `player_human` | 플레이어 | 10×10 | feet | #e8e2d0 | mku/player_human.png (5프레임) |
| `player_hectar` | 플레이어 헥타르 | 10×10 | feet | #e8e2d0 | mku/player_hectar.png (5프레임) |
| `player_acro` | 플레이어 아크로 | 10×10 | feet | #e8e2d0 | mku/player_acro.png (5프레임) |

## weapon (16)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `weapon_pistol` | 권총 | 6×6 | center | #c8c8c8 | mku/weapon_pistol.png (1프레임) |
| `weapon_shotgun` | 산탄총 | 8×8 | center | #c89a5a | mku/weapon_shotgun.png (1프레임) |
| `weapon_longsword` | 장검 | 10×10 | center | #e0e8ff | mku/weapon_longsword.png (1프레임) |
| `weapon_smg` | 기관단총 | 7×7 | center | #9ab0c8 | mku/weapon_smg.png (1프레임) |
| `weapon_rifle` | 소총 | 9×9 | center | #7a9a6a | mku/weapon_rifle.png (1프레임) |
| `weapon_sniper` | 저격총 | 10×10 | center | #5a6a8a | mku/weapon_sniper.png (1프레임) |
| `weapon_grenade_launcher` | 유탄발사기 | 9×9 | center | #8a7a3a | mku/weapon_grenade_launcher.png (1프레임) |
| `weapon_dagger` | 단검 | 6×6 | center | #d0d8e8 | mku/weapon_dagger.png (1프레임) |
| `weapon_greatsword` | 대검 | 12×12 | center | #b0b8d0 | mku/weapon_greatsword.png (1프레임) |
| `weapon_spear` | 창 | 12×12 | center | #c8b07a | mku/weapon_spear.png (1프레임) |
| `weapon_hammer` | 해머 | 10×10 | center | #8a8a9a | mku/weapon_hammer.png (1프레임) |
| `weapon_handi` | 신궁 환디 | 12×12 | center | #ff3b3b | mku/weapon_handi.png (1프레임) |
| `weapon_rasalgethi_club` | 라스알게티의 곤봉 | 11×11 | center | #b0583a | mku/weapon_rasalgethi_club.png (1프레임) |
| `weapon_avior_staff` | 아비오르의 지팡이 | 11×11 | center | #8a6aff | mku/weapon_avior_staff.png (1프레임) |
| `weapon_rasalhague_sword` | 라스알히게의 검 | 11×11 | center | #e8d24a | mku/weapon_rasalhague_sword.png (1프레임) |
| `weapon_fist` | 주먹 | 6×6 | center | #e8c8a0 | mku/weapon_fist.png (1프레임) |

## projectile (2)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `projectile_player` | 플레이어 탄 | 3×3 | center | #fff3a0 | mku/projectile_player.png (1프레임) |
| `enemy_bullet` | 적 탄 | 4×4 | center | #ff5a5a | mku/enemy_bullet.png (1프레임) |

## enemy (11)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `enemy_tomakki` | 토마끼 | 8×8 | feet | #8fd16a | mku/enemy_tomakki.png (4프레임) |
| `enemy_gaedeulgae` | 개들개 | 11×11 | feet | #c9a24a | mku/enemy_gaedeulgae.png (5프레임) |
| `enemy_akgwi` | 악귀 | 15×15 | feet | #b0383a | mku/enemy_akgwi.png (6프레임) |
| `enemy_ghost_shooter` | 유령 사수 | 11×11 | feet | #c0303a | mku/enemy_ghost_shooter.png (4프레임) |
| `enemy_hectar_trooper` | 헥타르 전투원 | 12×12 | feet | #3a7bff | mku/enemy_hectar_trooper.png (5프레임) |
| `enemy_magi_beetle` | 마기갑충 | 15×15 | feet | #5a8a3a | mku/enemy_magi_beetle.png (10프레임) |
| `enemy_a_memory` | 어느 기억 | 13×13 | feet | #8a7ab0 | mku/enemy_a_memory.png (14프레임) |
| `enemy_ancient_one` | ██ 이름을 빼앗긴 고대인 | 13×13 | feet | #c8b8a0 | mku/enemy_ancient_one.png (12프레임) |
| `enemy_hatred_shard` | 증오의 파편 | 8×8 | feet | #ff3a4a | mku/enemy_hatred_shard.png (10프레임) |
| `enemy_executor` | 집행자 | 18×18 | feet | #a0a8b8 | mku/enemy_executor.png (13프레임) |
| `enemy_archon` | 집정관 | 16×16 | feet | #e8c860 | mku/enemy_archon.png (13프레임) |

## boss (30)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `enemy_fusion_akgwi` | 융합악귀 | 39×39 | feet | #7a1f3a | mku/enemy_fusion_akgwi.png (2프레임) |
| `enemy_electric_ring` | 전기환띠 | 42×42 | feet | #3a9ad9 | mku/enemy_electric_ring.png (2프레임) |
| `enemy_training_dummy` | 보스 자리(임시 표적) | 24×24 | feet | #8a5ad9 | mku/enemy_training_dummy.png (1프레임) |
| `enemy_ancestor_echo` | 선조의 잔상 | 42×42 | feet | #b0583a | mku/enemy_ancestor_echo.png (3프레임) |
| `enemy_royal_mage` | 왕실특무마기법사 외 1곳 | 33×33 | feet | #6a4ad9 | mku/enemy_royal_mage.png (5프레임) |
| `enemy_orion_crusader` | 오리온의 성전사 | 42×42 | feet | #d9c25a | mku/enemy_orion_crusader.png (9프레임) |
| `enemy_hectar_chief` | 헥타르 수석 연구원 | 36×36 | feet | #3a9aff | mku/enemy_hectar_chief.png (5프레임) |
| `enemy_magi_golem` | 마기골렘 | 48×48 | feet | #8a6a4a | mku/enemy_magi_golem.png (2프레임) |
| `enemy_eclipse` | 식광 | 42×42 | feet | #c8a8ff | mku/enemy_eclipse.png (10프레임) |
| `enemy_magi_kaiser` | 마기카이저 | 51×51 | feet | #d02828 | mku/enemy_magi_kaiser.png (10프레임) |
| `enemy_fusion_akgwi_phase1` | 융합악귀 (1단계) | 39×39 | feet | #7a1f3a | — |
| `enemy_fusion_akgwi_phase2` | 융합악귀 (2단계) | 39×39 | feet | #7a1f3a | mku/enemy_fusion_akgwi_phase2.png (2프레임) |
| `enemy_electric_ring_phase1` | 전기환띠 (1단계) | 42×42 | feet | #3a9ad9 | — |
| `enemy_electric_ring_phase2` | 전기환띠 (2단계) | 42×42 | feet | #3a9ad9 | — |
| `enemy_hectar_chief_phase1` | 헥타르 수석 연구원 (1단계) | 36×36 | feet | #3a9aff | — |
| `enemy_hectar_chief_phase2` | 헥타르 수석 연구원 (2단계) | 36×36 | feet | #3a9aff | — |
| `enemy_magi_golem_phase1` | 마기골렘 (1단계) | 48×48 | feet | #8a6a4a | — |
| `enemy_magi_golem_phase2` | 마기골렘 (2단계) | 48×48 | feet | #8a6a4a | mku/enemy_magi_golem_phase2.png (2프레임) |
| `enemy_eclipse_phase1` | 식광 (1단계) | 42×42 | feet | #c8a8ff | — |
| `enemy_eclipse_phase2` | 식광 (2단계) | 42×42 | feet | #c8a8ff | mku/enemy_eclipse_phase2.png (10프레임) |
| `enemy_magi_kaiser_phase1` | 마기카이저 (1단계) | 51×51 | feet | #d02828 | mku/enemy_magi_kaiser_phase1.png (4프레임) |
| `enemy_magi_kaiser_phase2` | 마기카이저 (2단계) | 51×51 | feet | #d02828 | mku/enemy_magi_kaiser_phase2.png (10프레임) |
| `enemy_magi_kaiser_phase3` | 마기카이저 (3단계) | 51×51 | feet | #d02828 | mku/enemy_magi_kaiser_phase3.png (10프레임) |
| `enemy_magi_kaiser_phase4` | 마기카이저 (4단계) | 51×51 | feet | #d02828 | — |
| `enemy_ancestor_echo_phase1` | 선조의 잔상 (1단계) | 42×42 | feet | #b0583a | — |
| `enemy_ancestor_echo_phase2` | 선조의 잔상 (2단계) | 42×42 | feet | #b0583a | — |
| `enemy_royal_mage_phase1` | 왕실특무마기법사 (1단계) | 33×33 | feet | #6a4ad9 | — |
| `enemy_royal_mage_phase2` | 왕실특무마기법사 (2단계) | 33×33 | feet | #6a4ad9 | — |
| `enemy_orion_crusader_phase1` | 오리온의 성전사 (1단계) | 42×42 | feet | #d9c25a | — |
| `enemy_orion_crusader_phase2` | 오리온의 성전사 (2단계) | 42×42 | feet | #d9c25a | — |

## prop (52)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `chest_weapon` | 무기 상자 | 14×14 | feet | #a07a3a | mku/chest_weapon.png (1프레임) |
| `chest_item` | 아이템 상자 | 14×14 | feet | #5a8ad9 | mku/chest_item.png (1프레임) |
| `merchant_stand` | 상인 진열대 | 12×12 | feet | #4a5a6a | mku/merchant_stand.png (1프레임) |
| `spire_small` | 마기수집첨탑(소형) | 10×44 | feet | #15151c | mku/spire_small.png (1프레임) |
| `spire_medium` | 마기수집첨탑(중형) | 16×48 | feet | #3a0e12 | mku/spire_medium.png (1프레임) |
| `prop_exit_portal` | 출구 포털 | 20×20 | feet | #5ae0ff | mku/prop_exit_portal.png (1프레임) |
| `prop_encounter_core` | 조우 칸 코어 | 14×14 | feet | #ffd23f | mku/prop_encounter_core.png (1프레임) |
| `obstacle_c1_0` | 지형지물 (1장) | 16×16 | feet | #0c0e14 | mku/obstacle_c1_0.png (1프레임) |
| `obstacle_c1_1` | 지형지물 (1장) | 16×16 | feet | #0c0e14 | mku/obstacle_c1_1.png (1프레임) |
| `obstacle_c1_2` | 지형지물 (1장) | 16×16 | feet | #0c0e14 | mku/obstacle_c1_2.png (1프레임) |
| `obstacle_c1_3` | 지형지물 (1장) | 16×16 | feet | #0c0e14 | mku/obstacle_c1_3.png (1프레임) |
| `obstacle_c1_4` | 지형지물 (1장) | 16×16 | feet | #0c0e14 | mku/obstacle_c1_4.png (1프레임) |
| `obstacle_c1_5` | 지형지물 (1장) | 16×16 | feet | #0c0e14 | mku/obstacle_c1_5.png (1프레임) |
| `decal_c1_0` | 바닥 장식 (1장) | 16×16 | feet | #2a2d36 | mku/decal_c1_0.png (1프레임) |
| `decal_c1_1` | 바닥 장식 (1장) | 16×16 | feet | #2a2d36 | mku/decal_c1_1.png (1프레임) |
| `decal_c1_2` | 바닥 장식 (1장) | 16×16 | feet | #2a2d36 | mku/decal_c1_2.png (1프레임) |
| `decal_c1_3` | 바닥 장식 (1장) | 16×16 | feet | #2a2d36 | mku/decal_c1_3.png (1프레임) |
| `decal_c1_4` | 바닥 장식 (1장) | 16×16 | feet | #2a2d36 | mku/decal_c1_4.png (1프레임) |
| `decal_c1_5` | 바닥 장식 (1장) | 16×16 | feet | #2a2d36 | mku/decal_c1_5.png (1프레임) |
| `decal_c1_6` | 바닥 장식 (1장) | 16×16 | feet | #2a2d36 | mku/decal_c1_6.png (1프레임) |
| `obstacle_c2_0` | 지형지물 (2장) | 16×16 | feet | #0c0e14 | mku/obstacle_c2_0.png (1프레임) |
| `obstacle_c2_1` | 지형지물 (2장) | 16×16 | feet | #0c0e14 | mku/obstacle_c2_1.png (1프레임) |
| `obstacle_c2_2` | 지형지물 (2장) | 16×16 | feet | #0c0e14 | mku/obstacle_c2_2.png (1프레임) |
| `obstacle_c2_3` | 지형지물 (2장) | 16×16 | feet | #0c0e14 | mku/obstacle_c2_3.png (1프레임) |
| `obstacle_c2_4` | 지형지물 (2장) | 16×16 | feet | #0c0e14 | mku/obstacle_c2_4.png (1프레임) |
| `obstacle_c2_5` | 지형지물 (2장) | 16×16 | feet | #0c0e14 | mku/obstacle_c2_5.png (1프레임) |
| `decal_c2_0` | 바닥 장식 (2장) | 16×16 | feet | #2a2d36 | mku/decal_c2_0.png (1프레임) |
| `decal_c2_1` | 바닥 장식 (2장) | 16×16 | feet | #2a2d36 | mku/decal_c2_1.png (1프레임) |
| `decal_c2_2` | 바닥 장식 (2장) | 16×16 | feet | #2a2d36 | mku/decal_c2_2.png (1프레임) |
| `decal_c2_3` | 바닥 장식 (2장) | 16×16 | feet | #2a2d36 | mku/decal_c2_3.png (1프레임) |
| `decal_c2_4` | 바닥 장식 (2장) | 16×16 | feet | #2a2d36 | mku/decal_c2_4.png (1프레임) |
| `decal_c2_5` | 바닥 장식 (2장) | 16×16 | feet | #2a2d36 | mku/decal_c2_5.png (1프레임) |
| `decal_c2_6` | 바닥 장식 (2장) | 16×16 | feet | #2a2d36 | mku/decal_c2_6.png (1프레임) |
| `obstacle_c3_0` | 지형지물 (3장) | 16×16 | feet | #0c0e14 | mku/obstacle_c3_0.png (1프레임) |
| `obstacle_c3_1` | 지형지물 (3장) | 16×16 | feet | #0c0e14 | mku/obstacle_c3_1.png (1프레임) |
| `obstacle_c3_2` | 지형지물 (3장) | 16×16 | feet | #0c0e14 | mku/obstacle_c3_2.png (1프레임) |
| `obstacle_c3_3` | 지형지물 (3장) | 16×16 | feet | #0c0e14 | mku/obstacle_c3_3.png (1프레임) |
| `obstacle_c3_4` | 지형지물 (3장) | 16×16 | feet | #0c0e14 | mku/obstacle_c3_4.png (1프레임) |
| `obstacle_c3_5` | 지형지물 (3장) | 16×16 | feet | #0c0e14 | mku/obstacle_c3_5.png (1프레임) |
| `decal_c3_0` | 바닥 장식 (3장) | 16×16 | feet | #2a2d36 | mku/decal_c3_0.png (1프레임) |
| `decal_c3_1` | 바닥 장식 (3장) | 16×16 | feet | #2a2d36 | mku/decal_c3_1.png (1프레임) |
| `decal_c3_2` | 바닥 장식 (3장) | 16×16 | feet | #2a2d36 | mku/decal_c3_2.png (1프레임) |
| `decal_c3_3` | 바닥 장식 (3장) | 16×16 | feet | #2a2d36 | mku/decal_c3_3.png (1프레임) |
| `decal_c3_4` | 바닥 장식 (3장) | 16×16 | feet | #2a2d36 | mku/decal_c3_4.png (1프레임) |
| `decal_c3_5` | 바닥 장식 (3장) | 16×16 | feet | #2a2d36 | mku/decal_c3_5.png (1프레임) |
| `decal_c3_6` | 바닥 장식 (3장) | 16×16 | feet | #2a2d36 | mku/decal_c3_6.png (1프레임) |
| `prop_vending` | 물약 자판기 | 22×32 | feet | #3a7bff | mku/prop_vending.png (1프레임) |
| `prop_crate` | 부서지는 상자 | 14×14 | feet | #a07a3a | mku/prop_crate.png (1프레임) |
| `prop_barrel` | 폭발 통 | 14×14 | feet | #c8402a | mku/prop_barrel.png (1프레임) |
| `prop_statue_heal` | 석상 (heal) | 16×16 | feet | #e23a4c | mku/prop_statue_heal.png (1프레임) |
| `prop_statue_energy` | 석상 (energy) | 16×16 | feet | #3fc8e0 | mku/prop_statue_energy.png (1프레임) |
| `prop_statue_sanity` | 석상 (sanity) | 16×16 | feet | #b48aff | mku/prop_statue_sanity.png (1프레임) |

## pickup (3)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `pickup_energy` | 에너지 구슬 | 4×4 | center | #3fc8e0 | mku/pickup_energy.png (1프레임) |
| `pickup_coin` | 코인 | 4×4 | center | #ffd23f | mku/pickup_coin.png (1프레임) |
| `pickup_potion` | 회복 물약 | 9×12 | center | #e23a4c | mku/pickup_potion.png (1프레임) |

## skill (14)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `skill_turret` | 마기 자동포탑 (turret) | 8×8 | center | #4fb3d9 | mku/skill_turret.png (1프레임) |
| `skill_turret_head` | 마기 자동포탑 (turretHead) | 8×8 | center | #8fd3f0 | mku/skill_turret_head.png (1프레임) |
| `skill_turret_big` | 마기 자동포탑 (bigTurret) | 16×16 | center | #8ae0ff | mku/skill_turret_big.png (1프레임) |
| `skill_turret_big_head` | 마기 자동포탑 (bigTurretHead) | 16×16 | center | #b8ecff | mku/skill_turret_big_head.png (1프레임) |
| `skill_turret_shell` | 마기 자동포탑 (shell) | 5×5 | center | #ffb04a | mku/skill_turret_shell.png (1프레임) |
| `skill_mine` | 마기 지뢰 (mine) | 5×5 | center | #d9a03b | mku/skill_mine.png (1프레임) |
| `skill_mine_chain` | 마기 지뢰 (chainMine) | 5×5 | center | #ff6ad9 | mku/skill_mine_chain.png (1프레임) |
| `skill_antimatter_charge` | 반물질포 (charge) | 4×4 | center | #c98aff | mku/skill_antimatter_charge.png (1프레임) |
| `skill_antimatter_shell` | 반물질포 (shell) | 9×9 | center | #a05ad9 | mku/skill_antimatter_shell.png (1프레임) |
| `skill_drone` | 전투 드론 (drone) | 5×5 | center | #5ad9c0 | mku/skill_drone.png (1프레임) |
| `skill_subject` | 불안정 실험체 (subject) | 7×7 | center | #9ad94a | mku/skill_subject.png (1프레임) |
| `skill_experiment_shell` | 실험 병기 (shell) | 6×6 | center | #d9d03b | mku/skill_experiment_shell.png (1프레임) |
| `ult_first_law` | 열역학 제1법칙 (particle) | 8×8 | center | #ff9a3c | mku/ult_first_law.png (1프레임) |
| `ult_singularity` | 특이점 실험 (core) | 10×10 | center | #ff3a4a | mku/ult_singularity.png (1프레임) |

## lab (7)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `lab_capsule` | 실험체 캡슐 | 22×26 | feet | #9ad8e0 | mku/lab_capsule.png (1프레임) |
| `lab_job_device` | 직업 선택 장치 | 28×18 | feet | #e0c060 | mku/lab_job_device.png (1프레임) |
| `lab_portal` | 시뮬레이션 포털 | 34×22 | feet | #7a5aff | mku/lab_portal.png (1프레임) |
| `lab_codex` | 도감 단말 | 20×24 | feet | #5a9ab0 | mku/lab_codex.png (1프레임) |
| `lab_archive` | 기억조각 보관대 | 24×26 | feet | #b07ae0 | mku/lab_archive.png (1프레임) |
| `lab_gemini` | 미모사 제미니 | 14×22 | feet | #7ae0e0 | mku/lab_gemini.png (1프레임) |
| `lab_window` | 관측창 | 100×12 | feet | #06090c | mku/lab_window.png (1프레임) |

## item (32)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `item_slime_stew` | 슬라임 스튜 | 8×8 | center | #8fd16a | mku/item_slime_stew.png (1프레임) |
| `item_magicasol` | 마기카솔 | 8×8 | center | #5ac8e0 | mku/item_magicasol.png (1프레임) |
| `item_nameless_sword` | 이름 없는 검 | 8×8 | center | #d0d8e8 | mku/item_nameless_sword.png (1프레임) |
| `item_nameless_helm` | 이름 없는 투구 | 8×8 | center | #9aa4b0 | mku/item_nameless_helm.png (1프레임) |
| `item_broken_blade` | 부러진 칼날 | 8×8 | center | #b0b0b0 | mku/item_broken_blade.png (1프레임) |
| `item_broken_hilt` | 망가진 손잡이 | 8×8 | center | #8a7a5a | mku/item_broken_hilt.png (1프레임) |
| `item_elegant_magi` | 엘러건트 마기 | 8×8 | center | #4a8cff | mku/item_elegant_magi.png (1프레임) |
| `item_antimatter_sample` | 실험용 반물질 | 8×8 | center | #a05ad9 | mku/item_antimatter_sample.png (1프레임) |
| `item_combat_theory` | 마력 전투 응용법 | 8×8 | center | #5a8ad9 | mku/item_combat_theory.png (1프레임) |
| `item_oak_heart` | 참나무의 심장 | 8×8 | center | #6a9a3a | mku/item_oak_heart.png (1프레임) |
| `item_hanwoo_steak` | 한우촌의 생등심 | 8×8 | center | #c85a5a | mku/item_hanwoo_steak.png (1프레임) |
| `item_lee_seal` | 이씨 가문의 증표 | 8×8 | center | #ffd23f | mku/item_lee_seal.png (1프레임) |
| `item_magowiki_codex` | 마고위키 필사본 | 8×8 | center | #e0c060 | mku/item_magowiki_codex.png (1프레임) |
| `item_lsd_r` | LSD-R | 8×8 | center | #e070c0 | mku/item_lsd_r.png (1프레임) |
| `item_panic_brand` | 광기의 각인 | 8×8 | center | #ff4a4a | mku/item_panic_brand.png (1프레임) |
| `item_hanabi` | 한아비 | 8×8 | center | #ffb04a | mku/item_hanabi.png (1프레임) |
| `item_gisup_stone` | 기숲 비석의 조각 | 8×8 | center | #7a8a9a | mku/item_gisup_stone.png (1프레임) |
| `item_afro_belt` | 아프로 씨의 벨트 | 8×8 | center | #a45cff | mku/item_afro_belt.png (1프레임) |
| `item_regulus_shard` | 레굴루스의 의식조각 | 8×8 | center | #8a6aff | mku/item_regulus_shard.png (1프레임) |
| `item_caesar_crown` | 카이사르의 왕관 | 8×8 | center | #ffd23f | mku/item_caesar_crown.png (1프레임) |
| `item_acrux_cross` | 아크룩스의 십자가 | 8×8 | center | #e0e0ff | mku/item_acrux_cross.png (1프레임) |
| `item_orion_belt` | 오리온의 허리띠 | 8×8 | center | #5ad9ff | mku/item_orion_belt.png (1프레임) |
| `item_divine_sword` | 신검 영디·마기 | 8×8 | center | #ff3b3b | mku/item_divine_sword.png (1프레임) |
| `item_al_gul_blade` | 알 굴 참마검 | 8×8 | center | #ffe08a | mku/item_al_gul_blade.png (1프레임) |
| `item_wonhon_lump` | 원혼 덩어리 | 8×8 | center | #7a1f3a | mku/item_wonhon_lump.png (1프레임) |
| `item_gihwan_arm` | 기환의 팔 | 8×8 | center | #3a9ad9 | mku/item_gihwan_arm.png (1프레임) |
| `item_death_whistle` | 바바리안 데스 휘슬 | 8×8 | center | #c86a3a | mku/item_death_whistle.png (1프레임) |
| `item_royal_seal` | 특무 인장 | 8×8 | center | #6a4ad9 | mku/item_royal_seal.png (1프레임) |
| `item_orion_shield` | 오리온의 방패 | 8×8 | center | #d9c25a | mku/item_orion_shield.png (1프레임) |
| `item_hectar_ram` | 헥타르 RAM | 8×8 | center | #3a9aff | mku/item_hectar_ram.png (1프레임) |
| `item_ancient_core` | 고대병기의 코어 | 8×8 | center | #9a4aff | mku/item_ancient_core.png (1프레임) |
| `item_eclipse_core` | 식광의 핵 | 8×8 | center | #c8a8ff | mku/item_eclipse_core.png (1프레임) |

## icon (17)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `icon_skill_magiTurret` | 마기 자동포탑 | 16×16 | center | #4fb3d9 | mku/icon_skill_magiTurret.png (1프레임) |
| `icon_skill_magiMine` | 마기 지뢰 | 16×16 | center | #d9a03b | mku/icon_skill_magiMine.png (1프레임) |
| `icon_skill_antimatterCannon` | 반물질포 | 16×16 | center | #a05ad9 | mku/icon_skill_antimatterCannon.png (1프레임) |
| `icon_skill_magiField` | 마기역장 | 16×16 | center | #8aa4c8 | mku/icon_skill_magiField.png (1프레임) |
| `icon_skill_railgun` | 레일건 | 16×16 | center | #3ba7d9 | mku/icon_skill_railgun.png (1프레임) |
| `icon_skill_combatDrone` | 전투 드론 | 16×16 | center | #5ad9c0 | mku/icon_skill_combatDrone.png (1프레임) |
| `icon_skill_unstableSubject` | 불안정 실험체 | 16×16 | center | #9ad94a | mku/icon_skill_unstableSubject.png (1프레임) |
| `icon_skill_magiCorruption` | 마기 변질 | 16×16 | center | #c83a5a | mku/icon_skill_magiCorruption.png (1프레임) |
| `icon_skill_experimentalWeapon` | 실험 병기 | 16×16 | center | #d9d03b | mku/icon_skill_experimentalWeapon.png (1프레임) |
| `icon_skill_purifyingWings` | 정화의 날개 | 16×16 | center | #d93a3a | mku/icon_skill_purifyingWings.png (1프레임) |
| `icon_skill_mkPrototype` | MK : 프로토타입 | 16×16 | center | #d9783b | mku/icon_skill_mkPrototype.png (1프레임) |
| `icon_skill_reductionist` | 환원주의자 | 16×16 | center | #5ad95a | mku/icon_skill_reductionist.png (1프레임) |
| `icon_ult_firstLaw` | 열역학 제1법칙 | 16×16 | center | #ff9a3c | mku/icon_ult_firstLaw.png (1프레임) |
| `icon_ult_thunderbolt` | 벼락 | 16×16 | center | #4ab0ff | mku/icon_ult_thunderbolt.png (1프레임) |
| `icon_ult_singularity` | 특이점 실험 | 16×16 | center | #ff3a4a | mku/icon_ult_singularity.png (1프레임) |
| `icon_gemini` | 미모사 제미니 (icon) | 16×16 | center | #4ab0ff | mku/icon_gemini.png (1프레임) |
| `portrait_gemini` | 미모사 제미니 (portrait) | 48×64 | center | #4ab0ff | mku/portrait_gemini.png (1프레임) |

## tile (23)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `tile_floor_c1` | 방 바닥 (1장) | 16×16 | center | #1c2430 | mku/tile_floor_c1.png (1프레임) |
| `tile_corridor_c1` | 복도 바닥 (1장) | 16×16 | center | #18202a | mku/tile_corridor_c1.png (1프레임) |
| `tile_wall_c1` | 벽 (1장) | 16×16 | center | #3a4656 | mku/tile_wall_c1.png (1프레임) |
| `tile_floor_c2` | 방 바닥 (2장) | 16×16 | center | #1e2630 | mku/tile_floor_c2.png (1프레임) |
| `tile_corridor_c2` | 복도 바닥 (2장) | 16×16 | center | #182028 | mku/tile_corridor_c2.png (1프레임) |
| `tile_wall_c2` | 벽 (2장) | 16×16 | center | #5a6a7a | mku/tile_wall_c2.png (1프레임) |
| `tile_floor_c3` | 방 바닥 (3장) | 16×16 | center | #1a0c0e | mku/tile_floor_c3.png (1프레임) |
| `tile_corridor_c3` | 복도 바닥 (3장) | 16×16 | center | #120708 | mku/tile_corridor_c3.png (1프레임) |
| `tile_wall_c3` | 벽 (3장) | 16×16 | center | #5a1a1e | mku/tile_wall_c3.png (1프레임) |
| `tile_door` | 잠긴 문 | 16×16 | center | #c8643a | — |
| `tile_floor_c1_v0` | 방 바닥 (1장 변형) | 16×16 | center | #1c2430 | mku/tile_floor_c1_v0.png (1프레임) |
| `tile_floor_c1_v1` | 방 바닥 (1장 변형) | 16×16 | center | #1c2430 | mku/tile_floor_c1_v1.png (1프레임) |
| `tile_floor_c1_v2` | 방 바닥 (1장 변형) | 16×16 | center | #1c2430 | mku/tile_floor_c1_v2.png (1프레임) |
| `tile_floor_c1_v3` | 방 바닥 (1장 변형) | 16×16 | center | #1c2430 | mku/tile_floor_c1_v3.png (1프레임) |
| `tile_floor_c1_v4` | 방 바닥 (1장 변형) | 16×16 | center | #1c2430 | mku/tile_floor_c1_v4.png (1프레임) |
| `tile_floor_c1_v5` | 방 바닥 (1장 변형) | 16×16 | center | #1c2430 | mku/tile_floor_c1_v5.png (1프레임) |
| `tile_floor_c2_v0` | 방 바닥 (2장 변형) | 16×16 | center | #1e2630 | mku/tile_floor_c2_v0.png (1프레임) |
| `tile_floor_c2_v1` | 방 바닥 (2장 변형) | 16×16 | center | #1e2630 | mku/tile_floor_c2_v1.png (1프레임) |
| `tile_floor_c2_v2` | 방 바닥 (2장 변형) | 16×16 | center | #1e2630 | mku/tile_floor_c2_v2.png (1프레임) |
| `tile_floor_c2_v3` | 방 바닥 (2장 변형) | 16×16 | center | #1e2630 | mku/tile_floor_c2_v3.png (1프레임) |
| `tile_floor_c3_v0` | 방 바닥 (3장 변형) | 16×16 | center | #1a0c0e | mku/tile_floor_c3_v0.png (1프레임) |
| `tile_floor_c3_v1` | 방 바닥 (3장 변형) | 16×16 | center | #1a0c0e | mku/tile_floor_c3_v1.png (1프레임) |
| `tile_floor_c3_v2` | 방 바닥 (3장 변형) | 16×16 | center | #1a0c0e | mku/tile_floor_c3_v2.png (1프레임) |

## fx (6)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `fx_hit_tech` | 타격 불꽃(기술) | 10×10 | center | #5ad0ff | mku/fx_hit_tech.png (1프레임) |
| `fx_hit_magic` | 타격 불꽃(마기) | 10×10 | center | #c08aff | mku/fx_hit_magic.png (1프레임) |
| `fx_hit_physical` | 타격 불꽃(물리) | 10×10 | center | #ffffff | mku/fx_hit_physical.png (1프레임) |
| `fx_explosion` | 폭발 | 30×30 | center | #ff5a3a | mku/fx_explosion.png (5프레임) |
| `fx_elite_burst` | 엘리트 처치 폭발 | 34×34 | center | #c08aff | mku/fx_elite_burst.png (1프레임) |
| `fx_spawn` | 적 소환 연기 | 20×20 | center | #8a5ad9 | mku/fx_spawn.png (1프레임) |
