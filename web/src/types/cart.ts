export interface CartItem {
  productId: string;
  name: string;
  price: string;
  imageUrl: string;
  quantity: number;
}

export interface ShippingAddress {
  city: string;
  oblast: string;
  branch: string;
}
