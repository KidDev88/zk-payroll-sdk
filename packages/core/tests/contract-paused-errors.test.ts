import {
  ContractErrorCode,
  ContractExecutionError,
  DEFAULT_ERROR_MESSAGES,
  mapRpcError,
} from "../src/core/errors";
import {
  PAUSED_ERROR_MESSAGES,
  PausedErrorCode,
  getPausedContractErrorMessage,
  isContractPausedError,
  isPaymentPausedError,
  isPayrollPausedError,
  mapPausedContractError,
} from "../src/errors/contractErrors";
import {
  ERROR_CODE_REGISTRY,
  getSuggestedMessage,
  isRetryableErrorCode,
} from "../src/core/error-codes";

describe("paused contract error mapping", () => {
  describe("successful case — detection", () => {
    it("detects a paused contract from a revert message", () => {
      expect(isContractPausedError(new Error("contract is paused"))).toBe(true);
      expect(isContractPausedError(new Error("Error(Contract, #12) // ContractPaused"))).toBe(true);
      expect(isContractPausedError(new Error("CONTRACT_PAUSED"))).toBe(true);
      expect(isContractPausedError("payroll is paused")).toBe(true);
    });

    it("detects payroll-paused and payment-paused variants", () => {
      expect(isPayrollPausedError(new Error("payroll is paused"))).toBe(true);
      expect(isPaymentPausedError(new Error("payments are paused"))).toBe(true);
      expect(isPaymentPausedError(new Error("payment paused by admin"))).toBe(true);
    });

    it("maps a paused error to an actionable ContractExecutionError", () => {
      const raw = new Error("contract is paused");
      const mapped = mapPausedContractError(raw);

      expect(mapped).toBeInstanceOf(ContractExecutionError);
      expect(mapped.code).toBe(ContractErrorCode.CONTRACT_PAUSED);
      expect(mapped.message).toBe(PAUSED_ERROR_MESSAGES[PausedErrorCode.CONTRACT_PAUSED]);
      expect(mapped.message).toMatch(/paused/i);
      expect(mapped.message).toMatch(/try again later|contact your payroll administrator/i);
      expect(mapped.failureState).toBe("TERMINAL");
      expect(mapped.cause).toBe(raw);
    });

    it("routes payroll-paused and payment-paused to specific messages", () => {
      expect(getPausedContractErrorMessage(new Error("payroll is paused"))).toBe(
        PAUSED_ERROR_MESSAGES[PausedErrorCode.PAYROLL_PAUSED]
      );
      expect(getPausedContractErrorMessage(new Error("payments are paused"))).toBe(
        PAUSED_ERROR_MESSAGES[PausedErrorCode.PAYMENT_PAUSED]
      );
    });
  });

  describe("rejected case — non-paused errors are not misclassified", () => {
    it("does not treat unrelated contract errors as paused", () => {
      expect(isContractPausedError(new Error("insufficient balance"))).toBe(false);
      expect(isContractPausedError(new Error("invalid recipient"))).toBe(false);
      expect(isContractPausedError(new Error("Error(Contract, #3)"))).toBe(false);
      expect(isContractPausedError(null)).toBe(false);
    });

    it("mapPausedContractError falls through to UNKNOWN_RPC_ERROR for non-paused errors", () => {
      const mapped = mapPausedContractError(new Error("something else"));

      expect(mapped.code).toBe(ContractErrorCode.UNKNOWN_RPC_ERROR);
      expect(mapped.message).toContain("something else");
    });

    it("never leaks raw contract internals in paused messages", () => {
      const raw = new Error("Error(Contract, #12) contract is paused for account GSECRET123");
      const mapped = mapPausedContractError(raw);

      expect(mapped.message).not.toMatch(/GSECRET123/);
      expect(mapped.message).not.toMatch(/Error\(Contract/);
    });
  });

  describe("boundary case", () => {
    it("matches bare 'paused' in a payroll context but not in unrelated contexts", () => {
      // "payroll.*paused" pattern requires both words
      expect(isContractPausedError(new Error("the payroll was paused by governance"))).toBe(true);
      expect(isContractPausedError(new Error("the user paused their subscription"))).toBe(false);
    });

    it("mapRpcError routes paused messages to CONTRACT_PAUSED", () => {
      const mapped = mapRpcError(new Error("execution failed: contract is paused"));

      expect(mapped.code).toBe(ContractErrorCode.CONTRACT_PAUSED);
      expect(mapped.message).toBe(DEFAULT_ERROR_MESSAGES[ContractErrorCode.CONTRACT_PAUSED]);
    });

    it("mapRpcError still routes generic reverts to CONTRACT_REVERT", () => {
      const mapped = mapRpcError(new Error("contract revert: Error(Contract, #5)"));

      expect(mapped.code).toBe(ContractErrorCode.CONTRACT_REVERT);
    });

    it("registers CONTRACT_PAUSED as a non-retryable contract error with an actionable message", () => {
      expect(ERROR_CODE_REGISTRY[ContractErrorCode.CONTRACT_PAUSED]).toBeDefined();
      expect(isRetryableErrorCode(ContractErrorCode.CONTRACT_PAUSED)).toBe(false);
      expect(getSuggestedMessage(ContractErrorCode.CONTRACT_PAUSED)).toMatch(/paused/i);
    });
  });
});
