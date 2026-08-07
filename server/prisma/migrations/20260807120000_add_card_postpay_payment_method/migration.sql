-- AlterEnum
-- Оплата картой при получении на почте; поведение как CASH (PENDING до выдачи).

ALTER TYPE "PaymentMethod" ADD VALUE 'CARD_POSTPAY';
