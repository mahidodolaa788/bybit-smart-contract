export const tryDetect = () => {
    const detectedWallets = [];
  
    if (window.ethereum) {
      if (window.ethereum.isMetaMask) detectedWallets.push("MetaMask");
      if (window.ethereum.isCoinbaseWallet)
        detectedWallets.push("Coinbase Wallet");
      if (window.ethereum.isTrust) detectedWallets.push("Trust Wallet");
      if (window.ethereum.isBraveWallet) detectedWallets.push("Brave Wallet");
      if (window.ethereum.isTaho) detectedWallets.push("Taho Wallet");
      if (window.ethereum.isFrame) detectedWallets.push("Frame Wallet");
      if (detectedWallets.length === 0)
        detectedWallets.push("Unknown Ethereum-Compatible Wallet");
    }
  
    if (window.BinanceChain) detectedWallets.push("Binance Wallet");
    if (window.okxwallet) detectedWallets.push("OKX Wallet");
    if (window.rabby) detectedWallets.push("Rabby Wallet");
    if (window.web3 && window.web3.currentProvider)
      detectedWallets.push("Legacy Web3 Wallet");
  
    // Упрощённый технический лог
    const techLog = {
      ethereum: !!window.ethereum,
      rabby: !!window.rabby,
      web3: !!(window.web3 && window.web3.currentProvider),
      binance: !!window.BinanceChain,
      okx: !!window.okxwallet,
    };
  
    const message =
      detectedWallets.length > 0
        ? `Обнаружены кошельки: ${detectedWallets.join(", ")}`
        : "Кошельки не обнаружены";
  
    return { wallets: detectedWallets, techLog, message };
  };
  

export async function detectWallets(retries = 3, delay = 2000) {
  let result = tryDetect();

  for (
    let attempt = 1;
    result.wallets.length === 0 && attempt < retries;
    attempt++
  ) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    result = tryDetect();
  }

  return result;
}
