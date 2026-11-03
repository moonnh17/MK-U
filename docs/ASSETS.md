# 도트 아트 목록

`npm run assets`로 데이터에서 다시 만든다. 직접 고치지 말 것.

- 그림 파일: `public/assets/` 아래 PNG. 키마다 한 장, 프레임은 가로로 이어 붙인다.
- 등록: `src/data/art.json`의 `sprites`에 `"키": { "file", "frameWidth", "frameHeight", "frames", "anchor" }`. 적지 않은 키는 색 사각형 그대로.
- 크기: 권장 캔버스 = 판정 크기. 더 크게 그려도 판정은 그대로다. 기준점 feet는 판정이 그림 아래쪽에, center는 가운데에 놓인다.
- 애니메이션(플레이어·적): `"anims": { "idle": { "from", "to", "fps" }, "move": { ... } }`(프레임 번호 0부터). 그림은 오른쪽을 보게 그리고(왼쪽이면 `"facing": "left"`), 움직이는 방향에 따라 좌우로 뒤집는다.
- item·icon은 게임 화면이 아니라 카드·인벤토리·HUD 아이콘이다. tile은 한 장을 반복해서 깐다(문은 잠겼을 때만 보인다).

전체 456개 · 그림 있음 441개

## player (3)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `player_human` | 플레이어 | 10×10 | feet | #e8e2d0 | mku/player_human.png (5프레임) |
| `player_hectar` | 플레이어 헥타르 | 10×10 | feet | #e8e2d0 | mku/player_hectar.png (5프레임) |
| `player_acro` | 플레이어 아크로 | 10×10 | feet | #e8e2d0 | mku/player_acro.png (5프레임) |

## weapon (31)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `weapon_pistol` | 권총 | 6×6 | center | #c8c8c8 | mku/weapon_pistol.png (1프레임) |
| `weapon_shotgun` | 산탄총 | 8×8 | center | #c89a5a | mku/weapon_shotgun.png (1프레임) |
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
| `weapon_broken_blade` | 부러진 칼날 | 6×6 | center | #b8bcc8 | mku/weapon_broken_blade.png (1프레임) |
| `weapon_hanabi` | 한아비 | 11×11 | center | #ffb04a | mku/weapon_hanabi.png (1프레임) |
| `weapon_al_gul_blade` | 알 굴 참마검 | 11×11 | center | #c8ccd8 | mku/weapon_al_gul_blade.png (1프레임) |
| `weapon_gihwan_arm` | 기환의 팔 | 11×11 | center | #3a7bff | mku/weapon_gihwan_arm.png (1프레임) |
| `weapon_ancient_core` | 고대병기의 코어 | 8×8 | center | #a05aff | mku/weapon_ancient_core.png (1프레임) |
| `weapon_eclipse_core` | 식광의 핵 | 8×8 | center | #ff3a4a | mku/weapon_eclipse_core.png (1프레임) |
| `weapon_algieba_sling` | 알기에바의 새총 | 11×11 | center | #5ad0f0 | mku/weapon_algieba_sling.png (1프레임) |
| `weapon_nekkar_cleaver` | 네카르의 식칼 | 9×9 | center | #a03a3a | mku/weapon_nekkar_cleaver.png (1프레임) |
| `weapon_argo_banner` | 아르고 원정대의 깃발 | 14×14 | center | #d02a3a | mku/weapon_argo_banner.png (1프레임) |
| `weapon_curved_bow` | 곡궁 | 9×9 | center | #a0784a | mku/weapon_curved_bow.png (1프레임) |
| `weapon_mg70` | 헥타르제 MG70 | 11×11 | center | #3a9ad9 | mku/weapon_mg70.png (1프레임) |
| `weapon_flame_staff` | 보급형 마력사출기 | 10×10 | center | #ff7a2a | mku/weapon_flame_staff.png (1프레임) |
| `weapon_zephyr` | 서풍 | 10×10 | center | #5ad0d0 | mku/weapon_zephyr.png (1프레임) |
| `weapon_soul_calibur` | 소울 칼리버 | 12×12 | center | #7a4ad0 | mku/weapon_soul_calibur.png (1프레임) |
| `weapon_magi_fang` | 마기족의 송곳니 | 11×11 | center | #c0202a | mku/weapon_magi_fang.png (1프레임) |
| `weapon_antimatter_pistol` | 반물질 권총 | 9×9 | center | #3a7bff | mku/weapon_antimatter_pistol.png (1프레임) |
| `weapon_fist` | 주먹 | 6×6 | center | #e8c8a0 | mku/weapon_fist.png (1프레임) |

## projectile (14)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `fx_golem_laser` | 고대병기의 코어 (fx) | 12×12 | center | #a05aff | mku/fx_golem_laser.png (1프레임) |
| `fx_eclipse_meteor` | 식광의 핵 (fx) | 10×10 | center | #ff3a4a | mku/fx_eclipse_meteor.png (1프레임) |
| `projectile_arrow` | 곡궁 (fx) | 3×3 | center | #c8a070 | mku/projectile_arrow.png (1프레임) |
| `projectile_zephyr_arrow` | 서풍 (fx) | 3×3 | center | #7ae8f0 | mku/projectile_zephyr_arrow.png (1프레임) |
| `fx_soul_burst` | 소울 칼리버 (fx) | 20×20 | center | #c060ff | mku/fx_soul_burst.png (1프레임) |
| `skill_antimatter_shellA` | 반물질 권총 (fx) 외 1곳 | 9×9 | center | #5ab0ff | mku/skill_antimatter_shellA.png (6프레임) |
| `skill_antimatter_blastA` | 반물질 권총 (fx) 외 1곳 | 24×24 | center | #5ab0ff | mku/skill_antimatter_blastA.png (6프레임) |
| `projectile_player` | 플레이어 탄 | 3×3 | center | #fff3a0 | mku/projectile_player.png (1프레임) |
| `fx_melee_slash` | 근접 이펙트 (fx) | 20×20 | center | #ffffff | mku/fx_melee_slash.png (6프레임) |
| `fx_melee_slam` | 근접 이펙트 (fx) | 20×20 | center | #ffffff | mku/fx_melee_slam.png (8프레임) |
| `fx_melee_slash_big` | 근접 이펙트 (fx) | 24×24 | center | #ffffff | mku/fx_melee_slash_big.png (10프레임) |
| `fx_melee_slam_big` | 근접 이펙트 (fx) | 24×24 | center | #ffffff | mku/fx_melee_slam_big.png (5프레임) |
| `fx_buff_aura` | 근접 이펙트 (fx) | 22×22 | center | #ffffff | mku/fx_buff_aura.png (8프레임) |
| `enemy_bullet` | 적 탄 | 4×4 | center | #ff5a5a | mku/enemy_bullet.png (1프레임) |

