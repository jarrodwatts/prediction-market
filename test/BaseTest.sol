// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import "../src/PredictionMarket.sol";
import "./mocks/MockERC20.sol";
import "./mocks/MockWETH.sol";

/// @title BaseTest - Shared test setup and utilities for PredictionMarket tests
abstract contract BaseTest is Test {
    PredictionMarket public market;
    MockERC20 public token;
    MockWETH public weth;

    // Test addresses
    address public owner = address(0x1);
    address public user1 = address(0x2);
    address public user2 = address(0x3);
    address public user3 = address(0x4);
    address public treasury = address(0x5);
    address public distributor = address(0x6);

    // Constants
    uint256 public constant ONE = 10 ** 18;
    uint256 public constant INITIAL_BALANCE = 1000 ether;
    uint256 public constant DEFAULT_MARKET_VALUE = 10 ether;
    uint256 public constant MAX_FEE = 5 * 10 ** 16; // 5%

    // Events to test
    event MarketCreated(
        address indexed user,
        uint256 indexed marketId,
        uint256 outcomes,
        string question,
        string image,
        IERC20 token
    );

    event MarketActionTx(
        address indexed user,
        PredictionMarket.MarketAction indexed action,
        uint256 indexed marketId,
        uint256 outcomeId,
        uint256 shares,
        uint256 value,
        uint256 timestamp
    );

    event MarketResolved(
        address indexed user,
        uint256 indexed marketId,
        uint256 outcomeId,
        uint256 timestamp,
        bool admin
    );

    event MarketPaused(address indexed user, uint256 indexed marketId, bool paused, uint256 timestamp);

    event Referral(
        address indexed user,
        uint256 indexed marketId,
        string code,
        PredictionMarket.MarketAction action,
        uint256 outcomeId,
        uint256 value,
        uint256 timestamp
    );

    function setUp() public virtual {
        vm.startPrank(owner);
        weth = new MockWETH();
        market = new PredictionMarket(IWETH(address(weth)));
        token = new MockERC20("Test Token", "TEST", 18);
        vm.stopPrank();

        // Label addresses for better trace output
        vm.label(owner, "Owner");
        vm.label(user1, "User1");
        vm.label(user2, "User2");
        vm.label(user3, "User3");
        vm.label(treasury, "Treasury");
        vm.label(distributor, "Distributor");
        vm.label(address(market), "MarketContract");
        vm.label(address(token), "TestToken");
        vm.label(address(weth), "WETH");
    }

    // ============ Helper Functions ============

    /// @notice Fund a user with tokens and approve the market contract
    function fundUser(address user, uint256 amount) internal {
        token.mint(user, amount);
        vm.prank(user);
        token.approve(address(market), amount);
    }

    /// @notice Fund a user with ETH
    function fundUserETH(address user, uint256 amount) internal {
        vm.deal(user, amount);
    }

    /// @notice Create a standard binary market with equal distribution and no fees
    function createTestMarket() internal returns (uint256) {
        return createTestMarketWithValue(DEFAULT_MARKET_VALUE);
    }

    /// @notice Create a standard binary market with custom initial value
    function createTestMarketWithValue(uint256 value) internal returns (uint256) {
        uint256[] memory distribution = new uint256[](2);
        distribution[0] = 50;
        distribution[1] = 50;

        return createMarketWithParams(
            value,
            uint32(block.timestamp + 1 days),
            2,
            distribution,
            PredictionMarket.Fees(0, 0, 0),
            PredictionMarket.Fees(0, 0, 0)
        );
    }

    /// @notice Create a market with fees
    function createTestMarketWithFees(
        uint256 poolFee,
        uint256 treasuryFee,
        uint256 distributorFee
    ) internal returns (uint256) {
        uint256[] memory distribution = new uint256[](2);
        distribution[0] = 50;
        distribution[1] = 50;

        return createMarketWithParams(
            DEFAULT_MARKET_VALUE,
            uint32(block.timestamp + 1 days),
            2,
            distribution,
            PredictionMarket.Fees(poolFee, treasuryFee, distributorFee),
            PredictionMarket.Fees(poolFee, treasuryFee, distributorFee)
        );
    }

    /// @notice Create a market with custom outcome count
    function createTestMarketWithOutcomes(uint256 outcomeCount) internal returns (uint256) {
        uint256[] memory distribution = new uint256[](outcomeCount);
        for (uint256 i = 0; i < outcomeCount; i++) {
            distribution[i] = 100; // Equal distribution
        }

        return createMarketWithParams(
            DEFAULT_MARKET_VALUE,
            uint32(block.timestamp + 1 days),
            outcomeCount,
            distribution,
            PredictionMarket.Fees(0, 0, 0),
            PredictionMarket.Fees(0, 0, 0)
        );
    }

    /// @notice Create a market with custom distribution
    function createTestMarketWithDistribution(uint256[] memory distribution) internal returns (uint256) {
        return createMarketWithParams(
            DEFAULT_MARKET_VALUE,
            uint32(block.timestamp + 1 days),
            distribution.length,
            distribution,
            PredictionMarket.Fees(0, 0, 0),
            PredictionMarket.Fees(0, 0, 0)
        );
    }

    /// @notice Create a market with WETH as the token
    function createTestMarketWithETH() internal returns (uint256) {
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
            question: "Test Question",
            image: "test_image",
            buyFees: PredictionMarket.Fees(0, 0, 0),
            sellFees: PredictionMarket.Fees(0, 0, 0),
            treasury: treasury,
            distributor: distributor
        });

        vm.prank(user1);
        return market.createMarketWithETH{value: DEFAULT_MARKET_VALUE}(desc);
    }

    /// @notice Create a market with full custom parameters
    function createMarketWithParams(
        uint256 value,
        uint32 closesAt,
        uint256 outcomes,
        uint256[] memory distribution,
        PredictionMarket.Fees memory buyFees,
        PredictionMarket.Fees memory sellFees
    ) internal returns (uint256) {
        fundUser(user1, value);

        PredictionMarket.CreateMarketDescription memory desc = PredictionMarket.CreateMarketDescription({
            value: value,
            closesAt: closesAt,
            outcomes: outcomes,
            token: IERC20(address(token)),
            distribution: distribution,
            question: "Test Question",
            image: "test_image",
            buyFees: buyFees,
            sellFees: sellFees,
            treasury: treasury,
            distributor: distributor
        });

        vm.prank(user1);
        return market.createMarket(desc);
    }

    /// @notice Advance time past market close date
    function closeMarket(uint256 marketId) internal {
        (
            PredictionMarket.MarketState state,
            uint256 closesAt,
            ,
            ,
            ,
        ) = market.getMarketData(marketId);

        if (state == PredictionMarket.MarketState.open) {
            vm.warp(closesAt + 1);
        }
    }

    /// @notice Resolve a market to a specific outcome
    function resolveMarket(uint256 marketId, uint256 outcomeId) internal {
        closeMarket(marketId);
        vm.prank(owner);
        market.adminResolveMarketOutcome(marketId, outcomeId);
    }

    /// @notice Void a market by resolving to an invalid outcome
    function voidMarket(uint256 marketId) internal {
        closeMarket(marketId);
        vm.prank(owner);
        // Resolve to outcome count (invalid) to void the market
        (,,,,,int256 resolvedOutcome) = market.getMarketData(marketId);
        market.adminResolveMarketOutcome(marketId, 999); // Invalid outcome
    }

    /// @notice Buy shares of an outcome
    function buyShares(
        address buyer,
        uint256 marketId,
        uint256 outcomeId,
        uint256 value
    ) internal returns (uint256 sharesBought) {
        fundUser(buyer, value);
        
        uint256 expectedShares = market.calcBuyAmount(value, marketId, outcomeId);
        
        vm.prank(buyer);
        market.buy(marketId, outcomeId, 0, value);
        
        return expectedShares;
    }

    /// @notice Buy shares with ETH
    function buySharesWithETH(
        address buyer,
        uint256 marketId,
        uint256 outcomeId,
        uint256 value
    ) internal returns (uint256 sharesBought) {
        fundUserETH(buyer, value);
        
        uint256 expectedShares = market.calcBuyAmount(value, marketId, outcomeId);
        
        vm.prank(buyer);
        market.buyWithETH{value: value}(marketId, outcomeId, 0);
        
        return expectedShares;
    }

    /// @notice Get user's shares for a specific outcome
    function getUserOutcomeShares(uint256 marketId, address user, uint256 outcomeId) internal view returns (uint256) {
        (, uint256[] memory shares) = market.getUserMarketShares(marketId, user);
        return shares[outcomeId];
    }

    /// @notice Get user's liquidity shares
    function getUserLiquidityShares(uint256 marketId, address user) internal view returns (uint256) {
        (uint256 liquidityShares,) = market.getUserMarketShares(marketId, user);
        return liquidityShares;
    }

    /// @notice Assert that outcome prices sum to approximately 1 (within tolerance)
    function assertPricesSumToOne(uint256 marketId, uint256 tolerance) internal view {
        (,uint256[] memory prices) = market.getMarketPrices(marketId);
        uint256 sum = 0;
        for (uint256 i = 0; i < prices.length; i++) {
            sum += prices[i];
        }
        assertApproxEqAbs(sum, ONE, tolerance, "Prices should sum to ~1");
    }

    /// @notice Get market state
    function getMarketState(uint256 marketId) internal view returns (PredictionMarket.MarketState) {
        (PredictionMarket.MarketState state,,,,,) = market.getMarketData(marketId);
        return state;
    }

    /// @notice Get market balance
    function getMarketBalance(uint256 marketId) internal view returns (uint256) {
        (,,,uint256 balance,,) = market.getMarketData(marketId);
        return balance;
    }

    /// @notice Get market liquidity
    function getMarketLiquidity(uint256 marketId) internal view returns (uint256) {
        (,,uint256 liquidity,,,) = market.getMarketData(marketId);
        return liquidity;
    }
}

