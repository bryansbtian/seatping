export type FeaturedBusiness = {
  id: string;
  username: string;
  name?: string | null;
  email?: string | null;
};

export type FeaturedLocation = {
  id: string;
  displayName?: string | null;
  name?: string | null;
  address: string;
  area?: string | null;
  city?: string | null;
};

export type FeaturedRestaurant = {
  id: string;
  name?: string;
  businessId: string;
  locationId: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  business: FeaturedBusiness | null;
  location: FeaturedLocation | null;
};

export function featuredRestaurantName(restaurant: FeaturedRestaurant): string {
  return (
    restaurant.name ||
    restaurant.business?.name ||
    restaurant.location?.name ||
    restaurant.business?.username ||
    "Restaurant"
  );
}
