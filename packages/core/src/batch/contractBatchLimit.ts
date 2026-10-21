/**
 * Contract payout batch limit
 *
 * Splits oversized payout batches so a single submission never exceeds the
 * per-transaction payout budget accepted by the payroll contract.
 *
 * ## Privacy & Security Guarantees
 * - Messages only ever contain aggregate counts (never salaries or amounts).
 * - No recipient identifiers appear in errors thrown from this module.
 */

import {
  BatchPaymentEntry,
  validateBatchPayload,
  type BatchValidationError,
} from "./BatchPayloadBuilder";

/**
 * Maximum number of payout entries the contract accepts in one submission.
 *
 * Kept aligned with `DEFAULT_MAX_ENTRIES_PER_TRANSACTION` in the execution
 * planner and `DEFAULT_BATCH_SIZE` in the safe batch submitter so a batch
 * produced here is never rejected on-chain for being oversized.
 */
export const CONTRACT_MAX_PAYOUT_BATCH_SIZE = 50;

/** Options for {@link splitPayoutBatchByContractLimit}. */
export interface ContractBatchLimitOptions {
  /**
   * Maximum entries per sub-batch. Defaults to
   * {@link CONTRACT_MAX_PAYOUT_BATCH_SIZE}. Must be a positive integer.
   */
  maxBatchSize?: number;
}

/** Result of splitting a payout batch against the contract limit. */
export interface ContractBatchSplitResult {
  /** Sub-batches, each at most `maxBatchSize` entries long. */
  chunks: BatchPaymentEntry[][];
  /** `true` when the input was larger than `maxBatchSize` and got split. */
  wasSplit: boolean;
  /** Number of payout entries in the input. */
  totalEntries: number;
  /** The limit that was applied. */
  maxBatchSize: number;
  /** Privacy-safe validation errors if the input failed validation. */
  errors: BatchValidationError[];
}

/** Error thrown when the configured contract batch limit is not usable. */
export class ContractBatchLimitError extends Error {
  readonly code = "INVALID_CONTRACT_BATCH_SIZE";

  constructor(maxBatchSize: number) {
    super(
      `Invalid contract batch limit: ${maxBatchSize}. ` + "maxBatchSize must be a positive integer."
    );
    this.name = "ContractBatchLimitError";
  }
}

/**
 * Split an oversized payout batch into contract-sized sub-batches.
 *
 * Entries are validated first. When the batch already fits within the limit
 * it is returned as a single chunk and `wasSplit` is `false`.
 *
 * @param entries - The payout inputs to split.
 * @param options - Optional limit override.
 * @throws ContractBatchLimitError when `maxBatchSize` is not a positive integer.
 */
export function splitPayoutBatchByContractLimit(
  entries: BatchPaymentEntry[],
  options: ContractBatchLimitOptions = {}
): ContractBatchSplitResult {
  const maxBatchSize = options.maxBatchSize ?? CONTRACT_MAX_PAYOUT_BATCH_SIZE;

  if (!Number.isInteger(maxBatchSize) || maxBatchSize <= 0) {
    throw new ContractBatchLimitError(maxBatchSize);
  }

  if (!entries || entries.length === 0) {
    return {
      chunks: [],
      wasSplit: false,
      totalEntries: 0,
      maxBatchSize,
      errors: [
        {
          code: "EMPTY_BATCH",
          message: "Batch must contain at least one payment entry",
          field: "entries",
        },
      ],
    };
  }

  const errors = validateBatchPayload(entries);
  if (errors.length > 0) {
    return {
      chunks: [],
      wasSplit: false,
      totalEntries: entries.length,
      maxBatchSize,
      errors,
    };
  }

  const chunks: BatchPaymentEntry[][] = [];
  for (let i = 0; i < entries.length; i += maxBatchSize) {
    chunks.push(entries.slice(i, i + maxBatchSize));
  }

  return {
    chunks,
    wasSplit: chunks.length > 1,
    totalEntries: entries.length,
    maxBatchSize,
    errors: [],
  };
}

/** Whether a payout batch exceeds the contract limit and must be split. */
export function exceedsContractBatchLimit(
  entryCount: number,
  maxBatchSize: number = CONTRACT_MAX_PAYOUT_BATCH_SIZE
): boolean {
  return entryCount > maxBatchSize;
}
