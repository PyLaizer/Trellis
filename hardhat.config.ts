import "dotenv/config";
import { defineConfig, configVariable } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";

export default defineConfig({
  plugins: [hardhatToolboxViem],
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: false,
    },
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
    },
    aevum: {
      type: "http",
      chainType: "l1",
      url: process.env.AEVUM_RPC_URL ?? "https://rpc-test.qday.info",
      chainId: 44005,
      accounts: [configVariable("PRIVATE_KEY")],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
});
