import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const eur = new Intl.NumberFormat('hr-HR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
});

export function formatEur(value: number): string {
  return eur.format(value);
}

const dateFmt = new Intl.DateTimeFormat('hr-HR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return dateFmt.format(d);
}
