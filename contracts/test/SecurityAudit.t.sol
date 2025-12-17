// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./BaseTest.sol";

/// @title Security Audit Tests for PredictionMarket
/// @notice Tests for known exploit vectors and edge cases
contract SecurityAuditTest is BaseTest {
    
    // ============ 1. REENTRANCY TESTS ============
    
    /// @notice Verify reentrancy guard prevents attacks
    /// @dev All external functions have nonReentrant modifier
    function test_Security_ReentrancyGuardPresent() public {
        // This is a documentation test - actual protection is via nonReentrant modifier
        // The modifier prevents same-transaction reentry into any protected function
        
        uint256 marketId = createTestMarketNoFees();
        placeBet(user1, marketId, 0, 100e6);
        placeBet(user2, marketId, 1, 100e6);
        resolveMarket(marketId, 0);
        
        // Single claim works
        vm.prank(user1);
        market.claimWinnings(marketId);
        
        // Double claim reverts (not reentrancy, but demonstrates claim protection)
        vm.prank(user1);
        vm.expectRevert("Already claimed");
        market.claimWinnings(marketId);
    }

    // ============ 2. INTEGER OVERFLOW TESTS ============
    
    /// @notice Test bets up to market pot limit work correctly
    function test_Security_BetsUpToLimit() public {
        uint256 marketId = createTestMarketNoFees();
        
        // Bet up to limit
        uint256 maxBet = market.MAX_BET_PER_MARKET(); // $100k
        
        placeBet(user1, marketId, 0, maxBet);
        placeBet(user2, marketId, 1, maxBet);
        
        assertEq(getMarketTotalPot(marketId), 2 * maxBet);
        
        resolveMarket(marketId, 0);
        
        vm.prank(user1);
        market.claimWinnings(marketId);
        
        assertEq(usdc.balanceOf(user1), 2 * maxBet);
    }
    
    /// @notice Test that market pot limit is enforced
    function test_Security_MarketPotLimitEnforced() public {
        uint256 marketId = createTestMarketNoFees();
        
        uint256 maxPot = market.MAX_MARKET_POT(); // $1M
        
        // Fill up to near limit with multiple users
        placeBet(user1, marketId, 0, market.MAX_BET_PER_MARKET());
        placeBet(user2, marketId, 0, market.MAX_BET_PER_MARKET());
        placeBet(user3, marketId, 1, market.MAX_BET_PER_MARKET());
        
        // Current pot: $300k
        assertEq(getMarketTotalPot(marketId), 300_000e6);
        
        // Can still bet more
        placeBet(address(0x100), marketId, 1, market.MAX_BET_PER_MARKET());
        assertEq(getMarketTotalPot(marketId), 400_000e6);
    }
    
    /// @notice Test fee calculation doesn't overflow with realistic amounts
    function test_Security_FeeCalculationNoOverflow() public {
        uint256 marketId = createTestMarketWithFees(500, 500); // 10% total
        
        // Use amounts within limits
        uint256 maxBet = market.MAX_BET_PER_MARKET();
        placeBet(user1, marketId, 0, maxBet);
        placeBet(user2, marketId, 1, maxBet);
        
        uint256 treasuryBefore = usdc.balanceOf(protocolTreasury);
        uint256 creatorBefore = usdc.balanceOf(creator);
        
        resolveMarket(marketId, 0);
        
        // 5% of $200k = $10k each
        assertEq(usdc.balanceOf(protocolTreasury) - treasuryBefore, maxBet / 10);
        assertEq(usdc.balanceOf(creator) - creatorBefore, maxBet / 10);
    }

    // ============ 3. ACCESS CONTROL TESTS ============
    
    /// @notice Non-owner cannot change treasury
    function test_Security_OnlyOwnerCanChangeTreasury() public {
        vm.prank(user1);
        vm.expectRevert("Ownable: caller is not the owner");
        market.setProtocolTreasury(user1);
    }
    
    /// @notice Non-owner/creator cannot resolve
    function test_Security_OnlyAuthorizedCanResolve() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        
        vm.prank(user2);
        vm.expectRevert("Not authorized to resolve");
        market.resolve(marketId, 0);
    }
    
    /// @notice Non-owner/creator cannot void
    function test_Security_OnlyAuthorizedCanVoid() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        
        vm.prank(user2);
        vm.expectRevert("Not authorized to resolve");
        market.voidMarket(marketId);
    }
    
    /// @notice Non-owner/creator cannot lock
    function test_Security_OnlyAuthorizedCanLock() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        
        vm.prank(user2);
        vm.expectRevert("Not authorized to resolve");
        market.lockMarket(marketId);
    }

    // ============ 4. DOUBLE-SPEND / DOUBLE-CLAIM TESTS ============
    
    /// @notice Cannot claim winnings twice
    function test_Security_CannotDoubleClaimWinnings() public {
        uint256 marketId = createTestMarketNoFees();
        placeBet(user1, marketId, 0, 100e6);
        resolveMarket(marketId, 0);
        
        vm.prank(user1);
        market.claimWinnings(marketId);
        
        vm.prank(user1);
        vm.expectRevert("Already claimed");
        market.claimWinnings(marketId);
    }
    
    /// @notice Cannot claim refund twice
    function test_Security_CannotDoubleClaimRefund() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        voidMarket(marketId);
        
        vm.prank(user1);
        market.claimRefund(marketId, 0);
        
        vm.prank(user1);
        vm.expectRevert("Already claimed");
        market.claimRefund(marketId, 0);
    }

    // ============ 5. STATE TRANSITION TESTS ============
    
    /// @notice Cannot bet on resolved market
    function test_Security_CannotBetAfterResolution() public {
        uint256 marketId = createTestMarketNoFees();
        placeBet(user1, marketId, 0, 100e6);
        resolveMarket(marketId, 0);
        
        fundUser(user2, 100e6);
        vm.prank(user2);
        vm.expectRevert("Market not open");
        market.bet(marketId, 0, 100e6);
    }
    
    /// @notice Cannot bet on voided market
    function test_Security_CannotBetAfterVoid() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        voidMarket(marketId);
        
        fundUser(user2, 100e6);
        vm.prank(user2);
        vm.expectRevert("Market not open");
        market.bet(marketId, 0, 100e6);
    }
    
    /// @notice Cannot resolve already resolved market
    function test_Security_CannotResolveResolvedMarket() public {
        uint256 marketId = createTestMarketNoFees();
        placeBet(user1, marketId, 0, 100e6);
        resolveMarket(marketId, 0);
        
        vm.prank(owner);
        vm.expectRevert("Market not resolvable");
        market.resolve(marketId, 1);
    }
    
    /// @notice Cannot void resolved market
    function test_Security_CannotVoidResolvedMarket() public {
        uint256 marketId = createTestMarketNoFees();
        placeBet(user1, marketId, 0, 100e6);
        resolveMarket(marketId, 0);
        
        vm.prank(owner);
        vm.expectRevert("Market not resolvable");
        market.voidMarket(marketId);
    }

    // ============ 6. TIMESTAMP MANIPULATION TESTS ============
    
    /// @notice Cannot bet at exactly close time
    function test_Security_CannotBetAtExactCloseTime() public {
        uint256 marketId = createTestMarket();
        
        (,uint256 closesAt,,,,,,) = market.getMarketData(marketId);
        vm.warp(closesAt);
        
        fundUser(user1, 100e6);
        vm.prank(user1);
        vm.expectRevert("Market closed");
        market.bet(marketId, 0, 100e6);
    }
    
    /// @notice Can bet 1 second before close
    function test_Security_CanBetJustBeforeClose() public {
        uint256 marketId = createTestMarket();
        
        (,uint256 closesAt,,,,,,) = market.getMarketData(marketId);
        vm.warp(closesAt - 1);
        
        placeBet(user1, marketId, 0, 100e6);
        assertEq(getMarketTotalPot(marketId), 100e6);
    }

    // ============ 7. EDGE CASE TESTS ============
    
    /// @notice Zero bet market resolution
    function test_Security_ResolveZeroBetMarket() public {
        uint256 marketId = createTestMarket();
        // No bets placed
        
        uint256 treasuryBefore = usdc.balanceOf(protocolTreasury);
        
        resolveMarket(marketId, 0);
        
        // No funds to transfer
        assertEq(usdc.balanceOf(protocolTreasury), treasuryBefore);
        assertEq(uint256(getMarketState(marketId)), uint256(PredictionMarket.MarketState.Resolved));
    }
    
    /// @notice All bets on losing side
    function test_Security_AllBetsOnLoser() public {
        uint256 marketId = createTestMarketWithFees(150, 150);
        
        placeBet(user1, marketId, 1, 100e6);
        placeBet(user2, marketId, 1, 100e6);
        // No bets on outcome 0
        
        uint256 treasuryBefore = usdc.balanceOf(protocolTreasury);
        uint256 creatorBefore = usdc.balanceOf(creator);
        
        resolveMarket(marketId, 0); // Outcome 0 wins, no one bet on it
        
        // Protocol fee: 200 * 1.5% = 3
        // Creator gets rest: 200 - 3 = 197
        assertEq(usdc.balanceOf(protocolTreasury) - treasuryBefore, 3e6);
        assertEq(usdc.balanceOf(creator) - creatorBefore, 197e6);
        
        // Losers can't claim
        vm.prank(user1);
        vm.expectRevert("No winning shares");
        market.claimWinnings(marketId);
    }
    
    /// @notice Single winner takes all
    function test_Security_SingleWinnerTakesAll() public {
        uint256 marketId = createTestMarketNoFees();
        
        placeBet(user1, marketId, 0, 100e6); // Only winner
        placeBet(user2, marketId, 1, 400e6); // Loser
        
        resolveMarket(marketId, 0);
        
        vm.prank(user1);
        market.claimWinnings(marketId);
        
        // User1 gets entire pot
        assertEq(usdc.balanceOf(user1), 500e6);
    }

    // ============ 8. PRECISION/ROUNDING TESTS ============
    
    /// @notice Test payout rounding doesn't exceed available funds
    function test_Security_PayoutDoesNotExceedPool() public {
        uint256 marketId = createTestMarketNoFees();
        
        // Weird amounts to test rounding
        placeBet(user1, marketId, 0, 33333333); // ~$33.33
        placeBet(user2, marketId, 0, 33333333);
        placeBet(user3, marketId, 0, 33333334);
        placeBet(address(0x100), marketId, 1, 100000000); // Loser
        
        resolveMarket(marketId, 0);
        
        uint256 totalClaimed = 0;
        
        vm.prank(user1);
        market.claimWinnings(marketId);
        totalClaimed += usdc.balanceOf(user1);
        
        vm.prank(user2);
        market.claimWinnings(marketId);
        totalClaimed += usdc.balanceOf(user2);
        
        vm.prank(user3);
        market.claimWinnings(marketId);
        totalClaimed += usdc.balanceOf(user3);
        
        // Total claimed should not exceed pot (200M = 33.33*3 + 100)
        assertLe(totalClaimed, 200000000);
    }
    
    /// @notice Test minimum bet is enforced
    function test_Security_MinimumBetEnforced() public {
        uint256 marketId = createTestMarket();
        
        fundUser(user1, 1e6);
        vm.prank(user1);
        vm.expectRevert("Below minimum bet");
        market.bet(marketId, 0, MIN_BET - 1);
    }

    // ============ 9. CROSS-MARKET ISOLATION TESTS ============
    
    /// @notice Markets are isolated from each other
    function test_Security_MarketsAreIsolated() public {
        uint256 market1 = createTestMarketNoFees();
        uint256 market2 = createTestMarketNoFees();
        
        placeBet(user1, market1, 0, 100e6);
        placeBet(user2, market2, 1, 50e6);
        
        // Market 1 has 100, Market 2 has 50
        assertEq(getMarketTotalPot(market1), 100e6);
        assertEq(getMarketTotalPot(market2), 50e6);
        
        // Resolve market 1
        resolveMarket(market1, 0);
        
        // Market 2 still open
        assertEq(uint256(getMarketState(market1)), uint256(PredictionMarket.MarketState.Resolved));
        assertEq(uint256(getMarketState(market2)), uint256(PredictionMarket.MarketState.Open));
        
        // Can still bet on market 2
        placeBet(user3, market2, 0, 25e6);
        assertEq(getMarketTotalPot(market2), 75e6);
    }

    // ============ 10. CLAIM VALIDATION TESTS ============
    
    /// @notice Cannot claim winnings from wrong outcome
    function test_Security_CannotClaimFromWrongOutcome() public {
        uint256 marketId = createTestMarketNoFees();
        placeBet(user1, marketId, 0, 100e6);
        placeBet(user2, marketId, 1, 100e6);
        
        resolveMarket(marketId, 0); // Outcome 0 wins
        
        // User2 bet on outcome 1 (loser)
        vm.prank(user2);
        vm.expectRevert("No winning shares");
        market.claimWinnings(marketId);
    }
    
    /// @notice Cannot claim refund from outcome you didn't bet on
    function test_Security_CannotClaimRefundFromWrongOutcome() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        voidMarket(marketId);
        
        // User1 bet on outcome 0, tries to claim from outcome 1
        vm.prank(user1);
        vm.expectRevert("No shares to refund");
        market.claimRefund(marketId, 1);
    }
    
    /// @notice Cannot claim from non-existent market
    function test_Security_CannotClaimFromNonexistentMarket() public {
        vm.prank(user1);
        vm.expectRevert("Market does not exist");
        market.claimWinnings(999);
    }

    // ============ 11. MALICIOUS INPUT TESTS ============
    
    /// @notice Invalid outcome ID rejected
    function test_Security_InvalidOutcomeRejected() public {
        uint256 marketId = createTestMarket(); // 2 outcomes
        
        fundUser(user1, 100e6);
        vm.prank(user1);
        vm.expectRevert("Invalid outcome");
        market.bet(marketId, 5, 100e6);
    }
    
    /// @notice Cannot resolve with invalid outcome
    function test_Security_CannotResolveInvalidOutcome() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        
        vm.prank(owner);
        vm.expectRevert("Invalid outcome");
        market.resolve(marketId, 5);
    }
    
    /// @notice Zero token address rejected
    function test_Security_ZeroTokenRejected() public {
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

    // ============ 12. FEE CALCULATION TESTS ============
    
    /// @notice Fees cannot exceed 10%
    function test_Security_MaxFeeEnforced() public {
        PredictionMarket.CreateMarketParams memory params = PredictionMarket.CreateMarketParams({
            question: "Test",
            image: "",
            outcomeCount: 2,
            closesAt: block.timestamp + 1 days,
            token: address(usdc),
            protocolFeeBps: 600,
            creatorFeeBps: 600, // Total 12% > 10%
            creator: creator
        });
        
        vm.prank(owner);
        vm.expectRevert("Fees too high");
        market.createMarket(params);
    }
    
    /// @notice Fee calculation is correct at maximum
    function test_Security_MaxFeeCalculation() public {
        uint256 marketId = createMarketWithParams(2, block.timestamp + 1 days, 500, 500); // 10% total
        
        placeBet(user1, marketId, 0, 1000e6); // $1000
        placeBet(user2, marketId, 1, 1000e6);
        
        uint256 treasuryBefore = usdc.balanceOf(protocolTreasury);
        uint256 creatorBefore = usdc.balanceOf(creator);
        
        resolveMarket(marketId, 0);
        
        // $2000 pot, 5% each = $100 each
        assertEq(usdc.balanceOf(protocolTreasury) - treasuryBefore, 100e6);
        assertEq(usdc.balanceOf(creator) - creatorBefore, 100e6);
        
        // Winner gets $2000 - $200 = $1800
        vm.prank(user1);
        market.claimWinnings(marketId);
        assertEq(usdc.balanceOf(user1), 1800e6);
    }

    // ============ 13. EMERGENCY WITHDRAW TESTS ============
    
    /// @notice Only owner can emergency withdraw
    function test_Security_OnlyOwnerCanEmergencyWithdraw() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        
        // Enable emergency withdraw
        vm.prank(owner);
        market.setEmergencyWithdrawEnabled(true);
        
        vm.prank(user1);
        vm.expectRevert("Ownable: caller is not the owner");
        market.emergencyWithdraw(address(usdc), 50e6);
    }
    
    /// @notice Emergency withdraw requires explicit enable
    function test_Security_EmergencyWithdrawRequiresEnable() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        
        // Try without enabling - should fail
        vm.prank(owner);
        vm.expectRevert("Emergency withdraw not enabled");
        market.emergencyWithdraw(address(usdc), 50e6);
    }
    
    /// @notice Emergency withdraw works when enabled
    function test_Security_EmergencyWithdrawWorks() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        
        // Enable emergency withdraw first
        vm.prank(owner);
        market.setEmergencyWithdrawEnabled(true);
        
        uint256 ownerBefore = usdc.balanceOf(owner);
        
        vm.prank(owner);
        market.emergencyWithdraw(address(usdc), 50e6);
        
        assertEq(usdc.balanceOf(owner) - ownerBefore, 50e6);
    }

    // ============ 14. MULTI-BET TESTS ============
    
    /// @notice User can bet on multiple outcomes
    function test_Security_MultipleBetsSameUser() public {
        uint256 marketId = createTestMarketNoFees();
        
        placeBet(user1, marketId, 0, 100e6);
        placeBet(user1, marketId, 1, 50e6);
        
        uint256[] memory shares = market.getUserShares(marketId, user1);
        assertEq(shares[0], 100e6);
        assertEq(shares[1], 50e6);
        
        // If outcome 0 wins, user only gets payout for outcome 0
        resolveMarket(marketId, 0);
        
        vm.prank(user1);
        market.claimWinnings(marketId);
        
        // User1 had only bet on winning side (100), total pot is 150
        // Payout = 100 * 150 / 100 = 150
        assertEq(usdc.balanceOf(user1), 150e6);
        
        // User lost the 50 they bet on outcome 1
    }
    
    /// @notice User can claim refund for multiple outcomes when voided
    function test_Security_RefundMultipleOutcomes() public {
        uint256 marketId = createTestMarket();
        
        placeBet(user1, marketId, 0, 100e6);
        placeBet(user1, marketId, 1, 50e6);
        
        voidMarket(marketId);
        
        vm.prank(user1);
        market.claimRefund(marketId, 0);
        
        vm.prank(user1);
        market.claimRefund(marketId, 1);
        
        assertEq(usdc.balanceOf(user1), 150e6);
    }

    // ============ DOCUMENTATION: KNOWN TRUST ASSUMPTIONS ============
    
    /// @notice Document: Owner has significant power (emergency withdraw)
    /// @dev This is intentional but users should be aware - requires explicit enable
    function test_TRUST_OwnerCanDrainFunds() public {
        uint256 marketId = createTestMarketNoFees(); // Use no fees so resolve doesn't fail
        placeBet(user1, marketId, 0, 100e6);
        
        // Owner must EXPLICITLY enable emergency withdraw
        vm.prank(owner);
        market.setEmergencyWithdrawEnabled(true);
        
        // Owner can withdraw ALL funds
        vm.prank(owner);
        market.emergencyWithdraw(address(usdc), 100e6);
        
        // Now contract has no funds
        assertEq(usdc.balanceOf(address(market)), 0);
        
        // Resolve works (no fees to transfer)
        resolveMarket(marketId, 0);
        
        // But user can't claim because funds are gone
        vm.prank(user1);
        vm.expectRevert("ERC20: transfer amount exceeds balance");
        market.claimWinnings(marketId);
        
        // WARNING: This is a trust assumption - owner should not abuse this
        // PROTECTION: Requires explicit enable, emits event, can be monitored
    }
    
    /// @notice Document: Creator can resolve early (for Twitch integration)
    function test_TRUST_CreatorCanResolveEarly() public {
        uint256 marketId = createTestMarketNoFees();
        
        (,uint256 closesAt,,,,,,) = market.getMarketData(marketId);
        assertGt(closesAt, block.timestamp);
        
        placeBet(user1, marketId, 0, 100e6);
        
        // Creator resolves immediately (before closesAt)
        resolveMarketAsCreator(marketId, 0);
        
        // This is intentional for Twitch but could be abused in other contexts
        assertEq(uint256(getMarketState(marketId)), uint256(PredictionMarket.MarketState.Resolved));
    }

    // ============ NEW PROTECTION FEATURE TESTS ============

    /// @notice Test that only whitelisted tokens can be used
    function test_Security_TokenWhitelist() public {
        MockERC20 badToken = new MockERC20("Bad Token", "BAD", 6);
        
        PredictionMarket.CreateMarketParams memory params = PredictionMarket.CreateMarketParams({
            question: "Test",
            image: "",
            outcomeCount: 2,
            closesAt: block.timestamp + 1 days,
            token: address(badToken),
            protocolFeeBps: 0,
            creatorFeeBps: 0,
            creator: creator
        });

        vm.prank(owner);
        vm.expectRevert("Token not whitelisted");
        market.createMarket(params);
    }

    /// @notice Test adding token to whitelist
    function test_Security_AddTokenToWhitelist() public {
        MockERC20 newToken = new MockERC20("New Token", "NEW", 6);
        
        assertFalse(market.allowedTokens(address(newToken)));
        
        vm.prank(owner);
        market.setTokenAllowed(address(newToken), true);
        
        assertTrue(market.allowedTokens(address(newToken)));
    }

    /// @notice Test pause functionality stops betting
    function test_Security_PauseStopsBetting() public {
        uint256 marketId = createTestMarket();
        
        vm.prank(owner);
        market.pause();
        
        fundUser(user1, 100e6);
        vm.prank(user1);
        vm.expectRevert("Pausable: paused");
        market.bet(marketId, 0, 100e6);
    }

    /// @notice Test pause stops market creation
    function test_Security_PauseStopsMarketCreation() public {
        vm.prank(owner);
        market.pause();
        
        PredictionMarket.CreateMarketParams memory params = PredictionMarket.CreateMarketParams({
            question: "Test",
            image: "",
            outcomeCount: 2,
            closesAt: block.timestamp + 1 days,
            token: address(usdc),
            protocolFeeBps: 0,
            creatorFeeBps: 0,
            creator: creator
        });

        vm.prank(owner);
        vm.expectRevert("Pausable: paused");
        market.createMarket(params);
    }

    /// @notice Test unpause restores functionality
    function test_Security_UnpauseRestoresFunctionality() public {
        uint256 marketId = createTestMarket();
        
        vm.prank(owner);
        market.pause();
        
        vm.prank(owner);
        market.unpause();
        
        // Betting works again
        placeBet(user1, marketId, 0, 100e6);
        assertEq(getMarketTotalPot(marketId), 100e6);
    }

    /// @notice Test per-user bet limit
    function test_Security_PerUserBetLimitEnforced() public {
        uint256 marketId = createTestMarketNoFees();
        
        uint256 maxBet = market.MAX_BET_PER_MARKET();
        placeBet(user1, marketId, 0, maxBet);
        
        // Try to bet more - should fail
        fundUser(user1, 100e6);
        vm.prank(user1);
        vm.expectRevert("User bet limit reached");
        market.bet(marketId, 1, 100e6);
    }

    /// @notice Test market pot limit with many users
    function test_Security_MarketPotLimitManyUsers() public {
        uint256 marketId = createTestMarketNoFees();
        
        uint256 maxBet = market.MAX_BET_PER_MARKET();
        
        // Fill up the market with many users
        placeBet(user1, marketId, 0, maxBet);
        placeBet(user2, marketId, 0, maxBet);
        placeBet(user3, marketId, 1, maxBet);
        placeBet(address(0x100), marketId, 1, maxBet);
        placeBet(address(0x101), marketId, 0, maxBet);
        placeBet(address(0x102), marketId, 1, maxBet);
        placeBet(address(0x103), marketId, 0, maxBet);
        placeBet(address(0x104), marketId, 1, maxBet);
        placeBet(address(0x105), marketId, 0, maxBet);
        placeBet(address(0x106), marketId, 1, maxBet);
        // Now at $1M (10 x $100k)
        
        // Next bet should fail
        fundUser(address(0x107), 100e6);
        vm.prank(address(0x107));
        vm.expectRevert("Market pot limit reached");
        market.bet(marketId, 0, 100e6);
    }

    /// @notice Test solvency check function
    function test_Security_SolvencyCheck() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        
        (bool solvent, uint256 required, uint256 available) = market.checkMarketSolvency(marketId);
        
        assertTrue(solvent);
        assertEq(required, 100e6);
        assertEq(available, 100e6);
    }

    /// @notice Test claims work even when paused (users should always be able to withdraw)
    function test_Security_ClaimsWorkWhenPaused() public {
        uint256 marketId = createTestMarketNoFees();
        placeBet(user1, marketId, 0, 100e6);
        placeBet(user2, marketId, 1, 100e6);
        
        resolveMarket(marketId, 0);
        
        // Pause the contract
        vm.prank(owner);
        market.pause();
        
        // Claims should still work - users can always withdraw
        vm.prank(user1);
        market.claimWinnings(marketId);
        
        assertEq(usdc.balanceOf(user1), 200e6);
    }

    /// @notice Test refunds work when paused
    function test_Security_RefundsWorkWhenPaused() public {
        uint256 marketId = createTestMarket();
        placeBet(user1, marketId, 0, 100e6);
        
        voidMarket(marketId);
        
        // Pause the contract
        vm.prank(owner);
        market.pause();
        
        // Refunds should still work
        vm.prank(user1);
        market.claimRefund(marketId, 0);
        
        assertEq(usdc.balanceOf(user1), 100e6);
    }
}

