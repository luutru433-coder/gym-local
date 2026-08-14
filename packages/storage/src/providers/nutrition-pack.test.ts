import { describe, expect, it } from "vitest";
import { nutritionPackTransferSizeMatches } from "./nutrition-pack";

function responseHeaders(values: Record<string, string>): Pick<Response, "headers"> {
  return { headers: new Headers(values) };
}

describe("nutritionPackTransferSizeMatches", () => {
  it("checks the declared length for an unencoded response", () => {
    expect(nutritionPackTransferSizeMatches(responseHeaders({ "content-length": "24334336" }), 24334336)).toBe(true);
    expect(nutritionPackTransferSizeMatches(responseHeaders({ "content-length": "7165575" }), 24334336)).toBe(false);
  });

  it("checks identity-encoded responses like unencoded responses", () => {
    expect(nutritionPackTransferSizeMatches(responseHeaders({ "content-encoding": "identity", "content-length": "10" }), 11)).toBe(false);
  });

  it("defers compressed response validation to decoded byte count and checksum", () => {
    expect(nutritionPackTransferSizeMatches(responseHeaders({ "content-encoding": "gzip", "content-length": "7165575" }), 24334336)).toBe(true);
    expect(nutritionPackTransferSizeMatches(responseHeaders({ "content-encoding": "br", "content-length": "5000000" }), 24334336)).toBe(true);
  });

  it("allows a missing transfer length so streamed validation can decide", () => {
    expect(nutritionPackTransferSizeMatches(responseHeaders({}), 24334336)).toBe(true);
  });
});
