import { describe, expect, it } from "vitest";
import { socialProfileLink, type SocialPlatform } from "../../src/lib/socialProfiles";

describe("Social Profile Links", () => {
  it.each<SocialPlatform>(["instagram", "facebook", "tiktok"])(
    "normalizes handles and full %s profile URLs",
    (platform) => {
      let path = "sample.restaurant";
      if (platform === "tiktok") {
        path = `@${path}`;
      }
      const expected = { handle: "sample.restaurant", url: `https://www.${platform}.com/${path}` };
      for (const value of [
        "sample.restaurant",
        "@sample.restaurant",
        " @sample.restaurant ",
        `https://www.${platform}.com/${path}/?ref=share#profile`,
        `${platform}.com/${path}`,
        `http://m.${platform}.com/${path}`,
      ]) {
        expect(socialProfileLink(platform, value)).toEqual(expected);
      }
    },
  );

  it.each([
    null,
    undefined,
    "",
    " ",
    "https://instagram.com/",
    "https://evil.example/name",
    "https://instagram.com.evil.example/name",
    "https://facebook.com/name",
    "javascript:alert(1)",
    "https://name:password@instagram.com/name",
    "name with spaces",
    "https://[invalid",
    "@",
  ])("omits invalid or empty Instagram profiles: %s", (value) => {
    expect(socialProfileLink("instagram", value)).toBeNull();
  });

  it("supports Facebook profiles identified by an ID", () => {
    expect(
      socialProfileLink("facebook", "https://facebook.com/profile.php?id=12345&ref=share"),
    ).toEqual({ handle: "12345", url: "https://www.facebook.com/profile.php?id=12345" });
    expect(socialProfileLink("facebook", "https://facebook.com/profile.php")).toBeNull();
    expect(socialProfileLink("facebook", "https://facebook.com/profile.php?id=invalid")).toBeNull();
    expect(
      socialProfileLink(
        "facebook",
        "https://facebook.com/people/Example-Restaurant/12345/?ref=share",
      ),
    ).toEqual({
      handle: "12345",
      url: "https://www.facebook.com/people/Example-Restaurant/12345",
    });
    expect(
      socialProfileLink("facebook", "https://facebook.com/pages/Example-Restaurant"),
    ).toBeNull();
    expect(socialProfileLink("facebook", "https://facebook.com/pages/Example/invalid")).toBeNull();
  });
});
