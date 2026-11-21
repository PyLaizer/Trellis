import { defineChain } from "viem";
import { AEVUM_CHAIN_ID, AEVUM_EXPLORER_URL } from "@/lib/contracts/addresses";

const DEFAULT_AEVUM_RPC_URL = "https://rpc-test.qday.info";

export const AEVUM_RPC_URL =
  process.env.NEXT_PUBLIC_AEVUM_RPC_URL || DEFAULT_AEVUM_RPC_URL;

export const aevumTestnet = defineChain({
  id: AEVUM_CHAIN_ID,
  name: "QDay Aevum Testnet",
  nativeCurrency: {
    name: "Test QDAY",
    symbol: "tQDAY",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [AEVUM_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: "Aevum Explorer",
      url: AEVUM_EXPLORER_URL,
    },
  },
  testnet: true,
});
