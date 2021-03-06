const CVC_DECIMALS = 8;
const ONE_CVC = 10 ** CVC_DECIMALS;
const TOTAL_SUPPLY = 1e9 * ONE_CVC;
const CONTRACT_TOKEN = 'CvcToken';
const CONTRACT_ESCROW = 'CvcEscrow';
const CONTRACT_PRICING = 'CvcPricing';
const CONTRACT_ONTOLOGY = 'CvcOntology';
const CONTRACT_VALIDATOR_REGISTRY = 'CvcValidatorRegistry';
const EVENT_ESCROW_PLACED = 'EscrowPlaced';
const EVENT_ESCROW_MOVED = 'EscrowMoved';
const EVENT_ESCROW_RELEASED = 'EscrowReleased';
const EVENT_ESCROW_REFUNDED = 'EscrowCanceled';
const EVENT_CREDENTIAL_ITEM_PRICE_SET = 'CredentialItemPriceSet';
const EVENT_CREDENTIAL_ITEM_PRICE_DELETED = 'CredentialItemPriceDeleted';

const CONTRACTS = [CONTRACT_TOKEN, CONTRACT_ESCROW, CONTRACT_PRICING, CONTRACT_ONTOLOGY, CONTRACT_VALIDATOR_REGISTRY];

const TX_STATUS = {
  PENDING: 'pending',
  QUEUED: 'queued',
  MINED: 'mined',
  UNKNOWN: 'unknown',
  UNSUPPORTED: 'unsupported'
};

const CREDENTIAL_ITEM_TYPES = ['claim', 'credential'];

module.exports = {
  CVC_DECIMALS,
  ONE_CVC,
  TOTAL_SUPPLY,
  CONTRACTS,
  CONTRACT_TOKEN,
  CONTRACT_ESCROW,
  CONTRACT_PRICING,
  CONTRACT_ONTOLOGY,
  CONTRACT_VALIDATOR_REGISTRY,
  EVENT_ESCROW_PLACED,
  EVENT_ESCROW_MOVED,
  EVENT_ESCROW_RELEASED,
  EVENT_ESCROW_REFUNDED,
  EVENT_CREDENTIAL_ITEM_PRICE_SET,
  EVENT_CREDENTIAL_ITEM_PRICE_DELETED,
  TX_STATUS,
  CREDENTIAL_ITEM_TYPES
};
