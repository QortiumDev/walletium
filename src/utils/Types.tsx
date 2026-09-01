export type TransactionType =
  | 'GENESIS'
  | 'PAYMENT'
  | 'REGISTER_NAME'
  | 'UPDATE_NAME'
  | 'SELL_NAME'
  | 'CANCEL_SELL_NAME'
  | 'BUY_NAME'
  | 'CREATE_POLL'
  | 'VOTE_ON_POLL'
  | 'ARBITRARY'
  | 'ISSUE_ASSET'
  | 'TRANSFER_ASSET'
  | 'CREATE_ASSET_ORDER'
  | 'CANCEL_ASSET_ORDER'
  | 'MULTI_PAYMENT'
  | 'DEPLOY_AT'
  | 'MESSAGE'
  | 'CHAT'
  | 'PUBLICIZE'
  | 'AIRDROP'
  | 'AT'
  | 'CREATE_GROUP'
  | 'UPDATE_GROUP'
  | 'ADD_GROUP_ADMIN'
  | 'REMOVE_GROUP_ADMIN'
  | 'GROUP_BAN'
  | 'CANCEL_GROUP_BAN'
  | 'GROUP_KICK'
  | 'GROUP_INVITE'
  | 'CANCEL_GROUP_INVITE'
  | 'JOIN_GROUP'
  | 'LEAVE_GROUP'
  | 'GROUP_APPROVAL'
  | 'SET_GROUP'
  | 'UPDATE_ASSET'
  | 'ACCOUNT_FLAGS'
  | 'ENABLE_FORGING'
  | 'REWARD_SHARE'
  | 'ACCOUNT_LEVEL'
  | 'TRANSFER_PRIVS'
  | 'PRESENCE';

export interface SearchTransactionsResponse {
  type: TransactionType;
  timestamp: number;
  reference: string;
  fee: string;
  signature: string;
  txGroupId: number;
  blockHeight: number;
  approvalStatus: string;
  creatorAddress: string;
  creatorAddressOriginal?: string;
  senderPublicKey: string;
  recipient: string;
  recipientOriginal?: string;
  amount: string;
}

export interface ContactCardQDNData {
  version: 1;
  lastUpdated: number; // Unix timestamp
  addresses: Record<string, string>; // coin key (e.g. "BTC") -> address
}

export type ContactCardDecision = 'published' | 'private' | 'undecided';

export interface ContactCardCoinState {
  decision: ContactCardDecision;
  overrideAddress?: string;
}

export type ContactCardLocalState = Record<string, ContactCardCoinState>;

// Raw shape of Core's AssetData (GET /assets/info, /assets), field names as
// serialized (isDivisible/isUnspendable/isOwnerForSale keep their "is" prefix).
export interface AssetData {
  assetId: number;
  owner: string;
  name: string;
  description?: string;
  quantity: string;
  isDivisible: boolean;
  data?: string;
  isUnspendable: boolean;
  creationGroupId: number;
  isOwnerForSale: boolean;
  ownerSalePrice?: string;
  ownerSaleRecipient?: string;
  reducedAssetName?: string;
}

// Raw shape of Core's AccountBalanceData (GET /assets/balances).
export interface AssetBalanceData {
  address: string;
  assetId: number;
  balance: string;
  assetName?: string;
}

// Either an asset id or an asset name - the same either/or contract Home's
// GET_ASSET_INFO takes (assetId wins if both are given).
export type AssetSelector = { assetId: number } | { assetName: string };

export type AssetNetwork = 'qortium' | 'qortal';

export type NetworkAssetSelector = AssetSelector & { network: AssetNetwork };

// A holding shown in the wallet: asset metadata plus this account's balance,
// merged from AssetData + AssetBalanceData (or a zero balance for pinned
// assets the account doesn't currently hold).
export interface AssetHolding {
  network: AssetNetwork;
  assetId: number;
  name: string;
  description?: string;
  owner: string;
  quantity: string;
  isDivisible: boolean;
  data?: string;
  isOwnerForSale: boolean;
  ownerSalePrice?: string;
  balance: string; // atomic units, as returned by /assets/balances
  pinned: boolean; // true when kept visible via the local pinned-assets list
}
