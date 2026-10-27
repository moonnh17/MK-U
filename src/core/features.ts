import type { ButtonAction } from './actions';

/**
 * 아직 로직이 없는 명령. UI는 흐리게 표시하고, 눌러도 로그만 남긴다.
 * 해당 마일스톤에서 구현하면 여기서 빼면 된다. (M2: 스킬·궁극기·인벤토리를 뺐다)
 */
export const DISABLED_ACTIONS: ReadonlySet<ButtonAction> = new Set<ButtonAction>([]);
