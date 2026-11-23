import type { Metadata } from "next";
import { IdentityClient } from "@/components/identity/IdentityClient";

export const metadata: Metadata = {
  title: "ERC-8004 Identity & Passports — Trellis",
  description:
    "Mint and manage ERC-8004 Client, Freelancer, and AI Arbiter identity NFTs, Agent Registration Cards, and Active AI Arbiter Pool status on QDay Aevum.",
};

export default function IdentityPage() {
  return <IdentityClient />;
}
