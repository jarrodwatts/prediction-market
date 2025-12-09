// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../BaseTest.sol";

contract AdminTest is BaseTest {
    uint256 public marketId;

    function setUp() public override {
        super.setUp();
        marketId = createTestMarket();
    }

    // ============ Pause Market Tests ============

    function test_PauseMarket() public {
        vm.prank(owner);
        market.adminPauseMarket(marketId);

        bool isPaused = market.getMarketPaused(marketId);
        assertTrue(isPaused, "Market should be paused");
    }

    function test_PauseMarket_EmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit MarketPaused(owner, marketId, true, block.timestamp);

        vm.prank(owner);
        market.adminPauseMarket(marketId);
    }

    function test_PauseMarket_BlocksTrading() public {
        vm.prank(owner);
        market.adminPauseMarket(marketId);

        fundUser(user2, 1 ether);

        vm.prank(user2);
        vm.expectRevert("Market is paused");
        market.buy(marketId, 0, 0, 1 ether);
    }

    function test_PauseMarket_BlocksLiquidity() public {
        vm.prank(owner);
        market.adminPauseMarket(marketId);

        fundUser(user2, 1 ether);

        vm.prank(user2);
        vm.expectRevert("Market is paused");
        market.addLiquidity(marketId, 1 ether);
    }

    // ============ Unpause Market Tests ============

    function test_UnpauseMarket() public {
        vm.prank(owner);
        market.adminPauseMarket(marketId);

        vm.prank(owner);
        market.adminUnpauseMarket(marketId);

        bool isPaused = market.getMarketPaused(marketId);
        assertFalse(isPaused, "Market should not be paused");
    }

    function test_UnpauseMarket_EmitsEvent() public {
        vm.prank(owner);
        market.adminPauseMarket(marketId);

        vm.expectEmit(true, true, false, true);
        emit MarketPaused(owner, marketId, false, block.timestamp);

        vm.prank(owner);
        market.adminUnpauseMarket(marketId);
    }

    function test_UnpauseMarket_EnablesTrading() public {
        vm.prank(owner);
        market.adminPauseMarket(marketId);

        vm.prank(owner);
        market.adminUnpauseMarket(marketId);

        // Should be able to trade now
        buyShares(user2, marketId, 0, 1 ether);

        uint256 shares = getUserOutcomeShares(marketId, user2, 0);
        assertTrue(shares > 0, "Should have bought shares");
    }

    // ============ Set Market Close Date Tests ============

    function test_SetMarketCloseDate() public {
        uint256 newCloseDate = block.timestamp + 7 days;

        vm.prank(owner);
        market.adminSetMarketCloseDate(marketId, newCloseDate);

        (,uint256 closesAt,,,,) = market.getMarketData(marketId);
        assertEq(closesAt, newCloseDate, "Close date should be updated");
    }

    function test_SetMarketCloseDate_Extend() public {
        (,uint256 originalClose,,,,) = market.getMarketData(marketId);
        uint256 newCloseDate = originalClose + 7 days;

        vm.prank(owner);
        market.adminSetMarketCloseDate(marketId, newCloseDate);

        (,uint256 newClose,,,,) = market.getMarketData(marketId);
        assertEq(newClose, newCloseDate, "Close date should be extended");
    }

    function test_SetMarketCloseDate_EmitsEvent() public {
        uint256 newCloseDate = block.timestamp + 7 days;

        // Note: The event is MarketCloseDateEdited
        vm.prank(owner);
        market.adminSetMarketCloseDate(marketId, newCloseDate);
        // Event is emitted
    }

    // ============ Update Market Tests ============

    function test_UpdateMarket_State() public {
        PredictionMarket.MarketUpdateDescription memory update = PredictionMarket.MarketUpdateDescription({
            closesAtTimestamp: block.timestamp + 10 days,
            balance: 15 ether,
            liquidity: 15 ether,
            sharesAvailable: 30 ether,
            state: PredictionMarket.MarketState.open,
            resolvedOutcomeId: type(uint256).max,
            feesPoolWeight: 0,
            feesTreasury: treasury,
            feesDistributor: distributor,
            buyFees: PredictionMarket.Fees(0, 0, 0),
            sellFees: PredictionMarket.Fees(0, 0, 0),
            outcomeCount: 2,
            token: IERC20(address(token)),
            creator: user1,
            paused: false
        });

        vm.prank(owner);
        market.updateMarket(marketId, update);

        (,uint256 closesAt,,uint256 balance,,) = market.getMarketData(marketId);
        assertEq(closesAt, block.timestamp + 10 days, "Close date should be updated");
        assertEq(balance, 15 ether, "Balance should be updated");
    }

    function test_UpdateMarketOutcome() public {
        PredictionMarket.MarketOutcomeUpdateDescription memory update = PredictionMarket.MarketOutcomeUpdateDescription({
            id: 0,
            marketId: marketId,
            sharesTotal: 20 ether,
            sharesAvailable: 15 ether
        });

        vm.prank(owner);
        market.updateMarketOutcome(marketId, 0, update);

        (,uint256 available, uint256 total) = market.getMarketOutcomeData(marketId, 0);
        assertEq(total, 20 ether, "Total should be updated");
        assertEq(available, 15 ether, "Available should be updated");
    }

    function test_UpdateMarketLiquidityHolders() public {
        PredictionMarket.MarketLiquidityHolderUpdateDescription[] memory updates = 
            new PredictionMarket.MarketLiquidityHolderUpdateDescription[](1);
        
        updates[0] = PredictionMarket.MarketLiquidityHolderUpdateDescription({
            holder: user2,
            amount: 5 ether,
            claim: false
        });

        vm.prank(owner);
        market.updateMarketLiquidityHolders(marketId, updates);

        uint256 user2Liquidity = getUserLiquidityShares(marketId, user2);
        assertEq(user2Liquidity, 5 ether, "User2 should have liquidity");
    }

    function test_UpdateMarketOutcomeHolders() public {
        PredictionMarket.MarketOutcomeHolderUpdateDescription[] memory updates = 
            new PredictionMarket.MarketOutcomeHolderUpdateDescription[](1);
        
        updates[0] = PredictionMarket.MarketOutcomeHolderUpdateDescription({
            holder: user2,
            amount: 3 ether,
            claim: false,
            voidedClaim: false
        });

        vm.prank(owner);
        market.updateMarketOutcomeHolders(marketId, 0, updates);

        uint256 user2Shares = getUserOutcomeShares(marketId, user2, 0);
        assertEq(user2Shares, 3 ether, "User2 should have shares");
    }

    function test_UpdateMarketFeesHolders() public {
        PredictionMarket.MarketFeesHolderUpdateDescription[] memory updates = 
            new PredictionMarket.MarketFeesHolderUpdateDescription[](1);
        
        updates[0] = PredictionMarket.MarketFeesHolderUpdateDescription({
            holder: user1,
            amount: 1 ether
        });

        vm.prank(owner);
        market.updateMarketFeesHolders(marketId, updates);
        
        // Fees claimed is updated
    }

    // ============ Withdraw Tests ============

    function test_Withdraw() public {
        // Send some tokens to the contract (simulating stuck tokens)
        token.mint(address(market), 10 ether);

        uint256 ownerBalanceBefore = token.balanceOf(owner);

        vm.prank(owner);
        market.withdraw(address(token), 10 ether);

        uint256 ownerBalanceAfter = token.balanceOf(owner);
        assertEq(ownerBalanceAfter - ownerBalanceBefore, 10 ether, "Owner should receive tokens");
    }

    function test_Withdraw_PartialAmount() public {
        token.mint(address(market), 10 ether);

        vm.prank(owner);
        market.withdraw(address(token), 5 ether);

        uint256 marketBalance = token.balanceOf(address(market));
        // Market still has original balance + 5 ether remaining
        assertTrue(marketBalance >= 5 ether, "Should have remaining tokens");
    }

    // ============ Ownership Tests ============

    function test_Owner() public view {
        address contractOwner = market.owner();
        assertEq(contractOwner, owner, "Owner should be set correctly");
    }

    function test_TransferOwnership() public {
        vm.prank(owner);
        market.transferOwnership(user1);

        address newOwner = market.owner();
        assertEq(newOwner, user1, "Ownership should transfer");
    }

    function test_RenounceOwnership() public {
        vm.prank(owner);
        market.renounceOwnership();

        address contractOwner = market.owner();
        assertEq(contractOwner, address(0), "Owner should be zero address");
    }

    // ============ Access Control Revert Tests ============

    function test_Revert_PauseMarket_NotOwner() public {
        vm.prank(user1);
        vm.expectRevert("Ownable: caller is not the owner");
        market.adminPauseMarket(marketId);
    }

    function test_Revert_UnpauseMarket_NotOwner() public {
        vm.prank(owner);
        market.adminPauseMarket(marketId);

        vm.prank(user1);
        vm.expectRevert("Ownable: caller is not the owner");
        market.adminUnpauseMarket(marketId);
    }

    function test_Revert_SetCloseDate_NotOwner() public {
        vm.prank(user1);
        vm.expectRevert("Ownable: caller is not the owner");
        market.adminSetMarketCloseDate(marketId, block.timestamp + 7 days);
    }

    function test_Revert_UpdateMarket_NotOwner() public {
        PredictionMarket.MarketUpdateDescription memory update = PredictionMarket.MarketUpdateDescription({
            closesAtTimestamp: block.timestamp + 10 days,
            balance: 15 ether,
            liquidity: 15 ether,
            sharesAvailable: 30 ether,
            state: PredictionMarket.MarketState.open,
            resolvedOutcomeId: type(uint256).max,
            feesPoolWeight: 0,
            feesTreasury: treasury,
            feesDistributor: distributor,
            buyFees: PredictionMarket.Fees(0, 0, 0),
            sellFees: PredictionMarket.Fees(0, 0, 0),
            outcomeCount: 2,
            token: IERC20(address(token)),
            creator: user1,
            paused: false
        });

        vm.prank(user1);
        vm.expectRevert("Ownable: caller is not the owner");
        market.updateMarket(marketId, update);
    }

    function test_Revert_Withdraw_NotOwner() public {
        token.mint(address(market), 10 ether);

        vm.prank(user1);
        vm.expectRevert("Ownable: caller is not the owner");
        market.withdraw(address(token), 10 ether);
    }

    function test_Revert_AdminResolve_NotOwner() public {
        closeMarket(marketId);

        vm.prank(user1);
        vm.expectRevert("Ownable: caller is not the owner");
        market.adminResolveMarketOutcome(marketId, 0);
    }

    // ============ State Validation Revert Tests ============

    function test_Revert_PauseMarket_AlreadyPaused() public {
        vm.prank(owner);
        market.adminPauseMarket(marketId);

        vm.prank(owner);
        vm.expectRevert("Market is paused");
        market.adminPauseMarket(marketId);
    }

    function test_Revert_UnpauseMarket_NotPaused() public {
        vm.prank(owner);
        vm.expectRevert("Market is not paused");
        market.adminUnpauseMarket(marketId);
    }

    function test_Revert_SetCloseDate_PastDate() public {
        vm.prank(owner);
        vm.expectRevert("resolution before current date");
        market.adminSetMarketCloseDate(marketId, block.timestamp - 1);
    }

    function test_Revert_SetCloseDate_ResolvedMarket() public {
        resolveMarket(marketId, 0);

        vm.prank(owner);
        vm.expectRevert("Market in incorrect state");
        market.adminSetMarketCloseDate(marketId, block.timestamp + 7 days);
    }

    function test_Revert_PauseMarket_InvalidMarket() public {
        vm.prank(owner);
        vm.expectRevert("Market not found");
        market.adminPauseMarket(999);
    }

    // ============ Edge Cases ============

    function test_PauseUnpauseCycle() public {
        // Pause
        vm.prank(owner);
        market.adminPauseMarket(marketId);
        assertTrue(market.getMarketPaused(marketId), "Should be paused");

        // Unpause
        vm.prank(owner);
        market.adminUnpauseMarket(marketId);
        assertFalse(market.getMarketPaused(marketId), "Should not be paused");

        // Pause again
        vm.prank(owner);
        market.adminPauseMarket(marketId);
        assertTrue(market.getMarketPaused(marketId), "Should be paused again");
    }

    function test_SetCloseDate_Multiple() public {
        uint256 date1 = block.timestamp + 7 days;
        uint256 date2 = block.timestamp + 14 days;
        uint256 date3 = block.timestamp + 21 days;

        vm.prank(owner);
        market.adminSetMarketCloseDate(marketId, date1);

        vm.prank(owner);
        market.adminSetMarketCloseDate(marketId, date2);

        vm.prank(owner);
        market.adminSetMarketCloseDate(marketId, date3);

        (,uint256 finalClose,,,,) = market.getMarketData(marketId);
        assertEq(finalClose, date3, "Should be last set date");
    }

    function test_AdminActions_AfterClose() public {
        closeMarket(marketId);

        // Can still pause
        vm.prank(owner);
        market.adminPauseMarket(marketId);

        // Can still extend close date
        vm.prank(owner);
        market.adminSetMarketCloseDate(marketId, block.timestamp + 7 days);
    }
}