## enemy (11)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `enemy_tomakki` | 토마끼 | 8×8 | feet | #8fd16a | mku/enemy_tomakki.png (4프레임) |
| `enemy_gaedeulgae` | 개들개 | 11×11 | feet | #c9a24a | mku/enemy_gaedeulgae.png (5프레임) |
| `enemy_akgwi` | 악귀 | 15×15 | feet | #b0383a | mku/enemy_akgwi.png (6프레임) |
| `enemy_ghost_shooter` | 유령 사수 | 11×11 | feet | #c0303a | mku/enemy_ghost_shooter.png (6프레임) |
| `enemy_hectar_trooper` | 헥타르 전투원 | 12×12 | feet | #3a7bff | mku/enemy_hectar_trooper.png (5프레임) |
| `enemy_magi_beetle` | 마기갑충 | 15×15 | feet | #5a8a3a | mku/enemy_magi_beetle.png (10프레임) |
| `enemy_a_memory` | 어느 기억 | 13×13 | feet | #8a7ab0 | mku/enemy_a_memory.png (14프레임) |
| `enemy_ancient_one` | ██ 이름을 빼앗긴 고대인 | 13×13 | feet | #c8b8a0 | mku/enemy_ancient_one.png (12프레임) |
| `enemy_hatred_shard` | 증오의 파편 | 8×8 | feet | #ff3a4a | mku/enemy_hatred_shard.png (10프레임) |
| `enemy_executor` | 집행자 | 18×18 | feet | #a0a8b8 | mku/enemy_executor.png (13프레임) |
| `enemy_archon` | 집정관 | 16×16 | feet | #e8c860 | mku/enemy_archon.png (13프레임) |

## boss (29)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `enemy_fusion_akgwi` | 융합악귀 | 39×39 | feet | #7a1f3a | mku/enemy_fusion_akgwi.png (4프레임) |
| `enemy_electric_ring` | 전기환띠 | 42×42 | feet | #3a9ad9 | mku/enemy_electric_ring.png (6프레임) |
| `enemy_training_dummy` | 보스 자리(임시 표적) | 24×24 | feet | #8a5ad9 | mku/enemy_training_dummy.png (1프레임) |
| `enemy_ancestor_echo` | 선조의 잔상 | 42×42 | feet | #b0583a | mku/enemy_ancestor_echo.png (3프레임) |
| `enemy_royal_mage` | 왕실특무마기법사 외 1곳 | 33×33 | feet | #6a4ad9 | mku/enemy_royal_mage.png (4프레임) |
| `enemy_orion_crusader` | 오리온의 성전사 | 42×42 | feet | #d9c25a | mku/enemy_orion_crusader.png (9프레임) |
| `enemy_hectar_chief` | 헥타르 수석 연구원 | 36×36 | feet | #3a9aff | mku/enemy_hectar_chief.png (9프레임) |
| `enemy_magi_golem` | 마기골렘 | 48×48 | feet | #8a6a4a | mku/enemy_magi_golem.png (10프레임) |
| `enemy_eclipse` | 식광 | 42×42 | feet | #c8a8ff | mku/enemy_eclipse.png (16프레임) |
| `enemy_magi_kaiser` | 마기카이저 | 51×51 | feet | #d02828 | mku/enemy_magi_kaiser.png (10프레임) |
| `enemy_fusion_akgwi_phase1` | 융합악귀 (1단계) | 39×39 | feet | #7a1f3a | — |
| `enemy_fusion_akgwi_phase2` | 융합악귀 (2단계) | 39×39 | feet | #7a1f3a | mku/enemy_fusion_akgwi_phase2.png (4프레임) |
| `enemy_electric_ring_phase1` | 전기환띠 (1단계) | 42×42 | feet | #3a9ad9 | — |
| `enemy_electric_ring_phase2` | 전기환띠 (2단계) | 42×42 | feet | #3a9ad9 | — |
| `enemy_hectar_chief_phase1` | 헥타르 수석 연구원 (1단계) | 36×36 | feet | #3a9aff | — |
| `enemy_hectar_chief_phase2` | 헥타르 수석 연구원 (2단계) | 36×36 | feet | #3a9aff | mku/enemy_hectar_chief_phase2.png (5프레임) |
| `enemy_magi_golem_phase1` | 마기골렘 (1단계) | 48×48 | feet | #8a6a4a | — |
| `enemy_magi_golem_phase2` | 마기골렘 (2단계) | 48×48 | feet | #8a6a4a | mku/enemy_magi_golem_phase2.png (9프레임) |
| `enemy_eclipse_phase1` | 식광 (1단계) | 42×42 | feet | #c8a8ff | — |
| `enemy_eclipse_phase2` | 식광 (2단계) | 42×42 | feet | #c8a8ff | mku/enemy_eclipse_phase2.png (24프레임) |
| `enemy_magi_kaiser_phase1` | 마기카이저 (1단계) | 51×51 | feet | #d02828 | mku/enemy_magi_kaiser_phase1.png (4프레임) |
| `enemy_magi_kaiser_phase2` | 마기카이저 (2단계) | 51×51 | feet | #d02828 | mku/enemy_magi_kaiser_phase2.png (45프레임) |
| `enemy_magi_kaiser_phase3` | 마기카이저 (3단계) | 51×51 | feet | #d02828 | mku/enemy_magi_kaiser_phase3.png (50프레임) |
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
| `spire_medium` | 마기수집첨탑(중형) 외 1곳 | 16×48 | feet | #3a0e12 | mku/spire_medium.png (1프레임) |
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
| `pickup_coin` | 마기 입자 | 4×4 | center | #ffd23f | mku/pickup_coin.png (1프레임) |
| `pickup_potion` | 회복 물약 | 9×12 | center | #e23a4c | mku/pickup_potion.png (1프레임) |

