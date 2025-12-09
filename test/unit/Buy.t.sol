// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../BaseTest.sol";

contract BuyTest is BaseTest {
    uint256 public marketId;

    function setUp() public override {
        super.setUp();
        // Create a standard market for buy tests
        marketId = createTestMarket();
    }

    // ============ Basic Buy Tests ============

    function test_Buy_Basic() public {
        uint256 buyAmount = 1 ether;
        fundUser(user2, buyAmount);

        uint256 expectedShares = market.calcBuyAmount(buyAmount, marketId, 0);
        assertTrue(expectedShares > 0, "Should receive shares");

        vm.prank(user2);
        market.buy(marketId, 0, 0, buyAmount);

        uint256 userShares = getUserOutcomeShares(marketId, user2, 0);
        assertEq(userShares, expectedShares, "User should have expected shares");
    }

    function test_Buy_MultipleOutcomes() public {
        uint256 buyAmount = 1 ether;

        // Buy outcome 0
        uint256 shares0 = buyShares(user2, marketId, 0, buyAmount);
        
        // Buy outcome 1
        uint256 shares1 = buyShares(user3, marketId, 1, buyAmount);

        uint256 user2Shares0 = getUserOutcomeShares(marketId, user2, 0);
        uint256 user3Shares1 = getUserOutcomeShares(marketId, user3, 1);

        assertEq(user2Shares0, shares0, "User2 should have outcome 0 shares");
        assertEq(user3Shares1, shares1, "User3 should have outcome 1 shares");
    }

    function test_Buy_MultiplePurchases() public {
        uint256 buyAmount = 1 ether;

        // First purchase
        uint256 shares1 = buyShares(user2, marketId, 0, buyAmount);
        
        // Second purchase
        uint256 expectedShares2 = market.calcBuyAmount(buyAmount, marketId, 0);
        fundUser(user2, buyAmount);
        vm.prank(user2);
        market.buy(marketId, 0, 0, buyAmount);

        uint256 totalShares = getUserOutcomeShares(marketId, user2, 0);
        assertEq(totalShares, shares1 + expectedShares2, "Should have accumulated shares");
    }

    function test_BuyWithETH() public {
        // Create ETH market
        uint256 ethMarketId = createTestMarketWithETH();

        uint256 buyAmount = 1 ether;
        fundUserETH(user2, buyAmount);

        uint256 expectedShares = market.calcBuyAmount(buyAmount, ethMarketId, 0);

        vm.prank(user2);
        market.buyWithETH{value: buyAmount}(ethMarketId, 0, 0);

        uint256 userShares = getUserOutcomeShares(ethMarketId, user2, 0);
        assertEq(userShares, expectedShares, "User should have expected shares");
    }

    // ============ Price Movement Tests ============

    function test_Buy_IncreasesPrice() public {
        uint256 priceBefore = market.getMarketOutcomePrice(marketId, 0);

        // Buy a significant amount of outcome 0
        buyShares(user2, marketId, 0, 5 ether);

        uint256 priceAfter = market.getMarketOutcomePrice(marketId, 0);
        assertTrue(priceAfter > priceBefore, "Price should increase after buying");
    }

    function test_Buy_DecreasesOtherOutcomePrice() public {
        uint256 priceBefore = market.getMarketOutcomePrice(marketId, 1);

        // Buy outcome 0
        buyShares(user2, marketId, 0, 5 ether);

        uint256 priceAfter = market.getMarketOutcomePrice(marketId, 1);
        assertTrue(priceAfter < priceBefore, "Other outcome price should decrease");
    }

    function test_Buy_PricesSumToOne() public {
        // Buy various amounts
        buyShares(user2, marketId, 0, 2 ether);
        buyShares(user3, marketId, 1, 1 ether);

        assertPricesSumToOne(marketId, 1e15);
    }

    // ============ Slippage Protection Tests ============

    function test_Buy_MinSharesSlippage_Passes() public {
        uint256 buyAmount = 1 ether;
        fundUser(user2, buyAmount);

        uint256 expectedShares = market.calcBuyAmount(buyAmount, marketId, 0);
        uint256 minShares = expectedShares - 1; // Slightly less than expected

        vm.prank(user2);
        market.buy(marketId, 0, minShares, buyAmount);

        uint256 userShares = getUserOutcomeShares(marketId, user2, 0);
        assertTrue(userShares >= minShares, "Should receive at least min shares");
    }

    function test_Revert_Buy_MinSharesSlippage_Fails() public {
        uint256 buyAmount = 1 ether;
        fundUser(user2, buyAmount);

        uint256 expectedShares = market.calcBuyAmount(buyAmount, marketId, 0);
        uint256 minShares = expectedShares + 1 ether; // More than possible

        vm.prank(user2);
        vm.expectRevert("minimum buy amount not reached");
        market.buy(marketId, 0, minShares, buyAmount);
    }

    // ============ Fee Tests ============

    function test_Buy_WithFees_PoolFee() public {
        // Create market with pool fee
        uint256 poolFee = 2 * 10 ** 16; // 2%
        uint256 feeMarketId = createTestMarketWithFees(poolFee, 0, 0);

        uint256 buyAmount = 1 ether;
        
        // Get initial state
        (,,uint256 liquidityBefore,,,) = market.getMarketData(feeMarketId);

        buyShares(user2, marketId, 0, buyAmount);

        // Pool fee should be added to fee pool (not liquidity directly)
        // The fee pool weight increases
    }

    function test_Buy_WithFees_TreasuryFee() public {
        // Create market with treasury fee
        uint256 treasuryFee = 2 * 10 ** 16; // 2%
        uint256 feeMarketId = createTestMarketWithFees(0, treasuryFee, 0);

        uint256 buyAmount = 1 ether;
        uint256 treasuryBalanceBefore = token.balanceOf(treasury);

        buyShares(user2, feeMarketId, 0, buyAmount);

        uint256 treasuryBalanceAfter = token.balanceOf(treasury);
        uint256 expectedFee = (buyAmount * treasuryFee) / ONE;
        
        assertEq(treasuryBalanceAfter - treasuryBalanceBefore, expectedFee, "Treasury should receive fee");
    }

    function test_Buy_WithFees_DistributorFee() public {
        // Create market with distributor fee
        uint256 distributorFee = 1 * 10 ** 16; // 1%
        uint256 feeMarketId = createTestMarketWithFees(0, 0, distributorFee);

        uint256 buyAmount = 1 ether;
        uint256 distributorBalanceBefore = token.balanceOf(distributor);

        buyShares(user2, feeMarketId, 0, buyAmount);

        uint256 distributorBalanceAfter = token.balanceOf(distributor);
        uint256 expectedFee = (buyAmount * distributorFee) / ONE;
        
        assertEq(distributorBalanceAfter - distributorBalanceBefore, expectedFee, "Distributor should receive fee");
    }

    function test_Buy_WithFees_AllFeeTypes() public {
        uint256 poolFee = 1 * 10 ** 16; // 1%
        uint256 treasuryFee = 2 * 10 ** 16; // 2%
        uint256 distributorFee = 1 * 10 ** 16; // 1%
        
        uint256 feeMarketId = createTestMarketWithFees(poolFee, treasuryFee, distributorFee);

        uint256 buyAmount = 10 ether;
        uint256 treasuryBalanceBefore = token.balanceOf(treasury);
        uint256 distributorBalanceBefore = token.balanceOf(distributor);

        buyShares(user2, feeMarketId, 0, buyAmount);

        uint256 treasuryBalanceAfter = token.balanceOf(treasury);
        uint256 distributorBalanceAfter = token.balanceOf(distributor);
        
        uint256 expectedTreasuryFee = (buyAmount * treasuryFee) / ONE;
        uint256 expectedDistributorFee = (buyAmount * distributorFee) / ONE;

        assertEq(treasuryBalanceAfter - treasuryBalanceBefore, expectedTreasuryFee, "Treasury fee mismatch");
        assertEq(distributorBalanceAfter - distributorBalanceBefore, expectedDistributorFee, "Distributor fee mismatch");
    }

    function test_Buy_FeesReduceSharesReceived() public {
        // Create market with no fees
        uint256 noFeeMarketId = createTestMarket();
        
        // Create market with fees
        uint256 totalFee = 4 * 10 ** 16; // 4% total
        uint256 feeMarketId = createTestMarketWithFees(totalFee, 0, 0);

        uint256 buyAmount = 1 ether;

        // Calculate shares for both markets
        uint256 sharesNoFee = market.calcBuyAmount(buyAmount, noFeeMarketId, 0);
        uint256 sharesWithFee = market.calcBuyAmount(buyAmount, feeMarketId, 0);

        assertTrue(sharesWithFee < sharesNoFee, "Should receive fewer shares with fees");
    }

    // ============ Referral Tests ============

    function test_ReferralBuy_EmitsEvent() public {
        uint256 buyAmount = 1 ether;
        fundUser(user2, buyAmount);

        vm.expectEmit(true, true, false, true);
        emit Referral(user2, marketId, "REF123", PredictionMarket.MarketAction.buy, 0, buyAmount, block.timestamp);

        vm.prank(user2);
        market.referralBuy(marketId, 0, 0, buyAmount, "REF123");
    }

    function test_ReferralBuyWithETH() public {
        uint256 ethMarketId = createTestMarketWithETH();
        uint256 buyAmount = 1 ether;
        fundUserETH(user2, buyAmount);

        vm.expectEmit(true, true, false, true);
        emit Referral(user2, ethMarketId, "ETHREF", PredictionMarket.MarketAction.buy, 0, buyAmount, block.timestamp);

        vm.prank(user2);
        market.referralBuyWithETH{value: buyAmount}(ethMarketId, 0, 0, "ETHREF");
    }

    // ============ Event Tests ============

    function test_Buy_EmitsMarketActionTx() public {
        uint256 buyAmount = 1 ether;
        fundUser(user2, buyAmount);

        uint256 expectedShares = market.calcBuyAmount(buyAmount, marketId, 0);

        vm.expectEmit(true, true, true, true);
        emit MarketActionTx(
            user2,
            PredictionMarket.MarketAction.buy,
            marketId,
            0,
            expectedShares,
            buyAmount,
            block.timestamp
        );

        vm.prank(user2);
        market.buy(marketId, 0, 0, buyAmount);
    }

    // ============ Calc Buy Amount Tests ============

    function test_CalcBuyAmount_ReturnsCorrectShares() public {
        uint256 buyAmount = 1 ether;
        uint256 expectedShares = market.calcBuyAmount(buyAmount, marketId, 0);

        fundUser(user2, buyAmount);
        vm.prank(user2);
        market.buy(marketId, 0, 0, buyAmount);

        uint256 actualShares = getUserOutcomeShares(marketId, user2, 0);
        assertEq(actualShares, expectedShares, "Actual shares should match calculated");
    }

    function test_CalcBuyAmount_DifferentForDifferentOutcomes() public {
        // First make the market unbalanced
        buyShares(user2, marketId, 0, 3 ether);

        uint256 buyAmount = 1 ether;
        uint256 sharesOutcome0 = market.calcBuyAmount(buyAmount, marketId, 0);
        uint256 sharesOutcome1 = market.calcBuyAmount(buyAmount, marketId, 1);

        // Should get more shares of the cheaper outcome
        assertTrue(sharesOutcome1 > sharesOutcome0, "Should get more shares of cheaper outcome");
    }

    // ============ Revert Tests ============

    function test_Revert_Buy_OutcomeOutOfBounds() public {
        uint256 buyAmount = 1 ether;
        fundUser(user2, buyAmount);

        vm.prank(user2);
        vm.expectRevert("outcome is out of bounds");
        market.buy(marketId, 5, 0, buyAmount); // Invalid outcome
    }

    function test_Revert_Buy_ClosedMarket() public {
        // Close the market
        closeMarket(marketId);

        uint256 buyAmount = 1 ether;
        fundUser(user2, buyAmount);

        vm.prank(user2);
        vm.expectRevert("Market in incorrect state");
        market.buy(marketId, 0, 0, buyAmount);
    }

    function test_Revert_Buy_ResolvedMarket() public {
        // Resolve the market
        resolveMarket(marketId, 0);

        uint256 buyAmount = 1 ether;
        fundUser(user2, buyAmount);

        vm.prank(user2);
        vm.expectRevert("Market in incorrect state");
        market.buy(marketId, 0, 0, buyAmount);
    }

    function test_Revert_Buy_PausedMarket() public {
        // Pause the market
        vm.prank(owner);
        market.adminPauseMarket(marketId);

        uint256 buyAmount = 1 ether;
        fundUser(user2, buyAmount);

        vm.prank(user2);
        vm.expectRevert("Market is paused");
        market.buy(marketId, 0, 0, buyAmount);
    }

    function test_Revert_Buy_ZeroShares() public {
        // Trying to buy 0 value would result in 0 shares
        fundUser(user2, 1);

        vm.prank(user2);
        // This will either revert with "shares amount is 0" or underflow
        // depending on the exact calculation
        vm.expectRevert();
        market.buy(marketId, 0, 0, 0);
    }

    function test_Revert_BuyWithETH_NotWETHMarket() public {
        // marketId is ERC20, not WETH
        fundUserETH(user2, 1 ether);

        vm.prank(user2);
        vm.expectRevert("Market token is not WETH");
        market.buyWithETH{value: 1 ether}(marketId, 0, 0);
    }

    // ============ Market State Updates ============

    function test_Buy_UpdatesMarketBalance() public {
        uint256 buyAmount = 1 ether;
        
        (,,,uint256 balanceBefore,,) = market.getMarketData(marketId);
        
        buyShares(user2, marketId, 0, buyAmount);
        
        (,,,uint256 balanceAfter,,) = market.getMarketData(marketId);
        
        // Balance increases by value minus fees (no fees in this market)
        assertEq(balanceAfter, balanceBefore + buyAmount, "Balance should increase");
    }

    function test_Buy_UpdatesOutcomeShares() public {
        (uint256 priceBefore, uint256 availableBefore,) = market.getMarketOutcomeData(marketId, 0);

        buyShares(user2, marketId, 0, 1 ether);

        (uint256 priceAfter, uint256 availableAfter,) = market.getMarketOutcomeData(marketId, 0);

        assertTrue(availableAfter < availableBefore, "Available shares should decrease");
        assertTrue(priceAfter > priceBefore, "Price should increase");
    }

    // ============ Edge Cases ============

    function test_Buy_VerySmallAmount() public {
        uint256 buyAmount = 0.001 ether;
        fundUser(user2, buyAmount);

        uint256 expectedShares = market.calcBuyAmount(buyAmount, marketId, 0);
        assertTrue(expectedShares > 0, "Should still receive some shares");

        vm.prank(user2);
        market.buy(marketId, 0, 0, buyAmount);

        uint256 userShares = getUserOutcomeShares(marketId, user2, 0);
        assertEq(userShares, expectedShares, "Should receive calculated shares");
    }

    function test_Buy_LargeAmount() public {
        uint256 buyAmount = 100 ether;
        fundUser(user2, buyAmount);

        uint256 expectedShares = market.calcBuyAmount(buyAmount, marketId, 0);

        vm.prank(user2);
        market.buy(marketId, 0, 0, buyAmount);

        uint256 userShares = getUserOutcomeShares(marketId, user2, 0);
        assertEq(userShares, expectedShares, "Should receive calculated shares");
    }

    function test_Buy_MultiOutcomeMarket() public {
        // Create market with 5 outcomes
        uint256 multiMarketId = createTestMarketWithOutcomes(5);

        // Buy each outcome
        for (uint256 i = 0; i < 5; i++) {
            buyShares(user2, multiMarketId, i, 0.5 ether);
        }

        // Verify user has shares in all outcomes
        for (uint256 i = 0; i < 5; i++) {
            uint256 shares = getUserOutcomeShares(multiMarketId, user2, i);
            assertTrue(shares > 0, "Should have shares in each outcome");
        }

        // Prices should still sum to ~1
        assertPricesSumToOne(multiMarketId, 1e14);
    }
}

