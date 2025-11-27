import { BrowserProvider } from "ethers";

export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error("No wallet found");
  }

  const provider = new BrowserProvider(window.ethereum);

  // Request accounts from MetaMask
  const accounts = await provider.send("eth_requestAccounts", []);
  
  // First account = user's wallet address
  const address = accounts[0];

  return { provider, address };
}
