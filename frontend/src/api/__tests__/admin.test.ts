import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../tests/msw/server";
import {
  getBuildingsCount,
  getGeneralMeetingsCount,
  listBuildings,
  listGeneralMeetings,
  deleteGeneralMeeting,
  deleteBuilding,
  deleteMotion,
} from "../admin";

const BASE = "http://localhost:8000";

describe("getBuildingsCount", () => {
  // --- Happy path ---

  it("returns count without name filter", async () => {
    server.use(
      http.get(`${BASE}/api/admin/buildings/count`, () =>
        HttpResponse.json({ count: 42 })
      )
    );
    const result = await getBuildingsCount();
    expect(result).toEqual({ count: 42 });
  });

  it("sends name query param when provided", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${BASE}/api/admin/buildings/count`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ count: 3 });
      })
    );
    const result = await getBuildingsCount("Alpha");
    expect(result).toEqual({ count: 3 });
    expect(capturedUrl).toContain("name=Alpha");
  });

  it("does not send name param when undefined", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${BASE}/api/admin/buildings/count`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ count: 10 });
      })
    );
    await getBuildingsCount(undefined);
    expect(capturedUrl).not.toContain("name");
  });
});

describe("getGeneralMeetingsCount", () => {
  // --- Happy path ---

  it("returns count without filters", async () => {
    server.use(
      http.get(`${BASE}/api/admin/general-meetings/count`, () =>
        HttpResponse.json({ count: 7 })
      )
    );
    const result = await getGeneralMeetingsCount();
    expect(result).toEqual({ count: 7 });
  });

  it("sends name query param when provided", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${BASE}/api/admin/general-meetings/count`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ count: 2 });
      })
    );
    await getGeneralMeetingsCount({ name: "AGM 2024" });
    expect(capturedUrl).toContain("name=AGM+2024");
  });

  it("sends building_id query param when provided", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${BASE}/api/admin/general-meetings/count`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ count: 1 });
      })
    );
    await getGeneralMeetingsCount({ building_id: "b-123" });
    expect(capturedUrl).toContain("building_id=b-123");
  });

  it("sends both name and building_id params together", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${BASE}/api/admin/general-meetings/count`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ count: 1 });
      })
    );
    await getGeneralMeetingsCount({ name: "AGM", building_id: "b-456" });
    expect(capturedUrl).toContain("name=AGM");
    expect(capturedUrl).toContain("building_id=b-456");
  });

  it("does not send params when not provided", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${BASE}/api/admin/general-meetings/count`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ count: 5 });
      })
    );
    await getGeneralMeetingsCount({});
    expect(capturedUrl).not.toContain("name");
    expect(capturedUrl).not.toContain("building_id");
  });
});

describe("listBuildings with params", () => {
  // --- Happy path ---

  it("sends limit and offset params", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${BASE}/api/admin/buildings`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([]);
      })
    );
    await listBuildings({ limit: 20, offset: 40 });
    expect(capturedUrl).toContain("limit=20");
    expect(capturedUrl).toContain("offset=40");
  });

  it("sends name param when provided", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${BASE}/api/admin/buildings`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([]);
      })
    );
    await listBuildings({ name: "Tower" });
    expect(capturedUrl).toContain("name=Tower");
  });

  it("sends no query string when no params given", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${BASE}/api/admin/buildings`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([]);
      })
    );
    await listBuildings();
    expect(capturedUrl).not.toContain("?");
  });

  it("sends no query string when empty params object given", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${BASE}/api/admin/buildings`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([]);
      })
    );
    await listBuildings({});
    expect(capturedUrl).not.toContain("?");
  });
});

describe("listGeneralMeetings with params", () => {
  // --- Happy path ---

  it("sends limit and offset params", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${BASE}/api/admin/general-meetings`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([]);
      })
    );
    await listGeneralMeetings({ limit: 20, offset: 20 });
    expect(capturedUrl).toContain("limit=20");
    expect(capturedUrl).toContain("offset=20");
  });

  it("sends name param", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${BASE}/api/admin/general-meetings`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([]);
      })
    );
    await listGeneralMeetings({ name: "AGM" });
    expect(capturedUrl).toContain("name=AGM");
  });

  it("sends building_id param", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${BASE}/api/admin/general-meetings`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([]);
      })
    );
    await listGeneralMeetings({ building_id: "b-789" });
    expect(capturedUrl).toContain("building_id=b-789");
  });

  it("sends no query string when no params given", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${BASE}/api/admin/general-meetings`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([]);
      })
    );
    await listGeneralMeetings();
    expect(capturedUrl).not.toContain("?");
  });
});

describe("deleteGeneralMeeting", () => {
  // --- State / precondition errors ---

  it("throws on non-ok response", async () => {
    server.use(
      http.delete(`${BASE}/api/admin/general-meetings/:meetingId`, () =>
        HttpResponse.json({ detail: "Cannot delete" }, { status: 409 })
      )
    );
    await expect(deleteGeneralMeeting("agm-conflict")).rejects.toThrow("409");
  });
});

describe("deleteBuilding", () => {
  // --- State / precondition errors ---

  it("throws on non-ok response", async () => {
    server.use(
      http.delete(`${BASE}/api/admin/buildings/:buildingId`, () =>
        HttpResponse.json({ detail: "Cannot delete" }, { status: 409 })
      )
    );
    await expect(deleteBuilding("b-conflict")).rejects.toThrow("409");
  });
});

describe("deleteMotion", () => {
  // --- State / precondition errors ---

  it("throws on non-ok response", async () => {
    server.use(
      http.delete(`${BASE}/api/admin/motions/:motionId`, () =>
        HttpResponse.json({ detail: "Cannot delete" }, { status: 409 })
      )
    );
    await expect(deleteMotion("m-conflict")).rejects.toThrow("409");
  });
});
