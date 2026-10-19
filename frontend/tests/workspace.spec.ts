import { test, expect } from "@playwright/test";

const token = "browser-test-token-for-local-fixtures-only";
test("fixture, import, persistent report, comparison and legacy review", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Evidence before approval." }),
  ).toBeVisible();
  await page.getByText("Connect private workspace", { exact: true }).click();
  await page.getByLabel("Workspace token", { exact: true }).fill(token);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("button", { name: "Benchmarks", exact: true }).click();
  await page.getByLabel("Search", { exact: true }).fill("Tenant");
  await expect(
    page.getByRole("heading", { name: "Tenant access boundary" }),
  ).toBeVisible();
  await page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", {
        name: "Tenant access boundary",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Inspect task" })
    .click();
  await page
    .getByRole("combobox", { name: "Implementation", exact: true })
    .selectOption("broken");
  await page.getByRole("button", { name: "Run fixture evaluation" }).click();
  const report = page.getByRole("article", { name: "Evaluation report" });
  await expect(report.getByText("rejected", { exact: true })).toBeVisible();
  await expect(report.getByText("100/100").first()).toBeVisible();
  await expect(
    report
      .getByText("A curated security boundary assertion failed.", {
        exact: false,
      })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Implementation", exact: true })
    .selectOption("reference");
  await page.getByRole("button", { name: "Run fixture evaluation" }).click();
  await expect(
    report.getByText("review required", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Evaluation mode", exact: true })
    .selectOption("imported");
  await page
    .getByLabel("Model / agent label", { exact: true })
    .fill("Browser-test model");
  await page
    .getByLabel("Candidate source", { exact: true })
    .fill("def solve(value):\n    return True\n");
  await page.getByRole("button", { name: "Import and inspect" }).click();
  await expect(report.getByText("blocked", { exact: true })).toBeVisible();
  await expect(
    report.getByText("No candidate tests executed.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Comparisons", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: /Browser-test model/ }),
  ).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "Browser-test model" });
  await expect(
    row.getByRole("cell", { name: "Unavailable", exact: true }),
  ).toHaveCount(3);
  await page.screenshot({
    path: "test-results/pro-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByLabel("Search", { exact: true }).fill("Browser-test model");
  await page
    .getByRole("button", { name: /Open report/ })
    .first()
    .click();
  await expect(report.getByText("blocked", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Connect private workspace", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Human review", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Task library", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Review evidence and verification plan", { exact: true })
    .fill("Review evidence from the browser integration check.");
  await page.getByRole("button", { name: "Generate assessment" }).click();
  await expect(
    page.getByText(
      "Reviewer-attested criteria. No candidate code or model was executed.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile catalog stays within viewport and filters languages", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Benchmarks", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Language", exact: true })
    .selectOption("TypeScript");
  await expect(
    page.getByRole("heading", { name: "Typed quantity guard", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Inspect task" }).click();
  await expect(
    page.getByRole("combobox", { name: "Evaluation mode", exact: true }),
  ).toHaveValue("imported");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/pro-mobile.png",
    fullPage: true,
  });
});
