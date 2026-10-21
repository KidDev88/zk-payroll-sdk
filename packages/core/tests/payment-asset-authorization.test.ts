import { AssetRegistryClass } from "../src/assets/AssetRegistry";
import {
  PAYMENT_ASSET_UNAUTHORIZED_ERROR_CODE,
  assertPaymentAssetAuthorized,
  checkPaymentAssetAuthorization,
} from "../src/assets/paymentAssetAuthorization";
import { ValidationError } from "../src/core/errors";
import { simulatePayroll } from "../src/simulation/simulatePayroll";

const CUSTOM_TOKEN_ID = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const UNREGISTERED_TOKEN_ID = "CAKZGMMMJOHMSZ5V3DYKCUDNTIWBG57MAMFJDSVICNWUNVXLX6EZN3NC";

function makeRegistry(): AssetRegistryClass {
  const registry = new AssetRegistryClass();
  registry.register({
    id: CUSTOM_TOKEN_ID,
    symbol: "AUTHTKN",
    label: "Authorized Token",
    decimals: 7,
  });
  return registry;
}

describe("checkPaymentAssetAuthorization", () => {
  describe("successful case", () => {
    it("authorizes a registered asset when no allowlist is supplied", () => {
      const result = checkPaymentAssetAuthorization("native", { registry: makeRegistry() });

      expect(result).toEqual({ assetId: "native", authorized: true, code: "ok" });
    });

    it("authorizes an allowlisted custom token", () => {
      const result = checkPaymentAssetAuthorization(CUSTOM_TOKEN_ID, {
        registry: makeRegistry(),
        allowedAssetIds: ["native", CUSTOM_TOKEN_ID],
      });

      expect(result.authorized).toBe(true);
      expect(result.code).toBe("ok");
      expect(result.message).toBeUndefined();
    });
  });

  describe("rejected case", () => {
    it("rejects an identifier that cannot name a payment asset", () => {
      const result = checkPaymentAssetAuthorization("not-an-asset!!", {
        registry: makeRegistry(),
      });

      expect(result.authorized).toBe(false);
      expect(result.code).toBe("not_payment_compatible");
      expect(result.message).toMatch(/incompatible with payroll payments/i);
    });

    it("rejects an unregistered asset", () => {
      const result = checkPaymentAssetAuthorization(UNREGISTERED_TOKEN_ID, {
        registry: makeRegistry(),
      });

      expect(result.authorized).toBe(false);
      expect(result.code).toBe("unregistered");
      expect(result.message).toMatch(/not registered/i);
    });

    it("rejects a registered asset that is not on the allowlist", () => {
      const result = checkPaymentAssetAuthorization(CUSTOM_TOKEN_ID, {
        registry: makeRegistry(),
        allowedAssetIds: ["native"],
      });

      expect(result.authorized).toBe(false);
      expect(result.code).toBe("not_allowlisted");
      expect(result.message).toMatch(/not authorized for this payroll/i);
    });

    it("assertPaymentAssetAuthorized throws a ValidationError with the stable code", () => {
      expect(() =>
        assertPaymentAssetAuthorized(UNREGISTERED_TOKEN_ID, { registry: makeRegistry() })
      ).toThrow(ValidationError);

      try {
        assertPaymentAssetAuthorized(UNREGISTERED_TOKEN_ID, { registry: makeRegistry() });
        throw new Error("expected assertPaymentAssetAuthorized to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).code).toBe(PAYMENT_ASSET_UNAUTHORIZED_ERROR_CODE);
        expect((err as ValidationError).context).toMatchObject({
          authorizationCode: "unregistered",
        });
      }
    });
  });

  describe("boundary case", () => {
    it("treats an empty allowlist as rejecting every asset", () => {
      const result = checkPaymentAssetAuthorization("native", {
        registry: makeRegistry(),
        allowedAssetIds: [],
      });

      expect(result.authorized).toBe(false);
      expect(result.code).toBe("not_allowlisted");
    });

    it("accepts a single-entry allowlist containing exactly the asset", () => {
      const result = checkPaymentAssetAuthorization(CUSTOM_TOKEN_ID, {
        registry: makeRegistry(),
        allowedAssetIds: [CUSTOM_TOKEN_ID],
      });

      expect(result.authorized).toBe(true);
    });

    it("rejects non-string assets without leaking their value in the message", () => {
      const result = checkPaymentAssetAuthorization(42, { registry: makeRegistry() });

      expect(result.authorized).toBe(false);
      expect(result.code).toBe("not_payment_compatible");
      expect(result.message).not.toContain("42");
    });
  });
});

describe("simulatePayroll — payment asset authorization preflight", () => {
  it("passes when the asset is authorized", async () => {
    const result = await simulatePayroll({
      recipient: "GAUTHTEST",
      amount: 1000n,
      asset: "native",
    });

    expect(result.canProceed).toBe(true);
    expect(result.findings.map((f) => f.code)).not.toContain("PAYMENT_ASSET_UNAUTHORIZED");
  });

  it("blocks the preflight when the asset is not on the allowlist", async () => {
    const result = await simulatePayroll({
      recipient: "GAUTHTEST",
      amount: 1000n,
      asset: "native",
      options: { allowedAssetIds: ["USDC"] },
    });

    expect(result.canProceed).toBe(false);
    const finding = result.findings.find((f) => f.code === "PAYMENT_ASSET_UNAUTHORIZED");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("error");
    expect(finding?.message).not.toMatch(/1000/);
  });

  it("blocks the preflight for an unregistered asset when an allowlist is supplied", async () => {
    const result = await simulatePayroll({
      recipient: "GAUTHTEST",
      amount: 1n,
      asset: UNREGISTERED_TOKEN_ID,
      options: { allowedAssetIds: ["native"] },
    });

    expect(result.canProceed).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain("PAYMENT_ASSET_UNAUTHORIZED");
  });
});
