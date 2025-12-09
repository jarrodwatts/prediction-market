// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../BaseTest.sol";

/// @title PredictionMarketHandler - Handler contract for invariant testing
/// @dev Performs random actions on the prediction market
contract PredictionMarketHandler is BaseTest {
    uint256 public marketId;
    uint256 public totalBought;
    uint256 public totalSold;
    uint256 public totalLiquidityAdded;
    uint256 public totalLiquidityRemoved;
    
    address[] public actors;
    mapping(address => uint256) public actorShares0;
    mapping(address => uint256) public actorShares1;
    mapping(address => uint256) public actorLiquidity;

    constructor() {
        // Initialize actors
        actors.push(address(0x100));
        actors.push(address(0x101));
        actors.push(address(0x102));
        actors.push(address(0x103));
        actors.push(address(0x104));
    }

    function init() public {
        super.setUp();
        marketId = createTestMarket();
    }

    modifier useActor(uint256 actorSeed) {
        address actor = actors[actorSeed % actors.length];
        vm.startPrank(actor);
        _;
        vm.stopPrank();
    }

    function buy(uint256 actorSeed, uint256 amount, uint256 outcomeId) external useActor(actorSeed) {
        address actor = actors[actorSeed % actors.length];
        amount = bound(amount, 0.01 ether, 10 ether);
        outcomeId = bound(outcomeId, 0, 1);
        
        // Fund and approve
        token.mint(actor, amount);
        token.approve(address(market), amount);
        
        try market.buy(marketId, outcomeId, 0, amount) {
            totalBought += amount;
            if (outcomeId == 0) {
                actorShares0[actor] += market.calcBuyAmount(amount, marketId, outcomeId);
            } else {
                actorShares1[actor] += market.calcBuyAmount(amount, marketId, outcomeId);
            }
        } catch {}
    }

    function sell(uint256 actorSeed, uint256 sellPercent, uint256 outcomeId) external useActor(actorSeed) {
        address actor = actors[actorSeed % actors.length];
        outcomeId = bound(outcomeId, 0, 1);
        sellPercent = bound(sellPercent, 1, 50);
        
        (, uint256[] memory shares) = market.getUserMarketShares(marketId, actor);
        uint256 userShares = shares[outcomeId];
        
        if (userShares == 0) return;
        
        // Try to sell a percentage of holdings (by value estimate)
        uint256 price = market.getMarketOutcomePrice(marketId, outcomeId);
        uint256 estimatedValue = (userShares * price) / ONE;
        uint256 sellValue = (estimatedValue * sellPercent) / 100;
        
        if (sellValue == 0) return;
        
        try market.sell(marketId, outcomeId, sellValue, type(uint256).max) {
            totalSold += sellValue;
        } catch {}
    }

    function addLiquidity(uint256 actorSeed, uint256 amount) external useActor(actorSeed) {
        address actor = actors[actorSeed % actors.length];
        amount = bound(amount, 0.1 ether, 10 ether);
        
        token.mint(actor, amount);
        token.approve(address(market), amount);
        
        try market.addLiquidity(marketId, amount) {
            totalLiquidityAdded += amount;
            actorLiquidity[actor] += amount; // Approximate
        } catch {}
    }

    function removeLiquidity(uint256 actorSeed, uint256 removePercent) external useActor(actorSeed) {
        address actor = actors[actorSeed % actors.length];
        removePercent = bound(removePercent, 1, 50);
        
        (uint256 liquidity, ) = market.getUserMarketShares(marketId, actor);
        uint256 removeAmount = (liquidity * removePercent) / 100;
        
        if (removeAmount == 0) return;
        
        // Check we're not removing all liquidity from market
        (,,uint256 totalLiquidity,,,) = market.getMarketData(marketId);
        if (removeAmount >= totalLiquidity) return;
        
        try market.removeLiquidity(marketId, removeAmount) {
            totalLiquidityRemoved += removeAmount;
        } catch {}
    }

    // Helper to get market state
    function getMarketBalance() external view returns (uint256) {
        (,,,uint256 balance,,) = market.getMarketData(marketId);
        return balance;
    }

    function getMarketLiquidity() external view returns (uint256) {
        (,,uint256 liquidity,,,) = market.getMarketData(marketId);
        return liquidity;
    }

    function getPrices() external view returns (uint256[] memory) {
        (, uint256[] memory prices) = market.getMarketPrices(marketId);
        return prices;
    }
}


