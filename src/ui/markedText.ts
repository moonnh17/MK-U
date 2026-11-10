/** 제미니 대사 문장을 앞에서 n글자까지 그린다. **…** 구간은 붉은 강조(.mk-hl) */
import { markedSegments } from '../systems/gemini';

export function renderMarked(el: HTMLElement, text: string, n: number): void {
  el.replaceChildren();
  let left = n;
  for (const seg of markedSegments(text)) {
    if (left <= 0) break;
    const chars = [...seg.text];
    const part = chars.slice(0, left).join('');
    left -= chars.length;
    if (!seg.hl) {
      el.append(part);
      continue;
    }
    const span = document.createElement('span');
    span.className = 'mk-hl';
    span.textContent = part;
    el.append(span);
  }
}
