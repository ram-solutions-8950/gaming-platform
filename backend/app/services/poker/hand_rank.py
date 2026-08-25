from enum import IntEnum

class HandCategory(IntEnum):
    HIGH_CARD = 1
    ONE_PAIR = 2
    TWO_PAIR = 3
    THREE_OF_A_KIND = 4
    STRAIGHT = 5
    FLUSH = 6
    FULL_HOUSE = 7
    FOUR_OF_A_KIND = 8
    STRAIGHT_FLUSH = 9
    ROYAL_FLUSH = 10

HAND_CATEGORY_NAMES = {
    HandCategory.HIGH_CARD: "High Card",
    HandCategory.ONE_PAIR: "One Pair",
    HandCategory.TWO_PAIR: "Two Pair",
    HandCategory.THREE_OF_A_KIND: "Three of a Kind",
    HandCategory.STRAIGHT: "Straight",
    HandCategory.FLUSH: "Flush",
    HandCategory.FULL_HOUSE: "Full House",
    HandCategory.FOUR_OF_A_KIND: "Four of a Kind",
    HandCategory.STRAIGHT_FLUSH: "Straight Flush",
    HandCategory.ROYAL_FLUSH: "Royal Flush",
}
