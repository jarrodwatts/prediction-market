// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../BaseTest.sol";

contract PredictionMarketFuzzTest is BaseTest {
    uint256 public marketId;
    uint256 public feeMarketId;

    function setUp() public override {
        super.setUp();
        marketId = createTestMarket();
        feeMarketId = createTestMarketWithFees(2 * 10 ** 16, 1 * 10 ** 16, 1 * 10 ** 16);
    }

    // ============ Buy Fuzz Tests ============

    function testFuzz_Buy(uint256 amount) public {
        // Bound to reasonable range
        amount = bound(amount, 0.01 ether, 100 ether);
        
        fundUser(user2, amount);
        
        uint256 expectedShares = market.calcBuyAmount(amount, marketId, 0);
        
        vm.prank(user2);
        market.buy(marketId, 0, 0, amount);
        
        uint256 actualShares = getUserOutcomeShares(marketId, user2, 0);
        assertEq(actualShares, expectedShares, "Shares should match calculated");
    }

    function testFuzz_Buy_Outcome(uint256 amount, uint256 outcomeId) public {
        amount = bound(amount, 0.01 ether, 50 ether);
        outcomeId = bound(outcomeId, 0, 1);
        
        fundUser(user2, amount);
        
        vm.prank(user2);
        market.buy(marketId, outcomeId, 0, amount);
        
        uint256 shares = getUserOutcomeShares(marketId, user2, outcomeId);
        assertTrue(shares > 0, "Should have some shares");
    }

    function testFuzz_Buy_MultipleTimes(uint256 amount1, uint256 amount2) public {
        amount1 = bound(amount1, 0.01 ether, 50 ether);
        amount2 = bound(amount2, 0.01 ether, 50 ether);
        
        // First buy
        fundUser(user2, amount1);
        vm.prank(user2);
        market.buy(marketId, 0, 0, amount1);
        uint256 shares1 = getUserOutcomeShares(marketId, user2, 0);
        
        // Second buy
        uint256 expectedShares2 = market.calcBuyAmount(amount2, marketId, 0);
        fundUser(user2, amount2);
        vm.prank(user2);
        market.buy(marketId, 0, 0, amount2);
        uint256 sharesTotal = getUserOutcomeShares(marketId, user2, 0);
        
        assertEq(sharesTotal, shares1 + expectedShares2, "Shares should accumulate");
    }

    // ============ Sell Fuzz Tests ============

    function testFuzz_Sell(uint256 buyAmount, uint256 sellFraction) public {
        buyAmount = bound(buyAmount, 1 ether, 50 ether);
        sellFraction = bound(sellFraction, 1, 80); // Sell 1-80% of value
        
        // Buy first
        fundUser(user2, buyAmount);
        vm.prank(user2);
        market.buy(marketId, 0, 0, buyAmount);
        
        // Calculate sell amount
        uint256 sellValue = (buyAmount * sellFraction) / 100;
        if (sellValue == 0) sellValue = 0.001 ether;
        
        uint256 sharesBefore = getUserOutcomeShares(marketId, user2, 0);
        uint256 sharesToSell = market.calcSellAmount(sellValue, marketId, 0);
        
        // Only sell if we have enough shares
        if (sharesToSell <= sharesBefore) {
            vm.prank(user2);
            market.sell(marketId, 0, sellValue, type(uint256).max);
            
            uint256 sharesAfter = getUserOutcomeShares(marketId, user2, 0);
            assertEq(sharesBefore - sharesAfter, sharesToSell, "Should sell calculated shares");
        }
    }

    // ============ Liquidity Fuzz Tests ============

    function testFuzz_AddLiquidity(uint256 amount) public {
        amount = bound(amount, 0.01 ether, 100 ether);
        
        fundUser(user2, amount);
        
        uint256 liquidityBefore = getUserLiquidityShares(marketId, user2);
        
        vm.prank(user2);
        market.addLiquidity(marketId, amount);
        
        uint256 liquidityAfter = getUserLiquidityShares(marketId, user2);
        assertTrue(liquidityAfter > liquidityBefore, "Liquidity should increase");
    }

    function testFuzz_RemoveLiquidity(uint256 removePercent) public {
        removePercent = bound(removePercent, 1, 99); // 1-99%
        
        uint256 liquidity = getUserLiquidityShares(marketId, user1);
        uint256 removeAmount = (liquidity * removePercent) / 100;
        
        if (removeAmount > 0 && removeAmount < liquidity) {
            uint256 balanceBefore = token.balanceOf(user1);
            
            vm.prank(user1);
            market.removeLiquidity(marketId, removeAmount);
            
            uint256 balanceAfter = token.balanceOf(user1);
            assertTrue(balanceAfter > balanceBefore, "Should receive tokens");
        }
    }

    function testFuzz_LiquidityOperations(uint256 addAmount, uint256 removePercent) public {
        addAmount = bound(addAmount, 0.1 ether, 50 ether);
        removePercent = bound(removePercent, 1, 50);
        
        // Add liquidity
        fundUser(user2, addAmount);
        vm.prank(user2);
        market.addLiquidity(marketId, addAmount);
        
        // Remove portion
        uint256 liquidity = getUserLiquidityShares(marketId, user2);
        uint256 removeAmount = (liquidity * removePercent) / 100;
        
        if (removeAmount > 0) {
            // Check total market liquidity to ensure we're not removing all
            (,,uint256 totalLiquidity,,,) = market.getMarketData(marketId);
            if (removeAmount < totalLiquidity) {
                vm.prank(user2);
                market.removeLiquidity(marketId, removeAmount);
            }
        }
    }

    // ============ Price Invariant Fuzz Tests ============

    function testFuzz_PricesSumToOne(uint256 buyAmount) public {
        buyAmount = bound(buyAmount, 0.1 ether, 100 ether);
        
        fundUser(user2, buyAmount);
        vm.prank(user2);
        market.buy(marketId, 0, 0, buyAmount);
        
        // Prices should still sum to ~1
        assertPricesSumToOne(marketId, 1e14);
    }

    function testFuzz_PricesSumToOne_MultipleTrades(uint256 amount1, uint256 amount2, bool outcome1, bool outcome2) public {
        amount1 = bound(amount1, 0.1 ether, 30 ether);
        amount2 = bound(amount2, 0.1 ether, 30 ether);
        
        // Trade 1
        fundUser(user2, amount1);
        vm.prank(user2);
        market.buy(marketId, outcome1 ? 1 : 0, 0, amount1);
        
        // Trade 2
        fundUser(user3, amount2);
        vm.prank(user3);
        market.buy(marketId, outcome2 ? 1 : 0, 0, amount2);
        
        assertPricesSumToOne(marketId, 1e14);
    }

    // ============ CalcBuyAmount Accuracy Tests ============

    function testFuzz_CalcBuyAmount_Accuracy(uint256 amount) public {
        amount = bound(amount, 0.01 ether, 100 ether);
        
        uint256 expectedShares = market.calcBuyAmount(amount, marketId, 0);
        
        fundUser(user2, amount);
        vm.prank(user2);
        market.buy(marketId, 0, 0, amount);
        
        uint256 actualShares = getUserOutcomeShares(marketId, user2, 0);
        assertEq(actualShares, expectedShares, "CalcBuyAmount should be accurate");
    }

    function testFuzz_CalcSellAmount_Accuracy(uint256 buyAmount) public {
        buyAmount = bound(buyAmount, 1 ether, 50 ether);
        
        // Buy first
        fundUser(user2, buyAmount);
        vm.prank(user2);
        market.buy(marketId, 0, 0, buyAmount);
        
        // Calculate sell for half the buy value (safe amount)
        uint256 sellValue = buyAmount / 4;
        uint256 expectedSharesToSell = market.calcSellAmount(sellValue, marketId, 0);
        
        uint256 sharesBefore = getUserOutcomeShares(marketId, user2, 0);
        
        if (expectedSharesToSell <= sharesBefore) {
            vm.prank(user2);
            market.sell(marketId, 0, sellValue, type(uint256).max);
            
            uint256 sharesAfter = getUserOutcomeShares(marketId, user2, 0);
            assertEq(sharesBefore - sharesAfter, expectedSharesToSell, "CalcSellAmount should be accurate");
        }
    }

    // ============ Fee Calculation Fuzz Tests ============

    function testFuzz_BuyFees(uint256 amount) public {
        amount = bound(amount, 0.1 ether, 50 ether);
        
        uint256 treasuryBefore = token.balanceOf(treasury);
        uint256 distributorBefore = token.balanceOf(distributor);
        
        fundUser(user2, amount);
        vm.prank(user2);
        market.buy(feeMarketId, 0, 0, amount);
        
        uint256 treasuryAfter = token.balanceOf(treasury);
        uint256 distributorAfter = token.balanceOf(distributor);
        
        // Treasury gets 1% of amount
        uint256 expectedTreasuryFee = (amount * 1 * 10 ** 16) / ONE;
        // Distributor gets 1% of amount
        uint256 expectedDistributorFee = (amount * 1 * 10 ** 16) / ONE;
        
        assertEq(treasuryAfter - treasuryBefore, expectedTreasuryFee, "Treasury fee incorrect");
        assertEq(distributorAfter - distributorBefore, expectedDistributorFee, "Distributor fee incorrect");
    }

    // ============ Multi-Outcome Fuzz Tests ============

    function testFuzz_MultiOutcome_Buy(uint256 amount, uint256 outcomeId) public {
        uint256 multiMarketId = createTestMarketWithOutcomes(5);
        
        amount = bound(amount, 0.1 ether, 30 ether);
        outcomeId = bound(outcomeId, 0, 4);
        
        fundUser(user2, amount);
        vm.prank(user2);
        market.buy(multiMarketId, outcomeId, 0, amount);
        
        uint256 shares = getUserOutcomeShares(multiMarketId, user2, outcomeId);
        assertTrue(shares > 0, "Should have shares");
        
        // Prices should sum to ~1
        (,uint256[] memory prices) = market.getMarketPrices(multiMarketId);
        uint256 sum = 0;
        for (uint256 i = 0; i < prices.length; i++) {
            sum += prices[i];
        }
        assertApproxEqAbs(sum, ONE, 1e14, "Prices should sum to ~1");
    }

    // ============ Market Creation Fuzz Tests ============

    function testFuzz_CreateMarket_Outcomes(uint256 outcomes) public {
        outcomes = bound(outcomes, 1, 32);
        
        uint256[] memory distribution = new uint256[](outcomes);
        for (uint256 i = 0; i < outcomes; i++) {
            distribution[i] = 100;
        }
        
        fundUser(user2, DEFAULT_MARKET_VALUE);
        
        PredictionMarket.CreateMarketDescription memory desc = PredictionMarket.CreateMarketDescription({
            value: DEFAULT_MARKET_VALUE,
            closesAt: uint32(block.timestamp + 1 days),
            outcomes: outcomes,
            token: IERC20(address(token)),
            distribution: distribution,
            question: "Test",
            image: "",
            buyFees: PredictionMarket.Fees(0, 0, 0),
            sellFees: PredictionMarket.Fees(0, 0, 0),
            treasury: treasury,
            distributor: distributor
        });
        
        vm.prank(user2);
        uint256 newMarketId = market.createMarket(desc);
        
        uint256[] memory outcomeIds = market.getMarketOutcomeIds(newMarketId);
        assertEq(outcomeIds.length, outcomes, "Should have correct outcome count");
    }

    function testFuzz_CreateMarket_Fees(uint256 fee1, uint256 fee2, uint256 fee3) public {
        fee1 = bound(fee1, 0, MAX_FEE);
        fee2 = bound(fee2, 0, MAX_FEE);
        fee3 = bound(fee3, 0, MAX_FEE);
        
        fundUser(user2, DEFAULT_MARKET_VALUE);
        
        uint256[] memory distribution = new uint256[](2);
        distribution[0] = 50;
        distribution[1] = 50;
        
        PredictionMarket.CreateMarketDescription memory desc = PredictionMarket.CreateMarketDescription({
            value: DEFAULT_MARKET_VALUE,
            closesAt: uint32(block.timestamp + 1 days),
            outcomes: 2,
            token: IERC20(address(token)),
            distribution: distribution,
            question: "Test",
            image: "",
            buyFees: PredictionMarket.Fees(fee1, fee2, fee3),
            sellFees: PredictionMarket.Fees(fee1, fee2, fee3),
            treasury: treasury,
            distributor: distributor
        });
        
        vm.prank(user2);
        uint256 newMarketId = market.createMarket(desc);
        
        uint256 totalFee = market.getMarketBuyFee(newMarketId);
        assertEq(totalFee, fee1 + fee2 + fee3, "Total fee should match");
    }

    // ============ Claim Fuzz Tests ============

    function testFuzz_ClaimWinnings(uint256 buyAmount) public {
        buyAmount = bound(buyAmount, 0.1 ether, 50 ether);
        
        fundUser(user2, buyAmount);
        vm.prank(user2);
        market.buy(marketId, 0, 0, buyAmount);
        
        uint256 userShares = getUserOutcomeShares(marketId, user2, 0);
        
        resolveMarket(marketId, 0);
        
        uint256 balanceBefore = token.balanceOf(user2);
        
        vm.prank(user2);
        market.claimWinnings(marketId);
        
        uint256 balanceAfter = token.balanceOf(user2);
        assertEq(balanceAfter - balanceBefore, userShares, "Should receive 1:1");
    }

    // ============ Edge Cases ============

    function testFuzz_SmallAmounts(uint256 amount) public {
        amount = bound(amount, 1e12, 1e16); // Very small amounts
        
        uint256 expectedShares = market.calcBuyAmount(amount, marketId, 0);
        
        if (expectedShares > 0) {
            fundUser(user2, amount);
            vm.prank(user2);
            market.buy(marketId, 0, 0, amount);
            
            uint256 actualShares = getUserOutcomeShares(marketId, user2, 0);
            assertEq(actualShares, expectedShares, "Small amounts should work");
        }
    }

    function testFuzz_LargeAmounts(uint256 amount) public {
        amount = bound(amount, 100 ether, 1000 ether);
        
        fundUser(user2, amount);
        
        uint256 expectedShares = market.calcBuyAmount(amount, marketId, 0);
        
        vm.prank(user2);
        market.buy(marketId, 0, 0, amount);
        
        uint256 actualShares = getUserOutcomeShares(marketId, user2, 0);
        assertEq(actualShares, expectedShares, "Large amounts should work");
        
        // Prices should still be valid
        assertPricesSumToOne(marketId, 1e13);
    }
}

