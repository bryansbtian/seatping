import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PhoneNumberInput } from "../../src/components/PhoneNumberInput.js";

function Harness({ initialCountry = "+1" }: { initialCountry?: string }) {
  const [countryCode, setCountryCode] = useState(initialCountry);
  const [phone, setPhone] = useState("");
  return (
    <div>
      <PhoneNumberInput
        aria-label="Phone"
        countryCode={countryCode}
        value={phone}
        onValueChange={setPhone}
      />
      <button type="button" onClick={() => setCountryCode("+62")}>
        Switch to Indonesia
      </button>
    </div>
  );
}

function field(): HTMLInputElement {
  return screen.getByLabelText("Phone") as HTMLInputElement;
}

function typeDigits(input: HTMLInputElement, digits: string) {
  for (const digit of digits) {
    const caret = input.selectionStart ?? input.value.length;
    const next = `${input.value.slice(0, caret)}${digit}${input.value.slice(caret)}`;
    fireEvent.change(input, { target: { value: next, selectionStart: caret + 1 } });
  }
}

describe("PhoneNumberInput", () => {
  it("formats a US number as it is typed", () => {
    render(<Harness />);
    const input = field();
    typeDigits(input, "2069313369");
    expect(input.value).toBe("(206) 931-3369");
  });

  it("formats an Indonesian number as it is typed", () => {
    render(<Harness initialCountry="+62" />);
    const input = field();
    typeDigits(input, "8111998669");
    expect(input.value).toBe("811-1998-669");
  });

  it("shows a placeholder that matches the selected country", () => {
    render(<Harness />);
    expect(field().placeholder).toBe("(555) 123-4567");
  });

  it("reformats the value when the country changes", () => {
    render(<Harness />);
    const input = field();
    typeDigits(input, "2069313369");
    expect(input.value).toBe("(206) 931-3369");
    fireEvent.click(screen.getByText("Switch to Indonesia"));
    expect(input.value).toBe("(206) 9313369");
  });

  it("removes the preceding digit when a separator is deleted", () => {
    render(<Harness />);
    const input = field();
    typeDigits(input, "206931");
    expect(input.value).toBe("(206) 931");
    fireEvent.change(input, { target: { value: "(206 931", selectionStart: 4 } });
    expect(input.value).toBe("(209) 31");
  });

  it("keeps the caret after the digit that was just typed", () => {
    render(<Harness />);
    const input = field();
    typeDigits(input, "206");
    expect(input.value).toBe("(206)");
    expect(input.selectionStart).toBe(4);
    typeDigits(input, "9");
    expect(input.value).toBe("(206) 9");
    expect(input.selectionStart).toBe(7);
  });

  it("groups a landline by its area code as it is typed", () => {
    render(<Harness initialCountry="+62" />);
    const input = field();
    typeDigits(input, "2112345678");
    expect(input.value).toBe("(21) 12345678");
  });

  it("groups a London landline as it is typed", () => {
    render(<Harness initialCountry="+44" />);
    const input = field();
    typeDigits(input, "2071234567");
    expect(input.value).toBe("20 7123 4567");
  });

  it("stops accepting digits past the international maximum", () => {
    render(<Harness />);
    const input = field();
    typeDigits(input, "12345678901234567890");
    expect(input.value.replace(/\D/g, "")).toHaveLength(15);
  });
});
