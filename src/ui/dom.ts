/** 클래스·글자를 붙인 DOM 요소를 만든다 */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const x = document.createElement(tag);
  x.className = cls;
  x.textContent = text;
  return x;
}
