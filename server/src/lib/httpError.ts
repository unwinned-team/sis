// payload — дополнительные поля тела ответа (например productIds у 409).
// errorHandler подмешивает его только в 4xx, чтобы не протекли детали 5xx.
export function httpError(
  status: number,
  message: string,
  payload?: Record<string, unknown>,
) {
  return Object.assign(new Error(message), { status, payload });
}