## skill (162)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `skill_turret1` | 마기 자동포탑 (turret1) | 8×8 | center | #4fb3d9 | mku/skill_turret1.png (1프레임) |
| `skill_turret2` | 마기 자동포탑 (turret2) | 8×8 | center | #4fb3d9 | mku/skill_turret2.png (1프레임) |
| `skill_turret3` | 마기 자동포탑 (turret3) | 8×8 | center | #4fb3d9 | mku/skill_turret3.png (1프레임) |
| `skill_turret1_head` | 마기 자동포탑 (turretHead1) | 8×8 | center | #8fd3f0 | mku/skill_turret1_head.png (1프레임) |
| `skill_turret2_head` | 마기 자동포탑 (turretHead2) | 8×8 | center | #8fd3f0 | mku/skill_turret2_head.png (1프레임) |
| `skill_turret3_head` | 마기 자동포탑 (turretHead3) | 8×8 | center | #8fd3f0 | mku/skill_turret3_head.png (1프레임) |
| `skill_bigturret_idle` | 마기 자동포탑 (bigIdle) | 16×16 | center | #8ae0ff | mku/skill_bigturret_idle.png (6프레임) |
| `skill_bigturret_rapid` | 마기 자동포탑 (bigRapid) | 16×16 | center | #8ae0ff | mku/skill_bigturret_rapid.png (6프레임) |
| `skill_bigturret_laser` | 마기 자동포탑 (bigLaser) | 16×16 | center | #8ae0ff | mku/skill_bigturret_laser.png (4프레임) |
| `skill_bigturret_shell` | 마기 자동포탑 (bigShell) | 16×16 | center | #8ae0ff | mku/skill_bigturret_shell.png (6프레임) |
| `skill_bigturret_bullet` | 마기 자동포탑 (bullet) | 3×3 | center | #8ae0ff | mku/skill_bigturret_bullet.png (3프레임) |
| `skill_bigturret_beam` | 마기 자동포탑 (beam) | 6×6 | center | #8ae0ff | mku/skill_bigturret_beam.png (1프레임) |
| `skill_bigturret_shot` | 마기 자동포탑 (shell) | 5×5 | center | #ffb04a | mku/skill_bigturret_shot.png (4프레임) |
| `skill_bigturret_blast` | 마기 자동포탑 (blast) | 20×20 | center | #8ae0ff | mku/skill_bigturret_blast.png (8프레임) |
| `skill_bigturret_hit` | 마기 자동포탑 (hit) | 12×12 | center | #8ae0ff | mku/skill_bigturret_hit.png (7프레임) |
| `skill_mine1` | 마기 지뢰 (mine1) | 5×5 | center | #d9a03b | mku/skill_mine1.png (1프레임) |
| `skill_mine2` | 마기 지뢰 (mine2) | 5×5 | center | #d9a03b | mku/skill_mine2.png (1프레임) |
| `skill_mine3` | 마기 지뢰 (mine3) | 5×5 | center | #d9a03b | mku/skill_mine3.png (1프레임) |
| `skill_mine_blast1` | 마기 지뢰 (blast1) | 20×20 | center | #d9a03b | mku/skill_mine_blast1.png (6프레임) |
| `skill_mine_blast2` | 마기 지뢰 (blast2) | 20×20 | center | #d9a03b | mku/skill_mine_blast2.png (6프레임) |
| `skill_mine_blast3` | 마기 지뢰 (blast3) | 20×20 | center | #d9a03b | mku/skill_mine_blast3.png (6프레임) |
| `skill_chainmine_idle` | 마기 지뢰 (chainMine) | 5×5 | center | #ff6ad9 | mku/skill_chainmine_idle.png (4프레임) |
| `skill_chainmine_trigger` | 마기 지뢰 (chainTrigger) | 8×8 | center | #ff6ad9 | mku/skill_chainmine_trigger.png (3프레임) |
| `skill_chainmine_blast` | 마기 지뢰 (chainBlast) | 24×24 | center | #ff6ad9 | mku/skill_chainmine_blast.png (8프레임) |
| `skill_chainmine_link` | 마기 지뢰 (chainLink) | 8×8 | center | #ff6ad9 | mku/skill_chainmine_link.png (3프레임) |
| `skill_chainmine_mini` | 마기 지뢰 (chainMini) | 5×5 | center | #ff6ad9 | mku/skill_chainmine_mini.png (10프레임) |
| `skill_chainmine_ring` | 마기 지뢰 (chainRing) | 16×16 | center | #ff6ad9 | mku/skill_chainmine_ring.png (8프레임) |
| `skill_antimatter_charge1` | 반물질포 (charge1) | 4×4 | center | #c98aff | mku/skill_antimatter_charge1.png (1프레임) |
| `skill_antimatter_charge2` | 반물질포 (charge2) | 4×4 | center | #c98aff | mku/skill_antimatter_charge2.png (1프레임) |
| `skill_antimatter_charge3` | 반물질포 (charge3) | 4×4 | center | #c98aff | mku/skill_antimatter_charge3.png (1프레임) |
| `skill_antimatter_shell1` | 반물질포 (shell1) | 9×9 | center | #a05ad9 | mku/skill_antimatter_shell1.png (1프레임) |
| `skill_antimatter_shell2` | 반물질포 (shell2) | 9×9 | center | #a05ad9 | mku/skill_antimatter_shell2.png (1프레임) |
| `skill_antimatter_shell3` | 반물질포 (shell3) | 9×9 | center | #a05ad9 | mku/skill_antimatter_shell3.png (1프레임) |
| `skill_antimatter_blast1` | 반물질포 (blast1) | 20×20 | center | #a05ad9 | mku/skill_antimatter_blast1.png (1프레임) |
| `skill_antimatter_blast2` | 반물질포 (blast2) | 20×20 | center | #a05ad9 | mku/skill_antimatter_blast2.png (1프레임) |
| `skill_antimatter_blast3` | 반물질포 (blast3) | 20×20 | center | #a05ad9 | mku/skill_antimatter_blast3.png (1프레임) |
| `skill_antimatter_collapse` | 반물질포 (collapse) | 20×20 | center | #a05ad9 | mku/skill_antimatter_collapse.png (4프레임) |
| `skill_antimatter_chargeA` | 반물질포 (chargeA) | 8×8 | center | #c98aff | mku/skill_antimatter_chargeA.png (6프레임) |
| `skill_antimatter_trailA` | 반물질포 (trailA) | 9×9 | center | #a05ad9 | mku/skill_antimatter_trailA.png (4프레임) |
| `skill_antimatter_impactA` | 반물질포 (impactA) | 20×20 | center | #a05ad9 | mku/skill_antimatter_impactA.png (3프레임) |
| `skill_field1` | 마기역장 (shield1) | 24×24 | center | #8aa4c8 | mku/skill_field1.png (1프레임) |
| `skill_field2` | 마기역장 (shield2) | 24×24 | center | #8aa4c8 | mku/skill_field2.png (1프레임) |
| `skill_field3` | 마기역장 (shield3) | 24×24 | center | #8aa4c8 | mku/skill_field3.png (1프레임) |
| `skill_fieldA_spawn` | 마기역장 (spawnA) | 24×24 | center | #8aa4c8 | mku/skill_fieldA_spawn.png (5프레임) |
| `skill_fieldA_loop` | 마기역장 (loopA) | 24×24 | center | #8aa4c8 | mku/skill_fieldA_loop.png (8프레임) |
| `skill_fieldA_end` | 마기역장 (endA) | 24×24 | center | #8aa4c8 | mku/skill_fieldA_end.png (5프레임) |
| `skill_fieldA_contact` | 마기역장 (contactA) | 12×12 | center | #8aa4c8 | mku/skill_fieldA_contact.png (8프레임) |
| `skill_fieldA_hex` | 마기역장 (hexA) | 10×10 | center | #8aa4c8 | mku/skill_fieldA_hex.png (1프레임) |
| `skill_fieldA_deflect` | 마기역장 (deflectA) | 10×10 | center | #8aa4c8 | mku/skill_fieldA_deflect.png (5프레임) |
| `skill_rail_beam1` | 레일건 (beam1) | 8×8 | center | #6a9cff | mku/skill_rail_beam1.png (1프레임) |
| `skill_rail_beam2` | 레일건 (beam2) | 8×8 | center | #6a9cff | mku/skill_rail_beam2.png (1프레임) |
| `skill_rail_beam3` | 레일건 (beam3) | 8×8 | center | #6a9cff | mku/skill_rail_beam3.png (1프레임) |
| `skill_rail_hit` | 레일건 (hit) | 10×10 | center | #6a9cff | mku/skill_rail_hit.png (1프레임) |
| `skill_rail_charge` | 레일건 (charge) | 8×8 | center | #6a9cff | mku/skill_rail_charge.png (1프레임) |
| `skill_rail_end` | 레일건 (end) | 10×10 | center | #6a9cff | mku/skill_rail_end.png (1프레임) |
| `skill_rail_wave` | 레일건 (wave) | 12×12 | center | #6a9cff | mku/skill_rail_wave.png (1프레임) |
| `skill_rail_mark` | 레일건 (mark) | 8×8 | center | #6a9cff | mku/skill_rail_mark.png (1프레임) |
| `skill_railA_charge` | 레일건 (chargeA) | 10×10 | center | #6a9cff | mku/skill_railA_charge.png (8프레임) |
| `skill_railA_muzzle` | 레일건 (muzzleA) | 12×12 | center | #6a9cff | mku/skill_railA_muzzle.png (7프레임) |
| `skill_railA_hit` | 레일건 (hitA) | 10×10 | center | #6a9cff | mku/skill_railA_hit.png (7프레임) |
| `skill_railA_burst` | 레일건 (burstA) | 16×16 | center | #6a9cff | mku/skill_railA_burst.png (8프레임) |
| `skill_railA_chain` | 레일건 (chainA) | 8×8 | center | #6a9cff | mku/skill_railA_chain.png (7프레임) |
| `skill_drone1` | 전투 드론 (drone1) | 5×5 | center | #5ad9c0 | mku/skill_drone1.png (1프레임) |
| `skill_drone2` | 전투 드론 (drone2) | 5×5 | center | #5ad9c0 | mku/skill_drone2.png (1프레임) |
| `skill_drone3` | 전투 드론 (drone3) | 5×5 | center | #5ad9c0 | mku/skill_drone3.png (1프레임) |
| `skill_swarm_idle` | 전투 드론 (swarmIdle) | 8×8 | center | #5ad9c0 | mku/skill_swarm_idle.png (8프레임) |
| `skill_swarm_move` | 전투 드론 (swarmMove) | 8×8 | center | #5ad9c0 | mku/skill_swarm_move.png (8프레임) |
| `skill_swarm_charge` | 전투 드론 (swarmCharge) | 8×8 | center | #5ad9c0 | mku/skill_swarm_charge.png (8프레임) |
| `skill_swarm_laser` | 전투 드론 (swarmLaser) | 8×8 | center | #5ad9c0 | mku/skill_swarm_laser.png (5프레임) |
| `skill_swarm_shot` | 전투 드론 (shot) | 3×3 | center | #5ad9c0 | mku/skill_swarm_shot.png (3프레임) |
| `skill_subject1` | 불안정 실험체 (subject1) | 7×7 | center | #9ad94a | mku/skill_subject1.png (1프레임) |
| `skill_subject2` | 불안정 실험체 (subject2) | 7×7 | center | #9ad94a | mku/skill_subject2.png (1프레임) |
| `skill_subject3` | 불안정 실험체 (subject3) | 7×7 | center | #9ad94a | mku/skill_subject3.png (1프레임) |
| `skill_corrupt_mark2` | 불안정 실험체 (aura2) 외 1곳 | 12×12 | center | #9ad94a | mku/skill_corrupt_mark2.png (1프레임) |
| `skill_corrupt_mark3` | 불안정 실험체 (aura3) 외 1곳 | 12×12 | center | #9ad94a | mku/skill_corrupt_mark3.png (1프레임) |
| `skill_acro_spawn` | 불안정 실험체 (spawn) 외 1곳 | 13×13 | center | #9ad94a | mku/skill_acro_spawn.png (4프레임) |
| `skill_acro_bullet` | 불안정 실험체 (bullet) 외 2곳 | 7×7 | center | #9ad94a | mku/skill_acro_bullet.png (3프레임) |
| `skill_acro_shard` | 불안정 실험체 (shard) 외 2곳 | 15×15 | center | #9ad94a | mku/skill_acro_shard.png (4프레임) |
| `skill_acro_blast` | 불안정 실험체 (blast) 외 4곳 | 20×20 | center | #9ad94a | mku/skill_acro_blast.png (7프레임) |
| `skill_acro_flash` | 불안정 실험체 (flash) 외 4곳 | 8×8 | center | #9ad94a | mku/skill_acro_flash.png (3프레임) |
| `skill_specimen_spawn` | 불안정 실험체 (spawnA) | 14×14 | center | #9ad94a | mku/skill_specimen_spawn.png (7프레임) |
| `skill_specimen_idle` | 불안정 실험체 (idleA) | 7×7 | center | #9ad94a | mku/skill_specimen_idle.png (7프레임) |
| `skill_specimen_move` | 불안정 실험체 (moveA) | 7×7 | center | #9ad94a | mku/skill_specimen_move.png (6프레임) |
| `skill_specimen_attack` | 불안정 실험체 (attackA) | 12×12 | center | #9ad94a | mku/skill_specimen_attack.png (4프레임) |
| `skill_specimen_power` | 불안정 실험체 (powerA) | 11×11 | center | #9ad94a | mku/skill_specimen_power.png (1프레임) |
| `skill_specimen_variant` | 불안정 실험체 (variantA) | 14×14 | center | #9ad94a | mku/skill_specimen_variant.png (3프레임) |
| `skill_specimen_death` | 불안정 실험체 (deathA) | 14×14 | center | #9ad94a | mku/skill_specimen_death.png (6프레임) |
| `skill_corrupt_mark1` | 마기 변질 (mark1) | 12×12 | center | #c83a5a | mku/skill_corrupt_mark1.png (1프레임) |
| `skill_corrupt_smoke` | 마기 변질 (smoke) | 20×20 | center | #c83a5a | mku/skill_corrupt_smoke.png (6프레임) |
| `skill_acro_pull` | 마기 변질 (pull) 외 1곳 | 18×18 | center | #c83a5a | mku/skill_acro_pull.png (5프레임) |
| `skill_acro_dispel` | 마기 변질 (end) 외 1곳 | 17×17 | center | #c83a5a | mku/skill_acro_dispel.png (4프레임) |
| `skill_corruptA_shot` | 마기 변질 (shotA) | 20×20 | center | #c83a5a | mku/skill_corruptA_shot.png (9프레임) |
| `skill_corruptA_mark` | 마기 변질 (markA) | 12×12 | center | #c83a5a | mku/skill_corruptA_mark.png (8프레임) |
| `skill_corruptA_aura` | 마기 변질 (auraA) | 14×14 | center | #c83a5a | mku/skill_corruptA_aura.png (9프레임) |
| `skill_corruptA_attack` | 마기 변질 (attackA) | 14×14 | center | #c83a5a | mku/skill_corruptA_attack.png (6프레임) |
| `skill_corruptA_end` | 마기 변질 (endA) | 14×14 | center | #c83a5a | mku/skill_corruptA_end.png (9프레임) |
| `skill_experiment_laser` | 실험 병기 (laser) | 20×20 | center | #d9d03b | mku/skill_experiment_laser.png (1프레임) |
| `skill_acro_slice` | 실험 병기 (slice) | 18×18 | center | #d9d03b | mku/skill_acro_slice.png (4프레임) |
| `skill_pandora_shell` | 실험 병기 (shellA) | 6×6 | center | #d9d03b | mku/skill_pandora_shell.png (8프레임) |
| `skill_pandora_blast` | 실험 병기 (blastA) | 22×22 | center | #d9d03b | mku/skill_pandora_blast.png (6프레임) |
| `skill_pandora_burst` | 실험 병기 (burstA) | 20×20 | center | #d9d03b | mku/skill_pandora_burst.png (8프레임) |
| `skill_pandora_laser` | 실험 병기 (laserA) | 20×20 | center | #d9d03b | mku/skill_pandora_laser.png (8프레임) |
| `skill_pandora_shock` | 실험 병기 (shockA) | 20×20 | center | #d9d03b | mku/skill_pandora_shock.png (4프레임) |
| `skill_pandora_slice` | 실험 병기 (sliceA) | 20×20 | center | #d9d03b | mku/skill_pandora_slice.png (6프레임) |
| `skill_pandora_pull` | 실험 병기 (pullA) | 22×22 | center | #d9d03b | mku/skill_pandora_pull.png (6프레임) |
| `skill_wings_slash1` | 정화의 날개 (slash1) | 30×30 | center | #d93a3a | mku/skill_wings_slash1.png (16프레임) |
| `skill_wings_slash2` | 정화의 날개 (slash2) | 30×30 | center | #d93a3a | mku/skill_wings_slash2.png (16프레임) |
| `skill_wings_slash3` | 정화의 날개 (slash3) | 30×30 | center | #d93a3a | mku/skill_wings_slash3.png (16프레임) |
| `skill_wingsA_hit1` | 정화의 날개 (hit1A) | 30×30 | center | #d93a3a | mku/skill_wingsA_hit1.png (4프레임) |
| `skill_wingsA_hit2` | 정화의 날개 (hit2A) | 30×30 | center | #d93a3a | mku/skill_wingsA_hit2.png (4프레임) |
| `skill_wingsA_hit3` | 정화의 날개 (hit3A) | 35×35 | center | #d93a3a | mku/skill_wingsA_hit3.png (4프레임) |
| `skill_wingsA_bleed` | 정화의 날개 (bleedA) | 10×10 | center | #d93a3a | mku/skill_wingsA_bleed.png (6프레임) |
| `skill_wingsA_mark` | 정화의 날개 (markA) | 8×8 | center | #d93a3a | mku/skill_wingsA_mark.png (1프레임) |
| `skill_mk_morph1` | MK : 프로토타입 (morph1) | 19×19 | center | #d9783b | mku/skill_mk_morph1.png (4프레임) |
| `skill_mk_idle1` | MK : 프로토타입 (idle1) | 19×19 | center | #d9783b | mku/skill_mk_idle1.png (1프레임) |
| `skill_mk_move1` | MK : 프로토타입 (move1) | 19×19 | center | #d9783b | mku/skill_mk_move1.png (1프레임) |
| `skill_mk_punch1` | MK : 프로토타입 (punch1) | 19×19 | center | #d9783b | mku/skill_mk_punch1.png (1프레임) |
| `skill_mk_fist1` | MK : 프로토타입 (fist1) | 7×7 | center | #d9783b | mku/skill_mk_fist1.png (1프레임) |
| `skill_mk_morph2` | MK : 프로토타입 (morph2) | 19×19 | center | #d9783b | mku/skill_mk_morph2.png (4프레임) |
| `skill_mk_idle2` | MK : 프로토타입 (idle2) | 19×19 | center | #d9783b | mku/skill_mk_idle2.png (1프레임) |
| `skill_mk_move2` | MK : 프로토타입 (move2) | 19×19 | center | #d9783b | mku/skill_mk_move2.png (1프레임) |
| `skill_mk_punch2` | MK : 프로토타입 (punch2) | 19×19 | center | #d9783b | mku/skill_mk_punch2.png (1프레임) |
| `skill_mk_fist2` | MK : 프로토타입 (fist2) | 7×7 | center | #d9783b | mku/skill_mk_fist2.png (1프레임) |
| `skill_mk_morph3` | MK : 프로토타입 (morph3) | 19×19 | center | #d9783b | mku/skill_mk_morph3.png (4프레임) |
| `skill_mk_idle3` | MK : 프로토타입 (idle3) | 19×19 | center | #d9783b | mku/skill_mk_idle3.png (1프레임) |
| `skill_mk_move3` | MK : 프로토타입 (move3) | 19×19 | center | #d9783b | mku/skill_mk_move3.png (1프레임) |
| `skill_mk_punch3` | MK : 프로토타입 (punch3) | 19×19 | center | #d9783b | mku/skill_mk_punch3.png (1프레임) |
| `skill_mk_fist3` | MK : 프로토타입 (fist3) | 7×7 | center | #d9783b | mku/skill_mk_fist3.png (1프레임) |
| `skill_mkA_morph` | MK : 프로토타입 (morphA) | 20×20 | center | #d9783b | mku/skill_mkA_morph.png (6프레임) |
| `skill_mkA_idle` | MK : 프로토타입 (idleA) | 20×20 | center | #d9783b | mku/skill_mkA_idle.png (6프레임) |
| `skill_mkA_move` | MK : 프로토타입 (moveA) | 20×20 | center | #d9783b | mku/skill_mkA_move.png (6프레임) |
| `skill_mkA_punch` | MK : 프로토타입 (punchA) | 20×20 | center | #d9783b | mku/skill_mkA_punch.png (6프레임) |
| `skill_mkA_blast` | MK : 프로토타입 (blastPunchA) | 20×20 | center | #d9783b | mku/skill_mkA_blast.png (6프레임) |
| `skill_mkA_drain` | MK : 프로토타입 (drainA) | 20×20 | center | #d9783b | mku/skill_mkA_drain.png (6프레임) |
| `skill_mkA_release` | MK : 프로토타입 (releaseA) | 20×20 | center | #d9783b | mku/skill_mkA_release.png (6프레임) |
| `fx_kaiser_laser` | MK : 프로토타입 (laser) 외 1곳 | 60×60 | center | #d9783b | mku/fx_kaiser_laser.png (3프레임) |
| `skill_reduction_smoke` | 환원주의자 (smoke) | 12×12 | center | #5ad95a | mku/skill_reduction_smoke.png (1프레임) |
| `skill_reduction_unit` | 환원주의자 (unit) | 14×14 | center | #5ad95a | mku/skill_reduction_unit.png (1프레임) |
| `ult_first_law` | 열역학 제1법칙 (particle) | 8×8 | center | #ff9a3c | mku/ult_first_law.png (1프레임) |
| `ult_cut1` | 벼락 (cut1) | 20×20 | center | #6a9cff | mku/ult_cut1.png (1프레임) |
| `ult_cut2` | 벼락 (cut2) | 20×20 | center | #6a9cff | mku/ult_cut2.png (1프레임) |
| `ult_cut3` | 벼락 (cut3) | 20×20 | center | #6a9cff | mku/ult_cut3.png (1프레임) |
| `ult_cut4` | 벼락 (cut4) | 20×20 | center | #6a9cff | mku/ult_cut4.png (1프레임) |
| `ult_kera_slash` | 벼락 (slash) | 20×20 | center | #6a9cff | mku/ult_kera_slash.png (12프레임) |
| `ult_singularity` | 특이점 실험 (core) | 10×10 | center | #ff3a4a | mku/ult_singularity.png (4프레임) |
| `ult_sing_collapse` | 특이점 실험 (collapse) | 30×30 | center | #ff3a4a | mku/ult_sing_collapse.png (1프레임) |
| `ult_sing_flash` | 특이점 실험 (collapseFlash) | 20×20 | center | #ff3a4a | mku/ult_sing_flash.png (1프레임) |
| `ult_sing_rift` | 특이점 실험 (collapseRift) | 20×20 | center | #ff3a4a | mku/ult_sing_rift.png (1프레임) |
| `ult_sing_warning` | 특이점 실험 (warning) | 12×12 | center | #ff3a4a | mku/ult_sing_warning.png (1프레임) |
| `ult_sing_convert` | 특이점 실험 (convert) | 25×25 | center | #ff3a4a | mku/ult_sing_convert.png (4프레임) |
| `ult_sing_overload` | 특이점 실험 (overload) | 30×30 | center | #ff3a4a | mku/ult_sing_overload.png (4프레임) |
| `ult_sing_failure` | 특이점 실험 (failure) | 25×25 | center | #ff3a4a | mku/ult_sing_failure.png (4프레임) |
| `ult_paradox_start` | 특이점 실험 (observeStart) | 25×25 | center | #ff3a4a | mku/ult_paradox_start.png (4프레임) |
| `ult_paradox_record` | 특이점 실험 (record) | 20×20 | center | #ff3a4a | mku/ult_paradox_record.png (5프레임) |
| `ult_paradox_mark` | 특이점 실험 (mark) | 12×12 | center | #ff3a4a | mku/ult_paradox_mark.png (4프레임) |
| `ult_paradox_pull` | 특이점 실험 (pull) | 30×30 | center | #ff3a4a | mku/ult_paradox_pull.png (4프레임) |
| `ult_paradox_replay1` | 특이점 실험 (replay1) | 15×15 | center | #ff3a4a | mku/ult_paradox_replay1.png (3프레임) |
| `ult_paradox_replay2` | 특이점 실험 (replay2) | 17×17 | center | #ff3a4a | mku/ult_paradox_replay2.png (3프레임) |
| `ult_paradox_replay3` | 특이점 실험 (replay3) | 19×19 | center | #ff3a4a | mku/ult_paradox_replay3.png (4프레임) |
| `ult_paradox_crumble` | 특이점 실험 (crumble) | 22×22 | center | #ff3a4a | mku/ult_paradox_crumble.png (4프레임) |
| `ult_paradox_send` | 특이점 실험 (send) | 17×17 | center | #ff3a4a | mku/ult_paradox_send.png (3프레임) |
| `ult_paradox_end` | 특이점 실험 (observeEnd) | 30×30 | center | #ff3a4a | mku/ult_paradox_end.png (4프레임) |

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

