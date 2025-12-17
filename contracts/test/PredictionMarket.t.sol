// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./BaseTest.sol";

contract PredictionMarketTest is BaseTest {
    
    // ============ Market Creation Tests ============

    function test_CreateMarket() public {
        uint256 marketId = createTestMarket();

        (
            PredictionMarket.MarketState state,
            uint256 closesAt,
            uint256 totalPot,
            uint256 outcomeCount,
            uint256 resolvedOutcome,
            address marketCreator,
            uint16 protocolFeeBps,
            uint16 creatorFeeBps
        ) = market.getMarketData(marketId);

        assertEq(uint256(state), uint256(PredictionMarket.MarketState.Open));
        assertEq(closesAt, block.timestamp + 1 days);
        assertEq(totalPot, 0);
        assertEq(outcomeCount, 2);
        assertEq(resolvedOutcome, 0);
        assertEq(marketCreator, creator);
        assertEq(protocolFeeBps, DEFAULT_PROTOCOL_FEE_BPS);
        assertEq(creatorFeeBps, DEFAULT_CREATOR_FEE_BPS);
    }

    function test_CreateMarket_MultipleOutcomes() public {
        uint256 marketId = createTestMarketWithOutcomes(5);

        (,,,uint256 outcomeCount,,,,) = market.getMarketData(marketId);
        assertEq(outcomeCount, 5);

        uint256[] memory pools = market.getMarketPools(marketId);
        assertEq(pools.length, 5);
    }

    function test_CreateMarket_EmitsEvent() public {
        PredictionMarket.CreateMarketParams memory params = PredictionMarket.CreateMarketParams({
            question: "Test Question",
            image: "test_image",
            outcomeCount: 2,
            closesAt: block.timestamp + 1 days,
            token: address(usdc),
            protocolFeeBps: DEFAULT_PROTOCOL_FEE_BPS,
            creatorFeeBps: DEFAULT_CREATOR_FEE_BPS,
            creator: creator
        });

        vm.expectEmit(true, true, false, true);
        emit MarketCreated(creator, 0, 2, "Test Question", "test_image", address(usdc));

        vm.prank(owner);
        market.createMarket(params);
    }

    function test_RevertCreateMarket_InvalidOutcomeCount() public {
        PredictionMarket.CreateMarketParams memory params = PredictionMarket.CreateMarketParams({
            question: "Test",
            image: "",
            outcomeCount: 1, // Invalid - need at least 2
            closesAt: block.timestamp + 1 days,
            token: address(usdc),
            protocolFeeBps: 0,
            creatorFeeBps: 0,
            creator: creator
        });

        vm.prank(owner);
        vm.expectRevert("Invalid outcome count");
        market.createMarket(params);
    }

    function test_RevertCreateMarket_TooManyOutcomes() public {
        PredictionMarket.CreateMarketParams memory params = PredictionMarket.CreateMarketParams({
            question: "Test",
            image: "",
            outcomeCount: 33, // Invalid - max is 32
            closesAt: block.timestamp + 1 days,
            token: address(usdc),
            protocolFeeBps: 0,
            creatorFeeBps: 0,
            creator: creator
        });

        vm.prank(owner);
        vm.expectRevert("Invalid outcome count");
        market.createMarket(params);
    }

    function test_RevertCreateMarket_PastCloseTime() public {
        PredictionMarket.CreateMarketParams memory params = PredictionMarket.CreateMarketParams({
            question: "Test",
            image: "",
            outcomeCount: 2,
            closesAt: block.timestamp - 1, // In the past
            token: address(usdc),
            protocolFeeBps: 0,
            creatorFeeBps: 0,
            creator: creator
        });

        vm.prank(owner);
        vm.expectRevert("Close time must be in future");
        market.createMarket(params);
    }

    function test_RevertCreateMarket_FeesTooHigh() public {
        PredictionMarket.CreateMarketParams memory params = PredictionMarket.CreateMarketParams({
            question: "Test",
            image: "",
            outcomeCount: 2,
            closesAt: block.timestamp + 1 days,
            token: address(usdc),
            protocolFeeBps: 600, // 6%
            creatorFeeBps: 600,  // 6% - total 12% > 10% max
            creator: creator
        });

        vm.prank(owner);
        vm.expectRevert("Fees too high");
        market.createMarket(params);
    }

    // ============ Betting Tests ============

    function test_Bet() public {
        uint256 marketId = createTestMarket();
        
        placeBet(user1, marketId, 0, 100e6); // $100 on outcome 0

        uint256[] memory pools = market.getMarketPools(marketId);
        assertEq(pools[0], 100e6);
        assertEq(pools[1], 0);

        uint256[] memory userShares = market.getUserShares(marketId, user1);
        assertEq(userShares[0], 100e6);
        assertEq(userShares[1], 0);

        assertEq(getMarketTotalPot(marketId), 100e6);
    }

    function test_Bet_MultipleBettors() public {
        uint256 marketId = createTestMarket();
        
        placeBet(user1, marketId, 0, 100e6); // User1: $100 on YES
        placeBet(user2, marketId, 1, 50e6);  // User2: $50 on NO
        placeBet(user3, marketId, 0, 25e6);  // User3: $25 on YES

        uint256[] memory pools = market.getMarketPools(marketId);
        assertEq(pools[0], 125e6); // YES pool
        assertEq(pools[1], 50e6);  // NO pool
        assertEq(getMarketTotalPot(marketId), 175e6);

        // Check individual shares
        assertEq(getUserOutcomeShares(marketId, user1, 0), 100e6);
        assertEq(getUserOutcomeShares(marketId, user3, 0), 25e6);
        assertEq(getUserOutcomeShares(marketId, user2, 1), 50e6);
    }

    function test_Bet_EmitsEvent() public {
        uint256 marketId = createTestMarket();
        fundUser(user1, 100e6);

        vm.expectEmit(true, true, true, true);
        emit BetPlaced(user1, marketId, 0, 100e6, 100e6, block.timestamp);

        vm.prank(user1);
        market.bet(marketId, 0, 100e6);
    }

    function test_RevertBet_BelowMinimum() public {
        uint256 marketId = createTestMarket();
        fundUser(user1, 1e6);

        vm.prank(user1);
        vm.expectRevert("Below minimum bet");
        market.bet(marketId, 0, 0.5e6); // $0.50 - below $1 minimum
    }

    function test_RevertBet_MarketClosed() public {
        uint256 marketId = createTestMarket();
        advancePastClose(marketId);

        fundUser(user1, 100e6);
        vm.prank(user1);
        vm.expectRevert("Market closed");
        market.bet(marketId, 0, 100e6);
    }

    function test_RevertBet_InvalidOutcome() public {
        uint256 marketId = createTestMarket();
        fundUser(user1, 100e6);

        vm.prank(user1);
        vm.expectRevert("Invalid outcome");
        market.bet(marketId, 5, 100e6); // Outcome 5 doesn't exist
    }

    // ============ Price Calculation Tests ============

    function test_IndicativePrices_EqualBets() public {
        uint256 marketId = createTestMarket();
        
        placeBet(user1, marketId, 0, 100e6);
        placeBet(user2, marketId, 1, 100e6);

        uint256[] memory prices = market.getIndicativePrices(marketId);
        assertEq(prices[0], 0.5e18); // 50%
        assertEq(prices[1], 0.5e18); // 50%
    }

    function test_IndicativePrices_UnequalBets() public {
        uint256 marketId = createTestMarket();
        
        placeBet(user1, marketId, 0, 75e6);  // $75 on YES
        placeBet(user2, marketId, 1, 25e6);  // $25 on NO

        uint256[] memory prices = market.getIndicativePrices(marketId);
        assertEq(prices[0], 0.75e18); // 75%
        assertEq(prices[1], 0.25e18); // 25%
    }

    function test_IndicativePrices_NoBets() public {
        uint256 marketId = createTestMarket();

        uint256[] memory prices = market.getIndicativePrices(marketId);
        // Should be equal odds when no bets
        assertEq(prices[0], 0.5e18);
        assertEq(prices[1], 0.5e18);
    }

    function test_IndicativePayout() public {
        uint256 marketId = createTestMarketNoFees();
        
        placeBet(user1, marketId, 0, 100e6);
        placeBet(user2, marketId, 1, 100e6);

        // If user3 bets $50 on outcome 0, they should get:
        // newTotalPot = 250, newOutcome0Pool = 150
        // payout = 50 * 250 / 150 = 83.33...
        uint256 indicativePayout = market.getIndicativePayout(marketId, 0, 50e6);
        assertApproxEqAbs(indicativePayout, 83333333, 1); // ~$83.33
    }

    // ============ Resolution Tests ============

    function test_Resolve() public {
        uint256 marketId = createTestMarketNoFees();
        
        placeBet(user1, marketId, 0, 100e6); // $100 on YES
        placeBet(user2, marketId, 1, 50e6);  // $50 on NO

        resolveMarket(marketId, 0); // YES wins

        assertEq(uint256(getMarketState(marketId)), uint256(PredictionMarket.MarketState.Resolved));
    }

    function test_Resolve_AsCreator() public {
        uint256 marketId = createTestMarketNoFees();
        
        placeBet(user1, marketId, 0, 100e6);

        // Creator should be able to resolve
        resolveMarketAsCreator(marketId, 0);

        assertEq(uint256(getMarketState(marketId)), uint256(PredictionMarket.MarketState.Resolved));
    }

    function test_Resolve_FeeDistribution() public {
        uint256 marketId = createTestMarketWithFees(150, 150); // 1.5% each
        
        placeBet(user1, marketId, 0, 100e6);
        placeBet(user2, marketId, 1, 100e6);
        // Total pot: $200

        uint256 treasuryBefore = usdc.balanceOf(protocolTreasury);
        uint256 creatorBefore = usdc.balanceOf(creator);

        resolveMarket(marketId, 0);

        // Protocol fee: 200 * 1.5% = $3
        // Creator fee: 200 * 1.5% = $3
        assertEq(usdc.balanceOf(protocolTreasury) - treasuryBefore, 3e6);
        assertEq(usdc.balanceOf(creator) - creatorBefore, 3e6);
    }

    function test_Resolve_EmptyWinningPool_FeesToCreator() public {
        uint256 marketId = createTestMarketWithFees(150, 150);
        
        // Everyone bets on NO
        placeBet(user1, marketId, 1, 100e6);
        placeBet(user2, marketId, 1, 100e6);
        // Total pot: $200, YES pool: $0

        uint256 treasuryBefore = usdc.balanceOf(protocolTreasury);
        uint256 creatorBefore = usdc.balanceOf(creator);

        resolveMarket(marketId, 0); // YES wins, but no YES bets

        // Protocol gets: 200 * 150 / 10000 = $3
        // Creator gets rest: 200 - 3 = $197
        assertEq(usdc.balanceOf(protocolTreasury) - treasuryBefore, 3e6);
        assertEq(usdc.balanceOf(creator) - creatorBefore, 197e6);
    }

    function test_RevertResolve_NotAuthorized() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);

        vm.prank(user2); // Random user
        vm.expectRevert("Not authorized to resolve");
        market.resolve(marketId, 0);
    }

    function test_RevertResolve_InvalidOutcome() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);

        vm.prank(owner);
        vm.expectRevert("Invalid outcome");
        market.resolve(marketId, 5);
    }

    // ============ Claim Tests ============

    function test_ClaimWinnings() public {
        uint256 marketId = createTestMarketNoFees();
        
        placeBet(user1, marketId, 0, 100e6); // User1: $100 on YES
        placeBet(user2, marketId, 1, 100e6); // User2: $100 on NO

        resolveMarket(marketId, 0); // YES wins

        uint256 balanceBefore = usdc.balanceOf(user1);

        vm.prank(user1);
        market.claimWinnings(marketId);

        // User1 should get entire pot ($200)
        assertEq(usdc.balanceOf(user1) - balanceBefore, 200e6);
    }

    function test_ClaimWinnings_MultipleWinners() public {
        uint256 marketId = createTestMarketNoFees();
        
        placeBet(user1, marketId, 0, 100e6); // User1: $100 on YES
        placeBet(user2, marketId, 0, 100e6); // User2: $100 on YES
        placeBet(user3, marketId, 1, 200e6); // User3: $200 on NO
        // Total pot: $400, YES pool: $200

        resolveMarket(marketId, 0); // YES wins

        uint256 balance1Before = usdc.balanceOf(user1);
        uint256 balance2Before = usdc.balanceOf(user2);

        vm.prank(user1);
        market.claimWinnings(marketId);

        vm.prank(user2);
        market.claimWinnings(marketId);

        // Each YES bettor gets: shares * (totalPot / yesPool) = 100 * (400/200) = $200
        assertEq(usdc.balanceOf(user1) - balance1Before, 200e6);
        assertEq(usdc.balanceOf(user2) - balance2Before, 200e6);
    }

    function test_ClaimWinnings_WithFees() public {
        uint256 marketId = createTestMarketWithFees(150, 150); // 3% total
        
        placeBet(user1, marketId, 0, 100e6);
        placeBet(user2, marketId, 1, 100e6);
        // Total pot: $200

        resolveMarket(marketId, 0);

        vm.prank(user1);
        market.claimWinnings(marketId);

        // Fees: 200 * 3% = $6
        // Net pot: $194
        // User1 gets all of net pot
        assertEq(usdc.balanceOf(user1), 194e6);
    }

    function test_ClaimWinnings_EmitsEvent() public {
        uint256 marketId = createTestMarketNoFees();
        
        placeBet(user1, marketId, 0, 100e6);
        resolveMarket(marketId, 0);

        vm.expectEmit(true, true, false, true);
        emit WinningsClaimed(user1, marketId, 100e6, 100e6, block.timestamp);

        vm.prank(user1);
        market.claimWinnings(marketId);
    }

    function test_RevertClaimWinnings_NotResolved() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);

        vm.prank(user1);
        vm.expectRevert("Market not resolved");
        market.claimWinnings(marketId);
    }

    function test_RevertClaimWinnings_NoShares() public {
        uint256 marketId = createTestMarketNoFees();
        placeBet(user1, marketId, 0, 100e6);
        resolveMarket(marketId, 0);

        vm.prank(user2); // User2 didn't bet
        vm.expectRevert("No winning shares");
        market.claimWinnings(marketId);
    }

    function test_RevertClaimWinnings_AlreadyClaimed() public {
        uint256 marketId = createTestMarketNoFees();
        placeBet(user1, marketId, 0, 100e6);
        resolveMarket(marketId, 0);

        vm.prank(user1);
        market.claimWinnings(marketId);

        vm.prank(user1);
        vm.expectRevert("Already claimed");
        market.claimWinnings(marketId);
    }

    function test_RevertClaimWinnings_Loser() public {
        uint256 marketId = createTestMarketNoFees();
        placeBet(user1, marketId, 0, 100e6);
        placeBet(user2, marketId, 1, 100e6);
        resolveMarket(marketId, 0); // YES wins

        vm.prank(user2); // User2 bet on NO (losing side)
        vm.expectRevert("No winning shares");
        market.claimWinnings(marketId);
    }

    // ============ Void / Refund Tests ============

    function test_VoidMarket() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);

        voidMarket(marketId);

        assertEq(uint256(getMarketState(marketId)), uint256(PredictionMarket.MarketState.Voided));
    }

    function test_ClaimRefund() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        placeBet(user1, marketId, 1, 50e6);

        voidMarket(marketId);

        uint256 balanceBefore = usdc.balanceOf(user1);

        vm.prank(user1);
        market.claimRefund(marketId, 0);

        vm.prank(user1);
        market.claimRefund(marketId, 1);

        // Should get full refund
        assertEq(usdc.balanceOf(user1) - balanceBefore, 150e6);
    }

    function test_ClaimRefund_EmitsEvent() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        voidMarket(marketId);

        vm.expectEmit(true, true, false, true);
        emit RefundClaimed(user1, marketId, 0, 100e6, block.timestamp);

        vm.prank(user1);
        market.claimRefund(marketId, 0);
    }

    function test_RevertClaimRefund_NotVoided() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);

        vm.prank(user1);
        vm.expectRevert("Market not voided");
        market.claimRefund(marketId, 0);
    }

    // ============ Lock Market Tests ============

    function test_LockMarket() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);

        lockMarket(marketId);

        assertEq(uint256(getMarketState(marketId)), uint256(PredictionMarket.MarketState.Locked));
    }

    function test_LockMarket_NoMoreBets() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        lockMarket(marketId);

        fundUser(user2, 100e6);
        vm.prank(user2);
        vm.expectRevert("Market not open");
        market.bet(marketId, 0, 100e6);
    }

    function test_LockMarket_CanStillResolve() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        lockMarket(marketId);

        // Should be able to resolve a locked market
        resolveMarket(marketId, 0);

        assertEq(uint256(getMarketState(marketId)), uint256(PredictionMarket.MarketState.Resolved));
    }

    // ============ View Function Tests ============

    function test_GetClaimableAmount_Resolved() public {
        uint256 marketId = createTestMarketNoFees();
        placeBet(user1, marketId, 0, 100e6);
        placeBet(user2, marketId, 1, 100e6);
        resolveMarket(marketId, 0);

        (uint256 amount, bool canClaim) = market.getClaimableAmount(marketId, user1);
        assertEq(amount, 200e6);
        assertTrue(canClaim);

        (uint256 amount2, bool canClaim2) = market.getClaimableAmount(marketId, user2);
        assertEq(amount2, 0);
        assertFalse(canClaim2);
    }

    function test_GetClaimableAmount_Voided() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        placeBet(user1, marketId, 1, 50e6);
        voidMarket(marketId);

        (uint256 amount, bool canClaim) = market.getClaimableAmount(marketId, user1);
        assertEq(amount, 150e6);
        assertTrue(canClaim);
    }

    function test_HasClaimed() public {
        uint256 marketId = createTestMarketNoFees();
        placeBet(user1, marketId, 0, 100e6);
        resolveMarket(marketId, 0);

        assertFalse(market.hasClaimed(marketId, 0, user1));

        vm.prank(user1);
        market.claimWinnings(marketId);

        assertTrue(market.hasClaimed(marketId, 0, user1));
    }

    // ============ Edge Case Tests ============

    function test_OnlyOneBettor() public {
        uint256 marketId = createTestMarketNoFees();
        placeBet(user1, marketId, 0, 100e6);
        
        resolveMarket(marketId, 0);

        vm.prank(user1);
        market.claimWinnings(marketId);

        // Should get back exactly what they put in (no losers to take from)
        assertEq(usdc.balanceOf(user1), 100e6);
    }

    function test_LargeBetAmounts() public {
        uint256 marketId = createTestMarketNoFees();
        
        // Use amounts up to the per-user limit
        uint256 largeBet = market.MAX_BET_PER_MARKET(); // $100k
        placeBet(user1, marketId, 0, largeBet);
        placeBet(user2, marketId, 1, largeBet);

        resolveMarket(marketId, 0);

        vm.prank(user1);
        market.claimWinnings(marketId);

        assertEq(usdc.balanceOf(user1), 2 * largeBet);
    }

    function test_ManyOutcomes() public {
        // Create market with no fees for this test
        uint256 marketId = createMarketWithParams(10, block.timestamp + 1 days, 0, 0);
        
        // Bet on each outcome
        for (uint256 i = 0; i < 10; i++) {
            placeBet(user1, marketId, i, 10e6);
        }

        assertEq(getMarketTotalPot(marketId), 100e6);
        
        resolveMarket(marketId, 5);

        vm.prank(user1);
        market.claimWinnings(marketId);

        // User1 bet $10 on winning outcome out of $100 total
        // Gets $100 (all of it since they're the only bettor on winner)
        assertEq(usdc.balanceOf(user1), 100e6);
    }

    // ============ Admin Function Tests ============

    function test_SetProtocolTreasury() public {
        address newTreasury = address(0x999);
        
        vm.prank(owner);
        market.setProtocolTreasury(newTreasury);
        
        assertEq(market.protocolTreasury(), newTreasury);
    }

    function test_RevertSetProtocolTreasury_NotOwner() public {
        vm.prank(user1);
        vm.expectRevert("Ownable: caller is not the owner");
        market.setProtocolTreasury(address(0x999));
    }

    function test_RevertSetProtocolTreasury_ZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert("Invalid treasury");
        market.setProtocolTreasury(address(0));
    }

    function test_EmergencyWithdraw() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        
        // Enable emergency withdraw first
        vm.prank(owner);
        market.setEmergencyWithdrawEnabled(true);
        
        uint256 ownerBalanceBefore = usdc.balanceOf(owner);
        
        vm.prank(owner);
        market.emergencyWithdraw(address(usdc), 50e6);
        
        assertEq(usdc.balanceOf(owner) - ownerBalanceBefore, 50e6);
    }

    function test_RevertEmergencyWithdraw_NotOwner() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        
        // Enable emergency withdraw first
        vm.prank(owner);
        market.setEmergencyWithdrawEnabled(true);
        
        vm.prank(user1);
        vm.expectRevert("Ownable: caller is not the owner");
        market.emergencyWithdraw(address(usdc), 50e6);
    }
    
    function test_RevertEmergencyWithdraw_NotEnabled() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        
        // Try without enabling
        vm.prank(owner);
        vm.expectRevert("Emergency withdraw not enabled");
        market.emergencyWithdraw(address(usdc), 50e6);
    }

    // ============ Constructor Tests ============

    function test_RevertConstructor_ZeroTreasury() public {
        vm.expectRevert("Invalid treasury");
        new PredictionMarket(address(0));
    }

    // ============ State Transition Tests ============

    function test_VoidLockedMarket() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        
        lockMarket(marketId);
        assertEq(uint256(getMarketState(marketId)), uint256(PredictionMarket.MarketState.Locked));
        
        voidMarket(marketId);
        assertEq(uint256(getMarketState(marketId)), uint256(PredictionMarket.MarketState.Voided));
    }

    function test_RevertResolve_AlreadyResolved() public {
        uint256 marketId = createTestMarketNoFees();
        placeBet(user1, marketId, 0, 100e6);
        
        resolveMarket(marketId, 0);
        
        vm.prank(owner);
        vm.expectRevert("Market not resolvable");
        market.resolve(marketId, 1);
    }

    function test_RevertVoid_AlreadyVoided() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        
        voidMarket(marketId);
        
        vm.prank(owner);
        vm.expectRevert("Market not resolvable");
        market.voidMarket(marketId);
    }

    function test_RevertVoid_AlreadyResolved() public {
        uint256 marketId = createTestMarketNoFees();
        placeBet(user1, marketId, 0, 100e6);
        
        resolveMarket(marketId, 0);
        
        vm.prank(owner);
        vm.expectRevert("Market not resolvable");
        market.voidMarket(marketId);
    }

    function test_RevertResolve_VoidedMarket() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        
        voidMarket(marketId);
        
        vm.prank(owner);
        vm.expectRevert("Market not resolvable");
        market.resolve(marketId, 0);
    }

    function test_RevertLock_AlreadyLocked() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        
        lockMarket(marketId);
        
        vm.prank(owner);
        vm.expectRevert("Market not open");
        market.lockMarket(marketId);
    }

    function test_RevertLock_ResolvedMarket() public {
        uint256 marketId = createTestMarketNoFees();
        placeBet(user1, marketId, 0, 100e6);
        
        resolveMarket(marketId, 0);
        
        vm.prank(owner);
        vm.expectRevert("Market not open");
        market.lockMarket(marketId);
    }

    function test_RevertLock_NotAuthorized() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        
        vm.prank(user2);
        vm.expectRevert("Not authorized to resolve");
        market.lockMarket(marketId);
    }

    // ============ Market Exists Modifier Tests ============

    function test_RevertBet_MarketNotExists() public {
        fundUser(user1, 100e6);
        vm.prank(user1);
        vm.expectRevert("Market does not exist");
        market.bet(999, 0, 100e6);
    }

    function test_RevertResolve_MarketNotExists() public {
        vm.prank(owner);
        vm.expectRevert("Market does not exist");
        market.resolve(999, 0);
    }

    function test_RevertVoid_MarketNotExists() public {
        vm.prank(owner);
        vm.expectRevert("Market does not exist");
        market.voidMarket(999);
    }

    function test_RevertLock_MarketNotExists() public {
        vm.prank(owner);
        vm.expectRevert("Market does not exist");
        market.lockMarket(999);
    }

    function test_RevertClaimWinnings_MarketNotExists() public {
        vm.prank(user1);
        vm.expectRevert("Market does not exist");
        market.claimWinnings(999);
    }

    function test_RevertClaimRefund_MarketNotExists() public {
        vm.prank(user1);
        vm.expectRevert("Market does not exist");
        market.claimRefund(999, 0);
    }

    // ============ Zero Address Validation Tests ============

    function test_RevertCreateMarket_ZeroToken() public {
        PredictionMarket.CreateMarketParams memory params = PredictionMarket.CreateMarketParams({
            question: "Test",
            image: "",
            outcomeCount: 2,
            closesAt: block.timestamp + 1 days,
            token: address(0),
            protocolFeeBps: 0,
            creatorFeeBps: 0,
            creator: creator
        });

        vm.prank(owner);
        vm.expectRevert("Invalid token");
        market.createMarket(params);
    }

    function test_RevertCreateMarket_ZeroCreator() public {
        PredictionMarket.CreateMarketParams memory params = PredictionMarket.CreateMarketParams({
            question: "Test",
            image: "",
            outcomeCount: 2,
            closesAt: block.timestamp + 1 days,
            token: address(usdc),
            protocolFeeBps: 0,
            creatorFeeBps: 0,
            creator: address(0)
        });

        vm.prank(owner);
        vm.expectRevert("Invalid creator");
        market.createMarket(params);
    }

    // ============ Fee Edge Case Tests ============

    function test_CreateMarket_MaxFees() public {
        // Total 10% = max allowed
        uint256 marketId = createMarketWithParams(2, block.timestamp + 1 days, 500, 500);
        
        placeBet(user1, marketId, 0, 100e6);
        placeBet(user2, marketId, 1, 100e6);
        
        uint256 treasuryBefore = usdc.balanceOf(protocolTreasury);
        uint256 creatorBefore = usdc.balanceOf(creator);
        
        resolveMarket(marketId, 0);
        
        // 5% each = $10 each from $200 pot
        assertEq(usdc.balanceOf(protocolTreasury) - treasuryBefore, 10e6);
        assertEq(usdc.balanceOf(creator) - creatorBefore, 10e6);
    }

    function test_CreateMarket_ZeroFees() public {
        uint256 marketId = createTestMarketNoFees();
        
        placeBet(user1, marketId, 0, 100e6);
        placeBet(user2, marketId, 1, 100e6);
        
        uint256 treasuryBefore = usdc.balanceOf(protocolTreasury);
        uint256 creatorBefore = usdc.balanceOf(creator);
        
        resolveMarket(marketId, 0);
        
        // No fees taken
        assertEq(usdc.balanceOf(protocolTreasury) - treasuryBefore, 0);
        assertEq(usdc.balanceOf(creator) - creatorBefore, 0);
        
        // Winner gets everything
        vm.prank(user1);
        market.claimWinnings(marketId);
        assertEq(usdc.balanceOf(user1), 200e6);
    }

    function test_RevertCreateMarket_FeeJustOverMax() public {
        PredictionMarket.CreateMarketParams memory params = PredictionMarket.CreateMarketParams({
            question: "Test",
            image: "",
            outcomeCount: 2,
            closesAt: block.timestamp + 1 days,
            token: address(usdc),
            protocolFeeBps: 501, // 5.01%
            creatorFeeBps: 500,  // 5% - total 10.01%
            creator: creator
        });

        vm.prank(owner);
        vm.expectRevert("Fees too high");
        market.createMarket(params);
    }

    // ============ Precision / Rounding Tests ============

    function test_RoundingWithOddAmounts() public {
        uint256 marketId = createTestMarketWithFees(150, 150); // 3% total
        
        // Odd bet amounts
        placeBet(user1, marketId, 0, 33333333); // $33.333333
        placeBet(user2, marketId, 1, 66666667); // $66.666667
        // Total: $100
        
        resolveMarket(marketId, 0);
        
        vm.prank(user1);
        market.claimWinnings(marketId);
        
        // Net pot after 3% fees: 100 - 3 = $97
        // User1 gets all of net pot (only winner)
        // Allow 1 wei tolerance for rounding
        assertApproxEqAbs(usdc.balanceOf(user1), 97e6, 1);
    }

    function test_SmallBetsAtMinimum() public {
        uint256 marketId = createTestMarketNoFees();
        
        // Minimum bets
        placeBet(user1, marketId, 0, MIN_BET);
        placeBet(user2, marketId, 1, MIN_BET);
        
        resolveMarket(marketId, 0);
        
        vm.prank(user1);
        market.claimWinnings(marketId);
        
        assertEq(usdc.balanceOf(user1), 2 * MIN_BET);
    }

    function test_UnevenSplitPrecision() public {
        uint256 marketId = createTestMarketNoFees();
        
        // 3 bettors, uneven split
        placeBet(user1, marketId, 0, 10e6);
        placeBet(user2, marketId, 0, 20e6);
        placeBet(user3, marketId, 1, 30e6);
        // Total pot: 60, YES pool: 30
        
        resolveMarket(marketId, 0);
        
        // User1: 10/30 * 60 = 20
        // User2: 20/30 * 60 = 40
        vm.prank(user1);
        market.claimWinnings(marketId);
        assertEq(usdc.balanceOf(user1), 20e6);
        
        vm.prank(user2);
        market.claimWinnings(marketId);
        assertEq(usdc.balanceOf(user2), 40e6);
    }

    // ============ View Function Tests ============

    function test_GetOutcomePool() public {
        uint256 marketId = createTestMarket();
        
        placeBet(user1, marketId, 0, 100e6);
        placeBet(user2, marketId, 1, 50e6);
        
        assertEq(market.getOutcomePool(marketId, 0), 100e6);
        assertEq(market.getOutcomePool(marketId, 1), 50e6);
    }

    function test_RevertGetOutcomePool_MarketNotExists() public {
        vm.expectRevert("Market does not exist");
        market.getOutcomePool(999, 0);
    }

    function test_GetIndicativePayout_WithFees() public {
        uint256 marketId = createTestMarketWithFees(150, 150); // 3%
        
        placeBet(user1, marketId, 0, 100e6);
        placeBet(user2, marketId, 1, 100e6);
        
        // If user3 bets $50 on outcome 0:
        // New pot: 250, New outcome0 pool: 150
        // Net pot after 3% fees: 250 * 0.97 = 242.5
        // User3 payout: 50 * 242.5 / 150 = 80.833...
        uint256 payout = market.getIndicativePayout(marketId, 0, 50e6);
        assertApproxEqAbs(payout, 80833333, 1);
    }

    function test_RevertGetIndicativePayout_InvalidOutcome() public {
        uint256 marketId = createTestMarket();
        
        vm.expectRevert("Invalid outcome");
        market.getIndicativePayout(marketId, 5, 100e6);
    }

    function test_GetMarketData() public {
        uint256 marketId = createTestMarketWithFees(150, 200);
        
        (
            PredictionMarket.MarketState state,
            uint256 closesAt,
            uint256 totalPot,
            uint256 outcomeCount,
            uint256 resolvedOutcome,
            address marketCreator,
            uint16 protocolFeeBps,
            uint16 creatorFeeBps
        ) = market.getMarketData(marketId);
        
        assertEq(uint256(state), uint256(PredictionMarket.MarketState.Open));
        assertEq(closesAt, block.timestamp + 1 days);
        assertEq(totalPot, 0);
        assertEq(outcomeCount, 2);
        assertEq(resolvedOutcome, 0); // Not resolved yet
        assertEq(marketCreator, creator);
        assertEq(protocolFeeBps, 150);
        assertEq(creatorFeeBps, 200);
    }

    function test_RevertGetMarketData_MarketNotExists() public {
        vm.expectRevert("Market does not exist");
        market.getMarketData(999);
    }

    function test_GetUserShares() public {
        uint256 marketId = createTestMarket();
        
        placeBet(user1, marketId, 0, 100e6);
        placeBet(user1, marketId, 1, 50e6);
        
        uint256[] memory shares = market.getUserShares(marketId, user1);
        assertEq(shares[0], 100e6);
        assertEq(shares[1], 50e6);
    }

    function test_RevertGetUserShares_MarketNotExists() public {
        vm.expectRevert("Market does not exist");
        market.getUserShares(999, user1);
    }

    function test_RevertGetMarketPools_MarketNotExists() public {
        vm.expectRevert("Market does not exist");
        market.getMarketPools(999);
    }

    function test_RevertHasClaimed_MarketNotExists() public {
        vm.expectRevert("Market does not exist");
        market.hasClaimed(999, 0, user1);
    }

    function test_RevertGetIndicativePrices_MarketNotExists() public {
        vm.expectRevert("Market does not exist");
        market.getIndicativePrices(999);
    }

    function test_RevertGetClaimableAmount_MarketNotExists() public {
        vm.expectRevert("Market does not exist");
        market.getClaimableAmount(999, user1);
    }

    // ============ Multiple Markets Tests ============

    function test_MultipleMarketsIndependence() public {
        uint256 market1 = createTestMarketNoFees();
        uint256 market2 = createTestMarketNoFees();
        
        // Bet on market 1
        placeBet(user1, market1, 0, 100e6);
        placeBet(user2, market1, 1, 100e6);
        
        // Bet on market 2
        placeBet(user1, market2, 1, 50e6);
        placeBet(user3, market2, 0, 150e6);
        
        // Verify totals are independent
        assertEq(getMarketTotalPot(market1), 200e6);
        assertEq(getMarketTotalPot(market2), 200e6);
        
        // Resolve market 1 for YES
        resolveMarket(market1, 0);
        
        // Market 2 should still be open
        assertEq(uint256(getMarketState(market1)), uint256(PredictionMarket.MarketState.Resolved));
        assertEq(uint256(getMarketState(market2)), uint256(PredictionMarket.MarketState.Open));
        
        // User1 claims from market 1
        vm.prank(user1);
        market.claimWinnings(market1);
        
        // Resolve market 2 for NO
        resolveMarket(market2, 1);
        
        // User1 claims from market 2 (they bet on NO which won)
        vm.prank(user1);
        market.claimWinnings(market2);
        
        // Market 1: user1 bet $100 on YES, won $200
        // Market 2: user1 bet $50 on NO, won $200 (only NO bettor)
        assertEq(usdc.balanceOf(user1), 400e6);
    }

    // ============ Refund Edge Cases ============

    function test_ClaimRefund_InvalidOutcome() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        voidMarket(marketId);

        vm.prank(user1);
        vm.expectRevert("Invalid outcome");
        market.claimRefund(marketId, 5);
    }

    function test_ClaimRefund_NoShares() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        voidMarket(marketId);

        vm.prank(user2); // User2 didn't bet
        vm.expectRevert("No shares to refund");
        market.claimRefund(marketId, 0);
    }

    function test_ClaimRefund_AlreadyClaimed() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        voidMarket(marketId);

        vm.prank(user1);
        market.claimRefund(marketId, 0);

        vm.prank(user1);
        vm.expectRevert("Already claimed");
        market.claimRefund(marketId, 0);
    }

    function test_ClaimRefund_WrongOutcome() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        voidMarket(marketId);

        // User1 bet on outcome 0, tries to claim from outcome 1
        vm.prank(user1);
        vm.expectRevert("No shares to refund");
        market.claimRefund(marketId, 1);
    }

    // ============ Betting at Exact Close Time ============

    function test_RevertBet_ExactlyAtCloseTime() public {
        uint256 marketId = createTestMarket();
        
        (,uint256 closesAt,,,,,,) = market.getMarketData(marketId);
        
        // Warp to exact close time
        vm.warp(closesAt);
        
        fundUser(user1, 100e6);
        vm.prank(user1);
        vm.expectRevert("Market closed");
        market.bet(marketId, 0, 100e6);
    }

    function test_Bet_JustBeforeCloseTime() public {
        uint256 marketId = createTestMarket();
        
        (,uint256 closesAt,,,,,,) = market.getMarketData(marketId);
        
        // Warp to 1 second before close
        vm.warp(closesAt - 1);
        
        // Should succeed
        placeBet(user1, marketId, 0, 100e6);
        assertEq(getMarketTotalPot(marketId), 100e6);
    }

    // ============ Event Emission Tests ============

    function test_LockMarket_EmitsEvent() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);

        vm.expectEmit(true, true, false, true);
        emit MarketLocked(owner, marketId, block.timestamp);

        vm.prank(owner);
        market.lockMarket(marketId);
    }

    function test_VoidMarket_EmitsEvent() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);

        vm.expectEmit(true, true, false, true);
        emit MarketVoided(owner, marketId, block.timestamp);

        vm.prank(owner);
        market.voidMarket(marketId);
    }

    function test_Resolve_EmitsEvent() public {
        uint256 marketId = createTestMarketWithFees(150, 150);
        placeBet(user1, marketId, 0, 100e6);
        placeBet(user2, marketId, 1, 100e6);

        vm.expectEmit(true, true, false, true);
        emit MarketResolved(owner, marketId, 0, 200e6, 3e6, 3e6, block.timestamp);

        vm.prank(owner);
        market.resolve(marketId, 0);
    }

    // ============ Betting on Locked Market ============

    function test_RevertBet_LockedMarket() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        lockMarket(marketId);

        fundUser(user2, 100e6);
        vm.prank(user2);
        vm.expectRevert("Market not open");
        market.bet(marketId, 0, 100e6);
    }

    // ============ KNOWN DESIGN DECISIONS (Documented Tests) ============
    
    /// @notice Document: Creator CAN resolve before closesAt (intentional for Twitch)
    /// @dev This is by design - Twitch predictions can end early. For standalone use,
    ///      consider adding timing restrictions.
    function test_DESIGN_CreatorCanResolveBeforeCloseTime() public {
        uint256 marketId = createTestMarketNoFees();
        
        // Market closes in 1 day, but we're at block.timestamp = 1
        (,uint256 closesAt,,,,,,) = market.getMarketData(marketId);
        assertGt(closesAt, block.timestamp); // Confirm market not yet closed
        
        placeBet(user1, marketId, 0, 100e6);
        
        // Creator resolves immediately (before closesAt) - THIS IS ALLOWED
        resolveMarketAsCreator(marketId, 0);
        
        assertEq(uint256(getMarketState(marketId)), uint256(PredictionMarket.MarketState.Resolved));
        
        // WARNING: In a trustless environment, this enables manipulation.
        // For Twitch integration, this is required behavior.
    }

    /// @notice Document: resolvedOutcome defaults to 0 (same as outcome ID 0)
    /// @dev Frontend should check market.state, not resolvedOutcome, to determine if resolved
    function test_DESIGN_ResolvedOutcomeDefaultsToZero() public {
        uint256 marketId = createTestMarket();
        
        (,,,, uint256 resolvedOutcome,,,) = market.getMarketData(marketId);
        
        // Before resolution, resolvedOutcome is 0 (which is also a valid outcome!)
        assertEq(resolvedOutcome, 0);
        
        // Must check state to know if actually resolved
        assertEq(uint256(getMarketState(marketId)), uint256(PredictionMarket.MarketState.Open));
    }

    // ============ Edge Case: Zero Payout (Storage Manipulation Test) ============
    
    /// @notice Test the "No payout" revert which is unreachable in normal conditions
    /// @dev This uses storage manipulation to set payoutPerShare to 0 after resolution
    ///      to achieve 100% branch coverage. In practice, this branch protects against
    ///      edge cases that might arise from future code changes.
    function test_RevertClaimWinnings_ZeroPayout() public {
        uint256 marketId = createTestMarketNoFees();
        placeBet(user1, marketId, 0, 100e6);
        placeBet(user2, marketId, 1, 100e6);
        
        resolveMarket(marketId, 0);
        
        // Manually set payoutPerShare to 0 using storage manipulation
        // Storage layout (from `forge inspect PredictionMarket storageLayout`):
        // - slot 0: _status (ReentrancyGuard)
        // - slot 1: _owner (Ownable)
        // - slot 2: marketCount
        // - slot 3: protocolTreasury
        // - slot 4: markets mapping
        // - slot 5: outcomePools mapping
        //
        // Market struct layout: question(0), image(1), outcomeCount(2), closesAt(3), 
        //                       totalPot(4), resolvedOutcome(5), payoutPerShare(6), ...
        bytes32 marketSlot = keccak256(abi.encode(marketId, uint256(4))); // markets at slot 4
        bytes32 payoutPerShareSlot = bytes32(uint256(marketSlot) + 6);
        
        vm.store(address(market), payoutPerShareSlot, bytes32(0));
        
        vm.prank(user1);
        vm.expectRevert("No payout");
        market.claimWinnings(marketId);
    }
}
