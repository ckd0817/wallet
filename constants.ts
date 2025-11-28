import { Category } from './types';
import { Utensils, Bus, ShoppingBag, Home, Clapperboard, Briefcase, DollarSign, PiggyBank, HeartPulse, GraduationCap, MoreHorizontal, Star, Gift, Coffee, Smartphone } from 'lucide-react';

// Using a slightly more muted/sophisticated palette for categories
export const DEFAULT_CATEGORIES: Category[] = [
  // Expenses
  { id: 'food', name: '餐饮', icon: 'Utensils', color: '#171717', type: 'expense' }, // Neutral Black
  { id: 'transport', name: '交通', icon: 'Bus', color: '#52525b', type: 'expense' }, // Zinc 600
  { id: 'shopping', name: '购物', icon: 'ShoppingBag', color: '#ea580c', type: 'expense' }, // Orange 600
  { id: 'housing', name: '居住', icon: 'Home', color: '#059669', type: 'expense' }, // Emerald 600
  { id: 'entertainment', name: '娱乐', icon: 'Clapperboard', color: '#0891b2', type: 'expense' }, // Cyan 600
  { id: 'health', name: '医疗', icon: 'HeartPulse', color: '#be123c', type: 'expense' }, // Rose 700
  { id: 'education', name: '教育', icon: 'GraduationCap', color: '#7c3aed', type: 'expense' }, // Violet 600
  { id: 'other_exp', name: '其他支出', icon: 'MoreHorizontal', color: '#71717a', type: 'expense' }, // Zinc 500
  
  // Income
  { id: 'salary', name: '工资', icon: 'Briefcase', color: '#000000', type: 'income' }, // Black
  { id: 'bonus', name: '奖金', icon: 'DollarSign', color: '#b45309', type: 'income' }, // Amber 700
  { id: 'investment', name: '理财', icon: 'PiggyBank', color: '#4338ca', type: 'income' }, // Indigo 700
  { id: 'other_inc', name: '其他收入', icon: 'MoreHorizontal', color: '#52525b', type: 'income' }, // Zinc 600
];

export const getIconComponent = (iconName: string) => {
  switch (iconName) {
    case 'Utensils': return Utensils;
    case 'Bus': return Bus;
    case 'ShoppingBag': return ShoppingBag;
    case 'Home': return Home;
    case 'Clapperboard': return Clapperboard;
    case 'Briefcase': return Briefcase;
    case 'DollarSign': return DollarSign;
    case 'PiggyBank': return PiggyBank;
    case 'HeartPulse': return HeartPulse;
    case 'GraduationCap': return GraduationCap;
    case 'Star': return Star;
    case 'Gift': return Gift;
    case 'Coffee': return Coffee;
    case 'Smartphone': return Smartphone;
    default: return MoreHorizontal;
  }
};

export const COLORS = [
  '#171717', '#404040', '#737373', '#ef4444', '#f97316', 
  '#eab308', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', 
  '#6366f1', '#8b5cf6', '#ec4899'
];