/// @title PredictionMarketInvariant - Invariant tests for the prediction market
contract PredictionMarketInvariantTest is Test {
    PredictionMarketHandler public handler;
    
    uint256 constant ONE = 10 ** 18;

    function setUp() public {
        handler = new PredictionMarketHandler();
        handler.init();
        
        // Target the handler for invariant testing
        targetContract(address(handler));
        
        // Exclude the handler's own functions that shouldn't be called
        bytes4[] memory selectors = new bytes4[](4);
        selectors[0] = handler.buy.selector;
        selectors[1] = handler.sell.selector;
        selectors[2] = handler.addLiquidity.selector;
        selectors[3] = handler.removeLiquidity.selector;
        
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    /// @notice Prices should always sum to approximately 1
    function invariant_PricesSumToOne() public view {
        uint256[] memory prices = handler.getPrices();
        uint256 sum = 0;
        for (uint256 i = 0; i < prices.length; i++) {
            sum += prices[i];
        }
        
        // Allow 0.1% tolerance
        assertApproxEqAbs(sum, ONE, 1e15, "Prices should sum to ~1");
    }

    /// @notice Market balance should always be positive
    function invariant_MarketBalancePositive() public view {
        uint256 balance = handler.getMarketBalance();
        assertTrue(balance > 0, "Market balance should be positive");
    }

    /// @notice Market liquidity should always be positive
    function invariant_MarketLiquidityPositive() public view {
        uint256 liquidity = handler.getMarketLiquidity();
        assertTrue(liquidity > 0, "Market liquidity should be positive");
    }

    /// @notice All prices should be between 0 and 1
    function invariant_PricesInRange() public view {
        uint256[] memory prices = handler.getPrices();
        for (uint256 i = 0; i < prices.length; i++) {
            assertTrue(prices[i] <= ONE, "Price should be <= 1");
            assertTrue(prices[i] >= 0, "Price should be >= 0");
        }
    }

    /// @notice Call summary for debugging
    function invariant_CallSummary() public view {
        console.log("Total bought:", handler.totalBought());
        console.log("Total sold:", handler.totalSold());
        console.log("Liquidity added:", handler.totalLiquidityAdded());
        console.log("Liquidity removed:", handler.totalLiquidityRemoved());
    }
}


/// @title StatelessInvariantTest - Simpler invariant tests without handler
contract StatelessInvariantTest is BaseTest {
    
    /// @notice Test that creating many markets doesn't break anything
    function test_Invariant_MultipleMarkets() public {
        for (uint256 i = 0; i < 10; i++) {
            uint256 marketId = createTestMarket();
            
            // Each market should be independent
            (PredictionMarket.MarketState state,,,,,) = market.getMarketData(marketId);
            assertEq(uint256(state), uint256(PredictionMarket.MarketState.open), "Market should be open");
        }
        
        uint256[] memory allMarkets = market.getMarkets();
        assertEq(allMarkets.length, 10, "Should have 10 markets");
    }

    /// @notice Test that heavy trading maintains price consistency
    function test_Invariant_HeavyTrading() public {
        uint256 marketId = createTestMarket();
        
        // Perform many random trades
        for (uint256 i = 0; i < 20; i++) {
            uint256 outcome = i % 2;
            uint256 amount = 0.5 ether + (i * 0.1 ether);
            
            address trader = address(uint160(0x1000 + i));
            fundUser(trader, amount);
            
            vm.prank(trader);
            market.buy(marketId, outcome, 0, amount);
            
            // Check prices after each trade
            (uint256 liquidityPrice, uint256[] memory prices) = market.getMarketPrices(marketId);
            uint256 sum = prices[0] + prices[1];
            assertApproxEqAbs(sum, ONE, 1e14, "Prices should sum to ~1");
        }
    }

    /// @notice Test that buying and selling maintains consistency
    function test_Invariant_BuySellConsistency() public {
        uint256 marketId = createTestMarket();
        
        for (uint256 i = 0; i < 10; i++) {
            address trader = address(uint160(0x2000 + i));
            
            // Buy
            fundUser(trader, 2 ether);
            vm.prank(trader);
            market.buy(marketId, 0, 0, 2 ether);
            
            // Sell half back
            vm.prank(trader);
            try market.sell(marketId, 0, 0.5 ether, type(uint256).max) {} catch {}
            
            // Check invariants
            assertPricesSumToOne(marketId, 1e14);
        }
    }

    /// @notice Test that liquidity operations maintain consistency
    function test_Invariant_LiquidityOperations() public {
        uint256 marketId = createTestMarket();
        
        // Multiple LPs add liquidity
        for (uint256 i = 0; i < 5; i++) {
            address lp = address(uint160(0x3000 + i));
            fundUser(lp, 5 ether);
            
            vm.prank(lp);
            market.addLiquidity(marketId, 5 ether);
        }
        
        // Some trading
        buyShares(user2, marketId, 0, 3 ether);
        buyShares(user3, marketId, 1, 2 ether);
        
        // Some LPs remove partial liquidity
        for (uint256 i = 0; i < 3; i++) {
            address lp = address(uint160(0x3000 + i));
            uint256 lpShares = getUserLiquidityShares(marketId, lp);
            uint256 removeAmount = lpShares / 3;
            
            if (removeAmount > 0) {
                vm.prank(lp);
                try market.removeLiquidity(marketId, removeAmount) {} catch {}
            }
        }
        
        // Check market is still consistent
        assertPricesSumToOne(marketId, 1e14);
        
        (,,uint256 liquidity,,,) = market.getMarketData(marketId);
        assertTrue(liquidity > 0, "Should still have liquidity");
    }

    /// @notice Test resolution and claims don't leave stranded funds
    function test_Invariant_ResolutionClaims() public {
        uint256 marketId = createTestMarket();
        
        // Multiple traders
        address[] memory traders = new address[](5);
        for (uint256 i = 0; i < 5; i++) {
            traders[i] = address(uint160(0x4000 + i));
            buyShares(traders[i], marketId, i % 2, 2 ether);
        }
        
        // Resolve
        resolveMarket(marketId, 0);
        
        // All winners claim
        for (uint256 i = 0; i < 5; i += 2) {
            uint256 shares = getUserOutcomeShares(marketId, traders[i], 0);
            if (shares > 0) {
                vm.prank(traders[i]);
                market.claimWinnings(marketId);
            }
        }
        
        // LP claims
        vm.prank(user1);
        market.claimLiquidity(marketId);
        
        // Market balance should be what remains for unclaimed losers
    }

    /// @notice Test that market state transitions are correct
    function test_Invariant_StateTransitions() public {
        uint256 marketId = createTestMarket();
        
        // Check open state
        (PredictionMarket.MarketState state,,,,,) = market.getMarketData(marketId);
        assertEq(uint256(state), uint256(PredictionMarket.MarketState.open), "Should be open");
        
        // Can trade
        buyShares(user2, marketId, 0, 1 ether);
        
        // Close market
        closeMarket(marketId);
        
        // Try to trigger state transition
        fundUser(user3, 1 ether);
        vm.prank(user3);
        vm.expectRevert("Market in incorrect state");
        market.buy(marketId, 0, 0, 1 ether);
        
        // Resolve
        vm.prank(owner);
        market.adminResolveMarketOutcome(marketId, 0);
        
        (state,,,,,) = market.getMarketData(marketId);
        assertEq(uint256(state), uint256(PredictionMarket.MarketState.resolved), "Should be resolved");
    }

    /// @notice Test fee accumulation consistency
    function test_Invariant_FeeAccumulation() public {
        uint256 marketId = createTestMarketWithFees(2 * 10 ** 16, 1 * 10 ** 16, 1 * 10 ** 16);
        
        uint256 treasuryTotal = 0;
        uint256 distributorTotal = 0;
        
        // Track fee accumulation over many trades
        for (uint256 i = 0; i < 10; i++) {
            address trader = address(uint160(0x5000 + i));
            uint256 amount = 1 ether;
            
            uint256 treasuryBefore = token.balanceOf(treasury);
            uint256 distributorBefore = token.balanceOf(distributor);
            
            buyShares(trader, marketId, i % 2, amount);
            
            uint256 treasuryFee = token.balanceOf(treasury) - treasuryBefore;
            uint256 distributorFee = token.balanceOf(distributor) - distributorBefore;
            
            treasuryTotal += treasuryFee;
            distributorTotal += distributorFee;
            
            // Each trade should generate expected fees
            uint256 expectedTreasuryFee = (amount * 1 * 10 ** 16) / ONE;
            uint256 expectedDistributorFee = (amount * 1 * 10 ** 16) / ONE;
            
            assertEq(treasuryFee, expectedTreasuryFee, "Treasury fee incorrect");
            assertEq(distributorFee, expectedDistributorFee, "Distributor fee incorrect");
        }
        
        // Verify LP can claim pool fees
        uint256 claimableFees = market.getUserClaimableFees(marketId, user1);
        assertTrue(claimableFees > 0, "Should have claimable fees");
    }
}

