import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "./input";
import { Label } from "./label";

// These tests cover the raw Input/Label primitives: that they correctly
// forward the plain HTML attributes a consumer wires them with (id, htmlFor,
// aria-describedby, disabled, required). The composed react-hook-form wiring
// (FormField/FormLabel/FormControl/FormMessage) already has its own coverage
// in form.test.tsx — this file is about the primitives themselves, since
// nothing previously exercised them directly.
describe("Input / Label wiring", () => {
  it("associates a label with its input via htmlFor/id", () => {
    render(
      <>
        <Label htmlFor="email">Email</Label>
        <Input id="email" />
      </>,
    );

    const input = screen.getByLabelText("Email");
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByText("Email").getAttribute("for")).toBe(input.id);
  });

  it("links an error message to the input via aria-describedby", () => {
    render(
      <>
        <Label htmlFor="amount">Amount</Label>
        <Input id="amount" aria-describedby="amount-error" aria-invalid />
        <p id="amount-error">Must be a positive number</p>
      </>,
    );

    const input = screen.getByLabelText("Amount");
    const error = screen.getByText("Must be a positive number");

    expect(input.getAttribute("aria-describedby")).toBe(error.id);
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("supports describedby referencing multiple ids, e.g. a description plus an error", () => {
    render(
      <>
        <Label htmlFor="username">Username</Label>
        <Input id="username" aria-describedby="username-desc username-error" />
        <p id="username-desc">3-20 characters</p>
        <p id="username-error">Too short</p>
      </>,
    );

    const input = screen.getByLabelText("Username");
    expect(input.getAttribute("aria-describedby")).toBe("username-desc username-error");
  });

  it("honors the disabled attribute", () => {
    render(
      <>
        <Label htmlFor="disabled-field">Disabled field</Label>
        <Input id="disabled-field" disabled />
      </>,
    );

    expect(screen.getByLabelText("Disabled field")).toBeDisabled();
  });

  it("honors the required attribute", () => {
    render(
      <>
        <Label htmlFor="required-field">Required field</Label>
        <Input id="required-field" required />
      </>,
    );

    expect(screen.getByLabelText("Required field")).toBeRequired();
  });

  it("is neither disabled nor required by default", () => {
    render(
      <>
        <Label htmlFor="plain-field">Plain field</Label>
        <Input id="plain-field" />
      </>,
    );

    const input = screen.getByLabelText("Plain field");
    expect(input).not.toBeDisabled();
    expect(input).not.toBeRequired();
  });

  it("forwards a ref to the underlying input element", () => {
    let ref: HTMLInputElement | null = null;
    render(
      <Input
        ref={(el) => {
          ref = el;
        }}
        aria-label="ref target"
      />,
    );

    expect(ref).toBeInstanceOf(HTMLInputElement);
    expect(ref).toBe(screen.getByLabelText("ref target"));
  });

  it("merges a custom className with the base input styles", () => {
    render(<Input aria-label="styled" className="my-custom-class" />);

    const input = screen.getByLabelText("styled");
    expect(input).toHaveClass("my-custom-class");
    expect(input).toHaveClass("flex", "h-10", "w-full");
  });

  it("passes the disabled peer class down to the label for peer-disabled styling", () => {
    render(
      <div>
        <Input id="peer-field" disabled className="peer" />
        <Label htmlFor="peer-field">Peer-disabled label</Label>
      </div>,
    );

    expect(screen.getByText("Peer-disabled label")).toHaveClass("peer-disabled:opacity-70");
  });
});
