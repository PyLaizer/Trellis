import type { Metadata } from "next";
import { ProjectsClient } from "@/components/projects/ProjectsClient";

export const metadata: Metadata = {
  title: "Escrow Projects Marketplace — Trellis",
  description:
    "Browse 100% upfront-funded tUSD8 milestone escrow projects, accept open or direct-hire contracts, or deploy new multi-milestone vaults on QDay Aevum.",
};

export default function ProjectsPage() {
  return <ProjectsClient />;
}
