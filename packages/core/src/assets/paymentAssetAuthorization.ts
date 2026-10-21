/**
 * Payment asset authorization preflight check.
 *
 * Verifies that a payment asset is authorized for payroll use before a
 * payment or batch is submitted. An asset is authorized when it is:
 *
 * 1. payment-compatible (`"native"` or a Soroban token contract ID),
 * 2. registered in the {@link AssetRegistry}, and
 * 3. present on the employer's allowlist, when one is supplied.
 *
 * Results are structured so validation pipelines and preflight surfaces can
 * surface the reason without throwing. Use
 * {@link assertPaymentAssetAuthorized} when a thrown error is more convenient.
 *
 * ## Privacy & Security Guarantees
 * - Messages only reference asset identifiers, never salaries or recipients.
 *
 * @module
 */

import { ValidationError } from "../core/errors";
import { AssetRegistry, AssetRegistryClass } from "./AssetRegistry";
import {
  PAYMENT_ASSET_COMPATIBILITY_MESSAGE,
  isPaymentAssetCompatible,
} from "./paymentAssetCompatibility";

/** Stable error code used when an unauthorized asset blocks a payment. */
export const PAYMENT_ASSET_UNAUTHORIZED_ERROR_CODE = "PAYMENT_ASSET_UNAUTHORIZED";

/**
 * Machine-readable outcome of a payment asset authorization check.
 *
 * - `"ok"` — the asset is compatible, registered, and allowlisted (when an
 *   allowlist is supplied).
 * - `"not_payment_compatible"` — the identifier cannot name a payment asset.
 * - `"unregistered"` — the identifier is valid but has no registry metadata.
 * - `"not_allowlisted"` — the asset is registered but not on the allowlist.
 */
export type PaymentAssetAuthorizationCode =
  "ok" | "not_payment_compatible" | "unregistered" | "not_allowlisted";

/** Options accepted by {@link checkPaymentAssetAuthorization}. */
export interface PaymentAssetAuthorizationOptions {
  /**
   * Registry to resolve asset metadata from. Defaults to the shared
   * `AssetRegistry` singleton.
   */
  registry?: AssetRegistryClass;

  /**
   * Employer allowlist of permitted asset IDs. When omitted, any registered
   * payment-compatible asset is considered authorized.
   */
  allowedAssetIds?: readonly string[];
}

/** Result of {@link checkPaymentAssetAuthorization}. */
export interface PaymentAssetAuthorizationResult {
  /** The canonical asset ID that was checked, when one could be resolved. */
  assetId: string;

  /** Whether the asset may be used for a new payment. */
  authorized: boolean;

  /** Machine-readable outcome code. */
  code: PaymentAssetAuthorizationCode;

  /** Actionable message for failures. Absent when `authorized` is true. */
  message?: string;
}

/**
 * Check a payment asset identifier for authorization.
 *
 * Never throws for invalid input; returns a structured result so preflight
 * pipelines and UIs can surface the reason.
 *
 * @param asset - Payment asset identifier (`"native"` or a Soroban contract ID).
 * @param options - Registry and allowlist overrides.
 *
 * @example
 * ```ts
 * const result = checkPaymentAssetAuthorization(asset, { allowedAssetIds });
 * if (!result.authorized) {
 *   console.warn(result.message);
 * }
 * ```
 */
export function checkPaymentAssetAuthorization(
  asset: unknown,
  options: PaymentAssetAuthorizationOptions = {}
): PaymentAssetAuthorizationResult {
  const registry = options.registry ?? AssetRegistry;

  if (!isPaymentAssetCompatible(asset)) {
    return {
      assetId: typeof asset === "string" ? asset : String(asset),
      authorized: false,
      code: "not_payment_compatible",
      message: PAYMENT_ASSET_COMPATIBILITY_MESSAGE,
    };
  }

  const assetId = asset as string;
  const metadata = registry.get(assetId);

  if (!metadata) {
    return {
      assetId,
      authorized: false,
      code: "unregistered",
      message:
        `Asset "${assetId}" is not registered. Register its metadata with ` +
        `AssetRegistry.register({ id, symbol, label, decimals }) before creating payments.`,
    };
  }

  const allowedAssetIds = options.allowedAssetIds;
  if (allowedAssetIds && !allowedAssetIds.includes(metadata.id)) {
    return {
      assetId,
      authorized: false,
      code: "not_allowlisted",
      message:
        `Asset "${assetId}" is not authorized for this payroll. ` +
        "Add it to the employer's allowed payment assets before creating payments.",
    };
  }

  return { assetId, authorized: true, code: "ok" };
}

/**
 * Throw a {@link ValidationError} when the payment asset is not authorized.
 * Returns the resolved result when the asset is authorized.
 *
 * @throws ValidationError with `PAYMENT_ASSET_UNAUTHORIZED_ERROR_CODE`.
 */
export function assertPaymentAssetAuthorized(
  asset: unknown,
  options: PaymentAssetAuthorizationOptions = {}
): PaymentAssetAuthorizationResult {
  const result = checkPaymentAssetAuthorization(asset, options);
  if (!result.authorized) {
    throw new ValidationError(
      result.message ?? "Payment asset is not authorized.",
      "asset",
      PAYMENT_ASSET_UNAUTHORIZED_ERROR_CODE,
      { authorizationCode: result.code }
    );
  }
  return result;
}
