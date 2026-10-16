type RestaurantImageProps = { src: string; srcSet?: string; sizes?: string };

function imageVariant(source: string, width: number): string | null {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    return null;
  }
  if (["__cld_token__", "signature", "token", "expires"].some((key) => url.searchParams.has(key))) {
    return null;
  }
  if (url.hostname === "images.unsplash.com") {
    const oldWidth = Number(url.searchParams.get("w"));
    const oldHeight = Number(url.searchParams.get("h"));
    if (oldWidth > 0 && oldHeight > 0) {
      url.searchParams.set("h", String(Math.max(1, Math.round((width * oldHeight) / oldWidth))));
    }
    url.searchParams.set("w", String(width));
    url.searchParams.set("auto", "format");
    if (!url.searchParams.has("fit")) {
      url.searchParams.set("fit", "max");
    }
    return url.toString();
  }
  if (url.hostname === "res.cloudinary.com" && /^\/[^/]+\/image\/upload\//.test(url.pathname)) {
    const upload = "/image/upload/";
    const prefixEnd = url.pathname.indexOf(upload) + upload.length;
    const remainder = url.pathname.slice(prefixEnd);
    if (/^s--/.test(remainder)) {
      return null;
    }
    const segments = remainder.split("/");
    let transformationCount = 0;
    for (const segment of segments) {
      if (
        !/^(?:(?:a|ar|b|bo|c|co|d|dpr|e|f|fl|g|h|l|o|q|r|t|u|w|x|y|z)_[^/,]+)(?:,(?:[a-z]{1,5}_[^/,]+))*$/.test(
          segment,
        )
      ) {
        break;
      }
      transformationCount += 1;
    }
    segments.splice(transformationCount, 0, `c_limit,w_${width},q_auto,f_auto`);
    url.pathname = `${url.pathname.slice(0, prefixEnd)}${segments.join("/")}`;
    return url.toString();
  }
  return null;
}

export function getRestaurantImageProps(
  source: string,
  widths: readonly number[],
  sizes: string,
): RestaurantImageProps {
  const variants = [...new Set(widths)]
    .filter((width) => Number.isInteger(width) && width > 0 && width <= 3840)
    .sort((a, b) => a - b);
  if (variants.length === 0) {
    return { src: source };
  }
  const first = imageVariant(source, variants[0]);
  if (!first) {
    return { src: source };
  }
  const srcSet = variants.map((width) => `${imageVariant(source, width)} ${width}w`).join(", ");
  return { src: first, srcSet, sizes };
}
