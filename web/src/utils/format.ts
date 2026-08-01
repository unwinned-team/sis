import type { Product } from '../types';

function formatAmount(value: number): string {
  return value.toLocaleString('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function formatPrice(price: string): string {
  const value = Number(price);
  if (Number.isNaN(value)) return price;
  return `${formatAmount(value)} ₴`;
}

// Бонуси нараховуються з копійками (1% від суми замовлення), тому округлення
// до гривні показувало б неправдивий баланс.
export function formatBonus(value: string | number): string {
  const amount = Number(value);
  if (Number.isNaN(amount)) return String(value);
  return `${amount.toLocaleString('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₴`;
}

export function formatProductPrice(product: Product): string {
  const variantPrices = (product.variants ?? [])
    .map((variant) => Number(variant.price))
    .filter((value) => !Number.isNaN(value));

  if (variantPrices.length === 0) return formatPrice(product.price);

  // ponytail: показуємо мінімальну ціну без «від». Линейка варіантів у більшості
  // товарів має одну ціну; різні ціни поки не відрізняємо — повернутось, коли
  // з'являться товари з різними цінами за смак/розмір.
  return formatPrice(String(Math.min(...variantPrices)));
}

// ponytail: dev-only self-check — хтось поверне «від», впаде в консолі розробника.
if (import.meta.env?.DEV) {
  const sample: Product = {
    id: '', name: '', description: '', price: '100',
    categoryId: '', imageUrl: '', createdAt: '',
    variants: [{ id: '1', productId: '', taste: 'A', size: null, price: '150', description: null, isAvailable: true }],
  };
  const out = formatProductPrice(sample);
  if (out.startsWith('від ') || out !== '150 ₴') {
    console.error('formatProductPrice self-check failed:', out);
  }
}
