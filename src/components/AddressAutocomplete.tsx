import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  loadGoogleMaps,
  parsePlace,
  getMapsApiKey,
  onMapsAuthFailure,
  type PlaceDetails,
} from "@/lib/googleMaps";

const NO_KEY_WARNING =
  "Address autocomplete is unavailable. You can still enter the address manually.";
const LOAD_FAIL_WARNING =
  "Google address autocomplete could not load. Check the Maps JavaScript API, Places API, billing, and API key restrictions.";

export function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelected,
  id,
  placeholder,
  disabled,
  className,
}: {
  value: string;
  onChange: (text: string) => void;
  onPlaceSelected: (details: PlaceDetails) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!getMapsApiKey()) {
      setWarning(NO_KEY_WARNING);
      return;
    }
    let listener: any;
    const unsubAuth = onMapsAuthFailure(() => setWarning(LOAD_FAIL_WARNING));
    loadGoogleMaps()
      .then((google) => {
        if (!inputRef.current) {
          return;
        }
        const jakarta = new google.maps.LatLngBounds(
          new google.maps.LatLng(-6.4, 106.6),
          new google.maps.LatLng(-6.0, 107.0)
        );
        const ac = new google.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: "id" },
          bounds: jakarta,
          fields: [
            "formatted_address",
            "geometry",
            "place_id",
            "address_components",
            "name",
            "url",
          ],
        });
        listener = ac.addListener("place_changed", () => {
          const details = parsePlace(ac.getPlace());
          if (details.address) {
            onChange(details.address);
          }
          onPlaceSelected(details);
        });
      })
      .catch(() => setWarning(LOAD_FAIL_WARNING));
    return () => {
      if (listener?.remove) {
        listener.remove();
      }
      unsubAuth();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-1">
      <Input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        autoComplete="off"
      />
      {warning && <p className="text-xs text-amber-600">{warning}</p>}
    </div>
  );
}

export default AddressAutocomplete;
