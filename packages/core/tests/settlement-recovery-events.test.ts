import { xdr, nativeToScVal, Address, StrKey, Keypair } from "@stellar/stellar-sdk";
import type { RawContractEvent } from "../src/event-parser";
import {
  INTERRUPTED_SETTLEMENT_RECOVERY_EVENT_NAME,
  parseInterruptedSettlementRecoveryEvent,
  parseInterruptedSettlementRecoveryEvents,
} from "../src/events/settlementRecovery";
import { EventDecodingError } from "../src/events/types";

const TEST_CONTRACT_ID = StrKey.encodeContract(Buffer.alloc(32, 1));
const TEST_EMPLOYER = Keypair.random().publicKey();

function makeEventScValMap(entries: Record<string, xdr.ScVal>): xdr.ScVal {
  return xdr.ScVal.scvMap(
    Object.entries(entries).map(
      ([key, val]) =>
        new xdr.ScMapEntry({
          key: nativeToScVal(key, { type: "symbol" }),
          val,
        })
    )
  );
}

function addressScVal(addr: string): xdr.ScVal {
  return new Address(addr).toScVal();
}

function i128ScVal(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "i128" });
}

function stringScVal(value: string): xdr.ScVal {
  return nativeToScVal(value, { type: "string" });
}

function symbolScVal(name: string): xdr.ScVal {
  return nativeToScVal(name, { type: "symbol" });
}

function makeRecoveryEvent(
  dataOverrides: Record<string, xdr.ScVal> = {},
  topicOverrides: xdr.ScVal[] = []
): RawContractEvent {
  return {
    topics: [
      symbolScVal(INTERRUPTED_SETTLEMENT_RECOVERY_EVENT_NAME),
      addressScVal(TEST_EMPLOYER),
      ...topicOverrides,
    ],
    data: makeEventScValMap({
      settlement_id: stringScVal("stl_abc123"),
      payroll_id: stringScVal("pr_456"),
      interruption_reason: stringScVal("timeout"),
      recovery_status: stringScVal("pending"),
      recoverable_amount: i128ScVal(5000n),
      asset: stringScVal("native"),
      ...dataOverrides,
    }),
    contractId: TEST_CONTRACT_ID,
    ledger: 1001,
    ledgerClosedAt: "2026-01-15T10:00:00Z",
  };
}

