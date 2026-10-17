import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddressAutocomplete } from "../../src/components/AddressAutocomplete.js";
import LocationManagement from "../../src/components/LocationManagement.js";

const mocks = vi.hoisted(() => ({
  loadMaps: vi.fn(),
  apiKey: vi.fn(),
  authFailure: vi.fn(),
  unsubscribe: vi.fn(),
  removeListener: vi.fn(),
  getPlace: vi.fn(),
  api: vi.fn(),
  invalidate: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/googleMaps", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/googleMaps.js")>(
    "../../src/lib/googleMaps.js",
  );
  return {
    ...actual,
    loadGoogleMaps: mocks.loadMaps,
    getMapsApiKey: mocks.apiKey,
    onMapsAuthFailure: mocks.authFailure,
  };
});
vi.mock("@/lib/api", () => ({ api: mocks.api }));
vi.mock("@/lib/queryClient", () => ({ invalidateRestaurantConfiguration: mocks.invalidate }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/RestaurantProfileEditor", () => ({ default: () => null }));

let selectPlace: () => void;
const addListener = vi.fn((event: string, listener: () => void) => {
  expect(event).toBe("place_changed");
  selectPlace = listener;
  return { remove: mocks.removeListener };
});
const autocomplete = vi.fn(function (_input: HTMLInputElement, _options: Record<string, unknown>) {
  return { addListener, getPlace: mocks.getPlace };
});

const michigan = {
  name: "University of Michigan",
  formatted_address: "Ann Arbor, MI 48109, USA",
  address_components: [
    { long_name: "Ann Arbor", types: ["locality"] },
    { long_name: "United States", types: ["country"] },
  ],
  geometry: { location: { lat: () => 42.278, lng: () => -83.7382 } },
  place_id: "michigan-place",
  url: "https://maps.google.com/?cid=michigan-place",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.apiKey.mockReturnValue("test-maps-key");
  mocks.loadMaps.mockResolvedValue({ maps: { places: { Autocomplete: autocomplete } } });
  mocks.authFailure.mockReturnValue(mocks.unsubscribe);
  mocks.getPlace.mockReturnValue(michigan);
  mocks.api.mockResolvedValue({ user: { username: "test-business", locations: [] } });
  mocks.invalidate.mockResolvedValue(undefined);
});

async function renderAddress() {
  const onChange = vi.fn();
  const onPlaceSelected = vi.fn();
  const view = render(
    <AddressAutocomplete
      id="address"
      value=""
      placeholder="Search Address"
      onChange={onChange}
      onPlaceSelected={onPlaceSelected}
    />,
  );
  await waitFor(() => expect(autocomplete).toHaveBeenCalledOnce());
  return { ...view, onChange, onPlaceSelected };
}

describe("worldwide address autocomplete", () => {
  it("allows all countries and place types without fixed bounds or a regional restriction", async () => {
    await renderAddress();
    const [input, options] = autocomplete.mock.calls[0];
    expect(input).toBe(screen.getByPlaceholderText("Search Address"));
    expect(options.strictBounds).toBe(false);
    for (const restriction of [
      "componentRestrictions",
      "bounds",
      "region",
      "regionCode",
      "includedRegionCodes",
      "locationRestriction",
      "locationBias",
      "types",
      "includedPrimaryTypes",
    ]) {
      expect(options).not.toHaveProperty(restriction);
    }
    expect(options.fields).toEqual([
      "formatted_address",
      "geometry",
      "place_id",
      "address_components",
      "name",
      "url",
    ]);
  });

  it("preserves a selected US establishment's address, coordinates, and place details", async () => {
    const { onChange, onPlaceSelected } = await renderAddress();
    fireEvent.change(screen.getByPlaceholderText("Search Address"), {
      target: { value: "university of mi" },
    });
    expect(onChange).toHaveBeenCalledWith("university of mi");
    act(() => selectPlace());
    expect(onChange).toHaveBeenLastCalledWith(michigan.formatted_address);
    expect(onPlaceSelected).toHaveBeenCalledWith({
      address: michigan.formatted_address,
      area: undefined,
      city: "Ann Arbor",
      country: "United States",
      latitude: 42.278,
      longitude: -83.7382,
      googlePlaceId: "michigan-place",
      googleMapsUrl: michigan.url,
    });
  });

  it("also accepts international street addresses", async () => {
    const { onPlaceSelected } = await renderAddress();
    mocks.getPlace.mockReturnValue({
      formatted_address: "10 Downing Street, London SW1A 2AA, UK",
      address_components: [
        { long_name: "London", types: ["locality"] },
        { long_name: "United Kingdom", types: ["country"] },
      ],
      geometry: { location: { lat: () => 51.5034, lng: () => -0.1276 } },
      place_id: "london-address",
    });
    act(() => selectPlace());
    expect(onPlaceSelected).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "10 Downing Street, London SW1A 2AA, UK",
        city: "London",
        country: "United Kingdom",
        latitude: 51.5034,
        longitude: -0.1276,
        googlePlaceId: "london-address",
      }),
    );
  });

  it("keeps manual entry available when Maps cannot load", async () => {
    mocks.loadMaps.mockRejectedValue(new Error("Google unavailable"));
    const onChange = vi.fn();
    render(<AddressAutocomplete value="" onChange={onChange} onPlaceSelected={vi.fn()} />);
    expect(await screen.findByText(/Google address autocomplete could not load/)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "A manual address" } });
    expect(onChange).toHaveBeenCalledWith("A manual address");
  });

  it("cleans up Google listeners when the field is removed", async () => {
    const view = await renderAddress();
    view.unmount();
    expect(mocks.removeListener).toHaveBeenCalledOnce();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it("allows manual entry without loading Google when the API key is absent", async () => {
    mocks.apiKey.mockReturnValue(undefined);
    const onChange = vi.fn();
    render(<AddressAutocomplete value="" onChange={onChange} onPlaceSelected={vi.fn()} />);
    expect(screen.getByText(/Address autocomplete is unavailable/)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "A manual address" } });
    expect(onChange).toHaveBeenCalledWith("A manual address");
    expect(mocks.loadMaps).not.toHaveBeenCalled();
  });
});

