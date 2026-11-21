"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";
import { formatUnits } from "viem";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { TrellisLogo } from "@/components/TrellisLogo";
import { aevumTestnet } from "@/lib/chains";
import { ERC20_ABI } from "@/lib/contracts/abis";
import { CONTRACT_ADDRESSES } from "@/lib/contracts/addresses";
import { formatTUSD8 } from "@/lib/format";

interface NavItem {
  label: string;
  href: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Identity", href: "/identity" },
  { label: "Projects", href: "/projects" },
  { label: "Disputes", href: "/disputes" },
  { label: "Reputation", href: "/reputation" },
];

export function Navbar() {
  const pathname = usePathname();
  const { address, isConnected, chainId } = useAccount();

  const isOnAevum = isConnected && chainId === aevumTestnet.id;

  const { data: tusd8Balance } = useReadContract({
    address: CONTRACT_ADDRESSES.tUSD8,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: aevumTestnet.id,
    query: {
      enabled: Boolean(isOnAevum && address),
      refetchInterval: 20_000,
    },
  });

  const { data: nativeBalance } = useBalance({
    address,
    chainId: aevumTestnet.id,
    query: {
      enabled: Boolean(isOnAevum && address),
      refetchInterval: 20_000,
    },
  });

  const formattedTusd8 =
    typeof tusd8Balance === "bigint" ? formatTUSD8(tusd8Balance, false) : "0.00";

  const formattedNative = nativeBalance
    ? Number(formatUnits(nativeBalance.value, nativeBalance.decimals)).toFixed(3)
    : "0.000";

  return (
    <header className="sticky top-0 z-50 h-[68px] w-full border-b border-hairline bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Left: Brand + Network Pill */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="group flex items-center gap-2.5 focus:outline-none"
          >
            <TrellisLogo
              size={32}
              className="transition-transform duration-200 group-hover:scale-105"
            />
            <span className="font-display text-lg font-bold tracking-tight text-slate-50">
              Trellis
            </span>
          </Link>

          <div className="hidden items-center gap-1.5 rounded-full border border-hairline bg-surface px-2.5 py-1 font-mono text-[11px] font-medium tracking-wider text-ice-400 sm:inline-flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ice-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-ice-500" />
            </span>
            AEVUM TESTNET
          </div>
        </div>

        {/* Center: Primary Navigation with Framer Motion layoutId pill */}
        <nav
          aria-label="Primary Navigation"
          className="hidden items-center gap-1 rounded-xl border border-hairline/70 bg-surface/70 p-1 md:flex"
        >
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-copper-400"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="navbar-active-pill"
                    transition={{
                      type: "spring",
                      stiffness: 420,
                      damping: 32,
                    }}
                    className="absolute inset-0 -z-10 rounded-lg border border-copper/35 bg-copper/15 shadow-[0_0_16px_rgba(234,122,61,0.14)]"
                  />
                )}
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: Live Balances + RainbowKit ConnectButton */}
        <div className="flex items-center gap-2.5">
          {isOnAevum && (
            <div className="hidden items-center gap-2 rounded-xl border border-hairline bg-surface px-3 py-1.5 font-mono text-xs tabular-nums xl:flex">
              <span className="text-copper-400">{formattedTusd8} tUSD8</span>
              <span className="h-3 w-px bg-hairline" aria-hidden="true" />
              <span className="text-ice-400">{formattedNative} tQDAY</span>
            </div>
          )}

          <ConnectButton
            chainStatus="icon"
            showBalance={false}
            accountStatus="address"
          />
        </div>
      </div>
    </header>
  );
}
