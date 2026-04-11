import { describe, expect, it } from 'vitest';

import { DEFAULT_CATEGORIES, mergeDefaultCategories } from './constants';
import { Category } from './types';

describe('mergeDefaultCategories', () => {
  it('adds newly introduced built-in categories to older stored category lists', () => {
    const legacyCategories: Category[] = [
      { id: 'food', name: '餐饮', icon: 'Utensils', color: '#171717', type: 'expense' },
      { id: 'shopping', name: '购物', icon: 'ShoppingBag', color: '#ea580c', type: 'expense' },
      { id: 'salary', name: '工资', icon: 'Briefcase', color: '#000000', type: 'income' },
    ];

    const merged = mergeDefaultCategories(legacyCategories);

    expect(merged.some((category) => category.id === 'daily_use' && category.name === '日用')).toBe(true);
    expect(merged.some((category) => category.id === 'sports' && category.name === '运动')).toBe(true);
    expect(merged.filter((category) => category.id === 'food')).toHaveLength(1);
  });

  it('returns the full default category set when no stored categories exist', () => {
    expect(mergeDefaultCategories([])).toEqual(DEFAULT_CATEGORIES);
  });
});
