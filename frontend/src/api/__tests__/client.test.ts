import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../tests/msw/server";
import { apiFetch, apiFetchBlob, apiFetchVoid } from "../client";

const BASE = "http://localhost";

describe("apiFetch", () => {
  // --- Happy path ---

  it("returns parsed JSON on 200", async () => {
    server.use(
      http.get(`${BASE}/api/test-endpoint`, () =>
        HttpResponse.json({ ok: true })
      )
    );
    const result = await apiFetch<{ ok: boolean }>("/api/test-endpoint");
    expect(result).toEqual({ ok: true });
  });

  it("sends X-Requested-With: XMLHttpRequest on every request (CSRF header)", async () => {
    let xRequestedWith: string | null = null;
    server.use(
      http.post(`${BASE}/api/test-csrf`, ({ request }) => {
        xRequestedWith = request.headers.get("x-requested-with");
        return HttpResponse.json({ ok: true });
      })
    );
    await apiFetch("/api/test-csrf", { method: "POST", body: JSON.stringify({}) });
    expect(xRequestedWith).toBe("XMLHttpRequest");
  });

  it("preserves X-Requested-With even when caller passes explicit headers", async () => {
    let xRequestedWith: string | null = null;
    server.use(
      http.post(`${BASE}/api/test-csrf-explicit-headers`, ({ request }) => {
        xRequestedWith = request.headers.get("x-requested-with");
        return HttpResponse.json({ ok: true });
      })
    );
    // Simulate the testSmtpConfig pattern: caller passes headers: { "Content-Type": ... }
    await apiFetch("/api/test-csrf-explicit-headers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(xRequestedWith).toBe("XMLHttpRequest");
  });

  it("sends FormData without Content-Type header (lets browser set boundary)", async () => {
    let contentType: string | null = null;
    server.use(
      http.post(`${BASE}/api/test-upload`, ({ request }) => {
        contentType = request.headers.get("content-type");
        return HttpResponse.json({ uploaded: true });
      })
    );
    const formData = new FormData();
    formData.append("file", new File(["data"], "test.csv"));
    await apiFetch("/api/test-upload", { method: "POST", body: formData });
    // Browser sets multipart/form-data boundary automatically — Content-Type
    // should NOT be overridden to application/json by apiFetch.
    expect(contentType).not.toBe("application/json");
  });

  // --- State / precondition errors ---

  it("throws on non-ok response with status code in message", async () => {
    server.use(
      http.get(`${BASE}/api/test-error`, () =>
        HttpResponse.json({ detail: "not found" }, { status: 404 })
      )
    );
    await expect(apiFetch("/api/test-error")).rejects.toThrow("404");
  });

  it("throws on 500 response", async () => {
    server.use(
      http.get(`${BASE}/api/test-500`, () =>
        new HttpResponse("Internal Server Error", { status: 500 })
      )
    );
    await expect(apiFetch("/api/test-500")).rejects.toThrow("500");
  });
});

describe("apiFetchVoid", () => {
  // --- Happy path ---

  it("resolves when called with no options argument (GET default)", async () => {
    server.use(
      http.get(`${BASE}/api/test-void-no-options`, () =>
        new HttpResponse(null, { status: 204 })
      )
    );
    const result = await apiFetchVoid("/api/test-void-no-options");
    expect(result).toBeUndefined();
  });

  it("sends X-Requested-With: XMLHttpRequest on every request (CSRF header)", async () => {
    let xRequestedWith: string | null = null;
    server.use(
      http.delete(`${BASE}/api/test-void-csrf`, ({ request }) => {
        xRequestedWith = request.headers.get("x-requested-with");
        return new HttpResponse(null, { status: 204 });
      })
    );
    await apiFetchVoid("/api/test-void-csrf", { method: "DELETE" });
    expect(xRequestedWith).toBe("XMLHttpRequest");
  });

  it("resolves to undefined on 204 no-content response", async () => {
    server.use(
      http.delete(`${BASE}/api/test-delete`, () =>
        new HttpResponse(null, { status: 204 })
      )
    );
    const result = await apiFetchVoid("/api/test-delete", { method: "DELETE" });
    expect(result).toBeUndefined();
  });

  it("resolves to undefined on 200 response (e.g. legacy endpoints)", async () => {
    server.use(
      http.delete(`${BASE}/api/test-delete-200`, () =>
        new HttpResponse(null, { status: 200 })
      )
    );
    const result = await apiFetchVoid("/api/test-delete-200", { method: "DELETE" });
    expect(result).toBeUndefined();
  });

  it("preserves X-Requested-With even when caller passes explicit headers", async () => {
    let xRequestedWith: string | null = null;
    server.use(
      http.post(`${BASE}/api/test-void-csrf-explicit-headers`, ({ request }) => {
        xRequestedWith = request.headers.get("x-requested-with");
        return new HttpResponse(null, { status: 204 });
      })
    );
    await apiFetchVoid("/api/test-void-csrf-explicit-headers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(xRequestedWith).toBe("XMLHttpRequest");
  });

  it("sends FormData without overriding Content-Type", async () => {
    let contentType: string | null = null;
    server.use(
      http.post(`${BASE}/api/test-void-upload`, ({ request }) => {
        contentType = request.headers.get("content-type");
        return new HttpResponse(null, { status: 204 });
      })
    );
    const formData = new FormData();
    formData.append("file", new File(["data"], "test.csv"));
    await apiFetchVoid("/api/test-void-upload", { method: "POST", body: formData });
    expect(contentType).not.toBe("application/json");
  });

  // --- State / precondition errors ---

  it("throws on 409 conflict response", async () => {
    server.use(
      http.delete(`${BASE}/api/test-delete-conflict`, () =>
        HttpResponse.json({ detail: "Conflict" }, { status: 409 })
      )
    );
    await expect(
      apiFetchVoid("/api/test-delete-conflict", { method: "DELETE" })
    ).rejects.toThrow("409");
  });

  it("throws on 403 forbidden response", async () => {
    server.use(
      http.delete(`${BASE}/api/test-delete-403`, () =>
        new HttpResponse("Forbidden", { status: 403 })
      )
    );
    await expect(
      apiFetchVoid("/api/test-delete-403", { method: "DELETE" })
    ).rejects.toThrow("403");
  });

  it("throws on 500 server error", async () => {
    server.use(
      http.delete(`${BASE}/api/test-delete-500`, () =>
        new HttpResponse("Server Error", { status: 500 })
      )
    );
    await expect(
      apiFetchVoid("/api/test-delete-500", { method: "DELETE" })
    ).rejects.toThrow("500");
  });
});

describe("apiFetchBlob", () => {
  it("returns the response blob", async () => {
    server.use(
      http.get(`${BASE}/api/test-blob`, () =>
        new HttpResponse(new Blob(["%PDF-1.4"]), {
          headers: { "Content-Type": "application/pdf" },
        })
      )
    );

    const result = await apiFetchBlob("/api/test-blob");

    expect(result.type).toBe("application/pdf");
    expect(result.size).toBeGreaterThan(0);
  });

  it("preserves the CSRF header and caller headers", async () => {
    let requestedWith: string | null = null;
    let customHeader: string | null = null;
    server.use(
      http.get(`${BASE}/api/test-blob-headers`, ({ request }) => {
        requestedWith = request.headers.get("x-requested-with");
        customHeader = request.headers.get("x-test");
        return new HttpResponse(new Blob(["data"]));
      })
    );

    await apiFetchBlob("/api/test-blob-headers", {
      headers: { "X-Test": "present" },
    });

    expect(requestedWith).toBe("XMLHttpRequest");
    expect(customHeader).toBe("present");
  });

  it("throws with status and body on a failed response", async () => {
    server.use(
      http.get(`${BASE}/api/test-blob-error`, () =>
        new HttpResponse("Meeting is not closed", { status: 409 })
      )
    );

    await expect(apiFetchBlob("/api/test-blob-error")).rejects.toThrow(
      "HTTP 409: Meeting is not closed"
    );
  });
});

describe("X-Client-Session-ID correlation header", () => {
  it("generates and reuses the same client session ID across apiFetch, apiFetchVoid, and apiFetchBlob", async () => {
    window.sessionStorage.removeItem("agm_client_session_id");
    const seenIds: Array<string | null> = [];

    server.use(
      http.get(`${BASE}/api/test-session-1`, ({ request }) => {
        seenIds.push(request.headers.get("x-client-session-id"));
        return HttpResponse.json({ ok: true });
      }),
      http.post(`${BASE}/api/test-session-2`, ({ request }) => {
        seenIds.push(request.headers.get("x-client-session-id"));
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(`${BASE}/api/test-session-3`, ({ request }) => {
        seenIds.push(request.headers.get("x-client-session-id"));
        return new HttpResponse(new Blob(["ok"]));
      })
    );

    await apiFetch("/api/test-session-1");
    await apiFetchVoid("/api/test-session-2", { method: "POST", body: JSON.stringify({}) });
    await apiFetchBlob("/api/test-session-3");

    expect(seenIds).toHaveLength(3);
    expect(seenIds[0]).toBeTruthy();
    expect(seenIds[1]).toBe(seenIds[0]);
    expect(seenIds[2]).toBe(seenIds[0]);
  });
});
