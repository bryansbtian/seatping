import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation as useRouterLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublicLanguageProvider from "../../src/components/PublicLanguageProvider.js";
import { Link, useNavigate, useLocation } from "../../src/lib/publicNavigation.js";
import { usePublicLanguage } from "../../src/lib/publicLanguage.js";
import {
  readPublicLanguagePreference,
  rememberPublicLanguage,
} from "../../src/lib/publicLanguagePreference.js";
import { PUBLIC_LANGUAGE_COOKIE } from "../../shared/publicLanguage.js";

beforeEach(() => {
  localStorage.clear();
  document.cookie = `${PUBLIC_LANGUAGE_COOKIE}=; Path=/; Max-Age=0`;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderNavigation(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PublicLanguageProvider>
        <NavigationExample />
      </PublicLanguageProvider>
    </MemoryRouter>,
  );
}

function NavigationExample() {
  const navigate = useNavigate();
  const location = useLocation();
  const actual = useRouterLocation();
  const { t, locale, dateLocale } = usePublicLanguage();
  return (
    <>
      <p data-testid="actual">
        {actual.pathname}
        {actual.search}
        {actual.hash}
      </p>
      <p data-testid="base">{location.pathname}</p>
      <p data-testid="locale">
        {locale}:{dateLocale.code}
      </p>
      <Link to={{ pathname: "/help", search: "?from=search", hash: "#faq" }}>
        {t("Help & FAQ")}
      </Link>
      <button onClick={() => navigate({ pathname: "/terms", hash: "#services" })}>Terms</button>
      <button onClick={() => navigate(-1)}>Back</button>
      <button onClick={() => navigate("/admin")}>Admin</button>
      <button onClick={() => navigate({ search: "?page=2" })}>Next</button>
    </>
  );
}

describe("Public Language Navigation", () => {
  it("uses the backend on the homepage and preserves its query and anchor", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ language: "id" })));
    vi.stubGlobal("fetch", fetcher);
    renderNavigation("/?from=qr#featured");
    await waitFor(() => {
      expect(screen.getByTestId("actual").textContent).toBe("/id?from=qr#featured");
      expect(document.documentElement.lang).toBe("id");
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/language",
      expect.objectContaining({ credentials: "include", signal: expect.any(AbortSignal) }),
    );
    expect(localStorage.getItem("seatping.consumer.lang")).toBeNull();
  });

  it("detects the business landing page without affecting the business preference", async () => {
    localStorage.setItem("seatping.business.lang", "en");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ language: "id" }))),
    );
    renderNavigation("/business?source=nav");
    await waitFor(() =>
      expect(screen.getByTestId("actual").textContent).toBe("/id/business?source=nav"),
    );
    expect(localStorage.getItem("seatping.business.lang")).toBe("en");
  });

  it.each([
    "/id",
    "/en",
    "/id/business",
    "/en/business",
    "/business/settings",
    "/admin",
    "/blog",
    "/help",
  ])("does not detect or override %s", (path) => {
    rememberPublicLanguage("id");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    renderNavigation(path);
    expect(screen.getByTestId("actual").textContent).toBe(path);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps explicit English navigation despite a saved Indonesian preference", () => {
    rememberPublicLanguage("id");
    renderNavigation("/en");
    expect(screen.getByRole("link", { name: "Help & FAQ" }).getAttribute("href")).toBe(
      "/en/help?from=search#faq",
    );
    fireEvent.click(screen.getByRole("button", { name: "Terms" }));
    expect(screen.getByTestId("actual").textContent).toBe("/en/terms#services");
    expect(localStorage.getItem("seatping.consumer.lang")).toBe("id");
  });

  it.each(["en", "id"] as const)(
    "restores manual %s before making a detection request",
    async (language) => {
      rememberPublicLanguage(language);
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      renderNavigation("/");
      await waitFor(() => expect(screen.getByTestId("actual").textContent).toBe(`/${language}`));
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("restores a legacy localStorage preference without cookies", async () => {
    localStorage.setItem("seatping.consumer.lang", "id");
    vi.stubGlobal("fetch", vi.fn());
    renderNavigation("/");
    await waitFor(() => expect(screen.getByTestId("actual").textContent).toBe("/id"));
  });

  it("honors a manual selection made while detection is pending", async () => {
    let resolve: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise<Response>((finish) => {
          resolve = finish;
        }),
      ),
    );
    renderNavigation("/");
    rememberPublicLanguage("en");
    await act(async () => {
      resolve?.(new Response(JSON.stringify({ language: "id" })));
    });
    expect(screen.getByTestId("actual").textContent).toBe("/en");
  });

  it.each([null, {}, { language: "fr" }])(
    "falls back to English for an invalid endpoint response %j",
    async (payload) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))));
      renderNavigation("/");
      await waitFor(() => expect(screen.getByTestId("actual").textContent).toBe("/"));
      expect(screen.getByTestId("locale").textContent).toBe("en-US:en-US");
    },
  );

  it.each(["network", "status", "json"])("falls back to English on %s failure", async (failure) => {
    const fetcher = vi.fn();
    if (failure === "network") {
      fetcher.mockRejectedValue(new TypeError("Offline"));
    } else if (failure === "status") {
      fetcher.mockResolvedValue(new Response("Unavailable", { status: 503 }));
    } else {
      fetcher.mockResolvedValue(new Response("Invalid JSON"));
    }
    vi.stubGlobal("fetch", fetcher);
    renderNavigation("/");
    await waitFor(() => expect(screen.getByTestId("actual").textContent).toBe("/"));
  });

  it("shows a skeleton while detecting and falls back after the timeout", async () => {
    vi.useFakeTimers();
    let resolve: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((finish) => {
      resolve = finish;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending));
    renderNavigation("/");
    expect(screen.getByRole("status", { name: "Loading Page" })).toBeTruthy();
    expect(screen.queryByTestId("actual")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByTestId("actual").textContent).toBe("/");
    await act(async () => {
      resolve?.(new Response(JSON.stringify({ language: "id" })));
    });
    expect(screen.getByTestId("actual").textContent).toBe("/");
  });

  it("localizes object and imperative navigation while respecting history and private destinations", () => {
    render(
      <MemoryRouter initialEntries={["/id/search"]}>
        <PublicLanguageProvider>
          <NavigationExample />
        </PublicLanguageProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("base").textContent).toBe("/search");
    expect(screen.getByTestId("locale").textContent).toBe("id-ID:id");
    fireEvent.click(screen.getByRole("link", { name: "Bantuan dan FAQ" }));
    expect(screen.getByText("/id/help?from=search#faq")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Terms" }));
    expect(screen.getByText("/id/terms#services")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("/id/help?from=search#faq")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("/id/help?page=2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Admin" }));
    expect(screen.getByTestId("actual").textContent).toBe("/admin");
    expect(document.documentElement.lang).toBe("en");
  });

  it("respects explicit English URLs despite a stored Indonesian preference", () => {
    localStorage.setItem("seatping.consumer.lang", "id");
    render(
      <MemoryRouter initialEntries={["/help"]}>
        <PublicLanguageProvider>
          <NavigationExample />
        </PublicLanguageProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Help & FAQ" }).getAttribute("href")).toBe(
      "/help?from=search#faq",
    );
    expect(screen.getByTestId("locale").textContent).toBe("en-US:en-US");
    expect(document.documentElement.lang).toBe("en");
  });
});

