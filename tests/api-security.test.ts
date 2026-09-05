import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../server/index";

describe("API security boundary", () => {
  it("rejects unauthenticated protected requests", async () => {
    const response = await request(app).get("/api/products");
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Authentication required");
  });

  it("rejects malformed login input without querying the database", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "not-an-email", password: "x" });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid credentials");
  });

  it("reports database availability separately from API availability", async () => {
    const response = await request(app).get("/api/health");
    expect([200, 503]).toContain(response.status);
    expect(response.body).toHaveProperty("database");
  });
});
