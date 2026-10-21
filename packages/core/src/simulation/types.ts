import { PaymentParams } from "../types";

// ── Existing single-payment simulation types ────────────────────────────────

export type SimulationStatus = "success" | "warning" | "error";

export interface SimulationFinding {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  field?: string;
}

export interface SimulationResult {
  status: SimulationStatus;
  findings: SimulationFinding[];
  canProceed: boolean;
  estimatedFee?: bigint;
}

export interface SimulationOptions {
  /** Skip ZK proof generation during simulation (faster dry-run). Defaults to true. */
  skipProof?: boolean;
  /** Override the network for simulation purposes */
  network?: string;
  /**
   * Employer allowlist of permitted payment asset IDs. When supplied, the
   * preflight rejects assets that are not on the list.
   */
  allowedAssetIds?: readonly string[];
}

export type SimulationInput = PaymentParams & { options?: SimulationOptions };

// ── End-to-end payroll simulation types ─────────────────────────────────────

/** Company configuration for a simulation run. */
export interface SimulationCompanyConfig {
  /** Unique company identifier */
  id: string;
  /** Human-readable company name (never logged with salary data) */
  name: string;
  /** Soroban contract ID that holds the treasury */
  contractId: string;
}

/** An employee record used as simulation input. */
export interface SimulationEmployeeRecord {
  /** Unique employee identifier */
  id: string;
  /** Stellar public key that receives the private payment */
  address: string;
  /** Salary amount in stroops — treated as sensitive at all times */
  salaryAmount: bigint;
  /** Asset identifier ("native" or a Soroban token contract ID) */
  asset: string;
  /** Optional department label (non-sensitive metadata) */
  department?: string;
}

/** Metadata describing the payroll period being simulated. */
export interface PayrollPeriodMetadata {
  /** Unique period identifier (e.g. "2025-Q2-P1") */
  periodId: string;
  /** ISO-8601 start date of the pay period */
  startDate: string;
  /** ISO-8601 end date of the pay period */
  endDate: string;
}

/** Mock treasury state used to check solvency before execution. */
export interface MockTreasuryState {
  /** Available balance in stroops */
  balance: bigint;
  /** Asset the treasury holds */
  asset: string;
}

/** Network settings for the simulation. */
export interface SimulationNetworkSettings {
  /** Network passphrase or name (e.g. "testnet", "mainnet") */
  network: string;
  /** Timeout in milliseconds for simulated transaction polling */
  timeoutMs?: number;
  /** Polling interval in milliseconds for simulated transaction polling */
  intervalMs?: number;
}

/** Configuration for the proof simulation layer. */
export interface ProofSimulationConfig {
  /** When true, simulates a proof generation failure */
  shouldFail?: boolean;
  /** Custom error message if shouldFail is true */
  failureMessage?: string;
  /** Latency in ms to simulate during proof generation (default: 0) */
  simulatedLatencyMs?: number;
}

/** Configuration for the transaction simulation layer. */
export interface TransactionSimulationConfig {
  /** When true, simulates a transaction timeout */
  shouldTimeout?: boolean;
  /** When true, simulates a transaction submission failure */
  shouldFail?: boolean;
  /** Custom error message for transaction failure */
  failureMessage?: string;
  /** Latency in ms to simulate during transaction submission */
  simulatedLatencyMs?: number;
}

/** Full configuration for a payroll simulation run. */
export interface PayrollSimulationConfig {
  company: SimulationCompanyConfig;
  employees: SimulationEmployeeRecord[];
  payrollPeriod: PayrollPeriodMetadata;
  treasury: MockTreasuryState;
  network: SimulationNetworkSettings;
  proof?: ProofSimulationConfig;
  transaction?: TransactionSimulationConfig;
}

/** A deterministic salary commitment for a single employee. */
export interface SalaryCommitment {
  /** Employee ID */
  employeeId: string;
  /** Deterministic commitment hash (does not reveal salary) */
  commitmentHash: string;
  /** Asset identifier */
  asset: string;
}

/** Status of a single simulated employee payment. */
export type SimulatedPaymentStatus =
  "pending" | "proof_generated" | "submitted" | "confirmed" | "failed";

/** Outcome of a single employee payment within the simulation. */
export interface SimulatedPaymentOutcome {
  /** Employee ID */
  employeeId: string;
  /** Stellar address (public, non-sensitive) */
  address: string;
  /** Asset identifier */
  asset: string;
  /** Terminal status */
  status: SimulatedPaymentStatus;
  /** Transaction hash, present if submitted */
  txHash?: string;
  /** Human-readable error, present if failed */
  error?: string;
  /** Recovery instructions for dashboard/CLI consumers */
  recoveryHint?: string;
  /** Duration of this individual payment in ms */
  durationMs: number;
}

/** Reconciliation entry mapping a private input to a public outcome. */
export interface ReconciliationEntry {
  /** Employee ID */
  employeeId: string;
  /** Commitment hash that was generated for this employee */
  commitmentHash: string;
  /** Transaction hash on-chain */
  txHash?: string;
  /** Whether the payment succeeded */
  succeeded: boolean;
  /** Error code if failed */
  errorCode?: string;
}

/** Full reconciliation summary for the simulation run. */
export interface ReconciliationSummary {
  /** Payroll run ID (derived from period ID and company ID) */
  runId: string;
  /** Overall status */
  status: "success" | "partial" | "failure";
  /** Total number of employees processed */
  totalEmployees: number;
  /** Number of successful payments */
  successCount: number;
  /** Number of failed payments */
  failureCount: number;
  /** Per-employee reconciliation entries */
  entries: ReconciliationEntry[];
  /** Total estimated fees in stroops */
  estimatedFees: bigint;
}

/** The complete result of a payroll simulation run. */
export interface PayrollSimulationResult {
  /** Unique run identifier */
  runId: string;
  /** Overall status */
  status: "success" | "partial" | "failure";
  /** Salary commitments generated for each employee */
  commitments: SalaryCommitment[];
  /** Per-employee payment outcomes */
  outcomes: SimulatedPaymentOutcome[];
  /** Reconciliation summary */
  reconciliation: ReconciliationSummary;
  /** Total wall-clock duration in ms */
  durationMs: number;
  /** ISO-8601 timestamp of when the simulation completed */
  completedAt: string;
}

/** Error code constants for simulation failures. */
export const SimulationErrorCode = {
  INVALID_PROOF_CONFIG: "SIM_INVALID_PROOF_CONFIG",
  PROOF_GENERATION_FAILED: "SIM_PROOF_GENERATION_FAILED",
  INSUFFICIENT_TREASURY: "SIM_INSUFFICIENT_TREASURY",
  TRANSACTION_TIMEOUT: "SIM_TRANSACTION_TIMEOUT",
  TRANSACTION_FAILED: "SIM_TRANSACTION_FAILED",
  INVALID_EMPLOYEE_RECORD: "SIM_INVALID_EMPLOYEE_RECORD",
  INVALID_COMPANY_CONFIG: "SIM_INVALID_COMPANY_CONFIG",
} as const;

export type SimulationErrorCode = (typeof SimulationErrorCode)[keyof typeof SimulationErrorCode];
