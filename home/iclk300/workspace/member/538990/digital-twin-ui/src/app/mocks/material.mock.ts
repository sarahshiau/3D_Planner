import { MaterialApiDto } from '../models/material.model';

/**
 * Seed data for Material/Obstacle management.
 * Source: legacy backend getObstacle response (default + customized).
 */
export const MATERIAL_MOCK: MaterialApiDto[] = [
  { id: 1, name: 'Wood', chineseName: '木頭', decayCoefficient: 3, property: 'default' },
  { id: 2, name: 'Reinforced concrete', chineseName: '水泥', decayCoefficient: 15, property: 'default' },
  { id: 3, name: 'Metal grid', chineseName: '輕鋼架', decayCoefficient: 7, property: 'default' },
  { id: 4, name: 'Glass', chineseName: '玻璃', decayCoefficient: 3, property: 'default' },
  { id: 5, name: 'Light metal wall', chineseName: '不鏽鋼/其他金屬類', decayCoefficient: 20, property: 'default' },
  { id: 6, name: 'Fireproof', chineseName: '石膏', decayCoefficient: 3, property: 'default' },
  { id: 7, name: 'White brick', chineseName: '白磚', decayCoefficient: 10, property: 'default' },
  { id: 8, name: 'Fire and sound proof', chineseName: '岩棉', decayCoefficient: 12, property: 'default' },
  { id: 9, name: 'Flameproof partition', chineseName: '防焰隔間', decayCoefficient: 3, property: 'default' },
  {
    id: 10,
    name: 'Flameproof and soundploof partition',
    chineseName: '防焰隔音隔間',
    decayCoefficient: 12,
    property: 'default',
  },
  { id: 11, name: 'Cabinet', chineseName: '機櫃', decayCoefficient: 7, property: 'default' },

  { id: 76, name: '304牆壁_殼', chineseName: '304牆壁_殼', decayCoefficient: 10.8, property: 'customized' },
  { id: 77, name: '304牆壁', chineseName: '304牆壁', decayCoefficient: 6.5, property: 'customized' },
  { id: 78, name: '隔板', chineseName: '隔板', decayCoefficient: 0.1, property: 'customized' },
  { id: 79, name: '機房門_殼', chineseName: '機房門_殼', decayCoefficient: 25.8, property: 'customized' },
  { id: 80, name: '小機房柱子_殼', chineseName: '小機房柱子_殼', decayCoefficient: 14, property: 'customized' },
  { id: 81, name: '機房機櫃_殼', chineseName: '機房機櫃_殼', decayCoefficient: 0.4, property: 'customized' },

  { id: 138, name: '水泥牆', chineseName: '水泥牆', decayCoefficient: 99, property: 'customized' },
  { id: 139, name: '311機櫃', chineseName: '311機櫃', decayCoefficient: 7, property: 'customized' },
  { id: 140, name: '311白隔間', chineseName: '311白隔間', decayCoefficient: 8, property: 'customized' },
  { id: 141, name: '311隔板', chineseName: '311隔板', decayCoefficient: 22, property: 'customized' },
  { id: 142, name: '311白隔間門', chineseName: '311白隔間門', decayCoefficient: 8, property: 'customized' },
  { id: 143, name: '311窗戶', chineseName: '311窗戶', decayCoefficient: 2, property: 'customized' },

  { id: 167, name: '311白隔間_1', chineseName: '311白隔間_1', decayCoefficient: 9, property: 'customized' },
  { id: 168, name: '311隔板_1', chineseName: '311隔板_1', decayCoefficient: 22, property: 'customized' },

  // 注意：你舊系統的例子中 add 成功後會出現 id=190 的 test
  // 這裡不預先塞入，留給你在 mock CRUD 驗收時新增。
];
