import type { Metadata } from "next";
import { DisputesClient } from "@/components/disputes/DisputesClient";

export const metadata: Metadata = {
  title: "AI Arbitration & Dispute Resolution — Trellis",
  description:
    "2-of-3 AI Arbiter consensus voting, ERC-8004 ValidationRegistry zkML/TEE proof inspection, and quantum-safe escrow dispute settlement on QDay Aevum.",
};

export default function DisputesPage() {
  return <DisputesClient />;
}
