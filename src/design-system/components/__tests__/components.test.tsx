import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Segmented } from "../Segmented";
import { StatusChip } from "../StatusChip";

describe("Segmented", () => {
  const options = [
    { value: "a", label: "Uno" },
    { value: "b", label: "Dos" },
    { value: "c", label: "Tres" },
  ];

  it("renders tabs and marks the selected one", () => {
    render(<Segmented idBase="t" ariaLabel="Vista" options={options} value="b" onChange={() => {}} />);
    const selected = screen.getByRole("tab", { selected: true });
    expect(selected).toHaveTextContent("Dos");
  });

  it("calls onChange on click", () => {
    const onChange = vi.fn();
    render(<Segmented idBase="t2" ariaLabel="Vista" options={options} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByText("Tres"));
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("moves selection with arrow keys", () => {
    const onChange = vi.fn();
    render(<Segmented idBase="t3" ariaLabel="Vista" options={options} value="a" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("b");
  });
});

describe("StatusChip", () => {
  it("communicates status with text (not colour alone)", () => {
    render(<StatusChip meta={{ label: "Publicado", dot: "bg-emerald-400", chip: "bg-emerald-500/15" }} />);
    expect(screen.getByText("Publicado")).toBeInTheDocument();
  });
});
