import { Button, Input, useToasts } from '@geist-ui/core';
import { usePublicClient, useWalletClient } from 'wagmi';
import { erc20Abi } from 'viem';

import { isAddress } from 'essential-eth';
import { useAtom } from 'jotai';
import { normalize } from 'viem/ens';
import { checkedTokensAtom } from '../../src/atoms/checked-tokens-atom';
import { destinationAddressAtom } from '../../src/atoms/destination-address-atom';
import { globalTokensAtom } from '../../src/atoms/global-tokens-atom';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Define TransferPending type
type TransferPending = {
  id: string;
  status: string;
  // Add other properties as needed
};

interface TokenRecord {
  isChecked: boolean;
  pendingTxn?: TransferPending;
}

interface CheckedTokens {
  [address: `0x${string}`]: TokenRecord;
}

export const SendTokens = () => {
  const { setToast } = useToasts();
  const showToast = (message: string, type: 'success' | 'warning' | 'error') =>
    setToast({
      text: message,
      type,
      delay: 4000,
    });

  const [tokens] = useAtom(globalTokensAtom);
  const [destinationAddress, setDestinationAddress] = useAtom(destinationAddressAtom);
  const [checkedRecords, setCheckedRecords] = useAtom(checkedTokensAtom) as [CheckedTokens, React.Dispatch<React.SetStateAction<CheckedTokens>>];
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const sendAllCheckedTokens = async () => {
    const tokensToSend: string[] = Object.entries(checkedRecords)
      .filter(([_, { isChecked }]) => isChecked)
      .map(([tokenAddress]) => tokenAddress);

    if (!walletClient || !publicClient) return;
    if (!destinationAddress) return;

    if (destinationAddress.includes('.')) {
      try {
        const resolvedDestinationAddress = await publicClient.getEnsAddress({
          name: normalize(destinationAddress),
        });
        if (resolvedDestinationAddress) {
          setDestinationAddress(resolvedDestinationAddress);
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          showToast(`Error resolving ENS address: ${error.message}`, 'warning');
        } else {
          showToast('An unknown error occurred while resolving ENS address', 'warning');
        }
      }
      return;
    }

    // Ensure resolving the ENS name above completes
    for (const tokenAddress of tokensToSend) {
      const token = tokens.find((token) => token.contract_address === tokenAddress);

      // Ensure the tokenAddress has the correct format
      const formattedTokenAddress: `0x${string}` = tokenAddress.startsWith('0x') ? tokenAddress as `0x${string}` : `0x${tokenAddress}` as `0x${string}`;

      try {
        // Ensure destinationAddress is properly formatted
        const formattedDestinationAddress: `0x${string}` = destinationAddress.startsWith('0x') 
          ? destinationAddress as `0x${string}` 
          : `0x${destinationAddress}` as `0x${string}`;

        const { request } = await publicClient.simulateContract({
          account: walletClient.account,
          address: formattedTokenAddress,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [
            formattedDestinationAddress,
            BigInt(token?.balance || '0'),
          ],
        });

        const res = await walletClient.writeContract(request);
        setCheckedRecords((old) => ({
          ...old,
          [formattedTokenAddress]: {
            ...(old[formattedTokenAddress] || { isChecked: false }),
            pendingTxn: res,
          },
        }));
      } catch (err: any) {
        showToast(
          `Error with ${token?.contract_ticker_symbol} ${err?.reason || 'Unknown error'}`,
          'warning',
        );
      }
    }
  };

  const addressAppearsValid: boolean =
    typeof destinationAddress === 'string' &&
    (destinationAddress.includes('.') || isAddress(destinationAddress));
  const checkedCount = Object.values(checkedRecords).filter(
    (record) => record.isChecked,
  ).length;

  return (
    <div style={{ margin: '20px' }}>
      <form>
        Destination Address:
        <Input
          required
          value={destinationAddress}
          placeholder="vitalik.eth"
          onChange={(e) => setDestinationAddress(e.target.value)}
          type={
            addressAppearsValid
              ? 'success'
              : destinationAddress.length > 0
                ? 'warning'
                : 'default'
          }
          width="100%"
          style={{
            marginLeft: '10px',
            marginRight: '10px',
  }}
  crossOrigin=""
  onPointerEnterCapture={() => {}}
  onPointerLeaveCapture={() => {}}
          
        />
        <Button
          type="secondary"
          onClick={sendAllCheckedTokens}
          disabled={!addressAppearsValid}
          style={{ marginTop: '20px' }}
          placeholder="" // Add placeholder prop
          onPointerEnterCapture={() => {}} // Add onPointerEnterCapture prop
          onPointerLeaveCapture={() => {}} // Add onPointerLeaveCapture prop
        >
          {checkedCount === 0
            ? 'Claim Tokens'
            : `Claim ${checkedCount} Tokens Now`}
        </Button>
      </form>
    </div>
  );
};
