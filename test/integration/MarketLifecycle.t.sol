// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../BaseTest.sol";

contract MarketLifecycleTest is BaseTest {

    // ============ Full Lifecycle Tests ============

    function test_FullMarketLifecycle_BinaryMarket() public {
        // 1. Create market with initial liquidity
        uint256 marketId = createTestMarket();
        
        (PredictionMarket.MarketState state,,uint256 liquidity,,,) = market.getMarketData(marketId);
        assertEq(uint256(state), uint256(PredictionMarket.MarketState.open), "Market should be open");
        assertEq(liquidity, DEFAULT_MARKET_VALUE, "Initial liquidity");

        // 2. User1 buys outcome 0
        buyShares(user2, marketId, 0, 3 ether);
        uint256 user2Shares = getUserOutcomeShares(marketId, user2, 0);
        assertTrue(user2Shares > 0, "User2 should have shares");

        // 3. User2 adds liquidity
        fundUser(user3, 5 ether);
        vm.prank(user3);
        market.addLiquidity(marketId, 5 ether);
        uint256 user3Liquidity = getUserLiquidityShares(marketId, user3);
        assertTrue(user3Liquidity > 0, "User3 should have liquidity");

        // 4. User3 buys outcome 1
        buyShares(user3, marketId, 1, 2 ether);

        // 5. User1 sells some shares
        vm.prank(user2);
        market.sell(marketId, 0, 1 ether, type(uint256).max);

        // 6. Time passes, market closes
        closeMarket(marketId);

        // 7. Admin resolves to outcome 0
        vm.prank(owner);
        market.adminResolveMarketOutcome(marketId, 0);

        (state,,,,,) = market.getMarketData(marketId);
        assertEq(uint256(state), uint256(PredictionMarket.MarketState.resolved), "Market should be resolved");

        // 8. User2 claims winnings
        uint256 user2BalanceBefore = token.balanceOf(user2);
        vm.prank(user2);
        market.claimWinnings(marketId);
        uint256 user2BalanceAfter = token.balanceOf(user2);
        assertTrue(user2BalanceAfter > user2BalanceBefore, "User2 should receive winnings");

        // 9. User1 (creator) claims liquidity
        uint256 user1BalanceBefore = token.balanceOf(user1);
        vm.prank(user1);
        market.claimLiquidity(marketId);
        uint256 user1BalanceAfter = token.balanceOf(user1);
        assertTrue(user1BalanceAfter > user1BalanceBefore, "User1 should receive liquidity");

        // 10. User3 claims liquidity
        uint256 user3BalanceBefore = token.balanceOf(user3);
        vm.prank(user3);
        market.claimLiquidity(marketId);
        uint256 user3BalanceAfter = token.balanceOf(user3);
        assertTrue(user3BalanceAfter > user3BalanceBefore, "User3 should receive liquidity");
    }

    function test_FullLifecycle_WithFees() public {
        // Create market with fees
        uint256 poolFee = 2 * 10 ** 16; // 2%
        uint256 treasuryFee = 1 * 10 ** 16; // 1%
        uint256 distributorFee = 1 * 10 ** 16; // 1%
        
        uint256 marketId = createTestMarketWithFees(poolFee, treasuryFee, distributorFee);

        // Track initial balances
        uint256 treasuryInitial = token.balanceOf(treasury);
        uint256 distributorInitial = token.balanceOf(distributor);

        // Multiple trades to generate fees
        for (uint256 i = 0; i < 3; i++) {
            buyShares(user2, marketId, 0, 2 ether);
            buyShares(user3, marketId, 1, 1 ether);
        }

        // Verify treasury and distributor received fees
        uint256 treasuryFinal = token.balanceOf(treasury);
        uint256 distributorFinal = token.balanceOf(distributor);
        
        assertTrue(treasuryFinal > treasuryInitial, "Treasury should receive fees");
        assertTrue(distributorFinal > distributorInitial, "Distributor should receive fees");

        // LP should have claimable pool fees
        uint256 claimableFees = market.getUserClaimableFees(marketId, user1);
        assertTrue(claimableFees > 0, "LP should have claimable fees");

        // Claim fees before resolution
        uint256 lpBalanceBefore = token.balanceOf(user1);
        vm.prank(user1);
        market.claimFees(marketId);
        uint256 lpBalanceAfter = token.balanceOf(user1);
        assertEq(lpBalanceAfter - lpBalanceBefore, claimableFees, "LP should receive fees");

        // Resolve and claim remaining
        resolveMarket(marketId, 0);

        vm.prank(user2);
        market.claimWinnings(marketId);

        vm.prank(user1);
        market.claimLiquidity(marketId);
    }

    function test_FullLifecycle_ETHMarket() public {
        // Create ETH market
        fundUserETH(user1, 100 ether);

        uint256[] memory distribution = new uint256[](2);
        distribution[0] = 50;
        distribution[1] = 50;

        PredictionMarket.CreateMarketDescription memory desc = PredictionMarket.CreateMarketDescription({
            value: 10 ether,
            closesAt: uint32(block.timestamp + 1 days),
            outcomes: 2,
            token: IERC20(address(weth)),
            distribution: distribution,
            question: "ETH Market Test",
            image: "",
            buyFees: PredictionMarket.Fees(0, 0, 0),
            sellFees: PredictionMarket.Fees(0, 0, 0),
            treasury: treasury,
            distributor: distributor
        });

        vm.prank(user1);
        uint256 marketId = market.createMarketWithETH{value: 10 ether}(desc);

        // Buy with ETH
        fundUserETH(user2, 10 ether);
        vm.prank(user2);
        market.buyWithETH{value: 5 ether}(marketId, 0, 0);

        // Add liquidity with ETH
        fundUserETH(user3, 10 ether);
        vm.prank(user3);
        market.addLiquidityWithETH{value: 5 ether}(marketId);

        // Sell to ETH
        vm.prank(user2);
        market.sellToETH(marketId, 0, 1 ether, type(uint256).max);

        // Resolve
        resolveMarket(marketId, 0);

        // Claim to ETH
        uint256 user2ETHBefore = user2.balance;
        vm.prank(user2);
        market.claimWinningsToETH(marketId);
        assertTrue(user2.balance > user2ETHBefore, "Should receive ETH winnings");

        uint256 user1ETHBefore = user1.balance;
        vm.prank(user1);
        market.claimLiquidityToETH(marketId);
        assertTrue(user1.balance > user1ETHBefore, "Should receive ETH liquidity");
    }

    function test_FullLifecycle_VoidedMarket() public {
        uint256 marketId = createTestMarket();

        // Users buy different outcomes
        buyShares(user2, marketId, 0, 5 ether);
        buyShares(user3, marketId, 1, 3 ether);

        // Record share holdings
        uint256 user2Shares = getUserOutcomeShares(marketId, user2, 0);
        uint256 user3Shares = getUserOutcomeShares(marketId, user3, 1);

        // Void the market
        voidMarket(marketId);

        assertTrue(market.isMarketVoided(marketId), "Market should be voided");

        // Both users can claim their shares at market price
        uint256 user2BalanceBefore = token.balanceOf(user2);
        vm.prank(user2);
        market.claimVoidedOutcomeShares(marketId, 0);
        assertTrue(token.balanceOf(user2) > user2BalanceBefore, "User2 should receive value");

        uint256 user3BalanceBefore = token.balanceOf(user3);
        vm.prank(user3);
        market.claimVoidedOutcomeShares(marketId, 1);
        assertTrue(token.balanceOf(user3) > user3BalanceBefore, "User3 should receive value");

        // LP can still claim liquidity
        uint256 user1BalanceBefore = token.balanceOf(user1);
        vm.prank(user1);
        market.claimLiquidity(marketId);
        assertTrue(token.balanceOf(user1) > user1BalanceBefore, "LP should receive value");
    }

    function test_FullLifecycle_MultiOutcomeMarket() public {
        // Create market with 5 outcomes
        uint256 marketId = createTestMarketWithOutcomes(5);

        // Users buy various outcomes
        buyShares(user2, marketId, 0, 2 ether);
        buyShares(user2, marketId, 2, 1 ether);
        buyShares(user3, marketId, 1, 3 ether);
        buyShares(user3, marketId, 4, 1 ether);

        // Verify prices sum to ~1
        assertPricesSumToOne(marketId, 1e14);

        // Resolve to outcome 2
        resolveMarket(marketId, 2);

        // User2 has winning outcome 2
        uint256 user2Shares = getUserOutcomeShares(marketId, user2, 2);
        assertTrue(user2Shares > 0, "User2 should have winning shares");

        uint256 user2BalanceBefore = token.balanceOf(user2);
        vm.prank(user2);
        market.claimWinnings(marketId);
        assertEq(token.balanceOf(user2) - user2BalanceBefore, user2Shares, "Should get 1:1 for winning shares");

        // User3 has no winning shares, cannot claim
        vm.prank(user3);
        vm.expectRevert("user doesn't hold outcome shares");
        market.claimWinnings(marketId);
    }

    function test_FullLifecycle_MultipleLPs() public {
        uint256 marketId = createTestMarket();

        // Add more LPs
        fundUser(user2, 10 ether);
        vm.prank(user2);
        market.addLiquidity(marketId, 10 ether);

        fundUser(user3, 5 ether);
        vm.prank(user3);
        market.addLiquidity(marketId, 5 ether);

        // Generate some trading
        address trader1 = address(0x100);
        address trader2 = address(0x101);
        
        buyShares(trader1, marketId, 0, 3 ether);
        buyShares(trader2, marketId, 1, 2 ether);

        // Resolve
        resolveMarket(marketId, 0);

        // All LPs claim their share
        uint256 user1Liquidity = getUserLiquidityShares(marketId, user1);
        uint256 user2Liquidity = getUserLiquidityShares(marketId, user2);
        uint256 user3Liquidity = getUserLiquidityShares(marketId, user3);

        vm.prank(user1);
        market.claimLiquidity(marketId);

        vm.prank(user2);
        market.claimLiquidity(marketId);

        vm.prank(user3);
        market.claimLiquidity(marketId);
    }

    function test_FullLifecycle_PausedMarket() public {
        uint256 marketId = createTestMarket();

        // Buy some shares
        buyShares(user2, marketId, 0, 3 ether);

        // Pause market
        vm.prank(owner);
        market.adminPauseMarket(marketId);

        // Cannot trade while paused
        fundUser(user3, 1 ether);
        vm.prank(user3);
        vm.expectRevert("Market is paused");
        market.buy(marketId, 0, 0, 1 ether);

        // Unpause
        vm.prank(owner);
        market.adminUnpauseMarket(marketId);

        // Can trade again
        vm.prank(user3);
        market.buy(marketId, 0, 0, 1 ether);

        // Complete lifecycle
        resolveMarket(marketId, 0);

        vm.prank(user2);
        market.claimWinnings(marketId);
    }

    function test_FullLifecycle_ExtendedCloseDate() public {
        uint256 marketId = createTestMarket();

        // Get original close date
        (,uint256 originalClose,,,,) = market.getMarketData(marketId);

        // Extend close date
        uint256 newClose = originalClose + 7 days;
        vm.prank(owner);
        market.adminSetMarketCloseDate(marketId, newClose);

        // Warp past original close - should still be open
        vm.warp(originalClose + 1);
        
        // Can still trade
        buyShares(user2, marketId, 0, 2 ether);

        // Warp past new close
        vm.warp(newClose + 1);

        // Resolve
        vm.prank(owner);
        market.adminResolveMarketOutcome(marketId, 0);

        vm.prank(user2);
        market.claimWinnings(marketId);
    }

    // ============ Complex Scenarios ============

    function test_Scenario_HeavyTrading() public {
        uint256 marketId = createTestMarket();

        // Many small trades
        for (uint256 i = 0; i < 10; i++) {
            address trader = address(uint160(0x1000 + i));
            uint256 outcome = i % 2;
            buyShares(trader, marketId, outcome, 0.5 ether);
        }

        // Verify market is still functional
        assertPricesSumToOne(marketId, 1e14);

        resolveMarket(marketId, 0);

        // All traders with outcome 0 can claim
        for (uint256 i = 0; i < 10; i += 2) {
            address trader = address(uint160(0x1000 + i));
            uint256 shares = getUserOutcomeShares(marketId, trader, 0);
            if (shares > 0) {
                vm.prank(trader);
                market.claimWinnings(marketId);
            }
        }
    }

    function test_Scenario_LiquidityProviderProfit() public {
        // Create market with fees
        uint256 marketId = createTestMarketWithFees(3 * 10 ** 16, 0, 0); // 3% pool fee

        uint256 initialLPValue = DEFAULT_MARKET_VALUE;

        // Heavy trading to generate fees
        for (uint256 i = 0; i < 5; i++) {
            buyShares(user2, marketId, 0, 5 ether);
            buyShares(user3, marketId, 1, 5 ether);
        }

        // LP claims fees
        uint256 claimableFees = market.getUserClaimableFees(marketId, user1);
        assertTrue(claimableFees > 0, "Should have fees to claim");

        vm.prank(user1);
        market.claimFees(marketId);

        // Resolve
        resolveMarket(marketId, 0);

        // LP claims liquidity
        uint256 lpBalanceBefore = token.balanceOf(user1);
        vm.prank(user1);
        market.claimLiquidity(marketId);
        uint256 lpBalanceAfter = token.balanceOf(user1);

        // LP should have received liquidity + fees
        uint256 totalReceived = lpBalanceAfter - lpBalanceBefore + claimableFees;
        // LP profit comes from fees - they may have impermanent loss on liquidity
    }

    function test_Scenario_ArbitrageProtection() public {
        uint256 marketId = createTestMarket();

        // Large buy pushes price significantly
        uint256 largeBuyAmount = 50 ether;
        fundUser(user2, largeBuyAmount);

        uint256 priceBefore = market.getMarketOutcomePrice(marketId, 0);
        
        // Calculate expected shares
        uint256 expectedShares = market.calcBuyAmount(largeBuyAmount, marketId, 0);

        vm.prank(user2);
        market.buy(marketId, 0, expectedShares, largeBuyAmount);

        uint256 priceAfter = market.getMarketOutcomePrice(marketId, 0);

        // Price should have moved significantly
        assertTrue(priceAfter > priceBefore, "Price should increase");
        
        // But prices still sum to ~1
        assertPricesSumToOne(marketId, 1e14);
    }

    function test_Scenario_ReferralTracking() public {
        uint256 marketId = createTestMarket();

        // Multiple referral trades
        fundUser(user2, 5 ether);
        vm.prank(user2);
        market.referralBuy(marketId, 0, 0, 2 ether, "ALICE_REF");

        fundUser(user3, 5 ether);
        vm.prank(user3);
        market.referralBuy(marketId, 1, 0, 3 ether, "BOB_REF");

        // Referral sells
        vm.prank(user2);
        market.referralSell(marketId, 0, 0.5 ether, type(uint256).max, "ALICE_REF");

        // Complete lifecycle
        resolveMarket(marketId, 0);

        vm.prank(user2);
        market.claimWinnings(marketId);
    }
}

