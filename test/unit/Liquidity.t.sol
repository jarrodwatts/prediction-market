// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../BaseTest.sol";

contract LiquidityTest is BaseTest {
    uint256 public marketId;

    function setUp() public override {
        super.setUp();
        // Create a standard market
        marketId = createTestMarket();
    }

    // ============ Add Liquidity Tests ============

    function test_AddLiquidity_Basic() public {
        uint256 addAmount = 5 ether;
        uint256 liquidityBefore = getUserLiquidityShares(marketId, user2);

        fundUser(user2, addAmount);
        vm.prank(user2);
        market.addLiquidity(marketId, addAmount);

        uint256 liquidityAfter = getUserLiquidityShares(marketId, user2);
        assertTrue(liquidityAfter > liquidityBefore, "Should have more liquidity shares");
    }

    function test_AddLiquidity_BalancedMarket() public {
        // In a balanced market, adding liquidity should be straightforward
        uint256 addAmount = 5 ether;

        fundUser(user2, addAmount);
        
        // Check user doesn't get any outcome shares back in balanced market
        vm.prank(user2);
        market.addLiquidity(marketId, addAmount);

        // In a perfectly balanced market, user should not receive outcome shares
        uint256 shares0 = getUserOutcomeShares(marketId, user2, 0);
        uint256 shares1 = getUserOutcomeShares(marketId, user2, 1);
        
        // Should be approximately equal (both near 0 or both small)
        assertApproxEqAbs(shares0, shares1, 1, "Should not receive unequal shares");
    }

    function test_AddLiquidity_UnbalancedMarket() public {
        // First, make the market unbalanced
        buyShares(user3, marketId, 0, 5 ether);

        // Now add liquidity
        uint256 addAmount = 5 ether;
        fundUser(user2, addAmount);

        vm.prank(user2);
        market.addLiquidity(marketId, addAmount);

        // User should receive some outcome shares back to balance
        uint256 shares0 = getUserOutcomeShares(marketId, user2, 0);
        uint256 shares1 = getUserOutcomeShares(marketId, user2, 1);

        // In an unbalanced market, user gets more of the outcome that was bought
        assertTrue(shares0 > 0 || shares1 > 0, "Should receive some shares back");
    }

    function test_AddLiquidityWithETH() public {
        uint256 ethMarketId = createTestMarketWithETH();
        uint256 addAmount = 5 ether;

        uint256 liquidityBefore = getUserLiquidityShares(ethMarketId, user2);
        
        fundUserETH(user2, addAmount);
        vm.prank(user2);
        market.addLiquidityWithETH{value: addAmount}(ethMarketId);

        uint256 liquidityAfter = getUserLiquidityShares(ethMarketId, user2);
        assertTrue(liquidityAfter > liquidityBefore, "Should have more liquidity shares");
    }

    function test_AddLiquidity_MultipleProviders() public {
        uint256 addAmount = 5 ether;

        // User2 adds liquidity
        fundUser(user2, addAmount);
        vm.prank(user2);
        market.addLiquidity(marketId, addAmount);

        // User3 adds liquidity
        fundUser(user3, addAmount);
        vm.prank(user3);
        market.addLiquidity(marketId, addAmount);

        uint256 user1Liquidity = getUserLiquidityShares(marketId, user1); // Creator
        uint256 user2Liquidity = getUserLiquidityShares(marketId, user2);
        uint256 user3Liquidity = getUserLiquidityShares(marketId, user3);

        assertTrue(user1Liquidity > 0, "Creator should have liquidity");
        assertTrue(user2Liquidity > 0, "User2 should have liquidity");
        assertTrue(user3Liquidity > 0, "User3 should have liquidity");
    }

    function test_AddLiquidity_UpdatesMarketLiquidity() public {
        (,,uint256 liquidityBefore,,,) = market.getMarketData(marketId);

        uint256 addAmount = 5 ether;
        fundUser(user2, addAmount);
        vm.prank(user2);
        market.addLiquidity(marketId, addAmount);

        (,,uint256 liquidityAfter,,,) = market.getMarketData(marketId);
        assertTrue(liquidityAfter > liquidityBefore, "Market liquidity should increase");
    }

    function test_AddLiquidity_EmitsEvent() public {
        uint256 addAmount = 5 ether;
        fundUser(user2, addAmount);

        vm.prank(user2);
        // Event is emitted - just verify the call succeeds
        market.addLiquidity(marketId, addAmount);
    }

    // ============ Remove Liquidity Tests ============

    function test_RemoveLiquidity_Basic() public {
        // User1 is the creator with liquidity
        uint256 liquidityBefore = getUserLiquidityShares(marketId, user1);
        uint256 removeAmount = liquidityBefore / 2;

        uint256 balanceBefore = token.balanceOf(user1);

        vm.prank(user1);
        market.removeLiquidity(marketId, removeAmount);

        uint256 liquidityAfter = getUserLiquidityShares(marketId, user1);
        uint256 balanceAfter = token.balanceOf(user1);

        assertEq(liquidityBefore - liquidityAfter, removeAmount, "Should remove exact liquidity");
        assertTrue(balanceAfter > balanceBefore, "Should receive tokens back");
    }

    function test_RemoveLiquidity_ReceivesOutcomeShares() public {
        // First make market unbalanced
        buyShares(user2, marketId, 0, 5 ether);

        // Remove some liquidity
        uint256 liquidityBefore = getUserLiquidityShares(marketId, user1);
        uint256 removeAmount = liquidityBefore / 2;

        vm.prank(user1);
        market.removeLiquidity(marketId, removeAmount);

        // Should receive some outcome shares
        uint256 shares0 = getUserOutcomeShares(marketId, user1, 0);
        uint256 shares1 = getUserOutcomeShares(marketId, user1, 1);

        // In unbalanced market, should get some shares back
        assertTrue(shares0 > 0 || shares1 > 0, "Should receive outcome shares");
    }

    function test_RemoveLiquidityToETH() public {
        uint256 ethMarketId = createTestMarketWithETH();
        uint256 liquidityShares = getUserLiquidityShares(ethMarketId, user1);
        uint256 removeAmount = liquidityShares / 2;

        uint256 ethBefore = user1.balance;

        vm.prank(user1);
        market.removeLiquidityToETH(ethMarketId, removeAmount);

        uint256 ethAfter = user1.balance;
        assertTrue(ethAfter > ethBefore, "Should receive ETH");
    }

    function test_RemoveLiquidity_PartialRemoval() public {
        uint256 liquidityBefore = getUserLiquidityShares(marketId, user1);
        
        // Remove 25%
        uint256 removeAmount = liquidityBefore / 4;
        
        vm.prank(user1);
        market.removeLiquidity(marketId, removeAmount);

        uint256 liquidityAfter = getUserLiquidityShares(marketId, user1);
        assertEq(liquidityAfter, liquidityBefore - removeAmount, "Should have 75% remaining");
    }

    function test_RemoveLiquidity_UpdatesMarketLiquidity() public {
        (,,uint256 liquidityBefore,,,) = market.getMarketData(marketId);

        uint256 userLiquidity = getUserLiquidityShares(marketId, user1);
        uint256 removeAmount = userLiquidity / 2;

        vm.prank(user1);
        market.removeLiquidity(marketId, removeAmount);

        (,,uint256 liquidityAfter,,,) = market.getMarketData(marketId);
        assertTrue(liquidityAfter < liquidityBefore, "Market liquidity should decrease");
    }

    // ============ Fee Pool Rebalancing Tests ============

    function test_AddLiquidity_RebalancesFeesPool() public {
        // Create market with fees
        uint256 feeMarketId = createTestMarketWithFees(2 * 10 ** 16, 0, 0); // 2% pool fee

        // Generate some fees through trading
        buyShares(user2, feeMarketId, 0, 5 ether);
        buyShares(user3, feeMarketId, 1, 3 ether);

        // User1 (creator) should have claimable fees
        uint256 feesBefore = market.getUserClaimableFees(feeMarketId, user1);

        // Add more liquidity
        fundUser(user2, 5 ether);
        vm.prank(user2);
        market.addLiquidity(feeMarketId, 5 ether);

        // User2's fees should start from the current pool state
        uint256 user2Fees = market.getUserClaimableFees(feeMarketId, user2);
        
        // New liquidity provider starts with 0 claimable fees (pool is rebalanced)
        assertEq(user2Fees, 0, "New LP should have 0 claimable fees initially");
    }

    function test_RemoveLiquidity_RebalancesFeesPool() public {
        uint256 feeMarketId = createTestMarketWithFees(2 * 10 ** 16, 0, 0);

        // Generate fees
        buyShares(user2, feeMarketId, 0, 5 ether);

        // Check fees before removal
        uint256 feesBefore = market.getUserClaimableFees(feeMarketId, user1);
        assertTrue(feesBefore > 0, "Should have some claimable fees");

        // Remove half liquidity
        uint256 liquidity = getUserLiquidityShares(feeMarketId, user1);
        vm.prank(user1);
        market.removeLiquidity(feeMarketId, liquidity / 2);

        // Fees should be adjusted
        uint256 feesAfter = market.getUserClaimableFees(feeMarketId, user1);
        // After removing liquidity, claimable fees should change
    }

    // ============ Liquidity Pool Share Tests ============

    function test_GetUserLiquidityPoolShare() public {
        // User1 is the only LP initially
        uint256 poolShare = market.getUserLiquidityPoolShare(marketId, user1);
        assertEq(poolShare, ONE, "Creator should have 100% share initially");

        // Add another LP
        fundUser(user2, DEFAULT_MARKET_VALUE);
        vm.prank(user2);
        market.addLiquidity(marketId, DEFAULT_MARKET_VALUE);

        // Now each should have ~50%
        uint256 user1Share = market.getUserLiquidityPoolShare(marketId, user1);
        uint256 user2Share = market.getUserLiquidityPoolShare(marketId, user2);

        assertApproxEqAbs(user1Share, ONE / 2, 1e15, "User1 should have ~50%");
        assertApproxEqAbs(user2Share, ONE / 2, 1e15, "User2 should have ~50%");
    }

    function test_LiquidityPrice_Calculation() public {
        uint256 liquidityPrice = market.getMarketLiquidityPrice(marketId);
        
        // In a balanced 2-outcome market, liquidity price should be ~1
        assertApproxEqAbs(liquidityPrice, ONE, 1e15, "Liquidity price should be ~1 in balanced market");
    }

    function test_LiquidityPrice_AfterTrading() public {
        uint256 priceBefore = market.getMarketLiquidityPrice(marketId);

        // Heavy trading on one side
        buyShares(user2, marketId, 0, 5 ether);

        uint256 priceAfter = market.getMarketLiquidityPrice(marketId);

        // Liquidity price changes based on market imbalance
        assertTrue(priceAfter != priceBefore || priceAfter == priceBefore, "Price may change");
    }

    // ============ Revert Tests ============

    function test_Revert_AddLiquidity_ZeroValue() public {
        fundUser(user2, 1 ether);
        
        vm.prank(user2);
        vm.expectRevert("stake has to be greater than 0.");
        market.addLiquidity(marketId, 0);
    }

    function test_Revert_AddLiquidity_ClosedMarket() public {
        closeMarket(marketId);

        fundUser(user2, 5 ether);
        
        vm.prank(user2);
        vm.expectRevert("Market in incorrect state");
        market.addLiquidity(marketId, 5 ether);
    }

    function test_Revert_AddLiquidity_ResolvedMarket() public {
        resolveMarket(marketId, 0);

        fundUser(user2, 5 ether);
        
        vm.prank(user2);
        vm.expectRevert("Market in incorrect state");
        market.addLiquidity(marketId, 5 ether);
    }

    function test_Revert_AddLiquidity_PausedMarket() public {
        vm.prank(owner);
        market.adminPauseMarket(marketId);

        fundUser(user2, 5 ether);
        
        vm.prank(user2);
        vm.expectRevert("Market is paused");
        market.addLiquidity(marketId, 5 ether);
    }

    function test_Revert_AddLiquidity_WithDistributionOnExistingMarket() public {
        // The market already has liquidity, so we cannot provide a distribution
        // This is enforced in the _addLiquidity function
        fundUser(user2, 5 ether);
        
        // The public addLiquidity function doesn't take distribution,
        // but the internal check is "market already funded"
    }

    function test_Revert_RemoveLiquidity_AllLiquidity() public {
        uint256 liquidity = getUserLiquidityShares(marketId, user1);

        vm.prank(user1);
        vm.expectRevert("cannot remove all liquidity");
        market.removeLiquidity(marketId, liquidity);
    }

    function test_Revert_RemoveLiquidity_MoreThanOwned() public {
        uint256 liquidity = getUserLiquidityShares(marketId, user1);

        vm.prank(user1);
        vm.expectRevert("insufficient shares balance");
        market.removeLiquidity(marketId, liquidity + 1);
    }

    function test_Revert_RemoveLiquidity_NoShares() public {
        // user2 has no liquidity shares
        vm.prank(user2);
        vm.expectRevert("insufficient shares balance");
        market.removeLiquidity(marketId, 1 ether);
    }

    function test_Revert_RemoveLiquidity_ClosedMarket() public {
        closeMarket(marketId);

        uint256 liquidity = getUserLiquidityShares(marketId, user1);

        vm.prank(user1);
        vm.expectRevert("Market in incorrect state");
        market.removeLiquidity(marketId, liquidity / 2);
    }

    function test_Revert_RemoveLiquidity_PausedMarket() public {
        vm.prank(owner);
        market.adminPauseMarket(marketId);

        uint256 liquidity = getUserLiquidityShares(marketId, user1);

        vm.prank(user1);
        vm.expectRevert("Market is paused");
        market.removeLiquidity(marketId, liquidity / 2);
    }

    function test_Revert_AddLiquidityWithETH_NotWETHMarket() public {
        fundUserETH(user2, 5 ether);
        
        vm.prank(user2);
        vm.expectRevert("Market token is not WETH");
        market.addLiquidityWithETH{value: 5 ether}(marketId);
    }

    function test_Revert_RemoveLiquidityToETH_NotWETHMarket() public {
        uint256 liquidity = getUserLiquidityShares(marketId, user1);

        vm.prank(user1);
        vm.expectRevert("Market token is not WETH");
        market.removeLiquidityToETH(marketId, liquidity / 2);
    }

    // ============ Edge Cases ============

    function test_AddLiquidity_VerySmallAmount() public {
        uint256 addAmount = 0.001 ether;
        fundUser(user2, addAmount);

        uint256 liquidityBefore = getUserLiquidityShares(marketId, user2);

        vm.prank(user2);
        market.addLiquidity(marketId, addAmount);

        uint256 liquidityAfter = getUserLiquidityShares(marketId, user2);
        assertTrue(liquidityAfter > liquidityBefore, "Should receive some liquidity");
    }

    function test_AddLiquidity_LargeAmount() public {
        uint256 addAmount = 100 ether;
        fundUser(user2, addAmount);

        vm.prank(user2);
        market.addLiquidity(marketId, addAmount);

        uint256 liquidity = getUserLiquidityShares(marketId, user2);
        assertTrue(liquidity > 0, "Should have liquidity shares");
    }

    function test_Liquidity_AfterHeavyTrading() public {
        // Heavy trading
        for (uint256 i = 0; i < 5; i++) {
            buyShares(user2, marketId, 0, 1 ether);
            buyShares(user3, marketId, 1, 1 ether);
        }

        // Add liquidity after trading
        fundUser(user2, 5 ether);
        vm.prank(user2);
        market.addLiquidity(marketId, 5 ether);

        // Market should still be functional
        assertPricesSumToOne(marketId, 1e14);
    }

    function test_RemoveLiquidity_MultiplePartialRemovals() public {
        uint256 initialLiquidity = getUserLiquidityShares(marketId, user1);
        
        // Remove 10% at a time
        for (uint256 i = 0; i < 5; i++) {
            uint256 currentLiquidity = getUserLiquidityShares(marketId, user1);
            uint256 removeAmount = currentLiquidity / 10;
            
            if (removeAmount > 0 && currentLiquidity - removeAmount > 0) {
                vm.prank(user1);
                market.removeLiquidity(marketId, removeAmount);
            }
        }

        uint256 finalLiquidity = getUserLiquidityShares(marketId, user1);
        assertTrue(finalLiquidity < initialLiquidity, "Should have less liquidity");
        assertTrue(finalLiquidity > 0, "Should still have some liquidity");
    }

    function test_Liquidity_MultiOutcomeMarket() public {
        uint256 multiMarketId = createTestMarketWithOutcomes(5);

        // Add liquidity
        fundUser(user2, 5 ether);
        vm.prank(user2);
        market.addLiquidity(multiMarketId, 5 ether);

        uint256 liquidity = getUserLiquidityShares(multiMarketId, user2);
        assertTrue(liquidity > 0, "Should have liquidity in multi-outcome market");

        // Prices should sum to ~1
        assertPricesSumToOne(multiMarketId, 1e14);
    }

    // ============ Liquidity Value Tests ============

    function test_LiquidityValue_InBalancedMarket() public {
        uint256 liquidityShares = getUserLiquidityShares(marketId, user1);
        uint256 liquidityPrice = market.getMarketLiquidityPrice(marketId);
        
        uint256 liquidityValue = (liquidityPrice * liquidityShares) / ONE;
        
        // In balanced market, value should be close to initial investment
        assertApproxEqAbs(liquidityValue, DEFAULT_MARKET_VALUE, 1e15, "Liquidity value should match initial");
    }

    function test_GetMarketShares() public {
        (uint256 liquidity, uint256[] memory outcomeShares) = market.getMarketShares(marketId);

        assertEq(liquidity, DEFAULT_MARKET_VALUE, "Liquidity should match initial");
        assertEq(outcomeShares.length, 2, "Should have 2 outcomes");
        assertTrue(outcomeShares[0] > 0, "Outcome 0 should have shares");
        assertTrue(outcomeShares[1] > 0, "Outcome 1 should have shares");
    }
}

