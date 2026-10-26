/**
 * 디버그 패널 (DOM). 터치 레이어 위에 떠서 PC·모바일 모두 누를 수 있다.
 * 게임 명령이 아니라 개발용 토글이라 입력 계층(ActionCommand)을 거치지 않는다.
 */
export type DebugToggle = 'revealMap' | 'invincible';

export class DebugPanel {
  private readonly root: HTMLDivElement;
  private readonly info: HTMLDivElement;
  private readonly toggles = new Map<DebugToggle, HTMLButtonElement>();

  constructor(
    parent: HTMLElement,
    labels: { revealMap: string; invincible: string; clearRoom: string },
    handlers: { toggle(name: DebugToggle): void; clearRoom(): void },
  ) {
    this.root = document.createElement('div');
    this.root.id = 'debug-panel';
    this.info = document.createElement('div');
    this.root.appendChild(this.info);
    const row = document.createElement('div');
    for (const name of ['revealMap', 'invincible'] as const) {
      const b = document.createElement('button');
      b.textContent = labels[name];
      b.addEventListener('click', () => handlers.toggle(name));
      this.toggles.set(name, b);
      row.appendChild(b);
    }
    const clear = document.createElement('button');
    clear.textContent = labels.clearRoom;
    clear.addEventListener('click', () => handlers.clearRoom());
    row.appendChild(clear);
    this.root.appendChild(row);
    // 패널을 눌러도 조이스틱·게임 입력으로 새지 않게
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    parent.appendChild(this.root);
  }

  setVisible(on: boolean): void {
    this.root.style.display = on ? 'block' : 'none';
  }

  setInfo(text: string): void {
    if (this.info.textContent !== text) this.info.textContent = text;
  }

  setToggle(name: DebugToggle, on: boolean): void {
    this.toggles.get(name)?.classList.toggle('on', on);
  }
}
