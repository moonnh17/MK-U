/**
 * 벼락 '공간 절단': 월드 카메라 후처리 셰이더로 화면 자체를 절단선에서 가른다.
 * 선까지의 부호 있는 거리로 양쪽을 나누고, 선의 수직 방향으로 서로 반대쪽에 밀어낸다(선 근처 띠 안에서만, 선 양끝은 약하게).
 * 벌어진 사이는 검은 틈, 가장자리에만 청백색 빛. 그림만 움직이고 실제 좌표·판정은 그대로다.
 * HUD는 다른 씬(UIScene)의 카메라라 영향이 없다. WebGL이 아니면(캔버스 렌더러) 아무것도 하지 않는다.
 */
import Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { getContext } from '../core/context';
import { spaceCutFrame } from '../systems/spaceCut';
import type { SpaceCutDef } from '../types/data';

const FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uRes;
uniform vec2 uA;
uniform vec2 uB;
uniform float uShift;
uniform float uGap;
uniform float uBand;
uniform float uEdge;
uniform float uRim;
varying vec2 outTexCoord;

void main() {
  vec4 base = texture2D(uMainSampler, outTexCoord);
  vec2 ab = uB - uA;
  float len = length(ab);
  if (len < 1.0 || (abs(uShift) < 0.01 && uGap < 0.01)) { gl_FragColor = base; return; }
  vec2 dir = ab / len;
  vec2 n = vec2(-dir.y, dir.x);
  vec2 p = outTexCoord * uRes;
  float t = dot(p - uA, dir);
  float d = dot(p - uA, n);
  float ad = abs(d);
  // 선 양끝에서 자연스럽게 약해진다
  float along = smoothstep(-uEdge * 0.25, uEdge, t) * (1.0 - smoothstep(len - uEdge, len + uEdge * 0.25, t));
  // 선에서 멀어지면 변위가 0으로 (띠 밖 화면은 그대로)
  float across = 1.0 - smoothstep(uBand * 0.55, uBand, ad);
  float k = along * across;
  if (k <= 0.0) { gl_FragColor = base; return; }
  float s = d >= 0.0 ? 1.0 : -1.0;
  // 이 픽셀에는 선 쪽으로 shift만큼 가까운 자리의 그림이 온다 = 양쪽 그림이 바깥으로 밀려난다 (음수면 압축)
  vec2 src = p - n * s * uShift * k;
  vec4 col = texture2D(uMainSampler, clamp(src / uRes, 0.0, 1.0));
  float g = uGap * along;
  if (g > 0.05) {
    if (ad < g) {
      // 검은 틈: 가운데는 검게, 가장자리만 청백색
      float e = smoothstep(g - uRim, g, ad);
      gl_FragColor = vec4(vec3(0.62, 0.86, 1.0) * e, 1.0);
      return;
    }
    float rim = 1.0 - smoothstep(g, g + uRim, ad);
    col.rgb = mix(col.rgb, vec3(0.8, 0.93, 1.0), rim * 0.55);
  }
  gl_FragColor = col;
}
`;

interface Cut {
  a: Vec2;
  b: Vec2;
  /** 절단 순간 (game.loop.time, ms). 예고 중이면 미래 */
  at: number;
  telegraphSec: number;
}

export class SpaceCutPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  cut: Cut | null = null;
  def: SpaceCutDef | null = null;

  constructor(game: Phaser.Game) {
    super({ game, name: 'SpaceCutPipeline', fragShader: FRAG });
  }

  override onPreRender(): void {
    const c = this.cut;
    const def = this.def;
    const cam = this.gameObject as Phaser.Cameras.Scene2D.Camera;
    const r = this.renderer;
    const f = c && def ? spaceCutFrame((this.game.loop.time - c.at) / 1000, c.telegraphSec, def) : null;
    // 끝났으면 비운다 (다음 프레임부터 그대로 통과)
    if (c && f && !f.on && this.game.loop.time > c.at) this.cut = null;
    // 기준 해상도 1px = 캔버스 renderScale px. 카메라 좌표는 캔버스 px, 렌더 타깃은 아래가 0 (WebGL)
    const px = getContext().renderScale;
    const toScreen = (w: Vec2): [number, number] => [cam.x + (w.x - cam.worldView.x) * cam.zoom, r.height - (cam.y + (w.y - cam.worldView.y) * cam.zoom)];
    this.set2f('uRes', r.width, r.height);
    if (!c || !f || !f.on || !def) {
      this.set1f('uShift', 0);
      this.set1f('uGap', 0);
      return;
    }
    const [ax, ay] = toScreen(c.a);
    const [bx, by] = toScreen(c.b);
    this.set2f('uA', ax, ay);
    this.set2f('uB', bx, by);
    this.set1f('uShift', f.shift * px);
    this.set1f('uGap', f.gap * px);
    this.set1f('uBand', def.bandPx * px);
    this.set1f('uEdge', def.edgeFadePx * px);
    this.set1f('uRim', def.rimPx * px);
  }
}

/** 이 씬 메인 카메라의 절단 셰이더 (WebGL이 아니면 null). 처음 쓸 때 등록하고 카메라에 붙인다 */
export function spaceCutPipe(scene: Phaser.Scene): SpaceCutPipeline | null {
  const r = scene.game.renderer;
  if (!(r instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return null;
  const cam = scene.cameras.main;
  const find = () => cam.postPipelines.find((x): x is SpaceCutPipeline => x instanceof SpaceCutPipeline) ?? null;
  if (find()) return find();
  if (!r.pipelines.postPipelineClasses.has('SpaceCutPipeline')) r.pipelines.addPostPipeline('SpaceCutPipeline', SpaceCutPipeline);
  cam.setPostPipeline(SpaceCutPipeline);
  return find();
}

/**
 * 절단 연출 시작. telegraphSec > 0이면 그동안 선 쪽으로 화면이 압축되다가 절단된다.
 * 새 절단은 이전 것을 덮어쓴다 (한 번에 하나).
 */
export function startSpaceCut(scene: Phaser.Scene, def: SpaceCutDef, a: Vec2, b: Vec2, telegraphSec = 0): boolean {
  const p = spaceCutPipe(scene);
  if (!p) return false;
  p.def = def;
  p.cut = { a: { ...a }, b: { ...b }, at: scene.game.loop.time + telegraphSec * 1000, telegraphSec };
  return true;
}
