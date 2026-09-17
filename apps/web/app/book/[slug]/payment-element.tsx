"use client";

import React, { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Lock, ShieldCheck, AlertCircle, Loader2 } from "../../../components/icons";
import styles from "./booking.module.css";

export interface PaymentConversionInfo {
  originalAmountCents?: number;
  originalCurrency?: string;
  exchangeRate?: number;
  usdCents?: number;
}

interface PaymentFormProps {
  onSuccess: () => void;
  onError: (msg: string) => void;
  payableNowCents: number;
  currency: string;
  conversion?: PaymentConversionInfo;
}

function CheckoutForm({ onSuccess, onError, payableNowCents, currency, conversion }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
      });

      if (error) {
        const msg = error.message || "An unexpected error occurred while processing your payment.";
        setErrorMessage(msg);
        onError(msg);
        setIsProcessing(false);
      } else if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")) {
        onSuccess();
      } else {
        setIsProcessing(false);
      }
    } catch (err: any) {
      const msg = err.message || "Payment network error. Please try again.";
      setErrorMessage(msg);
      onError(msg);
      setIsProcessing(false);
    }
  };

  const isConverted = Boolean(
    conversion?.originalCurrency &&
    conversion.originalCurrency !== (currency || "USD").toUpperCase() &&
    conversion.originalAmountCents
  );

  const formattedAmount = (() => {
    const code = (currency || "USD").toUpperCase();
    const amount = (payableNowCents || 0) / 100;
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(amount);
    } catch {
      return `${code} ${amount.toFixed(2)}`;
    }
  })();

  const formattedOriginalAmount = (() => {
    if (!conversion?.originalCurrency || !conversion.originalAmountCents) return "";
    const code = conversion.originalCurrency.toUpperCase();
    const amount = conversion.originalAmountCents / 100;
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(amount);
    } catch {
      return `${code} ${amount.toFixed(2)}`;
    }
  })();

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: "1rem" }}>
      {isConverted && (
        <div
          style={{
            background: "rgba(56, 189, 248, 0.08)",
            border: "1px solid rgba(56, 189, 248, 0.25)",
            borderRadius: "8px",
            padding: "0.75rem 1rem",
            fontSize: "0.83rem",
            color: "#7dd3fc",
            marginBottom: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600 }}>Deposit Amount:</span>
            <strong style={{ color: "#ffffff" }}>{formattedOriginalAmount}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.78rem", color: "#94a3b8" }}>
            <span>Stripe Checkout Amount:</span>
            <span style={{ fontWeight: 600, color: "#38bdf8" }}>{formattedAmount}</span>
          </div>
          {conversion?.exchangeRate && (
            <span style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "0.2rem" }}>
              Live rate: 1 USD ≈ {(1 / conversion.exchangeRate).toFixed(2)} {conversion.originalCurrency}
            </span>
          )}
        </div>
      )}

      <div style={{ marginBottom: "1.25rem" }}>
        <PaymentElement
          options={{
            layout: "tabs",
          }}
        />
      </div>

      {errorMessage && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "rgba(239, 68, 68, 0.12)",
            border: "1px solid #ef4444",
            borderRadius: "8px",
            padding: "0.75rem 1rem",
            color: "#f87171",
            fontSize: "0.85rem",
            marginBottom: "1rem",
          }}
        >
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || !elements || isProcessing}
        className={styles.primaryButton}
      >
        {isProcessing ? (
          <>
            <Loader2 className="animate-spin" size={18} />
            <span>Securing Reservation & Payment...</span>
          </>
        ) : (
          <>
            <Lock size={16} />
            <span>Pay {formattedAmount} {isConverted ? `(${formattedOriginalAmount})` : ""} & Confirm</span>
          </>
        )}
      </button>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem",
          marginTop: "1rem",
          fontSize: "0.76rem",
          color: "#66758f",
        }}
      >
        <ShieldCheck size={14} color="#34d399" />
        <span>256-bit encrypted direct merchant payment powered by Stripe</span>
      </div>
    </form>
  );
}

interface StripePaymentSectionProps {
  clientSecret: string;
  publishableKey: string;
  connectedAccountId?: string;
  holdId?: string;
  guestToken?: string;
  onSuccess: () => void;
  onError: (msg: string) => void;
  payableNowCents: number;
  currency: string;
  conversion?: PaymentConversionInfo;
}

export function StripePaymentSection({
  clientSecret,
  publishableKey,
  connectedAccountId,
  holdId,
  guestToken,
  onSuccess,
  onError,
  payableNowCents,
  currency,
  conversion,
}: StripePaymentSectionProps) {

  const activePublishableKey = publishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";

  const stripePromise = React.useMemo(() => {
    if (!activePublishableKey || activePublishableKey.includes("placeholder")) return null;
    return loadStripe(
      activePublishableKey,
      connectedAccountId ? { stripeAccount: connectedAccountId } : undefined
    );
  }, [activePublishableKey, connectedAccountId]);

  if (!stripePromise) {
    return <div role="alert" style={{ color: "#f87171", padding: "1rem" }}>Online payments are not configured for this organization.</div>;
  }


  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "night",
          variables: {
            colorPrimary: "#38bdf8",
            colorBackground: "#071021",
            colorText: "#eaf2ff",
            colorDanger: "#ef4444",
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            borderRadius: "8px",
          },
          rules: {
            ".Input": {
              border: "1px solid #22304b",
              backgroundColor: "#071021",
              color: "#ffffff",
              boxShadow: "none",
            },
            ".Input:focus": {
              border: "1px solid #38bdf8",
              boxShadow: "0 0 0 2px rgba(56, 189, 248, 0.25)",
            },
            ".Label": {
              color: "#a8b5ca",
              fontSize: "13px",
              fontWeight: "600",
            },
            ".Tab": {
              backgroundColor: "#0b1428",
              border: "1px solid #17243a",
              color: "#a8b5ca",
            },
            ".Tab--selected": {
              backgroundColor: "#071021",
              borderColor: "#38bdf8",
              color: "#38bdf8",
            },
          },
        },
      }}
    >
      <CheckoutForm
        onSuccess={onSuccess}
        onError={onError}
        payableNowCents={payableNowCents}
        currency={currency}
        conversion={conversion}
      />
    </Elements>
  );
}
