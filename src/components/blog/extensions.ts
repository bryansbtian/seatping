import { blogExtensions as sharedExtensions } from "@shared/blogEditorExtensions";
import { safeMediaUrl } from "@shared/blog";

export function blogExtensions(collaborative = false) {
  return sharedExtensions(collaborative).map((extension) => {
    if (extension.name === "image") {
      return extension.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            caption: {
              default: "",
              parseHTML: (element: HTMLElement) =>
                element.closest("figure")?.querySelector("figcaption")?.textContent || "",
            },
            alignment: {
              default: "center",
              parseHTML: (element: HTMLElement) =>
                element.closest("figure")?.getAttribute("data-alignment") || "center",
            },
          };
        },
      });
    }
    if (extension.name === "video") {
      return extension.extend({
        addAttributes() {
          return {
            src: { default: "", parseHTML: (element: HTMLElement) => element.getAttribute("src") },
            embed: {
              default: false,
              parseHTML: (element: HTMLElement) => element.tagName === "IFRAME",
            },
          };
        },
        parseHTML() {
          return [
            {
              tag: "video[src]",
              getAttrs: (element: HTMLElement) => {
                if (!safeMediaUrl(element.getAttribute("src") || "")) {
                  return false;
                }
                return {};
              },
            },
          ];
        },
      });
    }
    return extension;
  });
}
