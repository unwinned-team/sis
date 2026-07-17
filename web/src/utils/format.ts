import type { Product } from '../types';

function formatAmount(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatPrice(price: string): string {
  const value = Number(price);
  if (Number.isNaN(value)) return price;
  return `₴${formatAmount(value)}`;
}

export function formatProductPrice(product: Product): string {
  const variantPrices = (product.variants ?? [])
    .map((variant) => Number(variant.price))
    .filter((value) => !Number.isNaN(value));

  if (variantPrices.length === 0) return formatPrice(product.price);

  const distinct = [...new Set(variantPrices)].sort((a, b) => a - b);
  return `₴${distinct
    .map((value) =>
      value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    )
    .join('/')}`;
}
