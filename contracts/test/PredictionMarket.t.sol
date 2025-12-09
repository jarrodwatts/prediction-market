// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import "../src/PredictionMarket.sol";
import "./mocks/MockERC20.sol";
import "./mocks/MockWETH.sol";

contract PredictionMarketTest is Test {
    PredictionMarket public market;
    MockERC20 public token;
    MockWETH public weth;

    address public owner = address(0x1);
    address public user1 = address(0x2);
    address public user2 = address(0x3);
    address public treasury = address(0x4);
    address public distributor = address(0x5);

    function setUp() public {
        vm.startPrank(owner);
        weth = new MockWETH();
        market = new PredictionMarket(IWETH(address(weth)));
        token = new MockERC20("Test Token", "TEST", 18);
        vm.stopPrank();

        vm.label(owner, "Owner");
        vm.label(user1, "User1");
        vm.label(user2, "User2");
        vm.label(address(market), "MarketContract");
        vm.label(address(token), "TestToken");
        vm.label(address(weth), "WETH");
    }

    function test_CreateMarket() public {
        vm.startPrank(user1);

        token.mint(user1, 100 ether);
        token.approve(address(market), 100 ether);

        uint256[] memory distribution = new uint256[](2);
        distribution[0] = 50;
        distribution[1] = 50;

        PredictionMarket.Fees memory buyFees = PredictionMarket.Fees(
            100,
            100,
            100
        ); // 0.01%
        PredictionMarket.Fees memory sellFees = PredictionMarket.Fees(
            100,
            100,
            100
        );

        PredictionMarket.CreateMarketDescription
            memory desc = PredictionMarket.CreateMarketDescription({
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

        uint256 marketId = market.createMarket(desc);

        // Verify market state using getter function
        (
            PredictionMarket.MarketState state,
            uint256 closesAt,
            uint256 liquidity,
            uint256 balance,
            uint256 sharesAvailable,
            int256 resolvedOutcome
        ) = market.getMarketData(marketId);

        assertEq(uint256(state), uint256(PredictionMarket.MarketState.open));
        assertEq(closesAt, block.timestamp + 1 days);
        assertEq(balance, 10 ether);
        assertEq(liquidity, 10 ether);
        assertTrue(sharesAvailable > 0);
        assertEq(resolvedOutcome, -1);

        vm.stopPrank();
    }

    function test_CreateMarketWithETH() public {
        vm.startPrank(user1);
        vm.deal(user1, 100 ether);

        uint256[] memory distribution = new uint256[](2);
        distribution[0] = 50;
        distribution[1] = 50;

        PredictionMarket.Fees memory buyFees = PredictionMarket.Fees(
            100,
            100,
            100
        );
        PredictionMarket.Fees memory sellFees = PredictionMarket.Fees(
            100,
            100,
            100
        );

        PredictionMarket.CreateMarketDescription
            memory desc = PredictionMarket.CreateMarketDescription({
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

        uint256 marketId = market.createMarketWithETH{value: 10 ether}(desc);

        // Verify WETH balance of market
        assertEq(weth.balanceOf(address(market)), 10 ether);

        vm.stopPrank();
    }

    function test_RevertCreateMarket_InvalidFee() public {
        vm.startPrank(user1);
        token.mint(user1, 100 ether);
        token.approve(address(market), 100 ether);

        uint256[] memory distribution = new uint256[](2);
        distribution[0] = 50;
        distribution[1] = 50;

        // Fee too high (MAX_FEE is 5%)
        // 6 * 10**16 = 6%
        uint256 highFee = 6 * 10 ** 16;
        PredictionMarket.Fees memory buyFees = PredictionMarket.Fees(
            highFee,
            0,
            0
        );
        PredictionMarket.Fees memory sellFees = PredictionMarket.Fees(
            0,
            0,
            0
        );

        PredictionMarket.CreateMarketDescription
            memory desc = PredictionMarket.CreateMarketDescription({
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

        vm.expectRevert("fee must be <= 5%");
        market.createMarket(desc);

        vm.stopPrank();
    }

    function test_RevertCreateMarket_PastCloseDate() public {
        vm.startPrank(user1);
        token.mint(user1, 100 ether);
        token.approve(address(market), 100 ether);

        uint256[] memory distribution = new uint256[](2);

        PredictionMarket.Fees memory buyFees = PredictionMarket.Fees(
            0,
            0,
            0
        );
        PredictionMarket.Fees memory sellFees = PredictionMarket.Fees(
            0,
            0,
            0
        );

        PredictionMarket.CreateMarketDescription
            memory desc = PredictionMarket.CreateMarketDescription({
                value: 10 ether,
                closesAt: uint32(block.timestamp - 1 days), // In the past
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

        vm.expectRevert("resolution before current date");
        market.createMarket(desc);

        vm.stopPrank();
    }
}
