// jsdom, the config default.
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ProgressBar } from "@/components/ui/progress-bar";

describe("ProgressBar", () => {
  test("reports the share to assistive tech and in words, not only as a length", () => {
    render(<ProgressBar label="3 of 7 done (43%)" value={3 / 7} />);

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "43");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-valuetext", "3 of 7 done (43%)");
    expect(screen.getByText("3 of 7 done (43%)")).toBeInTheDocument();
    expect(bar.firstElementChild).toHaveStyle({ width: "43%" });
  });

  test("draws an empty bar for an empty list", () => {
    render(<ProgressBar label="Nothing on the list yet" value={0} />);

    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    expect(screen.getByRole("progressbar").firstElementChild).toHaveStyle({
      width: "0%",
    });
  });

  test("clamps a share outside 0 to 1 rather than overflowing the track", () => {
    const { rerender } = render(<ProgressBar label="over" value={1.4} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );

    rerender(<ProgressBar label="under" value={-0.2} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
  });
});