describe("Public Language Persistence", () => {
  it("marks the site-wide language cookie Secure on HTTPS", () => {
    const writeCookie = vi.spyOn(Document.prototype, "cookie", "set").mockImplementation(() => {});
    vi.stubGlobal("window", { location: { protocol: "https:" } });

    rememberPublicLanguage("id");

    expect(writeCookie).toHaveBeenCalledWith(
      `${PUBLIC_LANGUAGE_COOKIE}=id; Path=/; Max-Age=31536000; SameSite=Lax; Secure`,
    );
    expect(localStorage.getItem("seatping.consumer.lang")).toBe("id");
  });

  it("persists manual selections to both localStorage and a site-wide cookie", () => {
    rememberPublicLanguage("id");
    expect(localStorage.getItem("seatping.consumer.lang")).toBe("id");
    expect(document.cookie).toContain(`${PUBLIC_LANGUAGE_COOKIE}=id`);
    expect(readPublicLanguagePreference()).toBe("id");
    expect(localStorage.getItem("seatping.business.lang")).toBeNull();
  });

  it("uses cookies when localStorage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    rememberPublicLanguage("en");
    expect(readPublicLanguagePreference()).toBe("en");
  });

  it("uses localStorage when cookies are unavailable", () => {
    vi.spyOn(Document.prototype, "cookie", "get").mockImplementation(() => {
      throw new Error("Blocked");
    });
    vi.spyOn(Document.prototype, "cookie", "set").mockImplementation(() => {
      throw new Error("Blocked");
    });
    rememberPublicLanguage("id");
    expect(readPublicLanguagePreference()).toBe("id");
  });

  it("treats corrupt preferences and blocked storage as unset", () => {
    document.cookie = `${PUBLIC_LANGUAGE_COOKIE}=fr; Path=/`;
    localStorage.setItem("seatping.consumer.lang", "fr");
    expect(readPublicLanguagePreference()).toBeUndefined();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    expect(readPublicLanguagePreference()).toBeUndefined();
  });
});
