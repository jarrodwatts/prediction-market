// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../BaseTest.sol";

contract GettersTest is BaseTest {
    uint256 public marketId;

    function setUp() public override {
        super.setUp();
        marketId = createTestMarket();
    }

    // ============ Market Data Tests ============

    function test_GetMarketData() public view {
        (
            PredictionMarket.MarketState state,
            uint256 closesAt,
            uint256 liquidity,
            uint256 balance,
            uint256 sharesAvailable,
            int256 resolvedOutcome
        ) = market.getMarketData(marketId);

        assertEq(uint256(state), uint256(PredictionMarket.MarketState.open), "State should be open");
        assertTrue(closesAt > block.timestamp, "Close date should be in future");
        assertEq(liquidity, DEFAULT_MARKET_VALUE, "Liquidity should match initial");
        assertEq(balance, DEFAULT_MARKET_VALUE, "Balance should match initial");
        assertTrue(sharesAvailable > 0, "Should have available shares");
        assertEq(resolvedOutcome, -1, "Should not be resolved");
    }

    function test_GetMarketAltData() public view {
        (
            uint256 buyFee,
            bytes32 questionId,
            uint256 questionIdUint,
            address tokenAddr,
            uint256 buyTreasuryFee,
            address treasuryAddr,
            address realitio,
            uint256 realitioTimeout,
            address manager
        ) = market.getMarketAltData(marketId);

        assertEq(buyFee, 0, "Buy fee should be 0");
        assertEq(questionId, bytes32(0), "Question ID should be 0");
        assertEq(tokenAddr, address(token), "Token should match");
        assertEq(treasuryAddr, treasury, "Treasury should match");
    }

    function test_GetMarketCreator() public view {
        address creator = market.getMarketCreator(marketId);
        assertEq(creator, user1, "Creator should be user1");
    }

    function test_GetMarkets() public {
        // Create more markets
        createTestMarket();
        createTestMarket();

        uint256[] memory marketIds = market.getMarkets();
        assertEq(marketIds.length, 3, "Should have 3 markets");
    }

    function test_MarketIndex() public view {
        uint256 index = market.marketIndex();
        assertEq(index, 1, "Should have 1 market");
    }

    // ============ Price Tests ============

    function test_GetMarketPrices() public view {
        (uint256 liquidityPrice, uint256[] memory outcomePrices) = market.getMarketPrices(marketId);

        assertTrue(liquidityPrice > 0, "Liquidity price should be positive");
        assertEq(outcomePrices.length, 2, "Should have 2 outcome prices");
        
        // In balanced market, prices should be ~0.5 each
        assertApproxEqAbs(outcomePrices[0], ONE / 2, 1e15, "Price 0 should be ~0.5");
        assertApproxEqAbs(outcomePrices[1], ONE / 2, 1e15, "Price 1 should be ~0.5");
    }

    function test_GetMarketOutcomePrice() public view {
        uint256 price0 = market.getMarketOutcomePrice(marketId, 0);
        uint256 price1 = market.getMarketOutcomePrice(marketId, 1);

        assertApproxEqAbs(price0, ONE / 2, 1e15, "Price 0 should be ~0.5");
        assertApproxEqAbs(price1, ONE / 2, 1e15, "Price 1 should be ~0.5");
    }

    function test_GetMarketLiquidityPrice() public view {
        uint256 liquidityPrice = market.getMarketLiquidityPrice(marketId);
        
        // In balanced 2-outcome market, liquidity price should be ~1
        assertApproxEqAbs(liquidityPrice, ONE, 1e15, "Liquidity price should be ~1");
    }

    // ============ Shares Tests ============

    function test_GetMarketShares() public view {
        (uint256 liquidity, uint256[] memory outcomeShares) = market.getMarketShares(marketId);

        assertEq(liquidity, DEFAULT_MARKET_VALUE, "Liquidity should match");
        assertEq(outcomeShares.length, 2, "Should have 2 outcomes");
        assertTrue(outcomeShares[0] > 0, "Should have outcome 0 shares");
        assertTrue(outcomeShares[1] > 0, "Should have outcome 1 shares");
    }

    function test_GetMarketOutcomesShares() public view {
        uint256[] memory shares = market.getMarketOutcomesShares(marketId);

        assertEq(shares.length, 2, "Should have 2 outcomes");
        assertTrue(shares[0] > 0, "Should have shares");
    }

    function test_GetMarketOutcomeIds() public view {
        uint256[] memory outcomeIds = market.getMarketOutcomeIds(marketId);

        assertEq(outcomeIds.length, 2, "Should have 2 outcomes");
        assertEq(outcomeIds[0], 0, "First outcome ID should be 0");
        assertEq(outcomeIds[1], 1, "Second outcome ID should be 1");
    }

    function test_GetMarketOutcomeData() public view {
        (uint256 price, uint256 available, uint256 total) = market.getMarketOutcomeData(marketId, 0);

        assertTrue(price > 0, "Price should be positive");
        assertTrue(available > 0, "Available should be positive");
        assertTrue(total > 0, "Total should be positive");
        assertTrue(total >= available, "Total should be >= available");
    }

    // ============ User Data Tests ============

    function test_GetUserMarketShares() public {
        // Buy some shares
        buyShares(user2, marketId, 0, 1 ether);

        (uint256 liquidityShares, uint256[] memory outcomeShares) = market.getUserMarketShares(marketId, user2);

        assertEq(liquidityShares, 0, "User2 should have no liquidity");
        assertEq(outcomeShares.length, 2, "Should have 2 outcomes");
        assertTrue(outcomeShares[0] > 0, "Should have outcome 0 shares");
        assertEq(outcomeShares[1], 0, "Should have no outcome 1 shares");
    }

    function test_GetUserClaimStatus() public {
        buyShares(user2, marketId, 0, 1 ether);

        (
            bool winningsToClaim,
            bool winningsClaimed,
            bool liquidityToClaim,
            bool liquidityClaimed,
            uint256 claimableFees
        ) = market.getUserClaimStatus(marketId, user2);

        // Before resolution
        assertFalse(winningsToClaim, "No winnings before resolution");
        assertFalse(winningsClaimed, "Nothing claimed");
        assertFalse(liquidityToClaim, "No liquidity for non-LP");
        assertFalse(liquidityClaimed, "Nothing claimed");
        assertEq(claimableFees, 0, "No fees in no-fee market");
    }

    function test_GetUserLiquidityPoolShare() public view {
        uint256 share = market.getUserLiquidityPoolShare(marketId, user1);
        assertEq(share, ONE, "Creator should have 100% share");
    }

    function test_GetUserClaimableFees() public {
        // Create market with fees
        uint256 feeMarketId = createTestMarketWithFees(2 * 10 ** 16, 0, 0);
        
        // Generate fees
        buyShares(user2, feeMarketId, 0, 5 ether);

        uint256 claimableFees = market.getUserClaimableFees(feeMarketId, user1);
        assertTrue(claimableFees > 0, "Should have claimable fees");
    }

    // ============ Fee Tests ============

    function test_GetMarketFee() public view {
        uint256 fee = market.getMarketFee(marketId);
        assertEq(fee, 0, "Fee should be 0");
    }

    function test_GetMarketBuyFee() public view {
        uint256 buyFee = market.getMarketBuyFee(marketId);
        assertEq(buyFee, 0, "Buy fee should be 0");
    }

    function test_GetMarketSellFee() public view {
        uint256 sellFee = market.getMarketSellFee(marketId);
        assertEq(sellFee, 0, "Sell fee should be 0");
    }

    function test_GetMarketFees() public view {
        (
            PredictionMarket.Fees memory buyFees,
            PredictionMarket.Fees memory sellFees,
            address marketTreasury,
            address marketDistributor
        ) = market.getMarketFees(marketId);

        assertEq(buyFees.fee, 0, "Buy fee should be 0");
        assertEq(sellFees.fee, 0, "Sell fee should be 0");
        assertEq(marketTreasury, treasury, "Treasury should match");
        assertEq(marketDistributor, distributor, "Distributor should match");
    }

    function test_GetMarketFees_WithFees() public {
        uint256 feeMarketId = createTestMarketWithFees(1e16, 2e16, 1e16);

        (
            PredictionMarket.Fees memory buyFees,
            PredictionMarket.Fees memory sellFees,
            ,
        ) = market.getMarketFees(feeMarketId);

        assertEq(buyFees.fee, 1e16, "Pool fee should be 1%");
        assertEq(buyFees.treasuryFee, 2e16, "Treasury fee should be 2%");
        assertEq(buyFees.distributorFee, 1e16, "Distributor fee should be 1%");
    }

    // ============ State Tests ============

    function test_GetMarketPaused() public {
        bool paused = market.getMarketPaused(marketId);
        assertFalse(paused, "Should not be paused initially");

        vm.prank(owner);
        market.adminPauseMarket(marketId);

        paused = market.getMarketPaused(marketId);
        assertTrue(paused, "Should be paused");
    }

    function test_GetMarketResolvedOutcome() public {
        int256 outcome = market.getMarketResolvedOutcome(marketId);
        assertEq(outcome, -1, "Should be -1 before resolution");

        resolveMarket(marketId, 1);

        outcome = market.getMarketResolvedOutcome(marketId);
        assertEq(outcome, 1, "Should be 1 after resolution");
    }

    function test_IsMarketVoided() public {
        bool voided = market.isMarketVoided(marketId);
        assertFalse(voided, "Should not be voided");

        voidMarket(marketId);

        voided = market.isMarketVoided(marketId);
        assertTrue(voided, "Should be voided");
    }

    // ============ Constants Tests ============

    function test_MaxOutcomes() public view {
        uint256 maxOutcomes = market.MAX_OUTCOMES();
        assertEq(maxOutcomes, 32, "Max outcomes should be 32");
    }

    function test_MaxFee() public view {
        uint256 maxFee = market.MAX_FEE();
        assertEq(maxFee, 5 * 10 ** 16, "Max fee should be 5%");
    }

    function test_WETH() public view {
        address wethAddr = address(market.WETH());
        assertEq(wethAddr, address(weth), "WETH should match");
    }

    // ============ Calculation Tests ============

    function test_CalcBuyAmount() public view {
        uint256 shares = market.calcBuyAmount(1 ether, marketId, 0);
        assertTrue(shares > 0, "Should calculate some shares");
    }

    function test_CalcSellAmount() public {
        buyShares(user2, marketId, 0, 5 ether);

        uint256 shares = market.calcSellAmount(1 ether, marketId, 0);
        assertTrue(shares > 0, "Should calculate some shares needed");
    }

    // ============ Multi-Outcome Tests ============

    function test_GetMarketOutcomeIds_MultiOutcome() public {
        uint256 multiMarketId = createTestMarketWithOutcomes(5);

        uint256[] memory outcomeIds = market.getMarketOutcomeIds(multiMarketId);
        assertEq(outcomeIds.length, 5, "Should have 5 outcomes");
        
        for (uint256 i = 0; i < 5; i++) {
            assertEq(outcomeIds[i], i, "Outcome ID should match index");
        }
    }

    function test_GetMarketPrices_MultiOutcome() public {
        uint256 multiMarketId = createTestMarketWithOutcomes(5);

        (uint256 liquidityPrice, uint256[] memory outcomePrices) = market.getMarketPrices(multiMarketId);

        assertEq(outcomePrices.length, 5, "Should have 5 prices");
        
        // Each outcome should have ~20% probability
        for (uint256 i = 0; i < 5; i++) {
            assertApproxEqAbs(outcomePrices[i], ONE / 5, 1e15, "Price should be ~20%");
        }
    }

    // ============ After Trading Tests ============

    function test_GetMarketData_AfterTrading() public {
        // Do some trading
        buyShares(user2, marketId, 0, 3 ether);
        buyShares(user3, marketId, 1, 2 ether);

        (,, uint256 liquidity, uint256 balance,,) = market.getMarketData(marketId);

        // Balance should have increased
        assertTrue(balance > DEFAULT_MARKET_VALUE, "Balance should increase");
        // Liquidity stays the same until add/remove
        assertEq(liquidity, DEFAULT_MARKET_VALUE, "Liquidity unchanged by trading");
    }

    function test_GetMarketPrices_AfterTrading() public {
        // Make market unbalanced
        buyShares(user2, marketId, 0, 5 ether);

        (uint256 liquidityPrice, uint256[] memory prices) = market.getMarketPrices(marketId);

        // Outcome 0 should be more expensive now
        assertTrue(prices[0] > prices[1], "Bought outcome should be more expensive");
        
        // Prices should still sum to ~1
        assertApproxEqAbs(prices[0] + prices[1], ONE, 1e15, "Prices should sum to ~1");
    }
}

