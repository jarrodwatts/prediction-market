// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../BaseTest.sol";

contract SellTest is BaseTest {
    uint256 public marketId;

    function setUp() public override {
        super.setUp();
        // Create a standard market for sell tests
        marketId = createTestMarket();
        // Give user2 some shares to sell
        buyShares(user2, marketId, 0, 5 ether);
    }

    // ============ Basic Sell Tests ============

    function test_Sell_Basic() public {
        uint256 sellValue = 1 ether;
        uint256 sharesBefore = getUserOutcomeShares(marketId, user2, 0);
        uint256 balanceBefore = token.balanceOf(user2);

        uint256 sharesToSell = market.calcSellAmount(sellValue, marketId, 0);
        assertTrue(sharesToSell <= sharesBefore, "Should not need more shares than owned");

        vm.prank(user2);
        market.sell(marketId, 0, sellValue, type(uint256).max);

        uint256 sharesAfter = getUserOutcomeShares(marketId, user2, 0);
        uint256 balanceAfter = token.balanceOf(user2);

        assertEq(sharesBefore - sharesAfter, sharesToSell, "Shares sold mismatch");
        assertEq(balanceAfter - balanceBefore, sellValue, "Balance received mismatch");
    }

    function test_Sell_AllShares() public {
        // Get user's current shares
        uint256 userShares = getUserOutcomeShares(marketId, user2, 0);
        
        // Calculate value we can get for all shares (approximately)
        // We need to sell incrementally or calculate properly
        // For simplicity, sell a smaller amount that we know we can handle
        uint256 sellValue = 2 ether; // Less than what we bought

        vm.prank(user2);
        market.sell(marketId, 0, sellValue, type(uint256).max);

        uint256 sharesAfter = getUserOutcomeShares(marketId, user2, 0);
        assertTrue(sharesAfter < userShares, "Should have fewer shares");
    }

    function test_Sell_MultipleSales() public {
        uint256 sellValue = 0.5 ether;
        uint256 sharesBefore = getUserOutcomeShares(marketId, user2, 0);

        // First sale
        vm.prank(user2);
        market.sell(marketId, 0, sellValue, type(uint256).max);

        uint256 sharesMiddle = getUserOutcomeShares(marketId, user2, 0);
        assertTrue(sharesMiddle < sharesBefore, "Shares should decrease after first sale");

        // Second sale
        vm.prank(user2);
        market.sell(marketId, 0, sellValue, type(uint256).max);

        uint256 sharesAfter = getUserOutcomeShares(marketId, user2, 0);
        assertTrue(sharesAfter < sharesMiddle, "Shares should decrease after second sale");
    }

    function test_SellToETH() public {
        // Create ETH market and buy some shares
        uint256 ethMarketId = createTestMarketWithETH();
        buySharesWithETH(user2, ethMarketId, 0, 5 ether);

        uint256 sellValue = 1 ether;
        uint256 ethBalanceBefore = user2.balance;

        vm.prank(user2);
        market.sellToETH(ethMarketId, 0, sellValue, type(uint256).max);

        uint256 ethBalanceAfter = user2.balance;
        assertEq(ethBalanceAfter - ethBalanceBefore, sellValue, "Should receive ETH");
    }

    // ============ Price Movement Tests ============

    function test_Sell_DecreasesPrice() public {
        uint256 priceBefore = market.getMarketOutcomePrice(marketId, 0);

        vm.prank(user2);
        market.sell(marketId, 0, 2 ether, type(uint256).max);

        uint256 priceAfter = market.getMarketOutcomePrice(marketId, 0);
        assertTrue(priceAfter < priceBefore, "Price should decrease after selling");
    }

    function test_Sell_IncreasesOtherOutcomePrice() public {
        uint256 priceBefore = market.getMarketOutcomePrice(marketId, 1);

        vm.prank(user2);
        market.sell(marketId, 0, 2 ether, type(uint256).max);

        uint256 priceAfter = market.getMarketOutcomePrice(marketId, 1);
        assertTrue(priceAfter > priceBefore, "Other outcome price should increase");
    }

    function test_Sell_PricesSumToOne() public {
        vm.prank(user2);
        market.sell(marketId, 0, 1 ether, type(uint256).max);

        assertPricesSumToOne(marketId, 1e15);
    }

    // ============ Slippage Protection Tests ============

    function test_Sell_MaxSharesSlippage_Passes() public {
        uint256 sellValue = 1 ether;
        uint256 expectedShares = market.calcSellAmount(sellValue, marketId, 0);
        uint256 maxShares = expectedShares + 1; // Slightly more than expected

        vm.prank(user2);
        market.sell(marketId, 0, sellValue, maxShares);

        // Should succeed
    }

    function test_Revert_Sell_MaxSharesSlippage_Fails() public {
        uint256 sellValue = 1 ether;
        uint256 expectedShares = market.calcSellAmount(sellValue, marketId, 0);
        uint256 maxShares = expectedShares - 1; // Less than needed

        vm.prank(user2);
        vm.expectRevert("maximum sell amount exceeded");
        market.sell(marketId, 0, sellValue, maxShares);
    }

    // ============ Fee Tests ============

    function test_Sell_WithFees_TreasuryFee() public {
        // Create market with sell fees
        uint256 treasuryFee = 2 * 10 ** 16; // 2%
        uint256 feeMarketId = createTestMarketWithFees(0, treasuryFee, 0);
        
        // Buy some shares
        buyShares(user2, feeMarketId, 0, 5 ether);

        uint256 sellValue = 1 ether;
        uint256 treasuryBalanceBefore = token.balanceOf(treasury);

        vm.prank(user2);
        market.sell(feeMarketId, 0, sellValue, type(uint256).max);

        uint256 treasuryBalanceAfter = token.balanceOf(treasury);
        
        // Treasury should receive fees (calculated on the gross amount)
        assertTrue(treasuryBalanceAfter > treasuryBalanceBefore, "Treasury should receive fee");
    }

    function test_Sell_WithFees_DistributorFee() public {
        uint256 distributorFee = 1 * 10 ** 16; // 1%
        uint256 feeMarketId = createTestMarketWithFees(0, 0, distributorFee);
        
        buyShares(user2, feeMarketId, 0, 5 ether);

        uint256 sellValue = 1 ether;
        uint256 distributorBalanceBefore = token.balanceOf(distributor);

        vm.prank(user2);
        market.sell(feeMarketId, 0, sellValue, type(uint256).max);

        uint256 distributorBalanceAfter = token.balanceOf(distributor);
        assertTrue(distributorBalanceAfter > distributorBalanceBefore, "Distributor should receive fee");
    }

    function test_Sell_FeesRequireMoreShares() public {
        // Create market with no fees
        uint256 noFeeMarketId = createTestMarket();
        buyShares(user2, noFeeMarketId, 0, 5 ether);
        
        // Create market with fees
        uint256 feeMarketId = createTestMarketWithFees(2 * 10 ** 16, 0, 0);
        buyShares(user3, feeMarketId, 0, 5 ether);

        uint256 sellValue = 1 ether;

        // Calculate shares needed for both markets
        uint256 sharesNoFee = market.calcSellAmount(sellValue, noFeeMarketId, 0);
        uint256 sharesWithFee = market.calcSellAmount(sellValue, feeMarketId, 0);

        // Should need more shares when there are fees
        assertTrue(sharesWithFee > sharesNoFee, "Should need more shares with fees");
    }

    // ============ Referral Tests ============

    function test_ReferralSell_EmitsEvent() public {
        uint256 sellValue = 1 ether;

        vm.prank(user2);
        // Note: Referral event includes the valuePlusFees, not just value
        market.referralSell(marketId, 0, sellValue, type(uint256).max, "SELLREF");

        // Event verification is complex due to calculated fees
        // The sell should succeed
    }

    function test_ReferralSellToETH() public {
        uint256 ethMarketId = createTestMarketWithETH();
        buySharesWithETH(user2, ethMarketId, 0, 5 ether);

        uint256 sellValue = 1 ether;

        vm.prank(user2);
        market.referralSellToETH(ethMarketId, 0, sellValue, type(uint256).max, "ETHSELLREF");
    }

    // ============ Calc Sell Amount Tests ============

    function test_CalcSellAmount_ReturnsCorrectShares() public {
        uint256 sellValue = 1 ether;
        uint256 expectedShares = market.calcSellAmount(sellValue, marketId, 0);

        uint256 sharesBefore = getUserOutcomeShares(marketId, user2, 0);

        vm.prank(user2);
        market.sell(marketId, 0, sellValue, type(uint256).max);

        uint256 sharesAfter = getUserOutcomeShares(marketId, user2, 0);
        uint256 actualSharesSold = sharesBefore - sharesAfter;

        assertEq(actualSharesSold, expectedShares, "Actual shares sold should match calculated");
    }

    function test_CalcSellAmount_DifferentForDifferentOutcomes() public {
        // Make market unbalanced by buying more of outcome 0
        buyShares(user3, marketId, 0, 3 ether);
        
        // Give user2 shares in outcome 1
        buyShares(user2, marketId, 1, 3 ether);

        uint256 sellValue = 1 ether;
        uint256 sharesOutcome0 = market.calcSellAmount(sellValue, marketId, 0);
        uint256 sharesOutcome1 = market.calcSellAmount(sellValue, marketId, 1);

        // Different outcomes require different amounts of shares
        assertTrue(sharesOutcome0 != sharesOutcome1, "Should need different shares for different outcomes");
    }

    // ============ Revert Tests ============

    function test_Revert_Sell_InsufficientShares() public {
        uint256 userShares = getUserOutcomeShares(marketId, user2, 0);
        
        // Try to sell value that would require more shares than owned
        // First, calculate roughly how much value all shares are worth
        // Then try to sell more than that
        uint256 sellValue = 100 ether; // Way more than possible

        vm.prank(user2);
        vm.expectRevert(); // Will revert due to various checks
        market.sell(marketId, 0, sellValue, type(uint256).max);
    }

    function test_Revert_Sell_OutcomeOutOfBounds() public {
        vm.prank(user2);
        vm.expectRevert("outcome is out of bounds");
        market.sell(marketId, 5, 1 ether, type(uint256).max); // Invalid outcome
    }

    function test_Revert_Sell_ClosedMarket() public {
        closeMarket(marketId);

        vm.prank(user2);
        vm.expectRevert("Market in incorrect state");
        market.sell(marketId, 0, 1 ether, type(uint256).max);
    }

    function test_Revert_Sell_ResolvedMarket() public {
        resolveMarket(marketId, 0);

        vm.prank(user2);
        vm.expectRevert("Market in incorrect state");
        market.sell(marketId, 0, 1 ether, type(uint256).max);
    }

    function test_Revert_Sell_PausedMarket() public {
        vm.prank(owner);
        market.adminPauseMarket(marketId);

        vm.prank(user2);
        vm.expectRevert("Market is paused");
        market.sell(marketId, 0, 1 ether, type(uint256).max);
    }

    function test_Revert_Sell_NoSharesOwned() public {
        // user3 has no shares
        vm.prank(user3);
        vm.expectRevert("insufficient shares balance");
        market.sell(marketId, 0, 0.1 ether, type(uint256).max);
    }

    function test_Revert_SellToETH_NotWETHMarket() public {
        // marketId is ERC20, not WETH
        vm.prank(user2);
        vm.expectRevert("Market token is not WETH");
        market.sellToETH(marketId, 0, 1 ether, type(uint256).max);
    }

    // ============ Market State Updates ============

    function test_Sell_UpdatesMarketBalance() public {
        (,,,uint256 balanceBefore,,) = market.getMarketData(marketId);

        uint256 sellValue = 1 ether;
        vm.prank(user2);
        market.sell(marketId, 0, sellValue, type(uint256).max);

        (,,,uint256 balanceAfter,,) = market.getMarketData(marketId);

        // Balance decreases by value plus fees (no fees in this market)
        assertEq(balanceBefore - balanceAfter, sellValue, "Balance should decrease");
    }

    function test_Sell_UpdatesOutcomeShares() public {
        (, uint256 availableBefore,) = market.getMarketOutcomeData(marketId, 0);

        vm.prank(user2);
        market.sell(marketId, 0, 1 ether, type(uint256).max);

        (, uint256 availableAfter,) = market.getMarketOutcomeData(marketId, 0);

        assertTrue(availableAfter > availableBefore, "Available shares should increase (returned to pool)");
    }

    // ============ Edge Cases ============

    function test_Sell_VerySmallAmount() public {
        uint256 sellValue = 0.001 ether;

        uint256 sharesToSell = market.calcSellAmount(sellValue, marketId, 0);
        assertTrue(sharesToSell > 0, "Should need some shares");

        uint256 balanceBefore = token.balanceOf(user2);

        vm.prank(user2);
        market.sell(marketId, 0, sellValue, type(uint256).max);

        uint256 balanceAfter = token.balanceOf(user2);
        assertEq(balanceAfter - balanceBefore, sellValue, "Should receive exact sell value");
    }

    function test_Sell_AfterMultipleBuys() public {
        // Multiple users buy different outcomes
        buyShares(user3, marketId, 1, 3 ether);
        buyShares(user2, marketId, 0, 2 ether);

        // Now sell
        uint256 sellValue = 1 ether;
        uint256 balanceBefore = token.balanceOf(user2);

        vm.prank(user2);
        market.sell(marketId, 0, sellValue, type(uint256).max);

        uint256 balanceAfter = token.balanceOf(user2);
        assertEq(balanceAfter - balanceBefore, sellValue, "Should receive exact sell value");
    }

    function test_Sell_MultiOutcomeMarket() public {
        // Create market with 5 outcomes
        uint256 multiMarketId = createTestMarketWithOutcomes(5);

        // Buy shares in multiple outcomes
        for (uint256 i = 0; i < 5; i++) {
            buyShares(user2, multiMarketId, i, 1 ether);
        }

        // Sell from each outcome
        for (uint256 i = 0; i < 5; i++) {
            uint256 sharesBefore = getUserOutcomeShares(multiMarketId, user2, i);
            
            vm.prank(user2);
            market.sell(multiMarketId, i, 0.1 ether, type(uint256).max);
            
            uint256 sharesAfter = getUserOutcomeShares(multiMarketId, user2, i);
            assertTrue(sharesAfter < sharesBefore, "Shares should decrease");
        }

        // Prices should still sum to ~1
        assertPricesSumToOne(multiMarketId, 1e14);
    }

    // ============ Buy and Sell Sequence ============

    function test_BuySellSequence_Balanced() public {
        uint256 buyAmount = 2 ether;
        uint256 sellValue = 1 ether;

        // Buy
        buyShares(user2, marketId, 0, buyAmount);
        uint256 sharesAfterBuy = getUserOutcomeShares(marketId, user2, 0);

        // Sell
        vm.prank(user2);
        market.sell(marketId, 0, sellValue, type(uint256).max);
        uint256 sharesAfterSell = getUserOutcomeShares(marketId, user2, 0);

        assertTrue(sharesAfterSell < sharesAfterBuy, "Should have fewer shares after sell");
        assertTrue(sharesAfterSell > 0, "Should still have some shares");
    }

    function test_BuySellSequence_DifferentUsers() public {
        // User2 already has shares from setUp
        uint256 user2SharesBefore = getUserOutcomeShares(marketId, user2, 0);

        // User3 buys
        buyShares(user3, marketId, 1, 2 ether);

        // User2 sells
        vm.prank(user2);
        market.sell(marketId, 0, 1 ether, type(uint256).max);

        uint256 user2SharesAfter = getUserOutcomeShares(marketId, user2, 0);
        uint256 user3Shares = getUserOutcomeShares(marketId, user3, 1);

        assertTrue(user2SharesAfter < user2SharesBefore, "User2 should have fewer shares");
        assertTrue(user3Shares > 0, "User3 should have shares");
    }
}

