// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../BaseTest.sol";

contract CreateMarketTest is BaseTest {
    // ============ Basic Creation Tests ============

    function test_CreateMarket_Basic() public {
        fundUser(user1, 10 ether);

        uint256[] memory distribution = new uint256[](2);
        distribution[0] = 50;
        distribution[1] = 50;

        PredictionMarket.Fees memory buyFees = PredictionMarket.Fees(0, 0, 0);
        PredictionMarket.Fees memory sellFees = PredictionMarket.Fees(0, 0, 0);

        PredictionMarket.CreateMarketDescription memory desc = PredictionMarket.CreateMarketDescription({
            value: 10 ether,
            closesAt: uint32(block.timestamp + 1 days),
            outcomes: 2,
            token: IERC20(address(token)),
            distribution: distribution,
            question: "Will ETH hit 10k?",
            image: "image_url",
            buyFees: buyFees,
            sellFees: sellFees,
            treasury: treasury,
            distributor: distributor
        });

        vm.prank(user1);
        uint256 marketId = market.createMarket(desc);

        // Verify market state
        (
            PredictionMarket.MarketState state,
            uint256 closesAt,
            uint256 liquidity,
            uint256 balance,
            ,
            int256 resolvedOutcome
        ) = market.getMarketData(marketId);

        assertEq(uint256(state), uint256(PredictionMarket.MarketState.open), "Market should be open");
        assertEq(closesAt, block.timestamp + 1 days, "Close time mismatch");
        assertEq(balance, 10 ether, "Balance mismatch");
        assertEq(liquidity, 10 ether, "Liquidity mismatch");
        assertEq(resolvedOutcome, -1, "Market should not be resolved");

        // Verify creator liquidity shares
        uint256 creatorLiquidity = getUserLiquidityShares(marketId, user1);
        assertEq(creatorLiquidity, 10 ether, "Creator should have liquidity shares");
    }

    function test_CreateMarket_WithEqualDistribution() public {
        uint256[] memory distribution = new uint256[](2);
        distribution[0] = 100;
        distribution[1] = 100;

        uint256 marketId = createTestMarketWithDistribution(distribution);

        // With equal distribution, prices should be equal
        (uint256 liquidityPrice, uint256[] memory prices) = market.getMarketPrices(marketId);
        
        assertApproxEqAbs(prices[0], prices[1], 1e15, "Prices should be approximately equal");
        assertApproxEqAbs(prices[0], ONE / 2, 1e15, "Price should be ~0.5");
    }

    function test_CreateMarket_WithUnequalDistribution() public {
        uint256[] memory distribution = new uint256[](2);
        distribution[0] = 75; // 75% probability
        distribution[1] = 100; // 100% (max) - means outcome 1 gets fewer shares

        uint256 marketId = createTestMarketWithDistribution(distribution);

        // Unequal distribution means unequal prices
        (uint256 liquidityPrice, uint256[] memory prices) = market.getMarketPrices(marketId);
        
        // Outcome with fewer shares (0) should have higher price
        assertTrue(prices[0] > prices[1], "Outcome 0 should have higher price");
        
        // Prices should still sum to ~1
        assertPricesSumToOne(marketId, 1e15);
    }

    function test_CreateMarket_WithETH() public {
        fundUserETH(user1, 100 ether);

        uint256[] memory distribution = new uint256[](2);
        distribution[0] = 50;
        distribution[1] = 50;

        PredictionMarket.Fees memory buyFees = PredictionMarket.Fees(0, 0, 0);
        PredictionMarket.Fees memory sellFees = PredictionMarket.Fees(0, 0, 0);

        PredictionMarket.CreateMarketDescription memory desc = PredictionMarket.CreateMarketDescription({
            value: 10 ether,
            closesAt: uint32(block.timestamp + 1 days),
            outcomes: 2,
            token: IERC20(address(weth)),
            distribution: distribution,
            question: "Will ETH hit 10k?",
            image: "image_url",
            buyFees: buyFees,
            sellFees: sellFees,
            treasury: treasury,
            distributor: distributor
        });

        vm.prank(user1);
        uint256 marketId = market.createMarketWithETH{value: 10 ether}(desc);

        // Verify WETH balance
        assertEq(weth.balanceOf(address(market)), 10 ether, "Market should have WETH");
        
        // Verify market state
        (,, uint256 liquidity, uint256 balance,,) = market.getMarketData(marketId);
        assertEq(balance, 10 ether, "Balance mismatch");
        assertEq(liquidity, 10 ether, "Liquidity mismatch");
    }

    // ============ Outcome Count Tests ============

    function test_CreateMarket_SingleOutcome() public {
        uint256[] memory distribution = new uint256[](1);
        distribution[0] = 100;

        uint256 marketId = createMarketWithParams(
            DEFAULT_MARKET_VALUE,
            uint32(block.timestamp + 1 days),
            1,
            distribution,
            PredictionMarket.Fees(0, 0, 0),
            PredictionMarket.Fees(0, 0, 0)
        );

        uint256[] memory outcomeIds = market.getMarketOutcomeIds(marketId);
        assertEq(outcomeIds.length, 1, "Should have 1 outcome");
    }

    function test_CreateMarket_MaxOutcomes() public {
        uint256 maxOutcomes = 32;
        uint256[] memory distribution = new uint256[](maxOutcomes);
        for (uint256 i = 0; i < maxOutcomes; i++) {
            distribution[i] = 100;
        }

        uint256 marketId = createMarketWithParams(
            DEFAULT_MARKET_VALUE,
            uint32(block.timestamp + 1 days),
            maxOutcomes,
            distribution,
            PredictionMarket.Fees(0, 0, 0),
            PredictionMarket.Fees(0, 0, 0)
        );

        uint256[] memory outcomeIds = market.getMarketOutcomeIds(marketId);
        assertEq(outcomeIds.length, maxOutcomes, "Should have 32 outcomes");

        // Verify prices sum to ~1
        assertPricesSumToOne(marketId, 1e14);
    }

    function test_CreateMarket_ThreeOutcomes() public {
        uint256 marketId = createTestMarketWithOutcomes(3);

        uint256[] memory outcomeIds = market.getMarketOutcomeIds(marketId);
        assertEq(outcomeIds.length, 3, "Should have 3 outcomes");

        // Each outcome should have ~33% probability
        (,uint256[] memory prices) = market.getMarketPrices(marketId);
        for (uint256 i = 0; i < 3; i++) {
            assertApproxEqAbs(prices[i], ONE / 3, 1e15, "Each price should be ~33%");
        }
    }

    // ============ Fee Tests ============

    function test_CreateMarket_WithAllFeeTypes() public {
        uint256 poolFee = 1 * 10 ** 16; // 1%
        uint256 treasuryFee = 2 * 10 ** 16; // 2%
        uint256 distributorFee = 1 * 10 ** 16; // 1%

        uint256 marketId = createTestMarketWithFees(poolFee, treasuryFee, distributorFee);

        (
            PredictionMarket.Fees memory buyFees,
            PredictionMarket.Fees memory sellFees,
            address marketTreasury,
            address marketDistributor
        ) = market.getMarketFees(marketId);

        assertEq(buyFees.fee, poolFee, "Pool fee mismatch");
        assertEq(buyFees.treasuryFee, treasuryFee, "Treasury fee mismatch");
        assertEq(buyFees.distributorFee, distributorFee, "Distributor fee mismatch");
        assertEq(marketTreasury, treasury, "Treasury address mismatch");
        assertEq(marketDistributor, distributor, "Distributor address mismatch");
    }

    function test_CreateMarket_WithZeroFees() public {
        uint256 marketId = createTestMarketWithFees(0, 0, 0);

        uint256 totalBuyFee = market.getMarketBuyFee(marketId);
        uint256 totalSellFee = market.getMarketSellFee(marketId);

        assertEq(totalBuyFee, 0, "Buy fee should be 0");
        assertEq(totalSellFee, 0, "Sell fee should be 0");
    }

    function test_CreateMarket_WithMaxFees() public {
        uint256 maxFee = MAX_FEE; // 5%

        uint256 marketId = createTestMarketWithFees(maxFee, maxFee, maxFee);

        uint256 totalBuyFee = market.getMarketBuyFee(marketId);
        assertEq(totalBuyFee, maxFee * 3, "Total fee should be 15%");
    }

    function test_CreateMarket_WithDifferentBuyAndSellFees() public {
        fundUser(user1, DEFAULT_MARKET_VALUE);

        uint256[] memory distribution = new uint256[](2);
        distribution[0] = 50;
        distribution[1] = 50;

        PredictionMarket.Fees memory buyFees = PredictionMarket.Fees(1e16, 0, 0); // 1% buy
        PredictionMarket.Fees memory sellFees = PredictionMarket.Fees(2e16, 0, 0); // 2% sell

        PredictionMarket.CreateMarketDescription memory desc = PredictionMarket.CreateMarketDescription({
            value: DEFAULT_MARKET_VALUE,
            closesAt: uint32(block.timestamp + 1 days),
            outcomes: 2,
            token: IERC20(address(token)),
            distribution: distribution,
            question: "Test",
            image: "",
            buyFees: buyFees,
            sellFees: sellFees,
            treasury: treasury,
            distributor: distributor
        });

        vm.prank(user1);
        uint256 marketId = market.createMarket(desc);

        uint256 totalBuyFee = market.getMarketBuyFee(marketId);
        uint256 totalSellFee = market.getMarketSellFee(marketId);

        assertEq(totalBuyFee, 1e16, "Buy fee mismatch");
        assertEq(totalSellFee, 2e16, "Sell fee mismatch");
    }

    // ============ Event Tests ============

    function test_CreateMarket_EmitsMarketCreated() public {
        fundUser(user1, DEFAULT_MARKET_VALUE);

        uint256[] memory distribution = new uint256[](2);
        distribution[0] = 50;
        distribution[1] = 50;

        PredictionMarket.CreateMarketDescription memory desc = PredictionMarket.CreateMarketDescription({
            value: DEFAULT_MARKET_VALUE,
            closesAt: uint32(block.timestamp + 1 days),
            outcomes: 2,
            token: IERC20(address(token)),
            distribution: distribution,
            question: "Test Question",
            image: "test_image",
            buyFees: PredictionMarket.Fees(0, 0, 0),
            sellFees: PredictionMarket.Fees(0, 0, 0),
            treasury: treasury,
            distributor: distributor
        });

        vm.expectEmit(true, true, false, true);
        emit MarketCreated(user1, 0, 2, "Test Question", "test_image", IERC20(address(token)));

        vm.prank(user1);
        market.createMarket(desc);
    }

    // ============ Getter Tests ============

    function test_GetMarketCreator() public {
        uint256 marketId = createTestMarket();

        address creator = market.getMarketCreator(marketId);
        assertEq(creator, user1, "Creator should be user1");
    }

    function test_GetMarkets() public {
        createTestMarket();
        createTestMarket();
        createTestMarket();

        uint256[] memory marketIds = market.getMarkets();
        assertEq(marketIds.length, 3, "Should have 3 markets");
        assertEq(marketIds[0], 0, "First market ID should be 0");
        assertEq(marketIds[1], 1, "Second market ID should be 1");
        assertEq(marketIds[2], 2, "Third market ID should be 2");
    }

    function test_MarketIndex() public {
        assertEq(market.marketIndex(), 0, "Initial market index should be 0");

        createTestMarket();
        assertEq(market.marketIndex(), 1, "Market index should be 1");

        createTestMarket();
        assertEq(market.marketIndex(), 2, "Market index should be 2");
    }

    // ============ Revert Tests ============

    function test_Revert_CreateMarket_ZeroValue() public {
        fundUser(user1, 10 ether);

        uint256[] memory distribution = new uint256[](2);
        distribution[0] = 50;
        distribution[1] = 50;

        PredictionMarket.CreateMarketDescription memory desc = PredictionMarket.CreateMarketDescription({
            value: 0, // Zero value
            closesAt: uint32(block.timestamp + 1 days),
            outcomes: 2,
            token: IERC20(address(token)),
            distribution: distribution,
            question: "Test",
            image: "",
            buyFees: PredictionMarket.Fees(0, 0, 0),
            sellFees: PredictionMarket.Fees(0, 0, 0),
            treasury: treasury,
            distributor: distributor
        });

        vm.prank(user1);
        vm.expectRevert("stake needs to be > 0");
        market.createMarket(desc);
    }

    function test_Revert_CreateMarket_PastCloseDate() public {
        fundUser(user1, 10 ether);

        uint256[] memory distribution = new uint256[](2);
        distribution[0] = 50;
        distribution[1] = 50;

        PredictionMarket.CreateMarketDescription memory desc = PredictionMarket.CreateMarketDescription({
            value: 10 ether,
            closesAt: uint32(block.timestamp - 1), // In the past
            outcomes: 2,
            token: IERC20(address(token)),
            distribution: distribution,
            question: "Test",
            image: "",
            buyFees: PredictionMarket.Fees(0, 0, 0),
            sellFees: PredictionMarket.Fees(0, 0, 0),
            treasury: treasury,
            distributor: distributor
        });

        vm.prank(user1);
        vm.expectRevert("resolution before current date");
        market.createMarket(desc);
    }

    function test_Revert_CreateMarket_ZeroOutcomes() public {
        fundUser(user1, 10 ether);

        uint256[] memory distribution = new uint256[](0);

        PredictionMarket.CreateMarketDescription memory desc = PredictionMarket.CreateMarketDescription({
            value: 10 ether,
            closesAt: uint32(block.timestamp + 1 days),
            outcomes: 0, // Zero outcomes
            token: IERC20(address(token)),
            distribution: distribution,
            question: "Test",
            image: "",
            buyFees: PredictionMarket.Fees(0, 0, 0),
            sellFees: PredictionMarket.Fees(0, 0, 0),
            treasury: treasury,
            distributor: distributor
        });

        vm.prank(user1);
        vm.expectRevert("outcome count not between 1-32");
        market.createMarket(desc);
    }

    function test_Revert_CreateMarket_TooManyOutcomes() public {
        fundUser(user1, 10 ether);

        uint256[] memory distribution = new uint256[](33);
        for (uint256 i = 0; i < 33; i++) {
            distribution[i] = 100;
        }

        PredictionMarket.CreateMarketDescription memory desc = PredictionMarket.CreateMarketDescription({
            value: 10 ether,
            closesAt: uint32(block.timestamp + 1 days),
            outcomes: 33, // Too many outcomes
            token: IERC20(address(token)),
            distribution: distribution,
            question: "Test",
            image: "",
            buyFees: PredictionMarket.Fees(0, 0, 0),
            sellFees: PredictionMarket.Fees(0, 0, 0),
            treasury: treasury,
            distributor: distributor
        });

        vm.prank(user1);
        vm.expectRevert("outcome count not between 1-32");
        market.createMarket(desc);
    }

    function test_Revert_CreateMarket_FeeTooHigh_BuyFee() public {
        fundUser(user1, 10 ether);

        uint256[] memory distribution = new uint256[](2);
        distribution[0] = 50;
        distribution[1] = 50;

        uint256 tooHighFee = 6 * 10 ** 16; // 6%

        PredictionMarket.CreateMarketDescription memory desc = PredictionMarket.CreateMarketDescription({
            value: 10 ether,
            closesAt: uint32(block.timestamp + 1 days),
            outcomes: 2,
            token: IERC20(address(token)),
            distribution: distribution,
            question: "Test",
            image: "",
            buyFees: PredictionMarket.Fees(tooHighFee, 0, 0),
            sellFees: PredictionMarket.Fees(0, 0, 0),
            treasury: treasury,
            distributor: distributor
        });

        vm.prank(user1);
        vm.expectRevert("fee must be <= 5%");
        market.createMarket(desc);
    }

    function test_Revert_CreateMarket_FeeTooHigh_TreasuryFee() public {
        fundUser(user1, 10 ether);

        uint256[] memory distribution = new uint256[](2);
        distribution[0] = 50;
        distribution[1] = 50;

        uint256 tooHighFee = 6 * 10 ** 16; // 6%

        PredictionMarket.CreateMarketDescription memory desc = PredictionMarket.CreateMarketDescription({
            value: 10 ether,
            closesAt: uint32(block.timestamp + 1 days),
            outcomes: 2,
            token: IERC20(address(token)),
            distribution: distribution,
            question: "Test",
            image: "",
            buyFees: PredictionMarket.Fees(0, tooHighFee, 0),
            sellFees: PredictionMarket.Fees(0, 0, 0),
            treasury: treasury,
            distributor: distributor
        });

        vm.prank(user1);
        vm.expectRevert("treasury fee must be <= 5%");
        market.createMarket(desc);
    }

    function test_Revert_CreateMarket_FeeTooHigh_DistributorFee() public {
        fundUser(user1, 10 ether);

        uint256[] memory distribution = new uint256[](2);
        distribution[0] = 50;
        distribution[1] = 50;

        uint256 tooHighFee = 6 * 10 ** 16; // 6%

        PredictionMarket.CreateMarketDescription memory desc = PredictionMarket.CreateMarketDescription({
            value: 10 ether,
            closesAt: uint32(block.timestamp + 1 days),
            outcomes: 2,
            token: IERC20(address(token)),
            distribution: distribution,
            question: "Test",
            image: "",
            buyFees: PredictionMarket.Fees(0, 0, tooHighFee),
            sellFees: PredictionMarket.Fees(0, 0, 0),
            treasury: treasury,
            distributor: distributor
        });

        vm.prank(user1);
        vm.expectRevert("distributor fee must be <= 5%");
        market.createMarket(desc);
    }

    function test_Revert_CreateMarket_InvalidDistributionLength() public {
        fundUser(user1, 10 ether);

        uint256[] memory distribution = new uint256[](3); // 3 distribution values
        distribution[0] = 50;
        distribution[1] = 50;
        distribution[2] = 50;

        PredictionMarket.CreateMarketDescription memory desc = PredictionMarket.CreateMarketDescription({
            value: 10 ether,
            closesAt: uint32(block.timestamp + 1 days),
            outcomes: 2, // But only 2 outcomes
            token: IERC20(address(token)),
            distribution: distribution,
            question: "Test",
            image: "",
            buyFees: PredictionMarket.Fees(0, 0, 0),
            sellFees: PredictionMarket.Fees(0, 0, 0),
            treasury: treasury,
            distributor: distributor
        });

        vm.prank(user1);
        vm.expectRevert("distribution length not matching");
        market.createMarket(desc);
    }

    function test_Revert_CreateMarket_ZeroDistributionHint() public {
        fundUser(user1, 10 ether);

        uint256[] memory distribution = new uint256[](2);
        distribution[0] = 0; // Zero distribution hint
        distribution[1] = 50;

        PredictionMarket.CreateMarketDescription memory desc = PredictionMarket.CreateMarketDescription({
            value: 10 ether,
            closesAt: uint32(block.timestamp + 1 days),
            outcomes: 2,
            token: IERC20(address(token)),
            distribution: distribution,
            question: "Test",
            image: "",
            buyFees: PredictionMarket.Fees(0, 0, 0),
            sellFees: PredictionMarket.Fees(0, 0, 0),
            treasury: treasury,
            distributor: distributor
        });

        vm.prank(user1);
        vm.expectRevert("must hint a valid distribution");
        market.createMarket(desc);
    }

    function test_Revert_CreateMarketWithETH_ValueMismatch() public {
        fundUserETH(user1, 100 ether);

        uint256[] memory distribution = new uint256[](2);
        distribution[0] = 50;
        distribution[1] = 50;

        PredictionMarket.CreateMarketDescription memory desc = PredictionMarket.CreateMarketDescription({
            value: 10 ether, // Says 10 ether
            closesAt: uint32(block.timestamp + 1 days),
            outcomes: 2,
            token: IERC20(address(weth)),
            distribution: distribution,
            question: "Test",
            image: "",
            buyFees: PredictionMarket.Fees(0, 0, 0),
            sellFees: PredictionMarket.Fees(0, 0, 0),
            treasury: treasury,
            distributor: distributor
        });

        vm.prank(user1);
        vm.expectRevert("value does not match arguments");
        market.createMarketWithETH{value: 5 ether}(desc); // But sends 5 ether
    }

    function test_Revert_CreateMarketWithETH_WrongToken() public {
        fundUserETH(user1, 100 ether);

        uint256[] memory distribution = new uint256[](2);
        distribution[0] = 50;
        distribution[1] = 50;

        PredictionMarket.CreateMarketDescription memory desc = PredictionMarket.CreateMarketDescription({
            value: 10 ether,
            closesAt: uint32(block.timestamp + 1 days),
            outcomes: 2,
            token: IERC20(address(token)), // Not WETH
            distribution: distribution,
            question: "Test",
            image: "",
            buyFees: PredictionMarket.Fees(0, 0, 0),
            sellFees: PredictionMarket.Fees(0, 0, 0),
            treasury: treasury,
            distributor: distributor
        });

        vm.prank(user1);
        vm.expectRevert("Market token is not WETH");
        market.createMarketWithETH{value: 10 ether}(desc);
    }
}

