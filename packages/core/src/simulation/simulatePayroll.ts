import { PayrollValidation } from "../core/validation";
import { checkPaymentAssetAuthorization } from "../assets/paymentAssetAuthorization";
import { SimulationFinding, SimulationInput, SimulationOptions, SimulationResult } from "./types";

const BASE_FEE_STROOPS = 100n;
const PROOF_FEE_STROOPS = 500n;

function validateFields(input: SimulationInput): SimulationFinding[] {
  const findings: SimulationFinding[] = [];
  const result = PayrollValidation.validatePaymentParams(input);

  for (const err of result.errors) {
    findings.push({
      code: `INVALID_${err.field.toUpperCase()}`,
      severity: "error",
      message: err.message,
      field: err.field,
    });
  }

  return findings;
}

function checkAmountWarnings(input: SimulationInput): SimulationFinding[] {
  const findings: SimulationFinding[] = [];

  if (input.amount > 0n && input.amount < 100n) {
    findings.push({
      code: "LOW_AMOUNT",
      severity: "warning",
      message: "Payment amount is very low (< 100 stroops). Confirm this is intentional.",
      field: "amount",
    });
  }

  if (input.amount > 1_000_000_000_000n) {
    findings.push({
      code: "HIGH_AMOUNT",
      severity: "warning",
      message: "Payment amount exceeds 1,000,000 XLM. Double-check before submitting.",
      field: "amount",
    });
  }

  return findings;
}

function checkAssetWarnings(input: SimulationInput): SimulationFinding[] {
  const findings: SimulationFinding[] = [];

  if (input.asset && input.asset !== "native" && !input.asset.startsWith("C")) {
    findings.push({
      code: "UNRECOGNIZED_ASSET_FORMAT",
      severity: "warning",
      message:
        "Asset does not look like a native token or a Soroban contract ID (expected 'native' or a 'C...' address).",
      field: "asset",
    });
  }

  return findings;
}

/**
 * Preflight authorization check for the payment asset.
 *
 * Rejects assets that are not payment-compatible, not registered, or not on
 * the employer's allowlist (when one is supplied in `options.allowedAssetIds`).
 */
function checkAssetAuthorization(input: SimulationInput): SimulationFinding[] {
  const { options = {} } = input;
  if (input.asset === undefined) return [];

  const result = checkPaymentAssetAuthorization(input.asset, {
    allowedAssetIds: options.allowedAssetIds,
  });

  if (result.authorized) return [];

  return [
    {
      code: "PAYMENT_ASSET_UNAUTHORIZED",
      severity: "error",
      message: result.message ?? "Payment asset is not authorized.",
      field: "asset",
    },
  ];
}

function estimateFee(options: SimulationOptions = {}): bigint {
  return options.skipProof !== false ? BASE_FEE_STROOPS : BASE_FEE_STROOPS + PROOF_FEE_STROOPS;
}

/**
 * Runs a preflight simulation against the provided payment input without
 * submitting a live transaction or generating a ZK proof.
 *
 * Use this before PayrollService.processPayment to surface validation
 * failures and cost estimates early.
 *
 * @example
 * const result = await simulatePayroll({ recipient, amount, asset });
 * if (!result.canProceed) throw new Error(result.findings[0].message);
 */
export async function simulatePayroll(input: SimulationInput): Promise<SimulationResult> {
  const { options = {} } = input;
  const findings: SimulationFinding[] = [
    ...validateFields(input),
    ...checkAmountWarnings(input),
    ...checkAssetWarnings(input),
    ...checkAssetAuthorization(input),
  ];

  const hasErrors = findings.some((f) => f.severity === "error");
  const hasWarnings = findings.some((f) => f.severity === "warning");

  const status = hasErrors ? "error" : hasWarnings ? "warning" : "success";
  const canProceed = !hasErrors;

  return {
    status,
    findings,
    canProceed,
    estimatedFee: canProceed ? estimateFee(options) : undefined,
  };
}
