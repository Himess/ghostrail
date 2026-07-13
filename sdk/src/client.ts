// GhostRail SDK — client side. `payConfidential` turns a 402 challenge into a confidential on-chain
// payment and returns an opaque receiptId the caller re-presents in the `X-Payment-Receipt` header.

import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { cusdcAbi, ledgerAbi, usdcAbi } from "./abi.js";

/** The JSON body a GhostRail 402 response carries. */
export interface PaymentRequirements {
  scheme: string; // "ghostrail-confidential"
  ledger: Address;
  service: Address;
  amount: string; // stringified uint256 (6-dec USDC)
  ref: Hex; // bytes32
}

/** Token wiring the agent needs to top up its confidential balance (from deployments/*.json). */
export interface GhostRailConfig {
  cusdc: Address;
  usdc: Address;
}

async function send(wallet: WalletClient, pub: PublicClient, params: any): Promise<void> {
  const hash = await wallet.writeContract({ ...params, account: wallet.account!, chain: wallet.chain });
  await pub.waitForTransactionReceipt({ hash });
}

/**
 * Ensure the agent's confidential ledger balance covers `amount` (shielding + funding on demand), then
 * execute one confidential `pay`. Returns the receiptId. Amounts, counterparty and ref never appear in
 * any event — only this opaque id, which the service verifies via its own gated view.
 */
export async function payConfidential(
  requirements: PaymentRequirements,
  config: GhostRailConfig,
  walletClient: WalletClient,
  publicClient: PublicClient,
): Promise<Hex> {
  const amount = BigInt(requirements.amount);
  const agent = walletClient.account!.address;

  const ledgerBal = (await publicClient.readContract({
    address: requirements.ledger,
    abi: ledgerAbi,
    functionName: "balanceOf",
    args: [agent],
    account: agent,
  })) as bigint;

  if (ledgerBal < amount) {
    const need = amount - ledgerBal;

    // Make sure we hold enough cUSDC to fund the shortfall; shield fresh USDC if not.
    const cbal = (await publicClient.readContract({
      address: config.cusdc,
      abi: cusdcAbi,
      functionName: "confidentialBalanceOf",
      args: [agent],
      account: agent,
    })) as bigint;

    if (cbal < need) {
      const shortfall = need - cbal;
      const usdcBal = (await publicClient.readContract({
        address: config.usdc,
        abi: usdcAbi,
        functionName: "balanceOf",
        args: [agent],
      })) as bigint;
      if (usdcBal < shortfall) {
        // LOCAL demo only: MockUSDC has a public mint. On Arc testnet the agent funds from the faucet.
        await send(walletClient, publicClient, {
          address: config.usdc,
          abi: usdcAbi,
          functionName: "mint",
          args: [agent, shortfall - usdcBal],
        });
      }
      await send(walletClient, publicClient, {
        address: config.usdc,
        abi: usdcAbi,
        functionName: "approve",
        args: [config.cusdc, shortfall],
      });
      await send(walletClient, publicClient, {
        address: config.cusdc,
        abi: cusdcAbi,
        functionName: "shield",
        args: [shortfall],
      });
    }

    // Authorize the ledger as an operator, then fund the confidential account.
    const until = BigInt(Math.floor(Date.now() / 1000) + 86400);
    await send(walletClient, publicClient, {
      address: config.cusdc,
      abi: cusdcAbi,
      functionName: "setOperator",
      args: [requirements.ledger, until],
    });
    await send(walletClient, publicClient, {
      address: requirements.ledger,
      abi: ledgerAbi,
      functionName: "fund",
      args: [need],
    });
  }

  // Simulate to capture the receiptId return value, then broadcast the identical call.
  const { result, request } = await publicClient.simulateContract({
    address: requirements.ledger,
    abi: ledgerAbi,
    functionName: "pay",
    args: [requirements.service, amount, requirements.ref],
    account: walletClient.account!,
  });
  const hash = await walletClient.writeContract(request as any);
  await publicClient.waitForTransactionReceipt({ hash });
  return result as Hex;
}
