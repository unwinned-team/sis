export type PaymentMethod = 'CARD' | 'CASH' | 'BONUS';

export type PaymentStatus = 'PENDING' | 'CLAIMED' | 'PAID' | 'FAILED';

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
  paymentStatus: PaymentStatus;
  // CARD: точна сума до сплати (з «копійчаним хвостом») і реф для коментаря
  // до переказу — за ними бекенд матчить оплату.
  paymentAmount: string | null;
  paymentRef: string | null;
  // Тільки у відповіді POST /orders для CARD: лінк send.monobank.ua з
  // передзаповненими сумою/рефом та ручні реквізити.
  paymentUrl?: string;
  paymentDetails?: string;
  status: OrderStatus;
  createdAt: string;
  items: OrderItem[];
  // Появится в ответе после того, как бэкенд начнёт сохранять адрес доставки.
  shippingAddress?: import('./cart').ShippingAddress;
}
