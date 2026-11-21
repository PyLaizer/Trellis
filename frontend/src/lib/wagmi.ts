import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { AEVUM_RPC_URL, aevumTestnet } from "@/lib/chains";

export const wagmiConfig = getDefaultConfig({
  appName: "Trellis Protocol",
  projectId:
    process.env.NEXT_PUBLIC_WC_PROJECT_ID || "trellis-qday-aevum-demo",
  chains: [aevumTestnet],
  transports: {
    [aevumTestnet.id]: http(AEVUM_RPC_URL),
  },
  ssr: true,
});