describe("Add Location with an international place", () => {
  it.each([false, true])(
    "keeps the creation payload correct after manual editing: %s",
    async (edit) => {
      const onChanged = vi.fn();
      render(
        <LocationManagement
          me={{ username: "test-business", locations: [], maxLocations: 2 }}
          onChanged={onChanged}
        />,
      );
      await waitFor(() => expect(autocomplete).toHaveBeenCalledOnce());
      fireEvent.change(screen.getByLabelText("Location Display Name"), {
        target: { value: "Ann Arbor" },
      });
      act(() => selectPlace());
      expect((screen.getByLabelText("Search Address") as HTMLInputElement).value).toBe(
        michigan.formatted_address,
      );
      if (edit) {
        fireEvent.change(screen.getByLabelText("Search Address"), {
          target: { value: "Another international address" },
        });
      }
      fireEvent.click(screen.getAllByRole("button", { name: "Add Location", exact: true })[0]);
      await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
      const [url, options] = mocks.api.mock.calls[0];
      expect(url).toBe("/auth/business/locations");
      expect(options.method).toBe("POST");
      const payload: Record<string, unknown> = JSON.parse(options.body);
      if (edit) {
        expect(payload).toEqual({
          displayName: "Ann Arbor",
          address: "Another international address",
          latitude: null,
          longitude: null,
        });
      } else {
        expect(payload).toEqual({
          displayName: "Ann Arbor",
          address: michigan.formatted_address,
          city: "Ann Arbor",
          country: "United States",
          latitude: 42.278,
          longitude: -83.7382,
          googlePlaceId: "michigan-place",
          googleMapsUrl: michigan.url,
        });
      }
      await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
      expect(mocks.invalidate).toHaveBeenCalledOnce();
    },
  );
});
