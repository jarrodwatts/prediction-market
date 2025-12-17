// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import "../src/PredictionMarket.sol";
import "./mocks/MockERC20.sol";

/// @title BaseTest - Shared test setup and utilities for Parimutuel PredictionMarket tests
abstract contract BaseTest is Test {
    PredictionMarket public market;
    MockERC20 public usdc;

    // Test addresses
    address public owner = address(0x1);
    address public user1 = address(0x2);
    address public user2 = address(0x3);
    address public user3 = address(0x4);
    address public protocolTreasury = address(0x5);
    address public creator = address(0x6);

    // Constants
    uint256 public constant ONE = 1e18;
    uint256 public constant USDC_DECIMALS = 6;
    uint256 public constant INITIAL_BALANCE = 10000e6; // 10,000 USDC
    uint256 public constant MIN_BET = 1e6; // $1 USDC
    uint256 public constant DEFAULT_BET = 100e6; // $100 USDC

    // Default fee config (1.5% each)
    uint16 public constant DEFAULT_PROTOCOL_FEE_BPS = 150;
    uint16 public constant DEFAULT_CREATOR_FEE_BPS = 150;

    // Events to test
    event MarketCreated(
        address indexed creator,
        uint256 indexed marketId,
        uint256 outcomeCount,
        string question,
        string image,
        address token
    );

    event BetPlaced(
        address indexed user,
        uint256 indexed marketId,
        uint256 indexed outcomeId,
        uint256 amount,
        uint256 shares,
        uint256 timestamp
    );

    event MarketResolved(
        address indexed resolver,
        uint256 indexed marketId,
        uint256 winningOutcome,
        uint256 totalPot,
        uint256 protocolFee,
        uint256 creatorFee,
        uint256 timestamp
    );

    event MarketVoided(
        address indexed resolver,
        uint256 indexed marketId,
        uint256 timestamp
    );

    event WinningsClaimed(
        address indexed user,
        uint256 indexed marketId,
        uint256 shares,
        uint256 payout,
        uint256 timestamp
    );

    event RefundClaimed(
        address indexed user,
        uint256 indexed marketId,
        uint256 outcomeId,
        uint256 amount,
        uint256 timestamp
    );

    event MarketLocked(
        address indexed locker,
        uint256 indexed marketId,
        uint256 timestamp
    );

    function setUp() public virtual {
        vm.startPrank(owner);
        market = new PredictionMarket(protocolTreasury);
        usdc = new MockERC20("USD Coin", "USDC", 6);
        
        // Whitelist USDC for use in markets
        market.setTokenAllowed(address(usdc), true);
        vm.stopPrank();

        // Label addresses for better trace output
        vm.label(owner, "Owner");
        vm.label(user1, "User1");
        vm.label(user2, "User2");
        vm.label(user3, "User3");
        vm.label(protocolTreasury, "ProtocolTreasury");
        vm.label(creator, "Creator");
        vm.label(address(market), "MarketContract");
        vm.label(address(usdc), "USDC");
    }

    // ============ Helper Functions ============

    /// @notice Fund a user with USDC and approve the market contract
    function fundUser(address user, uint256 amount) internal {
        usdc.mint(user, amount);
        vm.prank(user);
        usdc.approve(address(market), amount);
    }

    /// @notice Create a standard binary market
    function createTestMarket() internal returns (uint256) {
        return createTestMarketWithOutcomes(2);
    }

    /// @notice Create a market with custom outcome count
    function createTestMarketWithOutcomes(uint256 outcomeCount) internal returns (uint256) {
        return createMarketWithParams(
            outcomeCount,
            block.timestamp + 1 days,
            DEFAULT_PROTOCOL_FEE_BPS,
            DEFAULT_CREATOR_FEE_BPS
        );
    }

    /// @notice Create a market with custom fees
    function createTestMarketWithFees(
        uint16 protocolFeeBps,
        uint16 creatorFeeBps
    ) internal returns (uint256) {
        return createMarketWithParams(
            2,
            block.timestamp + 1 days,
            protocolFeeBps,
            creatorFeeBps
        );
    }

    /// @notice Create a market with no fees
    function createTestMarketNoFees() internal returns (uint256) {
        return createMarketWithParams(2, block.timestamp + 1 days, 0, 0);
    }

    /// @notice Create a market with full custom parameters
    function createMarketWithParams(
        uint256 outcomeCount,
        uint256 closesAt,
        uint16 protocolFeeBps,
        uint16 creatorFeeBps
    ) internal returns (uint256) {
        PredictionMarket.CreateMarketParams memory params = PredictionMarket.CreateMarketParams({
            question: "Test Question",
            image: "test_image",
            outcomeCount: outcomeCount,
            closesAt: closesAt,
            token: address(usdc),
            protocolFeeBps: protocolFeeBps,
            creatorFeeBps: creatorFeeBps,
            creator: creator
        });

        vm.prank(owner);
        return market.createMarket(params);
    }

    /// @notice Place a bet on an outcome
    function placeBet(
        address bettor,
        uint256 marketId,
        uint256 outcomeId,
        uint256 amount
    ) internal {
        fundUser(bettor, amount);
        vm.prank(bettor);
        market.bet(marketId, outcomeId, amount);
    }

    /// @notice Advance time past market close date
    function advancePastClose(uint256 marketId) internal {
        (
            ,
            uint256 closesAt,
            ,
            ,
            ,
            ,
            ,
            
        ) = market.getMarketData(marketId);
        vm.warp(closesAt + 1);
    }

    /// @notice Resolve a market to a specific outcome
    function resolveMarket(uint256 marketId, uint256 winningOutcome) internal {
        vm.prank(owner);
        market.resolve(marketId, winningOutcome);
    }

    /// @notice Resolve a market as the creator
    function resolveMarketAsCreator(uint256 marketId, uint256 winningOutcome) internal {
        vm.prank(creator);
        market.resolve(marketId, winningOutcome);
    }

    /// @notice Void a market
    function voidMarket(uint256 marketId) internal {
        vm.prank(owner);
        market.voidMarket(marketId);
    }

    /// @notice Lock a market
    function lockMarket(uint256 marketId) internal {
        vm.prank(owner);
        market.lockMarket(marketId);
    }

    /// @notice Get user's shares for a specific outcome
    function getUserOutcomeShares(uint256 marketId, address user, uint256 outcomeId) internal view returns (uint256) {
        uint256[] memory shares = market.getUserShares(marketId, user);
        return shares[outcomeId];
    }

    /// @notice Get market state
    function getMarketState(uint256 marketId) internal view returns (PredictionMarket.MarketState) {
        (PredictionMarket.MarketState state,,,,,,,) = market.getMarketData(marketId);
        return state;
    }

    /// @notice Get market total pot
    function getMarketTotalPot(uint256 marketId) internal view returns (uint256) {
        (,,uint256 totalPot,,,,,) = market.getMarketData(marketId);
        return totalPot;
    }

    /// @notice Assert that indicative prices sum to approximately 1 (within tolerance)
    function assertPricesSumToOne(uint256 marketId, uint256 tolerance) internal view {
        uint256[] memory prices = market.getIndicativePrices(marketId);
        uint256 sum = 0;
        for (uint256 i = 0; i < prices.length; i++) {
            sum += prices[i];
        }
        assertApproxEqAbs(sum, ONE, tolerance, "Prices should sum to ~1");
    }
}
