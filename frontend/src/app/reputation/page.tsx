import type { Metadata } from "next";
import { ReputationClient } from "@/components/reputation/ReputationClient";

export const metadata: Metadata = {
  title: "ERC-8004 Reputation & Proof Explorer — Trellis",
  description:
    "Explore Sybil-resistant ERC-8004 trust scores, immutable milestone feedback, and zkML / TEE validation proofs on QDay Aevum Testnet.",
};

export default function ReputationPage() {
  return <ReputationClient />;
}