## item (35)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `item_slime_stew` | 슬라임 스튜 | 8×8 | center | #8fd16a | mku/item_slime_stew.png (1프레임) |
| `item_magicasol` | 마기카솔 | 8×8 | center | #5ac8e0 | mku/item_magicasol.png (1프레임) |
| `item_nameless_sword` | 이름 없는 검 | 8×8 | center | #d0d8e8 | mku/item_nameless_sword.png (1프레임) |
| `item_nameless_helm` | 이름 없는 투구 | 8×8 | center | #9aa4b0 | mku/item_nameless_helm.png (1프레임) |
| `item_broken_hilt` | 망가진 손잡이 | 8×8 | center | #8a7a5a | mku/item_broken_hilt.png (1프레임) |
| `item_elegant_magi` | 엘러건트 마기 | 8×8 | center | #4a8cff | mku/item_elegant_magi.png (1프레임) |
| `item_antimatter_sample` | 실험용 반물질 | 8×8 | center | #a05ad9 | mku/item_antimatter_sample.png (1프레임) |
| `item_combat_theory` | 마력 전투 응용법 | 8×8 | center | #5a8ad9 | mku/item_combat_theory.png (1프레임) |
| `item_oak_heart` | 참나무의 심장 | 8×8 | center | #6a9a3a | mku/item_oak_heart.png (1프레임) |
| `item_hanwoo_steak` | 한우촌의 생등심 | 8×8 | center | #c85a5a | mku/item_hanwoo_steak.png (1프레임) |
| `item_lee_seal` | 이씨 가문의 증표 | 8×8 | center | #ffd23f | mku/item_lee_seal.png (1프레임) |
| `item_magowiki_codex` | 마고위키 필사본 | 8×8 | center | #e0c060 | — |
| `item_gisup_stone` | 기숲 비석의 조각 | 8×8 | center | #7a8a9a | mku/item_gisup_stone.png (1프레임) |
| `item_afro_belt` | 아프로 씨의 벨트 | 8×8 | center | #a45cff | — |
| `item_regulus_shard` | 레굴루스의 의식조각 | 8×8 | center | #8a6aff | mku/item_regulus_shard.png (1프레임) |
| `item_caesar_crown` | 카이사르의 왕관 | 8×8 | center | #ffd23f | mku/item_caesar_crown.png (1프레임) |
| `item_acrux_cross` | 아크룩스의 십자가 | 8×8 | center | #e0e0ff | mku/item_acrux_cross.png (1프레임) |
| `item_orion_belt` | 오리온의 허리띠 | 8×8 | center | #5ad9ff | mku/item_orion_belt.png (1프레임) |
| `item_divine_sword` | 신검 영디·마기 | 8×8 | center | #ff3b3b | mku/item_divine_sword.png (1프레임) |
| `icon_skill_magiTurret` | 추가 무장 외 1곳 | 8×8 | center | #5a8ad9 | mku/icon_skill_magiTurret.png (1프레임) |
| `icon_skill_magiMine` | 자기 공명 장치 외 1곳 | 8×8 | center | #5a8ad9 | mku/icon_skill_magiMine.png (1프레임) |
| `icon_skill_magiField` | 스넬의 법칙 외 1곳 | 8×8 | center | #5a8ad9 | mku/icon_skill_magiField.png (1프레임) |
| `icon_skill_railgun` | LK-99 외 1곳 | 8×8 | center | #ffd23f | mku/icon_skill_railgun.png (1프레임) |
| `icon_skill_unstableSubject` | 헬라 세포 외 1곳 | 8×8 | center | #5a8ad9 | mku/icon_skill_unstableSubject.png (1프레임) |
| `icon_skill_magiCorruption` | 금지된 바이러스 외 1곳 | 8×8 | center | #5a8ad9 | mku/icon_skill_magiCorruption.png (1프레임) |
| `icon_skill_experimentalWeapon` | 열어선 안되는 선물 외 1곳 | 8×8 | center | #ffd23f | mku/icon_skill_experimentalWeapon.png (1프레임) |
| `icon_skill_purifyingWings` | 과기전쟁의 일기 외 1곳 | 8×8 | center | #ffd23f | mku/icon_skill_purifyingWings.png (1프레임) |
| `icon_skill_mkPrototype` | 강철의 성 피규어 외 1곳 | 8×8 | center | #5a8ad9 | mku/icon_skill_mkPrototype.png (1프레임) |
| `item_atros_codex` | 아트로스 비석 필사본 | 8×8 | center | #d8c090 | mku/item_atros_codex.png (1프레임) |
| `item_warrior_memory` | 어느 전사의 기억 | 8×8 | center | #c8ccd8 | mku/item_warrior_memory.png (1프레임) |
| `item_wonhon_lump` | 원혼 덩어리 | 8×8 | center | #7a1f3a | mku/item_wonhon_lump.png (1프레임) |
| `item_death_whistle` | 바바리안 데스 휘슬 | 8×8 | center | #c86a3a | mku/item_death_whistle.png (1프레임) |
| `item_royal_seal` | 특무 인장 | 8×8 | center | #6a4ad9 | mku/item_royal_seal.png (1프레임) |
| `item_orion_shield` | 오리온의 방패 | 8×8 | center | #d9c25a | mku/item_orion_shield.png (1프레임) |
| `item_hectar_ram` | 헥타르 RAM | 8×8 | center | #3a9aff | mku/item_hectar_ram.png (1프레임) |

