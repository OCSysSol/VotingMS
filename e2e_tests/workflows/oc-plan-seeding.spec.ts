import { expect, test, RUN_SUFFIX } from "../fixtures";
import { generateOcPlanNumber, makeAdminApi, seedBuilding } from "./helpers";

test("generated buildings receive stable OC Plans including multi-plan suffixes", async () => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
  const api = await makeAdminApi(baseURL);
  const buildingName = `E2E OC Plan Seed Building-${RUN_SUFFIX}`;
  const basePlan = generateOcPlanNumber(buildingName);
  const planOne = generateOcPlanNumber(buildingName, 1);
  const planTwo = generateOcPlanNumber(buildingName, 2);

  expect(basePlan).toMatch(/^PS\d{6}[A-Z]$/);
  expect(planOne).toMatch(/^PS\d{6}[A-Z]1$/);
  expect(planTwo).toMatch(/^PS\d{6}[A-Z]2$/);

  try {
    await seedBuilding(api, buildingName, "oc-plan-seed@test.com");
    await seedBuilding(api, buildingName, "oc-plan-seed@test.com", planOne);
    await seedBuilding(api, buildingName, "oc-plan-seed@test.com", planTwo);

    const response = await api.get(
      `/api/admin/buildings?name=${encodeURIComponent(buildingName)}&limit=100`,
    );
    expect(response.ok()).toBe(true);
    const buildings = (await response.json()) as Array<{
      name: string;
      oc_plan_number: string | null;
    }>;
    const plans = buildings
      .filter((building) => building.name === buildingName)
      .map((building) => building.oc_plan_number);

    expect(plans).toContain(basePlan);
    expect(plans).toContain(planOne);
    expect(plans).toContain(planTwo);
  } finally {
    await api.dispose();
  }
});
