import { getContext } from '../core/context';
import { applyArtIcon } from './artIcon';
import type { SkillSlotView } from '../core/session';
import type { TouchSource } from '../input/touch';
import type { UiData } from '../types/data';
import type { TouchControlId } from './mobileLayout';

/** skillView 순서(액티브 3 + 궁극기 + 패시브)와 같은 순서의 버튼. 패시브는 버튼이 없다 */
const BUTTONS: (TouchControlId | null)[] = ['skill1', 'skill2', 'skill3', 'ultimate', null];
const ULT = BUTTONS.indexOf('ultimate');

interface Parts {
  root: HTMLDivElement;
  /** 스킬 아이콘 그림 자리 */
  icon: HTMLSpanElement;
  cd: HTMLDivElement;
  label: HTMLSpanElement;
  num: HTMLSpanElement;
  star: HTMLSpanElement;
  dots: HTMLElement[];
  sig: string;
}

/**
 * 모바일 스킬·궁극기 버튼 위에 쿨타임(원형 게이지 + 숫자), 레벨(점 3개 + 테두리 색), 각성(★)을 그린다.
 * 바뀐 버튼만 DOM을 고친다.
 */
export class TouchSkills {
  private readonly parts: (Parts | null)[];

  constructor(
    touch: TouchSource,
    private readonly ui: UiData,
    emptyLabels: string[],
  ) {
    this.parts = BUTTONS.map((id, i) => {
      const root = id ? touch.element(id) : undefined;
      if (!root) return null;
      root.textContent = '';
      root.classList.add('tskill');
      const icon = document.createElement('span');
      icon.className = 'tskill-icon';
      const cd = document.createElement('div');
      cd.className = 'tskill-cd';
      const label = document.createElement('span');
      label.className = 'tskill-label';
      label.textContent = emptyLabels[i] ?? '';
      const num = document.createElement('span');
      num.className = 'tskill-num';
      const star = document.createElement('span');
      star.className = 'tskill-star';
      star.textContent = '★';
      const dotsBox = document.createElement('div');
      dotsBox.className = 'tskill-dots';
      const dots = [0, 1, 2].map(() => dotsBox.appendChild(document.createElement('i')));
      root.append(icon, cd, label, num, star, dotsBox);
      return { root, icon, cd, label, num, star, dots, sig: '' };
    });
  }

  update(views: readonly SkillSlotView[], emptyLabels: string[]): void {
    const sb = this.ui.hud.skillbar;
    views.forEach((v, i) => {
      const p = this.parts[i];
      if (!p) return;
      const cdSec = Math.ceil(v.cooldownLeft);
      const frac = i === ULT ? v.gauge : v.cooldownTotal > 0 ? v.cooldownLeft / v.cooldownTotal : 0;
      const sig = `${v.skillId}|${v.iconKey}|${v.level}|${v.awakened}|${v.usable}|${cdSec}|${frac.toFixed(2)}`;
      if (sig === p.sig) return;
      p.sig = sig;

      const filled = v.skillId !== null;
      p.root.classList.toggle('empty', !filled);
      p.root.classList.toggle('dim', filled && !v.usable && i !== ULT);
      p.root.classList.toggle('awakened', v.awakened);
      p.root.classList.toggle('ready', i === ULT && v.usable);
      // 아이콘 그림이 있으면 그림, 없으면 짧은 이름
      const art = filled && applyArtIcon(p.icon, getContext(), v.iconKey);
      p.label.textContent = art ? '' : filled ? v.label : (emptyLabels[i] ?? '');
      p.star.style.display = v.awakened ? 'block' : 'none';
      const levelColor = sb.levelColors[v.level - 1] ?? sb.emptyColor;
      p.root.style.borderColor = !filled
        ? ''
        : i === ULT
          ? v.usable
            ? sb.ultimateReadyColor
            : ''
          : v.awakened
            ? sb.awakenedColor
            : levelColor;
      p.dots.forEach((dot, k) => {
        dot.style.display = filled && i !== ULT ? 'block' : 'none';
        dot.style.background = k < v.level ? levelColor : '';
      });
      if (i === ULT) {
        // 궁극기: 게이지가 차오르는 원
        p.cd.style.background = `conic-gradient(${v.color}88 ${frac * 360}deg, transparent 0)`;
        p.num.textContent = '';
      } else if (v.cooldownLeft > 0) {
        // 쿨타임: 남은 만큼 어둡게 덮고 숫자
        p.cd.style.background = `conic-gradient(rgba(0,0,0,${sb.cooldownAlpha}) ${frac * 360}deg, transparent 0)`;
        p.num.textContent = String(cdSec);
      } else {
        p.cd.style.background = '';
        p.num.textContent = '';
      }
    });
  }
}
