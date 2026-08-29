import { createContext, useContext, type Dispatch, type SetStateAction } from "react";

export const LOCATION_STORAGE_KEY = "seatping.business.locationId";

export type BusinessLocation = {
  id: string;
  name?: string | null;
  displayName?: string | null;
  address?: string | null;
  [key: string]: any;
};

export type BusinessMe = {
  id?: string;
  name?: string;
  username?: string;
  email?: string;
  locations?: BusinessLocation[];
  [key: string]: any;
};

export type BusinessSessionValue = {
  me: BusinessMe | null;
  setMe: Dispatch<SetStateAction<BusinessMe | null>>;
  refreshMe: () => Promise<void>;
  locations: BusinessLocation[];
  currentLocation: BusinessLocation | null;
  currentLocationIndex: number;
  selectedLocationId: string | null;
  selectLocation: (locationId: string) => void;
};

export const BusinessSessionContext = createContext<BusinessSessionValue | null>(null);

export function useBusinessSession(): BusinessSessionValue {
  const value = useContext(BusinessSessionContext);
  if (!value) {
    throw new Error("useBusinessSession must be used within a BusinessSessionProvider");
  }
  return value;
}

export function locationLabel(location: BusinessLocation | null, index: number): string {
  if (!location) {
    return "";
  }
  return location.displayName || location.name || location.address || `Location ${index + 1}`;
}
