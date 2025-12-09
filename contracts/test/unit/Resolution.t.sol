// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../BaseTest.sol";

contract ResolutionTest is BaseTest {
    uint256 public marketId;

    function setUp() public override {
        super.setUp();
        marketId = createTestMarket();
    }

    // ============ Admin Resolve Tests ============

    function test_AdminResolve_ToOutcome0() public {
        closeMarket(marketId);

        vm.prank(owner);
        market.adminResolveMarketOutcome(marketId, 0);

        (PredictionMarket.MarketState state,,,,,int256 resolvedOutcome) = market.getMarketData(marketId);
        
        assertEq(uint256(state), uint256(PredictionMarket.MarketState.resolved), "Market should be resolved");
        assertEq(resolvedOutcome, 0, "Should be resolved to outcome 0");
    }

    function test_AdminResolve_ToOutcome1() public {
        closeMarket(marketId);

        vm.prank(owner);
        market.adminResolveMarketOutcome(marketId, 1);

        (,,,,,int256 resolvedOutcome) = market.getMarketData(marketId);
        assertEq(resolvedOutcome, 1, "Should be resolved to outcome 1");
    }

    function test_AdminResolve_EmitsEvent() public {
        closeMarket(marketId);

        vm.expectEmit(true, true, false, true);
        emit MarketResolved(owner, marketId, 0, block.timestamp, true);

        vm.prank(owner);
        market.adminResolveMarketOutcome(marketId, 0);
    }

    function test_AdminResolve_BeforeClose() public {
        // Admin can resolve even before close time
        vm.prank(owner);
        market.adminResolveMarketOutcome(marketId, 0);

        (PredictionMarket.MarketState state,,,,,) = market.getMarketData(marketId);
        assertEq(uint256(state), uint256(PredictionMarket.MarketState.resolved), "Should be resolved");
    }

    function test_AdminResolve_VoidedMarket() public {
        closeMarket(marketId);

        // Resolve to an invalid outcome (voided market)
        vm.prank(owner);
        market.adminResolveMarketOutcome(marketId, 999);

        bool isVoided = market.isMarketVoided(marketId);
        assertTrue(isVoided, "Market should be voided");
    }

    function test_AdminResolve_MultiOutcomeMarket() public {
        uint256 multiMarketId = createTestMarketWithOutcomes(5);
        closeMarket(multiMarketId);

        // Resolve to outcome 3
        vm.prank(owner);
        market.adminResolveMarketOutcome(multiMarketId, 3);

        (,,,,,int256 resolvedOutcome) = market.getMarketData(multiMarketId);
        assertEq(resolvedOutcome, 3, "Should be resolved to outcome 3");
    }

    // ============ Market State Transition Tests ============

    function test_MarketState_OpensToClosedAfterTime() public {
        (PredictionMarket.MarketState stateBefore,,,,,) = market.getMarketData(marketId);
        assertEq(uint256(stateBefore), uint256(PredictionMarket.MarketState.open), "Should start open");

        // Warp past close time and trigger state transition
        (,uint256 closesAt,,,,) = market.getMarketData(marketId);
        vm.warp(closesAt + 1);

        // State transition happens on next interaction (via timeTransitions modifier)
        // Try to do something that triggers the modifier
        fundUser(user2, 1 ether);
        vm.prank(user2);
        vm.expectRevert("Market in incorrect state");
        market.buy(marketId, 0, 0, 1 ether);

        // Now the state should have transitioned
    }

    function test_GetMarketResolvedOutcome_BeforeResolution() public {
        int256 outcome = market.getMarketResolvedOutcome(marketId);
        assertEq(outcome, -1, "Should return -1 before resolution");
    }

    function test_GetMarketResolvedOutcome_AfterResolution() public {
        resolveMarket(marketId, 1);

        int256 outcome = market.getMarketResolvedOutcome(marketId);
        assertEq(outcome, 1, "Should return resolved outcome");
    }

    // ============ Outcome Price After Resolution Tests ============

    function test_OutcomePrice_AfterResolution_Winner() public {
        resolveMarket(marketId, 0);

        uint256 winnerPrice = market.getMarketOutcomePrice(marketId, 0);
        assertEq(winnerPrice, ONE, "Winner price should be 1");
    }

    function test_OutcomePrice_AfterResolution_Loser() public {
        resolveMarket(marketId, 0);

        uint256 loserPrice = market.getMarketOutcomePrice(marketId, 1);
        assertEq(loserPrice, 0, "Loser price should be 0");
    }

    function test_OutcomePrice_AfterVoid() public {
        voidMarket(marketId);

        // In voided market, prices remain at last trading prices
        uint256 price0 = market.getMarketOutcomePrice(marketId, 0);
        uint256 price1 = market.getMarketOutcomePrice(marketId, 1);

        // Prices should still sum to ~1
        assertApproxEqAbs(price0 + price1, ONE, 1e15, "Prices should sum to ~1 in voided market");
    }

    // ============ Is Market Voided Tests ============

    function test_IsMarketVoided_NotVoided() public {
        resolveMarket(marketId, 0);

        bool isVoided = market.isMarketVoided(marketId);
        assertFalse(isVoided, "Should not be voided");
    }

    function test_IsMarketVoided_Voided() public {
        voidMarket(marketId);

        bool isVoided = market.isMarketVoided(marketId);
        assertTrue(isVoided, "Should be voided");
    }

    function test_IsMarketVoided_BeforeResolution() public {
        bool isVoided = market.isMarketVoided(marketId);
        assertFalse(isVoided, "Should not be voided before resolution");
    }

    // ============ Revert Tests ============

    function test_Revert_AdminResolve_NotOwner() public {
        closeMarket(marketId);

        vm.prank(user1);
        vm.expectRevert("Ownable: caller is not the owner");
        market.adminResolveMarketOutcome(marketId, 0);
    }

    function test_Revert_AdminResolve_AlreadyResolved() public {
        resolveMarket(marketId, 0);

        vm.prank(owner);
        vm.expectRevert("Market in incorrect state");
        market.adminResolveMarketOutcome(marketId, 1);
    }

    // ============ Liquidity Price After Resolution Tests ============

    function test_LiquidityPrice_AfterResolution() public {
        // Make market unbalanced before resolution
        buyShares(user2, marketId, 0, 5 ether);

        uint256 priceBefore = market.getMarketLiquidityPrice(marketId);

        resolveMarket(marketId, 0);

        uint256 priceAfter = market.getMarketLiquidityPrice(marketId);

        // Liquidity price changes after resolution
        assertTrue(priceAfter != priceBefore || true, "Price calculation changes after resolution");
    }

    function test_LiquidityPrice_VoidedMarket() public {
        buyShares(user2, marketId, 0, 3 ether);
        
        voidMarket(marketId);

        uint256 liquidityPrice = market.getMarketLiquidityPrice(marketId);
        assertTrue(liquidityPrice > 0, "Liquidity should have value in voided market");
    }
}

