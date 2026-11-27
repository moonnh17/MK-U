/**
 * 디버그 패널 (DOM, F1). 화면 오른쪽에 붙는 서랍: 위에 상태 표와 빠른 토글, 아래는 탭(전투·아이템·스킬·진행·저장).
 * 너비·높이가 정해져 있고 내용이 길면 서랍 안에서만 스크롤한다 (아이템을 많이 가져도 화면을 덮지 않게).
 * 터치 레이어 위에 떠서 PC·모바일 모두 누를 수 있다. 게임 명령이 아니라 개발용 토글이라 입력 계층(ActionCommand)을 거치지 않는다.
 */
export type DebugToggle = 'revealMap' | 'invincible';

export interface DebugTab {
  id: string;
  title: string;
  body: HTMLElement;
}

export class DebugPanel {
  private readonly root: HTMLDivElement;
  private readonly info: HTMLDivElement;
  private readonly content: HTMLDivElement;
  private readonly tabBar: HTMLDivElement;
  private readonly toggles = new Map<DebugToggle, HTMLButtonElement>();
  private readonly tabs: { tab: DebugTab; btn: HTMLButtonElement }[] = [];
  private folded = false;
  private infoKey = '';

  constructor(
    parent: HTMLElement,
    labels: { title: string; revealMap: string; invincible: string; clearRoom: string },
    handlers: { toggle(name: DebugToggle): void; clearRoom(): void },
  ) {
    this.root = document.createElement('div');
    this.root.id = 'debug-panel';
    // 머리: 제목 + 접기
    const head = document.createElement('div');
    head.className = 'dbg-head';
    const title = document.createElement('b');
    title.textContent = labels.title;
    const fold = document.createElement('button');
    fold.className = 'dbg-fold';
    fold.textContent = '▾';
    fold.addEventListener('click', () => {
      this.folded = !this.folded;
      fold.textContent = this.folded ? '▸' : '▾';
      this.root.classList.toggle('folded', this.folded);
    });
    head.append(title, fold);
    // 빠른 토글
    const quick = document.createElement('div');
    quick.className = 'dbg-quick';
    for (const name of ['revealMap', 'invincible'] as const) {
      const b = document.createElement('button');
      b.textContent = labels[name];
      b.addEventListener('click', () => handlers.toggle(name));
      this.toggles.set(name, b);
      quick.appendChild(b);
    }
    const clear = document.createElement('button');
    clear.textContent = labels.clearRoom;
    clear.addEventListener('click', () => handlers.clearRoom());
    quick.appendChild(clear);
    this.info = document.createElement('div');
    this.info.className = 'dbg-info';
    this.tabBar = document.createElement('div');
    this.tabBar.className = 'dbg-tabs';
    this.content = document.createElement('div');
    this.content.className = 'dbg-content';
    this.root.append(head, quick, this.info, this.tabBar, this.content);
    // 패널을 눌러도 조이스틱·게임 입력으로 새지 않게, 입력칸에서 친 키가 게임 조작으로 새지 않게 (F1~F4는 그대로 통과)
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.addEventListener('wheel', (e) => e.stopPropagation());
    this.root.addEventListener('keydown', (e) => {
      if (!/^F\d$/.test(e.key)) e.stopPropagation();
    });
    parent.appendChild(this.root);
  }

  /** 탭을 붙인다 (처음 것이 열린다) */
  addTab(tab: DebugTab): void {
    const btn = document.createElement('button');
    btn.textContent = tab.title;
    btn.addEventListener('click', () => this.show(tab.id));
    this.tabBar.appendChild(btn);
    tab.body.classList.add('dbg-page');
    this.content.appendChild(tab.body);
    this.tabs.push({ tab, btn });
    if (this.tabs.length === 1) this.show(tab.id);
    else tab.body.style.display = 'none';
  }

  private show(id: string): void {
    for (const { tab, btn } of this.tabs) {
      const on = tab.id === id;
      tab.body.style.display = on ? 'block' : 'none';
      btn.classList.toggle('on', on);
    }
  }

  setVisible(on: boolean): void {
    this.root.style.display = on ? 'flex' : 'none';
    // 닫을 때 패널 안 입력칸에 머문 포커스를 돌려준다 (키보드 조작이 막히지 않게)
    if (!on && document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement)) document.activeElement.blur();
  }

  /** 상태 표: [이름, 값] 줄들 (값이 바뀔 때만 다시 그린다) */
  setInfo(rows: [string, string][]): void {
    const key = rows.map((r) => r.join('=')).join('|');
    if (key === this.infoKey) return;
    this.infoKey = key;
    this.info.replaceChildren(
      ...rows.map(([k, v]) => {
        const r = document.createElement('div');
        const a = document.createElement('span');
        a.textContent = k;
        const b = document.createElement('span');
        b.textContent = v;
        r.append(a, b);
        return r;
      }),
    );
  }

  setToggle(name: DebugToggle, on: boolean): void {
    this.toggles.get(name)?.classList.toggle('on', on);
  }
}