describe("parseInterruptedSettlementRecoveryEvent", () => {
  describe("successful case", () => {
    it("decodes a complete interrupted settlement recovery event", () => {
      const event = parseInterruptedSettlementRecoveryEvent(makeRecoveryEvent());

      expect(event.type).toBe(INTERRUPTED_SETTLEMENT_RECOVERY_EVENT_NAME);
      expect(event.settlementId).toBe("stl_abc123");
      expect(event.payrollId).toBe("pr_456");
      expect(event.employer).toBe(TEST_EMPLOYER);
      expect(event.interruptionReason).toBe("timeout");
      expect(event.recoveryStatus).toBe("pending");
      expect(event.recoverableAmount).toBe(5000n);
      expect(event.asset).toBe("native");
      expect(event.contractId).toBe(TEST_CONTRACT_ID);
      expect(event.ledger).toBe(1001);
      expect(event.timestamp).toBe("2026-01-15T10:00:00Z");
    });

    it("decodes each interruption reason and recovery status", () => {
      for (const reason of [
        "timeout",
        "contract_paused",
        "insufficient_fee",
        "network_failure",
        "proof_verification_failed",
      ]) {
        const event = parseInterruptedSettlementRecoveryEvent(
          makeRecoveryEvent({ interruption_reason: stringScVal(reason) })
        );
        expect(event.interruptionReason).toBe(reason);
      }

      for (const status of ["pending", "initiated", "completed", "failed"] as const) {
        const event = parseInterruptedSettlementRecoveryEvent(
          makeRecoveryEvent({ recovery_status: stringScVal(status) })
        );
        expect(event.recoveryStatus).toBe(status);
      }
    });

    it("treats a missing asset as undefined rather than an empty string", () => {
      const raw = makeRecoveryEvent({ asset: stringScVal("") });
      const event = parseInterruptedSettlementRecoveryEvent(raw);

      expect(event.asset).toBeUndefined();
    });
  });

  describe("rejected case", () => {
    it("rejects events with no topics", () => {
      const raw = makeRecoveryEvent();
      raw.topics = [];

      expect(() => parseInterruptedSettlementRecoveryEvent(raw)).toThrow(EventDecodingError);
    });

    it("rejects a different event name", () => {
      const raw = makeRecoveryEvent();
      raw.topics = [symbolScVal("some_other_event"), addressScVal(TEST_EMPLOYER)];

      expect(() => parseInterruptedSettlementRecoveryEvent(raw)).toThrow(
        /Expected "interrupted_settlement_recovery"/
      );
    });

    it("rejects a missing employer topic", () => {
      const raw = makeRecoveryEvent();
      raw.topics = [symbolScVal(INTERRUPTED_SETTLEMENT_RECOVERY_EVENT_NAME)];

      expect(() => parseInterruptedSettlementRecoveryEvent(raw)).toThrow(
        /Missing or invalid employer/
      );
    });

    it("rejects a missing settlement_id", () => {
      const raw = makeRecoveryEvent({ settlement_id: stringScVal("") });

      expect(() => parseInterruptedSettlementRecoveryEvent(raw)).toThrow(/Missing settlement_id/);
    });

    it("rejects a missing payroll_id", () => {
      const raw = makeRecoveryEvent({ payroll_id: stringScVal("") });

      expect(() => parseInterruptedSettlementRecoveryEvent(raw)).toThrow(/Missing payroll_id/);
    });

    it("rejects a missing interruption_reason", () => {
      const raw = makeRecoveryEvent({ interruption_reason: stringScVal("") });

      expect(() => parseInterruptedSettlementRecoveryEvent(raw)).toThrow(
        /Missing interruption_reason/
      );
    });

    it("rejects an invalid recovery_status", () => {
      const raw = makeRecoveryEvent({ recovery_status: stringScVal("exploded") });

      expect(() => parseInterruptedSettlementRecoveryEvent(raw)).toThrow(/Invalid recovery_status/);
    });

    it("never leaks settlement identifiers in error messages beyond the field name", () => {
      const raw = makeRecoveryEvent({ settlement_id: stringScVal("") });

      try {
        parseInterruptedSettlementRecoveryEvent(raw);
        throw new Error("expected parse to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(EventDecodingError);
        expect((err as Error).message).not.toMatch(/stl_abc123|pr_456|5000/);
      }
    });
  });

  describe("boundary case", () => {
    it("accepts a zero recoverable amount", () => {
      const event = parseInterruptedSettlementRecoveryEvent(
        makeRecoveryEvent({ recoverable_amount: i128ScVal(0n) })
      );

      expect(event.recoverableAmount).toBe(0n);
    });

    it("rejects a negative recoverable amount", () => {
      const raw = makeRecoveryEvent({ recoverable_amount: i128ScVal(-1n) });

      expect(() => parseInterruptedSettlementRecoveryEvent(raw)).toThrow(/must not be negative/);
    });

    it("accepts an unknown (novel) interruption reason verbatim", () => {
      const event = parseInterruptedSettlementRecoveryEvent(
        makeRecoveryEvent({ interruption_reason: stringScVal("governance_freeze") })
      );

      expect(event.interruptionReason).toBe("governance_freeze");
    });
  });
});

describe("parseInterruptedSettlementRecoveryEvents", () => {
  it("collects only recovery events and skips noise", () => {
    const noise: RawContractEvent = {
      topics: [symbolScVal("some_other_event"), addressScVal(TEST_EMPLOYER)],
      data: makeEventScValMap({}),
    };

    const events = parseInterruptedSettlementRecoveryEvents([
      noise,
      makeRecoveryEvent(),
      noise,
      makeRecoveryEvent({ settlement_id: stringScVal("stl_def456") }),
    ]);

    expect(events).toHaveLength(2);
    expect(events[0].settlementId).toBe("stl_abc123");
    expect(events[1].settlementId).toBe("stl_def456");
  });

  it("returns an empty array for an empty input", () => {
    expect(parseInterruptedSettlementRecoveryEvents([])).toEqual([]);
  });

  it("still throws for a malformed recovery event in the batch", () => {
    const bad = makeRecoveryEvent({ payroll_id: stringScVal("") });

    expect(() => parseInterruptedSettlementRecoveryEvents([bad])).toThrow(EventDecodingError);
  });
});
