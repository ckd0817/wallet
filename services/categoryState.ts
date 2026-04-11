import { DEFAULT_CATEGORIES, mergeDefaultCategories } from '../constants';
import { Category, RecurringProfile, Transaction } from '../types';

interface CategoryState {
  categories: Category[];
  transactions: Transaction[];
  recurringProfiles: RecurringProfile[];
}

const DEFAULT_CATEGORY_INDEX = new Map(DEFAULT_CATEGORIES.map((category, index) => [category.id, index]));
const DEFAULT_CATEGORY_BY_ID = new Map(DEFAULT_CATEGORIES.map((category) => [category.id, category]));
const DEFAULT_CATEGORY_BY_NAME_AND_TYPE = new Map(
  DEFAULT_CATEGORIES.map((category) => [`${category.type}:${category.name.trim().toLowerCase()}`, category]),
);
const TYPE_ORDER: Record<Category['type'], number> = {
  expense: 0,
  income: 1,
};
const CATCH_ALL_CATEGORY_IDS = new Set(['other_exp', 'other_inc']);

const categoryNameKey = (category: Pick<Category, 'name' | 'type'>) =>
  `${category.type}:${category.name.trim().toLowerCase()}`;

const sortCategories = (categories: Category[]) =>
  categories
    .map((category, index) => ({ category, index }))
    .sort((left, right) => {
      const leftIsDefault = DEFAULT_CATEGORY_INDEX.has(left.category.id);
      const rightIsDefault = DEFAULT_CATEGORY_INDEX.has(right.category.id);
      const leftIsCatchAll = CATCH_ALL_CATEGORY_IDS.has(left.category.id);
      const rightIsCatchAll = CATCH_ALL_CATEGORY_IDS.has(right.category.id);

      if (TYPE_ORDER[left.category.type] !== TYPE_ORDER[right.category.type]) {
        return TYPE_ORDER[left.category.type] - TYPE_ORDER[right.category.type];
      }

      const leftBucket = leftIsCatchAll ? 2 : leftIsDefault ? 0 : 1;
      const rightBucket = rightIsCatchAll ? 2 : rightIsDefault ? 0 : 1;
      if (leftBucket !== rightBucket) {
        return leftBucket - rightBucket;
      }

      if (leftBucket === 0) {
        return DEFAULT_CATEGORY_INDEX.get(left.category.id)! - DEFAULT_CATEGORY_INDEX.get(right.category.id)!;
      }

      return left.index - right.index;
    })
    .map(({ category }) => category);

const remapCategoryIds = <T extends { categoryId: string }>(items: T[], replacements: Map<string, string>) =>
  items.map((item) => {
    const replacementId = replacements.get(item.categoryId);
    return replacementId ? { ...item, categoryId: replacementId } : item;
  });

export const normalizeCategoryState = ({
  categories,
  transactions,
  recurringProfiles,
}: CategoryState): CategoryState => {
  const replacementIds = new Map<string, string>();
  const mergedCategories = mergeDefaultCategories(categories);
  const normalizedCategories: Category[] = [];
  const seenCategoryIds = new Set<string>();

  for (const category of mergedCategories) {
    const defaultCategory = DEFAULT_CATEGORY_BY_NAME_AND_TYPE.get(categoryNameKey(category));
    if (defaultCategory && category.id !== defaultCategory.id) {
      replacementIds.set(category.id, defaultCategory.id);
      continue;
    }

    const canonicalCategory = DEFAULT_CATEGORY_BY_ID.has(category.id)
      ? { ...DEFAULT_CATEGORY_BY_ID.get(category.id)!, ...category, name: DEFAULT_CATEGORY_BY_ID.get(category.id)!.name }
      : category;

    if (seenCategoryIds.has(canonicalCategory.id)) {
      continue;
    }

    normalizedCategories.push(canonicalCategory);
    seenCategoryIds.add(canonicalCategory.id);
  }

  return {
    categories: sortCategories(normalizedCategories),
    transactions: remapCategoryIds(transactions, replacementIds),
    recurringProfiles: remapCategoryIds(recurringProfiles, replacementIds),
  };
};
