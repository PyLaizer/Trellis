import type { Metadata } from "next";
import { ProjectWorkspaceClient } from "@/components/projects/ProjectWorkspaceClient";

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: ProjectDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Project #TRL-${id} Workspace | Trellis`,
    description:
      "Quantum-safe milestone escrow workspace with ERC-8004 identity, deliverable hash verification, and AI arbiter dispute resolution on QDay Aevum.",
  };
}

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
  const { id } = await params;
  return <ProjectWorkspaceClient projectIdParam={id} />;
}
