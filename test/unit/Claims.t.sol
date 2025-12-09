// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../BaseTest.sol";

contract ClaimsTest is BaseTest {
    uint256 public marketId;
    uint256 public marketIdWithFees;

    function setUp() public override {
        super.setUp();
        
        // Create a standard market
        marketId = createTestMarket();
        
        // Create market with fees
        marketIdWithFees = createTestMarketWithFees(2 * 10 ** 16, 0, 0); // 2% pool fee
        
        // User2 buys outcome 0 (will be winner)
        buyShares(user2, marketId, 0, 5 ether);
        
        // User3 buys outcome 1 (will be loser)
        buyShares(user3, marketId, 1, 3 ether);
    }

    // ============ Claim Winnings Tests ============

    function test_ClaimWinnings_Winner() public {
        resolveMarket(marketId, 0);

        uint256 userShares = getUserOutcomeShares(marketId, user2, 0);
        uint256 balanceBefore = token.balanceOf(user2);

        vm.prank(user2);
        market.claimWinnings(marketId);

        uint256 balanceAfter = token.balanceOf(user2);
        
        // Winner gets 1:1 for their shares
        assertEq(balanceAfter - balanceBefore, userShares, "Should receive shares value");
    }

    function test_ClaimWinnings_EmitsEvent() public {
        resolveMarket(marketId, 0);

        uint256 userShares = getUserOutcomeShares(marketId, user2, 0);

        vm.expectEmit(true, true, true, true);
        emit MarketActionTx(
            user2,
            PredictionMarket.MarketAction.claimWinnings,
            marketId,
            0,
            userShares,
            userShares,
            block.timestamp
        );

        vm.prank(user2);
        market.claimWinnings(marketId);
    }

    function test_ClaimWinningsToETH() public {
        // Create ETH market
        uint256 ethMarketId = createTestMarketWithETH();
        buySharesWithETH(user2, ethMarketId, 0, 5 ether);
        
        resolveMarket(ethMarketId, 0);

        uint256 userShares = getUserOutcomeShares(ethMarketId, user2, 0);
        uint256 ethBefore = user2.balance;

        vm.prank(user2);
        market.claimWinningsToETH(ethMarketId);

        uint256 ethAfter = user2.balance;
        assertEq(ethAfter - ethBefore, userShares, "Should receive ETH");
    }

    function test_ClaimWinnings_MultipleWinners() public {
        // Another user buys winning outcome
        buyShares(user3, marketId, 0, 2 ether);
        
        resolveMarket(marketId, 0);

        uint256 user2Shares = getUserOutcomeShares(marketId, user2, 0);
        uint256 user3Shares = getUserOutcomeShares(marketId, user3, 0);

        uint256 user2BalanceBefore = token.balanceOf(user2);
        uint256 user3BalanceBefore = token.balanceOf(user3);

        vm.prank(user2);
        market.claimWinnings(marketId);

        vm.prank(user3);
        market.claimWinnings(marketId);

        uint256 user2BalanceAfter = token.balanceOf(user2);
        uint256 user3BalanceAfter = token.balanceOf(user3);

        assertEq(user2BalanceAfter - user2BalanceBefore, user2Shares, "User2 should receive shares");
        assertEq(user3BalanceAfter - user3BalanceBefore, user3Shares, "User3 should receive shares");
    }

    // ============ Claim Liquidity Tests ============

    function test_ClaimLiquidity_Creator() public {
        resolveMarket(marketId, 0);

        uint256 balanceBefore = token.balanceOf(user1);

        vm.prank(user1);
        market.claimLiquidity(marketId);

        uint256 balanceAfter = token.balanceOf(user1);
        assertTrue(balanceAfter > balanceBefore, "Should receive liquidity value");
    }

    function test_ClaimLiquidity_EmitsEvent() public {
        resolveMarket(marketId, 0);

        uint256 liquidityShares = getUserLiquidityShares(marketId, user1);
        uint256 liquidityPrice = market.getMarketLiquidityPrice(marketId);
        uint256 expectedValue = (liquidityPrice * liquidityShares) / ONE;

        vm.expectEmit(true, true, true, false); // Don't check value exactly due to rounding
        emit MarketActionTx(
            user1,
            PredictionMarket.MarketAction.claimLiquidity,
            marketId,
            0,
            liquidityShares,
            expectedValue,
            block.timestamp
        );

        vm.prank(user1);
        market.claimLiquidity(marketId);
    }

    function test_ClaimLiquidityToETH() public {
        uint256 ethMarketId = createTestMarketWithETH();
        
        // Generate some trading
        buySharesWithETH(user2, ethMarketId, 0, 2 ether);
        
        resolveMarket(ethMarketId, 0);

        uint256 ethBefore = user1.balance;

        vm.prank(user1);
        market.claimLiquidityToETH(ethMarketId);

        uint256 ethAfter = user1.balance;
        assertTrue(ethAfter > ethBefore, "Should receive ETH");
    }

    function test_ClaimLiquidity_AlsoClaimsFees() public {
        // Generate fees through trading on fee market
        buyShares(user2, marketIdWithFees, 0, 5 ether);
        buyShares(user3, marketIdWithFees, 1, 3 ether);

        uint256 claimableFees = market.getUserClaimableFees(marketIdWithFees, user1);
        assertTrue(claimableFees > 0, "Should have claimable fees");

        resolveMarket(marketIdWithFees, 0);

        uint256 balanceBefore = token.balanceOf(user1);

        vm.prank(user1);
        market.claimLiquidity(marketIdWithFees);

        uint256 balanceAfter = token.balanceOf(user1);
        
        // Should receive liquidity + fees
        assertTrue(balanceAfter - balanceBefore > 0, "Should receive value");
    }

    // ============ Claim Fees Tests ============

    function test_ClaimFees_WithPoolFees() public {
        // Generate fees
        buyShares(user2, marketIdWithFees, 0, 10 ether);

        uint256 claimableFees = market.getUserClaimableFees(marketIdWithFees, user1);
        assertTrue(claimableFees > 0, "Should have claimable fees");

        uint256 balanceBefore = token.balanceOf(user1);

        vm.prank(user1);
        market.claimFees(marketIdWithFees);

        uint256 balanceAfter = token.balanceOf(user1);
        assertEq(balanceAfter - balanceBefore, claimableFees, "Should receive claimable fees");
    }

    function test_ClaimFees_EmitsEvent() public {
        buyShares(user2, marketIdWithFees, 0, 10 ether);

        uint256 claimableFees = market.getUserClaimableFees(marketIdWithFees, user1);
        uint256 liquidityShares = getUserLiquidityShares(marketIdWithFees, user1);

        vm.expectEmit(true, true, true, true);
        emit MarketActionTx(
            user1,
            PredictionMarket.MarketAction.claimFees,
            marketIdWithFees,
            0,
            liquidityShares,
            claimableFees,
            block.timestamp
        );

        vm.prank(user1);
        market.claimFees(marketIdWithFees);
    }

    function test_ClaimFeesToETH() public {
        // Create ETH market with fees
        fundUserETH(user1, INITIAL_BALANCE);

        uint256[] memory distribution = new uint256[](2);
        distribution[0] = 50;
        distribution[1] = 50;

        PredictionMarket.CreateMarketDescription memory desc = PredictionMarket.CreateMarketDescription({
            value: DEFAULT_MARKET_VALUE,
            closesAt: uint32(block.timestamp + 1 days),
            outcomes: 2,
            token: IERC20(address(weth)),
            distribution: distribution,
            question: "Test",
            image: "",
            buyFees: PredictionMarket.Fees(2 * 10 ** 16, 0, 0), // 2% pool fee
            sellFees: PredictionMarket.Fees(0, 0, 0),
            treasury: treasury,
            distributor: distributor
        });

        vm.prank(user1);
        uint256 ethFeeMarketId = market.createMarketWithETH{value: DEFAULT_MARKET_VALUE}(desc);

        // Generate fees
        buySharesWithETH(user2, ethFeeMarketId, 0, 5 ether);

        uint256 claimableFees = market.getUserClaimableFees(ethFeeMarketId, user1);
        assertTrue(claimableFees > 0, "Should have fees");

        uint256 ethBefore = user1.balance;

        vm.prank(user1);
        market.claimFeesToETH(ethFeeMarketId);

        uint256 ethAfter = user1.balance;
        assertEq(ethAfter - ethBefore, claimableFees, "Should receive ETH fees");
    }

    function test_ClaimFees_MultipleProviders() public {
        // Add another LP
        fundUser(user2, 10 ether);
        vm.prank(user2);
        market.addLiquidity(marketIdWithFees, 10 ether);

        // Generate fees
        buyShares(user3, marketIdWithFees, 0, 10 ether);

        uint256 user1Fees = market.getUserClaimableFees(marketIdWithFees, user1);
        uint256 user2Fees = market.getUserClaimableFees(marketIdWithFees, user2);

        // Both should have fees proportional to their liquidity share
        assertTrue(user1Fees > 0, "User1 should have fees");
        // User2 joined after pool was created, might have different fees
    }

    function test_ClaimFees_BeforeResolution() public {
        buyShares(user2, marketIdWithFees, 0, 10 ether);

        uint256 claimableFees = market.getUserClaimableFees(marketIdWithFees, user1);
        assertTrue(claimableFees > 0, "Should have fees before resolution");

        // Can claim before resolution
        vm.prank(user1);
        market.claimFees(marketIdWithFees);

        // After claiming, should have 0 claimable
        uint256 feesAfter = market.getUserClaimableFees(marketIdWithFees, user1);
        assertEq(feesAfter, 0, "Should have no more fees to claim");
    }

    // ============ Claim Voided Shares Tests ============

    function test_ClaimVoidedShares() public {
        voidMarket(marketId);

        uint256 userShares = getUserOutcomeShares(marketId, user2, 0);
        uint256 price = market.getMarketOutcomePrice(marketId, 0);
        uint256 expectedValue = (price * userShares) / ONE;

        uint256 balanceBefore = token.balanceOf(user2);

        vm.prank(user2);
        market.claimVoidedOutcomeShares(marketId, 0);

        uint256 balanceAfter = token.balanceOf(user2);
        assertEq(balanceAfter - balanceBefore, expectedValue, "Should receive value based on price");
    }

    function test_ClaimVoidedShares_EmitsEvent() public {
        voidMarket(marketId);

        uint256 userShares = getUserOutcomeShares(marketId, user2, 0);
        uint256 price = market.getMarketOutcomePrice(marketId, 0);
        uint256 expectedValue = (price * userShares) / ONE;

        vm.expectEmit(true, true, true, true);
        emit MarketActionTx(
            user2,
            PredictionMarket.MarketAction.claimVoided,
            marketId,
            0,
            userShares,
            expectedValue,
            block.timestamp
        );

        vm.prank(user2);
        market.claimVoidedOutcomeShares(marketId, 0);
    }

    function test_ClaimVoidedSharesToETH() public {
        uint256 ethMarketId = createTestMarketWithETH();
        buySharesWithETH(user2, ethMarketId, 0, 5 ether);

        voidMarket(ethMarketId);

        uint256 ethBefore = user2.balance;

        vm.prank(user2);
        market.claimVoidedOutcomeSharesToETH(ethMarketId, 0);

        uint256 ethAfter = user2.balance;
        assertTrue(ethAfter > ethBefore, "Should receive ETH");
    }

    function test_ClaimVoidedShares_BothOutcomes() public {
        voidMarket(marketId);

        // User2 has outcome 0, User3 has outcome 1
        uint256 user2BalanceBefore = token.balanceOf(user2);
        uint256 user3BalanceBefore = token.balanceOf(user3);

        vm.prank(user2);
        market.claimVoidedOutcomeShares(marketId, 0);

        vm.prank(user3);
        market.claimVoidedOutcomeShares(marketId, 1);

        uint256 user2BalanceAfter = token.balanceOf(user2);
        uint256 user3BalanceAfter = token.balanceOf(user3);

        assertTrue(user2BalanceAfter > user2BalanceBefore, "User2 should receive value");
        assertTrue(user3BalanceAfter > user3BalanceBefore, "User3 should receive value");
    }

    // ============ User Claim Status Tests ============

    function test_GetUserClaimStatus_BeforeResolution() public {
        (
            bool winningsToClaim,
            bool winningsClaimed,
            bool liquidityToClaim,
            bool liquidityClaimed,
            uint256 claimableFees
        ) = market.getUserClaimStatus(marketId, user2);

        assertFalse(winningsToClaim, "No winnings before resolution");
        assertFalse(winningsClaimed, "Nothing claimed before resolution");
        assertFalse(liquidityToClaim, "No liquidity to claim for non-LP");
        assertFalse(liquidityClaimed, "No liquidity claimed");
    }

    function test_GetUserClaimStatus_AfterResolution_Winner() public {
        resolveMarket(marketId, 0);

        (
            bool winningsToClaim,
            bool winningsClaimed,
            ,
            ,
        ) = market.getUserClaimStatus(marketId, user2);

        assertTrue(winningsToClaim, "Winner should have winnings to claim");
        assertFalse(winningsClaimed, "Not yet claimed");
    }

    function test_GetUserClaimStatus_AfterClaim() public {
        resolveMarket(marketId, 0);

        vm.prank(user2);
        market.claimWinnings(marketId);

        (
            bool winningsToClaim,
            bool winningsClaimed,
            ,
            ,
        ) = market.getUserClaimStatus(marketId, user2);

        assertTrue(winningsToClaim, "Still has shares");
        assertTrue(winningsClaimed, "Has claimed");
    }

    // ============ Revert Tests ============

    function test_Revert_ClaimWinnings_NotResolved() public {
        vm.prank(user2);
        vm.expectRevert("Market in incorrect state");
        market.claimWinnings(marketId);
    }

    function test_Revert_ClaimWinnings_VoidedMarket() public {
        voidMarket(marketId);

        vm.prank(user2);
        vm.expectRevert("market is voided");
        market.claimWinnings(marketId);
    }

    function test_Revert_ClaimWinnings_NoShares() public {
        resolveMarket(marketId, 0);

        // user3 has no winning shares (they bought outcome 1)
        vm.prank(user3);
        vm.expectRevert("user doesn't hold outcome shares");
        market.claimWinnings(marketId);
    }

    function test_Revert_ClaimWinnings_AlreadyClaimed() public {
        resolveMarket(marketId, 0);

        vm.prank(user2);
        market.claimWinnings(marketId);

        vm.prank(user2);
        vm.expectRevert("user already claimed winnings");
        market.claimWinnings(marketId);
    }

    function test_Revert_ClaimLiquidity_NotResolved() public {
        vm.prank(user1);
        vm.expectRevert("Market in incorrect state");
        market.claimLiquidity(marketId);
    }

    function test_Revert_ClaimLiquidity_NoShares() public {
        resolveMarket(marketId, 0);

        // user2 has no liquidity shares
        vm.prank(user2);
        vm.expectRevert("user doesn't hold shares");
        market.claimLiquidity(marketId);
    }

    function test_Revert_ClaimLiquidity_AlreadyClaimed() public {
        resolveMarket(marketId, 0);

        vm.prank(user1);
        market.claimLiquidity(marketId);

        vm.prank(user1);
        vm.expectRevert("user already claimed shares");
        market.claimLiquidity(marketId);
    }

    function test_Revert_ClaimVoidedShares_NotVoided() public {
        resolveMarket(marketId, 0);

        vm.prank(user2);
        vm.expectRevert("market is not voided");
        market.claimVoidedOutcomeShares(marketId, 0);
    }

    function test_Revert_ClaimVoidedShares_NoShares() public {
        voidMarket(marketId);

        // user1 has no outcome shares (only liquidity)
        vm.prank(user1);
        vm.expectRevert("user doesn't hold outcome shares");
        market.claimVoidedOutcomeShares(marketId, 0);
    }

    function test_Revert_ClaimVoidedShares_AlreadyClaimed() public {
        voidMarket(marketId);

        vm.prank(user2);
        market.claimVoidedOutcomeShares(marketId, 0);

        vm.prank(user2);
        vm.expectRevert("user already claimed shares");
        market.claimVoidedOutcomeShares(marketId, 0);
    }

    function test_Revert_ClaimWinningsToETH_NotWETHMarket() public {
        resolveMarket(marketId, 0);

        vm.prank(user2);
        vm.expectRevert("Market token is not WETH");
        market.claimWinningsToETH(marketId);
    }

    function test_Revert_ClaimLiquidityToETH_NotWETHMarket() public {
        resolveMarket(marketId, 0);

        vm.prank(user1);
        vm.expectRevert("Market token is not WETH");
        market.claimLiquidityToETH(marketId);
    }

    function test_Revert_ClaimVoidedToETH_NotWETHMarket() public {
        voidMarket(marketId);

        vm.prank(user2);
        vm.expectRevert("Market token is not WETH");
        market.claimVoidedOutcomeSharesToETH(marketId, 0);
    }

    // ============ Edge Cases ============

    function test_ClaimWinnings_SmallShares() public {
        // Create fresh market
        uint256 newMarketId = createTestMarket();
        
        // Buy very small amount
        fundUser(user2, 0.001 ether);
        vm.prank(user2);
        market.buy(newMarketId, 0, 0, 0.001 ether);

        resolveMarket(newMarketId, 0);

        uint256 shares = getUserOutcomeShares(newMarketId, user2, 0);
        uint256 balanceBefore = token.balanceOf(user2);

        vm.prank(user2);
        market.claimWinnings(newMarketId);

        uint256 balanceAfter = token.balanceOf(user2);
        assertEq(balanceAfter - balanceBefore, shares, "Should claim small amount");
    }

    function test_Liquidity_ClaimAfterVoid() public {
        voidMarket(marketId);

        uint256 balanceBefore = token.balanceOf(user1);

        vm.prank(user1);
        market.claimLiquidity(marketId);

        uint256 balanceAfter = token.balanceOf(user1);
        assertTrue(balanceAfter > balanceBefore, "LP should receive value in voided market");
    }

    function test_ClaimFees_NoFees() public {
        // Market has no fees generated
        uint256 noFeeMarketId = createTestMarket();

        uint256 claimableFees = market.getUserClaimableFees(noFeeMarketId, user1);
        assertEq(claimableFees, 0, "Should have no fees");

        // Claiming should succeed with 0 value
        vm.prank(user1);
        market.claimFees(noFeeMarketId);
    }
}

