import { describe, expect, it } from "vitest";
import { getRestaurantImageProps } from "../../src/lib/restaurantImages.js";

describe("restaurant responsive images", () => {
  it("uses bounded responsive Unsplash variants preserving existing crop proportions", () => {
    const props = getRestaurantImageProps(
      "https://images.unsplash.com/photo-1?w=2400&h=1200&fit=crop&q=85",
      [320, 640, 960],
      "50vw",
    );
    const source = new URL(props.src);
    expect(source.searchParams.get("w")).toBe("320");
    expect(source.searchParams.get("h")).toBe("160");
    expect(source.searchParams.get("q")).toBe("85");
    expect(source.searchParams.get("fit")).toBe("crop");
    expect(props.sizes).toBe("50vw");
    expect(props.srcSet).toContain(" 960w");
  });

  it("adds Cloudinary delivery limits after existing transformations", () => {
    const props = getRestaurantImageProps(
      "https://res.cloudinary.com/demo/image/upload/c_fill,w_2000,h_1000/v123/restaurant.jpg",
      [320, 640],
      "100vw",
    );
    expect(props.src).toBe(
      "https://res.cloudinary.com/demo/image/upload/c_fill,w_2000,h_1000/c_limit,w_320,q_auto,f_auto/v123/restaurant.jpg",
    );
    expect(props.srcSet).toContain("w_640");
  });

  it("preserves folders when Cloudinary assets have no version segment", () => {
    expect(
      getRestaurantImageProps(
        "https://res.cloudinary.com/demo/image/upload/food_photos/restaurant.jpg",
        [320],
        "100vw",
      ).src,
    ).toBe(
      "https://res.cloudinary.com/demo/image/upload/c_limit,w_320,q_auto,f_auto/food_photos/restaurant.jpg",
    );
  });

  it.each([
    "https://example.com/full.jpg",
    "/photo.jpg",
    "http://images.unsplash.com/photo-1",
    "https://images.unsplash.com.evil.test/photo-1",
    "https://user:password@images.unsplash.com/photo-1",
    "https://res.cloudinary.com/demo/image/upload/s--signature--/v1/photo.jpg",
    "https://res.cloudinary.com/demo/raw/upload/photo.jpg",
    "https://res.cloudinary.com/demo/image/upload/v1/photo.jpg?__cld_token__=signed",
  ])("preserves unsupported or signed provider URLs %s", (source) => {
    expect(getRestaurantImageProps(source, [320], "100vw")).toEqual({ src: source });
  });

  it("normalizes candidate widths without unsafe or oversized variants", () => {
    const props = getRestaurantImageProps(
      "https://images.unsplash.com/photo-1",
      [640, 320, 320, 0, -1, 0.5, 9000],
      "100vw",
    );
    expect(props.srcSet?.match(/\d+w/g)).toEqual(["320w", "640w"]);
    expect(new URL(props.src).searchParams.get("fit")).toBe("max");
    expect(getRestaurantImageProps(props.src, [], "100vw")).toEqual({ src: props.src });
  });
});
