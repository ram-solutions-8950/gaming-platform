"""RBAC (Role-Based Access Control) models and permission definitions."""
import enum
from typing import List, Dict


class AdminPermission(str, enum.Enum):
    DASHBOARD = "dashboard"
    USERS = "users"
    WALLET = "wallet"
    DEPOSITS = "deposits"
    WITHDRAWALS = "withdrawals"
    GAMES = "games"
    WINNING_CONTROL = "winning_control"
    WAGER_CONTROL = "wager_control"
    TRANSACTIONS = "transactions"
    REWARDS = "rewards"
    ANALYTICS = "analytics"
    SETTINGS = "settings"
    RBAC = "rbac"


PERMISSION_DETAILS: Dict[str, Dict[str, str]] = {
    AdminPermission.DASHBOARD.value: {
        "label": "Dashboard Overview",
        "description": "View overall dashboard metrics, KPIs, live players, and quick overview",
        "category": "Core",
    },
    AdminPermission.USERS.value: {
        "label": "User Management",
        "description": "View, search, edit, suspend, and manage player accounts and KYC",
        "category": "Users",
    },
    AdminPermission.WALLET.value: {
        "label": "Wallet & Coins",
        "description": "Manage user balances, manual adjustments, and coin circulations",
        "category": "Finance",
    },
    AdminPermission.DEPOSITS.value: {
        "label": "Deposit Approvals",
        "description": "View deposit history, review pending deposits, approve or reject",
        "category": "Finance",
    },
    AdminPermission.WITHDRAWALS.value: {
        "label": "Withdrawal Processing",
        "description": "Process, approve, mark completed, or reject player withdrawal requests",
        "category": "Finance",
    },
    AdminPermission.GAMES.value: {
        "label": "Games Management",
        "description": "Manage game catalog, bet limits, active/inactive state, live game rounds",
        "category": "Gaming",
    },
    AdminPermission.WINNING_CONTROL.value: {
        "label": "Winning & RTP Control",
        "description": "Configure Global game RTP/modes and Personal user win/loss rates",
        "category": "Gaming",
    },
    AdminPermission.WAGER_CONTROL.value: {
        "label": "Wager Requirement Control",
        "description": "View player wager play-throughs, adjust required wager amounts, and waive requirements",
        "category": "Finance",
    },
    AdminPermission.TRANSACTIONS.value: {
        "label": "Transaction Ledger",
        "description": "Audit platform transactions, coin logs, and financial ledger",
        "category": "Finance",
    },
    AdminPermission.REWARDS.value: {
        "label": "Bonus & Promotions",
        "description": "Configure lucky spin, daily rewards, VIP tiers, and jackpot settings",
        "category": "Marketing",
    },
    AdminPermission.ANALYTICS.value: {
        "label": "Reports & Analytics",
        "description": "Access in-depth game analytics, turnover comparisons, and player trends",
        "category": "Reporting",
    },
    AdminPermission.SETTINGS.value: {
        "label": "System & Payment Settings",
        "description": "Configure payment gateways, UPI QR codes, fee percentages, and system config",
        "category": "System",
    },
    AdminPermission.RBAC.value: {
        "label": "Team & Role Management",
        "description": "Create admin accounts, assign roles, and configure granular permissions",
        "category": "Security",
    },
}

DEFAULT_ROLE_PERMISSIONS: Dict[str, List[str]] = {
    "SUPER_ADMIN": [p.value for p in AdminPermission],
    "ADMIN": [
        AdminPermission.DASHBOARD.value,
        AdminPermission.USERS.value,
        AdminPermission.WALLET.value,
        AdminPermission.DEPOSITS.value,
        AdminPermission.WITHDRAWALS.value,
        AdminPermission.GAMES.value,
        AdminPermission.WINNING_CONTROL.value,
        AdminPermission.WAGER_CONTROL.value,
        AdminPermission.TRANSACTIONS.value,
        AdminPermission.REWARDS.value,
        AdminPermission.ANALYTICS.value,
        AdminPermission.SETTINGS.value,
    ],
    "OPERATIONS_MANAGER": [
        AdminPermission.DASHBOARD.value,
        AdminPermission.USERS.value,
        AdminPermission.GAMES.value,
        AdminPermission.WINNING_CONTROL.value,
        AdminPermission.WAGER_CONTROL.value,
        AdminPermission.ANALYTICS.value,
    ],
    "FINANCE_OFFICER": [
        AdminPermission.DASHBOARD.value,
        AdminPermission.WALLET.value,
        AdminPermission.DEPOSITS.value,
        AdminPermission.WITHDRAWALS.value,
        AdminPermission.WAGER_CONTROL.value,
        AdminPermission.TRANSACTIONS.value,
    ],
    "SUPPORT_AGENT": [
        AdminPermission.DASHBOARD.value,
        AdminPermission.USERS.value,
        AdminPermission.TRANSACTIONS.value,
        AdminPermission.WAGER_CONTROL.value,
    ],
    "GAME_MASTER": [
        AdminPermission.DASHBOARD.value,
        AdminPermission.GAMES.value,
        AdminPermission.WINNING_CONTROL.value,
        AdminPermission.ANALYTICS.value,
    ],
}
