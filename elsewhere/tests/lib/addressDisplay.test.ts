import { describe, it, expect } from "vitest";
import { addressCompact, addressWithoutCountry } from "@/lib/addressDisplay";

describe("addressWithoutCountry", () => {
  it("drops the country but keeps the ZIP", () => {
    expect(addressWithoutCountry("9000 Burke Lake Rd, Burke, VA 22015, USA")).toBe(
      "9000 Burke Lake Rd, Burke, VA 22015",
    );
  });

  it("handles the spelled-out country and odd spacing", () => {
    expect(addressWithoutCountry("1 A St, Vienna, VA 22180,  United States ")).toBe(
      "1 A St, Vienna, VA 22180",
    );
  });

  it("returns an empty string for missing input", () => {
    expect(addressWithoutCountry(null)).toBe("");
    expect(addressWithoutCountry(undefined)).toBe("");
  });
});

describe("addressCompact", () => {
  it("drops the country and the ZIP", () => {
    expect(addressCompact("9000 Burke Lake Rd, Burke, VA 22015, USA")).toBe(
      "9000 Burke Lake Rd, Burke, VA",
    );
  });

  it("drops a ZIP+4", () => {
    expect(addressCompact("7250 Commerce St, Springfield, VA 22150-1234, USA")).toBe(
      "7250 Commerce St, Springfield, VA",
    );
  });

  it("leaves an address that has neither", () => {
    expect(addressCompact("Main Library, Fairfax")).toBe("Main Library, Fairfax");
  });

  it("does not eat a street number that looks like a ZIP", () => {
    // The digits are leading, not trailing, so the ZIP rule must not touch them.
    expect(addressCompact("13910 Lee Jackson Memorial Hwy, Chantilly, VA 20151, USA")).toBe(
      "13910 Lee Jackson Memorial Hwy, Chantilly, VA",
    );
  });
});
