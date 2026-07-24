export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  telegram: string | null;
  role: 'CUSTOMER' | 'ADMIN';
  bonusBalance: string;
  createdAt: string;
}