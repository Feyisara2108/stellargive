import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Accordion, AccordionItem } from "./accordion";

function TestAccordion() {
  return (
    <Accordion>
      <AccordionItem question="First question">First answer</AccordionItem>
      <AccordionItem question="Second question">Second answer</AccordionItem>
      <AccordionItem question="Third question" defaultOpen>
        Third answer
      </AccordionItem>
    </Accordion>
  );
}

describe("AccordionItem", () => {
  it("is collapsed by default", () => {
    render(
      <Accordion>
        <AccordionItem question="Q">Answer</AccordionItem>
      </Accordion>,
    );

    expect(screen.queryByText("Answer")).not.toBeInTheDocument();
  });

  it("opens with defaultOpen=true", () => {
    render(
      <Accordion>
        <AccordionItem question="Q" defaultOpen>
          Answer
        </AccordionItem>
      </Accordion>,
    );

    expect(screen.getByText("Answer")).toBeVisible();
  });

  it("expands when the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(
      <Accordion>
        <AccordionItem question="Q">Answer</AccordionItem>
      </Accordion>,
    );

    await user.click(screen.getByRole("button", { name: /Q/i }));

    expect(screen.getByText("Answer")).toBeVisible();
  });

  it("collapses when the trigger is clicked again", async () => {
    const user = userEvent.setup();
    render(
      <Accordion>
        <AccordionItem question="Q" defaultOpen>
          Answer
        </AccordionItem>
      </Accordion>,
    );

    expect(screen.getByText("Answer")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Q/i }));
    expect(screen.queryByText("Answer")).not.toBeInTheDocument();
  });

  it("sets aria-expanded=false when collapsed", () => {
    render(
      <Accordion>
        <AccordionItem question="Q">Answer</AccordionItem>
      </Accordion>,
    );

    expect(screen.getByRole("button", { name: /Q/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("sets aria-expanded=true when expanded", async () => {
    const user = userEvent.setup();
    render(
      <Accordion>
        <AccordionItem question="Q">Answer</AccordionItem>
      </Accordion>,
    );

    await user.click(screen.getByRole("button", { name: /Q/i }));

    expect(screen.getByRole("button", { name: /Q/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("items operate independently — opening one does not close another", async () => {
    const user = userEvent.setup();
    render(<TestAccordion />);

    await user.click(screen.getByRole("button", { name: /First question/i }));
    await user.click(screen.getByRole("button", { name: /Second question/i }));

    expect(screen.getByText("First answer")).toBeVisible();
    expect(screen.getByText("Second answer")).toBeVisible();
    // pre-opened third item should still be visible
    expect(screen.getByText("Third answer")).toBeVisible();
  });

  it("trigger has type=button to avoid accidental form submission", () => {
    render(
      <Accordion>
        <AccordionItem question="Q">Answer</AccordionItem>
      </Accordion>,
    );

    expect(screen.getByRole("button", { name: /Q/i })).toHaveAttribute("type", "button");
  });
});
