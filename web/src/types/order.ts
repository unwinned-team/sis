export type PaymentMethod = 'CARD' | 'CASH' | 'BONUS';

export type OrderStatus = 'NEW' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  price: string;
  product?: import('./product').Product;
}

export interface Order {
  id: string;
  customerId: string;
  totalAmount: string;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  createdAt: string;
  items: OrderItem[];
}