## icon (8)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `icon_skill_antimatterCannon` | 반물질포 | 16×16 | center | #a05ad9 | mku/icon_skill_antimatterCannon.png (1프레임) |
| `icon_skill_combatDrone` | 전투 드론 | 16×16 | center | #5ad9c0 | mku/icon_skill_combatDrone.png (1프레임) |
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

## fx (78)

| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |
| --- | --- | --- | --- | --- | --- |
| `fx_fusion_slash` | 융합악귀 (sectorHit) | 40×40 | center | #8c3ad9 | mku/fx_fusion_slash.png (1프레임) |
| `fx_fusion_burst` | 융합악귀 (blastHit) | 30×30 | center | #8c3ad9 | mku/fx_fusion_burst.png (1프레임) |
| `fx_fusion_eruption` | 융합악귀 (eruption.blastHit) | 40×40 | center | #8c3ad9 | mku/fx_fusion_eruption.png (1프레임) |
| `fx_fusion_charge` | 융합악귀 (blastWarn) | 30×30 | center | #8c3ad9 | mku/fx_fusion_charge.png (1프레임) |
| `fx_fusion_bolt` | 융합악귀 (bullet) | 8×8 | center | #8c3ad9 | mku/fx_fusion_bolt.png (1프레임) |
| `fx_fusion_dash` | 융합악귀 (dashTrail) | 30×30 | center | #8c3ad9 | mku/fx_fusion_dash.png (1프레임) |
| `fx_fusion_smoke` | 융합악귀 (zone) | 20×20 | center | #8c3ad9 | mku/fx_fusion_smoke.png (1프레임) |
| `fx_fusion_summon` | 융합악귀 (summon) | 20×20 | center | #8c3ad9 | mku/fx_fusion_summon.png (1프레임) |
| `fx_fusion_orb` | 융합악귀 (spiritBlast.cast) | 20×20 | center | #8c3ad9 | mku/fx_fusion_orb.png (1프레임) |
| `fx_fusion_explode` | 융합악귀 (death) | 45×45 | center | #8c3ad9 | mku/fx_fusion_explode.png (1프레임) |
| `fx_fusion_vortex` | 융합악귀 (layer) | 45×45 | center | #8c3ad9 | mku/fx_fusion_vortex.png (1프레임) |
| `fx_electric_warning` | 전기환띠 (blastWarn) | 15×15 | center | #3a7aff | mku/fx_electric_warning.png (1프레임) |
| `fx_electric_strike` | 전기환띠 (blastHit) | 25×25 | center | #3a7aff | mku/fx_electric_strike.png (1프레임) |
| `fx_electric_strike2` | 전기환띠 (prison.blastHit) | 25×25 | center | #3a7aff | mku/fx_electric_strike2.png (1프레임) |
| `fx_electric_laser` | 전기환띠 (beam) | 60×60 | center | #3a7aff | mku/fx_electric_laser.png (1프레임) |
| `fx_electric_line` | 전기환띠 (crossCut.beam) | 60×60 | center | #3a7aff | mku/fx_electric_line.png (1프레임) |
| `fx_electric_orb` | 전기환띠 (bullet) | 6×6 | center | #3a7aff | mku/fx_electric_orb.png (1프레임) |
| `fx_electric_dash` | 전기환띠 (dashTrail) | 30×30 | center | #3a7aff | mku/fx_electric_dash.png (1프레임) |
| `fx_electric_cage` | 전기환띠 (cage) | 50×50 | center | #3a7aff | mku/fx_electric_cage.png (1프레임) |
| `fx_electric_radial` | 전기환띠 (shockRipple.cast) | 35×35 | center | #3a7aff | mku/fx_electric_radial.png (1프레임) |
| `fx_electric_cross` | 전기환띠 (crossCut.cast) | 45×45 | center | #3a7aff | mku/fx_electric_cross.png (1프레임) |
| `fx_electric_impact` | 전기환띠 (blueDash.blastHit) | 40×40 | center | #3a7aff | mku/fx_electric_impact.png (1프레임) |
| `fx_electric_ring` | 전기환띠 (layer) | 45×45 | center | #3a7aff | mku/fx_electric_ring.png (1프레임) |
| `fx_electric_aura` | 전기환띠 (layer) | 45×45 | center | #3a7aff | mku/fx_electric_aura.png (1프레임) |
| `fx_chief_burst` | 헥타르 수석 연구원 (blastHit) 외 1곳 | 30×30 | center | #3a7aff | mku/fx_chief_burst.png (1프레임) |
| `fx_chief_ring` | 헥타르 수석 연구원 (blastWarn) 외 2곳 | 35×35 | center | #3a7aff | mku/fx_chief_ring.png (1프레임) |
| `fx_chief_drone` | 헥타르 수석 연구원 (drone) | 7×7 | center | #3a7aff | mku/fx_chief_drone.png (1프레임) |
| `fx_golem_warn` | 마기골렘 (blastWarn) | 25×25 | center | #a03ae0 | mku/fx_golem_warn.png (1프레임) |
| `fx_golem_artillery` | 마기골렘 (blastHit) | 30×30 | center | #a03ae0 | mku/fx_golem_artillery.png (1프레임) |
| `fx_golem_shock` | 마기골렘 (ringStart) | 45×45 | center | #a03ae0 | mku/fx_golem_shock.png (1프레임) |
| `fx_golem_ruin_beam` | 마기골렘 (beam) | 60×60 | center | #a03ae0 | mku/fx_golem_ruin_beam.png (1프레임) |
| `fx_golem_laser_side` | 마기골렘 (ruinBeam.beamSide) | 60×60 | center | #a03ae0 | mku/fx_golem_laser_side.png (1프레임) |
| `fx_golem_crack` | 마기골렘 (crustCrack.beam) | 60×60 | center | #a03ae0 | mku/fx_golem_crack.png (1프레임) |
| `fx_golem_summon` | 마기골렘 (ruinLegion.cast) | 35×35 | center | #a03ae0 | mku/fx_golem_summon.png (1프레임) |
| `fx_golem_minion` | 마기골렘 (summon) | 15×15 | center | #a03ae0 | mku/fx_golem_minion.png (1프레임) |
| `fx_golem_trail` | 마기골렘 (dashTrail) | 25×25 | center | #a03ae0 | mku/fx_golem_trail.png (1프레임) |
| `fx_golem_core` | 마기골렘 (core) | 18×18 | center | #a03ae0 | mku/fx_golem_core.png (1프레임) |
| `fx_golem_eight` | 마기골렘 (collapseZone.cast) | 50×50 | center | #a03ae0 | mku/fx_golem_eight.png (1프레임) |
| `fx_golem_eruption` | 마기골렘 (collapseZone.blastHit) | 30×30 | center | #a03ae0 | mku/fx_golem_eruption.png (1프레임) |
| `fx_golem_fault_v` | 마기골렘 (bandV) | 45×45 | center | #a03ae0 | mku/fx_golem_fault_v.png (1프레임) |
| `fx_golem_fault_h` | 마기골렘 (bandH) | 45×45 | center | #a03ae0 | mku/fx_golem_fault_h.png (1프레임) |
| `fx_golem_fault_hit` | 마기골렘 (doomFault.blastHit) | 25×25 | center | #a03ae0 | mku/fx_golem_fault_hit.png (1프레임) |
| `fx_golem_rage_aura` | 마기골렘 (layer) | 45×45 | center | #a03ae0 | mku/fx_golem_rage_aura.png (1프레임) |
| `fx_golem_rage_core` | 마기골렘 (layer) | 20×20 | center | #a03ae0 | mku/fx_golem_rage_core.png (1프레임) |
| `fx_eclipse_warning` | 식광 (blastWarn) | 30×30 | center | #ff3a4a | mku/fx_eclipse_warning.png (3프레임) |
| `fx_eclipse_impact` | 식광 (blastHit) | 35×35 | center | #ff3a4a | mku/fx_eclipse_impact.png (2프레임) |
| `fx_eclipse_blade` | 식광 (bullet) | 7×7 | center | #ff3a4a | mku/fx_eclipse_blade.png (4프레임) |
| `fx_eclipse_charge` | 식광 (orbitCut.cast) | 20×20 | center | #ff3a4a | mku/fx_eclipse_charge.png (1프레임) |
| `fx_eclipse_track` | 식광 (followTrack) | 30×30 | center | #ff3a4a | mku/fx_eclipse_track.png (4프레임) |
| `fx_eclipse_lock` | 식광 (followLock) | 30×30 | center | #ff3a4a | mku/fx_eclipse_lock.png (1프레임) |
| `fx_eclipse_shadow` | 식광 (followHit) | 35×35 | center | #ff3a4a | mku/fx_eclipse_shadow.png (4프레임) |
| `fx_eclipse_safe` | 식광 (safe) | 40×40 | center | #ff3a4a | mku/fx_eclipse_safe.png (1프레임) |
| `fx_eclipse_field` | 식광 (safeHit) | 55×55 | center | #ff3a4a | mku/fx_eclipse_field.png (4프레임) |
| `fx_eclipse_total_hit` | 식광 (totalEclipse.safeHit) | 60×60 | center | #ff3a4a | mku/fx_eclipse_total_hit.png (2프레임) |
| `fx_eclipse_total_warn` | 식광 (totalEclipse.cast) | 60×60 | center | #ff3a4a | mku/fx_eclipse_total_warn.png (1프레임) |
| `fx_eclipse_gravity` | 식광 (gravityCollapse.blastWarn) | 55×55 | center | #ff3a4a | mku/fx_eclipse_gravity.png (3프레임) |
| `fx_eclipse_residue` | 식광 (zone) | 30×30 | center | #ff3a4a | mku/fx_eclipse_residue.png (1프레임) |
| `fx_eclipse_death` | 식광 (death) | 45×45 | center | #ff3a4a | mku/fx_eclipse_death.png (4프레임) |
| `fx_eclipse_flare` | 식광 (layer) | 55×55 | center | #ff3a4a | mku/fx_eclipse_flare.png (2프레임) |
| `fx_kaiser_punch` | 마기카이저 (sectorHit) | 50×50 | center | #ff2a2a | mku/fx_kaiser_punch.png (4프레임) |
| `fx_kaiser_impact` | 마기카이저 (blastHit) | 35×35 | center | #ff2a2a | mku/fx_kaiser_impact.png (4프레임) |
| `fx_kaiser_lock` | 마기카이저 (blastWarn) | 20×20 | center | #ff2a2a | mku/fx_kaiser_lock.png (4프레임) |
| `fx_kaiser_laser_warn` | 마기카이저 (beamWarn) | 60×60 | center | #ff2a2a | mku/fx_kaiser_laser_warn.png (7프레임) |
| `fx_kaiser_sweep` | 마기카이저 (spinLaser.beam) 외 1곳 | 60×60 | center | #ff2a2a | mku/fx_kaiser_sweep.png (4프레임) |
| `fx_kaiser_sweep_warn` | 마기카이저 (spinLaser.beamWarn) 외 1곳 | 60×60 | center | #ff2a2a | mku/fx_kaiser_sweep_warn.png (5프레임) |
| `fx_kaiser_missile` | 마기카이저 (missile) | 8×8 | center | #ff2a2a | mku/fx_kaiser_missile.png (4프레임) |
| `fx_kaiser_shock` | 마기카이저 (ringStart) | 45×45 | center | #ff2a2a | mku/fx_kaiser_shock.png (2프레임) |
| `fx_kaiser_muzzle` | 마기카이저 (lineLaser.cast) | 20×20 | center | #ff2a2a | mku/fx_kaiser_muzzle.png (3프레임) |
| `fx_kaiser_command` | 마기카이저 (safeHit) | 60×60 | center | #ff2a2a | mku/fx_kaiser_command.png (4프레임) |
| `fx_kaiser_debris` | 마기카이저 (geyser.blastHit) | 35×35 | center | #ff2a2a | mku/fx_kaiser_debris.png (4프레임) |
| `fx_kaiser_cross` | 마기카이저 (doomCommand.cast) | 60×60 | center | #ff2a2a | mku/fx_kaiser_cross.png (4프레임) |
| `fx_kaiser_death` | 마기카이저 (death) | 55×55 | center | #ff2a2a | mku/fx_kaiser_death.png (4프레임) |
| `fx_hit_tech` | 타격 불꽃(기술) | 10×10 | center | #5ad0ff | mku/fx_hit_tech.png (1프레임) |
| `fx_hit_magic` | 타격 불꽃(마기) | 10×10 | center | #c08aff | mku/fx_hit_magic.png (1프레임) |
| `fx_hit_physical` | 타격 불꽃(물리) | 10×10 | center | #ffffff | mku/fx_hit_physical.png (1프레임) |
| `fx_explosion` | 폭발 | 30×30 | center | #ff5a3a | mku/fx_explosion.png (5프레임) |
| `fx_elite_burst` | 엘리트 처치 폭발 | 34×34 | center | #c08aff | mku/fx_elite_burst.png (1프레임) |
| `fx_spawn` | 적 소환 연기 | 20×20 | center | #8a5ad9 | mku/fx_spawn.png (1프레임) |
