// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Parimutuel Prediction Market
/// @notice A parimutuel betting market where all bets go into a shared pot
/// @dev Bets are final (no selling), fees taken at resolution, winners split the pot
contract PredictionMarket is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    // ============ Events ============

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

    event TokenWhitelistUpdated(address indexed token, bool allowed);
    event EmergencyWithdrawToggled(bool enabled);
    event ProtocolTreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    // ============ Enums ============

    enum MarketState {
        Open,       // Accepting bets
        Locked,     // Betting closed, awaiting resolution
        Resolved,   // Winner determined, payouts available
        Voided      // Market cancelled, refunds available
    }

    // ============ Structs ============

    struct Market {
        string question;
        string image;
        uint256 outcomeCount;
        uint256 closesAt;           // Unix timestamp when betting closes
        uint256 totalPot;           // Total USDC in the pot
        uint256 resolvedOutcome;    // Winning outcome ID (only valid if resolved)
        uint256 payoutPerShare;     // Calculated at resolution (18 decimals)
        MarketState state;
        address creator;            // Gets creator fee
        address token;              // USDC address
        uint16 protocolFeeBps;      // Protocol fee in basis points (e.g., 150 = 1.5%)
        uint16 creatorFeeBps;       // Creator fee in basis points
    }

    struct OutcomePool {
        uint256 totalShares;        // Total shares bet on this outcome
        mapping(address => uint256) shares;  // User shares per outcome
        mapping(address => bool) claimed;    // Whether user has claimed
    }

    // ============ Constants ============

    uint256 public constant MAX_OUTCOMES = 32;
    uint256 public constant MAX_FEE_BPS = 1000;     // 10% max total fee
    uint256 public constant MIN_BET = 1e6;          // $1 USDC minimum (6 decimals)
    uint256 public constant MAX_BET_PER_MARKET = 100_000e6;  // $100k max per market per user
    uint256 public constant MAX_MARKET_POT = 1_000_000e6;    // $1M max total pot per market
    uint256 private constant ONE = 1e18;

    // ============ State ============

    uint256 public marketCount;
    address public protocolTreasury;
    bool public emergencyWithdrawEnabled;  // Must be explicitly enabled

    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(uint256 => OutcomePool)) private outcomePools;
    mapping(address => bool) public allowedTokens;  // Token whitelist

    // ============ Constructor ============

    constructor(address _protocolTreasury) {
        require(_protocolTreasury != address(0), "Invalid treasury");
        protocolTreasury = _protocolTreasury;
    }

    // ============ Modifiers ============

    modifier marketExists(uint256 marketId) {
        require(marketId < marketCount, "Market does not exist");
        _;
    }

    modifier onlyOpen(uint256 marketId) {
        Market storage market = markets[marketId];
        require(market.state == MarketState.Open, "Market not open");
        require(block.timestamp < market.closesAt, "Market closed");
        _;
    }

    modifier onlyResolvable(uint256 marketId) {
        Market storage market = markets[marketId];
        require(
            market.state == MarketState.Open || market.state == MarketState.Locked,
            "Market not resolvable"
        );
        _;
    }

    modifier canResolve(uint256 marketId) {
        Market storage market = markets[marketId];
        require(
            msg.sender == owner() || msg.sender == market.creator,
            "Not authorized to resolve"
        );
        _;
    }

    // ============ Admin Functions ============

    function setProtocolTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        emit ProtocolTreasuryUpdated(protocolTreasury, _treasury);
        protocolTreasury = _treasury;
    }

    /// @notice Add or remove a token from the whitelist
    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        allowedTokens[token] = allowed;
        emit TokenWhitelistUpdated(token, allowed);
    }

    /// @notice Pause all betting (emergency use)
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause betting
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Toggle emergency withdraw capability
    /// @dev Requires explicit enable to prevent accidental fund drain
    function setEmergencyWithdrawEnabled(bool enabled) external onlyOwner {
        emergencyWithdrawEnabled = enabled;
        emit EmergencyWithdrawToggled(enabled);
    }

    // ============ Market Creation ============

    struct CreateMarketParams {
        string question;
        string image;
        uint256 outcomeCount;
        uint256 closesAt;
        address token;
        uint16 protocolFeeBps;
        uint16 creatorFeeBps;
        address creator;
    }

    /// @notice Create a new prediction market
    /// @param params Market creation parameters
    /// @return marketId The ID of the created market
    function createMarket(CreateMarketParams calldata params) 
        external 
        nonReentrant
        whenNotPaused
        returns (uint256 marketId) 
    {
        require(params.outcomeCount >= 2 && params.outcomeCount <= MAX_OUTCOMES, "Invalid outcome count");
        require(params.closesAt > block.timestamp, "Close time must be in future");
        require(params.token != address(0), "Invalid token");
        require(allowedTokens[params.token], "Token not whitelisted");
        require(params.protocolFeeBps + params.creatorFeeBps <= MAX_FEE_BPS, "Fees too high");
        require(params.creator != address(0), "Invalid creator");

        marketId = marketCount++;

        Market storage market = markets[marketId];
        market.question = params.question;
        market.image = params.image;
        market.outcomeCount = params.outcomeCount;
        market.closesAt = params.closesAt;
        market.token = params.token;
        market.protocolFeeBps = params.protocolFeeBps;
        market.creatorFeeBps = params.creatorFeeBps;
        market.creator = params.creator;
        market.state = MarketState.Open;

        emit MarketCreated(
            params.creator,
            marketId,
            params.outcomeCount,
            params.question,
            params.image,
            params.token
        );
    }

    // ============ Betting ============

    /// @notice Place a bet on an outcome
    /// @param marketId The market to bet on
    /// @param outcomeId The outcome to bet on (0-indexed)
    /// @param amount The amount of USDC to bet
    function bet(uint256 marketId, uint256 outcomeId, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        marketExists(marketId)
        onlyOpen(marketId)
    {
        Market storage market = markets[marketId];
        require(outcomeId < market.outcomeCount, "Invalid outcome");
        require(amount >= MIN_BET, "Below minimum bet");
        
        // Protection: Limit total pot size per market
        require(market.totalPot + amount <= MAX_MARKET_POT, "Market pot limit reached");
        
        // Protection: Limit per-user exposure per market
        uint256 userTotalInMarket = _getUserTotalBet(marketId, msg.sender);
        require(userTotalInMarket + amount <= MAX_BET_PER_MARKET, "User bet limit reached");

        // Transfer USDC from user
        IERC20(market.token).safeTransferFrom(msg.sender, address(this), amount);

        // Add to pot and mint shares 1:1
        market.totalPot += amount;
        OutcomePool storage pool = outcomePools[marketId][outcomeId];
        pool.totalShares += amount;
        pool.shares[msg.sender] += amount;

        emit BetPlaced(
            msg.sender,
            marketId,
            outcomeId,
            amount,
            amount,  // shares = amount (1:1)
            block.timestamp
        );
    }

    // ============ Market Lifecycle ============

    /// @notice Lock a market early (stop accepting bets)
    /// @param marketId The market to lock
    function lockMarket(uint256 marketId)
        external
        nonReentrant
        marketExists(marketId)
        canResolve(marketId)
    {
        Market storage market = markets[marketId];
        require(market.state == MarketState.Open, "Market not open");

        market.state = MarketState.Locked;

        emit MarketLocked(msg.sender, marketId, block.timestamp);
    }

    /// @notice Resolve a market with a winning outcome
    /// @param marketId The market to resolve
    /// @param winningOutcome The winning outcome ID
    function resolve(uint256 marketId, uint256 winningOutcome)
        external
        nonReentrant
        marketExists(marketId)
        onlyResolvable(marketId)
        canResolve(marketId)
    {
        Market storage market = markets[marketId];
        require(winningOutcome < market.outcomeCount, "Invalid outcome");

        OutcomePool storage winningPool = outcomePools[marketId][winningOutcome];
        uint256 winningShares = winningPool.totalShares;

        uint256 protocolFee = 0;
        uint256 creatorFee = 0;
        uint256 netPot = market.totalPot;

        if (winningShares == 0) {
            // No one bet on winning outcome - fees take the entire pot
            protocolFee = (market.totalPot * market.protocolFeeBps) / 10000;
            creatorFee = market.totalPot - protocolFee;
            netPot = 0;
            market.payoutPerShare = 0;
        } else {
            // Calculate fees
            protocolFee = (market.totalPot * market.protocolFeeBps) / 10000;
            creatorFee = (market.totalPot * market.creatorFeeBps) / 10000;
            netPot = market.totalPot - protocolFee - creatorFee;

            // Calculate payout per share (18 decimal precision)
            market.payoutPerShare = (netPot * ONE) / winningShares;
        }

        market.resolvedOutcome = winningOutcome;
        market.state = MarketState.Resolved;

        // Transfer fees
        if (protocolFee > 0) {
            IERC20(market.token).safeTransfer(protocolTreasury, protocolFee);
        }
        if (creatorFee > 0) {
            IERC20(market.token).safeTransfer(market.creator, creatorFee);
        }

        emit MarketResolved(
            msg.sender,
            marketId,
            winningOutcome,
            market.totalPot,
            protocolFee,
            creatorFee,
            block.timestamp
        );
    }

    /// @notice Void a market (cancel it, allow refunds)
    /// @param marketId The market to void
    function voidMarket(uint256 marketId)
        external
        nonReentrant
        marketExists(marketId)
        onlyResolvable(marketId)
        canResolve(marketId)
    {
        Market storage market = markets[marketId];
        market.state = MarketState.Voided;

        emit MarketVoided(msg.sender, marketId, block.timestamp);
    }

    // ============ Claims ============

    /// @notice Claim winnings from a resolved market
    /// @param marketId The market to claim from
    function claimWinnings(uint256 marketId)
        external
        nonReentrant
        marketExists(marketId)
    {
        Market storage market = markets[marketId];
        require(market.state == MarketState.Resolved, "Market not resolved");

        OutcomePool storage winningPool = outcomePools[marketId][market.resolvedOutcome];
        uint256 userShares = winningPool.shares[msg.sender];
        require(userShares > 0, "No winning shares");
        require(!winningPool.claimed[msg.sender], "Already claimed");

        winningPool.claimed[msg.sender] = true;

        // Calculate payout
        uint256 payout = (userShares * market.payoutPerShare) / ONE;
        require(payout > 0, "No payout");

        IERC20(market.token).safeTransfer(msg.sender, payout);

        emit WinningsClaimed(
            msg.sender,
            marketId,
            userShares,
            payout,
            block.timestamp
        );
    }

    /// @notice Claim refund from a voided market
    /// @param marketId The market to claim from
    /// @param outcomeId The outcome you bet on
    function claimRefund(uint256 marketId, uint256 outcomeId)
        external
        nonReentrant
        marketExists(marketId)
    {
        Market storage market = markets[marketId];
        require(market.state == MarketState.Voided, "Market not voided");
        require(outcomeId < market.outcomeCount, "Invalid outcome");

        OutcomePool storage pool = outcomePools[marketId][outcomeId];
        uint256 userShares = pool.shares[msg.sender];
        require(userShares > 0, "No shares to refund");
        require(!pool.claimed[msg.sender], "Already claimed");

        pool.claimed[msg.sender] = true;

        // Refund full amount (shares = amount in parimutuel)
        IERC20(market.token).safeTransfer(msg.sender, userShares);

        emit RefundClaimed(
            msg.sender,
            marketId,
            outcomeId,
            userShares,
            block.timestamp
        );
    }

    // ============ View Functions ============

    /// @notice Get market data
    function getMarketData(uint256 marketId)
        external
        view
        marketExists(marketId)
        returns (
            MarketState state,
            uint256 closesAt,
            uint256 totalPot,
            uint256 outcomeCount,
            uint256 resolvedOutcome,
            address creator,
            uint16 protocolFeeBps,
            uint16 creatorFeeBps
        )
    {
        Market storage market = markets[marketId];
        return (
            market.state,
            market.closesAt,
            market.totalPot,
            market.outcomeCount,
            market.resolvedOutcome,
            market.creator,
            market.protocolFeeBps,
            market.creatorFeeBps
        );
    }

    /// @notice Get all outcome pool sizes for a market
    function getMarketPools(uint256 marketId)
        external
        view
        marketExists(marketId)
        returns (uint256[] memory pools)
    {
        Market storage market = markets[marketId];
        pools = new uint256[](market.outcomeCount);
        for (uint256 i = 0; i < market.outcomeCount; i++) {
            pools[i] = outcomePools[marketId][i].totalShares;
        }
    }

    /// @notice Get a user's shares for all outcomes in a market
    function getUserShares(uint256 marketId, address user)
        external
        view
        marketExists(marketId)
        returns (uint256[] memory shares)
    {
        Market storage market = markets[marketId];
        shares = new uint256[](market.outcomeCount);
        for (uint256 i = 0; i < market.outcomeCount; i++) {
            shares[i] = outcomePools[marketId][i].shares[user];
        }
    }

    /// @notice Check if user has claimed for an outcome
    function hasClaimed(uint256 marketId, uint256 outcomeId, address user)
        external
        view
        marketExists(marketId)
        returns (bool)
    {
        return outcomePools[marketId][outcomeId].claimed[user];
    }

    /// @notice Get indicative prices (pool ratios) for all outcomes
    function getIndicativePrices(uint256 marketId)
        external
        view
        marketExists(marketId)
        returns (uint256[] memory prices)
    {
        Market storage market = markets[marketId];
        prices = new uint256[](market.outcomeCount);
        
        if (market.totalPot == 0) {
            // Equal odds if no bets
            uint256 equalPrice = ONE / market.outcomeCount;
            for (uint256 i = 0; i < market.outcomeCount; i++) {
                prices[i] = equalPrice;
            }
        } else {
            for (uint256 i = 0; i < market.outcomeCount; i++) {
                prices[i] = (outcomePools[marketId][i].totalShares * ONE) / market.totalPot;
            }
        }
    }

    /// @notice Calculate indicative payout for a bet (before fees)
    /// @param marketId The market
    /// @param outcomeId The outcome to bet on
    /// @param amount The bet amount
    /// @return payout The indicative payout if this outcome wins
    function getIndicativePayout(uint256 marketId, uint256 outcomeId, uint256 amount)
        external
        view
        marketExists(marketId)
        returns (uint256 payout)
    {
        Market storage market = markets[marketId];
        require(outcomeId < market.outcomeCount, "Invalid outcome");

        uint256 newTotalPot = market.totalPot + amount;
        uint256 newOutcomePool = outcomePools[marketId][outcomeId].totalShares + amount;
        
        uint256 totalFeeBps = market.protocolFeeBps + market.creatorFeeBps;
        uint256 netPot = newTotalPot - (newTotalPot * totalFeeBps) / 10000;
        
        // User's share of the net pot
        payout = (amount * netPot) / newOutcomePool;
    }

    /// @notice Get user's claimable amount (for resolved markets)
    function getClaimableAmount(uint256 marketId, address user)
        external
        view
        marketExists(marketId)
        returns (uint256 amount, bool canClaim)
    {
        Market storage market = markets[marketId];
        
        if (market.state == MarketState.Resolved) {
            OutcomePool storage winningPool = outcomePools[marketId][market.resolvedOutcome];
            uint256 userShares = winningPool.shares[user];
            if (userShares > 0 && !winningPool.claimed[user]) {
                amount = (userShares * market.payoutPerShare) / ONE;
                canClaim = true;
            }
        } else if (market.state == MarketState.Voided) {
            // Check all outcomes for refundable shares
            for (uint256 i = 0; i < market.outcomeCount; i++) {
                OutcomePool storage pool = outcomePools[marketId][i];
                if (pool.shares[user] > 0 && !pool.claimed[user]) {
                    amount += pool.shares[user];
                    canClaim = true;
                }
            }
        }
    }

    /// @notice Get total shares for a specific outcome
    function getOutcomePool(uint256 marketId, uint256 outcomeId)
        external
        view
        marketExists(marketId)
        returns (uint256)
    {
        return outcomePools[marketId][outcomeId].totalShares;
    }

    /// @notice Emergency withdraw (admin only, for stuck funds)
    /// @dev Requires emergencyWithdrawEnabled to be true
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        require(emergencyWithdrawEnabled, "Emergency withdraw not enabled");
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    // ============ Internal Functions ============

    /// @notice Get total amount a user has bet in a market (across all outcomes)
    function _getUserTotalBet(uint256 marketId, address user) internal view returns (uint256 total) {
        Market storage market = markets[marketId];
        for (uint256 i = 0; i < market.outcomeCount; i++) {
            total += outcomePools[marketId][i].shares[user];
        }
    }

    // ============ Solvency Check ============

    /// @notice Verify contract has sufficient balance for a market's obligations
    /// @dev Can be called by anyone to verify solvency
    function checkMarketSolvency(uint256 marketId) 
        external 
        view 
        marketExists(marketId) 
        returns (bool solvent, uint256 required, uint256 available) 
    {
        Market storage market = markets[marketId];
        required = market.totalPot;
        available = IERC20(market.token).balanceOf(address(this));
        solvent = available >= required;
    }
}
