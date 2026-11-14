import { test, expect } from "../fixtures";

test.describe("Admin Buildings", () => {
  test("navigates to OC Plans page via sidebar", async ({ page }) => {
    await page.goto("/admin/buildings");
    await expect(page.getByText("Admin Portal").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "OC Plans" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "OC Plans", exact: true })).toBeVisible();
  });

  test("displays building table with data", async ({ page }) => {
    await page.goto("/admin/buildings");
    // Assumes at least one building exists in the seeded database
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Manager Email" })).toBeVisible();
  });

  test("CSV upload success shows created and updated counts", async ({ page }) => {
    await page.goto("/admin/buildings");
    const csvContent = "building_name,manager_email\nTest Building E2E,manager@test.com";
    const buffer = Buffer.from(csvContent, "utf-8");
    const fileInput = page.getByLabel("OC Plans file");
    await fileInput.setInputFiles({
      name: "buildings.csv",
      mimeType: "text/csv",
      buffer,
    });
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(page.getByText(/Import complete:/)).toBeVisible();
  });

  test("clicking an OC Plan row navigates to its detail page", async ({ page }) => {
    await page.goto("/admin/buildings");
    const firstBuildingRow = page
      .getByRole("row")
      .filter({ has: page.getByRole("button", { name: /^Open OC Plan / }) })
      .first();
    const ocPlanNumber = (
      await firstBuildingRow.getByRole("button", { name: /^Open OC Plan / }).textContent()
    )?.trim();
    expect(ocPlanNumber).toBeTruthy();
    await firstBuildingRow.getByRole("cell").nth(1).click();
    await expect(page).toHaveURL(/\/admin\/buildings\//);
    await expect(page.getByRole("heading", { name: ocPlanNumber!, exact: true })).toBeVisible();
  });

  test("create building via modal dialog", async ({ page }) => {
    const buildingName = `E2E Modal Building ${Date.now()}`;
    await page.goto("/admin/buildings");
    await expect(page.getByRole("heading", { name: "OC Plans", exact: true })).toBeVisible();

    // Open modal
    await page.getByRole("button", { name: "+ New OC Plan" }).click();
    await expect(page.getByRole("dialog", { name: "New OC Plan" })).toBeVisible();

    // Fill in the form
    await page.getByLabel("Building Name").fill(buildingName);
    await page.getByLabel("Manager Email").fill("e2e-modal@test.com");

    // Submit
    await page.getByRole("button", { name: "Create OC Plan" }).click();

    // Modal closes after success
    await expect(page.getByRole("dialog", { name: "New OC Plan" })).not.toBeVisible();

    // New building appears as plain text in a clickable row.
    const newBuildingRow = page.getByRole("row").filter({ hasText: buildingName });
    await expect(newBuildingRow).toBeVisible();
    await newBuildingRow.getByRole("cell").nth(1).click();
    await expect(page).toHaveURL(/\/admin\/buildings\//);
    await expect(page.getByRole("heading", { name: buildingName })).toBeVisible();
  });
});
