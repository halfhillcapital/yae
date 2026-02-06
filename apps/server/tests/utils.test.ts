import { describe, test, expect } from "bun:test";
import { isPublicUrl, withTimeout } from "@yae/core/agents/utils";

// ============================================================================
// isPublicUrl — SSRF guard
// ============================================================================

describe("isPublicUrl", () => {
  // --- Allowed ---

  test("allows https URLs", () => {
    expect(isPublicUrl("https://example.com")).toBe(true);
    expect(isPublicUrl("https://example.com/path?q=1")).toBe(true);
  });

  test("allows http URLs", () => {
    expect(isPublicUrl("http://example.com")).toBe(true);
  });

  // --- Blocked protocols ---

  test("blocks ftp://", () => {
    expect(isPublicUrl("ftp://example.com")).toBe(false);
  });

  test("blocks file://", () => {
    expect(isPublicUrl("file:///etc/passwd")).toBe(false);
  });

  test("blocks javascript:", () => {
    expect(isPublicUrl("javascript:alert(1)")).toBe(false);
  });

  // --- Blocked private IPs ---

  test("blocks localhost", () => {
    expect(isPublicUrl("http://localhost")).toBe(false);
    expect(isPublicUrl("http://localhost:3000")).toBe(false);
  });

  test("blocks [::1]", () => {
    expect(isPublicUrl("http://[::1]")).toBe(false);
    expect(isPublicUrl("http://[::1]:8080")).toBe(false);
  });

  test("blocks 127.x.x.x", () => {
    expect(isPublicUrl("http://127.0.0.1")).toBe(false);
    expect(isPublicUrl("http://127.255.255.255")).toBe(false);
  });

  test("blocks 10.x.x.x", () => {
    expect(isPublicUrl("http://10.0.0.1")).toBe(false);
    expect(isPublicUrl("http://10.255.0.1")).toBe(false);
  });

  test("blocks 192.168.x.x", () => {
    expect(isPublicUrl("http://192.168.0.1")).toBe(false);
    expect(isPublicUrl("http://192.168.100.100")).toBe(false);
  });

  test("blocks 0.x.x.x", () => {
    expect(isPublicUrl("http://0.0.0.0")).toBe(false);
  });

  test("blocks 169.254.169.254 (cloud metadata)", () => {
    expect(isPublicUrl("http://169.254.169.254")).toBe(false);
    expect(isPublicUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
  });

  test("blocks 172.16-31.x.x (private range)", () => {
    expect(isPublicUrl("http://172.16.0.1")).toBe(false);
    expect(isPublicUrl("http://172.20.0.1")).toBe(false);
    expect(isPublicUrl("http://172.31.255.255")).toBe(false);
  });

  test("allows 172.15.x.x (outside private range)", () => {
    expect(isPublicUrl("http://172.15.0.1")).toBe(true);
  });

  test("allows 172.32.x.x (outside private range)", () => {
    expect(isPublicUrl("http://172.32.0.1")).toBe(true);
  });

  // --- Invalid input ---

  test("returns false for garbage strings", () => {
    expect(isPublicUrl("not a url")).toBe(false);
    expect(isPublicUrl("")).toBe(false);
  });
});

// ============================================================================
// withTimeout
// ============================================================================

describe("withTimeout", () => {
  test("returns value when promise resolves before timeout", async () => {
    const result = await withTimeout(Promise.resolve("ok"), 1000, "test");
    expect(result).toBe("ok");
  });

  test("propagates rejection when promise rejects before timeout", async () => {
    const failing = Promise.reject(new Error("original"));
    expect(withTimeout(failing, 1000, "test")).rejects.toThrow("original");
  });

  test("throws timeout error when promise exceeds deadline", async () => {
    const slow = new Promise(() => {}); // never resolves
    expect(withTimeout(slow, 10, "LLM call")).rejects.toThrow(
      "LLM call timed out after 10ms",
    );
  });

  test("clears timer on success (no leaked timers)", async () => {
    // If the timer leaked, the test runner would warn about open handles.
    // We just verify it completes cleanly with a generous timeout.
    const result = await withTimeout(
      Promise.resolve(42),
      60_000,
      "long-timer",
    );
    expect(result).toBe(42);
  });
});
