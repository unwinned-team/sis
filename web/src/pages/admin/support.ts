import { ApiError, apiErrorText } from '../../api/client';
import type { Product } from '../../types';

export function isMissingEndpoint(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404 && error.data === undefined;
}

export function supportsAvailability(products: Product[]): boolean {
  return products.some((product) => product.isAvailable !== undefined);
}

export function isUploadedPath(url: string): boolean {
  return url.startsWith('/uploads/');
}

export function saveErrorMessage(error: unknown, imageUrl?: string): string {
  if (isMissingEndpoint(error)) {
    return 'Бекенд ще не підтримує цю операцію.';
  }
  if (error instanceof ApiError) {
    if (error.status === 400 && imageUrl && isUploadedPath(imageUrl)) {
      return 'Сервер не приймає завантажені картинки для товарів: схема вимагає повний URL (відомий баг, ADMIN.md §3).';
    }
    if (error.status === 400) return apiErrorText(error) ?? 'Перевірте правильність введених даних.';
    if (error.status === 401) return 'Сесія закінчилася. Увійдіть ще раз.';
    if (error.status === 403) return 'Недостатньо прав.';
    if (error.status === 409) return apiErrorText(error) ?? 'Конфлікт даних.';
  }
  return apiErrorText(error) ?? 'Не вдалося зберегти зміни. Спробуйте ще раз.';
}
