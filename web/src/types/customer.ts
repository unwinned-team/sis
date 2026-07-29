export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  telegram?: string | null;
  bonusBalance: string;
  role?: 'CUSTOMER' | 'ADMIN';
  isActive?: boolean;
  createdAt: string;
}
