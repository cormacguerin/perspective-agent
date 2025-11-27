// WalletConnect.tsx
import { useState } from 'react';
import { createWalletClient, custom } from 'viem';
import { base } from 'viem/chains';

export function WalletConnect() {

  const [address, setAddress] = useState<string | null>(null);

  const connectAndSign = async (svrMsg) => {

    if (!window.ethereum) return alert("Install MetaMask");

    const walletClient = createWalletClient({
      chain: base,
      transport: custom(window.ethereum),
    });

    const [addr] = await walletClient.requestAddresses();
    setAddress(addr);

    const message = `sign server message ${svrMsg}`;
    const signature = await walletClient.signMessage({
      account: addr,
      message,
    });

    // Send to your backend
    const res = await fetch('/api/link-wallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: addr, signature, message }),
    });

    const data = await res.json();
    if (data.success) {
      alert(`Wallet linked! Your agent wallet: ${data.agentWallet}`);
    }
  };

  return (
    <button onClick={connectAndSign}>
      {address ? `Connected: ${address.slice(0, 6)}...` : "Connect Wallet & Activate Agent"}
    </button>
  );
}
