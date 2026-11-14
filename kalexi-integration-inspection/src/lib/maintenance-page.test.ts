import { describe, expect, test } from "vitest";
import { renderMaintenancePage } from "./maintenance-page";
import {
  isMaintenanceAllowedFunction,
  isMaintenanceAllowedServerFnPath,
  isProtectedApplicationPath,
} from "./maintenance";

describe("maintenance response page", () => {
  test("shows the required maintenance message and support contact", () => {
    const html = renderMaintenancePage({
      configurationAvailable: true,
      message: null,
      estimatedCompletionTime: null,
    });

    expect(html).toContain("System Under Maintenance");
    expect(html).toContain(
      "We are currently performing scheduled system maintenance to improve the reliability, security, and performance of our services.",
    );
    expect(html).toContain("Your access will be restored once maintenance is complete.");
    expect(html).toContain("Maintenance in progress");
    expect(html).toContain("info@kalexibrokerage.com");
    expect(html).toContain('href="/maintenance">Administrator sign-in</a>');
    expect(html).not.toContain("Estimated return:");
  });

  test("escapes administrator messages and displays estimates only when configured", () => {
    const html = renderMaintenancePage({
      configurationAvailable: true,
      message: "<script>alert('bad')</script>",
      estimatedCompletionTime: "2026-10-22T18:00:00.000Z",
    });

    expect(html).toContain("&lt;script&gt;alert(&#39;bad&#39;)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("Estimated return:");
    expect(html).toContain('datetime="2026-10-22T18:00:00.000Z"');
  });

  test("reports a configuration outage without presenting it as scheduled maintenance", () => {
    const html = renderMaintenancePage({
      configurationAvailable: false,
      message: null,
      estimatedCompletionTime: null,
    });

    expect(html).toContain("System Temporarily Unavailable");
    expect(html).toContain("Availability check unavailable");
    expect(html).not.toContain("Maintenance in progress");
  });
});

describe("maintenance-protected application routes", () => {
  test("recognizes authenticated route paths and nested pages", () => {
    expect(isProtectedApplicationPath("/admin")).toBe(true);
    expect(isProtectedApplicationPath("/admin/users")).toBe(true);
    expect(isProtectedApplicationPath("/dashboard")).toBe(true);
    expect(isProtectedApplicationPath("/")).toBe(false);
    expect(isProtectedApplicationPath("/maintenance")).toBe(false);
    expect(isProtectedApplicationPath("/administrator")).toBe(false);
  });

  test("allows only required maintenance controls and normal sign-in operations", () => {
    expect(
      isMaintenanceAllowedFunction({
        filename: "src/lib/auth.functions.ts",
        name: "signInWithPhone",
      }),
    ).toBe(true);
    expect(
      isMaintenanceAllowedFunction({
        filename: "src/lib/publicform.functions.ts",
        name: "getPublicForm",
      }),
    ).toBe(true);
    expect(
      isMaintenanceAllowedFunction({
        filename: "src/lib/publicform.functions.ts",
        name: "submitPublicForm",
      }),
    ).toBe(false);
    expect(
      isMaintenanceAllowedFunction({
        filename: "src/lib/maintenance.functions.ts",
        name: "saveMaintenanceSettings",
      }),
    ).toBe(true);
    expect(
      isMaintenanceAllowedFunction({
        filename: "src/lib/admin.functions.ts",
        name: "adminCreateUser",
      }),
    ).toBe(false);
  });

  test("allows sign-in functions with TanStack's generated server-function metadata", () => {
    expect(
      isMaintenanceAllowedFunction({
        filename: "/src/lib/auth.functions.ts?tss-serverfn-split",
        name: "lookupLoginIdentity_createServerFn_handler",
      }),
    ).toBe(true);
    expect(
      isMaintenanceAllowedFunction({
        filename: "/src/lib/maintenance.functions.ts?tss-serverfn-split",
        name: "getMaintenanceStatus_createServerFn_handler",
      }),
    ).toBe(true);
    const encodedRequestPath =
      "/_serverFn/eyJmaWxlIjoiL3NyYy9saWIvYXV0aC5mdW5jdGlvbnMudHM_dHNzLXNlcnZlcmZuLXNwbGl0IiwiZXhwb3J0IjoibG9va3VwTG9naW5JZGVudGl0eV9jcmVhdGVTZXJ2ZXJGbl9oYW5kbGVyIn0";
    expect(isMaintenanceAllowedServerFnPath(encodedRequestPath)).toBe(true);
    expect(isMaintenanceAllowedServerFnPath("/_serverFn/invalid")).toBe(false);
    const publicFormReadPath = `/_serverFn/${Buffer.from(
      JSON.stringify({
        file: "/src/lib/publicform.functions.ts?tss-serverfn-split",
        export: "getPublicForm_createServerFn_handler",
      }),
    ).toString("base64url")}`;
    expect(isMaintenanceAllowedServerFnPath(publicFormReadPath)).toBe(true);
  });
});
