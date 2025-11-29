export type TransactionType = 'expense' | 'income';

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: TransactionType;
}

export interface Transaction {
  id: string;
  amount: number;
  type: TransactionType;
  categoryId: string;
  date: string; // ISO string
  note: string;
}

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurringProfile {
  id: string;
  amount: number;
  type: TransactionType;
  categoryId: string;
  note: string;
  frequency: RecurringFrequency;
  startDate: string;
  nextDueDate: string;
}

export interface DailyStats {
  date: string;
  income: number;
  expense: number;
}

export interface CategoryStats {
  name: string;
  value: number;
  color: string;
}

export enum AppTab {
  DASHBOARD = 'DASHBOARD',
  STATS = 'STATS',
  ANALYSIS = 'ANALYSIS',
  SETTINGS = 'SETTINGS',
}