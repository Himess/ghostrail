// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockLendingVenue} from "../src/mocks/MockLendingVenue.sol";
import {ConfidentialToken} from "../src/ConfidentialToken.sol";
import {ConfidentialPaymentLedger} from "../src/ConfidentialPaymentLedger.sol";
import {ConfidentialVaultRouter} from "../src/ConfidentialVaultRouter.sol";

/// @notice Local (anvil) deploy for the TypeScript SDK / x402 demo. Deploys the full stack over a MockUSDC,
///         pre-mints test USDC to the agent, and writes deployments/local.json for the SDK to read.
///         Uses anvil's well-known keys by default. Run:
///           anvil            (terminal 1)
///           forge script script/DeployLocal.s.sol --rpc-url http://localhost:8545 --broadcast
contract DeployLocal is Script {
    // Well-known anvil accounts (public test keys — LOCAL ONLY).
    uint256 constant KEY0 = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80; // deployer
    address constant AGENT = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8; // key1
    address constant SERVICE = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC; // key2

    function run() external {
        uint256 pk = vm.envOr("DEPLOYER_PRIVATE_KEY", KEY0);
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        MockUSDC usdc = new MockUSDC();
        ConfidentialToken cusdc = new ConfidentialToken(IERC20(address(usdc)));
        MockLendingVenue venue = new MockLendingVenue(IERC20(address(usdc)));
        ConfidentialPaymentLedger ledger = new ConfidentialPaymentLedger(cusdc, 3600);
        // batchWindow 0 → the vault batch can execute immediately in a local session.
        ConfidentialVaultRouter router = new ConfidentialVaultRouter(cusdc, IERC20(address(usdc)), venue, deployer, 0);
        usdc.mint(AGENT, 1_000e6); // seed the demo agent with test USDC
        vm.stopBroadcast();

        console2.log("usdc   :", address(usdc));
        console2.log("cUSDC  :", address(cusdc));
        console2.log("ledger :", address(ledger));
        console2.log("router :", address(router));

        string memory o = "local";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "usdc", address(usdc));
        vm.serializeAddress(o, "cUSDC", address(cusdc));
        vm.serializeAddress(o, "venue", address(venue));
        vm.serializeAddress(o, "ledger", address(ledger));
        vm.serializeAddress(o, "vaultRouter", address(router));
        vm.serializeAddress(o, "auditor", deployer);
        vm.serializeAddress(o, "agent", AGENT);
        string memory out = vm.serializeAddress(o, "service", SERVICE);
        vm.writeJson(out, "./deployments/local.json");
        console2.log("wrote deployments/local.json");
    }
}
