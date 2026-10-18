import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LanguageSelector from "../../src/components/LanguageSelector";
import { TimeSelect } from "../../src/components/TimeSelect";
import TimezoneSelect from "../../src/components/TimezoneSelect";
import { LangContext, translate, translateStatus } from "../../src/lib/i18n";

const mocks = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

beforeEach(() => {
  vi.clearAllMocks();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", Observer);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderLanguageSelector(setLang = vi.fn().mockResolvedValue(undefined)) {
  return render(
    <LangContext.Provider
      value={{
        lang: "en",
        ready: true,
        t: (key, params) => translate("en", key, params),
        tStatus: (status) => translateStatus("en", status),
        setLang,
      }}
    >
      <LanguageSelector />
    </LangContext.Provider>,
  );
}

describe("Shared Business Controls", () => {
  it("selects a time and closes its options without submitting a surrounding form", async () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <TimeSelect value="12:00" onChange={onChange} options={["12:00", "14:00"]} />
      </form>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Time: 12:00 PM" }));
    fireEvent.click(await screen.findByRole("button", { name: "2:00 PM", exact: true }));

    expect(onChange).toHaveBeenCalledWith("14:00");
    expect(onSubmit).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("button", { name: "2:00 PM" })).toBeNull());
  });

  it("keeps a disabled time selector closed", () => {
    const onChange = vi.fn();
    render(<TimeSelect value="12:00" onChange={onChange} options={["14:00"]} disabled />);

    fireEvent.click(screen.getByRole("button", { name: "Time: 12:00 PM" }));

    expect(screen.queryByRole("button", { name: "2:00 PM" })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("searches and selects a timezone through the shared trigger", async () => {
    const onChange = vi.fn();
    render(<TimezoneSelect value="UTC" onChange={onChange} />);

    fireEvent.click(screen.getByRole("combobox", { name: "Timezone", exact: true }));
    fireEvent.change(screen.getByLabelText("Search timezone or city..."), {
      target: { value: "Jakarta" },
    });
    fireEvent.click(await screen.findByRole("option", { name: /Jakarta/ }));

    expect(onChange).toHaveBeenCalledWith("Asia/Jakarta");
    await waitFor(() => expect(screen.queryByLabelText("Search timezone or city...")).toBeNull());
  });

  it("saves a language once and disables changes while the request is pending", async () => {
    let finishSave = () => {};
    const setLang = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    renderLanguageSelector(setLang);
    const trigger = screen.getByRole("combobox");

    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("option", { name: "Bahasa Indonesia" }));

    expect(setLang).toHaveBeenCalledExactlyOnceWith("id");
    expect(trigger.hasAttribute("disabled")).toBe(true);
    await act(async () => finishSave());
    expect(trigger.hasAttribute("disabled")).toBe(false);
    expect(mocks.toast).toHaveBeenCalledWith({ title: translate("en", "settings.language.saved") });
  });

  it("restores the language control after a failed save", async () => {
    const setLang = vi.fn().mockRejectedValue(new Error("Language update unavailable"));
    renderLanguageSelector(setLang);

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Bahasa Indonesia" }));

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Language update unavailable",
          variant: "destructive",
        }),
      ),
    );
    expect(screen.getByRole("combobox").hasAttribute("disabled")).toBe(false);
  });
});
