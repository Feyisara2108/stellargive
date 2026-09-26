import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./card";

describe("Card sections", () => {
  it("renders header, content, and footer sections in document order", () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Clean Water Initiative</CardTitle>
          <CardDescription>Fund wells in drought-affected regions.</CardDescription>
        </CardHeader>
        <CardContent>Raised: 4,200 XLM</CardContent>
        <CardFooter>Ends in 12 days</CardFooter>
      </Card>,
    );

    const card = screen.getByTestId("card");
    const sectionTexts = Array.from(card.children).map((el) => el.textContent);
    expect(sectionTexts).toEqual([
      "Clean Water InitiativeFund wells in drought-affected regions.",
      "Raised: 4,200 XLM",
      "Ends in 12 days",
    ]);
  });

  it("renders the title as a heading and the description as body text", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title text</CardTitle>
          <CardDescription>Description text</CardDescription>
        </CardHeader>
      </Card>,
    );

    const title = screen.getByRole("heading", { name: "Title text" });
    expect(title.tagName).toBe("H3");
    expect(screen.getByText("Description text").tagName).toBe("P");
  });

  it("supports a card with only a subset of sections", () => {
    render(
      <Card data-testid="minimal-card">
        <CardContent>Just content, no header or footer</CardContent>
      </Card>,
    );

    const card = screen.getByTestId("minimal-card");
    expect(card.children).toHaveLength(1);
    expect(screen.getByText("Just content, no header or footer")).toBeInTheDocument();
  });

  it("applies the base card classes and preserves overflow-hidden for rounded corners", () => {
    render(<Card data-testid="card">content</Card>);
    const card = screen.getByTestId("card");
    expect(card).toHaveClass("rounded-xl", "border", "overflow-hidden");
  });

  it("merges a custom className on each section without losing its base classes", () => {
    render(
      <Card className="my-card">
        <CardHeader className="my-header">
          <CardTitle className="my-title">Title</CardTitle>
        </CardHeader>
        <CardContent className="my-content">Body</CardContent>
        <CardFooter className="my-footer">Footer</CardFooter>
      </Card>,
    );

    expect(screen.getByText("Title").parentElement).toHaveClass("my-header", "flex", "flex-col");
    expect(screen.getByText("Title")).toHaveClass("my-title", "text-2xl");
    expect(screen.getByText("Body")).toHaveClass("my-content", "p-6");
    expect(screen.getByText("Footer")).toHaveClass("my-footer", "flex", "items-center");
  });

  it("forwards refs from each section to its underlying DOM node", () => {
    let cardRef: HTMLDivElement | null = null;
    let contentRef: HTMLDivElement | null = null;
    render(
      <Card
        ref={(el) => {
          cardRef = el;
        }}
        data-testid="card"
      >
        <CardContent
          ref={(el) => {
            contentRef = el;
          }}
        >
          Body
        </CardContent>
      </Card>,
    );

    expect(cardRef).toBe(screen.getByTestId("card"));
    expect(contentRef).toBe(screen.getByText("Body"));
  });
});
