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

export interface OrderCustomer {
  id: string;
  name: string;
  phone: string | null;
}

export interface Order {
  id: string;
  customerId: string;
  customer?: OrderCustomer;
  totalAmount: string;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  createdAt: string;
  items: OrderItem[];
}
