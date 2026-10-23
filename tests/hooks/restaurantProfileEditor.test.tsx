import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RestaurantProfileEditor from "../../src/components/RestaurantProfileEditor";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  uploadBanner: vi.fn(),
  uploadPhoto: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mocks.api }));
vi.mock("@/lib/imageUpload", () => ({
  uploadBanner: mocks.uploadBanner,
  uploadPhoto: mocks.uploadPhoto,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

type Location = ComponentProps<typeof RestaurantProfileEditor>["location"];

const location: Location = {
  id: "location-1",
  address: "174 Broadway, Brooklyn, NY 11211, USA",
  area: "Williamsburg",
  city: "New York",
  country: "United States",
  googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=174+Broadway",
  restaurantProfile: { displayName: "Example Restaurant" },
};

function input(label: string) {
  return screen.getByLabelText<HTMLInputElement>(label);
}

function uploadInput(container: HTMLElement, multiple: boolean) {
  const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  const field = inputs.find(
    (element) => element.multiple === multiple && element.accept === "image/*",
  );
  if (!field) {
    throw new Error("Image upload input is missing");
  }
  return field;
}

beforeEach(() => {
  vi.resetAllMocks();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  mocks.api.mockResolvedValue({ user: { id: "business-1" } });
});

describe("Restaurant Profile Editor", () => {
  it("fills location details from saved Google Maps data and saves them with Bar selected", async () => {
    render(<RestaurantProfileEditor location={location} onSaved={vi.fn()} />);
    expect(input("Area / Neighborhood").value).toBe("Williamsburg");
    expect(input("City").value).toBe("New York");
    expect(input("Country").value).toBe("United States");
    expect(input("Google Maps URL").value).toBe(location.googleMapsUrl);

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Cuisine Type" }), { key: "ArrowDown" });
    const bar = await screen.findByRole("option", { name: "Bar", exact: true });
    fireEvent.click(bar);
    fireEvent.change(input("Area / Neighborhood"), { target: { value: "South Williamsburg" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
    const payload = JSON.parse(mocks.api.mock.calls[0][1].body);
    expect(payload.restaurantProfile.cuisineTypes).toEqual(["Bar"]);
    expect(payload.restaurantProfile.details).toMatchObject({
      area: "South Williamsburg",
      city: "New York",
      country: "United States",
      googleMapsUrl: location.googleMapsUrl,
    });
  });

  it("preserves profile overrides and leaves missing geography blank", () => {
    const view = render(
      <RestaurantProfileEditor
        location={{
          ...location,
          restaurantProfile: {
            displayName: "Example Restaurant",
            details: { area: "Custom Area", city: "Custom City", country: "Custom Country" },
          },
        }}
        onSaved={vi.fn()}
      />,
    );
    expect(input("Area / Neighborhood").value).toBe("Custom Area");
    expect(input("City").value).toBe("Custom City");
    expect(input("Country").value).toBe("Custom Country");
    view.unmount();
    render(<RestaurantProfileEditor location={{ id: "manual-location" }} onSaved={vi.fn()} />);
    expect(input("Area / Neighborhood").value).toBe("");
    expect(input("City").value).toBe("");
    expect(input("Country").value).toBe("");
  });

  it.each([
    ["United States", "7183024427", "(718) 302-4427", "+17183024427"],
    ["Indonesia", "2112345678", "21 12345678", "+622112345678"],
  ])(
    "formats a phone number in %s and saves its country code",
    async (country, raw, formatted, saved) => {
      render(<RestaurantProfileEditor location={{ ...location, country }} onSaved={vi.fn()} />);
      const phone = input("Phone");
      fireEvent.change(phone, { target: { value: raw } });
      expect(phone.type).toBe("tel");
      expect(phone.value).toBe(formatted);
      fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
      await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
      expect(JSON.parse(mocks.api.mock.calls[0][1].body).restaurantProfile.details.phone).toBe(
        saved,
      );
    },
  );

  it("uses an existing international phone code and allows clearing the number", async () => {
    render(
      <RestaurantProfileEditor
        location={{
          ...location,
          restaurantProfile: { displayName: "Example", details: { phone: "+442071234567" } },
        }}
        onSaved={vi.fn()}
      />,
    );
    expect(input("Phone").value).toBe("20 7123 4567");
    expect(screen.getByRole("combobox", { name: "Phone Country Code" }).textContent).toContain(
      "+44",
    );
    fireEvent.change(input("Phone"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
    expect(JSON.parse(mocks.api.mock.calls[0][1].body).restaurantProfile.details.phone).toBe("");
  });

  it.each([false, true])(
    "shows text without a spinner during a banner upload, existing banner: %s",
    async (existing) => {
      const result = Promise.withResolvers<{
        banner: { url: string; publicId: string };
        user: { id: string };
      }>();
      mocks.uploadBanner.mockReturnValue(result.promise);
      const props = { ...location };
      if (existing) {
        props.bannerImageUrl = "/old-banner.jpg";
      }
      const { container } = render(<RestaurantProfileEditor location={props} onSaved={vi.fn()} />);
      fireEvent.change(uploadInput(container, false), {
        target: { files: [new File(["image"], "banner.jpg", { type: "image/jpeg" })] },
      });
      const status = screen.getByRole("status");
      expect(status.textContent).toBe("Uploading...");
      expect(status.querySelector("svg")).toBeNull();
      expect(container.querySelector(".animate-spin")).toBeNull();
      await act(async () =>
        result.resolve({
          banner: { url: "/new-banner.jpg", publicId: "banner" },
          user: { id: "business-1" },
        }),
      );
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.getByAltText("Location banner").getAttribute("src")).toBe("/new-banner.jpg");
    },
  );

  it("shows text during photo upload, retains image descriptions, and removes photos without alt fields", async () => {
    const result = Promise.withResolvers<{
      photo: { id: string; url: string; publicId: string; altText: string };
      user: { id: string };
    }>();
    mocks.uploadPhoto.mockReturnValue(result.promise);
    const { container } = render(<RestaurantProfileEditor location={location} onSaved={vi.fn()} />);
    fireEvent.change(uploadInput(container, true), {
      target: { files: [new File(["image"], "dining.jpg", { type: "image/jpeg" })] },
    });
    expect(screen.getByRole("status").textContent).toBe("Uploading...");
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Uploading..." }).disabled).toBe(
      true,
    );
    await act(async () =>
      result.resolve({
        photo: { id: "photo-1", url: "/dining.jpg", publicId: "photo", altText: "Dining Room" },
        user: { id: "business-1" },
      }),
    );
    expect(screen.getAllByAltText("Dining Room")).toHaveLength(2);
    expect(screen.queryByPlaceholderText(/Alt text/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/api/locations/location-1/photos/photo-1", {
        method: "DELETE",
      }),
    );
    expect(screen.queryByAltText("Dining Room")).toBeNull();
  });

  it("restores photo upload after a failure", async () => {
    mocks.uploadPhoto.mockRejectedValue(new Error("Upload unavailable"));
    const { container } = render(<RestaurantProfileEditor location={location} onSaved={vi.fn()} />);
    fireEvent.change(uploadInput(container, true), {
      target: { files: [new File(["image"], "photo.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Upload unavailable", variant: "destructive" }),
      ),
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Upload Photos" }).disabled).toBe(
      false,
    );
  });
});

it("keeps Maps and Instagram before Facebook and TikTok and saves all social fields", async () => {
  render(<RestaurantProfileEditor location={location} onSaved={vi.fn()} />);
  const fields = [input("Google Maps URL"), input("Instagram"), input("Facebook"), input("TikTok")];
  for (let index = 1; index < fields.length; index += 1) {
    expect(
      fields[index - 1].compareDocumentPosition(fields[index]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  }
  fireEvent.change(input("Instagram"), { target: { value: "sample.instagram" } });
  fireEvent.change(input("Facebook"), {
    target: { value: "https://www.facebook.com/sample.facebook" },
  });
  fireEvent.change(input("TikTok"), { target: { value: "@sample.tiktok" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
  expect(JSON.parse(mocks.api.mock.calls[0][1].body).restaurantProfile.details).toMatchObject({
    instagram: "sample.instagram",
    facebook: "https://www.facebook.com/sample.facebook",
    tiktok: "@sample.tiktok",
  });
});
