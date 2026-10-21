import {
  CONTRACT_MAX_PAYOUT_BATCH_SIZE,
  ContractBatchLimitError,
  exceedsContractBatchLimit,
  splitPayoutBatchByContractLimit,
} from "../src/batch/contractBatchLimit";
import type { BatchPaymentEntry } from "../src/batch/BatchPayloadBuilder";

function makeEntries(count: number): BatchPaymentEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    recipient: `GSPLIT${String(i).padStart(53, "0")}`,
    amount: BigInt((i + 1) * 10),
    asset: "native",
  }));
}

describe("splitPayoutBatchByContractLimit", () => {
  describe("successful case", () => {
    it("splits an oversized batch into contract-sized chunks", () => {
      const entries = makeEntries(CONTRACT_MAX_PAYOUT_BATCH_SIZE * 2 + 1);
      const result = splitPayoutBatchByContractLimit(entries);

      expect(result.errors).toEqual([]);
      expect(result.wasSplit).toBe(true);
      expect(result.totalEntries).toBe(CONTRACT_MAX_PAYOUT_BATCH_SIZE * 2 + 1);
      expect(result.maxBatchSize).toBe(CONTRACT_MAX_PAYOUT_BATCH_SIZE);
      expect(result.chunks).toHaveLength(3);
      expect(result.chunks[0]).toHaveLength(CONTRACT_MAX_PAYOUT_BATCH_SIZE);
      expect(result.chunks[1]).toHaveLength(CONTRACT_MAX_PAYOUT_BATCH_SIZE);
      expect(result.chunks[2]).toHaveLength(1);
    });

    it("preserves entry order across chunks", () => {
      const entries = makeEntries(CONTRACT_MAX_PAYOUT_BATCH_SIZE + 3);
      const result = splitPayoutBatchByContractLimit(entries);

      const flattened = result.chunks.flat();
      expect(flattened.map((e) => e.recipient)).toEqual(entries.map((e) => e.recipient));
    });

    it("honours a custom maxBatchSize override", () => {
      const result = splitPayoutBatchByContractLimit(makeEntries(5), { maxBatchSize: 2 });

      expect(result.wasSplit).toBe(true);
      expect(result.maxBatchSize).toBe(2);
      expect(result.chunks).toHaveLength(3);
      expect(result.chunks.map((c) => c.length)).toEqual([2, 2, 1]);
    });
  });

  describe("rejected case", () => {
    it("rejects a non-positive maxBatchSize", () => {
      expect(() => splitPayoutBatchByContractLimit(makeEntries(3), { maxBatchSize: 0 })).toThrow(
        ContractBatchLimitError
      );
      expect(() => splitPayoutBatchByContractLimit(makeEntries(3), { maxBatchSize: -1 })).toThrow(
        /positive integer/
      );
    });

    it("rejects a non-integer maxBatchSize", () => {
      expect(() => splitPayoutBatchByContractLimit(makeEntries(3), { maxBatchSize: 1.5 })).toThrow(
        ContractBatchLimitError
      );
      expect(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        splitPayoutBatchByContractLimit(makeEntries(3), { maxBatchSize: "20" as any })
      ).toThrow(ContractBatchLimitError);
    });

    it("returns a privacy-safe error for an empty batch without throwing", () => {
      const result = splitPayoutBatchByContractLimit([]);

      expect(result.chunks).toEqual([]);
      expect(result.wasSplit).toBe(false);
      expect(result.errors).toEqual([
        {
          code: "EMPTY_BATCH",
          message: "Batch must contain at least one payment entry",
          field: "entries",
        },
      ]);
    });

    it("returns validation errors for invalid entries without splitting", () => {
      const result = splitPayoutBatchByContractLimit([
        { recipient: "", amount: 100n, asset: "native" },
      ]);

      expect(result.chunks).toEqual([]);
      expect(result.wasSplit).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("never leaks amounts or recipients in error messages", () => {
      const result = splitPayoutBatchByContractLimit([
        { recipient: "GSECRETRECIPIENT", amount: 0n, asset: "native" },
      ]);

      for (const err of result.errors) {
        expect(err.message).not.toMatch(/GSECRETRECIPIENT/);
        expect(err.message).not.toMatch(/999/);
      }
    });
  });

  describe("boundary case", () => {
    it("does not split a batch exactly at the contract limit", () => {
      const result = splitPayoutBatchByContractLimit(makeEntries(CONTRACT_MAX_PAYOUT_BATCH_SIZE));

      expect(result.wasSplit).toBe(false);
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0]).toHaveLength(CONTRACT_MAX_PAYOUT_BATCH_SIZE);
    });

    it("splits a batch one entry over the contract limit", () => {
      const result = splitPayoutBatchByContractLimit(
        makeEntries(CONTRACT_MAX_PAYOUT_BATCH_SIZE + 1)
      );

      expect(result.wasSplit).toBe(true);
      expect(result.chunks).toHaveLength(2);
      expect(result.chunks[0]).toHaveLength(CONTRACT_MAX_PAYOUT_BATCH_SIZE);
      expect(result.chunks[1]).toHaveLength(1);
    });

    it("keeps a single-entry batch as one chunk", () => {
      const result = splitPayoutBatchByContractLimit(makeEntries(1));

      expect(result.wasSplit).toBe(false);
      expect(result.chunks).toHaveLength(1);
    });
  });
});

describe("exceedsContractBatchLimit", () => {
  it("reports oversize and in-limit counts", () => {
    expect(exceedsContractBatchLimit(CONTRACT_MAX_PAYOUT_BATCH_SIZE + 1)).toBe(true);
    expect(exceedsContractBatchLimit(CONTRACT_MAX_PAYOUT_BATCH_SIZE)).toBe(false);
    expect(exceedsContractBatchLimit(3, 2)).toBe(true);
    expect(exceedsContractBatchLimit(2, 2)).toBe(false);
  });
});
